import { PixelTex, TEX, shade } from './textures';

type RGB = [number, number, number];
const fill = (t: PixelTex, rng: () => number, c: RGB, v = 0.16): void => {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, shade(c, 1 - v / 2 + rng() * v));
};

/** ORIGINAL textures for Spore Isle (2.8). Sporeloam: purple-grey soil with a faint blue sheen. */
export function sporeloamTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  fill(t, rng, [92, 78, 112], 0.2);
  for (let i = 0; i < 26; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), shade([128, 112, 156], 0.9 + rng() * 0.2));
  for (let i = 0; i < 6; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [150, 214, 226]);
  return t;
}
export function sporeloamSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  fill(t, rng, [112, 84, 62], 0.2);
  for (let y = 0; y < 5; y++) for (let x = 0; x < TEX; x++) {
    const drip = y < 3 || ((x * 7 + y * 3) % 5 < 2 && y < 5);
    if (drip) t.set(x, y, shade([92, 78, 112], 0.88 + rng() * 0.22));
  }
  return t;
}
export function sporeStem(rng: () => number): PixelTex {
  const t = new PixelTex();
  fill(t, rng, [226, 214, 190], 0.12);
  for (let x = 0; x < TEX; x += 4) for (let y = 0; y < TEX; y++) t.set(x + (y % 7 === 0 ? 1 : 0), y, shade([196, 182, 156], 0.95 + rng() * 0.1));
  return t;
}
export function sporeStemTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  fill(t, rng, [214, 200, 172], 0.1);
  for (let r = 3; r < 8; r += 2) for (let a = 0; a < 40; a++) t.set(Math.round(7.5 + Math.cos(a / 6.4) * r), Math.round(7.5 + Math.sin(a / 6.4) * r), [184, 168, 140]);
  return t;
}
/** A cap: a rich colour with paler spots. */
export function capTex(rng: () => number, c: RGB): PixelTex {
  const t = new PixelTex();
  fill(t, rng, c, 0.16);
  for (let i = 0; i < 5; i++) {
    const cx = Math.floor(rng() * 16), cy = Math.floor(rng() * 16);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.set(cx + dx, cy + dy, shade([250, 240, 226], 0.92 + rng() * 0.08));
  }
  return t;
}
/** Glowgills: the lit ribbed underside of a cap. */
export function capGills(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const stripe = x % 3 === 0;
    t.set(x, y, shade(stripe ? [206, 150, 255] : [150, 232, 236], 0.9 + rng() * 0.16));
  }
  return t;
}
/** Spore Tuft: a cluster of small glowing mushrooms (a cross-shaped plant: transparent background). */
export function sporeTuft(rng: () => number): PixelTex {
  const t = new PixelTex();
  const caps: [number, number, number, RGB][] = [[4, 9, 3, [150, 96, 200]], [10, 7, 4, [200, 80, 110]], [7, 12, 2, [110, 200, 210]]];
  for (const [cx, cy, r, c] of caps) {
    for (let y = cy; y < 16; y++) t.set(cx, y, [226, 214, 190]);
    for (let dx = -r; dx <= r; dx++) for (let dy = -1; dy <= 0; dy++) if (Math.abs(dx) + Math.abs(dy) <= r) t.set(cx + dx, cy + dy, shade(c, 0.9 + rng() * 0.2));
    t.set(cx - 1, cy - 1, [250, 240, 226]);
  }
  return t;
}
export function sporeLamp(rng: () => number): PixelTex {
  const t = new PixelTex();
  fill(t, rng, [236, 226, 172], 0.08);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const edge = x < 2 || y < 2 || x > 13 || y > 13;
    if (edge) t.set(x, y, shade([150, 130, 100], 0.9 + rng() * 0.15));
  }
  for (let i = 0; i < 12; i++) t.set(3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), i % 2 ? [190, 130, 240] : [130, 230, 220]);
  return t;
}
