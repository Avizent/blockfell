import { isIOS } from '../engine/touch';
import type { SaveManager, WorldRecord, WorldExtra } from './SaveManager';
import { GAME_VERSION } from '../world/constants';

/**
 * WORLD BACKUPS
 * -------------
 * A backup is one self-contained ".blockfell" file per world: gzip-compressed JSON
 * holding the world record (settings, seed, player, stats), the block-entity and
 * creature data, and the per-chunk block deltas. Terrain itself is never stored;
 * it is regenerated from the seed exactly as for a normal load.
 *
 * Where the browser supports the File System Access API (Chrome, Edge) the player
 * picks a folder once - e.g. Dropbox > MineCraft - and Blockfell remembers it, so
 * exports (and the optional automatic backup on Save and Quit) are written straight
 * into it and imports list the backups found there. Other browsers fall back to a
 * normal download and a file picker.
 */

export const BACKUP_EXT = '.blockfell';
const FORMAT = 'blockfell-world';
const FORMAT_VERSION = 1;
const CHUNK_KEY = /^-?\d+,-?\d+$/;
const MAX_LOCAL_INDEX = 16 * 16 * 128;

export interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  exported: number;
  gameVersion: string;
  world: WorldRecord;
  extra: WorldExtra | null;
  /** chunk key "cx,cz" -> base64 of little-endian uint32 (localIndex << 8 | blockId) values */
  chunks: Record<string, string>;
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
function packChunk(m: Map<number, number>): string {
  const bytes = new Uint8Array(m.size * 4);
  const dv = new DataView(bytes.buffer);
  let i = 0;
  for (const [idx, id] of m) { dv.setUint32(i, ((idx << 8) | id) >>> 0, true); i += 4; }
  let bin = '';
  for (let o = 0; o < bytes.length; o += 0x8000) bin += String.fromCharCode(...bytes.subarray(o, o + 0x8000));
  return btoa(bin);
}

function unpackChunk(b64: string): Map<number, number> {
  const bin = atob(b64);
  if (bin.length % 4 !== 0) throw new Error('corrupt chunk data');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  const m = new Map<number, number>();
  for (let o = 0; o < bytes.length; o += 4) {
    const v = dv.getUint32(o, true);
    const idx = v >>> 8;
    if (idx >= MAX_LOCAL_INDEX) throw new Error('corrupt chunk data');
    m.set(idx, v & 255);
  }
  return m;
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
  const deltas = await saves.loadDeltas(worldId);
  const chunks: Record<string, string> = {};
  for (const [k, m] of deltas) if (m.size) chunks[k] = packChunk(m);
  const backup: BackupFile = {
    format: FORMAT, formatVersion: FORMAT_VERSION, exported: Date.now(), gameVersion: GAME_VERSION,
    world, extra: (await saves.getExtra(worldId)) ?? null, chunks,
  };
  if (savedBy) backup.savedBy = savedBy;
  return { blob: await compress(JSON.stringify(backup)), backup };
}

export async function readBackup(blob: Blob): Promise<BackupFile> {
  let data: BackupFile;
  try { data = JSON.parse(await decompress(blob)) as BackupFile; } catch { throw new Error('Not a Blockfell world backup'); }
  const w = data?.world;
  if (!data || data.format !== FORMAT) throw new Error('Not a Blockfell world backup');
  if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) throw new Error('This backup was made by a newer version of Blockfell');
  if (!w || typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.seed !== 'number' || !w.gameMode) throw new Error('The backup is damaged');
  if (!data.chunks || typeof data.chunks !== 'object') throw new Error('The backup is damaged');
  for (const [k, v] of Object.entries(data.chunks)) if (!CHUNK_KEY.test(k) || typeof v !== 'string') throw new Error('The backup is damaged');
  return data;
}

function newWorldId(): string {
  return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/**
 * Writes a backup into the local save store.
 * 'replace' overwrites the world with the same id; 'copy' imports it as a new world.
 */
export async function importBackup(saves: SaveManager, b: BackupFile, mode: 'replace' | 'copy', opts: { keepLastPlayed?: boolean } = {}): Promise<string> {
  const deltas = new Map<string, Map<number, number>>();
  for (const [k, v] of Object.entries(b.chunks)) deltas.set(k, unpackChunk(v)); // validate everything before touching saves
  const id = mode === 'copy' ? newWorldId() : b.world.id;
  let name = b.world.name;
  if (mode === 'copy') {
    const names = new Set((await saves.listWorlds()).map((w) => w.name));
    name = `${b.world.name} (imported)`;
    for (let n = 2; names.has(name); n++) name = `${b.world.name} (imported ${n})`;
  } else {
    await saves.deleteWorld(id);
  }
  await saves.putWorld({ ...b.world, id, name, lastPlayed: opts.keepLastPlayed ? b.world.lastPlayed : Date.now() });
  await saves.putDeltas(id, deltas, deltas.keys());
  if (b.extra) await saves.putExtra(id, b.extra);
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
