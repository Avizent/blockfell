/**
 * DROPBOX CLIENT (1.9)
 * --------------------
 * A small Dropbox API v2 client for a page running in the browser, used by the
 * world sync (CloudSync.ts). It links to the player's Dropbox with OAuth 2 and PKCE
 * (no client secret: the app key is public and safe to ship), keeps the long-lived
 * refresh token in this browser's localStorage, and swaps it for short-lived access
 * tokens as needed. The Dropbox app is an "App folder" app, so Blockfell can only
 * ever see its own folder (Dropbox > Apps > Blockfell), never the rest of Dropbox.
 *
 * Two ways to link:
 *  - redirect: the page goes to dropbox.com, the player allows access and Dropbox
 *    sends the browser back to this page with a one-time code (completeRedirect);
 *  - code: Dropbox opens in another tab and shows the code, which the player pastes
 *    back in (for a Home Screen app on an iPad, if the redirect doesn't come back).
 *
 * Endpoints used: oauth2/authorize, oauth2/token, users/get_current_account,
 * files/list_folder(+continue), files/get_metadata, files/upload, files/download,
 * files/delete_v2, auth/token/revoke.
 */

/** The Blockfell app's key from the Dropbox App Console. Empty: the player pastes it in once (Dropbox Sync screen). */
export const DROPBOX_APP_KEY_BUILTIN = '';

export interface DropboxHosts { api: string; content: string; www: string }
const REAL_HOSTS: DropboxHosts = { api: 'https://api.dropboxapi.com', content: 'https://content.dropboxapi.com', www: 'https://www.dropbox.com' };

export interface FileMeta {
  name: string;
  path_lower: string;
  path_display?: string;
  id?: string;
  rev: string;
  size: number;
  server_modified?: string;
  client_modified?: string;
}

export interface DropboxAccount { name: string; email: string; accountId: string }

interface StoredAuth { appKey: string; refreshToken: string; account: DropboxAccount | null; linkedAt: number }
interface PendingLink { verifier: string; state: string; appKey: string; redirect: string | null; t: number }

const LS_AUTH = 'blockfell.dropbox.v1';
const LS_PENDING = 'blockfell.dropbox.pending';
const LS_KEY = 'blockfell.dropbox.appKey';
const LS_HOSTS = 'blockfell.dropbox.hosts';   // test servers, honoured on localhost only

/** A request that reached Dropbox and failed. */
export class DropboxError extends Error {
  constructor(public status: number, public summary: string, public error: unknown, public retryAfter = 0) {
    super(`Dropbox: ${summary || 'HTTP ' + status}`);
  }
  /** files/upload in "update" mode with a rev that is no longer the file's: someone else saved it. */
  get conflict(): boolean {
    const e = this.error as { reason?: { '.tag'?: string } } | undefined;
    return this.status === 409 && (/^path\/conflict/.test(this.summary) || e?.reason?.['.tag'] === 'conflict');
  }
  get notFound(): boolean {
    return this.status === 409 && /not_found/.test(this.summary);
  }
}

/** Dropbox could not be reached at all (no connection, timed out). */
export class OfflineError extends Error {
  constructor(msg = 'Dropbox could not be reached') { super(msg); }
}

/** The link is gone (refresh token revoked or the app removed): the player must link again. */
export class RelinkError extends Error {
  constructor() { super('The link to Dropbox has expired. Link again.'); }
}

function lsGet<T>(k: string): T | null {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function lsSet(k: string, v: unknown): void {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ }
}

function randomString(n: number): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += abc[x % abc.length];
  return s;
}

function base64Url(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JSON for the Dropbox-API-Arg header: HTTP headers must be ASCII, so escape anything else. */
export function headerJson(v: unknown): string {
  return JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

const isLocalHost = (): boolean => location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export class Dropbox {
  hosts: DropboxHosts = REAL_HOSTS;
  private auth: StoredAuth | null = null;
  private access: { token: string; exp: number } | null = null;
  private refreshing: Promise<string> | null = null;
  /** Calls made (for the F3 overlay and tests). */
  calls = 0;

  constructor() {
    if (isLocalHost()) {
      const h = lsGet<DropboxHosts>(LS_HOSTS);
      if (h?.api && h.content && h.www) this.hosts = h;
    }
    this.auth = lsGet<StoredAuth>(LS_AUTH);
    if (this.auth && (!this.auth.refreshToken || !this.auth.appKey)) this.auth = null;
  }

  /** Whether linking can work here: a web address (https, or localhost), not inside another page. */
  get availability(): { ok: true } | { ok: false; why: 'file' | 'embedded' | 'insecure' | 'nocrypto' } {
    let framed = false;
    try { framed = window.self !== window.top; } catch { framed = true; }
    if (location.protocol === 'file:') return { ok: false, why: 'file' };
    if (framed) return { ok: false, why: 'embedded' };
    if (location.protocol !== 'https:' && !isLocalHost()) return { ok: false, why: 'insecure' };
    if (!globalThis.crypto?.subtle || typeof fetch !== 'function') return { ok: false, why: 'nocrypto' };
    return { ok: true };
  }

  get appKey(): string {
    return DROPBOX_APP_KEY_BUILTIN || (lsGet<string>(LS_KEY) ?? '');
  }

  get builtInKey(): boolean { return !!DROPBOX_APP_KEY_BUILTIN; }

  setAppKey(k: string): void {
    lsSet(LS_KEY, k.trim() || null);
  }

  get linked(): boolean { return !!this.auth; }
  get account(): DropboxAccount | null { return this.auth?.account ?? null; }

  /** This page's address, as registered in the App Console (the folder, without index.html or a query). */
  redirectUri(): string {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  private async newPending(redirect: string | null): Promise<{ p: PendingLink; challenge: string }> {
    const appKey = this.appKey;
    if (!appKey) throw new Error('No Dropbox app key');
    const verifier = randomString(64);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const p: PendingLink = { verifier, state: randomString(24), appKey, redirect, t: Date.now() };
    lsSet(LS_PENDING, p);
    return { p, challenge: base64Url(digest) };
  }

  private authorizeUrl(p: PendingLink, challenge: string): string {
    const q = new URLSearchParams({
      client_id: p.appKey, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
      token_access_type: 'offline',
    });
    if (p.redirect) { q.set('redirect_uri', p.redirect); q.set('state', p.state); }
    return `${this.hosts.www}/oauth2/authorize?${q}`;
  }

  /** Link by sending this page to dropbox.com; Dropbox sends it back with a code. */
  async beginLink(): Promise<void> {
    const { p, challenge } = await this.newPending(this.redirectUri());
    location.assign(this.authorizeUrl(p, challenge));
  }

  /** Link with a code shown by Dropbox: returns the address to open in another tab. */
  async beginCodeLink(): Promise<string> {
    const { p, challenge } = await this.newPending(null);
    return this.authorizeUrl(p, challenge);
  }

  /** The player pasted the code from the Dropbox page. */
  async finishCodeLink(code: string): Promise<DropboxAccount | null> {
    const p = lsGet<PendingLink>(LS_PENDING);
    if (!p || p.redirect !== null) throw new Error('Press Link With a Code first');
    return this.exchange(p, code.trim());
  }

  /**
   * On start-up: if Dropbox just sent the browser back here, finish linking and tidy
   * the address bar. Returns null when this was an ordinary start.
   */
  async completeRedirect(): Promise<{ ok: true; account: DropboxAccount | null } | { ok: false; message: string } | null> {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), state = q.get('state'), err = q.get('error');
    if (!code && !err) return null;
    const p = lsGet<PendingLink>(LS_PENDING);
    if (!p || state !== p.state) return null;      // not ours (or an old tab): leave the address alone
    history.replaceState(null, '', this.redirectUri() + location.hash);
    if (err) {
      lsSet(LS_PENDING, null);
      return { ok: false, message: err === 'access_denied' ? 'You chose not to link Dropbox' : `Dropbox said: ${q.get('error_description') ?? err}` };
    }
    try {
      return { ok: true, account: await this.exchange(p, code!) };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  private async exchange(p: PendingLink, code: string): Promise<DropboxAccount | null> {
    const body = new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: p.verifier, client_id: p.appKey });
    if (p.redirect) body.set('redirect_uri', p.redirect);
    const res = await this.fetchRaw(`${this.hosts.api}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 20000);
    const j = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!res.ok || !j.access_token || !j.refresh_token) {
      throw new Error(j.error === 'invalid_grant' ? 'That code has expired or was already used. Try again.' : `Dropbox refused the link: ${j.error_description ?? j.error ?? res.status}`);
    }
    lsSet(LS_PENDING, null);
    this.auth = { appKey: p.appKey, refreshToken: j.refresh_token, account: null, linkedAt: Date.now() };
    this.access = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 14400) * 1000 };
    lsSet(LS_AUTH, this.auth);
    try {
      const a = await this.rpc<{ account_id: string; email?: string; name?: { display_name?: string } }>('users/get_current_account', null);
      this.auth.account = { name: a.name?.display_name ?? '', email: a.email ?? '', accountId: a.account_id };
      lsSet(LS_AUTH, this.auth);
    } catch { /* the name is only for show */ }
    return this.auth.account;
  }

  /** Forgets the link here (and tells Dropbox to revoke it, if it can be reached). */
  async unlink(): Promise<void> {
    if (this.auth) {
      try { await this.call(`${this.hosts.api}/2/auth/token/revoke`, {}, 8000); } catch { /* offline: forget it anyway */ }
    }
    this.forget();
  }

  private forget(): void {
    this.auth = null;
    this.access = null;
    lsSet(LS_AUTH, null);
  }

  // ------------------------------------------------------------------ requests
  private async fetchRaw(url: string, init: RequestInit, timeout: number): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    this.calls++;
    try {
      return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
    } catch {
      throw new OfflineError(ctl.signal.aborted ? 'Dropbox took too long to answer' : 'Dropbox could not be reached');
    } finally {
      clearTimeout(t);
    }
  }

  /** A valid access token (refreshed when it is about to run out). */
  private async token(): Promise<string> {
    if (!this.auth) throw new RelinkError();
    if (this.access && this.access.exp - Date.now() > 60000) return this.access.token;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const a = this.auth!;
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: a.appKey });
        const res = await this.fetchRaw(`${this.hosts.api}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 20000);
        const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
        if (!res.ok || !j.access_token) {
          if (res.status === 400 || res.status === 401) { this.forget(); throw new RelinkError(); }
          throw new DropboxError(res.status, j.error ?? 'token refresh failed', j);
        }
        this.access = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 14400) * 1000 };
        return j.access_token;
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  /**
   * One authorised request: refreshes the token and retries once on 401, waits and
   * retries once on 429 / 5xx.
   */
  private async call(url: string, init: { headers?: Record<string, string>; body?: BodyInit }, timeout: number): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const res = await this.fetchRaw(url, { method: 'POST', headers: { ...init.headers, Authorization: `Bearer ${token}` }, body: init.body }, timeout);
      if (res.ok) return res;
      let j: { error_summary?: string; error?: unknown } = {};
      try { j = await res.json(); } catch { /* not JSON */ }
      const summary = j.error_summary ?? '';
      if (res.status === 401 && /missing_scope/.test(summary)) {
        throw new DropboxError(401, summary, j.error);   // the app in the App Console lacks a permission: relinking won't help
      }
      if (res.status === 401 && attempt === 0) {
        this.access = null;   // expired or revoked: one refresh and try again
        continue;
      }
      if (res.status === 401) { this.forget(); throw new RelinkError(); }
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, Math.min(10, retryAfter || 2) * 1000));
        continue;
      }
      throw new DropboxError(res.status, summary, j.error, retryAfter);
    }
  }

  async rpc<T>(endpoint: string, arg: unknown, timeout = 20000): Promise<T> {
    const init = arg === null ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) };
    const res = await this.call(`${this.hosts.api}/2/${endpoint}`, init, timeout);
    return res.json() as Promise<T>;
  }

  /** Every file in a folder (following has_more); [] when the folder doesn't exist yet. */
  async listFolder(path: string): Promise<FileMeta[]> {
    const out: FileMeta[] = [];
    try {
      let r = await this.rpc<{ entries: (FileMeta & { '.tag': string })[]; cursor: string; has_more: boolean }>('files/list_folder', { path, recursive: false, include_deleted: false });
      for (;;) {
        for (const e of r.entries) if (e['.tag'] === 'file') out.push(e);
        if (!r.has_more) break;
        r = await this.rpc('files/list_folder/continue', { cursor: r.cursor });
      }
    } catch (e) {
      if (e instanceof DropboxError && e.notFound) return [];
      throw e;
    }
    return out;
  }

  async getMetadata(path: string, timeout = 20000): Promise<FileMeta | null> {
    try {
      const m = await this.rpc<FileMeta & { '.tag': string }>('files/get_metadata', { path }, timeout);
      return m['.tag'] === 'file' ? m : null;
    } catch (e) {
      if (e instanceof DropboxError && e.notFound) return null;
      throw e;
    }
  }

  /** Uploads a file: as a new file (rev null) or over exactly the revision `rev` (else a conflict error). */
  async upload(path: string, data: Blob, rev: string | null): Promise<FileMeta> {
    const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };
    const res = await this.call(`${this.hosts.content}/2/files/upload`, {
      headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJson({ path, mode, autorename: false, mute: true, strict_conflict: false }) },
      body: data,
    }, 120000);
    return res.json() as Promise<FileMeta>;
  }

  /** Downloads a file; `meta` comes from the Dropbox-API-Result header when the browser may read it. */
  async download(path: string): Promise<{ blob: Blob; meta: FileMeta | null }> {
    const res = await this.call(`${this.hosts.content}/2/files/download`, { headers: { 'Dropbox-API-Arg': headerJson({ path }) } }, 120000);
    let meta: FileMeta | null = null;
    try { const h = res.headers.get('Dropbox-API-Result'); if (h) meta = JSON.parse(h) as FileMeta; } catch { /* not exposed */ }
    return { blob: await res.blob(), meta };
  }

  async delete(path: string): Promise<void> {
    try {
      await this.rpc('files/delete_v2', { path });
    } catch (e) {
      if (e instanceof DropboxError && e.notFound) return;
      throw e;
    }
  }
}
