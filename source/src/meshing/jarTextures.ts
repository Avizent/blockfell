import { PixelTex } from './textures';
import type { FishSpecies } from '../inventory/fish';

type RGB = [number, number, number];
const sh = (c: RGB, f: number): RGB => [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];

/** ORIGINAL 2.10 textures: the Spring Pad (a springy red-and-cream pad) and the Fish Jars. */
export function springPadTop(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const ring = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
    let c: RGB = ring < 10 ? [250, 226, 120] : ring < 30 ? [226, 70, 82] : [200, 52, 66];
    if (edge) c = [140, 36, 50];
    const n = 0.96 + rng() * 0.08;
    t.set(x, y, sh(c, n));
  }
  return t;
}
export function springPadSide(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    // a coil of grey spring wire on a dark core
    const coil = (x + (y % 4) * 1) % 4 < 2;
    const c: RGB = coil ? [196, 202, 210] : [74, 78, 90];
    t.set(x, y, sh(c, 0.96 + rng() * 0.08));
  }
  return t;
}

const FISH_MAP = [
  '...ooo.F.',
  '.oBBBBoFF',
  'oBEBBBBoF',
  '.oLLLLoFF',
  '...ooo.F.',
];

function drawFish(t: PixelTex, f: FishSpecies, ox: number, oy: number): void {
  const pal: Record<string, RGB> = { o: sh(f.body, 0.45), B: f.body, L: f.belly, F: f.fin, E: [20, 20, 30] };
  for (let y = 0; y < FISH_MAP.length; y++) for (let x = 0; x < FISH_MAP[y].length; x++) {
    const ch = FISH_MAP[y][x];
    if (ch !== '.') t.set(ox + x, oy + y, pal[ch]);
  }
}

/** The jar's lid (top and bottom faces): a cork-brown disc in a glass rim. */
export function jarLid(rng: () => number): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = x < 3 || x > 12 || y < 3 || y > 12;
    t.set(x, y, edge ? [150, 172, 180] : sh([150, 112, 70], 0.9 + rng() * 0.2));
  }
  return t;
}

/** A glass jar: pale glass walls, water inside, and (if given) a fish swimming in it. */
export function jarTex(rng: () => number, fish: FishSpecies | null): PixelTex {
  const t = new PixelTex();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const wall = x < 4 || x > 11 || y > 14 || y < 1;
    if (wall) { t.set(x, y, sh([206, 232, 242], 0.94 + rng() * 0.08)); continue; }
    const depth = 1 - y / 26;
    t.set(x, y, [Math.round(60 * depth + 26), Math.round(140 * depth + 40), Math.round(200 * depth + 36)]);
  }
  if (fish) drawFish(t, fish, 3, 5);
  // a glint
  t.set(5, 3, [255, 255, 255]); t.set(5, 4, [236, 248, 255]);
  if (fish && fish.glow >= 7) for (let i = 0; i < 5; i++) t.set(5 + Math.floor(rng() * 7), 2 + Math.floor(rng() * 11), sh(fish.belly, 1));
  return t;
}
