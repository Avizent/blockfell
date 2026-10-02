// A stand-in for the Dropbox API (the parts Blockfell's sync uses), for tests.
// It follows Dropbox's documented formats: OAuth 2 code flow with PKCE (authorize
// redirect or a code shown on the page, token exchange, refresh tokens), RPC
// endpoints with JSON bodies, content endpoints with the Dropbox-API-Arg header and
// Dropbox-API-Result response header, 401/409/429 error bodies with error_summary,
// and upload write modes add / overwrite / update (rev must match, else a conflict).
//
//   import { startMockDropbox } from './mock-dropbox.mjs';
//   const mock = await startMockDropbox({ port: 8790, appKey: 'testappkey123', redirects: ['http://localhost:5173/'] });
//
// Control endpoints for tests: GET /__ctl/state, GET /__ctl/file?path=, POST /__ctl/put-file,
// POST /__ctl/set (pageSize, accessTtl, exposeResult, deny, rateLimitNext), POST /__ctl/expire-access,
// POST /__ctl/revoke-all, POST /__ctl/reset.
import http from 'node:http';
import crypto from 'node:crypto';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function startMockDropbox({ port = 8790, appKey = 'testappkey123', redirects = [] } = {}) {
  const S = {
    files: new Map(),         // path_lower -> { name, path_display, content: Buffer, rev, server_modified, id }
    revN: 0x1a2b0,
    codes: new Map(),         // code -> { challenge, redirect, clientId }
    access: new Map(),        // token -> { exp, refresh }
    refresh: new Set(),
    log: [],
    pageSize: 2,
    accessTtl: 14400,
    exposeResult: true,
    deny: false,
    rateLimitNext: 0,
    cursors: new Map(),
    lastCode: null,
  };
  const account = { account_id: 'dbid:AAtestplayer', name: { given_name: 'Test', surname: 'Player', display_name: 'Test Player' }, email: 'test.player@example.com', email_verified: true };

  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (S.exposeResult) res.setHeader('Access-Control-Expose-Headers', 'Dropbox-API-Result');
  };
  const json = (res, status, obj) => { cors(res); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const err409 = (res, summary, error) => json(res, 409, { error_summary: summary + '/..', error });
  const meta = (f) => ({ '.tag': 'file', name: f.name, path_lower: f.path_display.toLowerCase(), path_display: f.path_display, id: f.id, client_modified: f.server_modified, server_modified: f.server_modified, rev: f.rev, size: f.content.length, is_downloadable: true, content_hash: crypto.createHash('sha256').update(f.content).digest('hex') });
  const nextRev = () => (S.revN++).toString(16) + '0000000' + Math.floor(Math.random() * 1e6).toString(16);

  const body = (req) => new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });

  const authOk = (req, res) => {
    const h = req.headers.authorization ?? '';
    const t = /^Bearer (.+)$/.exec(h)?.[1];
    const a = t && S.access.get(t);
    if (!a) { json(res, 401, { error_summary: 'invalid_access_token/..', error: { '.tag': 'invalid_access_token' } }); return null; }
    if (a.exp < Date.now()) { json(res, 401, { error_summary: 'expired_access_token/..', error: { '.tag': 'expired_access_token' } }); return null; }
    return t;
  };
  const issue = (refresh) => {
    const token = 'sl.' + crypto.randomBytes(24).toString('hex');
    S.access.set(token, { exp: Date.now() + S.accessTtl * 1000, refresh });
    return token;
  };
  const argHeader = (req) => {
    const raw = req.headers['dropbox-api-arg'];
    if (!raw) return null;
    if (/[^\x20-\x7e]/.test(raw)) return 'nonascii';
    return JSON.parse(raw);
  };
  const folderOf = (p) => p.slice(0, p.lastIndexOf('/')) || '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = url.pathname;
    if (req.method === 'OPTIONS') {
      cors(res);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Dropbox-API-Arg');
      res.writeHead(204); res.end(); return;
    }
    const raw = req.method === 'POST' ? await body(req) : Buffer.alloc(0);
    S.log.push({ t: Date.now(), path: p, auth: !!req.headers.authorization, arg: req.headers['dropbox-api-arg'] ?? null, ct: req.headers['content-type'] ?? null, form: p === '/oauth2/token' ? Object.fromEntries(new URLSearchParams(raw.toString())) : null });
    if (S.log.length > 2000) S.log.shift();

    // ------------------------------------------------------------ control
    if (p.startsWith('/__ctl/')) {
      const q = raw.length ? JSON.parse(raw.toString()) : {};
      if (p === '/__ctl/state') return json(res, 200, { files: [...S.files.values()].map(meta), log: S.log, lastCode: S.lastCode, access: S.access.size, refresh: S.refresh.size });
      if (p === '/__ctl/file') { const f = S.files.get((url.searchParams.get('path') ?? '').toLowerCase()); return f ? json(res, 200, { meta: meta(f), base64: f.content.toString('base64') }) : json(res, 404, {}); }
      if (p === '/__ctl/put-file') {
        const pl = q.path.toLowerCase(), old = S.files.get(pl);
        const f = { name: q.path.slice(q.path.lastIndexOf('/') + 1), path_display: q.path, content: Buffer.from(q.base64, 'base64'), rev: nextRev(), server_modified: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), id: old?.id ?? 'id:' + crypto.randomBytes(8).toString('hex') };
        S.files.set(pl, f); return json(res, 200, meta(f));
      }
      if (p === '/__ctl/delete-file') { S.files.delete(q.path.toLowerCase()); return json(res, 200, {}); }
      if (p === '/__ctl/set') { for (const k of ['pageSize', 'accessTtl', 'exposeResult', 'deny', 'rateLimitNext']) if (k in q) S[k] = q[k]; return json(res, 200, {}); }
      if (p === '/__ctl/expire-access') { for (const a of S.access.values()) a.exp = 0; return json(res, 200, {}); }
      if (p === '/__ctl/revoke-all') { S.access.clear(); S.refresh.clear(); return json(res, 200, {}); }
      if (p === '/__ctl/revoke') { S.refresh.delete(q.refresh); for (const [t, a] of S.access) if (a.refresh === q.refresh) S.access.delete(t); return json(res, 200, {}); }
      if (p === '/__ctl/clear-log') { S.log.length = 0; return json(res, 200, {}); }
      return json(res, 404, {});
    }

    // ------------------------------------------------------------ OAuth
    if (p === '/oauth2/authorize' && req.method === 'GET') {
      const q = url.searchParams;
      const bad = (m) => { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end(m); };
      if (q.get('client_id') !== appKey) return bad('invalid client_id');
      if (q.get('response_type') !== 'code') return bad('response_type must be code');
      if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return bad('PKCE challenge missing');
      if (q.get('token_access_type') !== 'offline') return bad('expected token_access_type=offline');
      const redirect = q.get('redirect_uri');
      if (redirect && !redirects.includes(redirect)) return bad('redirect_uri not registered: ' + redirect);
      if (S.deny && redirect) { res.writeHead(302, { Location: `${redirect}?error=access_denied&error_description=The+user+chose+not+to+give+your+app+access&state=${encodeURIComponent(q.get('state') ?? '')}` }); res.end(); return; }
      const code = 'code' + crypto.randomBytes(16).toString('hex');
      S.codes.set(code, { challenge: q.get('code_challenge'), redirect, clientId: q.get('client_id') });
      S.lastCode = code;
      if (redirect) { res.writeHead(302, { Location: `${redirect}?code=${code}&state=${encodeURIComponent(q.get('state') ?? '')}` }); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><title>Dropbox (test)</title><p>Enter this code into Blockfell to finish the process.</p><code id="auth-code">${code}</code>`);
      return;
    }
    if (p === '/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(raw.toString());
      if (!/^application\/x-www-form-urlencoded/.test(req.headers['content-type'] ?? '')) return json(res, 400, { error: 'invalid_request', error_description: 'form body expected' });
      if (f.get('grant_type') === 'authorization_code') {
        const c = S.codes.get(f.get('code') ?? '');
        if (!c) return json(res, 400, { error: 'invalid_grant', error_description: 'code doesn\'t exist or has expired' });
        S.codes.delete(f.get('code'));
        if (f.get('client_id') !== c.clientId) return json(res, 400, { error: 'invalid_client' });
        if (b64url(crypto.createHash('sha256').update(f.get('code_verifier') ?? '').digest()) !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'invalid code verifier' });
        if ((f.get('redirect_uri') ?? null) !== c.redirect) return json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        const refresh = 'rt.' + crypto.randomBytes(24).toString('hex');
        S.refresh.add(refresh);
        return json(res, 200, { access_token: issue(refresh), token_type: 'bearer', expires_in: S.accessTtl, refresh_token: refresh, scope: 'account_info.read files.content.read files.content.write files.metadata.read', uid: '12345', account_id: account.account_id });
      }
      if (f.get('grant_type') === 'refresh_token') {
        if (f.get('client_id') !== appKey || !S.refresh.has(f.get('refresh_token') ?? '')) return json(res, 400, { error: 'invalid_grant', error_description: 'refresh token is invalid or revoked' });
        return json(res, 200, { access_token: issue(f.get('refresh_token')), token_type: 'bearer', expires_in: S.accessTtl });
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }

    // ------------------------------------------------------------ API v2
    if (!p.startsWith('/2/') || req.method !== 'POST') return json(res, 404, {});
    const token = authOk(req, res);
    if (!token) return;
    if (S.rateLimitNext > 0) { S.rateLimitNext--; cors(res); res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' }); res.end(JSON.stringify({ error_summary: 'too_many_requests/..', error: { reason: { '.tag': 'too_many_requests' }, retry_after: 1 } })); return; }
    const isContent = p === '/2/files/upload' || p === '/2/files/download';
    let arg;
    if (isContent) {
      arg = argHeader(req);
      if (arg === 'nonascii') return json(res, 400, { error: 'Dropbox-API-Arg must be ASCII' });
      if (!arg) return json(res, 400, { error: 'missing Dropbox-API-Arg' });
    } else if (raw.length) {
      if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return json(res, 400, { error: 'Bad HTTP "Content-Type" header' });
      arg = JSON.parse(raw.toString());
    } else arg = null;

    switch (p) {
      case '/2/users/get_current_account':
        if (raw.length && raw.toString() !== 'null') return json(res, 400, { error: 'no arguments expected' });
        return json(res, 200, account);
      case '/2/auth/token/revoke': {
        const a = S.access.get(token);
        S.access.delete(token);
        if (a?.refresh) { S.refresh.delete(a.refresh); for (const [t, x] of S.access) if (x.refresh === a.refresh) S.access.delete(t); }
        return json(res, 200, null);
      }
      case '/2/files/list_folder': {
        const dir = (arg.path ?? '').toLowerCase();
        const all = [...S.files.values()].filter((f) => folderOf(f.path_display.toLowerCase()) === dir).map(meta);
        if (dir && !all.length) return err409(res, 'path/not_found', { '.tag': 'path', path: { '.tag': 'not_found' } });
        const cursor = 'cur' + crypto.randomBytes(6).toString('hex');
        S.cursors.set(cursor, all.slice(S.pageSize));
        return json(res, 200, { entries: all.slice(0, S.pageSize), cursor, has_more: all.length > S.pageSize });
      }
      case '/2/files/list_folder/continue': {
        const rest = S.cursors.get(arg.cursor);
        if (!rest) return err409(res, 'reset', { '.tag': 'reset' });
        const cursor = 'cur' + crypto.randomBytes(6).toString('hex');
        S.cursors.set(cursor, rest.slice(S.pageSize));
        return json(res, 200, { entries: rest.slice(0, S.pageSize), cursor, has_more: rest.length > S.pageSize });
      }
      case '/2/files/get_metadata': {
        const f = S.files.get(arg.path.toLowerCase());
        return f ? json(res, 200, meta(f)) : err409(res, 'path/not_found', { '.tag': 'path', path: { '.tag': 'not_found' } });
      }
      case '/2/files/delete_v2': {
        const f = S.files.get(arg.path.toLowerCase());
        if (!f) return err409(res, 'path_lookup/not_found', { '.tag': 'path_lookup', path_lookup: { '.tag': 'not_found' } });
        S.files.delete(arg.path.toLowerCase());
        return json(res, 200, { metadata: meta(f) });
      }
      case '/2/files/download': {
        const f = S.files.get(arg.path.toLowerCase());
        if (!f) return err409(res, 'path/not_found', { '.tag': 'path', path: { '.tag': 'not_found' } });
        cors(res);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Result': JSON.stringify(meta(f)) });
        res.end(f.content);
        return;
      }
      case '/2/files/upload': {
        if (req.headers['content-type'] !== 'application/octet-stream') return json(res, 400, { error: 'Content-Type must be application/octet-stream' });
        const pl = arg.path.toLowerCase(), old = S.files.get(pl);
        const mode = typeof arg.mode === 'string' ? { '.tag': arg.mode } : (arg.mode ?? { '.tag': 'add' });
        const conflict = () => err409(res, 'path/conflict/file', { '.tag': 'path', reason: { '.tag': 'conflict', conflict: { '.tag': 'file' } }, upload_session_id: 'x' });
        if (old && mode['.tag'] === 'add' && !arg.autorename) return conflict();
        if (old && mode['.tag'] === 'update' && mode.update !== old.rev) return conflict();
        if (!old && mode['.tag'] === 'update' && arg.strict_conflict) return conflict();
        const f = { name: arg.path.slice(arg.path.lastIndexOf('/') + 1), path_display: arg.path, content: raw, rev: nextRev(), server_modified: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), id: old?.id ?? 'id:' + crypto.randomBytes(8).toString('hex') };
        S.files.set(pl, f);
        return json(res, 200, meta(f));
      }
      default:
        return json(res, 400, { error: 'unknown endpoint ' + p });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, state: S, url: `http://localhost:${port}`, close: () => new Promise((r) => server.close(r)) })));
}

// standalone: node tests/mock-dropbox.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await startMockDropbox({ redirects: ['http://localhost:5173/', 'http://localhost:8765/'] });
  console.log('mock Dropbox on', m.url);
}
