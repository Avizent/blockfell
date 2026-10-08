import { isIOS } from '../engine/touch';
import { SaveManager, type WorldRecord, type WorldExtra, type DimId, OVERWORLD, isDimId, packDelta, unpackDelta, unpackDeltaV1 } from './SaveManager';
import { BLOCK_LIMIT } from '../world/constants';
import { newerVersion } from '../core/version';
import { needsNewerGenerator } from '../world/generators';
import { GAME_VERSION } from '../world/constants';

/**
 * WORLD BACKUPS
 * -------------
 * A backup is one self-contained ".blockfell" file per world: gzip-compressed JSON
 * holding the world record (settings, seed, player, stats), the block-entity and
 * creature data, and the per-chunk block deltas. Terrain itself is never stored;
 * it is regenerated from the seed exactly as for a normal load.
 *
 * File formats: 1 = Blockfell 1.0-1.9 (one landscape, `chunks` + `extra`, 8-bit ids
 * packed `localIndex << 8 | id`); 2 = 1.10 (`dims`: chunks + extra per dimension,
 * 16-bit ids packed `localIndex << 16 | id`). Both are read; format 2 is written.
 * Blockfell 1.9 refuses format 2 files ("made by a newer version"), so nothing is
 * ever read with the wrong packing.
 *
 * Where the browser supports the File System Access API (Chrome, Edge) the player
 * picks a folder once - e.g. Dropbox > MineCraft - and Blockfell remembers it, so
 * exports (and the optional automatic backup on Save and Quit) are written straight
 * into it and imports list the backups found there. Other browsers fall back to a
 * normal download and a file picker.
 */

export const BACKUP_EXT = '.blockfell';
const FORMAT = 'blockfell-world';
const FORMAT_VERSION = 2;
const CHUNK_KEY = /^-?\d+,-?\d+$/;
const MAX_LOCAL_INDEX = 16 * 16 * 128;

/** One dimension in a backup file (format 2). */
export interface BackupDim {
  extra: WorldExtra | null;
  /** chunk key "cx,cz" -> base64 of little-endian uint32 (localIndex << 16 | blockId) values */
  chunks: Record<string, string>;
}

export interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  exported: number;
  gameVersion: string;
  world: WorldRecord;
  /** Format 2: every dimension with saved data (always the overworld). */
  dims?: Partial<Record<DimId, BackupDim>>;
  /** Format 1 only: the landscape's extra data and chunks (8-bit packing). */
  extra?: WorldExtra | null;
  chunks?: Record<string, string>;
  /** The device that wrote it, e.g. "iPad (Safari)" (1.9: Dropbox sync). */
  savedBy?: string;
}

/** Summary of a backup file found in the backup folder. */
export interface BackupEntry {
  fileName: string;
  modified: number;
  size: number;
  backup: BackupFile | null;   // null = unreadable / not a Blockfell backup
  error?: string;
}

// ---- minimal typings for the File System Access API (not in every TS DOM lib)
type PermissionMode = { mode: 'read' | 'readwrite' };
interface FSWritable { write(data: Blob): Promise<void>; close(): Promise<void> }
interface FSFileHandle { kind: 'file'; name: string; getFile(): Promise<File>; createWritable(): Promise<FSWritable> }
interface FSDirHandle {
  kind: 'directory'; name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>;
  values(): AsyncIterable<FSFileHandle | FSDirHandle>;
  queryPermission?(o: PermissionMode): Promise<PermissionState>;
  requestPermission?(o: PermissionMode): Promise<PermissionState>;
}
type PickerWindow = Window & { showDirectoryPicker?: (o?: Record<string, unknown>) => Promise<FSDirHandle> };

// ------------------------------------------------------------------ encoding
function packChunk(m: Map<number, number>, v1 = false): string {
  const bytes = new Uint8Array(m.size * 4);
  const dv = new DataView(bytes.buffer);
  let i = 0;
  for (const [idx, id] of m) { dv.setUint32(i, v1 ? ((idx << 8) | id) >>> 0 : packDelta(idx, id), true); i += 4; }
  let bin = '';
  for (let o = 0; o < bytes.length; o += 0x8000) bin += String.fromCharCode(...bytes.subarray(o, o + 0x8000));
  return btoa(bin);
}

function unpackChunk(b64: string, v1: boolean): Map<number, number> {
  const bin = atob(b64);
  if (bin.length % 4 !== 0) throw new Error('corrupt chunk data');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  const m = new Map<number, number>();
  for (let o = 0; o < bytes.length; o += 4) {
    const [idx, id] = (v1 ? unpackDeltaV1 : unpackDelta)(dv.getUint32(o, true));
    if (idx >= MAX_LOCAL_INDEX || id >= BLOCK_LIMIT) throw new Error('corrupt chunk data');
    m.set(idx, id);
  }
  return m;
}

/** The dimensions of a backup (format 1 files have just the overworld). */
export function backupDims(b: BackupFile): [DimId, BackupDim][] {
  if (b.formatVersion < 2) return [[OVERWORLD, { extra: b.extra ?? null, chunks: b.chunks ?? {} }]];
  return Object.entries(b.dims ?? {}).filter(([k]) => isDimId(k)) as [DimId, BackupDim][];
}

async function compress(text: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([text], { type: 'application/json' });
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

async function decompress(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed backups');
    return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return blob.text();
}

export async function createBackup(saves: SaveManager, worldId: string, savedBy?: string): Promise<{ blob: Blob; backup: BackupFile }> {
  const world = await saves.getWorld(worldId);
  if (!world) throw new Error('World not found');
  const dims: Partial<Record<DimId, BackupDim>> = {};
  for (const dim of await saves.savedDims(worldId)) {
    const deltas = await saves.loadDeltas(worldId, dim);
    const chunks: Record<string, string> = {};
    for (const [k, m] of deltas) if (m.size) chunks[k] = packChunk(m);
    dims[dim] = { extra: (await saves.getExtra(worldId, dim)) ?? null, chunks };
  }
  const backup: BackupFile = {
    format: FORMAT, formatVersion: FORMAT_VERSION, exported: Date.now(), gameVersion: GAME_VERSION, world, dims,
  };
  if (savedBy) backup.savedBy = savedBy;
  return { blob: await compress(JSON.stringify(backup)), backup };
}

/**
 * A format-1 file (as Blockfell 1.9 wrote it) from format-1 save data: the copy kept
 * when a world is converted for 1.10, so it can be restored exactly.
 */
export async function createFormat1Backup(world: WorldRecord, deltas: Map<string, Map<number, number>>, extra: WorldExtra | undefined): Promise<Blob> {
  const chunks: Record<string, string> = {};
  for (const [k, m] of deltas) if (m.size) chunks[k] = packChunk(m, true);
  const backup: BackupFile = {
    format: FORMAT, formatVersion: 1, exported: Date.now(), gameVersion: world.version, world, extra: extra ?? null, chunks,
  };
  return compress(JSON.stringify(backup));
}

SaveManager.format1Encoder = createFormat1Backup;

export async function readBackup(blob: Blob): Promise<BackupFile> {
  let data: BackupFile;
  try { data = JSON.parse(await decompress(blob)) as BackupFile; } catch { throw new Error('Not a Blockfell world backup'); }
  const w = data?.world;
  if (!data || data.format !== FORMAT) throw new Error('Not a Blockfell world backup');
  if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) throw new Error('This backup was made by a newer version of Blockfell');
  if (!w || typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.seed !== 'number' || !w.gameMode) throw new Error('The backup is damaged');
  if (data.formatVersion < 2) {
    if (!data.chunks || typeof data.chunks !== 'object') throw new Error('The backup is damaged');
  } else {
    if (!data.dims || typeof data.dims !== 'object' || !data.dims.overworld) throw new Error('The backup is damaged');
    for (const [k, d] of Object.entries(data.dims)) if (!isDimId(k) || !d || !d.chunks || typeof d.chunks !== 'object') throw new Error('The backup is damaged');
  }
  for (const [, d] of backupDims(data)) {
    for (const [k, v] of Object.entries(d.chunks)) if (!CHUNK_KEY.test(k) || typeof v !== 'string') throw new Error('The backup is damaged');
  }
  return data;
}

function newWorldId(): string {
  return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/**
 * Writes a backup into the local save store.
 * 'replace' overwrites the world with the same id; 'copy' imports it as a new world.
 */
export async function importBackup(saves: SaveManager, b: BackupFile, mode: 'replace' | 'copy', opts: { keepLastPlayed?: boolean; name?: string } = {}): Promise<string> {
  if (newerVersion(b.gameVersion, GAME_VERSION) || needsNewerGenerator(b.world)) throw new Error(`Made by Blockfell ${b.gameVersion}: update Blockfell to open it`);
  // decode and validate everything before touching saves (format-1 files are converted here)
  const v1 = b.formatVersion < 2;
  const dims: [DimId, Map<string, Map<number, number>>, WorldExtra | null][] = [];
  for (const [dim, d] of backupDims(b)) {
    const deltas = new Map<string, Map<number, number>>();
    for (const [k, v] of Object.entries(d.chunks)) deltas.set(k, unpackChunk(v, v1));
    dims.push([dim, deltas, d.extra ?? null]);
  }
  const id = mode === 'copy' ? newWorldId() : b.world.id;
  let name = b.world.name;
  if (mode === 'copy') {
    const names = new Set((await saves.listWorlds()).map((w) => w.name));
    const base = opts.name ?? `${b.world.name} (imported)`;
    name = base;
    for (let n = 2; names.has(name); n++) name = opts.name ? `${base} ${n}` : `${b.world.name} (imported ${n})`;
  } else {
    await saves.deleteWorld(id);
  }
  const world: WorldRecord = { ...b.world, id, name, lastPlayed: opts.keepLastPlayed ? b.world.lastPlayed : Date.now(), format: 2 };
  if (world.player && !world.player.dim) world.player = { ...world.player, dim: OVERWORLD };
  await saves.putWorld(world);
  for (const [dim, deltas, extra] of dims) {
    await saves.putDeltas(id, dim, deltas, deltas.keys());
    if (extra) await saves.putExtra(id, dim, extra);
  }
  return id;
}

export function backupFileName(name: string, suffix = ''): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60) || 'World';
  return safe + suffix + BACKUP_EXT;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Opens the system file picker for a single .blockfell file (works in every browser). */
export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // iPhone and iPad grey out files whose extension they don't know, so let them pick anything there
    if (!isIOS()) input.accept = BACKUP_EXT + ',application/gzip,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files?.[0] ?? null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

/** True when running inside another page (e.g. the claude.ai viewer), where folder pickers and downloads are blocked. */
export const embedded: boolean = (() => { try { return window.self !== window.top; } catch { return true; } })();

// ------------------------------------------------------------------ backup folder
export class BackupFolder {
  handle: FSDirHandle | null = null;
  autoBackup = true;
  private saves: SaveManager | null = null;

  /** True when the browser can open and remember a folder (Chrome, Edge). */
  get supported(): boolean {
    return !embedded && typeof (window as PickerWindow).showDirectoryPicker === 'function';
  }

  get folderName(): string {
    return this.handle?.name ?? '';
  }

  async load(saves: SaveManager): Promise<void> {
    this.saves = saves;
    try {
      this.handle = (await saves.getMeta<FSDirHandle>('backupFolder')) ?? null;
      this.autoBackup = (await saves.getMeta<boolean>('autoBackup')) ?? true;
    } catch { this.handle = null; }
  }

  async setAutoBackup(on: boolean): Promise<void> {
    this.autoBackup = on;
    await this.saves?.putMeta('autoBackup', on);
  }

  /** Lets the player choose the folder. Must be called from a click. */
  async choose(): Promise<boolean> {
    const pick = (window as PickerWindow).showDirectoryPicker;
    if (!pick) return false;
    try {
      const opts: Record<string, unknown> = { id: 'blockfell-backups', mode: 'readwrite' };
      if (this.handle) opts.startIn = this.handle;
      const h = await pick.call(window, opts);
      this.handle = h;
      await this.saves?.putMeta('backupFolder', h);
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return false;
      throw e;
    }
  }

  /** Current permission; with `request` it may show the browser's prompt (needs a click). */
  async permission(request: boolean): Promise<boolean> {
    const h = this.handle;
    if (!h) return false;
    const o: PermissionMode = { mode: 'readwrite' };
    try {
      if (!h.queryPermission || (await h.queryPermission(o)) === 'granted') return true;
      if (!request || !h.requestPermission) return false;
      return (await h.requestPermission(o)) === 'granted';
    } catch { return false; }
  }

  private async writeFile(name: string, blob: Blob): Promise<void> {
    const fh = await this.handle!.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }

  /** Name to use for a world: its own name, unless another world's backup already uses it. */
  private async fileNameFor(world: WorldRecord): Promise<string> {
    const plain = backupFileName(world.name);
    try {
      const fh = await this.handle!.getFileHandle(plain);
      const other = await readBackup(await fh.getFile());
      if (other.world.id === world.id) return plain;
    } catch { return plain; } // no such file (or unreadable): use the plain name
    return backupFileName(world.name, ` (${world.id.slice(-5)})`);
  }

  /** Exports one world into the folder; returns the file name written. */
  async exportWorld(worldId: string): Promise<string> {
    if (!this.handle || !this.saves) throw new Error('No backup folder chosen');
    const { blob, backup } = await createBackup(this.saves, worldId);
    const name = await this.fileNameFor(backup.world);
    await this.writeFile(name, blob);
    return name;
  }

  /** Every .blockfell file in the folder, newest first. */
  async list(): Promise<BackupEntry[]> {
    if (!this.handle) return [];
    const out: BackupEntry[] = [];
    for await (const h of this.handle.values()) {
      if (h.kind !== 'file' || !h.name.toLowerCase().endsWith(BACKUP_EXT)) continue;
      const file = await h.getFile();
      const e: BackupEntry = { fileName: h.name, modified: file.lastModified, size: file.size, backup: null };
      try { e.backup = await readBackup(file); } catch (err) { e.error = (err as Error).message; }
      out.push(e);
    }
    return out.sort((a, b) => b.modified - a.modified);
  }
}

export const backups = new BackupFolder();
