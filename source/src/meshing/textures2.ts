import { mulberry32 } from '../core/rng';
import { DYE_COLORS, DYE_RGB } from '../world/dyes';
import { PixelTex, TEX, noisy, seedOf, shade, speckle, tileNoise, mix } from './textures';
import type { RGB } from './textures';

/**
 * 2.16: stage 2 of the texture update. Richer pixel art for the everyday blocks and scenery:
 * every tile gets a light direction (top-left), a shadow side (bottom-right), and more than
 * one tone, so blocks read as chunky objects instead of flat noise. All original, all procedural.
 * These replace the painters in textures.ts by name (names and layer order are unchanged).
 */
type Rng = () => number;
const ri = (rng: Rng, n: number) => Math.floor(rng() * n);
const jit = (c: RGB, rng: Rng, a: number): RGB => shade(c, 1 + (rng() - 0.5) * a * 2);
const hi = (t: PixelTex, x: number, y: number, f: number) => t.set(x, y, shade(t.get(x, y), f));
function blank(): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [0, 0, 0], 0);
  return t;
}

/** A small chunk: light top-left pixel, shadow bottom-right pixel. */
function chunk(t: PixelTex, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) t.set(x + dx, y + dy, c);
  t.set(x, y, shade(c, 1.22));
  t.set(x + w - 1, y + h - 1, shade(c, 0.72));
}

function stone2(rng: Rng): PixelTex {
  const t = noisy([128, 128, 130], rng, 0.025, 4, 0.07);
  // faint strata: every few rows the tone shifts a little
  for (let y = 0; y < TEX; y++) {
    const f = [1, 1.02, 0.99, 1.03, 0.98][y % 5];
    for (let x = 0; x < TEX; x++) hi(t, x, y, f);
  }
  // meandering cracks with a light lip under them
  for (let i = 0; i < 4; i++) {
    let x = ri(rng, 16), y = ri(rng, 15);
    const len = 4 + ri(rng, 4);
    for (let k = 0; k < len; k++) {
      t.set(x, y, shade(t.get(x, y), 0.7));
      hi(t, x + 1, y + 1, 1.1);
      if (rng() < 0.55) x++; else y++;
    }
  }
  for (let i = 0; i < 7; i++) chunk(t, ri(rng, 15), ri(rng, 15), 2, 1, jit([142, 142, 146], rng, 0.05));
  speckle(t, rng, 8, [100, 100, 104]);
  return t;
}

function cobble2(rng: Rng, tones: RGB[], mortar: RGB): PixelTex {
  const t = new PixelTex();
  const pts = Array.from({ length: 10 }, () => [rng() * 16, rng() * 16, ri(rng, tones.length)]);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let d1 = 99, d2 = 99, best = 0, bx = 0, by = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
        const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = i; bx = dx; by = dy; } else if (d < d2) d2 = d;
      }
    }
    const e = d2 - d1;
    if (e < 1.0) { t.set(x, y, jit(shade(mortar, 0.9), rng, 0.08)); continue; }
    let c = tones[pts[best][2]];
    if (e < 2.0) c = shade(c, bx + by < 0 ? 1.14 : 0.8);
    else c = shade(c, 1.03 - d1 * 0.012);
    t.set(x, y, jit(c, rng, 0.05));
  }
  return t;
}

function dirt2(rng: Rng): PixelTex {
  const t = noisy([134, 96, 66], rng, 0.035, 4, 0.09);
  for (let i = 0; i < 7; i++) chunk(t, ri(rng, 15), ri(rng, 15), 2, 2, jit([122, 86, 58], rng, 0.1));
  for (let i = 0; i < 5; i++) chunk(t, ri(rng, 15), ri(rng, 15), 2, 1, jit([150, 110, 78], rng, 0.08));
  for (let i = 0; i < 4; i++) { const x = ri(rng, 16), y = ri(rng, 16); t.set(x, y, [126, 120, 112]); t.set(x + 1, y + 1, [86, 74, 62]); }
  for (let i = 0; i < 3; i++) { let x = ri(rng, 14), y = ri(rng, 14); for (let k = 0; k < 3; k++) { t.set(x, y, [78, 56, 38]); x++; if (rng() < 0.5) y++; } }
  return t;
}

const GRASS: RGB = [98, 160, 58];
function grassTop2(rng: Rng): PixelTex {
  const t = noisy(GRASS, rng, 0.04, 4, 0.09);
  for (let i = 0; i < 36; i++) {
    const x = ri(rng, 16), y = ri(rng, 15);
    t.set(x, y, jit([70, 126, 42], rng, 0.1));
    t.set(x, y + 1, jit([84, 142, 50], rng, 0.1));
    if (rng() < 0.7) t.set(x, y - 1, jit([128, 190, 80], rng, 0.08));
  }
  for (let i = 0; i < 4; i++) t.set(ri(rng, 16), ri(rng, 16), [150, 198, 86]);
  return t;
}

function fringe2(base: PixelTex, rng: Rng, col: RGB, dark: RGB, shadowRows = true): PixelTex {
  const t = base.clone();
  const depth: number[] = [];
  for (let x = 0; x < TEX; x++) depth.push(3 + ri(rng, 2) + (rng() < 0.3 ? 1 : 0));
  for (let x = 0; x < TEX; x++) {
    const d = depth[x];
    for (let y = 0; y < d; y++) {
      let c = y === d - 1 ? dark : y === 0 ? shade(col, 1.12) : col;
      if (y > 0 && y < d - 1 && (x + y) % 3 === 0) c = shade(col, 0.92);
      t.set(x, y, jit(c, rng, 0.06));
    }
    if (shadowRows) hi(t, x, d, 0.8);
    // a few loose blades hanging lower than their neighbours
    if (rng() < 0.22) t.set(x, d, jit(dark, rng, 0.05));
  }
  return t;
}

function sand2(rng: Rng): PixelTex {
  const t = noisy([219, 205, 158], rng, 0.022, 4, 0.04);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const r = (x + y * 2) % 8;
    if (r === 0) hi(t, x, y, 0.94); else if (r === 1) hi(t, x, y, 1.04);
  }
  speckle(t, rng, 18, [198, 182, 134]);
  speckle(t, rng, 14, [238, 228, 190]);
  for (let i = 0; i < 3; i++) t.set(ri(rng, 16), ri(rng, 16), [176, 150, 112]);
  return t;
}

function gravel2(rng: Rng): PixelTex {
  const t = noisy([104, 100, 100], rng, 0.04, 2, 0.06);
  const pal: RGB[] = [[132, 126, 122], [150, 144, 140], [118, 104, 94], [160, 154, 148], [140, 132, 128]];
  for (let i = 0; i < 20; i++) {
    const w = 2 + ri(rng, 2), h = 2;
    chunk(t, ri(rng, 16), ri(rng, 16), w, h, pal[ri(rng, pal.length)]);
  }
  speckle(t, rng, 10, [70, 68, 68]);
  return t;
}

function logSide2(rng: Rng): PixelTex {
  const t = new PixelTex();
  const base: RGB = [104, 80, 49];
  let x = 0;
  while (x < TEX) {
    const w = 2 + ri(rng, 2);
    const tone = shade(base, 0.92 + rng() * 0.2);
    for (let k = 0; k < w && x + k < TEX; k++) {
      for (let y = 0; y < TEX; y++) {
        let f = 1 + (rng() - 0.5) * 0.08;
        if (k === 0) f *= 0.78; else if (k === 1) f *= 1.1;
        if ((y + x * 3) % 7 === 0) f *= 0.93;
        t.set(x + k, y, shade(tone, f));
      }
    }
    x += w;
  }
  // a knot
  const kx = 3 + ri(rng, 9), ky = 3 + ri(rng, 9);
  paintKnot(t, kx, ky);
  return t;
}
function paintKnot(t: PixelTex, x: number, y: number): void {
  const pts: Array<[number, number, number]> = [[0, 0, 0.45], [1, 0, 0.55], [0, 1, 0.55], [1, 1, 0.65], [-1, 0, 0.7], [2, 1, 0.7], [0, -1, 0.75], [1, 2, 0.75]];
  for (const [dx, dy, f] of pts) hi(t, x + dx, y + dy, f);
}

function logTop2(rng: Rng, bark: RGB = [104, 80, 49], a: RGB = [190, 154, 102], b: RGB = [168, 132, 84]): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 8);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb >= 7) { t.set(x, y, shade(bark, (x + y) % 2 ? 0.88 : 1.04 + (rng() - 0.5) * 0.1)); continue; }
    const d = Math.sqrt(dx * dx + dy * dy) * 0.7 + cheb * 0.3 + n[y * 16 + x] * 0.9;
    const ring = Math.floor(d * 0.85) % 2;
    let c: RGB = ring ? b : a;
    if (d < 1.2) c = shade(b, 0.78);
    if (cheb === 6) c = shade(c, 0.86);
    t.set(x, y, jit(c, rng, 0.035));
  }
  return t;
}

function leaves2(rng: Rng): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const v = n[y * 16 + x];
    if (rng() < 0.17 + (v < 0.3 ? 0.12 : 0)) { t.set(x, y, [40, 80, 30], 0); continue; }
    const base: RGB = v > 0.62 ? [78, 146, 52] : v > 0.4 ? [58, 118, 40] : [42, 92, 32];
    t.set(x, y, jit(base, rng, 0.1));
  }
  // leaf shapes: a light pixel with a darker shadow beside it
  for (let i = 0; i < 22; i++) {
    const x = ri(rng, 15), y = ri(rng, 15);
    if (t.alpha(x, y) === 0) continue;
    t.set(x, y, jit([110, 178, 72], rng, 0.08));
    if (t.alpha(x + 1, y + 1) > 0) t.set(x + 1, y + 1, jit([34, 78, 26], rng, 0.1));
  }
  return t;
}

const PLANK_C: RGB[] = [[170, 136, 84], [158, 124, 76], [176, 142, 90], [162, 128, 80]];
function planks2(rng: Rng): PixelTex {
  const t = new PixelTex();
  for (let b = 0; b < 4; b++) {
    const c = PLANK_C[b];
    const seam = ri(rng, 16);
    for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < TEX; x++) {
      const ly = y - b * 4;
      let col = jit(c, rng, 0.03);
      if (ly === 3) col = shade(c, 0.62);
      else if (ly === 0) col = shade(col, 1.1);
      if (x === seam && ly < 3) col = shade(c, 0.7);
      t.set(x, y, col);
    }
    for (let g = 0; g < 3; g++) {
      const gx = ri(rng, 16), gy = b * 4 + 1 + ri(rng, 2), len = 3 + ri(rng, 5);
      const dark = rng() < 0.6;
      for (let k = 0; k < len; k++) if ((gx + k) % 16 !== seam) hi(t, gx + k, gy, dark ? 0.9 : 1.07);
    }
    // nail heads near the seam
    t.set(seam + 2, b * 4 + 1, shade(c, 0.55));
    t.set(seam - 2, b * 4 + 1, shade(c, 0.55));
  }
  return t;
}

function bricks2(rng: Rng): PixelTex {
  const t = new PixelTex();
  const mortar: RGB = [176, 168, 156];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    const tones = [0, 1].map(() => shade([152, 72, 56], 0.86 + rng() * 0.26));
    for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < 16; x++) {
      const bx = (x + 16 - off) % 16;
      const ly = y - row * 4;
      if (ly === 3 || bx === 7 || bx === 15) { t.set(x, y, jit(shade(mortar, ly === 3 ? 0.92 : 0.98), rng, 0.06)); continue; }
      let f = 1;
      if (ly === 0) f = 1.14; else if (ly === 2) f = 0.88;
      if (bx === 0 || bx === 8) f *= 1.08; else if (bx === 6 || bx === 14) f *= 0.86;
      t.set(x, y, shade(tones[bx < 8 ? 0 : 1], f * (1 + (rng() - 0.5) * 0.1)));
    }
  }
  for (let i = 0; i < 5; i++) { const x = ri(rng, 16), y = ri(rng, 16); if (t.get(x, y)[0] > 120 && t.get(x, y)[1] < 110) hi(t, x, y, 0.8); }
  return t;
}

function stoneBricks2(rng: Rng): PixelTex {
  const t = new PixelTex();
  for (let row = 0; row < 2; row++) {
    const off = row ? 4 : 0;
    const tones = [0, 1].map(() => shade([126, 126, 128], 0.92 + rng() * 0.16));
    for (let y = row * 8; y < row * 8 + 8; y++) for (let x = 0; x < 16; x++) {
      const bx = (x + 16 - off) % 16;
      const ly = y - row * 8, lx = bx % 8;
      let c: RGB = jit(tones[bx < 8 ? 0 : 1], rng, 0.05);
      if (ly === 7 || lx === 7) c = [66, 66, 70];
      else if (ly === 0 || lx === 0) c = [156, 156, 160];
      else if (ly === 6 || lx === 6) c = [100, 100, 104];
      else if ((x * 5 + y * 3) % 11 === 0) c = shade(c, 0.9);
      t.set(x, y, c);
    }
  }
  // one hairline crack
  let x = 9 + ri(rng, 4), y = 1;
  for (let k = 0; k < 5; k++) { t.set(x, y, [82, 82, 86]); y++; if (rng() < 0.5) x++; }
  return t;
}

function tallGrass2(rng: Rng): PixelTex {
  const t = blank();
  for (let b = 0; b < 10; b++) {
    let x = 1 + ri(rng, 14);
    const h = 5 + ri(rng, 9);
    const lean = rng() < 0.5 ? -1 : 1;
    const base = shade([78, 142, 44], 0.85 + rng() * 0.3);
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      if (k > h * 0.55 && rng() < 0.4) x += lean;
      if (x < 0 || x > 15) break;
      const f = 0.72 + (k / h) * 0.55;
      t.set(x, y, shade(base, f));
    }
    if (x >= 0 && x <= 15) t.set(x, 15 - h, [168, 208, 92]);
  }
  for (let i = 0; i < 2; i++) { const x = 2 + ri(rng, 12); t.set(x, 6 + ri(rng, 4), [214, 196, 96]); }
  return t;
}

function flower2(rng: Rng, petal: RGB, dark: RGB, center: RGB, cup: boolean): PixelTex {
  const t = blank();
  for (let y = 8; y < 16; y++) { t.set(7, y, [58, 112, 38]); t.set(8, y, [80, 140, 50]); }
  for (const [x, y] of [[5, 12], [4, 11], [10, 11], [11, 10], [6, 14]]) t.set(x, y, [88, 154, 54]);
  for (const [x, y] of [[5, 13], [10, 12]]) t.set(x, y, [60, 116, 40]);
  const rows = cup
    ? ['..ppp..', '.pPppP.', 'ppppppp', 'pPcccPp', '.ppcpp.', '..ppp..']
    : ['..pPp..', '.ppppPp', 'pPpcppp', 'ppcCcpp', 'PpPcpPp', '.pppPp.', '..ppp..'];
  const pal: Record<string, RGB> = { p: petal, P: dark, c: center, C: shade(center, 0.6) };
  const oy = cup ? 2 : 1;
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch !== '.') t.set(4 + rx, oy + ry, pal[ch]);
    }
  });
  hi(t, 5, oy + 1, 1.25); hi(t, 6, oy, 1.2);
  void rng;
  return t;
}

function sandstone2(rng: Rng, kind: 'side' | 'top' | 'bottom'): PixelTex {
  const t = sand2(rng);
  if (kind === 'side') {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let f = 1;
      if (y === 0) f = 1.06; else if (y === 3) f = 0.82; else if (y === 4) f = 1.05;
      else if (y === 8) f = 0.9; else if (y === 9) f = 1.03; else if (y === 13) f = 0.9;
      else if (y > 13) f = 0.95;
      hi(t, x, y, f);
    }
  } else if (kind === 'top') {
    for (let i = 0; i < 16; i++) { hi(t, i, 0, 0.88); hi(t, 0, i, 0.88); hi(t, i, 15, 1.06); hi(t, 15, i, 1.06); }
  } else for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) hi(t, x, y, 0.9);
  return t;
}

function snow2(rng: Rng): PixelTex {
  const t = noisy([242, 247, 253], rng, 0.01, 4, 0.025);
  for (let i = 0; i < 10; i++) { const x = ri(rng, 15), y = ri(rng, 15); t.set(x, y, [214, 226, 242]); t.set(x + 1, y, [224, 234, 247]); }
  for (let i = 0; i < 7; i++) t.set(ri(rng, 16), ri(rng, 16), [255, 255, 255]);
  return t;
}

function woolWeave(rng: Rng, base: RGB): PixelTex {
  const t = noisy(base, rng, 0.02, 4, 0.04);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const stitch = ((x + (Math.floor(y / 2) % 2) * 2) % 4);
    hi(t, x, y, stitch === 0 ? 0.9 : stitch === 1 ? 1.05 : stitch === 2 ? 0.97 : 1.02);
    if (y % 2 === 1) hi(t, x, y, 0.95);
  }
  for (let i = 0; i < 6; i++) t.set(ri(rng, 16), ri(rng, 16), shade(base, 1.12));
  return t;
}

function ore2(rng: Rng, cols: RGB[], clusters: number): PixelTex {
  const t = stone2(rng);
  for (let i = 0; i < clusters; i++) {
    const cx = 2 + ri(rng, 11), cy = 2 + ri(rng, 11);
    const size = 3 + ri(rng, 3);
    let x = cx, y = cy;
    for (let k = 0; k < size; k++) {
      const c = cols[ri(rng, cols.length)];
      chunk(t, x, y, 2, 2, c);
      const d = ri(rng, 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
    }
  }
  return t;
}

const PATH: RGB = [154, 126, 84];

export function richerBlockTextures(m: Map<string, PixelTex>): void {
  const R = (name: string) => mulberry32(seedOf(name + '/2.16'));
  const dirt = dirt2(R('dirt'));
  m.set('dirt', dirt);
  m.set('grass_top', grassTop2(R('grass_top')));
  m.set('grass_side', fringe2(dirt, R('grass_side'), GRASS, [78, 134, 44]));
  m.set('grass_side_snow', fringe2(dirt, R('grass_side_snow'), [240, 246, 252], [206, 220, 236]));
  m.set('path_side', fringe2(dirt, R('path_side'), PATH, shade(PATH, 0.78)));
  m.set('stone', stone2(R('stone')));
  m.set('sand', sand2(R('sand')));
  m.set('gravel', gravel2(R('gravel')));
  m.set('log_side', logSide2(R('log_side')));
  m.set('log_top', logTop2(R('log_top')));
  m.set('leaves', leaves2(R('leaves')));
  m.set('planks', planks2(R('planks')));
  const tones: RGB[] = [[138, 138, 140], [154, 154, 156], [122, 122, 124], [164, 164, 166]];
  m.set('cobblestone', cobble2(R('cobblestone'), tones, [96, 96, 98]));
  const mossy = cobble2(R('cobblestone'), tones, [96, 96, 98]);
  {
    const rng = R('moss');
    const n = tileNoise(rng, 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (n[y * 16 + x] > 0.55 && rng() < 0.85) mossy.set(x, y, mix(mossy.get(x, y), [84, 124, 50], 0.55));
    }
  }
  m.set('mossy_cobblestone', mossy);
  m.set('bricks', bricks2(R('bricks')));
  m.set('stone_bricks', stoneBricks2(R('stone_bricks')));
  m.set('tall_grass', tallGrass2(R('tall_grass')));
  m.set('flower_red', flower2(R('fr'), [208, 44, 40], [148, 24, 26], [252, 212, 72], false));
  m.set('flower_yellow', flower2(R('fy'), [248, 214, 56], [204, 160, 30], [232, 122, 32], true));
  m.set('sandstone_side', sandstone2(R('ss'), 'side'));
  m.set('sandstone_top', sandstone2(R('ss_t'), 'top'));
  m.set('sandstone_bottom', sandstone2(R('ss_b'), 'bottom'));
  m.set('snow', snow2(R('snow')));
  m.set('wool', woolWeave(R('wool'), [234, 234, 232]));
  for (const c of DYE_COLORS) if (c !== 'white') m.set(`wool_${c}`, woolWeave(R('wool_' + c), DYE_RGB[c]));
  m.set('coal_ore', ore2(R('coal_ore'), [[38, 38, 40], [56, 56, 58], [26, 26, 28]], 4));
  m.set('iron_ore', ore2(R('iron_ore'), [[224, 182, 148], [198, 148, 112], [170, 120, 90]], 4));
  m.set('birch_log_top', logTop2(R('birch_top'), [216, 214, 202], [226, 204, 156], [212, 188, 138]));
  m.set('spruce_log_top', logTop2(R('spruce_top'), [72, 52, 32], [140, 104, 64], [124, 90, 56]));
}
