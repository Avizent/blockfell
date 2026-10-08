import { Noise } from './NoiseGenerator';
import { hash4, hashFloat, mulberry32, randInt } from '../core/rng';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT, localIndex } from './constants';
import * as B from './BlockRegistry';
import { BIOME_CINDERDEEP } from './BiomeSystem';
import type { ColumnInfo, GeneratedChunk, GeneratedContainer, GeneratedSpawner, GenOptions } from './TerrainGenerator';
import type { DimensionGenerator } from './generators';

/**
 * THE CINDERDEEP (2.0)
 * ====================
 * A second landscape under the world, reached through a Deepgate. It is one great
 * enclosed cave: a floor and roof of bedrock, Ashrock everywhere else, carved into
 * huge caverns by 3D noise, with a sea of lava filling everything below height 24.
 * Pillars run from floor to roof, Ember Ore glints in the rock, Fire Opal hides near
 * the lava sea, Glowcaps and ash cover the floors, lava falls from the roof here and
 * there, and Ember Shrines - small ruined halls with a Monster Cage and treasure -
 * stand on cavern floors.
 *
 * Like the overworld, every chunk is a pure function of (seed, chunk): caverns come
 * from a noise lattice every 4 blocks (interpolated, the same trick the overworld's
 * caves use), and everything stamped into a chunk stays inside it.
 */
export const CINDER_GEN_VERSION = 1;
/** Everything open at or below this height is lava. */
export const LAVA_SEA = 24;
const STEP = 4;
const NY = WORLD_HEIGHT / STEP + 1;

export class CinderGenerator implements DimensionGenerator {
  readonly dim = 'cinderdeep' as const;
  readonly seed: number;
  readonly version: number;
  readonly villages = null;
  readonly opts: GenOptions;
  private cavA: Noise;
  private cavB: Noise;
  private pillars: Noise;
  private ashN: Noise;
  private capN: Noise;
  private shelf: Noise;
  /** Density lattice for the chunk being made: 5 x NY x 5 values. */
  private grid = new Float32Array(5 * NY * 5);

  constructor(seed: number, opts: GenOptions = { structures: true }) {
    this.seed = (seed ^ 0x5c1d7e) | 0;
    this.opts = opts;
    this.version = opts.version ?? CINDER_GEN_VERSION;
    const s = this.seed;
    this.cavA = new Noise(s ^ 0x11c1d);
    this.cavB = new Noise(s ^ 0x22c2d);
    this.pillars = new Noise(s ^ 0x33c3d);
    this.ashN = new Noise(s ^ 0x44c4d);
    this.capN = new Noise(s ^ 0x55c5d);
    this.shelf = new Noise(s ^ 0x66c6d);
  }

  column(_wx: number, _wz: number, out: ColumnInfo = { height: 0, biome: 0, mountain: 0, river: 0 }): ColumnInfo {
    out.height = LAVA_SEA; out.biome = BIOME_CINDERDEEP; out.mountain = 0; out.river = 0;
    return out;
  }

  /** Nobody starts here (players arrive through a Deepgate); a point over the lava sea. */
  findSpawn(): { x: number; y: number; z: number } {
    return { x: 0.5, y: 64, z: 0.5 };
  }

  /**
   * Rock density at a lattice point: > 0 is rock. Big rounded caverns (two noise
   * layers), most open between heights 30 and 100, with flat-ish shelves and a
   * solid crust near the floor and the roof.
   */
  private density(wx: number, wy: number, wz: number): number {
    let d = this.cavA.fbm3(wx / 52, wy / 26, wz / 52, 3) * 0.95 + this.cavB.noise3(wx / 17, wy / 11, wz / 17) * 0.3;
    // a solid crust at the floor and the roof; more open just above the lava sea, so it shows
    if (wy < 9) d += (9 - wy) * 0.28;
    if (wy > 108) d += (wy - 108) * 0.09;
    if (wy < LAVA_SEA + 3) d -= 0.16;
    d += 0.02;
    // shelves: a gentle pull towards horizontal layers every ~11 blocks
    d += Math.sin(wy * 0.57 + this.shelf.noise2(wx / 40, wz / 40) * 3) * 0.06;
    // rock pillars from floor to roof
    const p = this.pillars.noise2(wx / 11, wz / 11);
    if (p > 0.66) d += (p - 0.66) * 6;
    return d;
  }

  generateChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const containers: GeneratedContainer[] = [];
    const spawners: GeneratedSpawner[] = [];
    const X = cx * CHUNK_SIZE, Z = cz * CHUNK_SIZE;
    const g = this.grid;
    for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) for (let j = 0; j < NY; j++) {
      g[(i * 5 + k) * NY + j] = this.density(X + i * STEP, j * STEP, Z + k * STEP);
    }
    const colD = new Float32Array(NY);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const i = lx >> 2, k = lz >> 2, fx = (lx & 3) / STEP, fz = (lz & 3) / STEP;
      const a00 = (i * 5 + k) * NY, a10 = ((i + 1) * 5 + k) * NY, a01 = (i * 5 + k + 1) * NY, a11 = ((i + 1) * 5 + k + 1) * NY;
      for (let j = 0; j < NY; j++) {
        const e0 = g[a00 + j] + (g[a10 + j] - g[a00 + j]) * fx, e1 = g[a01 + j] + (g[a11 + j] - g[a01 + j]) * fx;
        colD[j] = e0 + (e1 - e0) * fz;
      }
      const wx = X + lx, wz = Z + lz;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        let b: number;
        if (y === 0 || y === WORLD_HEIGHT - 1) b = B.BEDROCK;
        else if (y < 4 && hashFloat(this.seed, wx, y, wz) < 0.8 - y * 0.25) b = B.BEDROCK;
        else if (y > WORLD_HEIGHT - 5 && hashFloat(this.seed, wx, y, wz) < 0.8 - (WORLD_HEIGHT - 1 - y) * 0.25) b = B.BEDROCK;
        else {
          const j = y >> 2, fy = (y & 3) / STEP;
          const d = colD[j] + (colD[Math.min(NY - 1, j + 1)] - colD[j]) * fy;
          b = d > 0 ? B.ASHROCK : y <= LAVA_SEA ? B.LAVA : B.AIR;
        }
        blocks[localIndex(lx, y, lz)] = b;
      }
    }
    const rng = mulberry32(hash4(this.seed, cx, cz, 0xc1de));
    this.dressFloors(cx, cz, blocks);
    this.placeOres(blocks, rng);
    this.placeLavafall(blocks, rng);
    if (this.opts.structures) placeShrine(this.seed, cx, cz, blocks, containers, spawners);
    return { blocks, containers, spawners };
  }

  /** Ash on the floors, Glowcaps in clusters, Ashrock under the lava sea's shores. */
  private dressFloors(cx: number, cz: number, b: Uint16Array): void {
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const ash = this.ashN.fbm2(wx / 23, wz / 23, 2);
      const caps = this.capN.noise2(wx / 13, wz / 13);
      for (let y = LAVA_SEA + 1; y < WORLD_HEIGHT - 6; y++) {
        const i = localIndex(lx, y, lz);
        if (b[i] !== B.ASHROCK || b[i + 256] !== B.AIR) continue;
        if (ash > 0.28) { b[i] = B.ASH; if (b[i - 256] === B.ASHROCK) b[i - 256] = B.ASH; }
        if (caps > 0.35 && b[i + 512] === B.AIR && hashFloat(this.seed, wx, y, wz) < 0.09 + (caps - 0.35) * 0.4) b[i + 256] = B.GLOWCAP;
      }
    }
  }

  private placeOres(b: Uint16Array, rng: () => number): void {
    const blob = (x: number, y: number, z: number, size: number, ore: number) => {
      for (let n = 0; n < size; n++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 4 && y < WORLD_HEIGHT - 5) {
          const i = localIndex(x, y, z);
          if (b[i] === B.ASHROCK || b[i] === B.ASH) b[i] = ore;
        }
        const d = Math.floor(rng() * 6);
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
      }
    };
    for (let n = 0; n < 6; n++) blob(randInt(rng, 0, 15), randInt(rng, 20, 116), randInt(rng, 0, 15), randInt(rng, 3, 7), B.EMBER_ORE);
    // Fire Opal: rare, small, deep - near (and under) the lava sea
    for (let n = 0; n < 2; n++) if (rng() < 0.55) blob(randInt(rng, 0, 15), randInt(rng, 6, 34), randInt(rng, 0, 15), randInt(rng, 1, 3), B.FIRE_OPAL_ORE);
  }

  /** Now and then a column of lava pours from the roof of a cavern onto its floor. */
  private placeLavafall(b: Uint16Array, rng: () => number): void {
    if (rng() >= 0.22) return;
    for (let t = 0; t < 12; t++) {
      const lx = randInt(rng, 2, 13), lz = randInt(rng, 2, 13);
      // find a roof: rock with at least 12 blocks of air below it
      for (let y = WORLD_HEIGHT - 8; y > LAVA_SEA + 14; y--) {
        const i = localIndex(lx, y, lz);
        if (b[i] !== B.ASHROCK || b[i - 256] !== B.AIR) continue;
        let fl = y - 1;
        while (fl > 1 && b[localIndex(lx, fl, lz)] === B.AIR) fl--;
        if (y - fl < 12) break;
        b[i] = B.LAVA;
        for (let yy = y - 1; yy > fl; yy--) b[localIndex(lx, yy, lz)] = B.LAVA_FALLING;
        if (b[localIndex(lx, fl, lz)] !== B.LAVA) b[localIndex(lx, fl + 1, lz)] = B.LAVA;
        return;
      }
    }
  }
}

/**
 * EMBER SHRINES: about one chunk in nine has a little ruined hall standing on a
 * cavern floor - an Ashrock Brick floor and broken walls, Cinderstone corner posts
 * with Ember Lamps, a Monster Cage in the middle and a chest or two of treasure.
 */
export function placeShrine(seed: number, cx: number, cz: number, b: Uint16Array, containers: GeneratedContainer[], spawners: GeneratedSpawner[]): { x: number; y: number; z: number } | null {
  const rng = mulberry32(hash4(seed, cx, cz, 0x5a1e));
  if (rng() >= 1 / 9) return null;
  for (let attempt = 0; attempt < 14; attempt++) {
    const lx = randInt(rng, 4, 11), lz = randInt(rng, 4, 11);
    // a floor under open air in the middle
    let fy = -1;
    for (let y = 100; y > LAVA_SEA + 2; y--) {
      const id = b[localIndex(lx, y, lz)];
      if ((id === B.ASHROCK || id === B.ASH) && b[localIndex(lx, y + 1, lz)] === B.AIR) { fy = y; break; }
    }
    if (fy < 0) continue;
    // 7 x 7 footprint on a floor: most of it open just above the floor, no lava about
    let open = 0, ok = true;
    for (let x = lx - 3; x <= lx + 3 && ok; x++) for (let z = lz - 3; z <= lz + 3 && ok; z++) {
      const above = b[localIndex(x, fy + 1, z)];
      if (above === B.AIR || above === B.GLOWCAP) open++;
      for (let y = fy - 3; y <= fy + 5; y++) if (B.IS_FLUID[b[localIndex(x, y, z)]]) ok = false;
    }
    if (!ok || open < 36) continue;
    for (let x = lx - 3; x <= lx + 3; x++) for (let z = lz - 3; z <= lz + 3; z++) {
      const edge = Math.abs(x - lx) === 3 || Math.abs(z - lz) === 3;
      const corner = Math.abs(x - lx) === 3 && Math.abs(z - lz) === 3;
      const door = (x === lx || z === lz) && edge;
      b[localIndex(x, fy, z)] = rng() < 0.12 ? B.ASHROCK : B.ASHROCK_BRICKS;
      // a foundation where the floor dips
      for (let y = fy - 1; y >= fy - 4 && !B.IS_SOLID[b[localIndex(x, y, z)]]; y--) b[localIndex(x, y, z)] = B.ASHROCK;
      for (let y = fy + 1; y <= fy + 5; y++) b[localIndex(x, y, z)] = B.AIR;
      if (corner) {
        const h = 3 + Math.floor(rng() * 2);
        for (let y = fy + 1; y <= fy + h; y++) b[localIndex(x, y, z)] = B.CINDERSTONE;
        if (rng() < 0.7) b[localIndex(x, fy + h + 1, z)] = B.EMBER_LAMP;
      } else if (edge && !door) {
        const h = rng() < 0.3 ? 0 : 1 + Math.floor(rng() * 3);   // broken walls
        for (let y = fy + 1; y <= fy + h; y++) b[localIndex(x, y, z)] = rng() < 0.15 ? B.ASHROCK : B.ASHROCK_BRICKS;
      }
    }
    const X = cx * 16, Z = cz * 16;
    b[localIndex(lx, fy + 1, lz)] = B.SPAWNER;
    spawners.push({ x: X + lx, y: fy + 1, z: Z + lz, mob: rng() < 0.6 ? 'cinderling' : 'smoulderer' });
    // chests in the inner corners, facing into the hall
    const spots: [number, number, 'n' | 'e' | 's' | 'w'][] = [[lx - 2, lz - 2, 's'], [lx + 2, lz + 2, 'n'], [lx + 2, lz - 2, 's'], [lx - 2, lz + 2, 'n']];
    const n = rng() < 0.45 ? 2 : 1;
    for (let c = 0; c < n; c++) {
      const [x, z, f] = spots.splice(Math.floor(rng() * spots.length), 1)[0];
      b[localIndex(x, fy + 1, z)] = B.facingVariant('chest', f);
      containers.push({ x: X + x, y: fy + 1, z: Z + z, loot: 'shrine' });
    }
    return { x: X + lx, y: fy + 1, z: Z + lz };
  }
  return null;
}
