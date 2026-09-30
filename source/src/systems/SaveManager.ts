import type { Slot } from '../inventory/ItemStack';
import type { BlockEntity } from '../world/World';
import type { GameMode, Difficulty } from '../player/Player';

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
}

export interface WorldExtra {
  blockEntities: [string, BlockEntity][];
  entities: Record<string, unknown>[];
  /** Village state (populated, hero discount, last raid). */
  villages?: import('../game/VillageManager').VillageState[];
}

const DB_NAME = 'blockfell';
const DB_VERSION = 2;

/**
 * Persistence in IndexedDB.
 *  - `worlds`: one small record per world (settings, seed, time, player, stats).
 *  - `chunks`: per modified chunk, the packed list of (localIndex << 8 | blockId)
 *    DIFFERENCES from procedural generation. Unmodified terrain is never stored:
 *    it is regenerated from the seed.
 *  - `extra`: block entities (chest/furnace contents) and saved creatures/items.
 *  - `meta`: small settings, e.g. the remembered backup folder handle.
 * Falls back to an in-memory store if IndexedDB is unavailable (private mode).
 */
export class SaveManager {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, Map<string, unknown>>();
  persistent = true;

  async open(): Promise<void> {
    if (this.db) return;
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
      this.mem('extra').delete(id);
      return;
    }
    await this.tx('worlds', 'readwrite', (s) => s.delete(id));
    await this.tx('chunks', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + '|', id + '|￿')));
    await this.tx('extra', 'readwrite', (s) => s.delete(id));
  }

  /** Writes the delta maps of the given chunks. */
  async putDeltas(worldId: string, deltas: Map<string, Map<number, number>>, keys: Iterable<string>): Promise<number> {
    await this.open();
    let n = 0;
    const entries: [string, Uint32Array][] = [];
    for (const k of keys) {
      const d = deltas.get(k);
      if (!d) continue;
      const packed = new Uint32Array(d.size);
      let i = 0;
      for (const [idx, id] of d) packed[i++] = (idx << 8) | id;
      entries.push([worldId + '|' + k, packed]);
      n++;
    }
    if (!entries.length) return 0;
    if (!this.db) { for (const [k, v] of entries) this.mem('chunks').set(k, v.slice()); return n; }
    await this.tx('chunks', 'readwrite', (s) => { for (const [k, v] of entries) s.put(v, k); });
    return n;
  }

  async loadDeltas(worldId: string): Promise<Map<string, Map<number, number>>> {
    await this.open();
    const out = new Map<string, Map<number, number>>();
    const add = (key: string, packed: Uint32Array) => {
      const m = new Map<number, number>();
      for (const v of packed) m.set(v >>> 8, v & 255);
      out.set(key.slice(worldId.length + 1), m);
    };
    if (!this.db) {
      for (const [k, v] of this.mem('chunks')) if (k.startsWith(worldId + '|')) add(k, v as Uint32Array);
      return out;
    }
    await new Promise<void>((resolve, reject) => {
      const t = this.db!.transaction('chunks', 'readonly');
      const req = t.objectStore('chunks').openCursor(IDBKeyRange.bound(worldId + '|', worldId + '|￿'));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { add(c.key as string, c.value as Uint32Array); c.continue(); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return out;
  }

  async putExtra(worldId: string, extra: WorldExtra): Promise<void> {
    await this.open();
    const copy = JSON.parse(JSON.stringify(extra));
    if (!this.db) { this.mem('extra').set(worldId, copy); return; }
    await this.tx('extra', 'readwrite', (s) => s.put(copy, worldId));
  }

  async getExtra(worldId: string): Promise<WorldExtra | undefined> {
    await this.open();
    if (!this.db) return this.mem('extra').get(worldId) as WorldExtra | undefined;
    return this.tx<WorldExtra>('extra', 'readonly', (s) => s.get(worldId));
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

  /** Copies a world under a new id (used by "Duplicate"). */
  async duplicate(src: WorldRecord, newId: string, newName: string): Promise<void> {
    const rec = { ...JSON.parse(JSON.stringify(src)), id: newId, name: newName, lastPlayed: Date.now() } as WorldRecord;
    await this.putWorld(rec);
    const deltas = await this.loadDeltas(src.id);
    await this.putDeltas(newId, deltas, deltas.keys());
    const extra = await this.getExtra(src.id);
    if (extra) await this.putExtra(newId, extra);
  }
}
