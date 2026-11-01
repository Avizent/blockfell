import { PixelTex } from './textures';

type RGB = [number, number, number];
const sh = (c: RGB, f: number): RGB => [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];

/** ORIGINAL 2.11 textures: Lightning Rod, Tune Box, Jukebox and Note Block. */
export function rodSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const band = y % 5 === 0;
    const c: RGB = band ? [112, 122, 134] : [176, 186, 198];
    t.set(x, y, sh(c, 0.95 + rng() * 0.1));
  }
  return t;
}
export function rodTip(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, sh([244, 190, 60], 0.95 + rng() * 0.1));
  return t;
}

const WOOD: RGB = [166, 120, 70];
function wood(t: PixelTex, rng: () => number, base: RGB): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (y % 4 === 3) ? 0.82 : 1;
    t.set(x, y, sh(base, grain * (0.95 + rng() * 0.1)));
  }
  for (let i = 0; i < 16; i++) { t.set(i, 0, sh(base, 0.7)); t.set(i, 15, sh(base, 0.7)); t.set(0, i, sh(base, 0.7)); t.set(15, i, sh(base, 0.7)); }
}

export function tuneBoxTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  wood(t, rng, WOOD);
  // a row of piano keys: white keys with black ones between
  for (let x = 2; x < 14; x++) for (let y = 4; y < 12; y++) t.set(x, y, x % 2 === 0 ? [240, 236, 226] : [226, 220, 208]);
  for (const x of [3, 5, 8, 10, 12]) for (let y = 4; y < 9; y++) t.set(x, y, [34, 30, 36]);
  return t;
}
export function tuneBoxSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  wood(t, rng, WOOD);
  // a golden note painted on the side
  const gold: RGB = [236, 184, 52];
  for (const [x, y] of [[6, 10], [7, 10], [6, 11], [7, 11], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [9, 4], [10, 5], [10, 6]] as const) t.set(x, y, gold);
  return t;
}
export function jukeboxTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  wood(t, rng, [122, 78, 52]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
    if (r < 20) t.set(x, y, r < 3 ? [180, 150, 90] : [28, 24, 30]);
  }
  return t;
}
export function jukeboxSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  wood(t, rng, [122, 78, 52]);
  // a speaker grille
  for (let y = 4; y < 12; y += 2) for (let x = 3; x < 13; x++) t.set(x, y, [36, 28, 28]);
  return t;
}
export function noteBlockTex(rng: () => number): PixelTex {
  const t = new PixelTex();
  wood(t, rng, [150, 106, 66]);
  const ink: RGB = [60, 38, 24];
  for (const [x, y] of [[5, 9], [6, 9], [5, 10], [6, 10], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [8, 4], [9, 5], [9, 6]] as const) t.set(x + 1, y, ink);
  return t;
}
