import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Cuboid ("box") models for mobs and the player, built from ORIGINAL procedural
 * textures. Units are model pixels (1/16 block). Each part is a box with a pivot
 * so limbs can swing. Texture layout per box (like classic box-UV skins):
 *
 *        d     w     d     w
 *     +-----+-----+-----+
 *     |     | top | bot |          (row of height d)
 *     +-----+-----+-----+-----+
 *     |side |front|side |back |    (row of height h)
 */
export interface PartDef {
  name: string;
  size: [number, number, number];     // w, h, d
  pivot: [number, number, number];    // pivot position in parent space
  from: [number, number, number];     // box min corner relative to pivot
  uv?: [number, number];           // assigned automatically by the packer
  paint?: (p: FacePainter) => void;
  base: string;                       // base colour
  noise?: number;
  parent?: string;
}

export type FaceName = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export class FacePainter {
  constructor(private ctx: CanvasRenderingContext2D, private part: PartDef) {}

  rect(face: FaceName): [number, number, number, number] {
    const [w, h, d] = this.part.size;
    const [u, v] = this.part.uv ?? [0, 0];
    switch (face) {
      case 'top': return [u + d, v, w, d];
      case 'bottom': return [u + d + w, v, w, d];
      case 'right': return [u, v + d, d, h];
      case 'front': return [u + d, v + d, w, h];
      case 'left': return [u + d + w, v + d, d, h];
      case 'back': return [u + d + w + d, v + d, w, h];
    }
  }

  /** Paints pixels inside a face; (x,y) relative to the face's top-left. */
  px(face: FaceName, x: number, y: number, color: string, w = 1, h = 1): void {
    const [fx, fy] = this.rect(face);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(fx + x, fy + y, w, h);
  }

  fill(face: FaceName, color: string, noise = 0, seed = 1): void {
    const [fx, fy, fw, fh] = this.rect(face);
    paintNoise(this.ctx, fx, fy, fw, fh, color, noise, seed);
  }
}

export function paintNoise(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, noise: number, seed: number): void {
  const c = new THREE.Color(color);
  const rng = mulberry32(seed);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const f = 1 + (rng() - 0.5) * noise * 2;
    ctx.fillStyle = `rgb(${Math.min(255, c.r * 255 * f) | 0},${Math.min(255, c.g * 255 * f) | 0},${Math.min(255, c.b * 255 * f) | 0})`;
    ctx.fillRect(x + i, y + j, 1, 1);
  }
}

export interface BuiltModel {
  root: THREE.Group;
  parts: Map<string, THREE.Object3D>;
  material: THREE.MeshLambertMaterial;
  texture: THREE.CanvasTexture;
}

const FACE_ORDER: FaceName[] = ['left', 'right', 'top', 'bottom', 'front', 'back']; // matches BoxGeometry +x,-x,+y,-y,+z,-z

/** Builds the texture once per model type; geometry per part. */
export function buildModel(parts: PartDef[], texW = 64, texH = 64, seed = 7): BuiltModel {
  // shelf-pack every box's UV region (2*(w+d) x (d+h)) so textures never overlap
  {
    const order = [...parts].sort((a, b) => (b.size[2] + b.size[1]) - (a.size[2] + a.size[1]));
    let x = 0, y = 0, rowH = 0;
    for (const p of order) {
      const w = 2 * (p.size[0] + p.size[2]), h = p.size[2] + p.size[1];
      if (x + w > texW) { x = 0; y += rowH; rowH = 0; }
      p.uv = [x, y];
      x += w;
      rowH = Math.max(rowH, h);
    }
    while (y + rowH > texH) texH *= 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d')!;
  parts.forEach((p, i) => {
    const painter = new FacePainter(ctx, p);
    for (const f of FACE_ORDER) painter.fill(f, p.base, p.noise ?? 0.06, seed * 131 + i * 17 + f.length);
    // subtle shading so boxes read in 3D even under flat light
    const [bx, by, bw, bh] = painter.rect('bottom');
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(bx, by, bw, bh);
    p.paint?.(painter);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });

  const root = new THREE.Group();
  const map = new Map<string, THREE.Object3D>();
  for (const p of parts) {
    const pivot = new THREE.Group();
    pivot.name = p.name;
    pivot.position.set(p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
    const [w, h, d] = p.size;
    const g = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
    // remap UVs to the box-UV layout
    const painter = new FacePainter(ctx, p);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    FACE_ORDER.forEach((face, f) => {
      const [fx, fy, fw, fh] = painter.rect(face);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        const u = uv.getX(i), v = uv.getY(i);
        let uu = u, vv = v;
        if (face === 'bottom') vv = 1 - v; // bottom faces read front-to-back
        uv.setXY(i, (fx + uu * fw) / texW, 1 - (fy + (1 - vv) * fh) / texH);
      }
    });
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set((p.from[0] + w / 2) / 16, (p.from[1] + h / 2) / 16, (p.from[2] + d / 2) / 16);
    pivot.add(mesh);
    map.set(p.name, pivot);
  }
  for (const p of parts) {
    const obj = map.get(p.name)!;
    if (p.parent) map.get(p.parent)!.add(obj);
    else root.add(obj);
  }
  return { root, parts: map, material, texture };
}

/** Deep-clones a built model so each entity has its own transforms and material. */
export function instantiate(model: BuiltModel): { root: THREE.Group; parts: Map<string, THREE.Object3D>; material: THREE.MeshLambertMaterial } {
  const material = model.material.clone();
  const root = model.root.clone(true);
  const parts = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
    if (o.name) parts.set(o.name, o);
  });
  return { root, parts, material };
}
