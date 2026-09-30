import { mulberry32 } from '../core/rng';

/**
 * ORIGINAL PAINTINGS
 * ------------------
 * Every painting is drawn here, pixel by pixel, from code: no image files and no
 * copied artwork. A motif is a small program (sky gradients with ordered
 * dithering, hills from sine sums, trees, water, figures...) that paints onto a
 * canvas of 16 pixels per block, inside a 1-pixel wooden frame. The same motif
 * always produces the same picture.
 */
type RGB = [number, number, number];

export interface Motif {
  id: string;
  title: string;
  w: number;     // blocks
  h: number;
  draw: (p: Pix) => void;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A pixel canvas with a few painting tools. (0,0) is the top-left. */
export class Pix {
  readonly d: Uint8ClampedArray;
  readonly rng: () => number;
  constructor(readonly w: number, readonly h: number, seed: number) {
    this.d = new Uint8ClampedArray(w * h * 4);
    this.rng = mulberry32(seed);
  }
  set(x: number, y: number, c: RGB): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  }
  get(x: number, y: number): RGB {
    const i = (Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  /** Vertical gradient between rows y0..y1 in `steps` dithered bands. */
  vgrad(y0: number, y1: number, top: RGB, bottom: RGB, steps = 6, x0 = 0, x1 = this.w - 1): void {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      for (let x = x0; x <= x1; x++) {
        const k = t * steps + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5);
        this.set(x, y, mix(top, bottom, Math.max(0, Math.min(steps, Math.round(k))) / steps));
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
    }
  }
  /** Fills from a curve y = f(x) down to row `bottom`. */
  ridge(f: (x: number) => number, c: RGB | ((x: number, y: number, top: number) => RGB), bottom = this.h - 1): void {
    for (let x = 0; x < this.w; x++) {
      const top = Math.round(f(x));
      for (let y = Math.max(0, top); y <= bottom; y++) this.set(x, y, typeof c === 'function' ? c(x, y, top) : c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
  }
  /** Small conifer: a stack of widening rows. */
  pine(x: number, base: number, h: number, c: RGB, trunk: RGB = [70, 48, 30], snow = false): void {
    this.set(x, base, trunk);
    for (let k = 1; k < h; k++) {
      const half = Math.floor(((h - k) / h) * (h / 2.4)) + (k % 2 === 0 ? 0 : 0);
      for (let dx = -half; dx <= half; dx++) this.set(x + dx, base - k, snow && (k % 3 === 0) && Math.abs(dx) === half ? [236, 242, 248] : shade(c, dx < 0 ? 0.85 : 1));
    }
  }
  /** Round-topped tree. */
  tree(x: number, base: number, r: number, c: RGB): void {
    this.rect(x, base - r, x, base, [86, 60, 34]);
    this.disc(x, base - r - r * 0.6, r, c);
    this.disc(x - r * 0.3, base - r - r * 0.9, r * 0.5, shade(c, 1.18));
  }
  speck(n: number, c: RGB, x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1): void {
    for (let i = 0; i < n; i++) this.set(x0 + Math.floor(this.rng() * (x1 - x0 + 1)), y0 + Math.floor(this.rng() * (y1 - y0 + 1)), c);
  }
  /** A hand-drawn character map; '.' leaves the pixel untouched. */
  map(rows: string[], pal: Record<string, RGB>, ox: number, oy: number): void {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) this.set(ox + x, oy + y, c); } });
  }
  /** The wooden frame every painting sits in. */
  frame(): void {
    const dark: RGB = [66, 44, 24], light: RGB = [128, 90, 50];
    for (let x = 0; x < this.w; x++) { this.set(x, 0, light); this.set(x, this.h - 1, dark); }
    for (let y = 0; y < this.h; y++) { this.set(0, y, light); this.set(this.w - 1, y, dark); }
    this.set(0, this.h - 1, dark); this.set(this.w - 1, 0, dark);
  }
}

// ---------------------------------------------------------------- palette
const SKY: RGB = [128, 184, 232], SKY_HI: RGB = [72, 128, 206];
const GRASS: RGB = [92, 150, 60], GRASS_D: RGB = [62, 112, 44];
const WATER: RGB = [52, 104, 170], WATER_L: RGB = [110, 164, 214];
const SNOW: RGB = [236, 240, 246];
const NIGHT: RGB = [16, 20, 46], NIGHT_L: RGB = [44, 58, 104];

const wave = (x: number, a: number[], seed: number) => a.reduce((s, amp, i) => s + amp * Math.sin(x * (0.11 + i * 0.07) + seed * (i + 1)), 0);

export const MOTIFS: Motif[] = [
  // ------------------------------------------------------------- 1 x 1
  {
    id: 'apple', title: 'Orchard Apple', w: 1, h: 1, draw: (p) => {
      p.vgrad(0, 10, [196, 160, 104], [150, 112, 70], 3);
      p.rect(0, 11, 15, 15, [110, 72, 40]); p.rect(0, 11, 15, 11, [140, 96, 56]);
      p.disc(7.5, 8, 3.6, [184, 32, 30]); p.disc(7, 7.5, 2.6, [214, 50, 44]);
      p.set(6, 6, [250, 170, 160]); p.set(6, 7, [236, 120, 110]);
      p.set(8, 4, [80, 52, 26]); p.set(8, 3, [80, 52, 26]); p.set(9, 3, [86, 160, 58]); p.set(10, 3, [66, 134, 44]); p.set(10, 2, [86, 160, 58]);
      p.set(10, 11, [90, 56, 30]); p.set(5, 11, [90, 56, 30]);
    },
  },
  {
    id: 'owl', title: 'Night Watch', w: 1, h: 1, draw: (p) => {
      p.vgrad(0, 15, NIGHT, NIGHT_L, 4);
      p.disc(11.5, 3.5, 2.2, [236, 230, 190]); p.set(12, 3, [210, 204, 170]);
      p.speck(5, [220, 220, 250], 1, 1, 8, 6);
      p.line(0, 13, 15, 12, [70, 48, 30]); p.line(0, 14, 15, 13, [52, 34, 20]);
      p.map([
        '.b..b.',
        'bbbbbb',
        'BYkYkB',
        'BYYYYB',
        'bbobbb',
        'bLLLLb',
        'bLLLLb',
        '.bLLb.',
        '..tt..',
      ], { b: [120, 86, 54], B: [96, 66, 40], Y: [246, 206, 70], k: [20, 16, 12], o: [226, 150, 50], L: [196, 166, 124], t: [230, 170, 60] }, 4, 4);
    },
  },
  {
    id: 'vase', title: 'Blue Vase', w: 1, h: 1, draw: (p) => {
      p.vgrad(0, 11, [226, 214, 186], [196, 180, 146], 3);
      p.rect(0, 12, 15, 15, [128, 92, 60]);
      for (const [x, top, c] of [[5, 3, [206, 44, 40]], [8, 2, [246, 212, 54]], [11, 4, [240, 240, 236]], [7, 5, [110, 150, 230]]] as [number, number, RGB][]) {
        p.line(x, top + 1, 8, 8, [70, 128, 44]);
        p.disc(x, top, 1.2, c); p.set(x, top, shade(c, 0.7));
      }
      p.map(['.vvvv.', 'vVvvvv', 'vVvvvv', '.vvvv.', '..vv..', '.vvvv.'], { v: [60, 96, 184], V: [130, 168, 236] }, 5, 8);
    },
  },
  {
    id: 'toadstool', title: 'Toadstool', w: 1, h: 1, draw: (p) => {
      p.vgrad(0, 15, [44, 86, 52], [24, 50, 30], 3);
      p.speck(10, [70, 120, 70]);
      p.rect(0, 13, 15, 15, [58, 42, 28]); p.speck(6, GRASS, 0, 13, 15, 13);
      p.rect(7, 8, 9, 13, [232, 222, 200]); p.rect(9, 8, 9, 13, [196, 186, 164]);
      p.map(['...rrrr...', '.rrWrrrrr.', 'rrrrrrWrrr', 'rWrrrrrrrr', 'rrrrWrrrWr', 'DDDDDDDDDD'], { r: [198, 40, 36], W: [246, 240, 230], D: [140, 26, 24] }, 3, 3);
    },
  },
  // ------------------------------------------------------------- 2 x 1
  {
    id: 'sail', title: 'Homeward Sail', w: 2, h: 1, draw: (p) => {
      p.vgrad(0, 9, [120, 70, 150], [250, 160, 80], 7);
      p.disc(22, 9.5, 3.5, [255, 214, 120]);
      p.vgrad(10, 15, [60, 70, 130], [30, 36, 80], 3);
      for (let y = 10; y < 15; y += 2) for (let x = 19; x < 26; x += 2) if (p.rng() < 0.7) p.set(x + (y % 4 === 0 ? 1 : 0), y, [252, 190, 100]);
      p.map(['...w.....', '..ww.....', '.www.....', 'wwww.....', '.W.W.....', 'bbbbbbb..', '.bbbbb...'], { w: [246, 238, 222], W: [80, 50, 30], b: [96, 58, 32] }, 7, 5);
      p.set(5, 7, [40, 30, 60]); p.set(6, 7, [40, 30, 60]); p.set(4, 6, [40, 30, 60]);
    },
  },
  {
    id: 'hills', title: 'Rolling Hills', w: 2, h: 1, draw: (p) => {
      p.vgrad(0, 8, SKY_HI, SKY, 4);
      p.map(['..ww..', '.wwwww', 'wwwwww'], { w: [244, 246, 250] }, 4, 2);
      p.map(['.www.', 'wwwww'], { w: [236, 240, 248] }, 21, 3);
      p.ridge((x) => 8 + wave(x, [1.5, 1], 1), [110, 164, 90]);
      p.ridge((x) => 10 + wave(x, [1.4, 0.8], 2.4), GRASS);
      p.ridge((x) => 12.5 + wave(x, [1.2, 0.6], 4), GRASS_D);
      for (let y = 10; y < 15; y++) { const x = 16 + Math.round(Math.sin(y * 0.9) * 2) - (y - 10); p.set(x, y, [200, 176, 120]); p.set(x + 1, y, [200, 176, 120]); }
      p.map(['.rr.', 'rrrr', 'wddw'], { r: [170, 60, 44], w: [236, 226, 206], d: [90, 60, 40] }, 22, 7);
      p.tree(9, 11, 1.4, [58, 120, 50]); p.tree(28, 12, 1.6, [52, 110, 44]);
    },
  },
  {
    id: 'hearth', title: 'Hearth Hound', w: 2, h: 1, draw: (p) => {
      p.vgrad(0, 15, [96, 70, 50], [64, 44, 30], 3);
      // stone fireplace with a fire
      p.rect(2, 2, 13, 13, [120, 116, 110]);
      for (let y = 2; y <= 13; y += 3) for (let x = 2 + ((y / 3) % 2 ? 2 : 0); x <= 13; x += 4) p.set(x, y, [92, 88, 84]);
      p.rect(4, 6, 11, 13, [26, 20, 18]);
      p.map(['...y....', '..yoy.y.', '.yoRoyo.', 'yoRRRoy.', 'oRRWRRo.', 'bbbbbbb.'], { y: [250, 200, 70], o: [240, 140, 40], R: [214, 60, 30], W: [255, 240, 180], b: [90, 60, 36] }, 4, 8);
      p.rect(1, 1, 14, 2, [150, 146, 140]);
      // rug and the sleeping Fellhound
      p.rect(15, 12, 30, 14, [150, 50, 44]); p.rect(15, 13, 30, 13, [190, 150, 70]);
      p.map([
        '.......gg...',
        '..gggggGgg..',
        '.gGGGGGGGgge',
        'gGGGGGGGGGgn',
        'tggggggggggg',
      ], { g: [118, 106, 94], G: [150, 136, 120], e: [40, 34, 30], n: [30, 26, 24], t: [96, 86, 76] }, 17, 7);
    },
  },
  // ------------------------------------------------------------- 1 x 2
  {
    id: 'lighthouse', title: 'The Lighthouse', w: 1, h: 2, draw: (p) => {
      p.vgrad(0, 24, NIGHT, [70, 70, 120], 5);
      p.speck(12, [230, 230, 255], 1, 1, 14, 14);
      // beams
      for (let k = 0; k < 7; k++) { p.set(9 + k, 6 - Math.floor(k / 2), [250, 236, 160]); p.set(5 - k, 6 - Math.floor(k / 2), [250, 236, 160]); }
      p.rect(6, 5, 9, 7, [255, 240, 170]); p.rect(6, 4, 9, 4, [60, 50, 50]); p.set(7, 3, [60, 50, 50]); p.set(8, 3, [60, 50, 50]);
      for (let y = 8; y <= 24; y++) {
        const half = 1.5 + (y - 8) * 0.09;
        for (let x = Math.round(7.5 - half); x <= Math.round(7.5 + half); x++) p.set(x, y, Math.floor((y - 8) / 4) % 2 ? [236, 232, 224] : [196, 50, 44]);
      }
      p.ridge((x) => 24 + Math.abs(x - 7.5) * 0.5, [90, 86, 82], 27);
      p.vgrad(27, 31, [36, 60, 110], [20, 32, 70], 2);
      p.speck(6, [150, 170, 220], 1, 27, 14, 30);
    },
  },
  {
    id: 'pine', title: 'Lone Pine', w: 1, h: 2, draw: (p) => {
      p.vgrad(0, 20, [150, 190, 226], [226, 232, 238], 5);
      p.ridge((x) => 9 + Math.abs(x - 10) * 1.1, (x, y, top) => (y - top < 3 ? SNOW : [120, 128, 146]), 22);
      p.ridge((x) => 22 + wave(x, [0.8], 3), SNOW);
      p.speck(8, [206, 216, 230], 1, 23, 14, 30);
      p.pine(6, 25, 19, [44, 92, 60], [74, 50, 30], true);
    },
  },
  {
    id: 'falls', title: 'The Falls', w: 1, h: 2, draw: (p) => {
      p.vgrad(0, 6, SKY_HI, SKY, 2);
      p.ridge((x) => 4 + Math.abs(x - 7.5) * 0.3, [118, 112, 104], 24);
      for (let y = 5; y <= 24; y++) for (let x = 6; x <= 9; x++) p.set(x, y, (x + y + (x === 7 ? 1 : 0)) % 3 === 0 ? [250, 252, 255] : WATER_L);
      p.speck(14, [140, 134, 124], 1, 6, 5, 24); p.speck(14, [96, 92, 86], 10, 6, 14, 24);
      p.tree(2, 10, 1.3, [60, 124, 52]); p.tree(13, 8, 1.3, [52, 112, 46]);
      p.vgrad(25, 30, WATER_L, WATER, 2);
      p.disc(7.5, 25, 2.5, [240, 246, 252]);
      p.rect(1, 29, 14, 30, GRASS_D);
    },
  },
  // ------------------------------------------------------------- 2 x 2
  {
    id: 'lake', title: 'Mountain Lake', w: 2, h: 2, draw: (p) => {
      p.vgrad(0, 14, SKY_HI, [196, 220, 240], 6);
      const peak = (x: number) => Math.min(4 + Math.abs(x - 11) * 1.2, 7 + Math.abs(x - 23) * 0.9);
      p.ridge(peak, (x, y, top) => (y - top < 3 + ((x * 7) % 3) ? SNOW : [110, 118, 140]), 17);
      // mirror image in the water
      for (let y = 18; y <= 27; y++) for (let x = 1; x < 31; x++) {
        const src = p.get(x, 35 - y);
        p.set(x, y, mix(src, WATER, 0.45 + (y - 18) * 0.02));
      }
      for (let y = 19; y < 27; y += 2) for (let x = 3 + (y % 4); x < 30; x += 7) p.set(x, y, WATER_L);
      p.rect(1, 17, 30, 17, [70, 120, 60]);
      for (const [x, h] of [[3, 7], [6, 5], [26, 6], [29, 8], [24, 4]]) p.pine(x, 17, h, [40, 86, 50]);
      p.rect(1, 28, 30, 30, [88, 132, 60]); p.speck(10, [120, 170, 80], 1, 28, 30, 29);
    },
  },
  {
    id: 'village', title: 'Village at Dusk', w: 2, h: 2, draw: (p) => {
      p.vgrad(0, 20, [40, 44, 96], [236, 132, 90], 7);
      p.disc(24, 6, 1.6, [255, 246, 220]);
      p.speck(8, [230, 230, 255], 1, 1, 30, 7);
      p.ridge((x) => 18 + wave(x, [1.2], 5), [52, 48, 70]);
      const house = (x: number, base: number, w: number, h: number) => {
        p.rect(x, base - h, x + w - 1, base, [72, 58, 60]);
        for (let k = 0; k <= Math.ceil(w / 2); k++) p.rect(x - 1 + k, base - h - k, x + w - k, base - h - k, [110, 50, 44]);
        p.rect(x + 1, base - h + 2, x + 2, base - h + 3, [255, 206, 110]);
        if (w > 5) p.rect(x + w - 3, base - h + 2, x + w - 2, base - h + 3, [255, 206, 110]);
        p.rect(x + Math.floor(w / 2), base - 2, x + Math.floor(w / 2), base, [40, 30, 28]);
      };
      house(3, 25, 7, 5); house(13, 24, 6, 4); house(21, 26, 8, 6);
      p.rect(1, 26, 30, 30, [60, 60, 70]);
      for (let y = 26; y <= 30; y++) { p.set(17 - (y - 26), y, [150, 130, 100]); p.set(18 - (y - 26), y, [150, 130, 100]); }
      p.rect(11, 20, 11, 26, [40, 32, 28]); p.set(11, 19, [255, 220, 120]); p.set(10, 19, [255, 190, 90]);
    },
  },
  {
    id: 'scribe', title: 'The Scribe', w: 2, h: 2, draw: (p) => {
      p.rect(1, 1, 30, 30, [70, 50, 36]);
      // bookshelf behind
      for (let row = 0; row < 3; row++) {
        const y0 = 3 + row * 9;
        p.rect(1, y0 + 7, 30, y0 + 7, [110, 78, 46]);
        for (let x = 2; x < 30; x++) {
          const h = 4 + ((x * 7 + row * 3) % 3);
          const c: RGB = [[150, 40, 40], [50, 80, 140], [60, 110, 60], [170, 130, 60], [110, 60, 120]][(x * 5 + row) % 5] as RGB;
          p.rect(x, y0 + 7 - h, x, y0 + 6, shade(c, x % 2 ? 1 : 0.85));
        }
      }
      // the scribe: hood, face, big nose, robe and a quill
      p.map([
        '.....hhhhhh.....',
        '....hHHHHHHh....',
        '...hHssssssHh...',
        '...hsssssssshh..',
        '...hsEssssEsh...',
        '...hssssssssh...',
        '...hsssNNsssh...',
        '...hsssNNsssh...',
        '...hsssNNsssh...',
        '....ssmmmmss....',
        '...rrrssssrrr...',
        '..rrrrrrrrrrrr..',
        '.rrRrrrrrrrrRrr.',
        '.rrRrrrrbbrrRrr.',
        'rrrRrrrrbbrrRrrr',
        'rrrRrrrrbbrrRrrq',
        'rrrRrrrppppppppq',
        'rrrRrrrppppppppr',
        'rrrrrrrrrrrrrrrr',
      ], {
        h: [96, 70, 110], H: [120, 92, 136], s: [196, 148, 112], E: [40, 60, 40], N: [168, 116, 86], m: [150, 100, 76],
        r: [110, 84, 124], R: [86, 64, 98], b: [220, 190, 80], p: [236, 226, 196], q: [240, 240, 236],
      }, 8, 11);
      p.set(27, 22, [240, 240, 236]); p.set(26, 23, [240, 240, 236]); p.set(25, 24, [60, 50, 40]);
    },
  },
  {
    id: 'meadow', title: 'Wildflower Meadow', w: 2, h: 2, draw: (p) => {
      p.vgrad(0, 13, SKY_HI, [200, 226, 244], 5);
      p.map(['..www...', '.wwwwww.', 'wwwwwwww'], { w: [250, 250, 252] }, 17, 4);
      p.ridge((x) => 12 + wave(x, [1, 0.6], 7), [120, 172, 92]);
      p.ridge((x) => 15 + wave(x, [0.8], 1.3), GRASS);
      const flowers: RGB[] = [[210, 50, 44], [246, 212, 54], [100, 140, 230], [244, 244, 238], [230, 130, 180]];
      for (let i = 0; i < 70; i++) {
        const y = 16 + Math.floor(p.rng() ** 0.7 * 14), x = 1 + Math.floor(p.rng() * 30);
        p.set(x, y, flowers[Math.floor(p.rng() * flowers.length)]);
        if (y > 22) p.set(x, y + 1, GRASS_D);
      }
      p.map(['o.o', '.b.', 'o.o'], { o: [250, 160, 50], b: [40, 30, 20] }, 8, 9);
    },
  },
  // ------------------------------------------------------------- 4 x 2
  {
    id: 'harvest', title: 'Harvest Moon', w: 4, h: 2, draw: (p) => {
      p.vgrad(0, 20, [20, 24, 60], [120, 70, 90], 6);
      p.speck(24, [230, 230, 250], 1, 1, 62, 10);
      p.disc(44, 11, 7, [246, 168, 70]); p.disc(43, 10, 5.5, [252, 196, 100]);
      p.set(41, 8, [230, 150, 70]); p.set(46, 12, [230, 150, 70]); p.set(44, 14, [230, 150, 70]);
      p.ridge((x) => 18 + wave(x, [1, 0.5], 2), [40, 34, 50]);
      // farmhouse and barn silhouettes
      p.rect(8, 13, 16, 19, [34, 28, 40]); for (let k = 0; k < 5; k++) p.rect(7 + k, 13 - k, 17 - k, 13 - k, [34, 28, 40]);
      p.rect(10, 15, 11, 16, [255, 200, 100]); p.rect(14, 15, 14, 16, [255, 200, 100]);
      // golden field in rows
      for (let y = 20; y <= 30; y++) for (let x = 1; x < 63; x++) {
        const row = (x + Math.floor((y - 20) * 1.6)) % 4;
        p.set(x, y, row === 0 ? [150, 110, 40] : shade([218, 176, 80], 0.8 + (y - 20) * 0.02));
      }
      for (const x of [26, 34, 55]) { p.disc(x, 21, 2.2, [190, 150, 60]); p.rect(x - 2, 21, x + 2, 22, [170, 130, 50]); }
    },
  },
  {
    id: 'storm', title: 'Storm at Sea', w: 4, h: 2, draw: (p) => {
      p.vgrad(0, 16, [40, 44, 54], [90, 96, 110], 5);
      for (let i = 0; i < 6; i++) { const cx = 6 + i * 11, cy = 4 + (i % 2) * 2; p.disc(cx, cy, 4, [60, 64, 76]); p.disc(cx + 3, cy + 1, 3, [74, 78, 92]); }
      // lightning
      let x = 48; for (let y = 3; y < 17; y++) { p.set(x, y, [250, 250, 220]); x += y % 3 === 0 ? -1 : y % 5 === 0 ? 1 : 0; }
      p.vgrad(16, 30, [40, 70, 100], [20, 34, 56], 4);
      for (let y = 16; y <= 30; y++) for (let x = 1; x < 63; x++) {
        const w = Math.sin(x * 0.35 + y * 0.8) + Math.sin(x * 0.13 - y * 0.4);
        if (w > 1.4) p.set(x, y, [230, 238, 244]); else if (w > 1.0) p.set(x, y, [110, 150, 180]);
      }
      // a small ship riding a wave
      p.map(['.....w.....', '....ww.....', '...www.w...', '..wwww.ww..', '.....W.....', 'bbbbbbbbbbb', '.bbbbbbbbb.'], { w: [226, 220, 204], W: [70, 44, 26], b: [100, 60, 32] }, 16, 12);
    },
  },
  // ------------------------------------------------------------- 4 x 3
  {
    id: 'aurora', title: 'Northern Lights', w: 4, h: 3, draw: (p) => {
      p.vgrad(0, 34, [8, 12, 30], [30, 40, 80], 6);
      p.speck(40, [220, 230, 255], 1, 1, 62, 30);
      for (let band = 0; band < 3; band++) {
        for (let x = 1; x < 63; x++) {
          const y = 8 + band * 5 + wave(x, [2.5, 1.2], band * 1.7);
          for (let k = 0; k < 6; k++) p.set(x, y + k, mix([90, 240, 170], [30, 60, 90], k / 6 + band * 0.1));
        }
      }
      p.ridge((x) => 30 + wave(x, [2, 1], 6), SNOW);
      p.ridge((x) => 36 + wave(x, [1.5, 0.8], 2), [214, 222, 236]);
      for (const [x, h] of [[4, 12], [9, 9], [14, 14], [52, 11], [57, 15], [61, 9]]) p.pine(x, 44, h, [20, 40, 36], [30, 24, 20], true);
      // a pack of Fellhounds howling on the ridge
      const hound = (x: number, y: number) => p.map(['...n', '..nn', 'nnnn', 'nnnn', 'n..n'], { n: [26, 28, 40] }, x, y);
      hound(26, 25); hound(32, 26); hound(38, 26);
    },
  },
  {
    id: 'valley', title: 'River Valley', w: 4, h: 3, draw: (p) => {
      p.vgrad(0, 16, SKY_HI, [206, 228, 246], 6);
      p.map(['...wwww....', '.wwwwwwwww.', 'wwwwwwwwwww'], { w: [250, 250, 252] }, 38, 4);
      p.ridge((x) => 12 + wave(x, [3, 1.5], 3), (x, y, top) => (y - top < 2 ? SNOW : [124, 134, 160]), 22);
      p.ridge((x) => 18 + wave(x, [2, 1], 8), [80, 128, 80]);
      p.ridge((x) => 24 + wave(x, [1.5, 0.8], 1), GRASS);
      // patchwork fields
      for (let y = 26; y <= 46; y++) for (let x = 1; x < 63; x++) {
        const cell = Math.floor(x / 9) + Math.floor((y - 24) / 6) * 3;
        const f: RGB = [[110, 168, 70], [196, 176, 90], [92, 146, 60], [150, 172, 80]][cell % 4] as RGB;
        p.set(x, y, shade(f, 0.92 + ((x + y) % 3) * 0.04));
      }
      // the river winds down towards the viewer
      for (let y = 20; y <= 46; y++) {
        const cx = 32 + Math.sin(y * 0.22) * 8 + (y - 20) * 0.2, half = 0.8 + (y - 20) * 0.12;
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, (x + y) % 5 === 0 ? WATER_L : WATER);
      }
      for (const [x, y] of [[8, 30], [14, 34], [52, 29], [58, 36], [46, 40], [20, 42]]) p.tree(x, y, 1.6, [48, 104, 44]);
      p.rect(24, 36, 31, 36, [120, 90, 60]); p.set(24, 35, [120, 90, 60]); p.set(31, 35, [120, 90, 60]);
    },
  },
];

const textures = new Map<string, HTMLCanvasElement>();

/** The finished picture of a motif (cached): 16 pixels per block, framed. */
export function paintingCanvas(m: Motif): HTMLCanvasElement {
  let c = textures.get(m.id);
  if (c) return c;
  const p = new Pix(m.w * 16, m.h * 16, [...m.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0);
  m.draw(p);
  // anything a motif left unpainted continues the colour above it (or below, at the top)
  for (let x = 0; x < p.w; x++) {
    const a = (y: number) => p.d[(y * p.w + x) * 4 + 3];
    for (let y = 1; y < p.h; y++) if (a(y) === 0 && a(y - 1) > 0) p.set(x, y, p.get(x, y - 1));
    for (let y = p.h - 2; y >= 0; y--) if (a(y) === 0 && a(y + 1) > 0) p.set(x, y, p.get(x, y + 1));
  }
  p.frame();
  c = document.createElement('canvas');
  c.width = p.w; c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.d), p.w, p.h), 0, 0);
  textures.set(m.id, c);
  return c;
}

export function motifById(id: string): Motif | undefined {
  return MOTIFS.find((m) => m.id === id);
}
