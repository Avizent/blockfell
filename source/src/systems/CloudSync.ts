/**
 * WORLD SYNC WITH DROPBOX (1.9)
 * -----------------------------
 * Keeps each world in the player's Dropbox (Apps > Blockfell > worlds/<id>.blockfell,
 * the same file format as Export World) so the same world can be played on a Mac and
 * on an iPad. Every device still plays from its own copy in IndexedDB; Dropbox holds
 * the latest copy and its revision ("rev") tells the devices apart:
 *
 *  - each world's sync state (stored next to the worlds, in the `meta` store) is the
 *    rev of the Dropbox copy this device last had, and whether the world has been
 *    saved here since ("dirty");
 *  - uploads use Dropbox's "update" mode with that rev, so a copy saved meanwhile on
 *    another device is never overwritten: the upload fails with a conflict instead;
 *  - opening a world first asks Dropbox for its rev: newer and nothing changed here
 *    -> download it; changed in both places -> the player chooses (keep this one,
 *    use the Dropbox one, or keep both as two worlds);
 *  - while playing, every save marks the world dirty and it is uploaded at most every
 *    two minutes, at once when the app goes to the background, and on Save and Quit;
 *  - the world list syncs everything: worlds from other devices are downloaded, and
 *    worlds played here (or new) are uploaded.
 *
 * A world deleted "here only" leaves a marker (the rev it had) so it isn't simply
 * downloaded again; it comes back if it is played elsewhere. "Delete everywhere"
 * removes the Dropbox copy too (Dropbox keeps deleted files for a while).
 * A world saved by a newer Blockfell than this one is never loaded here (it may hold
 * blocks this version doesn't know): the player is told to restart to update.
 */
import { Dropbox, DropboxError, OfflineError, RelinkError, type FileMeta } from './Dropbox';
import type { SaveManager, WorldRecord } from './SaveManager';
import { createBackup, readBackup, importBackup, type BackupFile } from './WorldBackup';
import { GAME_VERSION } from '../world/constants';
import { GEN_VERSION } from '../world/TerrainGenerator';
import { ui, pushChat, pushToast } from '../ui/uiStore';

export const SYNC_FOLDER = '/worlds';
/** How often a world being played is uploaded (it is also uploaded on leaving the app and on Save and Quit). */
export const UPLOAD_EVERY = 120000;
const pathOf = (id: string): string => `${SYNC_FOLDER}/${id}.blockfell`;
const FILE_RE = /^(w[0-9a-z]+)\.blockfell$/;

export interface WorldSync {
  /** Rev of the Dropbox copy this device's copy is based on (null: never uploaded). */
  rev: string | null;
  /** Saved here since it was last uploaded or downloaded. */
  dirty: boolean;
  seq: number;
  syncedAt: number;
  /** Dropbox has a different copy and this one was played too: the player must choose. */
  conflictRev?: string;
  /** Deleted on this device only, when Dropbox had this rev. */
  deletedHere?: string;
  /** The Dropbox copy was deleted on another device. */
  gone?: boolean;
  /** The Dropbox copy was saved by this newer version of Blockfell. */
  newer?: string;
  /** What is known of the Dropbox copy (for worlds not on this device). */
  remote?: { name: string; lastPlayed: number; savedBy: string; gameVersion: string };
}

interface SyncDoc { worlds: Record<string, WorldSync>; lastSync: number; accountId?: string }

export type SyncOutcome = 'ok' | 'downloaded' | 'uploaded' | 'conflict' | 'newer' | 'offline' | 'relink' | 'error' | 'off' | 'skipped';

export interface CloudWorldUi { text: string; warn: boolean; kind: 'synced' | 'pending' | 'uploading' | 'local' | 'conflict' | 'newer' }
export interface CloudUi {
  available: boolean;
  why: string;
  hasKey: boolean;
  builtInKey: boolean;
  linked: boolean;
  account: string;
  busy: boolean;
  offline: boolean;
  relink: boolean;
  lastSync: number;
  message: string;
  worlds: Record<string, CloudWorldUi>;
  remoteOnly: { id: string; name: string; lastPlayed: number; savedBy: string; newer: string }[];
}

/** "iPad (Safari)", "Mac (Chrome)" ... for "saved on" messages. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  const os = /iPad/.test(ua) || touchMac ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'Chromebook' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : 'Computer';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} (${br})` : os;
}

/** a > b for "1.10.2"-style versions. */
export function newerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0), pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function hhmm(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return today ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface SyncHost {
  saves: SaveManager;
  /** The world being played or loaded (sync never replaces it underneath the game). */
  openWorldId(): string | null;
  /** Worlds that never sync (the benchmark world). */
  ignored(rec: WorldRecord): boolean;
}

export class CloudSync {
  dbx = new Dropbox();
  private doc: SyncDoc = { worlds: {}, lastSync: 0 };
  private locks = new Map<string, Promise<unknown>>();
  private syncing: Promise<void> | null = null;
  private lastUpload = new Map<string, number>();
  private uploading = new Set<string>();
  private warned = new Set<string>();
  private remoteCache = new Map<string, BackupFile>();   // rev -> parsed Dropbox copy
  private offline = false;
  private relink = false;
  private message = '';
  private busy = false;
  private localNames = new Map<string, WorldRecord>();
  /** Worlds being opened right now: prepareToPlay may replace them, a background sync may not. */
  private preparing = new Set<string>();

  constructor(private host: SyncHost) {}

  /** Linked, and linking works here. */
  get active(): boolean { return this.dbx.availability.ok && this.dbx.linked; }

  state(id: string): WorldSync | undefined { return this.doc.worlds[id]; }

  async init(): Promise<void> {
    try { this.doc = (await this.host.saves.getMeta<SyncDoc>('cloudSync')) ?? { worlds: {}, lastSync: 0 }; } catch { /* fresh */ }
    this.doc.worlds ??= {};
    window.addEventListener('online', () => {
      this.offline = false;
      const s = ui.get().screen;
      if (s === 'title' || s === 'worlds') void this.syncAll();
      else { const id = this.host.openWorldId(); if (id && this.state(id)?.dirty) void this.pushWorld(id, true); }
    });
    if (this.dbx.availability.ok) {
      const r = await this.dbx.completeRedirect();
      if (r?.ok) await this.onLinked();
      else if (r) pushToast({ kind: 'info', icon: 'bedrock', title: 'Dropbox not linked', desc: r.message });
    }
    await this.refreshUi();
  }

  /** Just linked (redirect or code). */
  async onLinked(): Promise<void> {
    const acc = this.dbx.account;
    this.relink = false;
    this.offline = false;
    this.message = '';
    if (acc && this.doc.accountId && acc.accountId !== this.doc.accountId) {
      // another Dropbox account: what we knew about the old one means nothing here
      for (const s of Object.values(this.doc.worlds)) { s.rev = null; s.dirty = true; delete s.conflictRev; delete s.deletedHere; delete s.gone; delete s.newer; }
    }
    if (acc) this.doc.accountId = acc.accountId;
    await this.persist();
    pushToast({ kind: 'info', icon: 'chest', title: 'Dropbox linked', desc: acc ? acc.name || acc.email : 'Your worlds will sync' });
    await this.refreshUi();
  }

  async unlink(): Promise<void> {
    await this.dbx.unlink();
    this.relink = false;
    this.message = '';
    await this.refreshUi();
  }

  private async persist(): Promise<void> {
    try { await this.host.saves.putMeta('cloudSync', this.doc); } catch { /* storage off: in memory only */ }
  }

  private st(id: string): WorldSync {
    return (this.doc.worlds[id] ??= { rev: null, dirty: true, seq: 0, syncedAt: 0 });
  }

  /** Runs `fn` once any earlier sync work on world `id` is done (one thing at a time per world). */
  private lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(id, next.catch(() => undefined));
    return next;
  }

  /** The world was saved on this device (autosave, leaving the app, Save and Quit, edits). */
  noteSaved(id: string, urgent: boolean): void {
    const s = this.st(id);
    s.dirty = true;
    s.seq++;
    delete s.deletedHere;
    void this.persist();
    if (this.active && !s.conflictRev && !s.newer && !this.relink) {
      const last = this.lastUpload.get(id) ?? 0;
      if (urgent || Date.now() - last >= UPLOAD_EVERY) void this.pushWorld(id, true);
    }
    void this.refreshUi();
  }

  /** Something about the world changed outside play (renamed, imported). */
  markDirty(id: string): void {
    const s = this.st(id);
    s.dirty = true;
    s.seq++;
    void this.persist();
    void this.refreshUi();
  }

  /** Uploads world `id` if it changed here. */
  pushWorld(id: string, inPlay: boolean): Promise<SyncOutcome> {
    if (!this.active) return Promise.resolve('off');
    return this.lock(id, async () => {
      const s = this.st(id);
      if (s.conflictRev) return 'conflict';
      if (s.newer) return 'newer';
      if (!s.dirty && s.rev) return 'ok';
      return this.upload(id, inPlay);
    });
  }

  private async upload(id: string, inPlay: boolean): Promise<SyncOutcome> {
    const s = this.st(id);
    const seq = s.seq;
    this.lastUpload.set(id, Date.now());
    this.uploading.add(id);
    void this.refreshUi();
    try {
      const { blob } = await createBackup(this.host.saves, id, deviceLabel());
      const meta = await this.dbx.upload(pathOf(id), blob, s.rev);
      s.rev = meta.rev;
      s.syncedAt = Date.now();
      s.dirty = s.seq !== seq;      // saved again while uploading: still to do
      delete s.gone;
      this.offline = false;
      return 'uploaded';
    } catch (e) {
      return this.failed(e, id, inPlay);
    } finally {
      this.uploading.delete(id);
      await this.persist();
      void this.refreshUi();
    }
  }

  private async failed(e: unknown, id: string | null, inPlay: boolean): Promise<SyncOutcome> {
    if (e instanceof OfflineError) { this.offline = true; return 'offline'; }
    if (e instanceof RelinkError) { this.relink = true; return 'relink'; }
    if (e instanceof DropboxError && e.conflict && id) {
      const s = this.st(id);
      let rev = 'unknown';
      try { rev = (await this.dbx.getMetadata(pathOf(id)))?.rev ?? 'unknown'; } catch { /* keep 'unknown' */ }
      s.conflictRev = rev;
      if (inPlay && !this.warned.has(id)) {
        this.warned.add(id);
        pushChat('This world was also saved on another device. Your play here is kept on this device; you can choose which copy to keep in the world list.');
      }
      return 'conflict';
    }
    console.warn('Dropbox sync:', e);
    this.message = (e as Error)?.message ?? String(e);
    return 'error';
  }

  /** Downloads and reads the Dropbox copy of world `id` (cached by rev). */
  private async fetchRemote(id: string, r: FileMeta): Promise<{ b: BackupFile; rev: string }> {
    const hit = this.remoteCache.get(r.rev);
    if (hit) return { b: hit, rev: r.rev };
    let { blob, meta } = await this.dbx.download(pathOf(id));
    let rev = meta?.rev ?? r.rev;
    if (!meta) {
      // the browser couldn't see which rev it got: make sure it is still the one listed
      const now = await this.dbx.getMetadata(pathOf(id));
      if (now && now.rev !== r.rev) { ({ blob, meta } = await this.dbx.download(pathOf(id))); rev = meta?.rev ?? now.rev; }
    }
    const b = await readBackup(blob);
    this.remoteCache.set(rev, b);
    return { b, rev };
  }

  /** Replaces (or adds) this device's copy with the Dropbox copy. */
  private async pull(id: string, r: FileMeta): Promise<SyncOutcome> {
    if (this.host.openWorldId() === id && !this.preparing.has(id)) return 'skipped';
    const { b, rev } = await this.fetchRemote(id, r);
    const s = this.st(id);
    const info = { name: b.world.name, lastPlayed: b.world.lastPlayed, savedBy: b.savedBy ?? '', gameVersion: b.gameVersion };
    if (newerVersion(b.gameVersion, GAME_VERSION) || (b.world.genVersion ?? 1) > GEN_VERSION) {
      s.newer = b.gameVersion;
      s.remote = info;
      return 'newer';
    }
    if (b.world.id !== id) throw new Error('The Dropbox copy belongs to another world');
    await importBackup(this.host.saves, b, 'replace', { keepLastPlayed: true });
    Object.assign(s, { rev, dirty: false, syncedAt: Date.now() });
    delete s.conflictRev; delete s.deletedHere; delete s.gone; delete s.newer; delete s.remote;
    this.offline = false;
    return 'downloaded';
  }

  /** Brings one world in line with its Dropbox copy (`r` null: there is none). */
  private async reconcile(id: string, local: WorldRecord | undefined, r: FileMeta | null): Promise<SyncOutcome> {
    const s = this.doc.worlds[id];
    if (local && !r) {
      if (s?.rev && !s.dirty) { s.gone = true; return 'ok'; }   // deleted from Dropbox on another device: stays here
      return this.upload(id, false);
    }
    if (!local && r) {
      if (s?.deletedHere === r.rev) return 'skipped';
      return this.pull(id, r);
    }
    if (!local || !r) return 'skipped';
    if (s?.rev === r.rev) {
      delete s.conflictRev;
      return s.dirty ? this.upload(id, false) : 'ok';
    }
    if (!s?.rev) {
      // never synced here, yet Dropbox has it (linked again, or the same backup imported on two devices)
      const { b, rev } = await this.fetchRemote(id, r);
      if (b.world.lastPlayed === local.lastPlayed) {
        Object.assign(this.st(id), { rev, dirty: false, syncedAt: Date.now() });
        return 'ok';
      }
      this.st(id).conflictRev = rev;
      return 'conflict';
    }
    // Dropbox has a newer copy, saved on another device
    if (!s.dirty) return this.pull(id, r);
    s.conflictRev = r.rev;
    return 'conflict';
  }

  /** Before world `id` is played: download a newer Dropbox copy, or report a conflict. */
  async prepareToPlay(id: string): Promise<SyncOutcome> {
    if (!this.active) return 'off';
    const out = await this.lock(id, async () => {
      this.preparing.add(id);
      try {
        const r = await this.dbx.getMetadata(pathOf(id), 8000);
        return await this.reconcile(id, await this.host.saves.getWorld(id), r);
      } catch (e) {
        return this.failed(e, id, false);
      } finally {
        this.preparing.delete(id);
      }
    });
    await this.persist();
    await this.refreshUi();
    return out;
  }

  /** Syncs every world: downloads what changed elsewhere, uploads what changed here. */
  syncAll(): Promise<void> {
    if (!this.active) return this.refreshUi();
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      this.busy = true;
      this.message = '';
      void this.refreshUi();
      let changed = false;
      const pulled: string[] = [];
      try {
        const files = await this.dbx.listFolder(SYNC_FOLDER);
        const remote = new Map<string, FileMeta>();
        for (const f of files) { const m = FILE_RE.exec(f.name.toLowerCase()); if (m) remote.set(m[1], f); }
        const locals = new Map((await this.host.saves.listWorlds()).filter((w) => !this.host.ignored(w)).map((w) => [w.id, w]));
        const ids = new Set([...locals.keys(), ...remote.keys()]);
        for (const id of ids) {
          if (id === this.host.openWorldId()) continue;
          const out = await this.lock(id, async () => {
            try { return await this.reconcile(id, locals.get(id), remote.get(id) ?? null); } catch (e) { return this.failed(e, id, false); }
          });
          if (out === 'downloaded') { changed = true; pulled.push((await this.host.saves.getWorld(id))?.name ?? id); }
          if (out === 'offline' || out === 'relink') break;
        }
        // forget markers of worlds that are gone everywhere
        for (const id of Object.keys(this.doc.worlds)) if (!locals.has(id) && !remote.has(id) && !this.uploading.has(id)) delete this.doc.worlds[id];
        if (!this.offline && !this.relink) this.doc.lastSync = Date.now();
      } catch (e) {
        await this.failed(e, null, false);
      } finally {
        this.busy = false;
        await this.persist();
        if (changed) {
          ui.set((st) => ({ worldsVersion: st.worldsVersion + 1 }));
          pushToast({ kind: 'info', icon: 'chest', title: pulled.length === 1 ? 'Updated from Dropbox' : `${pulled.length} worlds updated from Dropbox`, desc: pulled.join(', ') });
        }
        await this.refreshUi();
      }
    })().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  /** What the conflict screen shows: this device's copy and the Dropbox copy. */
  async conflictInfo(id: string): Promise<{ local: WorldRecord | undefined; remote: BackupFile | null; device: string }> {
    const local = await this.host.saves.getWorld(id);
    let remote: BackupFile | null = null;
    try {
      const r = await this.dbx.getMetadata(pathOf(id));
      if (r) remote = (await this.fetchRemote(id, r)).b;
    } catch (e) { await this.failed(e, id, false); }
    return { local, remote, device: deviceLabel() };
  }

  /**
   * Settles a conflict: keep this device's copy (it goes to Dropbox), use the Dropbox
   * copy, or keep both (this device's copy becomes a new world). Returns the outcome
   * and, for 'both', the new world's id.
   */
  async resolve(id: string, choice: 'mine' | 'theirs' | 'both'): Promise<{ out: SyncOutcome; copyId?: string }> {
    let copyId: string | undefined;
    const out = await this.lock(id, async () => {
      try {
        const s = this.st(id);
        const r = await this.dbx.getMetadata(pathOf(id));
        if (choice === 'mine') {
          s.rev = r?.rev ?? null;
          delete s.conflictRev;
          s.dirty = true;
          return this.upload(id, false);
        }
        if (choice === 'both') {
          const rec = await this.host.saves.getWorld(id);
          if (rec) {
            copyId = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
            await this.host.saves.duplicate(rec, copyId, `${rec.name} (${deviceLabel().replace(/ \(.*\)$/, '')} copy)`);
          }
        }
        delete s.conflictRev;
        s.dirty = false;
        if (!r) { s.rev = null; s.dirty = true; return this.upload(id, false); }
        return this.pull(id, r);
      } catch (e) {
        return this.failed(e, id, false);
      }
    });
    if (copyId) await this.pushWorld(copyId, false);
    await this.persist();
    ui.set((st) => ({ worldsVersion: st.worldsVersion + 1 }));
    await this.refreshUi();
    return { out, copyId };
  }

  /** Deleting world `id`: here only (Dropbox keeps it) or everywhere. Throws if Dropbox can't be reached for "everywhere". */
  async deleteWorld(id: string, everywhere: boolean): Promise<void> {
    await this.lock(id, async () => {
      const s = this.doc.worlds[id];
      if (everywhere) {
        await this.dbx.delete(pathOf(id));
        delete this.doc.worlds[id];
      } else if (s?.rev && !s.gone) {
        const rec = await this.host.saves.getWorld(id);
        this.doc.worlds[id] = {
          rev: s.rev, dirty: false, seq: s.seq, syncedAt: s.syncedAt, deletedHere: s.conflictRev ?? s.rev,
          remote: { name: rec?.name ?? id, lastPlayed: rec?.lastPlayed ?? 0, savedBy: '', gameVersion: rec?.version ?? '' },
        };
      } else {
        delete this.doc.worlds[id];
      }
    });
    await this.persist();
    await this.refreshUi();
  }

  /** Brings back a world that is in Dropbox but not on this device. */
  async downloadWorld(id: string): Promise<SyncOutcome> {
    const out = await this.lock(id, async () => {
      try {
        const r = await this.dbx.getMetadata(pathOf(id));
        if (!r) { delete this.doc.worlds[id]; return 'skipped' as SyncOutcome; }
        const s = this.st(id);
        delete s.deletedHere;
        return await this.pull(id, r);
      } catch (e) { return this.failed(e, id, false); }
    });
    await this.persist();
    ui.set((st) => ({ worldsVersion: st.worldsVersion + 1 }));
    await this.refreshUi();
    return out;
  }

  /** Publishes the sync state to the UI store. */
  async refreshUi(): Promise<void> {
    const av = this.dbx.availability;
    let locals: WorldRecord[] = [];
    try { locals = await this.host.saves.listWorlds(); } catch { /* none */ }
    this.localNames = new Map(locals.map((w) => [w.id, w]));
    const worlds: Record<string, CloudWorldUi> = {};
    const linked = av.ok && this.dbx.linked;
    if (linked) {
      for (const w of locals) {
        if (this.host.ignored(w)) continue;
        const s = this.doc.worlds[w.id];
        let u: CloudWorldUi;
        if (s?.newer) u = { kind: 'newer', warn: true, text: `Dropbox copy needs Blockfell ${s.newer}` };
        else if (s?.conflictRev) u = { kind: 'conflict', warn: true, text: 'Changed on two devices: pick one' };
        else if (this.uploading.has(w.id)) u = { kind: 'uploading', warn: false, text: 'Uploading to Dropbox...' };
        else if (!s || !s.rev) u = { kind: 'pending', warn: false, text: 'Not in Dropbox yet' };
        else if (s.gone && !s.dirty) u = { kind: 'local', warn: false, text: 'Only here (deleted from Dropbox)' };
        else if (s.dirty) u = { kind: 'pending', warn: false, text: 'Waiting to upload to Dropbox' };
        else u = { kind: 'synced', warn: false, text: `In Dropbox, synced ${hhmm(s.syncedAt)}` };
        worlds[w.id] = u;
      }
    }
    const remoteOnly: CloudUi['remoteOnly'] = [];
    if (linked) {
      for (const [id, s] of Object.entries(this.doc.worlds)) {
        if (this.localNames.has(id) || !(s.deletedHere || s.newer) || !s.remote) continue;
        remoteOnly.push({ id, name: s.remote.name, lastPlayed: s.remote.lastPlayed, savedBy: s.remote.savedBy, newer: s.newer ?? '' });
      }
    }
    const acc = this.dbx.account;
    ui.set({
      cloud: {
        available: av.ok, why: av.ok ? '' : av.why, hasKey: !!this.dbx.appKey, builtInKey: this.dbx.builtInKey, linked,
        account: acc ? (acc.email ? `${acc.name} (${acc.email})` : acc.name) : '', busy: this.busy, offline: this.offline,
        relink: this.relink && !this.dbx.linked, lastSync: this.doc.lastSync, message: this.message,
        worlds, remoteOnly,
      },
    });
  }

  /** One line for the bottom of the world list. */
  static summary(c: CloudUi): string {
    if (c.relink) return 'Dropbox: the link has expired - open Dropbox Sync to link again';
    if (c.busy) return 'Dropbox: syncing...';
    if (c.offline) return 'Dropbox: offline - your worlds will sync when you are back online';
    if (c.message) return `Dropbox: ${c.message}`;
    return c.lastSync ? `Dropbox: synced ${hhmm(c.lastSync)}` : 'Dropbox: linked';
  }
}
