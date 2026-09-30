import { mulberry32 } from '../core/rng';

/**
 * Seeded gradient noise (Ken Perlin's "improved noise") in 2D and 3D, plus
 * fractal helpers. A permutation table is derived from the seed, so the same
 * seed always produces the same terrain.
 */
export class Noise {
  private p = new Uint8Array(512);

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  noise2(x: number, y: number): number {
    const p = this.p;
    const xf = Math.floor(x), yf = Math.floor(y);
    const X = xf & 255, Y = yf & 255;
    x -= xf; y -= yf;
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const r = lerp(v,
      lerp(u, grad2(aa, x, y), grad2(ba, x - 1, y)),
      lerp(u, grad2(ab, x, y - 1), grad2(bb, x - 1, y - 1)));
    return r * 1.414; // roughly [-1, 1]
  }

  noise3(x: number, y: number, z: number): number {
    const p = this.p;
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    const X = xf & 255, Y = yf & 255, Z = zf & 255;
    x -= xf; y -= yf; z -= zf;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(w,
      lerp(v,
        lerp(u, grad3(p[AA], x, y, z), grad3(p[BA], x - 1, y, z)),
        lerp(u, grad3(p[AB], x, y - 1, z), grad3(p[BB], x - 1, y - 1, z))),
      lerp(v,
        lerp(u, grad3(p[AA + 1], x, y, z - 1), grad3(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad3(p[AB + 1], x, y - 1, z - 1), grad3(p[BB + 1], x - 1, y - 1, z - 1))));
  }

  /** Fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm2(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * f + i * 31.7, y * f - i * 17.3) * amp;
      norm += amp; amp *= gain; f *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves: number): number {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * f, y * f, z * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }

  /** Ridged multifractal: sharp crests, used for mountain ranges. Range [0, 1]. */
  ridged2(x: number, y: number, octaves: number): number {
    let sum = 0, amp = 1, norm = 0, f = 1, prev = 1;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(this.noise2(x * f + i * 11.1, y * f + i * 7.7));
      n *= n;
      sum += n * amp * prev;
      prev = n;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad2(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
