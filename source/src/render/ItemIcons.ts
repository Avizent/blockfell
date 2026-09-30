import type { CSSProperties } from 'react';
import { ITEMS, getItem } from '../inventory/ItemRegistry';
import { getBlock, MODEL } from '../world/BlockRegistry';
import { TEXTURE_NAMES } from '../meshing/textureNames';
import type { TextureAtlas } from '../meshing/TextureAtlas';
import { spritePixels } from './itemSprites';

/**
 * Builds the inventory icon sheet. Block items are drawn as small isometric cubes
 * from their real textures (affine-mapped with nearest-neighbour sampling);
 * everything else is a flat 16x16 sprite. The sheet is generated at the current
 * GUI scale so icons are pixel-exact.
 */
export class ItemIcons {
  private index = new Map<string, number>();
  private url = '';
  private scale = 0;
  private cols = 16;
  private shaded = new Map<string, HTMLCanvasElement>();
  version = 0;

  constructor(private atlas: TextureAtlas) {
    ITEMS.forEach((it, i) => this.index.set(it.id, i));
  }

  private tex(name: string, f: number): HTMLCanvasElement {
    const key = name + '@' + f;
    let c = this.shaded.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 16;
    const src = this.atlas.get(name).d;
    const d = new Uint8ClampedArray(src);
    for (let i = 0; i < d.length; i += 4) { d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
    c.getContext('2d')!.putImageData(new ImageData(d, 16, 16), 0, 0);
    this.shaded.set(key, c);
    return c;
  }

  /** Raw 16x16 RGBA pixels for an item (used for held/dropped item models). */
  pixels(id: string): Uint8ClampedArray {
    const def = getItem(id);
    if (def.icon.kind === 'flat') return new Uint8ClampedArray(this.atlas.get(def.icon.texture).d);
    if (def.icon.kind === 'sprite') return spritePixels(def.icon.name);
    return new Uint8ClampedArray(this.atlas.get('missing').d);
  }

  /** Isometric icon of a shaped block: each box's top, south and east faces, painted back to front. */
  private drawIsoModel(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, blockId: number, m: Int8Array): void {
    const b = getBlock(blockId);
    const name = (layer: number) => TEXTURE_NAMES[layer];
    const w = 14.4 * s, hTop = w * 0.5, hSide = w * 0.56;
    const cx = ox + 8 * s, y0 = oy + (16 * s - hTop - hSide) / 2;
    const T = [cx, y0], R = [cx + w / 2, y0 + hTop / 2], L = [cx - w / 2, y0 + hTop / 2];
    const P = (x: number, y: number, z: number): [number, number] => [
      T[0] + (R[0] - T[0]) * x / 16 + (L[0] - T[0]) * z / 16,
      T[1] + (R[1] - T[1]) * x / 16 + (L[1] - T[1]) * z / 16 + (16 - y) / 16 * hSide,
    ];
    const face = (tex: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, o: [number, number], u: [number, number], v: [number, number]) => {
      if (sw <= 0 || sh <= 0) return;
      ctx.setTransform((u[0] - o[0]) / sw, (u[1] - o[1]) / sw, (v[0] - o[0]) / sh, (v[1] - o[1]) / sh, o[0], o[1]);
      ctx.drawImage(tex, sx, sy, sw, sh, 0, 0, sw, sh);
    };
    const boxes: number[][] = [];
    for (let i = 0; i < m.length; i += 6) boxes.push([m[i], m[i + 1], m[i + 2], m[i + 3], m[i + 4], m[i + 5]]);
    boxes.sort((p, q) => p[1] - q[1] || (p[0] + p[2]) - (q[0] + q[2]));
    ctx.save();
    for (const [x0, y0b, z0, x1, y1, z1] of boxes) {
      face(this.tex(name(b.faces[2]), 1), x0, z0, x1 - x0, z1 - z0, P(x0, y1, z0), P(x1, y1, z0), P(x0, y1, z1));
      face(this.tex(name(b.faces[4]), 0.82), x0, 16 - y1, x1 - x0, y1 - y0b, P(x0, y1, z1), P(x1, y1, z1), P(x0, y0b, z1));
      face(this.tex(name(b.faces[0]), 0.62), 16 - z1, 16 - y1, z1 - z0, y1 - y0b, P(x1, y1, z1), P(x1, y1, z0), P(x1, y0b, z1));
    }
    ctx.restore();
  }

  private drawIso(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, blockId: number): void {
    const model = MODEL[blockId];
    if (model) { this.drawIsoModel(ctx, ox, oy, s, blockId, model); return; }
    const b = getBlock(blockId);
    const name = (layer: number) => TEXTURE_NAMES[layer];
    const w = 14.4 * s, hTop = w * 0.5, hSide = w * 0.56;
    const cx = ox + 8 * s, y0 = oy + (16 * s - hTop - hSide) / 2;
    const T = [cx, y0], R = [cx + w / 2, y0 + hTop / 2], Bm = [cx, y0 + hTop], L = [cx - w / 2, y0 + hTop / 2];
    ctx.save();
    // top (+Y)
    ctx.setTransform((R[0] - T[0]) / 16, (R[1] - T[1]) / 16, (L[0] - T[0]) / 16, (L[1] - T[1]) / 16, T[0], T[1]);
    ctx.drawImage(this.tex(name(b.faces[2]), 1), 0, 0);
    // south (+Z) on the left
    ctx.setTransform((Bm[0] - L[0]) / 16, (Bm[1] - L[1]) / 16, 0, hSide / 16, L[0], L[1]);
    ctx.drawImage(this.tex(name(b.faces[4]), 0.82), 0, 0);
    // east (+X) on the right
    ctx.setTransform((R[0] - Bm[0]) / 16, (R[1] - Bm[1]) / 16, 0, hSide / 16, Bm[0], Bm[1]);
    ctx.drawImage(this.tex(name(b.faces[0]), 0.62), 0, 0);
    ctx.restore();
  }

  private drawFlat(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, px: Uint8ClampedArray): void {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), 16, 16), 0, 0);
    ctx.drawImage(c, ox, oy, 16 * s, 16 * s);
  }

  /** (Re)builds the sheet for GUI scale `s` (pixels per GUI pixel). */
  build(s: number): void {
    // whole texels only: at a fractional GUI scale draw a little smaller and let the
    // browser enlarge it (rounding up and shrinking would drop rows of pixels)
    s = Math.max(1, Math.floor(s + 1e-6));
    if (s === this.scale && this.url) return;
    this.scale = s;
    const n = ITEMS.length;
    const rows = Math.ceil(n / this.cols);
    const c = document.createElement('canvas');
    c.width = this.cols * 16 * s;
    c.height = rows * 16 * s;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ITEMS.forEach((it, i) => {
      const ox = (i % this.cols) * 16 * s, oy = Math.floor(i / this.cols) * 16 * s;
      if (it.icon.kind === 'iso') this.drawIso(ctx, ox, oy, s, it.icon.block);
      else this.drawFlat(ctx, ox, oy, s, this.pixels(it.id));
    });
    this.url = c.toDataURL('image/png');
    this.version++;
  }

  /** CSS for a 16x16 GUI-pixel icon box (sized in rem, 1rem = 1 GUI pixel). */
  style(id: string): CSSProperties {
    const i = this.index.get(id) ?? 0;
    const rows = Math.ceil(ITEMS.length / this.cols);
    return {
      backgroundImage: `url(${this.url})`,
      backgroundSize: `${this.cols * 16}rem ${rows * 16}rem`,
      backgroundPosition: `${-(i % this.cols) * 16}rem ${-Math.floor(i / this.cols) * 16}rem`,
      imageRendering: 'pixelated',
    };
  }

  get sheetUrl(): string {
    return this.url;
  }
}
