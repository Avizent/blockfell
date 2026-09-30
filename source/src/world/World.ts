import { Chunk } from './Chunk';
import { CHUNK_MASK, CHUNK_SHIFT, WORLD_HEIGHT, chunkKey, chunkKeyNum, localIndex } from './constants';
import { AIR, CHEST, getBlock } from './BlockRegistry';
import { TerrainGenerator, GEN_VERSION } from './TerrainGenerator';
import { Emitter } from '../core/Emitter';
import type { Slot } from '../inventory/ItemStack';

export const UNLOADED = 255;

export interface ChestEntity {
  type: 'chest';
  items: Slot[];
  loot?: string;            // pending loot table, generated when first opened
}
export interface FurnaceEntity {
  type: 'furnace';
  items: Slot[];            // [input, fuel, output]
  burnTime: number;         // ticks of fuel left
  burnTotal: number;
  cookTime: number;         // progress ticks for current item
  xp: number;               // stored experience from smelting
}
export interface SignEntity {
  type: 'sign';
  lines: string[];          // four lines of text
  rot?: number;             // standing signs: 0..15 sixteenths of a turn
  color?: string;           // dye colour of the text
}
export interface SpawnerEntity {
  type: 'spawner';
  mob: string;              // the creature this Monster Cage makes
  delay: number;            // ticks until its next attempt
}
export type BlockEntity = ChestEntity | FurnaceEntity | SignEntity | SpawnerEntity;

export interface WorldEvents extends Record<string, unknown> {
  blockChanged: { x: number; y: number; z: number; old: number; id: number; cause: string };
}

export function posKey(x: number, y: number, z: number): string {
  return x + ',' + y + ',' + z;
}

/**
 * The voxel world on the main thread: loaded chunk data, the persistent
 * modification log (deltas against procedural generation) and block entities.
 */
export class World {
  readonly seed: number;
  readonly generator: TerrainGenerator;
  readonly structures: boolean;
  readonly chunks = new Map<number, Chunk>();
  /**
   * SAVE-DELTA REPRESENTATION: for each chunk the player has modified, a map of
   * localIndex -> block id. Loading a chunk = regenerate from seed, then apply its
   * delta map. Only these maps (plus block entities) are written to disk.
   */
  readonly deltas = new Map<string, Map<number, number>>();
  readonly dirtyDeltaChunks = new Set<string>();
  readonly blockEntities = new Map<string, BlockEntity>();
  readonly events = new Emitter<WorldEvents>();

  readonly genVersion: number;

  constructor(seed: number, structures: boolean, genVersion = GEN_VERSION) {
    this.seed = seed;
    this.structures = structures;
    this.genVersion = genVersion;
    this.generator = new TerrainGenerator(seed, { structures, version: genVersion });
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKeyNum(cx, cz));
  }

  /** Block id at a world position; UNLOADED (acts solid) where no chunk is loaded. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return UNLOADED;
    if (y >= WORLD_HEIGHT) return AIR;
    const c = this.chunks.get(chunkKeyNum(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c) return UNLOADED;
    return c.blocks[localIndex(x & CHUNK_MASK, y, z & CHUNK_MASK)];
  }

  /** Packed light (sky << 4 | block); full sky light where unknown. */
  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkKeyNum(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c || !c.light) return 0xf0;
    return c.light[localIndex(x & CHUNK_MASK, y, z & CHUNK_MASK)];
  }

  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(chunkKeyNum(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
  }

  /**
   * Changes one voxel. Updates the data FIRST, records the delta, then marks only
   * the chunks whose mesh can change: the owning chunk, plus neighbours when the
   * block lies on a border (face culling / AO / smooth light read across it).
   * Light spilling further into neighbours is detected by the mesher itself.
   */
  setBlock(x: number, y: number, z: number, id: number, cause = 'player'): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = x >> CHUNK_SHIFT, cz = z >> CHUNK_SHIFT;
    const c = this.chunks.get(chunkKeyNum(cx, cz));
    if (!c) return false;
    const lx = x & CHUNK_MASK, lz = z & CHUNK_MASK;
    const i = localIndex(lx, y, lz);
    const old = c.blocks[i];
    if (old === id) return false;
    c.blocks[i] = id;

    const key = chunkKey(cx, cz);
    let d = this.deltas.get(key);
    if (!d) { d = new Map(); this.deltas.set(key, d); }
    d.set(i, id);
    this.dirtyDeltaChunks.add(key);

    c.markDirty(true);
    c.checkNeighborLight = true;
    const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0;
    const ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (ex) this.getChunk(cx + ex, cz)?.markDirty(true);
    if (ez) this.getChunk(cx, cz + ez)?.markDirty(true);
    if (ex && ez) this.getChunk(cx + ex, cz + ez)?.markDirty(true);

    if (getBlock(old).interact && getBlock(old).interact !== 'crafting' && getBlock(id).interact !== getBlock(old).interact) {
      // container removed: caller is responsible for dropping contents first
      this.blockEntities.delete(posKey(x, y, z));
    }
    this.events.emit('blockChanged', { x, y, z, old, id, cause });
    return true;
  }

  /** Applies saved modifications to freshly generated chunk data. */
  applyDeltas(cx: number, cz: number, blocks: Uint8Array): void {
    const d = this.deltas.get(chunkKey(cx, cz));
    if (!d) return;
    for (const [i, id] of d) blocks[i] = id;
  }

  isChestAt(x: number, y: number, z: number): boolean {
    return CHEST.includes(this.getBlock(x, y, z));
  }

  highestSolid(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== AIR && b !== UNLOADED && getBlock(b).solid) return y;
    }
    return -1;
  }
}
