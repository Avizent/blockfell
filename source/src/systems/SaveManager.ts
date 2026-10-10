import type { Slot } from '../inventory/ItemStack';
import type { BlockEntity } from '../world/World';
import type { GameMode, Difficulty } from '../player/Player';
import { type DimId, OVERWORLD, DIM_IDS, isDimId } from '../world/dims';
export { type DimId, OVERWORLD, DIM_IDS, isDimId };

export interface GameRules {
  keepInventory: boolean;
  doDaylightCycle: boolean;
  doMobSpawning: boolean;
  naturalRegeneration: boolean;
  /** Weather changes by itself (1.3). Missing in older saves = on. */
  doWeatherCycle: boolean;
}

export const DEFAULT_RULES: GameRules = {
  keepInventory: false, doDaylightCycle: true, doMobSpawning: true, naturalRegeneration: true, doWeatherCycle: true,
};


export interface PlayerSave {
  x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; food: number; saturation: number; exhaustion: number; air: number;
  xpLevel: number; xpProgress: number; xpTotal: number;
  runeSeed?: number;
  flying: boolean; gameMode: GameMode; dead: boolean;
  spawn: { x: number; y: number; z: number };
  bed?: { x: number; y: number; z: number } | null;
  inventory: Slot[]; selected: number;
  /** Sitting in a boat when saved (1.6): climbs back in on load. */
  riding?: boolean;
  /** The dimension the player is in (1.10; missing = overworld). Spawn and bed are always in the overworld. */
  dim?: DimId;
}

/** Another player's saved state inside this world (1.10: kept for multiplayer, not used yet). */
export interface OtherPlayerSave extends PlayerSave {
  name: string;
  lastSeen: number;
}

/** Per-dimension facts about a world (1.10). */
export interface DimInfo {
  /** Generator version used for this dimension's landscape. */
  genVersion: number;
  /** First and last time the player was there (ms). */
  firstVisit?: number;
  lastVisit?: number;
}

export interface WorldRecord {
  id: string;
  name: string;
  seed: number;
  seedText: string;
  gameMode: GameMode;
  difficulty: Difficulty;
  structures: boolean;
  bonusChest: boolean;
  bonusChestPlaced?: boolean;
  rules: GameRules;
  created: number;
  lastPlayed: number;
  /** Terrain generator version (1 = worlds made before biomes were added in 1.1). */
  genVersion?: number;
  version: string;
  format: number;
  time: number;
  day: number;
  /** Current weather and how long it lasts (1.3). */
  weather?: import('./WeatherSystem').WeatherSave;
  player?: PlayerSave;
  stats: Record<string, number>;
  advancements: string[];
  /** When the world was last exported or backed up (1.6), for the backup reminder. */
  lastBackup?: number;
  /** Dimensions other than the overworld that exist in this world (1.10; the overworld uses genVersion). */
  dims?: Partial<Record<DimId, DimInfo>>;
  /** Other players' saved state by player id (1.10, for multiplayer; empty in single player). */
  players?: Record<string, OtherPlayerSave>;
  /** 2.2: the Starhollow: where the Stargate on the surface is, and the Hollowdrake's state. */
  star?: import('../game/StarhollowSystem').StarState;
}

export interface WorldExtra {
  blockEntities: [string, BlockEntity][];
  entities: Record<string, unknown>[];
  /** Village state (populated, hero discount, last raid). */
  villages?: import('../game/VillageManager').VillageState[];
}

const DB_NAME = 'blockfell';
const DB_VERSION = 2;

/** Packs one changed voxel for the save store (format 2: 15-bit index, 16-bit id). */
export function packDelta(idx: number, id: number): number {
  return ((idx << 16) | id) >>> 0;
}
export function unpackDelta(v: number): [number, number] {
  return [v >>> 16, v & 0xffff];
}
/** Format 1 (Blockfell 1.0-1.9): 8-bit ids. */
export function unpackDeltaV1(v: number): [number, number] {
  return [v >>> 8, v & 255];
}

/** Prefix of all chunk keys of one dimension of a world (format 2). */
function dimPrefix(worldId: string, dim: DimId): string {
  return worldId + '|' + dim + '|';
}

/** A pre-1.10 copy of a world, kept when its save was converted (meta key 'archive|<id>'). */
export interface WorldArchive {
  worldId: string;
  name: string;
  gameVersion: string;
  made: number;
  /** The world as a .blockfell file (format 1), gzip bytes. */
  bytes: Uint8Array;
}

/**
 * Persistence in IndexedDB.
 *  - `worlds`: one small record per world (settings, seed, time, player, stats).
 *  - `chunks`: per modified chunk, the packed list of (localIndex << 16 | blockId)
 *    DIFFERENCES from procedural generation, keyed "<world>|<dimension>|<cx>,<cz>".
 *    Unmodified terrain is never stored: it is regenerated from the seed.
 *  - `extra`: block entities (chest/furnace contents) and saved creatures/items,
 *    keyed "<world>|<dimension>".
 *  - `meta`: small settings, e.g. the remembered backup folder handle, and the
 *    pre-1.10 copies of converted worlds ('archive|<world>').
 * SAVE FORMATS: 1 = Blockfell 1.0-1.9 (8-bit ids packed `idx << 8 | id`, chunk keys
 * "<world>|<cx>,<cz>", extra under "<world>"); 2 = 1.10 (above). `upgradeAll()`
 * converts format-1 worlds when Blockfell starts.
 * Falls back to an in-memory store if IndexedDB is unavailable (private mode).
 */
export class SaveManager {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, Map<string, unknown>>();
  private opening: Promise<void> | null = null;
  persistent = true;
  /** Names of the worlds converted to format 2 when Blockfell started, and of any that could not be. */
  readonly upgraded: string[] = [];
  readonly upgradeFailed: string[] = [];
  /**
   * Writes a format-1 .blockfell file (set by WorldBackup; kept out of this module
   * to avoid an import cycle). Used for the pre-1.10 copy made before converting.
   */
  static format1Encoder: ((world: WorldRecord, deltas: Map<string, Map<number, number>>, extra: WorldExtra | undefined) => Promise<Blob>) | null = null;

  /** Opens the store (once) and converts any format-1 worlds before anything else can read them. */
  open(): Promise<void> {
    if (!this.opening) this.opening = this.openDb().then(() => this.upgradeAll());
    return this.opening;
  }

  private async openDb(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
          if (!db.objectStoreNames.contains('extra')) db.createObjectStore('extra');
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
    } catch (e) {
      console.warn('IndexedDB unavailable, worlds will not persist:', e);
      this.persistent = false;
    }
  }

  private mem(store: string): Map<string, unknown> {
    let m = this.memory.get(store);
    if (!m) { m = new Map(); this.memory.set(store, m); }
    return m;
  }

  private tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = this.db!;
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async listWorlds(): Promise<WorldRecord[]> {
    await this.open();
    let list: WorldRecord[];
    if (!this.db) list = [...this.mem('worlds').values()] as WorldRecord[];
    else list = ((await this.tx<WorldRecord[]>('worlds', 'readonly', (s) => s.getAll())) ?? []);
    return list.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  async getWorld(id: string): Promise<WorldRecord | undefined> {
    await this.open();
    if (!this.db) return this.mem('worlds').get(id) as WorldRecord | undefined;
    return this.tx<WorldRecord>('worlds', 'readonly', (s) => s.get(id));
  }

  async putWorld(rec: WorldRecord): Promise<void> {
    await this.open();
    const copy = JSON.parse(JSON.stringify(rec)) as WorldRecord;
    if (!this.db) { this.mem('worlds').set(rec.id, copy); return; }
    await this.tx('worlds', 'readwrite', (s) => s.put(copy));
  }

  async deleteWorld(id: string): Promise<void> {
    await this.open();
    if (!this.db) {
      this.mem('worlds').delete(id);
      for (const k of [...this.mem('chunks').keys()]) if (k.startsWith(id + '|')) this.mem('chunks').delete(k);
      for (const k of [...this.mem('extra').keys()]) if (k === id || k.startsWith(id + '|')) this.mem('extra').delete(k);
      this.mem('meta').delete('archive|' + id);
      return;
    }
    await this.tx('worlds', 'readwrite', (s) => s.delete(id));
    await this.tx('chunks', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + '|', id + '|\uffff')));
    await this.tx('extra', 'readwrite', (s) => { s.delete(id); s.delete(IDBKeyRange.bound(id + '|', id + '|\uffff')); });
    await this.tx('meta', 'readwrite', (s) => s.delete('archive|' + id));
  }

  /** Writes the delta maps of the given chunks of one dimension. */
  async putDeltas(worldId: string, dim: DimId, deltas: Map<string, Map<number, number>>, keys: Iterable<string>): Promise<number> {
    await this.open();
    let n = 0;
    const entries: [string, Uint32Array][] = [];
    const prefix = dimPrefix(worldId, dim);
    for (const k of keys) {
      const d = deltas.get(k);
      if (!d) continue;
      const packed = new Uint32Array(d.size);
      let i = 0;
      for (const [idx, id] of d) packed[i++] = packDelta(idx, id);
      entries.push([prefix + k, packed]);
      n++;
    }
    if (!entries.length) return 0;
    if (!this.db) { for (const [k, v] of entries) this.mem('chunks').set(k, v.slice()); return n; }
    await this.tx('chunks', 'readwrite', (s) => { for (const [k, v] of entries) s.put(v, k); });
    return n;
  }

  /** Reads raw chunk entries whose key starts with `prefix` (key minus prefix -> packed values). */
  private async scanChunks(prefix: string): Promise<Map<string, Uint32Array>> {
    const out = new Map<string, Uint32Array>();
    if (!this.db) {
      for (const [k, v] of this.mem('chunks')) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v as Uint32Array);
      return out;
    }
    await new Promise<void>((resolve, reject) => {
      const t = this.db!.transaction('chunks', 'readonly');
      const req = t.objectStore('chunks').openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.set((c.key as string).slice(prefix.length), c.value as Uint32Array); c.continue(); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return out;
  }

  /** The changed chunks of one dimension: "cx,cz" -> (local index -> block id). */
  async loadDeltas(worldId: string, dim: DimId): Promise<Map<string, Map<number, number>>> {
    await this.open();
    const out = new Map<string, Map<number, number>>();
    for (const [k, packed] of await this.scanChunks(dimPrefix(worldId, dim))) {
      const m = new Map<number, number>();
      for (const v of packed) { const [i, id] = unpackDelta(v); m.set(i, id); }
      out.set(k, m);
    }
    return out;
  }

  /** The dimensions of a world that have saved chunks or extra data (always includes the overworld). */
  async savedDims(worldId: string): Promise<DimId[]> {
    await this.open();
    const found = new Set<DimId>([OVERWORLD]);
    const note = (key: string) => {
      const dim = key.slice(worldId.length + 1).split('|')[0];
      if (isDimId(dim)) found.add(dim);
    };
    if (!this.db) {
      for (const k of this.mem('chunks').keys()) if (k.startsWith(worldId + '|')) note(k);
      for (const k of this.mem('extra').keys()) if (k.startsWith(worldId + '|')) note(k);
    } else {
      for (const store of ['chunks', 'extra']) {
        const keys = (await this.tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys(IDBKeyRange.bound(worldId + '|', worldId + '|\uffff')))) ?? [];
        for (const k of keys) note(k as string);
      }
    }
    return DIM_IDS.filter((d) => found.has(d));
  }

  async putExtra(worldId: string, dim: DimId, extra: WorldExtra): Promise<void> {
    await this.open();
    const copy = JSON.parse(JSON.stringify(extra));
    const key = worldId + '|' + dim;
    if (!this.db) { this.mem('extra').set(key, copy); return; }
    await this.tx('extra', 'readwrite', (s) => s.put(copy, key));
  }

  async getExtra(worldId: string, dim: DimId): Promise<WorldExtra | undefined> {
    await this.open();
    const key = worldId + '|' + dim;
    if (!this.db) return this.mem('extra').get(key) as WorldExtra | undefined;
    return this.tx<WorldExtra>('extra', 'readonly', (s) => s.get(key));
  }

  // ------------------------------------------------------------------ format 1 -> 2
  /** Format-1 data of a world as it is stored (for the pre-1.10 copy and the conversion). */
  async readFormat1(worldId: string): Promise<{ deltas: Map<string, Map<number, number>>; extra: WorldExtra | undefined }> {
    await this.open();
    return this.rawReadFormat1(worldId);
  }

  private async rawReadFormat1(worldId: string): Promise<{ deltas: Map<string, Map<number, number>>; extra: WorldExtra | undefined }> {
    const deltas = new Map<string, Map<number, number>>();
    for (const [k, packed] of await this.scanChunks(worldId + '|')) {
      if (k.includes('|')) continue;   // already a format-2 key
      const m = new Map<number, number>();
      for (const v of packed) { const [i, id] = unpackDeltaV1(v); m.set(i, id); }
      deltas.set(k, m);
    }
    let extra: WorldExtra | undefined;
    if (!this.db) extra = this.mem('extra').get(worldId) as WorldExtra | undefined;
    else extra = await this.tx<WorldExtra>('extra', 'readonly', (s) => s.get(worldId));
    return { deltas, extra };
  }

  /**
   * Converts one format-1 world to format 2 in a single transaction: chunk keys gain
   * the dimension, ids are repacked for 16 bits, the extra data moves to
   * "<world>|overworld" and the record is marked format 2. Nothing is lost if it fails.
   */
  private async convertToFormat2(rec: WorldRecord, deltas: Map<string, Map<number, number>>, extra: WorldExtra | undefined): Promise<WorldRecord> {
    const next: WorldRecord = JSON.parse(JSON.stringify(rec));
    next.format = 2;
    if (next.player && !next.player.dim) next.player.dim = OVERWORLD;
    const prefix = dimPrefix(rec.id, OVERWORLD);
    const entries: [string, Uint32Array][] = [];
    for (const [k, m] of deltas) {
      const packed = new Uint32Array(m.size);
      let i = 0;
      for (const [idx, id] of m) packed[i++] = packDelta(idx, id);
      entries.push([prefix + k, packed]);
    }
    if (!this.db) {
      const chunks = this.mem('chunks');
      for (const k of deltas.keys()) chunks.delete(rec.id + '|' + k);
      for (const [k, v] of entries) chunks.set(k, v);
      if (extra) { this.mem('extra').set(rec.id + '|' + OVERWORLD, extra); this.mem('extra').delete(rec.id); }
      this.mem('worlds').set(rec.id, next);
      return next;
    }
    const db = this.db;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['worlds', 'chunks', 'extra'], 'readwrite');
      const cs = t.objectStore('chunks');
      for (const k of deltas.keys()) cs.delete(rec.id + '|' + k);
      for (const [k, v] of entries) cs.put(v, k);
      const es = t.objectStore('extra');
      if (extra) { es.put(extra, rec.id + '|' + OVERWORLD); es.delete(rec.id); }
      t.objectStore('worlds').put(next);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    return next;
  }

  /**
   * Converts every format-1 world (Blockfell 1.0-1.9) to format 2, first keeping a
   * format-1 copy of each in `meta` ('archive|<id>') for "Restore Pre-1.10 Copy".
   * A world that fails stays format 1 and won't open (see Engine.playWorld).
   */
  private async upgradeAll(): Promise<void> {
    let worlds: WorldRecord[];
    try {
      worlds = this.db ? ((await this.tx<WorldRecord[]>('worlds', 'readonly', (s) => s.getAll())) ?? []) : ([...this.mem('worlds').values()] as WorldRecord[]);
    } catch { return; }
    for (const rec of worlds) {
      if ((rec.format ?? 1) >= 2) continue;
      try {
        const { deltas, extra } = await this.rawReadFormat1(rec.id);
        if (SaveManager.format1Encoder) {
          const blob = await SaveManager.format1Encoder(rec, deltas, extra);
          const archive: WorldArchive = { worldId: rec.id, name: rec.name, gameVersion: rec.version, made: Date.now(), bytes: new Uint8Array(await blob.arrayBuffer()) };
          if (this.db) await this.tx('meta', 'readwrite', (s) => s.put(archive, 'archive|' + rec.id));
          else this.mem('meta').set('archive|' + rec.id, archive);
        }
        await this.convertToFormat2(rec, deltas, extra);
        this.upgraded.push(rec.name);
      } catch (e) {
        console.error('Could not convert world', rec.name, e);
        this.upgradeFailed.push(rec.name);
      }
    }
  }

  /** The pre-1.10 copy of a world, if one was kept when it was converted. */
  async getArchive(worldId: string): Promise<WorldArchive | undefined> {
    return this.getMeta<WorldArchive>('archive|' + worldId);
  }

  /** Copies a world under a new id (used by "Duplicate"), every dimension. */
  async duplicate(src: WorldRecord, newId: string, newName: string): Promise<void> {
    const rec = { ...JSON.parse(JSON.stringify(src)), id: newId, name: newName, lastPlayed: Date.now() } as WorldRecord;
    await this.putWorld(rec);
    for (const dim of await this.savedDims(src.id)) {
      const deltas = await this.loadDeltas(src.id, dim);
      await this.putDeltas(newId, dim, deltas, deltas.keys());
      const extra = await this.getExtra(src.id, dim);
      if (extra) await this.putExtra(newId, dim, extra);
    }
  }

  /** Small settings values (structured-cloneable, e.g. a folder handle). */
  async getMeta<T>(key: string): Promise<T | undefined> {
    await this.open();
    if (!this.db) return this.mem('meta').get(key) as T | undefined;
    return this.tx<T>('meta', 'readonly', (s) => s.get(key));
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    await this.open();
    if (!this.db) { this.mem('meta').set(key, value); return; }
    await this.tx('meta', 'readwrite', (s) => s.put(value, key));
  }

}
