import * as THREE from 'three';
import type { TextureAtlas } from '../meshing/TextureAtlas';
import { getItem } from '../inventory/ItemRegistry';
import { getBlock, MODEL, RENDER_CUBE, RENDER_MODEL } from '../world/BlockRegistry';
import { TEXTURE_NAMES } from '../meshing/textureNames';
import type { ItemIcons } from './ItemIcons';

/**
 * 3D models for items held in the hand and dropped in the world:
 *  - block items are small cubes using the atlas tiles of each face,
 *  - everything else is an extruded pixel sprite (front, back and per-pixel edges),
 *    the classic way voxel games give flat items thickness.
 * Geometries/textures are cached per item and shared by every instance.
 */
export class ItemModels {
  readonly atlasTex: THREE.CanvasTexture;
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private texCache = new Map<string, THREE.Texture>();

  constructor(private atlas: TextureAtlas, private icons: ItemIcons) {
    this.atlasTex = new THREE.CanvasTexture(atlas.atlasCanvas);
    this.atlasTex.magFilter = THREE.NearestFilter;
    this.atlasTex.minFilter = THREE.NearestFilter;
    this.atlasTex.generateMipmaps = false;
    this.atlasTex.colorSpace = THREE.NoColorSpace;
    this.atlasTex.flipY = false;
  }

  isBlockModel(id: string): boolean {
    const def = getItem(id);
    if (def.icon.kind !== 'iso' || def.block === undefined) return false;
    const r = getBlock(def.block).render;
    return r === RENDER_CUBE || r === RENDER_MODEL;
  }

  /**
   * Geometry for a shaped block (slab, stairs, cactus...): its boxes centred at the
   * origin, each face textured with the matching part of its atlas tile.
   */
  private modelGeometry(blockId: number, m: Int8Array): THREE.BufferGeometry {
    const b = getBlock(blockId);
    const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
    // (axis, sign, u-axis, v-axis, reversed) like the chunk mesher; normals +X -X +Y -Y +Z -Z
    const DIRS = [[0, 1, 2, 1, true], [0, -1, 2, 1, false], [1, 1, 0, 2, true], [1, -1, 0, 2, false], [2, 1, 0, 1, false], [2, -1, 0, 1, true]] as const;
    const texUv = (f: number, x: number, y: number, z: number): [number, number] => {
      switch (f) {
        case 0: return [16 - z, 16 - y];
        case 1: return [z, 16 - y];
        case 2: return [x, z];
        case 3: return [x, 16 - z];
        case 4: return [x, 16 - y];
        default: return [16 - x, 16 - y];
      }
    };
    for (let i = 0; i < m.length; i += 6) {
      const lo = [m[i], m[i + 1], m[i + 2]], hi = [m[i + 3], m[i + 4], m[i + 5]];
      for (let f = 0; f < 6; f++) {
        const [a, sg, u, v, rev] = DIRS[f];
        const [u0, v0, u1, v1] = this.tileUv(b.faces[f]);
        const plane = sg > 0 ? hi[a] : lo[a];
        const us = [lo[u], hi[u], hi[u], lo[u]], vs = [lo[v], lo[v], hi[v], hi[v]];
        const order = rev ? [0, 3, 2, 1] : [0, 1, 2, 3];
        const base = pos.length / 3;
        for (const c of order) {
          const p = [0, 0, 0];
          p[a] = plane; p[u] = us[c]; p[v] = vs[c];
          pos.push(p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5);
          const n = [0, 0, 0]; n[a] = sg;
          nor.push(n[0], n[1], n[2]);
          const [tu, tv] = texUv(f, p[0], p[1], p[2]);
          uvs.push(u0 + (u1 - u0) * tu / 16, v0 + (v1 - v0) * tv / 16);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }

  /** UV rectangle (u0, v0, u1, v1) of an atlas tile, flipY=false convention. */
  private tileUv(layer: number): [number, number, number, number] {
    const cols = this.atlas.columns;
    const w = this.atlas.atlasCanvas.width, h = this.atlas.atlasCanvas.height;
    const x = (layer % cols) * 16, y = Math.floor(layer / cols) * 16;
    const e = 0.01;
    return [(x + e) / w, (y + e) / h, (x + 16 - e) / w, (y + 16 - e) / h];
  }

  /** Unit cube centred at the origin with per-face block textures. */
  blockGeometry(blockId: number): THREE.BufferGeometry {
    const key = 'b' + blockId;
    let g = this.geoCache.get(key);
    if (g) return g;
    const model = MODEL[blockId];
    if (model) {
      g = this.modelGeometry(blockId, model);
      this.geoCache.set(key, g);
      return g;
    }
    g = new THREE.BoxGeometry(1, 1, 1);
    const b = getBlock(blockId);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z  (same as our face indices)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = this.tileUv(b.faces[f]);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        const u = uv.getX(i), v = uv.getY(i);
        // BoxGeometry uv v=1 is the top of the face; atlas is not flipped
        uv.setXY(i, u0 + (u1 - u0) * u, v0 + (v1 - v0) * (1 - v));
      }
    }
    uv.needsUpdate = true;
    this.geoCache.set(key, g);
    return g;
  }

  spriteTexture(id: string): THREE.Texture {
    let t = this.texCache.get(id);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(this.icons.pixels(id)), 16, 16), 0, 0);
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    this.texCache.set(id, t);
    return t;
  }

  /**
   * Extruded sprite: 1x1 unit square in XY centred at origin, 1/16 thick.
   * Edge faces are generated only where an opaque pixel borders a transparent one.
   */
  spriteGeometry(id: string): THREE.BufferGeometry {
    const key = 's' + id;
    let g = this.geoCache.get(key);
    if (g) return g;
    const px = this.icons.pixels(id);
    const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
    const d = 1 / 32; // half thickness
    const quad = (a: number[], b: number[], c: number[], e: number[], n: number[], uv: number[][]) => {
      const base = pos.length / 3;
      for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [e, uv[3]]] as [number[], number[]][]) {
        pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uvs.push(t[0], t[1]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // front (+z) and back (-z)
    quad([-0.5, -0.5, d], [0.5, -0.5, d], [0.5, 0.5, d], [-0.5, 0.5, d], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    quad([0.5, -0.5, -d], [-0.5, -0.5, -d], [-0.5, 0.5, -d], [0.5, 0.5, -d], [0, 0, -1], [[1, 0], [0, 0], [0, 1], [1, 1]]);
    const opaque = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && px[(y * 16 + x) * 4 + 3] > 127;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!opaque(x, y)) continue;
      const x0 = x / 16 - 0.5, x1 = (x + 1) / 16 - 0.5;
      const y1 = 0.5 - y / 16, y0 = 0.5 - (y + 1) / 16;
      const u = (x + 0.5) / 16, v = 1 - (y + 0.5) / 16;
      const uv = [[u, v], [u, v], [u, v], [u, v]];
      if (!opaque(x - 1, y)) quad([x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d], [-1, 0, 0], uv);
      if (!opaque(x + 1, y)) quad([x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d], [1, 0, 0], uv);
      if (!opaque(x, y - 1)) quad([x0, y1, d], [x1, y1, d], [x1, y1, -d], [x0, y1, -d], [0, 1, 0], uv);
      if (!opaque(x, y + 1)) quad([x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d], [0, -1, 0], uv);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.geoCache.set(key, g);
    return g;
  }

  /** Creates a mesh for an item (caller owns the material; geometry is shared). */
  createMesh(id: string): { mesh: THREE.Mesh; isBlock: boolean } {
    if (this.isBlockModel(id)) {
      const mat = new THREE.MeshLambertMaterial({ map: this.atlasTex, alphaTest: 0.5 });
      return { mesh: new THREE.Mesh(this.blockGeometry(getItem(id).block!), mat), isBlock: true };
    }
    const mat = new THREE.MeshLambertMaterial({ map: this.spriteTexture(id), alphaTest: 0.5, side: THREE.DoubleSide });
    return { mesh: new THREE.Mesh(this.spriteGeometry(id), mat), isBlock: false };
  }

  /** Crack overlay textures (one per destroy stage). */
  destroyTexture(stage: number): THREE.Texture {
    return this.spriteTextureFromTile(`destroy_${stage}`);
  }

  tileTexture(name: string): THREE.Texture {
    return this.spriteTextureFromTile(name);
  }

  private spriteTextureFromTile(name: string): THREE.Texture {
    const key = 'tile:' + name;
    let t = this.texCache.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.atlas.get(name).d), 16, 16), 0, 0);
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    this.texCache.set(key, t);
    return t;
  }

  /** Average colours of a block's texture, for break particles. */
  particleColors(blockId: number): THREE.Color[] {
    const key = 'pc' + blockId;
    const cached = (this as unknown as Record<string, THREE.Color[]>)[key];
    if (cached) return cached;
    const b = getBlock(blockId);
    const tex = this.atlas.get(TEXTURE_NAMES[b.faces[4]]).d;
    const out: THREE.Color[] = [];
    for (let i = 0; i < 12; i++) {
      const p = ((i * 37 + 11) % 256) * 4;
      if (tex[p + 3] < 128) continue;
      out.push(new THREE.Color(tex[p] / 255, tex[p + 1] / 255, tex[p + 2] / 255));
    }
    if (!out.length) out.push(new THREE.Color(0.5, 0.5, 0.5));
    (this as unknown as Record<string, THREE.Color[]>)[key] = out;
    return out;
  }

  dispose(): void {
    for (const g of this.geoCache.values()) g.dispose();
    for (const t of this.texCache.values()) t.dispose();
    this.atlasTex.dispose();
  }
}
