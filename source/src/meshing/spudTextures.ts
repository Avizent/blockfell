import { PixelTex } from './textures';

type RGB = [number, number, number];
/** ORIGINAL textures for the 2.9 potato crop: four growth stages (a cross-shaped plant on a transparent background). */
export function potatoes(rng: () => number, stage: number): PixelTex {
  const t = new PixelTex();
  const leaf: RGB = [74, 132, 56], leaf2: RGB = [104, 164, 74];
  const h = 2 + stage * 3;
  for (const x0 of [2, 6, 10, 13]) {
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      t.set(x0, y, leaf);
      if (k % 2 === 1 && k > 1) { t.set(x0 - 1, y, leaf2); if (x0 + 1 <= 15) t.set(x0 + 1, y, leaf2); }
    }
    if (stage === 3) {
      // pale-flowered top, and tan tubers peeking out of the soil
      t.set(x0, 15 - h, [236, 226, 244]);
      t.set(x0, 15, [196, 156, 98]); if (x0 + 1 <= 15) t.set(x0 + 1, 15, [176, 136, 82]);
      if (rng() < 2) t.set(x0, 14, [212, 172, 110]);
    }
  }
  return t;
}
