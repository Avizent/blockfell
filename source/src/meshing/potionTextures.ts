import { PixelTex, TEX, shade } from './textures';

/** ORIGINAL textures for the Brewing Stand (2.5): dark iron with a copper sheen, and its mossy stone base. */
export function brewingStand(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, shade([150, 110, 70], 0.86 + rng() * 0.18));
  for (let y = 0; y < TEX; y += 4) for (let x = 0; x < TEX; x++) t.set(x, y, [96, 66, 40]);
  for (let i = 0; i < 6; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [226, 186, 120]);
  return t;
}

export function brewingBase(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, shade([120, 124, 128], 0.84 + rng() * 0.2));
  for (let i = 0; i < 10; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), [84, 120, 84]);
  for (let x = 0; x < TEX; x++) { t.set(x, 0, [150, 154, 158]); t.set(x, 15, [78, 80, 84]); }
  return t;
}
