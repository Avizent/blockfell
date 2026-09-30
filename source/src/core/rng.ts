/** Deterministic pseudo-random helpers (identical results on every thread/browser). */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer hash of up to four integers (xxhash-style avalanche). */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h ^= Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae3d);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash -> [0,1) */
export function hashFloat(a: number, b: number, c: number, d: number): number {
  return hash4(a, b, c, d) / 4294967296;
}

/** Turns any seed text into a 32-bit integer. Numeric strings map to themselves (like the reference game). */
export function seedFromString(text: string): number {
  const t = text.trim();
  if (t === '') return (Math.random() * 0x7fffffff) | 0;
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n | 0;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
