import * as THREE from 'three';
import type { World, SignEntity } from '../world/World';
import { UNLOADED } from '../world/World';
import * as B from '../world/BlockRegistry';
import type { TextureAtlas } from '../meshing/TextureAtlas';
import { DYE_RGB, DyeColor } from '../world/dyes';

/** Text canvas: the 16 x 8 texel board at 12 canvas pixels per texel. */
const CW = 192, CH = 96;
const BOARD_W = 1, BOARD_H = 0.5, BOARD_D = 1 / 12;
/** Signs further than this from the camera are not drawn (and free their textures). */
const RANGE = 56;
const INK: [number, number, number] = [42, 28, 16];

interface SignView {
  block: number;
  rot: number;
  text: string;
  obj: THREE.Group;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  textMat: THREE.MeshBasicMaterial;
  woodMat: THREE.MeshBasicMaterial;
}

/** Box with UVs in block units, so the wood texture tiles at its real size. */
function woodBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    if (f === 4 && h === BOARD_H && w === BOARD_W) continue;   // the board front shows the whole text canvas
    for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * dims[f][0], uv.getY(f * 4 + k) * dims[f][1]);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Draws every sign near the camera: a wooden board (on a post, or flat against a
 * wall) with its four lines of text painted into a small canvas texture in the
 * game's pixel font. Signs are plain blocks in the voxel data; their text lives
 * in a block entity, and this renderer rebuilds a sign's texture only when the
 * text or colour changes.
 */
export class SignRenderer {
  readonly group = new THREE.Group();
  private views = new Map<string, SignView>();
  private readonly planks: Uint8ClampedArray;
  private readonly woodTex: THREE.CanvasTexture;
  private readonly boardGeo = woodBox(BOARD_W, BOARD_H, BOARD_D);
  private readonly postGeo = woodBox(BOARD_D, 0.5, BOARD_D);
  private frame = 0;
  private dirty = true;
  private fontReady = false;

  constructor(atlas: TextureAtlas) {
    this.group.name = 'signs';
    this.planks = atlas.get('planks').d;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.planks), 16, 16), 0, 0);
    this.woodTex = new THREE.CanvasTexture(c);
    this.woodTex.magFilter = THREE.NearestFilter;
    this.woodTex.minFilter = THREE.NearestFilter;
    this.woodTex.generateMipmaps = false;
    this.woodTex.wrapS = this.woodTex.wrapT = THREE.RepeatWrapping;
    this.woodTex.colorSpace = THREE.NoColorSpace;
    // text is redrawn once the pixel font has loaded
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) void fonts.load('16px Blockfell').then(() => { this.fontReady = true; this.dirty = true; }, () => { this.fontReady = true; });
    else this.fontReady = true;
  }

  get count(): number { return this.views.size; }

  /** Something about a sign changed: rescan on the next frame. */
  refresh(): void { this.dirty = true; }

  update(world: World, cam: THREE.Vector3, light: (x: number, y: number, z: number) => number): void {
    if (!this.dirty && ++this.frame % 20 !== 0) return;
    this.dirty = false;
    const seen = new Set<string>();
    for (const [k, be] of world.blockEntities) {
      if (be.type !== 'sign') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x + 0.5 - cam.x) > RANGE || Math.abs(z + 0.5 - cam.z) > RANGE || Math.abs(y - cam.y) > RANGE) continue;
      const id = world.getBlock(x, y, z);
      if (id === UNLOADED) continue;
      const d = B.getBlock(id);
      if (d.shape !== 'sign' && d.shape !== 'wall_sign') continue;
      seen.add(k);
      const rot = be.rot ?? 0;
      let v = this.views.get(k);
      if (v && (v.block !== id || v.rot !== rot)) { this.remove(k); v = undefined; }
      if (!v) v = this.create(k, x, y, z, id, rot);
      const text = be.lines.join('\n') + '|' + (be.color ?? '') + '|' + (this.fontReady ? 1 : 0);
      if (v.text !== text) { this.draw(v, be); v.text = text; }
      const l = light(x + 0.5, y + 0.5, z + 0.5);
      v.textMat.color.setScalar(l);
      v.woodMat.color.setScalar(l);
    }
    for (const k of [...this.views.keys()]) if (!seen.has(k)) this.remove(k);
  }

  /** The text canvas of the sign at a position (tests and screenshots). */
  canvasAt(x: number, y: number, z: number): HTMLCanvasElement | null {
    return this.views.get(`${x},${y},${z}`)?.canvas ?? null;
  }

  private create(k: string, x: number, y: number, z: number, id: number, rot: number): SignView {
    const d = B.getBlock(id);
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    const textMat = new THREE.MeshBasicMaterial({ map: tex });
    const woodMat = new THREE.MeshBasicMaterial({ map: this.woodTex });
    const obj = new THREE.Group();
    obj.position.set(x + 0.5, y, z + 0.5);
    const board = new THREE.Mesh(this.boardGeo, [woodMat, woodMat, woodMat, woodMat, textMat, woodMat]);
    obj.add(board);
    if (d.shape === 'wall_sign' && d.facing) {
      const [nx, nz] = B.FACING_VEC[d.facing];
      obj.rotation.y = Math.atan2(nx, nz);
      board.position.set(0, 0.5, -(0.5 - BOARD_D / 2));
    } else {
      obj.rotation.y = rot * Math.PI / 8;
      board.position.set(0, 0.5 + BOARD_H / 2, 0);
      const post = new THREE.Mesh(this.postGeo, woodMat);
      post.position.set(0, 0.25, 0);
      obj.add(post);
    }
    this.group.add(obj);
    const v: SignView = { block: id, rot, text: '', obj, canvas, tex, textMat, woodMat };
    this.views.set(k, v);
    return v;
  }

  private draw(v: SignView, be: SignEntity): void {
    const ctx = v.canvas.getContext('2d')!;
    const P = CW / 16;
    // the board: the middle rows of the oak planks texture, with a darker rim
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 16; tx++) {
      const i = ((ty + 4) * 16 + tx) * 4;
      const rim = tx === 0 || tx === 15 || ty === 0 || ty === 7 ? 0.78 : 1;
      ctx.fillStyle = `rgb(${this.planks[i] * rim | 0},${this.planks[i + 1] * rim | 0},${this.planks[i + 2] * rim | 0})`;
      ctx.fillRect(tx * P, ty * P, P, P);
    }
    const c = be.color && be.color in DYE_RGB && be.color !== 'black' ? DYE_RGB[be.color as DyeColor] : INK;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.font = '16px Blockfell, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < 4; i++) {
      let line = be.lines[i] ?? '';
      while (line && ctx.measureText(line).width > CW - 14) line = line.slice(0, -1);
      ctx.fillText(line, CW / 2, 21 + i * 22);
    }
    v.tex.needsUpdate = true;
  }

  private remove(k: string): void {
    const v = this.views.get(k);
    if (!v) return;
    v.obj.removeFromParent();
    v.tex.dispose(); v.textMat.dispose(); v.woodMat.dispose();
    this.views.delete(k);
  }

  dispose(): void {
    for (const k of [...this.views.keys()]) this.remove(k);
    this.group.removeFromParent();
    this.boardGeo.dispose(); this.postGeo.dispose(); this.woodTex.dispose();
  }
}
