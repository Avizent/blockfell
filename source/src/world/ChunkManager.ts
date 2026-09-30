import * as THREE from 'three';
import { Chunk } from './Chunk';
import { World } from './World';
import { CHUNK_SIZE, chunkKeyNum } from './constants';
import { CHEST, SPAWNER } from './BlockRegistry';
import { WorkerPool } from '../workers/WorkerPool';
import type { MeshBuffers } from '../meshing/MeshBuilder';
import type { WorkerResponse } from '../workers/protocol';

export interface ChunkStats {
  loaded: number;
  meshed: number;
  visible: number;
  genQueued: number;
  meshQueued: number;
  inflight: number;
  vertices: number;
  triangles: number;
  genMs: number;       // exponential moving averages
  meshMs: number;
  lightMs: number;
  lastMeshQuads: number;
  lastMeshFaces: number;
  totalGenerated: number;
  totalMeshed: number;
  totalUnloaded: number;
  geometries: number;  // live BufferGeometries owned by chunks
}

/**
 * CHUNK STREAMING
 * ---------------
 * Keeps the set of loaded chunks centred on the player:
 *   - data radius   = renderDistance + 1  (meshing needs all 8 neighbours generated)
 *   - mesh radius   = renderDistance
 *   - unload radius = renderDistance + 2  (hysteresis avoids load/unload thrash)
 * Generation and meshing are prioritised by distance (edited chunks jump the queue)
 * and executed by the worker pool. Unloading disposes geometry (GPU buffers) and
 * drops voxel data; player changes survive in World.deltas.
 *
 * CULLING: each chunk's tight AABB is tested against the camera frustum every frame;
 * chunks outside the frustum or beyond the render distance are not drawn.
 */
export class ChunkManager {
  renderDistance: number;
  greedy = true;
  readonly group = new THREE.Group();
  readonly stats: ChunkStats = {
    loaded: 0, meshed: 0, visible: 0, genQueued: 0, meshQueued: 0, inflight: 0, vertices: 0, triangles: 0,
    genMs: 0, meshMs: 0, lightMs: 0, lastMeshQuads: 0, lastMeshFaces: 0, totalGenerated: 0, totalMeshed: 0,
    totalUnloaded: 0, geometries: 0,
  };
  private generating = new Set<number>();
  private pcx = 0;
  private pcz = 0;
  private offsets: [number, number, number][] = [];
  private offsetsFor = -1;
  private disposed = false;
  onChunkLoaded?: (c: Chunk) => void;

  constructor(
    private world: World,
    private pool: WorkerPool,
    private materials: { opaque: THREE.Material; water: THREE.Material },
    renderDistance: number,
  ) {
    this.renderDistance = renderDistance;
    this.group.name = 'chunks';
  }

  private ensureOffsets(): void {
    const r = this.renderDistance + 1;
    if (this.offsetsFor === r) return;
    this.offsets = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= (r + 0.5) * (r + 0.5)) this.offsets.push([dx, dz, d2]);
    }
    this.offsets.sort((a, b) => a[2] - b[2]);
    this.offsetsFor = r;
  }

  private dist2(cx: number, cz: number): number {
    const dx = cx - this.pcx, dz = cz - this.pcz;
    return dx * dx + dz * dz;
  }

  private now = 0;

  update(px: number, pz: number, frustum: THREE.Frustum | null): void {
    if (this.disposed) return;
    this.now = performance.now();
    this.pcx = Math.floor(px / CHUNK_SIZE);
    this.pcz = Math.floor(pz / CHUNK_SIZE);
    this.ensureOffsets();
    const R = this.renderDistance;
    const dataR2 = (R + 1.5) * (R + 1.5);
    const meshR2 = (R + 0.5) * (R + 0.5);
    const unloadR2 = (R + 2.5) * (R + 2.5);

    // --- request generation (closest first; the pool re-sorts at dispatch)
    let queuedGen = this.pool.pendingOf('gen');
    for (const [dx, dz] of this.offsets) {
      if (queuedGen > 64) break;
      const cx = this.pcx + dx, cz = this.pcz + dz;
      const key = chunkKeyNum(cx, cz);
      if (this.world.chunks.has(key) || this.generating.has(key)) continue;
      this.generating.add(key);
      queuedGen++;
      this.requestGeneration(cx, cz, key, dataR2);
    }

    // --- mesh / unload / cull
    let visible = 0, meshed = 0, verts = 0, tris = 0, geoms = 0;
    for (const [key, c] of this.world.chunks) {
      const d2 = this.dist2(c.cx, c.cz);
      if (d2 > unloadR2) { this.unload(key, c); continue; }
      if (d2 <= meshR2 && c.needsMesh && !c.meshInFlight && !c.meshQueued && c.retryAt <= this.now && this.neighboursLoaded(c)) {
        this.requestMesh(c, meshR2);
      }
      if (c.opaqueMesh || c.waterMesh) {
        meshed++;
        geoms += (c.opaqueMesh ? 1 : 0) + (c.waterMesh ? 1 : 0);
        const vis = d2 <= meshR2 && (!frustum || frustum.intersectsBox(c.bounds));
        if (c.opaqueMesh) c.opaqueMesh.visible = vis;
        if (c.waterMesh) c.waterMesh.visible = vis;
        if (vis) { visible++; verts += c.vertexCount; tris += c.triangleCount; }
      }
    }
    this.pool.pump();
    const s = this.stats;
    s.loaded = this.world.chunks.size;
    s.meshed = meshed;
    s.visible = visible;
    s.vertices = verts;
    s.triangles = tris;
    s.geometries = geoms;
    s.genQueued = this.generating.size;
    s.meshQueued = this.pool.pendingOf('mesh');
    s.inflight = this.pool.inflightCount;
  }

  private neighboursLoaded(c: Chunk): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!this.world.chunks.has(chunkKeyNum(c.cx + dx, c.cz + dz))) return false;
    }
    return true;
  }

  private requestGeneration(cx: number, cz: number, key: number, dataR2: number): void {
    const world = this.world;
    this.pool.submit({
      type: 'gen',
      build: () => ({ req: { type: 'gen', seed: world.seed, structures: world.structures, version: world.genVersion, cx, cz } }),
      priority: () => this.dist2(cx, cz),
      valid: () => !this.disposed && this.dist2(cx, cz) <= dataR2,
      onDrop: () => this.generating.delete(key),
      onDone: (res) => {
        this.generating.delete(key);
        if (this.disposed || res.type !== 'gen') return;
        if (this.world.chunks.has(key)) return;
        this.stats.genMs = this.stats.genMs * 0.9 + res.ms * 0.1;
        this.stats.totalGenerated++;
        world.applyDeltas(cx, cz, res.blocks);
        const chunk = new Chunk(cx, cz, res.blocks);
        world.chunks.set(key, chunk);
        for (const cont of res.containers) {
          const pk = cont.x + ',' + cont.y + ',' + cont.z;
          if (!world.blockEntities.has(pk) && CHEST.includes(world.getBlock(cont.x, cont.y, cont.z))) {
            world.blockEntities.set(pk, { type: 'chest', items: new Array(27).fill(null), loot: cont.loot });
          }
        }
        for (const sp of res.spawners ?? []) {
          const pk = sp.x + ',' + sp.y + ',' + sp.z;
          if (!world.blockEntities.has(pk) && world.getBlock(sp.x, sp.y, sp.z) === SPAWNER) {
            world.blockEntities.set(pk, { type: 'spawner', mob: sp.mob, delay: 20 + Math.floor(Math.random() * 100) });
          }
        }
        this.onChunkLoaded?.(chunk);
      },
    });
  }

  private requestMesh(c: Chunk, meshR2: number): void {
    const world = this.world;
    c.meshQueued = true;
    const key = chunkKeyNum(c.cx, c.cz);
    this.pool.submit({
      type: 'mesh',
      build: () => {
        c.meshQueued = false;
        c.meshInFlight = true;
        const chunks: Uint8Array[] = [];
        let prevLight: (Uint8Array | null)[] | null = null;
        if (c.checkNeighborLight) prevLight = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const n = world.getChunk(c.cx + dx, c.cz + dz)!;
          chunks.push(n.blocks.slice());
          if (prevLight) prevLight.push(dx === 0 && dz === 0 ? null : n.light ? n.light.slice() : null);
        }
        const hadNeighborCheck = c.checkNeighborLight;
        c.checkNeighborLight = false;
        c.pendingNeighborCheck = hadNeighborCheck;
        const version = c.version;
        return {
          req: { type: 'mesh', cx: c.cx, cz: c.cz, version, greedy: this.greedy, chunks, prevLight },
          transfer: [...chunks.map((a) => a.buffer), ...(prevLight ?? []).filter((l): l is Uint8Array => !!l).map((l) => l.buffer)],
        };
      },
      priority: () => (c.urgent ? -1e6 : 0) + this.dist2(c.cx, c.cz),
      valid: () => !this.disposed && world.chunks.get(key) === c && this.neighboursLoaded(c) && this.dist2(c.cx, c.cz) <= meshR2 + 4,
      onDrop: () => { c.meshQueued = false; },
      onDone: (res) => this.onMeshDone(c, res),
    });
  }

  private onMeshDone(c: Chunk, res: WorkerResponse): void {
    c.meshInFlight = false;
    if (res.type === 'error') {
      // back off and retry later; keep the neighbour-light check that job carried
      c.retryAt = performance.now() + 2000;
      if (c.pendingNeighborCheck) c.checkNeighborLight = true;
      return;
    }
    c.pendingNeighborCheck = false;
    if (this.disposed || res.type !== 'mesh') return;
    if (this.world.chunks.get(chunkKeyNum(c.cx, c.cz)) !== c) return;
    if (res.version <= c.meshedVersion) return;
    c.disposeMeshes();
    c.opaqueMesh = res.opaque ? this.buildMesh(c, res.opaque, this.materials.opaque, res.minY, res.maxY) : null;
    c.waterMesh = res.water ? this.buildMesh(c, res.water, this.materials.water, res.minY, res.maxY) : null;
    if (c.waterMesh) c.waterMesh.renderOrder = 1;
    c.setBounds(res.minY, res.maxY);
    c.light = res.light;
    c.meshedVersion = res.version;
    if (!c.needsMesh) c.urgent = false;
    const st = this.stats;
    st.meshMs = st.meshMs * 0.9 + res.stats.meshMs * 0.1;
    st.lightMs = st.lightMs * 0.9 + res.stats.lightMs * 0.1;
    st.lastMeshQuads = res.stats.quads;
    st.lastMeshFaces = res.stats.visibleFaces;
    st.totalMeshed++;
    for (const slot of res.lightChanged) {
      const n = this.world.getChunk(c.cx + (slot % 3) - 1, c.cz + Math.floor(slot / 3) - 1);
      if (n && n.meshedVersion > 0) n.markDirty(false);
    }
  }

  private buildMesh(c: Chunk, buf: MeshBuffers, material: THREE.Material, minY: number, maxY: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.position, 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('aData', new THREE.BufferAttribute(buf.data, 4));
    g.setIndex(new THREE.BufferAttribute(buf.index, 1));
    // positions are in 1/16 block units, so bounds are supplied explicitly (in blocks)
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, minY, 0), new THREE.Vector3(16, maxY, 16));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, (minY + maxY) / 2, 8), Math.hypot(8, (maxY - minY) / 2, 8));
    const m = new THREE.Mesh(g, material);
    m.position.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.frustumCulled = false; // culled by ChunkManager against the tight chunk AABB
    m.name = `chunk ${c.cx},${c.cz}`;
    this.group.add(m);
    const verts = buf.position.length / 3;
    c.vertexCount += verts;
    c.triangleCount += buf.index.length / 3;
    return m;
  }

  private unload(key: number, c: Chunk): void {
    c.disposeMeshes();
    this.world.chunks.delete(key);
    this.stats.totalUnloaded++;
  }

  /** Remeshes everything (used after toggling greedy meshing for benchmarks). */
  invalidateAll(): void {
    for (const c of this.world.chunks.values()) c.markDirty(false);
  }

  /** How many chunks within `radius` of a point are meshed (for the loading screen). */
  readiness(px: number, pz: number, radius: number): { ready: number; total: number } {
    const cx0 = Math.floor(px / CHUNK_SIZE), cz0 = Math.floor(pz / CHUNK_SIZE);
    let ready = 0, total = 0;
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius + radius) continue;
      total++;
      const c = this.world.getChunk(cx0 + dx, cz0 + dz);
      if (c && c.meshedVersion > 0) ready++;
    }
    return { ready, total };
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.world.chunks.values()) c.disposeMeshes();
    this.world.chunks.clear();
    this.group.removeFromParent();
  }
}
