import * as THREE from 'three';
import { BuiltModel, PartDef, buildModel } from './BoxModel';

/** How big the box model is drawn. */
export const DRAKE_SCALE = 2.2;


/**
 * ORIGINAL design: a long, lean sky-dragon of bone-white plates with a pale violet
 * belly, a crown of cyan crystal horns and a row of crystals down its back, glowing
 * cyan eyes, and wide violet wings speckled with stars.
 */
function drakeParts(): PartDef[] {
  const bone = '#ddd6c6', boneD = '#a89f8d', belly = '#b8a5d6', wing = '#5b3f92', wingD = '#40296e', star = '#ece6ff', cyan = '#86f0ff';
  type P = Parameters<NonNullable<PartDef['paint']>>[0];
  const plates = (len: number) => (p: P) => {
    for (const f of ['left', 'right'] as const) for (let z = 2; z < len; z += 5) p.px(f, z, 0, boneD, 1, 99);
    for (let z = 1; z < len; z += 4) p.px('top', 0, z, boneD, 99, 1);
    p.fill('bottom', belly, 0.08, 5);
  };
  const membrane = (w: number, d: number) => (p: P) => {
    p.fill('top', wing, 0.1, 11); p.fill('bottom', wingD, 0.1, 12);
    for (let i = 0; i < Math.floor(w * d / 18); i++) {
      const x = (i * 37) % w, y = (i * 53) % d;
      p.px('top', x, y, star); p.px('bottom', (x + 3) % w, (y + 5) % d, star);
    }
    p.px('top', 0, 0, bone, w, 1); p.px('bottom', 0, 0, bone, w, 1);   // the leading bone
  };
  const crystal = (p: P) => { for (const f of ['front', 'back', 'left', 'right', 'top'] as const) p.fill(f, cyan, 0.12, 21); };
  const parts: PartDef[] = [
    { name: 'body', size: [14, 12, 26], pivot: [0, 0, 0], from: [-7, -6, -13], base: bone, noise: 0.06, paint: plates(26) },
    { name: 'neck1', size: [8, 8, 9], pivot: [0, 2, 12], from: [-4, -4, 0], base: bone, parent: 'body', paint: plates(9) },
    { name: 'neck2', size: [7, 7, 9], pivot: [0, 0, 8], from: [-3.5, -3.5, 0], base: bone, parent: 'neck1', paint: plates(9) },
    { name: 'head', size: [10, 8, 13], pivot: [0, 0, 8], from: [-5, -3, 0], base: bone, parent: 'neck2',
      paint: (p) => {
        p.fill('bottom', belly, 0.08, 6);
        p.px('left', 7, 2, cyan, 3, 2); p.px('right', 3, 2, cyan, 3, 2);           // eyes
        p.px('front', 1, 1, '#2a2440', 2, 1); p.px('front', 7, 1, '#2a2440', 2, 1); // nostrils
        p.px('top', 1, 3, boneD, 8, 1);
      } },
    { name: 'jaw', size: [8, 3, 11], pivot: [0, -3, 1], from: [-4, -3, 0], base: boneD, parent: 'head',
      paint: (p) => { for (let x = 0; x < 8; x += 2) p.px('top', x, 9, '#f6f2ea', 1, 2); } },
    { name: 'hornL', size: [2, 2, 9], pivot: [3, 4, 2], from: [-1, -1, -9], base: cyan, parent: 'head', paint: crystal },
    { name: 'hornR', size: [2, 2, 9], pivot: [-3, 4, 2], from: [-1, -1, -9], base: cyan, parent: 'head', paint: crystal },
    { name: 'hornM', size: [2, 4, 2], pivot: [0, 5, 6], from: [-1, 0, -1], base: cyan, parent: 'head', paint: crystal },
    { name: 'spine1', size: [2, 4, 3], pivot: [0, 6, 7], from: [-1, 0, -1.5], base: cyan, parent: 'body', paint: crystal },
    { name: 'spine2', size: [2, 5, 3], pivot: [0, 6, 0], from: [-1, 0, -1.5], base: cyan, parent: 'body', paint: crystal },
    { name: 'spine3', size: [2, 4, 3], pivot: [0, 6, -7], from: [-1, 0, -1.5], base: cyan, parent: 'body', paint: crystal },
    { name: 'wingL', size: [32, 2, 20], pivot: [7, 4, 4], from: [0, -1, -10], base: wing, parent: 'body', paint: membrane(32, 20) },
    { name: 'wingTipL', size: [28, 1, 16], pivot: [32, 0, 0], from: [0, -0.5, -8], base: wing, parent: 'wingL', paint: membrane(28, 16) },
    { name: 'wingR', size: [32, 2, 20], pivot: [-7, 4, 4], from: [-32, -1, -10], base: wing, parent: 'body', paint: membrane(32, 20) },
    { name: 'wingTipR', size: [28, 1, 16], pivot: [-32, 0, 0], from: [-28, -0.5, -8], base: wing, parent: 'wingR', paint: membrane(28, 16) },
    { name: 'tail1', size: [8, 7, 12], pivot: [0, 0, -13], from: [-4, -3.5, -12], base: bone, parent: 'body', paint: plates(12) },
    { name: 'tail2', size: [6, 5, 12], pivot: [0, 0, -12], from: [-3, -2.5, -12], base: bone, parent: 'tail1', paint: plates(12) },
    { name: 'tail3', size: [4, 3, 12], pivot: [0, 0, -12], from: [-2, -1.5, -12], base: bone, parent: 'tail2', paint: plates(12) },
    { name: 'tailFin', size: [10, 1, 7], pivot: [0, 0, -11], from: [-5, -0.5, -7], base: cyan, parent: 'tail3', paint: crystal },
    { name: 'legFL', size: [4, 8, 4], pivot: [5, -5, 8], from: [-2, -8, -2], base: boneD, parent: 'body' },
    { name: 'legFR', size: [4, 8, 4], pivot: [-5, -5, 8], from: [-2, -8, -2], base: boneD, parent: 'body' },
    { name: 'legBL', size: [5, 9, 5], pivot: [5, -5, -8], from: [-2.5, -9, -2.5], base: boneD, parent: 'body' },
    { name: 'legBR', size: [5, 9, 5], pivot: [-5, -5, -8], from: [-2.5, -9, -2.5], base: boneD, parent: 'body' },
  ];
  return parts;
}

let model: BuiltModel | null = null;
/** The Hollowdrake's model (built once): its cyan crystals and eyes glow on their own. */
export function drakeModel(): BuiltModel {
  if (model) return model;
  model = buildModel(drakeParts(), 128, 128, 404);
  const src = model.texture.image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const glow = d[i + 2] > 200 && d[i + 1] > 190 && d[i] < 190;   // the cyan crystals and eyes
    if (!glow) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  model.material.emissiveMap = t;
  model.material.emissive.setRGB(1, 1, 1);
  model.material.emissiveIntensity = 0.9;
  model.root.scale.setScalar(DRAKE_SCALE);
  return model;
}

