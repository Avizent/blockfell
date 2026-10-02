import { mulberry32 } from '../core/rng';
import { DESTROY_STAGES, LAVA_FRAMES, TEXTURE_NAMES, WATER_FRAMES } from './textureNames';
import { DYE_COLORS, DYE_RGB } from '../world/dyes';

/**
 * ORIGINAL procedural 16x16 pixel-art block textures.
 * Every texture is generated deterministically from its name, so they are the
 * same on every run and need no external image files.
 */
export const TEX = 16;
type RGB = [number, number, number];

export class PixelTex {
  d = new Uint8ClampedArray(TEX * TEX * 4);
  set(x: number, y: number, c: RGB, a = 255): void {
    x = ((x % TEX) + TEX) % TEX; y = ((y % TEX) + TEX) % TEX;
    const i = (y * TEX + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    x = ((x % TEX) + TEX) % TEX; y = ((y % TEX) + TEX) % TEX;
    const i = (y * TEX + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  alpha(x: number, y: number): number { return this.d[((y & 15) * TEX + (x & 15)) * 4 + 3]; }
  clone(): PixelTex { const t = new PixelTex(); t.d.set(this.d); return t; }
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Tileable value noise over the 16x16 tile (cell = grid spacing in pixels). */
function tileNoise(rng: () => number, cell: number): Float32Array {
  const n = TEX / cell;
  const g = Float32Array.from({ length: n * n }, () => rng());
  const out = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (ix: number, iy: number) => g[((iy % n + n) % n) * n + ((ix % n + n) % n)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    out[y * TEX + x] = a + (b - a) * sy;
  }
  return out;
}

function noisy(base: RGB, rng: () => number, amount: number, cell = 4, cellAmt = 0.12): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, cell);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const f = 1 + (n[y * TEX + x] - 0.5) * cellAmt * 2 + (rng() - 0.5) * amount * 2;
    t.set(x, y, shade(base, f));
  }
  return t;
}

function speckle(t: PixelTex, rng: () => number, count: number, c: RGB, jitter = 0.06): void {
  for (let i = 0; i < count; i++) t.set(Math.floor(rng() * TEX), Math.floor(rng() * TEX), shade(c, 1 + (rng() - 0.5) * jitter * 2));
}

function stone(rng: () => number): PixelTex {
  const t = noisy([127, 127, 127], rng, 0.045, 4, 0.08);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16), len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) {
      t.set(x + k, y, shade(t.get(x + k, y), 0.82));
      if (rng() < 0.5) t.set(x + k, y - 1, shade(t.get(x + k, y - 1), 1.08));
    }
  }
  speckle(t, rng, 10, [146, 146, 146]);
  return t;
}

function dirt(rng: () => number): PixelTex {
  const t = noisy([134, 96, 66], rng, 0.05, 4, 0.1);
  speckle(t, rng, 22, [100, 71, 48]);
  speckle(t, rng, 12, [156, 114, 80]);
  speckle(t, rng, 5, [118, 110, 100]);
  return t;
}

const GRASS: RGB = [98, 160, 58];
function grassTop(rng: () => number): PixelTex {
  const t = noisy(GRASS, rng, 0.07, 2, 0.1);
  speckle(t, rng, 30, [74, 126, 42]);
  speckle(t, rng, 18, [124, 184, 74]);
  return t;
}

function fringe(base: PixelTex, rng: () => number, col: RGB, dark: RGB): PixelTex {
  const t = base.clone();
  for (let x = 0; x < TEX; x++) {
    const depth = 3 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      const c = y === depth - 1 ? dark : col;
      t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.14));
    }
  }
  return t;
}

function sand(rng: () => number): PixelTex {
  const t = noisy([219, 205, 158], rng, 0.03, 4, 0.05);
  speckle(t, rng, 26, [199, 183, 134]);
  speckle(t, rng, 16, [236, 226, 186]);
  return t;
}

function gravel(rng: () => number): PixelTex {
  const t = noisy([122, 116, 114], rng, 0.05, 2, 0.08);
  const pal: RGB[] = [[96, 92, 90], [152, 146, 142], [126, 112, 100], [84, 80, 78], [170, 164, 158]];
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    const w = 1 + Math.floor(rng() * 2), h = 1 + Math.floor(rng() * 2);
    const c = pal[Math.floor(rng() * pal.length)];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) t.set(x + dx, y + dy, c);
    t.set(x, y, shade(c, 1.15));
    t.set(x + w, y + h, shade(c, 0.7));
  }
  return t;
}

const BARK: RGB[] = [[104, 80, 49], [90, 68, 41], [116, 90, 56]];
function logSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let x = 0; x < TEX; x++) {
    const c = BARK[Math.floor(rng() * BARK.length)];
    for (let y = 0; y < TEX; y++) t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.1));
  }
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(rng() * 16);
    let y = Math.floor(rng() * 16);
    const len = 4 + Math.floor(rng() * 8);
    for (let i = 0; i < len; i++) t.set(x, y++, [68, 50, 30]);
  }
  return t;
}

function logTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 8);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb >= 7) { t.set(x, y, shade(BARK[(x + y) % 3], 1 + (rng() - 0.5) * 0.1)); continue; }
    const d = Math.sqrt(dx * dx + dy * dy) * 0.55 + cheb * 0.45 + n[y * 16 + x] * 0.8;
    const ring = Math.floor(d * 0.9) % 2;
    const c: RGB = ring ? [168, 132, 84] : [186, 150, 98];
    t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.05));
  }
  return t;
}

function leaves(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const v = n[y * 16 + x];
    if (rng() < 0.2 + (v < 0.3 ? 0.15 : 0)) { t.set(x, y, [40, 80, 30], 0); continue; }
    const base: RGB = v > 0.62 ? [76, 142, 52] : v > 0.4 ? [58, 118, 40] : [44, 96, 32];
    t.set(x, y, shade(base, 1 + (rng() - 0.5) * 0.18));
  }
  return t;
}

function water(frame: number): PixelTex {
  const t = new PixelTex();
  const rng = mulberry32(99);
  const jitter = Float32Array.from({ length: 256 }, () => rng());
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const px = (x + frame * 2) / 16 * Math.PI * 2;
    const py = y / 16 * Math.PI * 2;
    const w = Math.sin(px + Math.sin(py) * 1.4) * 0.5 + Math.sin(py * 2 - px) * 0.25;
    const f = 0.9 + w * 0.12 + (jitter[y * 16 + x] - 0.5) * 0.04;
    const c = shade([50, 96, 200], f);
    const hi = w > 0.62;
    t.set(x, y, hi ? [120, 170, 235] : c, hi ? 200 : 172);
  }
  return t;
}

/**
 * Lava: molten orange with bright yellow currents and darker cooling crust. The
 * frames loop (the pattern drifts one full period over LAVA_FRAMES frames), and
 * every frame tiles seamlessly so lakes can be drawn as one big greedy quad.
 */
function lava(frame: number): PixelTex {
  const t = new PixelTex();
  const rng = mulberry32(4242);
  // two tileable noise fields drifting in different directions (2 pixels a frame, so the
  // loop of LAVA_FRAMES frames moves each exactly one tile and repeats seamlessly)
  const n1 = tileNoise(rng, 8), n2 = tileNoise(rng, 4), grain = tileNoise(rng, 2);
  const step = TEX / LAVA_FRAMES;
  const a = frame * step;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    // mostly molten orange with soft brighter currents; darker cooling skin in the troughs
    const v = n2[((y + a) & 15) * 16 + x] * 0.5 + n1[y * 16 + ((x - a) & 15)] * 0.32 + grain[((y - a) & 15) * 16 + ((x + a) & 15)] * 0.18;
    let c: RGB;
    if (v > 0.7) c = [255, 214, 104];
    else if (v > 0.5) c = [250, 156, 42];
    else if (v > 0.3) c = [234, 112, 26];
    else c = [196, 70, 20];
    t.set(x, y, shade(c, 0.95 + grain[y * 16 + x] * 0.1));
  }
  return t;
}

/** Cinderstone: glassy black-grey rock with thin ember-red veins (cooled lava). */
function cinderstone(rng: () => number): PixelTex {
  const t = noisy([40, 36, 42], rng, 0.07, 4, 0.2);
  speckle(t, rng, 16, [66, 62, 72]);
  speckle(t, rng, 10, [26, 24, 28]);
  for (let k = 0; k < 4; k++) {
    let x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    const len = 4 + Math.floor(rng() * 6);
    for (let i = 0; i < len; i++) {
      t.set(x, y, i % 3 === 0 ? [222, 104, 38] : [150, 46, 26]);
      const d = Math.floor(rng() * 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
    }
  }
  return t;
}

/** Monster Cage: a frame of dark iron bars (the gaps are see-through). */
function spawnerCage(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const bar = x === 5 || x === 10 || y === 5 || y === 10;
    if (!edge && !bar) { t.set(x, y, [0, 0, 0], 0); continue; }
    let c: RGB = edge ? [62, 66, 78] : [46, 50, 60];
    if (edge && (x === 0 || y === 0)) c = shade(c, 1.18);
    t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.16));
  }
  for (const [x, y] of [[5, 5], [10, 5], [5, 10], [10, 10], [0, 0], [15, 0], [0, 15], [15, 15]]) t.set(x, y, [112, 118, 134]);
  return t;
}

/** Village Bell (1.8): cast bronze, darker towards the rim, with a bright vertical highlight. */
function bellBronze(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const band = x % 6 === 2 ? 1.28 : x % 6 === 3 ? 1.12 : x % 6 === 5 ? 0.82 : 1;
    const rim = y >= 13 ? 0.78 : y === 12 ? 1.18 : 1;
    const f = band * rim * (0.92 + n[y * TEX + x] * 0.16) * (1 + (rng() - 0.5) * 0.06);
    t.set(x, y, shade([196, 148, 62], f));
  }
  return t;
}

/** The dark iron yoke the bell hangs from. */
function bellMount(rng: () => number): PixelTex {
  const t = noisy([70, 72, 80], rng, 0.05, 4, 0.08);
  for (let x = 0; x < TEX; x++) { t.set(x, 0, [96, 98, 108]); t.set(x, 15, [44, 46, 52]); }
  return t;
}

/** Map Table (1.8): a sheet of parchment with a drawn coast, a dotted route and a red cross, on a wooden frame. */
function mapTable(rng: () => number, top: boolean): PixelTex {
  const t = planks(rng);
  if (top) {
    const paper: RGB = [226, 210, 168];
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) t.set(x, y, shade(paper, 0.94 + rng() * 0.1));
    for (let i = 1; i < 15; i++) { t.set(i, 1, [196, 176, 130]); t.set(1, i, [196, 176, 130]); }
    // a coastline: sea (blue-grey) on the left of a wavy line
    for (let y = 2; y < 14; y++) {
      const edge = 4 + Math.round(Math.sin(y * 0.9) * 1.5 + (y > 8 ? 1 : 0));
      for (let x = 2; x < edge; x++) t.set(x, y, [150, 170, 172]);
      t.set(edge, y, [96, 84, 60]);
    }
    // a dotted route to a red cross
    for (const [x, y] of [[7, 12], [8, 11], [9, 10], [9, 8], [10, 7], [11, 6]]) t.set(x, y, [120, 70, 40]);
    paint(t, ['r.r', '.r.', 'r.r'], { r: [190, 40, 34] }, 11, 3);
    // little trees
    for (const [x, y] of [[7, 4], [8, 5], [6, 8]]) { t.set(x, y, [70, 110, 60]); t.set(x, y + 1, [96, 84, 60]); }
    return t;
  }
  // front: a rack of rolled maps under the table top
  for (let x = 0; x < 16; x++) { t.set(x, 0, [96, 70, 40]); t.set(x, 3, [96, 70, 40]); t.set(x, 15, [96, 70, 40]); }
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 4; k++) {
      const x0 = 1 + k * 4, y0 = 5 + row * 5;
      const paper: RGB = row ? [214, 196, 150] : [230, 214, 172];
      paint(t, ['.pp.', 'pPPp', 'pPPp', '.pp.'], { p: shade(paper, 0.82), P: paper }, x0, y0);
      t.set(x0 + 1, y0 + 1, [170, 60, 50]);
    }
  }
  return t;
}

function ore(rng: () => number, cols: RGB[], clusters: number): PixelTex {
  const t = stone(rng);
  for (let i = 0; i < clusters; i++) {
    const cx = 2 + Math.floor(rng() * 12), cy = 2 + Math.floor(rng() * 12);
    const size = 3 + Math.floor(rng() * 3);
    let x = cx, y = cy;
    for (let k = 0; k < size; k++) {
      const c = cols[Math.floor(rng() * cols.length)];
      t.set(x, y, c);
      t.set(x + 1, y + 1, shade(t.get(x + 1, y + 1), 0.8));
      const d = Math.floor(rng() * 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
    }
  }
  return t;
}

const PLANK: RGB[] = [[166, 132, 82], [156, 122, 75], [174, 139, 88], [160, 127, 79]];
function planks(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let b = 0; b < 4; b++) {
    const c = PLANK[b];
    const seam = Math.floor(rng() * 16);
    for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < TEX; x++) {
      let col = shade(c, 1 + (rng() - 0.5) * 0.06);
      if (y === b * 4 + 3) col = [112, 86, 52];
      else if (x === seam) col = shade(c, 0.72);
      t.set(x, y, col);
    }
    for (let g = 0; g < 3; g++) {
      const gx = Math.floor(rng() * 16), gy = b * 4 + Math.floor(rng() * 3), len = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < len; k++) if ((gx + k) % 16 !== seam) t.set(gx + k, gy, shade(c, 0.88));
    }
  }
  return t;
}

function cobble(rng: () => number, tones: RGB[], mortar: RGB): PixelTex {
  const t = new PixelTex();
  const pts = Array.from({ length: 11 }, () => [rng() * 16, rng() * 16, Math.floor(rng() * tones.length)]);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let d1 = 99, d2 = 99, best = 0, bx = 0, by = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
        const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = i; bx = dx; by = dy; } else if (d < d2) d2 = d;
      }
    }
    if (d2 - d1 < 1.1) { t.set(x, y, shade(mortar, 1 + (rng() - 0.5) * 0.1)); continue; }
    let c = tones[pts[best][2]];
    if (bx + by < -2.2) c = shade(c, 1.12);
    else if (bx + by > 2.5) c = shade(c, 0.86);
    t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.08));
  }
  return t;
}

const COBBLE_TONES: RGB[] = [[122, 122, 122], [138, 138, 138], [108, 108, 108], [148, 148, 148]];

function bedrock(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 2);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const v = n[y * 16 + x] * 0.8 + rng() * 0.2;
    t.set(x, y, shade([100, 100, 100], 0.35 + v * 0.9));
  }
  return t;
}

/** Draws a small picture from a character map onto a texture. */
function paint(t: PixelTex, map: string[], pal: Record<string, RGB>, ox = 0, oy = 0): void {
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c) t.set(ox + x, oy + y, c);
    }
  });
}

function craftingTop(rng: () => number): PixelTex {
  const t = planks(rng);
  const dark: RGB = [98, 70, 40];
  for (let i = 0; i < 16; i++) { t.set(i, 0, dark); t.set(i, 15, dark); t.set(0, i, dark); t.set(15, i, dark); }
  for (let i = 2; i < 14; i++) { t.set(i, 5, [122, 92, 54]); t.set(i, 10, [122, 92, 54]); t.set(5, i, [122, 92, 54]); t.set(10, i, [122, 92, 54]); }
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) { t.set(x, y, [150, 150, 156]); }
  return t;
}

function craftingSide(rng: () => number, front: boolean): PixelTex {
  const t = planks(rng);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) t.set(x, y, shade([128, 94, 56], 1 + (rng() - 0.5) * 0.06));
    t.set(x, 0, [152, 116, 70]); t.set(x, 4, [90, 64, 36]);
  }
  for (let y = 0; y < 16; y++) { t.set(0, y, [96, 70, 40]); t.set(15, y, [96, 70, 40]); }
  const pal: Record<string, RGB> = { m: [176, 178, 184], M: [120, 122, 130], h: [120, 82, 44], H: [88, 58, 30] };
  if (front) {
    // hammer and chisel hanging on the table front
    paint(t, [
      'mmmm.......m...',
      'mMMm.......m...',
      '.hh........M...',
      '.hH........h...',
      '.hH........H...',
      '.hH........h...',
      '.hH............',
      '.HH............',
    ], pal, 2, 6);
  } else {
    // saw
    paint(t, [
      'hh...........',
      'hHmmmmmmmmm..',
      'hHMmmmmmmmmm.',
      'hh.M.M.M.M.M.',
    ], pal, 1, 8);
  }
  return t;
}

function glass(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [200, 225, 235], 0);
  for (let i = 0; i < 16; i++) {
    const c: RGB = [214, 232, 240];
    t.set(i, 0, c); t.set(i, 15, [170, 196, 210]); t.set(0, i, c); t.set(15, i, [170, 196, 210]);
  }
  for (const [x, y] of [[3, 5], [4, 4], [5, 3], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3], [10, 11], [11, 10], [12, 9]]) t.set(x, y, [236, 246, 252], 190);
  void rng;
  return t;
}

function tallGrass(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [60, 120, 40], 0);
  for (let b = 0; b < 9; b++) {
    let x = 1 + Math.floor(rng() * 14);
    const h = 5 + Math.floor(rng() * 9);
    const lean = rng() < 0.5 ? -1 : 1;
    const base = shade([86, 150, 50], 0.85 + rng() * 0.3);
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      if (k > h * 0.55 && rng() < 0.35) x += lean;
      if (x < 0 || x > 15) break;
      t.set(x, y, k > h - 3 ? shade(base, 1.15) : base);
    }
  }
  return t;
}

function flower(rng: () => number, petal: RGB, dark: RGB, center: RGB, bell: boolean): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [0, 0, 0], 0);
  const stem: RGB = [70, 128, 44];
  for (let y = 8; y < 16; y++) t.set(7, y, stem);
  paint(t, ['ll.....', '.ll..ll', '.....l.'], { l: [84, 148, 52] }, 4, 10);
  if (!bell) {
    paint(t, [
      '..pPp..',
      '.pppppP',
      'pPpcpPp',
      'ppcCcpp',
      'Pppcppp',
      '.pPppp.',
      '..ppp..',
    ], { p: petal, P: dark, c: center, C: shade(center, 0.6) }, 4, 1);
  } else {
    paint(t, [
      '..ppp..',
      '.pPppP.',
      '.ppppp.',
      'pppcppp',
      'p.pcp.p',
      '...c...',
    ], { p: petal, P: dark, c: center }, 4, 3);
  }
  void rng;
  return t;
}

function bricks(rng: () => number): PixelTex {
  const t = new PixelTex();
  const mortar: RGB = [182, 172, 160];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    const tones = [0, 1].map(() => shade([150, 70, 56], 0.88 + rng() * 0.2));
    for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < 16; x++) {
      const bx = (x + 16 - off) % 16;
      if (y === row * 4 + 3 || bx === 7 || bx === 15) { t.set(x, y, shade(mortar, 1 + (rng() - 0.5) * 0.08)); continue; }
      const c = tones[bx < 8 ? 0 : 1];
      t.set(x, y, shade(c, (y === row * 4 ? 1.1 : 1) * (1 + (rng() - 0.5) * 0.1)));
    }
  }
  return t;
}

function stoneBricks(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let row = 0; row < 2; row++) {
    const off = row ? 4 : 0;
    for (let y = row * 8; y < row * 8 + 8; y++) for (let x = 0; x < 16; x++) {
      const bx = (x + 16 - off) % 16;
      const ly = y - row * 8, lx = bx % 8;
      let c: RGB = shade([124, 124, 124], 1 + (rng() - 0.5) * 0.08);
      if (ly === 7 || lx === 7) c = [78, 78, 78];
      else if (ly === 0 || lx === 0) c = [150, 150, 150];
      else if (ly === 6 || lx === 6) c = [104, 104, 104];
      t.set(x, y, c);
    }
  }
  return t;
}

function wool(rng: () => number): PixelTex {
  const t = noisy([232, 232, 230], rng, 0.03, 2, 0.06);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    t.set(x, y, [208, 208, 206]); t.set(x + 1, y, [214, 214, 212]); t.set(x, y + 1, [220, 220, 218]);
  }
  return t;
}

function torch(): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [0, 0, 0], 0);
  for (let y = 8; y < 16; y++) { t.set(7, y, [124, 88, 50]); t.set(8, y, [98, 70, 40]); }
  t.set(7, 6, [255, 244, 170]); t.set(8, 6, [255, 214, 90]);
  t.set(7, 7, [255, 190, 60]); t.set(8, 7, [240, 140, 30]);
  return t;
}

function sandstone(rng: () => number, kind: 'side' | 'top' | 'bottom'): PixelTex {
  const t = sand(rng);
  if (kind === 'side') {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let f = 1;
      if (y < 3) f = 1.04; else if (y === 3) f = 0.86; else if (y > 12) f = 0.9; else if (y === 8) f = 0.93;
      t.set(x, y, shade(t.get(x, y), f));
    }
  } else if (kind === 'top') {
    for (let i = 0; i < 16; i++) { t.set(i, 0, shade(t.get(i, 0), 0.9)); t.set(0, i, shade(t.get(0, i), 0.9)); }
  } else {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, shade(t.get(x, y), 0.92));
  }
  return t;
}

function snow(rng: () => number): PixelTex {
  const t = noisy([240, 246, 252], rng, 0.015, 4, 0.03);
  speckle(t, rng, 14, [220, 230, 244]);
  return t;
}

function smoothStone(rng: () => number, border: boolean): PixelTex {
  const t = noisy([132, 132, 132], rng, 0.025, 4, 0.05);
  if (border) for (let i = 0; i < 16; i++) {
    t.set(i, 0, [150, 150, 150]); t.set(0, i, [150, 150, 150]);
    t.set(i, 15, [96, 96, 96]); t.set(15, i, [96, 96, 96]);
  }
  return t;
}

function furnaceFront(rng: () => number, lit: boolean): PixelTex {
  const t = smoothStone(rng, true);
  for (let x = 3; x <= 12; x++) { t.set(x, 7, [92, 92, 92]); t.set(x, 14, [150, 150, 150]); }
  for (let y = 8; y <= 13; y++) for (let x = 4; x <= 11; x++) {
    let c: RGB = [28, 28, 28];
    if (lit) {
      const h = (13 - y) / 5;
      c = mix([255, 214, 90], [214, 70, 20], h + (rng() - 0.5) * 0.3);
      if (y < 10 && rng() < 0.4) c = [60, 30, 20];
    }
    if (x === 6 || x === 9) c = lit ? [80, 60, 50] : [58, 58, 58];
    t.set(x, y, c);
  }
  for (let x = 5; x <= 10; x++) t.set(x, 3, [70, 70, 70]);
  return t;
}

const CHEST_WOOD: RGB = [158, 108, 50];
function chest(rng: () => number, kind: 'front' | 'side' | 'top'): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = shade(CHEST_WOOD, 1 + (rng() - 0.5) * 0.08);
    if ((kind === 'top' && (x === 5 || x === 10)) || (kind !== 'top' && (y === 4 || y === 10))) c = shade(CHEST_WOOD, 0.82);
    if (x === 0 || y === 0 || x === 15 || y === 15) c = [74, 48, 22];
    t.set(x, y, c);
  }
  if (kind !== 'top') for (let x = 1; x < 15; x++) t.set(x, 6, [96, 62, 28]);
  if (kind === 'front') {
    paint(t, ['.oo.', 'omMo', 'oMMo', '.oo.'], { o: [50, 50, 56], m: [214, 214, 222], M: [170, 170, 180] }, 6, 5);
  }
  return t;
}

function lumen(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = (Math.abs(((x + 4) % 8) - 3.5) + Math.abs(((y + 4) % 8) - 3.5));
    let c: RGB = d < 2.2 ? [255, 244, 190] : d < 4.2 ? [244, 206, 110] : [206, 152, 60];
    c = shade(c, 1 + (rng() - 0.5) * 0.08);
    t.set(x, y, c);
  }
  return t;
}

// ------------------------------------------------------------------ 1.1 textures
function clear(t: PixelTex): PixelTex {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [0, 0, 0], 0);
  return t;
}

/** Oak door: vertical boards in a frame, two panels, a window in the upper half. */
function door(rng: () => number, upper: boolean): PixelTex {
  const t = new PixelTex();
  const boards: RGB[] = [[170, 134, 84], [160, 124, 76], [176, 140, 90], [164, 128, 80]];
  for (let x = 0; x < 16; x++) {
    const c = boards[Math.floor(x / 4) % 4];
    for (let y = 0; y < 16; y++) {
      let col = shade(c, 1 + (rng() - 0.5) * 0.07);
      if (x % 4 === 3) col = shade(c, 0.78);
      t.set(x, y, col);
    }
  }
  const frame: RGB = [118, 88, 52];
  for (let i = 0; i < 16; i++) { t.set(0, i, frame); t.set(15, i, frame); }
  if (upper) {
    for (let x = 0; x < 16; x++) t.set(x, 0, frame);
    // window: 2 x 2 panes with a mullion
    for (let y = 3; y <= 10; y++) for (let x = 3; x <= 12; x++) {
      const edge = y === 3 || y === 10 || x === 3 || x === 12 || x === 7 || x === 8 || y === 6 || y === 7;
      if (edge) t.set(x, y, frame);
      else t.set(x, y, [196, 222, 236], 0);
    }
    for (let x = 1; x < 15; x++) t.set(x, 14, frame);
  } else {
    for (let x = 0; x < 16; x++) t.set(x, 15, frame);
    for (let x = 1; x < 15; x++) { t.set(x, 1, frame); t.set(x, 8, frame); }
    // centred iron knob (symmetric, so the door reads correctly from either side)
    paint(t, ['.o.', 'oMo', '.o.'], { o: [58, 58, 64], M: [206, 206, 214] }, 6, 2);
    paint(t, ['.o.', 'oMo', '.o.'], { o: [58, 58, 64], M: [206, 206, 214] }, 7, 2);
  }
  return t;
}

const BLANKET: RGB = [46, 124, 132];
const SHEET: RGB = [236, 234, 226];
const BED_WOOD: RGB = [132, 98, 58];
function bedTop(rng: () => number, head: boolean): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = shade(BLANKET, 1 + (rng() - 0.5) * 0.06);
    if (x === 0 || x === 15) c = shade(BLANKET, 0.8);
    if ((x + y) % 5 === 0 && y % 2 === 0) c = shade(BLANKET, 1.14);
    t.set(x, y, c);
  }
  if (head) {
    // pillow at the head end (north edge in the canonical orientation)
    for (let y = 1; y <= 5; y++) for (let x = 2; x <= 13; x++) {
      let c = shade(SHEET, 1 + (rng() - 0.5) * 0.04);
      if (y === 5 || x === 2 || x === 13) c = shade(SHEET, 0.86);
      t.set(x, y, c);
    }
    for (let x = 0; x < 16; x++) { t.set(x, 7, shade(SHEET, 0.95)); t.set(x, 8, shade(BLANKET, 0.85)); }
  } else {
    for (let x = 0; x < 16; x++) t.set(x, 15, shade(BLANKET, 0.75));
  }
  return t;
}

/** Side of a bed half: rows 7..12 are the mattress side, rows 13..15 the frame and legs. */
function bedSide(rng: () => number, head: boolean, end: boolean): PixelTex {
  const t = clear(new PixelTex());
  for (let x = 0; x < 16; x++) {
    for (let y = 7; y <= 12; y++) {
      let c: RGB = y <= 9 ? BLANKET : SHEET;
      if (head && !end && y <= 9 && x < 6) c = SHEET;
      if (y === 7) c = shade(c, 1.1);
      t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.06));
    }
    for (let y = 13; y <= 15; y++) {
      const leg = x <= 2 || x >= 13;
      if (y === 13 || leg) t.set(x, y, shade(BED_WOOD, (leg ? 0.9 : 1) + (rng() - 0.5) * 0.08));
    }
  }
  return t;
}

function birchLogSide(rng: () => number): PixelTex {
  const t = noisy([222, 220, 208], rng, 0.03, 4, 0.05);
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16), len = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < len; i++) t.set(x + i, y, [44, 42, 40]);
    if (rng() < 0.5) t.set(x + 1, y + 1, [70, 66, 62]);
  }
  return t;
}

function logTopTinted(rng: () => number, bark: RGB, ringA: RGB, ringB: RGB): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 8);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb >= 7) { t.set(x, y, shade(bark, 1 + (rng() - 0.5) * 0.12)); continue; }
    const d = Math.sqrt(dx * dx + dy * dy) * 0.55 + cheb * 0.45 + n[y * 16 + x] * 0.8;
    t.set(x, y, shade(Math.floor(d * 0.9) % 2 ? ringA : ringB, 1 + (rng() - 0.5) * 0.05));
  }
  return t;
}

function spruceLogSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  const tones: RGB[] = [[74, 52, 32], [62, 44, 26], [84, 60, 38]];
  for (let x = 0; x < TEX; x++) {
    const c = tones[Math.floor(rng() * tones.length)];
    for (let y = 0; y < TEX; y++) t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.12));
  }
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(rng() * 16);
    let y = Math.floor(rng() * 16);
    for (let i = 0; i < 6; i++) t.set(x, y++, [40, 28, 16]);
  }
  return t;
}

function tintedLeaves(rng: () => number, cols: [RGB, RGB, RGB], holes: number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const v = n[y * 16 + x];
    if (rng() < holes + (v < 0.3 ? 0.15 : 0)) { t.set(x, y, cols[2], 0); continue; }
    const base = v > 0.62 ? cols[0] : v > 0.4 ? cols[1] : cols[2];
    t.set(x, y, shade(base, 1 + (rng() - 0.5) * 0.18));
  }
  return t;
}

function spruceNeedles(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  const cols: RGB[] = [[46, 86, 62], [36, 70, 52], [58, 102, 74]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if ((x + y * 3) % 5 === 0 && rng() < 0.7) continue;
    if (rng() < 0.12) continue;
    t.set(x, y, shade(cols[(x * 7 + y * 3) % 3], 1 + (rng() - 0.5) * 0.2));
  }
  return t;
}

function terracotta(rng: () => number, base: RGB): PixelTex {
  const t = noisy(base, rng, 0.025, 4, 0.05);
  speckle(t, rng, 10, shade(base, 0.9));
  speckle(t, rng, 6, shade(base, 1.08));
  return t;
}

const CACTUS: RGB = [74, 128, 52];
function cactus(rng: () => number, kind: 'side' | 'top' | 'bottom'): PixelTex {
  const t = clear(new PixelTex());
  if (kind === 'side') {
    for (let y = 0; y < 16; y++) for (let x = 1; x < 15; x++) {
      const ridge = x % 3 === 1;
      let c = shade(CACTUS, (ridge ? 0.82 : 1) + (rng() - 0.5) * 0.08);
      if (x === 1 || x === 14) c = shade(CACTUS, 0.7);
      t.set(x, y, c);
    }
    for (let k = 0; k < 12; k++) {
      const x = 2 + 3 * Math.floor(rng() * 4), y = Math.floor(rng() * 16);
      t.set(x, y, [236, 232, 190]);
    }
  } else {
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c = shade(CACTUS, kind === 'top' ? 1.05 : 0.85);
      if (d > 6) c = shade(CACTUS, 0.72);
      else if (Math.round(d) === 3) c = shade(CACTUS, 0.9);
      t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.06));
    }
    if (kind === 'top') for (const [x, y] of [[7, 7], [8, 8], [7, 8], [8, 7]]) t.set(x, y, [200, 214, 150]);
  }
  return t;
}

function deadBush(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  const twig: RGB = [122, 84, 44], dark: RGB = [92, 60, 30];
  const grow = (x: number, y: number, dx: number, len: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      t.set(Math.round(x), y, i % 3 === 0 ? dark : twig);
      y--; x += dx * (0.4 + rng() * 0.4);
      if (depth > 0 && rng() < 0.25) grow(x, y, -dx, Math.max(2, len - i - 2), depth - 1);
      if (y < 1 || x < 0 || x > 15) break;
    }
  };
  for (const dx of [-1, -0.4, 0.3, 1]) grow(7.5, 15, dx, 7 + Math.floor(rng() * 5), 2);
  return t;
}

function runeOre(rng: () => number): PixelTex {
  const t = stone(rng);
  const pal: RGB[] = [[150, 96, 236], [196, 150, 255], [98, 60, 186], [120, 220, 255]];
  for (let c = 0; c < 4; c++) {
    const cx = 2 + Math.floor(rng() * 12), cy = 2 + Math.floor(rng() * 12);
    paint(t, ['.a.', 'abA', '.A.'], { a: pal[0], b: pal[1], A: pal[2] }, cx - 1, cy - 1);
    if (rng() < 0.6) t.set(cx + 1, cy - 1, pal[3]);
  }
  return t;
}

const SLATE: RGB = [52, 48, 64];
function runeTable(rng: () => number, kind: 'top' | 'side' | 'bottom'): PixelTex {
  const t = noisy(SLATE, rng, 0.05, 4, 0.08);
  const glow: RGB = [176, 126, 255], glow2: RGB = [126, 224, 255];
  if (kind === 'top') {
    for (let i = 0; i < 16; i++) { t.set(i, 0, [34, 30, 44]); t.set(i, 15, [34, 30, 44]); t.set(0, i, [34, 30, 44]); t.set(15, i, [34, 30, 44]); }
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      t.set(Math.round(7.5 + Math.cos(ang) * 5), Math.round(7.5 + Math.sin(ang) * 5), glow);
    }
    paint(t, ['..b..', '.b.b.', 'b.c.b', '.b.b.', '..b..'], { b: glow, c: glow2 }, 5, 5);
  } else if (kind === 'side') {
    // the model is 12/16 high: rows 4..15 are visible
    for (let x = 0; x < 16; x++) { t.set(x, 4, [96, 84, 120]); t.set(x, 5, [34, 30, 44]); t.set(x, 15, [34, 30, 44]); }
    const glyphs = ['b.b', '.b.', 'bbb'];
    for (let g = 0; g < 4; g++) paint(t, [glyphs[g % 3], glyphs[(g + 1) % 3], glyphs[(g + 2) % 3]], { b: g % 2 ? glow : glow2 }, 1 + g * 4, 8);
  } else {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, shade(t.get(x, y), 0.8));
  }
  return t;
}

// ---------------------------------------------------------------- 1.2: farming & villages
function farmland(rng: () => number, moist: boolean): PixelTex {
  const base: RGB = moist ? [92, 60, 36] : [134, 98, 64];
  const t = noisy(base, rng, 0.04, 4, 0.08);
  // furrows: a dark groove every 4 rows, lit ridge above it
  for (let y = 0; y < 16; y++) {
    const k = y % 4;
    for (let x = 0; x < 16; x++) {
      if (k === 3) t.set(x, y, shade(base, 0.62 + (rng() - 0.5) * 0.08));
      else if (k === 0) t.set(x, y, shade(base, 1.14 + (rng() - 0.5) * 0.06));
    }
  }
  speckle(t, rng, 8, shade(base, moist ? 0.8 : 0.85));
  return t;
}

/** Wheat: sprouts that grow taller and turn from green to gold, with ears at the last stage. */
function wheat(rng: () => number, stage: number): PixelTex {
  const t = clear(new PixelTex());
  const f = stage / 7;
  const stem = mix([74, 150, 46], [196, 164, 64], Math.max(0, f - 0.35) / 0.65);
  const tip = mix([110, 186, 70], [226, 196, 92], Math.max(0, f - 0.3) / 0.7);
  const h = 2 + Math.round(f * 12);
  for (const x0 of [1, 3, 5, 7, 9, 11, 13, 14]) {
    let x = x0;
    const hh = Math.max(1, h - Math.floor(rng() * 3));
    for (let k = 0; k < hh; k++) {
      const y = 15 - k;
      if (k > 3 && rng() < 0.15) x += rng() < 0.5 ? -1 : 1;
      if (x < 0 || x > 15) break;
      t.set(x, y, k >= hh - 2 ? tip : shade(stem, 0.9 + rng() * 0.2));
    }
    if (stage === 7) {
      // ears of grain along the top of each stalk
      for (let k = hh - 4; k < hh; k++) {
        const y = 15 - k;
        t.set(x, y, shade([216, 180, 78], 0.9 + rng() * 0.2));
        if (x + 1 <= 15 && k % 2 === 0) t.set(x + 1, y, [182, 146, 58]);
      }
    }
  }
  return t;
}

function carrots(rng: () => number, stage: number): PixelTex {
  const t = clear(new PixelTex());
  const leaf: RGB = [66, 140, 52], leaf2: RGB = [92, 170, 70];
  const h = 3 + stage * 3;
  for (const x0 of [2, 6, 10, 13]) {
    for (let k = 0; k < h; k++) {
      const y = 15 - k - (stage === 3 ? 2 : 0);
      const spread = Math.floor(k / 3);
      t.set(x0, y, leaf);
      if (spread > 0 && k % 2 === 0) { t.set(x0 - spread, y, leaf2); if (x0 + spread <= 15) t.set(x0 + spread, y, leaf2); }
    }
    if (stage === 3) {
      t.set(x0, 15, [214, 110, 30]); t.set(x0, 14, [236, 130, 40]);
      if (x0 + 1 <= 15) t.set(x0 + 1, 15, [190, 94, 26]);
    }
  }
  void rng;
  return t;
}

const PATH: RGB = [154, 126, 84];
function pathTop(rng: () => number): PixelTex {
  const t = noisy(PATH, rng, 0.05, 2, 0.08);
  speckle(t, rng, 18, [128, 104, 70]);
  speckle(t, rng, 10, [176, 150, 108]);
  speckle(t, rng, 6, [120, 116, 110]);
  return t;
}

function hay(rng: () => number, top: boolean): PixelTex {
  const straw: RGB = [202, 168, 64];
  const t = new PixelTex();
  if (top) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const ring = Math.floor(d * 1.3) % 2;
      t.set(x, y, shade(straw, (ring ? 0.88 : 1.02) + (rng() - 0.5) * 0.14));
    }
  } else {
    for (let x = 0; x < 16; x++) {
      const c = shade(straw, 0.85 + rng() * 0.25);
      for (let y = 0; y < 16; y++) t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.1));
    }
    for (const by of [3, 12]) for (let x = 0; x < 16; x++) { t.set(x, by, [150, 64, 40]); t.set(x, by + 1, [118, 46, 30]); }
  }
  return t;
}

function grainBin(rng: () => number, top: boolean): PixelTex {
  const t = planks(rng);
  if (top) {
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
      const grain = rng() < 0.5 ? [214, 180, 86] as RGB : [186, 150, 66] as RGB;
      t.set(x, y, shade(grain, 0.9 + rng() * 0.2));
    }
    for (let i = 1; i < 15; i++) { t.set(i, 1, [96, 70, 40]); t.set(i, 14, [96, 70, 40]); t.set(1, i, [96, 70, 40]); t.set(14, i, [96, 70, 40]); }
  } else {
    for (const hy of [2, 9]) for (let x = 0; x < 16; x++) { t.set(x, hy, [90, 90, 96]); t.set(x, hy + 1, [62, 62, 68]); }
    paint(t, ['.ww.', 'wWWw', 'wWWw', '.ww.'], { w: [214, 180, 86], W: [236, 206, 116] }, 6, 5);
  }
  return t;
}

function forge(rng: () => number, top: boolean): PixelTex {
  const t = cobble(rng, [[92, 90, 90], [104, 100, 98], [80, 78, 78], [112, 108, 104]], [52, 50, 50]);
  if (top) {
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
      const edge = x === 4 || x === 11 || y === 4 || y === 11;
      t.set(x, y, edge ? [40, 38, 38] : mix([255, 196, 80], [196, 60, 20], rng()));
    }
  } else {
    for (let y = 9; y < 15; y++) for (let x = 3; x < 13; x++) {
      let c: RGB = mix([255, 206, 96], [206, 70, 24], (14 - y) / 5 + (rng() - 0.5) * 0.3);
      if (x === 3 || x === 12 || y === 9) c = [44, 40, 40];
      else if (x % 3 === 0) c = [70, 50, 44];
      t.set(x, y, c);
    }
    for (let x = 2; x < 14; x++) t.set(x, 8, [150, 146, 140]);
  }
  return t;
}

function masonBench(rng: () => number, top: boolean): PixelTex {
  if (top) {
    const t = smoothStone(rng, true);
    // a steel blade across the middle and a chisel
    for (let x = 2; x < 14; x++) { t.set(x, 7, [196, 200, 208]); t.set(x, 8, [150, 154, 162]); }
    for (let x = 3; x < 13; x += 2) t.set(x, 6, [214, 218, 226]);
    paint(t, ['hhhhmm', 'hhhhmm'], { h: [120, 84, 48], m: [180, 184, 190] }, 4, 12);
    return t;
  }
  const t = stoneBricks(rng);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) t.set(x, y, shade(PLANK[y % 4], 0.95 + rng() * 0.1));
  for (let x = 0; x < 16; x++) t.set(x, 3, [112, 86, 52]);
  return t;
}

function scribeDesk(rng: () => number, top: boolean): PixelTex {
  const t = planks(rng);
  if (top) {
    // an open book and an ink pot with a quill
    paint(t, [
      'oooooooooo', 'oWWWWoWWWW', 'oWggWoWggW', 'oWWWWoWWWW', 'oWggWoWggW', 'oWWWWoWWWW', 'oooooooooo',
    ], { o: [70, 40, 24], W: [236, 230, 210], g: [120, 110, 100] }, 1, 3);
    paint(t, ['.kk.', 'kKKk', 'kKKk', '.kk.'], { k: [30, 30, 40], K: [60, 70, 140] }, 11, 10);
    paint(t, ['f..', '.f.', '..f'], { f: [240, 240, 240] }, 12, 7);
    return t;
  }
  // shelf of coloured book spines under the desk top
  for (let x = 0; x < 16; x++) { t.set(x, 0, [96, 70, 40]); t.set(x, 3, [96, 70, 40]); t.set(x, 15, [96, 70, 40]); }
  const spines: RGB[] = [[140, 40, 40], [40, 90, 150], [60, 120, 60], [150, 120, 40], [100, 60, 130]];
  for (let x = 1; x < 15; x++) {
    const c = spines[Math.floor(rng() * spines.length)];
    const h = 5 + Math.floor(rng() * 3);
    for (let y = 14; y > 14 - h; y--) t.set(x, y, shade(c, x % 2 ? 1 : 0.85));
  }
  return t;
}

function fletchBench(rng: () => number, top: boolean): PixelTex {
  const t = noisy([196, 176, 128], rng, 0.04, 4, 0.06);
  for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) t.set(x, y, [150, 126, 84]);
  if (top) {
    // two crossed arrows with white fletching
    for (let i = 2; i < 14; i++) { t.set(i, i, [110, 80, 46]); t.set(15 - i, i, [110, 80, 46]); }
    paint(t, ['ss.', 'sS.', '...'], { s: [200, 204, 210], S: [150, 154, 160] }, 1, 1);
    paint(t, ['.ss', '.Ss', '...'], { s: [200, 204, 210], S: [150, 154, 160] }, 12, 1);
    paint(t, ['ww', 'wW'], { w: [250, 250, 250], W: [210, 210, 214] }, 12, 12);
    paint(t, ['ww', 'Ww'], { w: [250, 250, 250], W: [210, 210, 214] }, 2, 12);
  } else {
    paint(t, ['.kk.', 'kKKk', '.kk.'], { k: [40, 40, 44], K: [80, 80, 88] }, 3, 6);
    paint(t, ['.kk.', 'kKKk', '.kk.'], { k: [40, 40, 44], K: [80, 80, 88] }, 9, 10);
  }
  return t;
}

// ------------------------------------------------------------------ 1.4 textures (decoration)
/** Ladder: two side rails with pegged rungs, transparent in between. */
function ladder(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  const rail: RGB = [138, 102, 60], railD: RGB = [104, 74, 42], rung: RGB = [162, 124, 76], peg: RGB = [70, 50, 28];
  for (let y = 0; y < 16; y++) {
    for (const x of [2, 13]) { t.set(x, y, shade(rail, 1 + (rng() - 0.5) * 0.1)); t.set(x + (x === 2 ? 1 : -1), y, shade(railD, 1 + (rng() - 0.5) * 0.1)); }
  }
  for (const y of [1, 5, 9, 13]) {
    for (let x = 4; x <= 11; x++) { t.set(x, y, shade(rung, 1 + (rng() - 0.5) * 0.12)); t.set(x, y + 1, shade(railD, 0.95)); }
    t.set(3, y, peg); t.set(12, y, peg);
  }
  return t;
}

/** Trapdoor: framed boards with a diagonal brace and two open slots. */
function trapdoor(rng: () => number): PixelTex {
  const t = new PixelTex();
  const boards: RGB[] = [[164, 128, 80], [154, 118, 72], [170, 134, 86]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = shade(boards[Math.floor(x / 5) % 3], 1 + (rng() - 0.5) * 0.07);
    if (x % 5 === 4) c = shade(c, 0.8);
    t.set(x, y, c);
  }
  const frame: RGB = [112, 82, 48];
  for (let i = 0; i < 16; i++) { t.set(i, 0, frame); t.set(i, 15, frame); t.set(0, i, frame); t.set(15, i, frame); t.set(i, 1, shade(frame, 1.15)); t.set(i, 14, shade(frame, 0.9)); }
  for (let i = 2; i < 14; i++) t.set(i, 15 - i, shade(frame, 1.05));   // brace
  for (const [sx, sy] of [[3, 3], [9, 9]]) for (let y = sy; y < sy + 3; y++) for (let x = sx; x < sx + 4; x++) t.set(x, y, [0, 0, 0], 0);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) t.set(x, y, [70, 70, 76]);
  return t;
}

function paneEdge(rng: () => number): PixelTex {
  const t = noisy([184, 210, 222], rng, 0.02, 4, 0.04);
  for (let y = 0; y < 16; y++) { t.set(7, y, [206, 226, 236]); t.set(8, y, [160, 188, 202]); }
  return t;
}

/** Skybell: an arching stem with three small nodding blue bells. */
function skybell(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  const stem: RGB = [70, 128, 44], leaf: RGB = [88, 150, 54];
  paint(t, [
    '......sss.....',
    '.....s...s....',
    '....s.....s...',
    '....s......s..',
    '...s.......s..',
    '...s..........',
    '...s..........',
    '....s.........',
    '....s.........',
    '....s.........',
    '.l..s..l......',
    '..l.s.l.......',
    '...ls.........',
    '....s.........',
  ], { s: stem, l: leaf }, 2, 2);
  const pal: Record<string, RGB> = { b: [86, 128, 226], B: [52, 82, 176], w: [226, 236, 252] };
  paint(t, ['.b.', 'bbb', 'BwB'], pal, 12, 5);
  paint(t, ['.b.', 'bbb', 'BwB'], pal, 3, 7);
  paint(t, ['bb', 'BB'], pal, 9, 3);
  void rng;
  return t;
}

/** Moon Daisy: eight white petals around a gold centre. */
function moonDaisy(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  for (let y = 9; y < 16; y++) t.set(7, y, [70, 128, 44]);
  paint(t, ['l....l', '.l..l.', '..ll..'], { l: [84, 148, 52] }, 5, 11);
  paint(t, [
    '...w.w...',
    '.w.wWw.w.',
    '..wWwWw..',
    'wwWcCcWww',
    '..wCccw..',
    'wwWcccWww',
    '..wWwWw..',
    '.w.wWw.w.',
    '...w.w...',
  ], { w: [244, 244, 238], W: [214, 214, 206], c: [236, 186, 52], C: [196, 136, 30] }, 3, 1);
  void rng;
  return t;
}

const BRASS: RGB = [164, 120, 56], BRASS_L: RGB = [212, 166, 88], BRASS_D: RGB = [102, 70, 30];
/** Lantern body seen from the side; `r0` is the texture row of the top of the body (the cap sits above). */
function lanternSide(rng: () => number, r0: number): PixelTex {
  const t = clear(new PixelTex());
  // cap (4 wide) and its handle loop
  for (let x = 6; x <= 9; x++) { t.set(x, r0 - 2, BRASS_D); t.set(x, r0 - 1, x === 6 ? BRASS_D : BRASS); }
  // rims
  for (let x = 5; x <= 10; x++) { t.set(x, r0, x === 5 || x === 10 ? BRASS_D : BRASS_L); t.set(x, r0 + 6, BRASS_D); }
  // glowing panes between two posts
  const glow: RGB[] = [[255, 206, 110], [255, 226, 150], [255, 244, 200]];
  for (let y = r0 + 1; y <= r0 + 5; y++) {
    t.set(5, y, BRASS_D); t.set(10, y, BRASS);
    for (let x = 6; x <= 9; x++) {
      const core = (x === 7 || x === 8) && y >= r0 + 2 && y <= r0 + 4;
      t.set(x, y, core ? (y === r0 + 3 ? glow[2] : glow[1]) : shade(glow[0], 0.96 + rng() * 0.08));
    }
  }
  return t;
}
function lanternTop(rng: () => number): PixelTex {
  const t = clear(new PixelTex());
  for (let z = 5; z <= 10; z++) for (let x = 5; x <= 10; x++) {
    const edge = x === 5 || x === 10 || z === 5 || z === 10;
    t.set(x, z, edge ? BRASS_D : shade(BRASS, 0.95 + rng() * 0.1));
  }
  for (let z = 6; z <= 9; z++) for (let x = 6; x <= 9; x++) t.set(x, z, (x === 6 || z === 6) ? BRASS_L : BRASS);
  t.set(7, 7, BRASS_D); t.set(8, 8, BRASS_D);
  return t;
}
function chain(): PixelTex {
  const t = clear(new PixelTex());
  const a: RGB = [92, 92, 100], b: RGB = [150, 150, 160], c: RGB = [60, 60, 68];
  for (let y = 0; y < 16; y++) {
    const link = (y >> 1) & 1;
    t.set(7, y, link ? b : c); t.set(8, y, link ? a : b);
  }
  return t;
}

const POT: RGB = [158, 84, 56];
function flowerPot(rng: () => number, top: boolean): PixelTex {
  const t = clear(new PixelTex());
  if (top) {
    for (let z = 5; z <= 10; z++) for (let x = 5; x <= 10; x++) {
      const rim = x === 5 || x === 10 || z === 5 || z === 10;
      t.set(x, z, rim ? shade(POT, 1.18) : shade([72, 50, 32], 0.9 + rng() * 0.25));
    }
    return t;
  }
  for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = shade(POT, 0.94 + rng() * 0.1);
    if (y === 10) c = shade(POT, 1.2);
    else if (y === 11) c = shade(POT, 0.78);
    else if (y === 15) c = shade(POT, 0.86);
    t.set(x, y, c);
  }
  // a small painted band
  for (let x = 0; x < 16; x += 2) t.set(x, 13, [214, 168, 96]);
  return t;
}

function dyedWool(rng: () => number, base: RGB): PixelTex {
  const t = noisy(base, rng, 0.03, 2, 0.06);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    t.set(x, y, shade(base, 0.88)); t.set(x + 1, y, shade(base, 0.92)); t.set(x, y + 1, shade(base, 0.95));
  }
  return t;
}

function missing(): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, ((x >> 3) ^ (y >> 3)) & 1 ? [250, 0, 220] : [0, 0, 0]);
  return t;
}

/** Progressive crack overlays: each stage contains all cracks of the previous one. */
function destroyStages(): PixelTex[] {
  const rng = mulberry32(4242);
  const pixels: [number, number][] = [];
  const seen = new Set<number>();
  const push = (x: number, y: number) => {
    x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
    if (!seen.has(y * 16 + x)) { seen.add(y * 16 + x); pixels.push([x, y]); }
  };
  // cracks grow from the centre outwards
  const arms = 7;
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2 + rng() * 0.6;
    let x = 7.5, y = 7.5;
    for (let s = 0; s < 11; s++) {
      x += Math.cos(ang + (rng() - 0.5) * 1.3) * 0.9;
      y += Math.sin(ang + (rng() - 0.5) * 1.3) * 0.9;
      push(Math.round(x), Math.round(y));
      if (rng() < 0.25) push(Math.round(x) + (rng() < 0.5 ? 1 : -1), Math.round(y));
    }
  }
  // order pixels by distance from the centre so stages grow outward
  pixels.sort((p, q) => Math.hypot(p[0] - 7.5, p[1] - 7.5) - Math.hypot(q[0] - 7.5, q[1] - 7.5));
  const out: PixelTex[] = [];
  for (let s = 0; s < DESTROY_STAGES; s++) {
    const t = new PixelTex();
    const n = Math.round(pixels.length * (s + 1) / DESTROY_STAGES);
    for (let i = 0; i < n; i++) t.set(pixels[i][0], pixels[i][1], [20, 20, 20], 200);
    out.push(t);
  }
  return out;
}

export function generateBlockTextures(): Map<string, PixelTex> {
  const m = new Map<string, PixelTex>();
  const R = (name: string) => mulberry32(seedOf(name));
  const dirtTex = dirt(R('dirt'));
  m.set('missing', missing());
  m.set('grass_top', grassTop(R('grass_top')));
  m.set('grass_side', fringe(dirtTex, R('grass_side'), GRASS, [80, 136, 46]));
  m.set('grass_side_snow', fringe(dirtTex, R('grass_side_snow'), [238, 244, 250], [210, 222, 234]));
  m.set('dirt', dirtTex);
  m.set('stone', stone(R('stone')));
  m.set('sand', sand(R('sand')));
  m.set('gravel', gravel(R('gravel')));
  m.set('log_side', logSide(R('log_side')));
  m.set('log_top', logTop(R('log_top')));
  m.set('leaves', leaves(R('leaves')));
  m.set('coal_ore', ore(R('coal_ore'), [[36, 36, 36], [54, 54, 54], [26, 26, 26]], 5));
  m.set('iron_ore', ore(R('iron_ore'), [[222, 180, 146], [196, 146, 110], [168, 118, 88]], 5));
  m.set('planks', planks(R('planks')));
  m.set('cobblestone', cobble(R('cobblestone'), COBBLE_TONES, [84, 84, 84]));
  const mossy = cobble(R('cobblestone'), COBBLE_TONES, [84, 84, 84]);
  {
    const rng = R('moss');
    const n = tileNoise(rng, 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (n[y * 16 + x] > 0.55 && rng() < 0.85) mossy.set(x, y, shade([82, 118, 50], 0.85 + rng() * 0.3));
    }
  }
  m.set('mossy_cobblestone', mossy);
  m.set('bedrock', bedrock(R('bedrock')));
  m.set('crafting_table_top', craftingTop(R('ct_top')));
  m.set('crafting_table_side', craftingSide(R('ct_side'), false));
  m.set('crafting_table_front', craftingSide(R('ct_front'), true));
  m.set('glass', glass(R('glass')));
  m.set('tall_grass', tallGrass(R('tall_grass')));
  m.set('flower_red', flower(R('fr'), [206, 44, 40], [150, 24, 24], [250, 210, 70], false));
  m.set('flower_yellow', flower(R('fy'), [246, 212, 54], [206, 164, 30], [230, 120, 30], true));
  m.set('bricks', bricks(R('bricks')));
  m.set('stone_bricks', stoneBricks(R('stone_bricks')));
  m.set('wool', wool(R('wool')));
  m.set('torch', torch());
  m.set('sandstone_side', sandstone(R('ss'), 'side'));
  m.set('sandstone_top', sandstone(R('ss_t'), 'top'));
  m.set('sandstone_bottom', sandstone(R('ss_b'), 'bottom'));
  m.set('snow', snow(R('snow')));
  m.set('furnace_front', furnaceFront(R('ff'), false));
  m.set('furnace_front_lit', furnaceFront(R('ff'), true));
  m.set('furnace_side', smoothStone(R('fs'), true));
  m.set('furnace_top', smoothStone(R('ft'), false));
  m.set('chest_front', chest(R('cf'), 'front'));
  m.set('chest_side', chest(R('cs'), 'side'));
  m.set('chest_top', chest(R('ct'), 'top'));
  m.set('lumen', lumen(R('lumen')));
  m.set('door_lower', door(R('door'), false));
  m.set('door_upper', door(R('door'), true));
  m.set('bed_top_head', bedTop(R('bed_th'), true));
  m.set('bed_top_foot', bedTop(R('bed_tf'), false));
  m.set('bed_side_head', bedSide(R('bed_sh'), true, false));
  m.set('bed_side_foot', bedSide(R('bed_sf'), false, false));
  m.set('bed_end_head', bedSide(R('bed_eh'), true, true));
  m.set('bed_end_foot', bedSide(R('bed_ef'), false, true));
  m.set('birch_log_side', birchLogSide(R('birch_side')));
  m.set('birch_log_top', logTopTinted(R('birch_top'), [214, 212, 200], [214, 190, 140], [228, 206, 158]));
  m.set('birch_leaves', tintedLeaves(R('birch_leaves'), [[128, 170, 72], [104, 150, 58], [86, 128, 48]], 0.2));
  m.set('spruce_log_side', spruceLogSide(R('spruce_side')));
  m.set('spruce_log_top', logTopTinted(R('spruce_top'), [70, 50, 30], [126, 92, 56], [142, 106, 66]));
  m.set('spruce_leaves', spruceNeedles(R('spruce_leaves')));
  {
    const rs = noisy([196, 102, 42], R('red_sand'), 0.035, 4, 0.05);
    speckle(rs, R('red_sand2'), 24, [170, 84, 32]);
    speckle(rs, R('red_sand3'), 14, [216, 128, 62]);
    m.set('red_sand', rs);
  }
  m.set('terracotta', terracotta(R('tc'), [150, 92, 66]));
  m.set('terracotta_orange', terracotta(R('tc_o'), [162, 84, 38]));
  m.set('terracotta_yellow', terracotta(R('tc_y'), [186, 134, 52]));
  m.set('terracotta_brown', terracotta(R('tc_b'), [90, 60, 42]));
  m.set('terracotta_white', terracotta(R('tc_w'), [208, 178, 160]));
  m.set('cactus_side', cactus(R('cactus_s'), 'side'));
  m.set('cactus_top', cactus(R('cactus_t'), 'top'));
  m.set('cactus_bottom', cactus(R('cactus_b'), 'bottom'));
  m.set('dead_bush', deadBush(R('dead_bush')));
  m.set('rune_ore', runeOre(R('rune_ore')));
  m.set('rune_table_top', runeTable(R('rt_t'), 'top'));
  m.set('rune_table_side', runeTable(R('rt_s'), 'side'));
  m.set('rune_table_bottom', runeTable(R('rt_b'), 'bottom'));
  m.set('farmland_dry', farmland(R('farmland'), false));
  m.set('farmland_moist', farmland(R('farmland'), true));
  for (let s = 0; s < 8; s++) m.set(`wheat_${s}`, wheat(R('wheat'), s));
  for (let s = 0; s < 4; s++) m.set(`carrots_${s}`, carrots(R('carrots'), s));
  m.set('path_top', pathTop(R('path_top')));
  m.set('path_side', fringe(dirtTex, R('path_side'), PATH, shade(PATH, 0.8)));
  m.set('hay_top', hay(R('hay_t'), true));
  m.set('hay_side', hay(R('hay_s'), false));
  m.set('grain_bin_top', grainBin(R('gb_t'), true));
  m.set('grain_bin_side', grainBin(R('gb_s'), false));
  m.set('forge_top', forge(R('forge_t'), true));
  m.set('forge_side', forge(R('forge_s'), false));
  m.set('mason_top', masonBench(R('mason_t'), true));
  m.set('mason_side', masonBench(R('mason_s'), false));
  m.set('scribe_top', scribeDesk(R('scribe_t'), true));
  m.set('scribe_side', scribeDesk(R('scribe_s'), false));
  m.set('fletch_top', fletchBench(R('fletch_t'), true));
  m.set('fletch_side', fletchBench(R('fletch_s'), false));
  m.set('ladder', ladder(R('ladder')));
  m.set('trapdoor', trapdoor(R('trapdoor')));
  m.set('glass_pane_edge', paneEdge(R('pane_edge')));
  m.set('flower_blue', skybell(R('skybell')));
  m.set('flower_white', moonDaisy(R('moon_daisy')));
  m.set('lantern_side', lanternSide(R('lantern'), 9));
  m.set('lantern_hang_side', lanternSide(R('lantern'), 7));
  m.set('lantern_top', lanternTop(R('lantern_top')));
  m.set('chain', chain());
  m.set('flower_pot', flowerPot(R('pot'), false));
  m.set('flower_pot_top', flowerPot(R('pot_top'), true));
  for (const c of DYE_COLORS) if (c !== 'white') m.set(`wool_${c}`, dyedWool(R('wool_' + c), DYE_RGB[c]));
  for (let f = 0; f < WATER_FRAMES; f++) m.set(`water_${f}`, water(f));
  for (let f = 0; f < LAVA_FRAMES; f++) m.set(`lava_${f}`, lava(f));
  m.set('cinderstone', cinderstone(R('cinderstone')));
  m.set('spawner', spawnerCage(R('spawner')));
  m.set('bell', bellBronze(R('bell')));
  m.set('bell_mount', bellMount(R('bell_mount')));
  m.set('map_table_top', mapTable(R('map_t'), true));
  m.set('map_table_side', mapTable(R('map_s'), false));
  destroyStages().forEach((t, i) => m.set(`destroy_${i}`, t));
  for (const n of TEXTURE_NAMES) if (!m.has(n)) m.set(n, missing());
  return m;
}
