import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import * as B from '../world/BlockRegistry';
import type { Facing } from '../world/BlockRegistry';
import { World, UNLOADED } from '../world/World';
import type { Player } from '../player/Player';
import type { EntityManager } from './EntityManager';
import { MOTIFS, Motif, paintingCanvas } from '../render/paintingArt';
import { rayBox } from '../interaction/VoxelRaycaster';

const DEPTH = 1 / 16;

/** Direction that is "right" for someone looking at a painting that faces `f`. */
function rightOf(f: Facing): [number, number] {
  return B.FACING_VEC[B.RIGHT_OF[B.OPPOSITE[f]]];
}

/**
 * A painting hanging on a wall. Like the reference game it is an entity, not a
 * block: it covers w x h cells in front of solid wall blocks, pops off (dropping
 * itself) when the wall goes or a block is put where it hangs, and is saved with
 * the other entities. The picture itself comes from the procedural painter.
 */
export class Painting extends Entity {
  readonly type = 'painting';
  motif: Motif;
  readonly facing: Facing;
  /** Bottom-left cell as seen from the front. */
  readonly ax: number; readonly ay: number; readonly az: number;
  /** World-space box [minX, minY, minZ, maxX, maxY, maxZ]. */
  bounds: number[] = [0, 0, 0, 0, 0, 0];
  private mesh: THREE.Mesh | null = null;
  private frontMat: THREE.MeshBasicMaterial | null = null;
  private backMat: THREE.MeshBasicMaterial | null = null;
  private tex: THREE.CanvasTexture | null = null;
  private lightTimer = 0;

  constructor(motif: Motif, facing: Facing, ax: number, ay: number, az: number) {
    super();
    this.motif = motif;
    this.facing = facing;
    this.ax = ax; this.ay = ay; this.az = az;
    this.width = 0; this.height = 0;
    this.computeBounds();
  }

  private computeBounds(): void {
    const [rx, rz] = rightOf(this.facing);
    const [nx, nz] = B.FACING_VEC[this.facing];
    const { w, h } = this.motif;
    const x1 = this.ax + rx * (w - 1), z1 = this.az + rz * (w - 1);
    let minX = Math.min(this.ax, x1), maxX = Math.max(this.ax, x1) + 1;
    let minZ = Math.min(this.az, z1), maxZ = Math.max(this.az, z1) + 1;
    // flat against the wall side of its cells
    if (nx > 0) maxX = minX + DEPTH; else if (nx < 0) minX = maxX - DEPTH;
    if (nz > 0) maxZ = minZ + DEPTH; else if (nz < 0) minZ = maxZ - DEPTH;
    this.bounds = [minX, this.ay, minZ, maxX, this.ay + h, maxZ];
    this.setPos((minX + maxX) / 2, this.ay + h / 2, (minZ + maxZ) / 2);
  }

  /** The cells the painting hangs in (front of the wall). */
  cells(): [number, number, number][] {
    return cellsOf(this.motif, this.facing, this.ax, this.ay, this.az);
  }

  /** Shows the next picture of the same size. */
  cycle(): void {
    const same = MOTIFS.filter((m) => m.w === this.motif.w && m.h === this.motif.h);
    this.motif = same[(same.indexOf(this.motif) + 1) % same.length];
    this.disposeMesh();
  }

  tick(host: EntityHost): void {
    this.beginTick();
    if (this.age % 40 === 0 && !hangs(host.world, this.motif, this.facing, this.ax, this.ay, this.az, true)) {
      this.removed = true;
      host.sound('break:wood', this.x, this.y, this.z, 0.8, 1);
      host.spawnItem({ id: 'painting', count: 1 }, this.x, this.y, this.z);
    }
  }

  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number | null {
    const b = this.bounds;
    const r = rayBox(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
    return r ? r.t : null;
  }

  private build(): void {
    const { w, h } = this.motif;
    this.tex = new THREE.CanvasTexture(paintingCanvas(this.motif));
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.frontMat = new THREE.MeshBasicMaterial({ map: this.tex });
    this.backMat = new THREE.MeshBasicMaterial({ color: 0x5a3e24 });
    const b = this.backMat;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), [b, b, b, b, this.frontMat, b]);
    const [nx, nz] = B.FACING_VEC[this.facing];
    this.mesh.rotation.y = Math.atan2(nx, nz);
    this.object.add(this.mesh);
    this.lightTimer = 0;
  }

  render(alpha: number, host: EntityHost): void {
    this.object.position.set(this.x, this.y, this.z);
    if (!this.mesh) this.build();
    if (this.lightTimer-- <= 0) {
      this.lightTimer = 10;
      const [nx, nz] = B.FACING_VEC[this.facing];
      const l = host.brightnessAt(this.x + nx * 0.4, this.y, this.z + nz * 0.4);
      this.frontMat!.color.setScalar(l);
      this.backMat!.color.setRGB(0.35 * l, 0.24 * l, 0.14 * l);
    }
    void alpha;
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.frontMat?.dispose(); this.backMat?.dispose(); this.tex?.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.disposeMesh();
    super.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'painting', m: this.motif.id, f: this.facing, x: this.ax, y: this.ay, z: this.az };
  }
}

function cellsOf(m: Motif, f: Facing, ax: number, ay: number, az: number): [number, number, number][] {
  const [rx, rz] = rightOf(f);
  const out: [number, number, number][] = [];
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) out.push([ax + rx * i, ay + j, az + rz * i]);
  return out;
}

/** Is there a solid wall behind every cell and room in front? (`loadedOnly`: unknown cells count as fine) */
function hangs(world: World, m: Motif, f: Facing, ax: number, ay: number, az: number, loadedOnly = false): boolean {
  const [nx, nz] = B.FACING_VEC[f];
  for (const [x, y, z] of cellsOf(m, f, ax, ay, az)) {
    const here = world.getBlock(x, y, z), wall = world.getBlock(x - nx, y, z - nz);
    if (here === UNLOADED || wall === UNLOADED) { if (loadedOnly) continue; return false; }
    if (B.IS_SOLID[here] || B.IS_WATER[here] || !B.IS_SOLID[wall]) return false;
    if (B.CONNECT[wall] || B.getBlock(wall).shape === 'gate') return false;
  }
  return true;
}

/**
 * Hangs a painting on the side (facing `f`) of the wall block at (wx, wy, wz).
 * Picks, like the reference game, a random picture among the largest that fit
 * around the clicked spot; sneaking picks among the smallest instead.
 */
export function placePainting(host: { world: World; entities: EntityManager; player: Player }, wx: number, wy: number, wz: number, f: Facing,
  hx: number, hy: number, hz: number): Painting | null {
  const [nx, nz] = B.FACING_VEC[f];
  const cx = wx + nx, cy = wy, cz = wz + nz;
  const [rx, rz] = rightOf(f);
  const taken = new Set<string>();
  for (const p of host.entities.paintings()) if (p.facing === f && !p.removed) for (const c of p.cells()) taken.add(c.join(','));
  // where along the wall the click landed (0..1 to the right, 0..1 up)
  const along = (rx !== 0 ? (hx - Math.floor(hx)) * rx : (hz - Math.floor(hz)) * rz);
  const u = along < 0 ? 1 + along : along, v = hy - Math.floor(hy);
  type Fit = { m: Motif; ax: number; ay: number; az: number; area: number };
  const fits: Fit[] = [];
  for (const m of MOTIFS) {
    // try anchors so that the clicked cell is inside, the ones centred on the click first
    const offs: [number, number, number][] = [];
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) offs.push([i, j, Math.hypot(i + u - m.w / 2, j + v - m.h / 2)]);
    offs.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of offs) {
      const ax = cx - rx * i, ay = cy - j, az = cz - rz * i;
      if (!hangs(host.world, m, f, ax, ay, az)) continue;
      if (cellsOf(m, f, ax, ay, az).some((c) => taken.has(c.join(',')))) continue;
      fits.push({ m, ax, ay, az, area: m.w * m.h });
      break;
    }
  }
  if (!fits.length) return null;
  const want = host.player.sneaking ? Math.min(...fits.map((q) => q.area)) : Math.max(...fits.map((q) => q.area));
  const best = fits.filter((q) => q.area === want);
  const pick = best[Math.floor(Math.random() * best.length)];
  return host.entities.add(new Painting(pick.m, f, pick.ax, pick.ay, pick.az));
}
