import { TerrainGenerator, GEN_VERSION, type ColumnInfo, type GeneratedChunk, type GenOptions } from './TerrainGenerator';
import type { VillagePlanner } from './Villages';
import { type DimId, OVERWORLD } from './dims';
import { CinderGenerator, CINDER_GEN_VERSION } from './Cinderdeep';
import { StarGenerator, STAR_GEN_VERSION } from './Starhollow';

/**
 * PLUGGABLE GENERATION (1.10)
 * ---------------------------
 * Every dimension's landscape comes from a generator with this shape. The worker
 * and the main thread both create generators through `createGenerator`, so a new
 * dimension only has to register its class here.
 */
export interface DimensionGenerator {
  readonly dim: DimId;
  readonly seed: number;
  /** Generator version this landscape is made with (saved worlds keep theirs). */
  readonly version: number;
  /** Village plans (overworld terrain 3+ with structures on; null elsewhere). */
  readonly villages: VillagePlanner | null;
  generateChunk(cx: number, cz: number): GeneratedChunk;
  /** A safe place to stand near the centre of the landscape. */
  findSpawn(): { x: number; y: number; z: number };
  /** Ground height and biome of a column (cheap: no chunk data needed). */
  column(wx: number, wz: number, out?: ColumnInfo): ColumnInfo;
}

interface GeneratorEntry {
  /** Newest generator version of this dimension. */
  version: number;
  create(seed: number, opts: GenOptions): DimensionGenerator;
}

const GENERATORS: Partial<Record<DimId, GeneratorEntry>> = {
  overworld: { version: GEN_VERSION, create: (seed, opts) => new TerrainGenerator(seed, opts) },
  cinderdeep: { version: CINDER_GEN_VERSION, create: (seed, opts) => new CinderGenerator(seed, opts) },
  starhollow: { version: STAR_GEN_VERSION, create: (seed, opts) => new StarGenerator(seed, opts) },
};

/** Can this Blockfell make the landscape of `dim`? */
export function hasGenerator(dim: DimId): boolean {
  return !!GENERATORS[dim];
}

/** The newest generator version of a dimension (0 = not available in this Blockfell). */
export function newestGenVersion(dim: DimId): number {
  return GENERATORS[dim]?.version ?? 0;
}

export function createGenerator(dim: DimId, seed: number, opts: GenOptions): DimensionGenerator {
  const g = GENERATORS[dim];
  if (!g) throw new Error(`This Blockfell cannot make ${dim} landscapes`);
  return g.create(seed, opts);
}

/**
 * True when a saved world uses a landscape this Blockfell can't make: a newer
 * overworld version or a dimension (or dimension version) it doesn't know.
 * Such worlds are never imported (Dropbox sync shows "needs a newer Blockfell").
 */
export function needsNewerGenerator(rec: { genVersion?: number; dims?: Partial<Record<string, { genVersion: number }>>; player?: { dim?: string } }): boolean {
  if ((rec.genVersion ?? 1) > GEN_VERSION) return true;
  for (const [dim, info] of Object.entries(rec.dims ?? {})) {
    if (dim === OVERWORLD || !info) continue;
    if (info.genVersion > newestGenVersion(dim as DimId)) return true;
  }
  const at = rec.player?.dim;
  return !!at && at !== OVERWORLD && !hasGenerator(at as DimId);
}
