import { PixelTex, TEX, shade } from './textures';

/**
 * ORIGINAL textures for the Starhollow (2.2): pale star-flecked stone, its cut
 * bricks, the glowing Starbloom, the Stargate's swirl, the crystal Storm Bells
 * (lit and silent) and the Hollowdrake's Roost.
 */
type RGB = [number, number, number];

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

/** Starstone: pale lilac-grey rock, softly mottled, with a few bright star flecks. */
export function starstone(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4), m = tileNoise(rng, 8);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const f = 0.88 + n[y * TEX + x] * 0.16 + m[y * TEX + x] * 0.1 + (rng() - 0.5) * 0.06;
    t.set(x, y, shade([196, 188, 214], f));
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    t.set(x, y, [248, 244, 255]);
    if (rng() < 0.5) t.set(x + 1, y, [222, 214, 246]);
  }
  for (let i = 0; i < 6; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [150, 140, 176]);
  return t;
}

/** Starstone Bricks: the same stone cut into neat blocks with violet mortar. */
export function starstoneBricks(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const row = y >> 3, off = row % 2 === 0 ? 0 : 4;
    const mortar = y % 8 === 7 || (x + off) % 8 === 7;
    if (mortar) { t.set(x, y, [128, 116, 158]); continue; }
    const top = y % 8 === 0 || (x + off) % 8 === 0;
    const f = (top ? 1.1 : 1) * (0.9 + n[y * TEX + x] * 0.16) * (1 + (rng() - 0.5) * 0.05);
    t.set(x, y, shade([202, 194, 220], f));
  }
  for (let i = 0; i < 3; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [246, 242, 255]);
  return t;
}

/** Starbloom: a glowing five-petalled flower on a thin silver stem (see-through cutout). */
export function starbloom(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, [0, 0, 0], 0);
  // stem and two leaves
  for (let y = 8; y < 16; y++) t.set(7 + (y > 12 ? 1 : 0), y, [150, 176, 196]);
  for (const [x, y] of [[5, 12], [6, 11], [10, 13], [9, 12]]) t.set(x, y, [126, 168, 182]);
  // the flower: a star of petals round a bright heart
  const cx = 7.5, cy = 5;
  for (let y = 0; y < 11; y++) for (let x = 2; x < 14; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const petal = 2.2 + 2.0 * Math.max(0, Math.cos(a * 5 + 0.3));
    if (r > petal) continue;
    const c: RGB = r < 1.4 ? [255, 250, 214] : r < 2.6 ? [212, 236, 255] : [168, 152, 246];
    t.set(x, y, shade(c, 1 + (rng() - 0.5) * 0.08));
  }
  t.set(7, 4, [255, 255, 255]);
  return t;
}

/** Stargate: a deep violet swirl of starlight with cyan and white sparks. */
export function stargate(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const swirl = 0.5 + 0.5 * Math.sin(a * 3 + r * 0.9);
    const c: RGB = [Math.round(60 + 90 * swirl), Math.round(34 + 60 * swirl), Math.round(140 + 100 * swirl)];
    t.set(x, y, shade(c, 0.95 + (rng() - 0.5) * 0.1));
  }
  for (let i = 0; i < 9; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), rng() < 0.5 ? [140, 236, 255] : [255, 255, 255]);
  return t;
}

/** A Storm Bell: pale blue crystal with bright bands (lit), or dark slate once it has been rung. */
export function stormBell(rng: () => number, lit: boolean): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  const base: RGB = lit ? [164, 222, 246] : [86, 90, 112];
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const band = x % 6 === 2 ? 1.22 : x % 6 === 5 ? 0.84 : 1;
    const rim = y >= 13 ? 0.8 : y === 12 ? 1.16 : 1;
    t.set(x, y, shade(base, band * rim * (0.9 + n[y * TEX + x] * 0.18) * (1 + (rng() - 0.5) * 0.05)));
  }
  if (lit) for (let i = 0; i < 5; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 12), [255, 255, 255]);
  return t;
}

/** The crystal yoke a Storm Bell hangs from. */
export function stormBellMount(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, shade([112, 100, 150], 0.92 + rng() * 0.14));
  for (let x = 0; x < TEX; x++) { t.set(x, 0, [150, 138, 190]); t.set(x, 15, [76, 66, 104]); }
  return t;
}

/** The Roost: dark violet stone with a pale eight-pointed star cut into it. */
export function roost(rng: () => number): PixelTex {
  const t = new PixelTex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    t.set(x, y, shade([74, 62, 104], 0.88 + n[y * TEX + x] * 0.2 + (rng() - 0.5) * 0.06));
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, len = i % 2 === 0 ? 6.5 : 3.5;
    for (let s = 0; s <= len; s += 0.5) t.set(Math.round(7.5 + Math.cos(a) * s), Math.round(7.5 + Math.sin(a) * s), [214, 204, 246]);
  }
  t.set(7, 7, [255, 255, 255]); t.set(8, 8, [255, 255, 255]);
  for (let x = 0; x < TEX; x++) { t.set(x, 0, [104, 90, 140]); t.set(0, x, [104, 90, 140]); t.set(x, 15, [50, 42, 72]); t.set(15, x, [50, 42, 72]); }
  return t;
}
