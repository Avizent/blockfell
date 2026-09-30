import { Noise, smoothstep } from './NoiseGenerator';
import { hash4, hashFloat, mulberry32, randInt } from '../core/rng';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT, localIndex } from './constants';
import * as B from './BlockRegistry';
import { VillagePlanner } from './Villages';
import { placeDungeon, placeLavaLake } from './Dungeons';
import {
  BIOMES, BIOME_BADLANDS, BIOME_BEACH, BIOME_BIRCH, BIOME_DESERT, BIOME_FOREST, BIOME_MOUNTAINS, BIOME_OCEAN, BIOME_PLAINS,
  BIOME_RIVER, BIOME_SNOWY, BIOME_TAIGA,
} from './BiomeSystem';

/** Newest terrain version. Worlds remember theirs so saved landscapes never change. */
export const GEN_VERSION = 5;

export interface GenOptions {
  structures: boolean;
  /**
   * 1 = the original 1.0 landscape; 2 adds Birch Forest, Taiga, Badlands, cacti, spruce and birch trees;
   * 3 adds villages; 4 wild Skybells and Moon Daisies; 5 lava (caves below height 11, buried lava lakes) and dungeons.
   */
  version?: number;
}

export interface ColumnInfo {
  height: number;       // y of the top solid block
  biome: number;
  mountain: number;     // 0..1 mountain weight
  river: number;        // 0..1 river factor
}

/** A generated structure that owns a container (chest) whose loot is created lazily. */
export interface GeneratedContainer {
  x: number; y: number; z: number;
  loot: 'ruin' | 'village' | 'dungeon';
}

/** A Monster Cage placed by generation and the creature it makes. */
export interface GeneratedSpawner {
  x: number; y: number; z: number;
  mob: string;
}

export interface GeneratedChunk {
  blocks: Uint8Array;
  containers: GeneratedContainer[];
  spawners: GeneratedSpawner[];
}

const CAVE_STEP = 4;               // cave noise lattice spacing (world aligned)
const CAVE_NY = WORLD_HEIGHT / CAVE_STEP + 1;

/**
 * Deterministic, chunk-local terrain generation. Every function here is a pure
 * function of (seed, world coordinates); that is what lets a chunk be regenerated
 * identically after unloading and lets trees that straddle chunk borders be
 * reproduced exactly by each chunk they touch.
 */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class TerrainGenerator {
  readonly seed: number;
  readonly opts: GenOptions;
  private continent: Noise;
  private erosion: Noise;
  private detail: Noise;
  private mountainMask: Noise;
  private ridges: Noise;
  private rivers: Noise;
  private temperature: Noise;
  private humidity: Noise;
  private caveA: Noise;
  private caveB: Noise;
  private caveC: Noise;
  private surfaceNoise: Noise;

  readonly version: number;
  /** Village plans (terrain version 3+, with structures on). */
  readonly villages: VillagePlanner | null;

  constructor(seed: number, opts: GenOptions = { structures: true }) {
    this.seed = seed | 0;
    this.opts = opts;
    this.version = opts.version ?? GEN_VERSION;
    this.villages = this.version >= 3 && opts.structures ? new VillagePlanner(this.seed, this) : null;
    const s = this.seed;
    this.continent = new Noise(s ^ 0x1234567);
    this.erosion = new Noise(s ^ 0x2345678);
    this.detail = new Noise(s ^ 0x3456789);
    this.mountainMask = new Noise(s ^ 0x456789a);
    this.ridges = new Noise(s ^ 0x56789ab);
    this.rivers = new Noise(s ^ 0x6789abc);
    this.temperature = new Noise(s ^ 0x789abcd);
    this.humidity = new Noise(s ^ 0x89abcde);
    this.caveA = new Noise(s ^ 0x9abcdef);
    this.caveB = new Noise(s ^ 0x0fedcba);
    this.caveC = new Noise(s ^ 0x1fedcba);
    this.surfaceNoise = new Noise(s ^ 0x2fedcba);
  }

  // ------------------------------------------------------------------ heights

  column(wx: number, wz: number, out: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 }): ColumnInfo {
    const c = this.continent.fbm2(wx / 720, wz / 720, 4);
    const e = this.erosion.fbm2(wx / 340, wz / 340, 3);
    const d = this.detail.fbm2(wx / 96, wz / 96, 4);

    // continentalness spline: ocean floor -> coast -> inland plateaus
    let base: number;
    if (c < -0.4) base = 34 + (c + 1) / 0.6 * 10;
    else if (c < -0.18) base = 44 + (c + 0.4) / 0.22 * 13;
    else if (c < -0.05) base = 57 + (c + 0.18) / 0.13 * 6;
    else if (c < 0.3) base = 63 + (c + 0.05) / 0.35 * 7;
    else base = 70 + (c - 0.3) / 0.7 * 12;

    const land = smoothstep(-0.16, 0.02, c);
    const hillAmp = 3 + 13 * smoothstep(-0.3, 0.6, e) * (0.35 + 0.65 * land);
    let h = base + d * hillAmp;

    const mm = this.mountainMask.fbm2(wx / 560, wz / 560, 2);
    const mountain = smoothstep(0.12, 0.42, mm) * land;
    if (mountain > 0) {
      const r = this.ridges.ridged2(wx / 240, wz / 240, 4);
      h += mountain * (r * r * 58 + 6);
    }

    // rivers follow the zero contour of a noise field, carving valleys down to the water line
    const rv = Math.abs(this.rivers.fbm2(wx / 460, wz / 460, 3));
    let river = (1 - smoothstep(0.012, 0.055, rv)) * land;
    river *= 1 - mountain * 0.6;
    if (river > 0 && h > SEA_LEVEL - 3) {
      const bed = SEA_LEVEL - 2 - river * 2;
      h = h + (bed - h) * river;
    }

    let height = Math.max(4, Math.min(WORLD_HEIGHT - 6, Math.floor(h)));

    // biome
    let biome: number;
    if (height < SEA_LEVEL - 1) biome = river > 0.35 ? BIOME_RIVER : BIOME_OCEAN;
    else if (river > 0.55) biome = BIOME_RIVER;
    else if (height <= SEA_LEVEL + 1 && c < 0.04) biome = BIOME_BEACH;
    else if (height > 100) biome = BIOME_SNOWY;
    else if (mountain > 0.45 && height > 84) biome = BIOME_MOUNTAINS;
    else {
      const t = this.temperature.fbm2(wx / 900, wz / 900, 2);
      const hu = this.humidity.fbm2(wx / 780 + 500, wz / 780, 2);
      const v2 = this.version >= 2;
      if (t > 0.22 && hu < 0.02) biome = v2 && t > 0.3 && hu < -0.14 ? BIOME_BADLANDS : BIOME_DESERT;
      else if (hu > 0.08) biome = !v2 ? BIOME_FOREST : t < -0.12 ? BIOME_TAIGA : t > 0.1 ? BIOME_BIRCH : BIOME_FOREST;
      else biome = v2 && t < -0.3 ? BIOME_TAIGA : BIOME_PLAINS;
      if (biome === BIOME_BADLANDS) {
        // mesas: stepped plateaus whose cliffs show the terracotta bands; they fade in
        // from the biome edge so the border has no wall
        const w = clamp01((t - 0.3) / 0.08) * clamp01((-0.14 - hu) / 0.08) * (1 - river);
        const p = this.detail.fbm2((wx + 7919) / 150, (wz - 4099) / 150, 3);
        const extra = (smoothstep(0, 0.08, p) * 15 + smoothstep(0.2, 0.26, p) * 10) * w;
        height = Math.min(WORLD_HEIGHT - 6, height + Math.floor(extra / 5) * 5);
      }
    }
    out.height = height;
    out.biome = biome;
    out.mountain = mountain;
    out.river = river;
    return out;
  }

  // ------------------------------------------------------------------ caves
  private caveCorner(lx: number, ly: number, lz: number, out: Float32Array, o: number): void {
    // lattice coordinates are in world space so every chunk (and point queries) agree exactly
    const x = lx * CAVE_STEP, y = ly * CAVE_STEP, z = lz * CAVE_STEP;
    out[o] = this.caveA.noise3(x / 44, y / 30, z / 44);
    out[o + 1] = this.caveB.noise3(x / 44 + 50, y / 30, z / 44 - 50);
    out[o + 2] = this.caveC.fbm3(x / 80, y / 36, z / 80, 2);
  }

  private static carveTest(a: number, b: number, c: number, y: number): boolean {
    if (y <= 4) return false;
    if (a * a + b * b < 0.0085) return true;                       // spaghetti tunnels
    if (y < 48 && c > 0.34 + (y / 48) * 0.12) return true;         // cheese caverns
    return false;
  }

  private caveGrid = new Float32Array(5 * CAVE_NY * 5 * 3);

  private fillCaveGrid(cx: number, cz: number): void {
    const g = this.caveGrid;
    const bx = cx * (CHUNK_SIZE / CAVE_STEP), bz = cz * (CHUNK_SIZE / CAVE_STEP);
    for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) for (let j = 0; j < CAVE_NY; j++) {
      this.caveCorner(bx + i, j, bz + k, g, ((i * 5 + k) * CAVE_NY + j) * 3);
    }
  }

  /** Trilinear interpolation of the three cave fields (identical math for grid & point queries). */
  private static interp(c: Float32Array, fx: number, fy: number, fz: number, out: Float32Array): void {
    for (let n = 0; n < 3; n++) {
      const x00 = c[n] + (c[3 + n] - c[n]) * fx;          // (0,0,0)-(1,0,0)
      const x10 = c[6 + n] + (c[9 + n] - c[6 + n]) * fx;  // (0,1,0)-(1,1,0)
      const x01 = c[12 + n] + (c[15 + n] - c[12 + n]) * fx; // (0,0,1)-(1,0,1)
      const x11 = c[18 + n] + (c[21 + n] - c[18 + n]) * fx; // (0,1,1)-(1,1,1)
      const y0 = x00 + (x10 - x00) * fy;
      const y1 = x01 + (x11 - x01) * fy;
      out[n] = y0 + (y1 - y0) * fz;
    }
  }

  private corners = new Float32Array(24);
  private cv = new Float32Array(3);

  private gatherFromGrid(i: number, j: number, k: number): void {
    const g = this.caveGrid, c = this.corners;
    let o = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const src = (((i + dx) * 5 + (k + dz)) * CAVE_NY + (j + dy)) * 3;
      c[o] = g[src]; c[o + 1] = g[src + 1]; c[o + 2] = g[src + 2];
      o += 3;
    }
  }

  /** Point query used for decorations whose trunk sits in another chunk. */
  isCave(wx: number, wy: number, wz: number): boolean {
    const i = Math.floor(wx / CAVE_STEP), j = Math.floor(wy / CAVE_STEP), k = Math.floor(wz / CAVE_STEP);
    const c = this.corners;
    let o = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      this.caveCorner(i + dx, j + dy, k + dz, c, o);
      o += 3;
    }
    TerrainGenerator.interp(c, (wx - i * CAVE_STEP) / CAVE_STEP, (wy - j * CAVE_STEP) / CAVE_STEP, (wz - k * CAVE_STEP) / CAVE_STEP, this.cv);
    return TerrainGenerator.carveTest(this.cv[0], this.cv[1], this.cv[2], wy);
  }

  private caveAllowed(col: ColumnInfo, y: number): boolean {
    // never breach the floor of oceans/rivers (water is static) and keep a crust under shallow water
    if (col.height < SEA_LEVEL + 1 && y > col.height - 6) return false;
    if (col.river > 0.2 && y > col.height - 5) return false;
    return true;
  }

  // ------------------------------------------------------------------ surface rules
  /** Surface block for a column (top block before caves/decoration). */
  surfaceBlock(col: ColumnInfo, steep: boolean): number {
    const h = col.height;
    switch (col.biome) {
      case BIOME_OCEAN: return h < 50 ? B.GRAVEL : B.SAND;
      case BIOME_RIVER: return h >= SEA_LEVEL ? B.GRASS : B.SAND;
      case BIOME_BEACH:
      case BIOME_DESERT: return B.SAND;
      case BIOME_BADLANDS: return steep ? B.TERRACOTTA[1] : B.RED_SAND;
      case BIOME_SNOWY: return steep ? B.STONE : B.SNOWY_GRASS;
      case BIOME_MOUNTAINS: return steep ? B.STONE : B.GRASS;
      default: return steep && h > 80 ? B.STONE : B.GRASS;
    }
  }

  private steepAt(wx: number, wz: number, h: number, tmp: ColumnInfo): boolean {
    let m = 0;
    m = Math.max(m, Math.abs(this.column(wx + 1, wz, tmp).height - h));
    m = Math.max(m, Math.abs(this.column(wx - 1, wz, tmp).height - h));
    m = Math.max(m, Math.abs(this.column(wx, wz + 1, tmp).height - h));
    m = Math.max(m, Math.abs(this.column(wx, wz - 1, tmp).height - h));
    return m >= 4;
  }

  // ------------------------------------------------------------------ trees
  /**
   * Trees are placed on a jittered 5x5 grid. Each grid cell has at most one
   * candidate; acceptance depends only on seed + position, so neighbouring
   * chunks agree about every tree even if they cannot see its trunk.
   */
  private treeAt(cellX: number, cellZ: number, tmp: ColumnInfo): { x: number; z: number; y: number; h: number; kind: 'oak' | 'birch' | 'spruce' } | null {
    const hsh = hash4(this.seed, cellX, cellZ, 0x7ee);
    const x = cellX * 5 + (hsh & 3) + ((hsh >>> 2) & 1);
    const z = cellZ * 5 + ((hsh >>> 4) & 3) + ((hsh >>> 6) & 1);
    const col = this.column(x, z, tmp);
    const chance = BIOMES[col.biome].treeChance;
    if (chance <= 0) return null;
    if (((hsh >>> 8) & 0xffff) / 65536 >= chance) return null;
    if (col.height <= SEA_LEVEL || col.height > WORLD_HEIGHT - 12) return null;
    const biome = col.biome, height = col.height;
    if (this.steepAt(x, z, height, tmp)) return null;
    col.biome = biome; col.height = height;
    if (this.isCave(x, height, z)) return null;
    if (this.villages?.inVillage(x, z, 4)) return null;
    let kind: 'oak' | 'birch' | 'spruce' = 'oak';
    if (this.version >= 2) {
      if (biome === BIOME_TAIGA) kind = 'spruce';
      else if (biome === BIOME_BIRCH || (biome === BIOME_FOREST && ((hsh >>> 20) & 7) === 0)) kind = 'birch';
      else if (biome === BIOME_SNOWY || (biome === BIOME_MOUNTAINS && ((hsh >>> 20) & 3) === 0)) kind = 'spruce';
    }
    const th = kind === 'spruce' ? 6 + ((hsh >>> 24) % 4) : kind === 'birch' ? 5 + ((hsh >>> 24) % 3) : 4 + ((hsh >>> 24) % 3);
    return { x, z, y: height + 1, h: th, kind };
  }

  private placeTrees(cx: number, cz: number, blocks: Uint8Array): void {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const tmp: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 };
    const cMinX = Math.floor((x0 - 3) / 5), cMaxX = Math.floor((x0 + 18) / 5);
    const cMinZ = Math.floor((z0 - 3) / 5), cMaxZ = Math.floor((z0 + 18) / 5);
    for (let gx = cMinX; gx <= cMaxX; gx++) {
      for (let gz = cMinZ; gz <= cMaxZ; gz++) {
        const t = this.treeAt(gx, gz, tmp);
        if (!t) continue;
        if (t.x < x0 - 2 || t.x > x0 + 17 || t.z < z0 - 2 || t.z > z0 + 17) continue;
        if (t.kind === 'spruce') this.stampSpruce(t.x - x0, t.y, t.z - z0, t.h, blocks);
        else this.stampTree(t.x - x0, t.y, t.z - z0, t.h, hash4(this.seed, t.x, t.z, 0xbee), blocks, t.kind === 'birch');
      }
    }
  }

  private stampTree(lx: number, y: number, lz: number, th: number, hsh: number, blocks: Uint8Array, birch = false): void {
    const top = y + th - 1;
    const LEAF = birch ? B.BIRCH_LEAVES : B.LEAVES, LOG = birch ? B.BIRCH_LOG : B.LOG;
    const setLeaf = (x: number, yy: number, z: number) => {
      if (x < 0 || x > 15 || z < 0 || z > 15 || yy < 0 || yy >= WORLD_HEIGHT) return;
      const i = localIndex(x, yy, z);
      const b = blocks[i];
      if (b === B.AIR || b === B.TALL_GRASS || b === B.FLOWER_RED || b === B.FLOWER_YELLOW || b === B.FLOWER_BLUE || b === B.FLOWER_WHITE) blocks[i] = LEAF;
    };
    let bit = 0;
    for (let yy = top - 2; yy <= top + 1; yy++) {
      const r = yy <= top - 1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner) {
          bit++;
          if (yy === top + 1) continue;
          if (((hsh >>> (bit & 31)) & 1) === 0) continue;
        }
        setLeaf(lx + dx, yy, lz + dz);
      }
    }
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
      for (let yy = y; yy <= top; yy++) {
        if (yy >= WORLD_HEIGHT) break;
        const i = localIndex(lx, yy, lz);
        const b = blocks[i];
        if (b === B.AIR || b === LEAF || b === B.TALL_GRASS || b === B.FLOWER_RED || b === B.FLOWER_YELLOW || b === B.FLOWER_BLUE || b === B.FLOWER_WHITE) blocks[i] = LOG;
      }
      const below = localIndex(lx, y - 1, lz);
      if (blocks[below] === B.GRASS || blocks[below] === B.SNOWY_GRASS) blocks[below] = B.DIRT;
    }
  }

  /** Spruce: a tall trunk with a cone of needles in alternating wide and narrow rings. */
  private stampSpruce(lx: number, y: number, lz: number, th: number, blocks: Uint8Array): void {
    const top = y + th - 1;
    const setLeaf = (x: number, yy: number, z: number) => {
      if (x < 0 || x > 15 || z < 0 || z > 15 || yy < 0 || yy >= WORLD_HEIGHT) return;
      const i = localIndex(x, yy, z);
      const b = blocks[i];
      if (b === B.AIR || b === B.TALL_GRASS || b === B.FLOWER_RED || b === B.FLOWER_YELLOW || b === B.FLOWER_BLUE || b === B.FLOWER_WHITE || b === B.SNOW) blocks[i] = B.SPRUCE_LEAVES;
    };
    // A jagged cone: a spike on top, then layers that alternate between a narrow
    // "plus" ring and a wider ring (3x3 near the top, rounded 5x5 lower down).
    setLeaf(lx, top + 1, lz);
    for (let yy = top; yy >= y + 2; yy--) {
      const k = top - yy;
      const wide = k % 2 === 1;
      const r = wide ? (k >= 3 ? 2 : 1) : 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0) continue;
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (!wide || r === 2)) continue;   // narrow rings are plus-shaped, wide ones rounded
        setLeaf(lx + dx, yy, lz + dz);
      }
    }
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
      for (let yy = y; yy <= top; yy++) {
        if (yy >= WORLD_HEIGHT) break;
        const i = localIndex(lx, yy, lz);
        const b = blocks[i];
        if (b === B.AIR || b === B.SPRUCE_LEAVES || b === B.TALL_GRASS || b === B.FLOWER_RED || b === B.FLOWER_YELLOW || b === B.FLOWER_BLUE || b === B.FLOWER_WHITE) blocks[i] = B.SPRUCE_LOG;
      }
      const below = localIndex(lx, y - 1, lz);
      if (blocks[below] === B.GRASS || blocks[below] === B.SNOWY_GRASS) blocks[below] = B.DIRT;
    }
  }

  // ------------------------------------------------------------------ chunk
  generateChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const containers: GeneratedContainer[] = [];
    const spawners: GeneratedSpawner[] = [];
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;

    // heights for an 18x18 area so slopes can be evaluated at the border
    const H = new Int16Array(18 * 18);
    const cols: ColumnInfo[] = new Array(256);
    const tmp: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 };
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
      const inside = x >= 0 && x < 16 && z >= 0 && z < 16;
      const info = this.column(x0 + x, z0 + z, inside ? { height: 0, biome: 0, mountain: 0, river: 0 } : tmp);
      H[(z + 1) * 18 + (x + 1)] = info.height;
      if (inside) cols[x | (z << 4)] = info;
    }

    this.fillCaveGrid(cx, cz);
    const rng = mulberry32(hash4(this.seed, cx, cz, 0x5eed));

    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const col = cols[lx | (lz << 4)];
        const h = col.height;
        const hc = H[(lz + 1) * 18 + lx + 1];
        const steep = Math.max(
          Math.abs(H[(lz + 1) * 18 + lx + 2] - hc), Math.abs(H[(lz + 1) * 18 + lx] - hc),
          Math.abs(H[(lz + 2) * 18 + lx + 1] - hc), Math.abs(H[lz * 18 + lx + 1] - hc)) >= 4;
        const top = this.surfaceBlock(col, steep);
        const wx = x0 + lx, wz = z0 + lz;
        const soilDepth = 3 + (hash4(this.seed, wx, wz, 1) & 1);
        let filler: number = B.DIRT;
        let deep: number = B.STONE;
        const badlands = col.biome === BIOME_BADLANDS;
        if (top === B.SAND) { filler = B.SAND; deep = col.biome === BIOME_DESERT || col.biome === BIOME_BEACH ? B.SANDSTONE : B.STONE; }
        else if (badlands) filler = B.RED_SAND;
        else if (top === B.GRAVEL) filler = B.GRAVEL;
        else if (top === B.STONE) filler = B.STONE;

        // column fill
        for (let y = 0; y <= h; y++) {
          let b: number;
          if (y === 0) b = B.BEDROCK;
          else if (y < 4 && hashFloat(this.seed, wx, y, wz) < 0.8 - y * 0.25) b = B.BEDROCK;
          else if (y === h) b = top;
          else if (badlands && (top !== B.RED_SAND || y <= h - soilDepth) && y > h - 22) b = this.clayBand(y);
          else if (y > h - soilDepth) b = filler;
          else if (y > h - soilDepth - 3 && deep === B.SANDSTONE) b = B.SANDSTONE;
          else b = B.STONE;
          blocks[localIndex(lx, y, lz)] = b;
        }
        // grass/snow under water becomes dirt/sand
        if (h < SEA_LEVEL && (top === B.GRASS || top === B.SNOWY_GRASS)) blocks[localIndex(lx, h, lz)] = B.DIRT;
        // water
        for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[localIndex(lx, y, lz)] = B.WATER;
      }
    }

    // caves: interpolate the world-aligned lattice
    const cvv = this.cv;
    const lavaCaves = this.version >= 5;
    // villages keep a solid crust: no cave mouths opening among the houses and streets
    const villageHere = !!this.villages && this.villages.near(cx * 16 + 8, cz * 16 + 8, 22).length > 0;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const col = cols[lx | (lz << 4)];
        const i = lx >> 2, k = lz >> 2;
        const fx = (lx & 3) / CAVE_STEP, fz = (lz & 3) / CAVE_STEP;
        let maxY = Math.min(col.height, WORLD_HEIGHT - 2);
        if (villageHere && this.villages!.inVillage(cx * 16 + lx, cz * 16 + lz, 6)) maxY = Math.min(maxY, col.height - 10);
        for (let y = 1; y <= maxY; y++) {
          if (!this.caveAllowed(col, y)) continue;
          const j = y >> 2;
          this.gatherFromGrid(i, j, k);
          TerrainGenerator.interp(this.corners, fx, (y & 3) / CAVE_STEP, fz, cvv);
          if (!TerrainGenerator.carveTest(cvv[0], cvv[1], cvv[2], y)) continue;
          const idx = localIndex(lx, y, lz);
          const b = blocks[idx];
          if (b === B.BEDROCK || b === B.WATER) continue;
          // version 5: caves fill with lava below height 11 - the great underground lava lakes
          blocks[idx] = y <= 10 && lavaCaves ? B.LAVA : B.AIR;
        }
      }
    }
    // re-grass dirt that lost its cover to a cave entrance
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const col = cols[lx | (lz << 4)];
      if (col.height <= SEA_LEVEL) continue;
      for (let y = col.height; y > col.height - 6 && y > 1; y--) {
        const idx = localIndex(lx, y, lz);
        if (blocks[idx] === B.DIRT && blocks[idx + 256] === B.AIR) { blocks[idx] = B.GRASS; break; }
        if (blocks[idx] !== B.AIR) break;
      }
    }

    this.placeOres(blocks, rng);
    this.placeRuneOre(cx, cz, blocks);
    if (this.version >= 5) {
      // buried lava lakes, then dungeons (hidden in rock beside caves); both stay inside this chunk
      let minSurface = WORLD_HEIGHT;
      for (const c of cols) minSurface = Math.min(minSurface, c.height);
      placeLavaLake(this.seed, cx, cz, blocks, minSurface);
      if (this.opts.structures) placeDungeon(this.seed, cx, cz, blocks, minSurface, containers, spawners);
    }
    this.placeTrees(cx, cz, blocks);
    this.placePlants(cx, cz, blocks, cols);
    if (this.villages) this.villages.stampChunk(cx, cz, blocks, containers);
    if (this.opts.structures && !this.villages?.inVillage(cx * 16 + 8, cz * 16 + 8, 24)) this.placeRuin(cx, cz, blocks, cols, containers);
    return { blocks, containers, spawners };
  }

  private blob(blocks: Uint8Array, rng: () => number, x: number, y: number, z: number, size: number, block: number, replace: number[]): void {
    for (let n = 0; n < size; n++) {
      if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WORLD_HEIGHT) {
        const i = localIndex(x, y, z);
        if (replace.includes(blocks[i])) blocks[i] = block;
      }
      const d = Math.floor(rng() * 6);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
    }
  }

  private placeOres(blocks: Uint8Array, rng: () => number): void {
    const stone = [B.STONE];
    for (let n = 0; n < 20; n++) this.blob(blocks, rng, randInt(rng, 0, 15), randInt(rng, 6, 110), randInt(rng, 0, 15), randInt(rng, 4, 12), B.COAL_ORE, stone);
    for (let n = 0; n < 12; n++) this.blob(blocks, rng, randInt(rng, 0, 15), randInt(rng, 5, 64), randInt(rng, 0, 15), randInt(rng, 3, 7), B.IRON_ORE, stone);
    for (let n = 0; n < 4; n++) this.blob(blocks, rng, randInt(rng, 0, 15), randInt(rng, 5, 70), randInt(rng, 0, 15), randInt(rng, 10, 24), B.GRAVEL, stone);
    for (let n = 0; n < 4; n++) this.blob(blocks, rng, randInt(rng, 0, 15), randInt(rng, 5, 80), randInt(rng, 0, 15), randInt(rng, 10, 24), B.DIRT, stone);
  }

  /**
   * Rune ore: small deep veins. Uses its own random stream (after all other ores)
   * so adding it did not move anything else in existing worlds.
   */
  private placeRuneOre(cx: number, cz: number, blocks: Uint8Array): void {
    const rng = mulberry32(hash4(this.seed, cx, cz, 0x7a4e));
    for (let n = 0; n < 2; n++) {
      if (rng() < 0.35) continue;
      this.blob(blocks, rng, randInt(rng, 0, 15), randInt(rng, 5, 30), randInt(rng, 0, 15), randInt(rng, 2, 5), B.RUNE_ORE, [B.STONE]);
    }
  }

  /** Badlands clay layers: the same colour at the same height everywhere in a world. */
  private clayBand(y: number): number {
    const h = hash4(this.seed, 0, y >> 1, 0xc1a7);
    const k = h % 7;
    return k < 2 ? B.TERRACOTTA[0] : k < 4 ? B.TERRACOTTA[1] : k === 4 ? B.TERRACOTTA[2] : k === 5 ? B.TERRACOTTA[3] : B.TERRACOTTA[4];
  }

  private placeDryPlants(cx: number, cz: number, blocks: Uint8Array, cols: ColumnInfo[]): void {
    for (let lz = 1; lz < 15; lz++) for (let lx = 1; lx < 15; lx++) {
      const col = cols[lx | (lz << 4)];
      if (col.biome !== BIOME_DESERT && col.biome !== BIOME_BADLANDS) continue;
      if (this.villages?.inVillage(cx * 16 + lx, cz * 16 + lz, 2)) continue;
      const y = col.height + 1;
      if (y >= WORLD_HEIGHT - 4 || col.height <= SEA_LEVEL) continue;
      const below = blocks[localIndex(lx, col.height, lz)];
      if (below !== B.SAND && below !== B.RED_SAND) continue;
      if (blocks[localIndex(lx, y, lz)] !== B.AIR) continue;
      const r = hashFloat(this.seed, cx * 16 + lx, cz * 16 + lz, 0xca7);
      if (r < 0.006) {
        // a cactus needs open space on every side
        const clear = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => blocks[localIndex(lx + dx, y, lz + dz)] === B.AIR);
        if (!clear) continue;
        const h = 1 + (hash4(this.seed, cx * 16 + lx, cz * 16 + lz, 0xca8) % 3);
        for (let k = 0; k < h; k++) blocks[localIndex(lx, y + k, lz)] = B.CACTUS;
      } else if (r < 0.02) {
        blocks[localIndex(lx, y, lz)] = B.DEAD_BUSH;
      }
    }
  }

  private placePlants(cx: number, cz: number, blocks: Uint8Array, cols: ColumnInfo[]): void {
    if (this.version >= 2) this.placeDryPlants(cx, cz, blocks, cols);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const col = cols[lx | (lz << 4)];
      const y = col.height + 1;
      if (y >= WORLD_HEIGHT || col.height <= SEA_LEVEL) continue;
      const below = blocks[localIndex(lx, col.height, lz)];
      if (below !== B.GRASS) continue;
      const i = localIndex(lx, y, lz);
      if (blocks[i] !== B.AIR) continue;
      const biome = BIOMES[col.biome];
      const r = hashFloat(this.seed, cx * 16 + lx, cz * 16 + lz, 0x91a);
      if (r < biome.flowerChance) {
        const cluster = this.surfaceNoise.noise2((cx * 16 + lx) / 24, (cz * 16 + lz) / 24);
        blocks[i] = cluster > 0 ? B.FLOWER_RED : B.FLOWER_YELLOW;
        if (this.version >= 4) {
          // version 4 worlds also grow Skybells and Moon Daisies (in patches of their own)
          const kind = this.surfaceNoise.noise2((cx * 16 + lx) / 40 + 300, (cz * 16 + lz) / 40 - 300);
          if (kind > 0.3) blocks[i] = B.FLOWER_BLUE;
          else if (kind < -0.3) blocks[i] = B.FLOWER_WHITE;
        }
      } else if (r < biome.flowerChance + biome.grassChance) {
        blocks[i] = B.TALL_GRASS;
      }
    }
  }

  /** Small abandoned cobblestone ruin with a loot chest ("Generate Structures"). */
  private placeRuin(cx: number, cz: number, blocks: Uint8Array, cols: ColumnInfo[], containers: GeneratedContainer[]): void {
    if (hashFloat(this.seed, cx, cz, 0x5a1) >= 1 / 42) return;
    const center = cols[8 | (8 << 4)];
    if (center.height <= SEA_LEVEL + 1 || center.biome === BIOME_SNOWY || center.biome === BIOME_RIVER || center.biome === BIOME_OCEAN) return;
    // reject steep sites
    let minH = 999, maxH = -1;
    for (let z = 4; z <= 11; z++) for (let x = 4; x <= 11; x++) {
      const hh = cols[x | (z << 4)].height; minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
    }
    if (maxH - minH > 4 || center.biome === BIOME_MOUNTAINS && maxH - minH > 2) return;
    const floor = center.height;
    const rng = mulberry32(hash4(this.seed, cx, cz, 0x2a1));
    const stoneMix = () => (rng() < 0.35 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE);
    for (let z = 4; z <= 10; z++) for (let x = 4; x <= 10; x++) {
      // foundation down to terrain, clear space above
      for (let y = floor; y > floor - 8 && y > 1; y--) {
        const i = localIndex(x, y, z);
        if (y === floor || blocks[i] === B.AIR || blocks[i] === B.WATER || blocks[i] === B.TALL_GRASS) blocks[i] = y === floor ? stoneMix() : B.COBBLESTONE;
        else break;
      }
      for (let y = floor + 1; y <= floor + 5; y++) blocks[localIndex(x, y, z)] = B.AIR;
      const wall = x === 4 || x === 10 || z === 4 || z === 10;
      if (wall) {
        const wallH = 1 + Math.floor(rng() * 3.2);
        const isDoor = z === 10 && x === 7;
        for (let y = floor + 1; y <= floor + wallH; y++) {
          if (isDoor && y <= floor + 2) continue;
          if (rng() < 0.18) continue;
          blocks[localIndex(x, y, z)] = (x === 4 || x === 10) && (z === 4 || z === 10) ? B.LOG : stoneMix();
        }
      }
    }
    blocks[localIndex(7, floor + 1, 5)] = B.CHEST[2]; // facing south, toward the doorway
    blocks[localIndex(5, floor + 1, 5)] = B.CRAFTING_TABLE;
    containers.push({ x: cx * 16 + 7, y: floor + 1, z: cz * 16 + 5, loot: 'ruin' });
  }

  /** Finds a dry spawn column near the origin (pure: same seed, same spawn). */
  findSpawn(): { x: number; y: number; z: number } {
    const tmp: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 };
    for (let r = 0; r < 64; r++) {
      for (let i = -r; i <= r; i++) {
        for (const [dx, dz] of [[i, -r], [i, r], [-r, i], [r, i]] as const) {
          const x = dx * 8 + 0.5, z = dz * 8 + 0.5;
          const col = this.column(Math.floor(x), Math.floor(z), tmp);
          if (col.height > SEA_LEVEL && col.biome !== BIOME_RIVER && col.biome !== BIOME_OCEAN && col.biome !== BIOME_MOUNTAINS && col.biome !== BIOME_SNOWY) {
            if (this.isCave(Math.floor(x), col.height, Math.floor(z))) continue;
            return { x, y: col.height + 1, z };
          }
        }
      }
    }
    return { x: 0.5, y: 100, z: 0.5 };
  }
}

export function biomeName(id: number): string {
  return BIOMES[id]?.name ?? 'Unknown';
}
export { BIOME_PLAINS, BIOME_FOREST, BIOME_BIRCH, BIOME_TAIGA, BIOME_BADLANDS };
