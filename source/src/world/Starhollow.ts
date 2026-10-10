import { Noise } from './NoiseGenerator';
import { hash4, hashFloat, mulberry32 } from '../core/rng';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT, localIndex } from './constants';
import * as B from './BlockRegistry';
import { BIOME_STARHOLLOW } from './BiomeSystem';
import type { ColumnInfo, GeneratedChunk, GeneratedContainer, GeneratedSpawner, GenOptions } from './TerrainGenerator';
import type { DimensionGenerator } from './generators';

/**
 * THE STARHOLLOW (2.2)
 * ====================
 * A third landscape, reached through a Stargate: islands of pale Starstone
 * floating in an endless starry void. The great island in the middle carries the
 * Hollowdrake's Roost (a ring of Glimmerstone round the Roost stone, on a brick
 * platform) and four pylons of Starstone Bricks with a crystal Storm Bell on top.
 * Arrivals come in at a lit Stargate on the island's south side. Far out, past a
 * gap only wings (or long bridges) can cross, smaller islands drift at different
 * heights, with Starblooms and now and then a ruined Starfall shrine with a chest.
 *
 * Every chunk is a pure function of (seed, chunk), like the other landscapes.
 */
export const STAR_GEN_VERSION = 1;
/** Height of the main island's flat middle (the Roost platform is at this height). */
export const ISLAND_TOP = 64;
/** The Roost stone (the middle of the Hollowdrake's gate ring). */
export const ROOST = { x: 0, y: ISLAND_TOP + 1, z: 0 };
/** Where arrivals come in: a lit Stargate on the main island. */
export const ARRIVAL = { x: 0, y: ISLAND_TOP + 1, z: 44 };
/** The four Storm Bell pylons: column centre and height above the island top. */
export const PYLONS: { x: number; z: number; h: number }[] = [
  { x: 18, z: 18, h: 14 }, { x: -18, z: 18, h: 17 }, { x: -18, z: -18, h: 20 }, { x: 18, z: -18, h: 23 },
];
/** Where each pylon's Storm Bell hangs. */
export const bellPos = (i: number) => ({ x: PYLONS[i].x, y: ISLAND_TOP + PYLONS[i].h + 1, z: PYLONS[i].z });
/** Outer islands lie beyond this distance from the middle. */
const OUTER = 112;
const CELL = 44;

export class StarGenerator implements DimensionGenerator {
  readonly dim = 'starhollow' as const;
  readonly seed: number;
  readonly version: number;
  readonly villages = null;
  readonly opts: GenOptions;
  private rim: Noise;
  private top: Noise;
  private under: Noise;
  private bloom: Noise;

  constructor(seed: number, opts: GenOptions = { structures: true }) {
    this.seed = (seed ^ 0x57a110) | 0;
    this.opts = opts;
    this.version = opts.version ?? STAR_GEN_VERSION;
    const s = this.seed;
    this.rim = new Noise(s ^ 0x1a11);
    this.top = new Noise(s ^ 0x2b22);
    this.under = new Noise(s ^ 0x3c33);
    this.bloom = new Noise(s ^ 0x4d44);
  }

  column(wx: number, wz: number, out: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 }): ColumnInfo {
    const m = this.mainIsland(wx, wz);
    out.height = m ? m.top : 0; out.biome = BIOME_STARHOLLOW; out.mountain = 0; out.river = 0;
    return out;
  }

  /** Nobody starts here (players arrive through a Stargate): beside the arrival gate. */
  findSpawn(): { x: number; y: number; z: number } {
    return { x: ARRIVAL.x + 2.5, y: ARRIVAL.y, z: ARRIVAL.z + 0.5 };
  }

  /** The main island at a column: its top and bottom heights, or null over the void. */
  mainIsland(wx: number, wz: number): { top: number; bottom: number } | null {
    const r = Math.hypot(wx, wz);
    if (r > 84) return null;
    const a = Math.atan2(wz, wx);
    const R = 66 + this.rim.noise2(Math.cos(a) * 1.6, Math.sin(a) * 1.6) * 12;
    if (r >= R) return null;
    // flat round the Roost and the arrival gate; gently rolling elsewhere, falling away at the rim
    const flat = Math.min(1, Math.max(0, (r - 30) / 10)) * Math.min(1, Math.max(0, (Math.hypot(wx - ARRIVAL.x, wz - ARRIVAL.z) - 7) / 6));
    let top = ISLAND_TOP + Math.round(this.top.fbm2(wx / 34, wz / 34, 2) * 4 * flat);
    if (r > R - 9) top -= Math.round((r - (R - 9)) * 0.5);
    const k = 1 - (r / R) * (r / R);
    const bottom = Math.round(ISLAND_TOP - 4 - 34 * Math.pow(k, 1.2) - this.under.noise2(wx / 9, wz / 9) * 4 * k);
    if (bottom >= top) return null;
    return { top, bottom };
  }

  /** An outer island in grid cell (ci, cj), or null (cells inside OUTER have none). */
  private outerIsland(ci: number, cj: number): { x: number; z: number; r: number; y: number; shrine: boolean } | null {
    const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
    if (Math.hypot(cx, cz) < OUTER + 10) return null;
    if (hashFloat(this.seed, ci, 77, cj) > 0.62) return null;
    const x = Math.floor(cx + (hashFloat(this.seed, ci, 78, cj) - 0.5) * CELL * 0.5);
    const z = Math.floor(cz + (hashFloat(this.seed, ci, 79, cj) - 0.5) * CELL * 0.5);
    const r = 7 + Math.floor(hashFloat(this.seed, ci, 80, cj) * 11);
    const y = 48 + Math.floor(hashFloat(this.seed, ci, 81, cj) * 34);
    return { x, z, r, y, shrine: r >= 12 && hashFloat(this.seed, ci, 82, cj) < 0.45 };
  }

  generateChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const containers: GeneratedContainer[] = [];
    const spawners: GeneratedSpawner[] = [];
    const X = cx * CHUNK_SIZE, Z = cz * CHUNK_SIZE;
    const set = (wx: number, y: number, wz: number, b: number) => {
      const lx = wx - X, lz = wz - Z;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= WORLD_HEIGHT) return;
      blocks[localIndex(lx, y, lz)] = b;
    };
    const get = (wx: number, y: number, wz: number) => blocks[localIndex(wx - X, y, wz - Z)];

    // ---- the main island
    if (Math.abs(X + 8) < 100 && Math.abs(Z + 8) < 100) {
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const wx = X + lx, wz = Z + lz;
        const m = this.mainIsland(wx, wz);
        if (!m) continue;
        for (let y = Math.max(1, m.bottom); y <= m.top; y++) set(wx, y, wz, B.STARSTONE);
        // Starblooms in patches, not on the Roost platform, the pylons or the arrival pad
        const r = Math.hypot(wx, wz);
        if (r > 9 && Math.hypot(wx - ARRIVAL.x, wz - ARRIVAL.z) > 4 && !PYLONS.some((p) => Math.abs(wx - p.x) <= 2 && Math.abs(wz - p.z) <= 2)
          && this.bloom.noise2(wx / 7, wz / 7) > 0.45 && hashFloat(this.seed, wx, 5, wz) < 0.22) set(wx, m.top + 1, wz, B.STARBLOOM);
      }
      this.stampRoost(set);
      this.stampArrival(set);
      for (const p of PYLONS) this.stampPylon(p, set);
    }

    // ---- outer islands (grid cells overlapping this chunk)
    const c0 = Math.floor((X - 30) / CELL), c1 = Math.floor((X + 46) / CELL);
    const d0 = Math.floor((Z - 30) / CELL), d1 = Math.floor((Z + 46) / CELL);
    for (let ci = c0; ci <= c1; ci++) for (let cj = d0; cj <= d1; cj++) {
      const isl = this.outerIsland(ci, cj);
      if (!isl || isl.x + isl.r + 4 < X || isl.x - isl.r - 4 > X + 15 || isl.z + isl.r + 4 < Z || isl.z - isl.r - 4 > Z + 15) continue;
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const wx = X + lx, wz = Z + lz;
        const d = Math.hypot(wx - isl.x, wz - isl.z);
        const rr = isl.r + this.rim.noise2(wx / 6, wz / 6) * 2.5;
        if (d >= rr) continue;
        const k = 1 - (d / rr) * (d / rr);
        const top = isl.y + Math.round(this.top.noise2(wx / 9, wz / 9) * 1.5 * k);
        const bottom = Math.round(isl.y - 2 - isl.r * 1.1 * Math.pow(k, 1.3));
        for (let y = Math.max(1, bottom); y <= top; y++) set(wx, y, wz, B.STARSTONE);
        if (hashFloat(this.seed, wx, 6, wz) < 0.09 && !(isl.shrine && d < 5)) set(wx, top + 1, wz, B.STARBLOOM);
      }
      if (isl.shrine) this.stampShrine(isl, set, get, containers, X, Z);
    }
    return { blocks, containers, spawners };
  }

  /** The Hollowdrake's Roost: a 9x9 brick platform with corner posts, and the Roost stone in a ring of Glimmerstone. */
  private stampRoost(set: (x: number, y: number, z: number, b: number) => void): void {
    const y = ISLAND_TOP;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      set(ROOST.x + dx, y, ROOST.z + dz, B.STARSTONE_BRICKS);
      for (let dy = 1; dy <= 6; dy++) set(ROOST.x + dx, y + dy, ROOST.z + dz, B.AIR);
    }
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      for (let dy = 1; dy <= 3; dy++) set(ROOST.x + dx, y + dy, ROOST.z + dz, B.STARSTONE_BRICKS);
      set(ROOST.x + dx, y + 4, ROOST.z + dz, B.GLIMMERSTONE);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(ROOST.x + dx, y + 1, ROOST.z + dz, dx === 0 && dz === 0 ? B.ROOST : B.GLIMMERSTONE);
  }

  /** The arrival pad: a lit Stargate (it leads home) on a little brick square. */
  private stampArrival(set: (x: number, y: number, z: number, b: number) => void): void {
    const y = ISLAND_TOP;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      set(ARRIVAL.x + dx, y, ARRIVAL.z + dz, B.STARSTONE_BRICKS);
      for (let dy = 1; dy <= 4; dy++) set(ARRIVAL.x + dx, y + dy, ARRIVAL.z + dz, B.AIR);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(ARRIVAL.x + dx, y + 1, ARRIVAL.z + dz, dx === 0 && dz === 0 ? B.STARGATE : B.GLIMMERSTONE);
  }

  /**
   * A Storm Bell pylon: a 3x3 column of bricks with glimmering bands, a ladder up the
   * side facing the Roost, and on top a 5x5 platform with a low parapet round the bell
   * (the ladder comes up through a gap at the platform's edge).
   */
  private stampPylon(p: { x: number; z: number; h: number }, set: (x: number, y: number, z: number, b: number) => void): void {
    const y0 = ISLAND_TOP, top = y0 + p.h;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (let y = y0 - 3; y <= top; y++) set(p.x + dx, y, p.z + dz, B.STARSTONE_BRICKS);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      set(p.x + dx, top, p.z + dz, B.STARSTONE_BRICKS);
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      for (let y = top + 1; y <= top + 4; y++) set(p.x + dx, y, p.z + dz, B.AIR);
      if (edge) set(p.x + dx, top + 1, p.z + dz, B.STARSTONE_BRICKS);
    }
    // glimmering bands every 5 blocks
    for (let y = y0 + 4; y < top; y += 5) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) set(p.x + dx, y, p.z + dz, B.GLIMMERSTONE);
    // the ladder: on the side towards the Roost (x), facing it, up through a gap in the platform and parapet
    const sx = p.x > 0 ? -1 : 1;
    const lx = p.x + sx * 2;
    const face = sx < 0 ? 'w' : 'e';
    for (let y = y0 + 1; y <= top; y++) set(lx, y, p.z, B.LADDERS[face]);
    set(lx, top + 1, p.z, B.AIR);
    set(p.x, top + 1, p.z, B.STORM_BELL);
  }

  /** A Starfall shrine on a large outer island: a broken ring of brick pillars round a chest. */
  private stampShrine(isl: { x: number; z: number; y: number }, set: (x: number, y: number, z: number, b: number) => void,
    get: (x: number, y: number, z: number) => number, containers: GeneratedContainer[], X: number, Z: number): void {
    const rng = mulberry32(hash4(this.seed, isl.x, isl.z, 0x5ab1));
    const y = isl.y + 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, px = Math.round(isl.x + Math.cos(a) * 3.5), pz = Math.round(isl.z + Math.sin(a) * 3.5);
      const h = 1 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) set(px, y + dy, pz, B.STARSTONE_BRICKS);
      if (h === 3) set(px, y + 3, pz, B.GLIMMERSTONE);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(isl.x + dx, y - 1, isl.z + dz, B.STARSTONE_BRICKS);
    set(isl.x, y, isl.z, B.CHEST[0]);
    if (isl.x >= X && isl.x < X + 16 && isl.z >= Z && isl.z < Z + 16) {
      void get;
      containers.push({ x: isl.x, y, z: isl.z, loot: 'starfall' });
    }
  }
}
