// Dropbox sync in a real WebKit engine (Safari's engine: WebKitGTK MiniBrowser over
// WebDriver), posing as an iPhone, against the Dropbox stand-in (tests/mock-dropbox.mjs).
// Checks the browser features sync relies on there: crypto.subtle (PKCE), fetch with
// Dropbox's headers, gzip CompressionStream / DecompressionStream, IndexedDB.
//   xvfb-run -a WebKitWebDriver --port=4444 &   (and a build served on :8765)
//   URL=http://localhost:8765/ node tests/t_webkit_sync.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import { startMockDropbox } from './mock-dropbox.mjs';

const URL = process.env.URL || 'http://localhost:8765/';
const WD = process.env.WD || 'http://localhost:4444';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const KEY = 'testappkey123';
fs.mkdirSync(SHOTS, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 500)); };
const mock = await startMockDropbox({ port: 8791, appKey: KEY, redirects: [new globalThis.URL(URL).origin + '/'] });
const ctl = async (path, body) => (await fetch(mock.url + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })).json();

async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
}
const session = await wd('POST', '/session', {
  capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', args: ['--automation', `--user-agent=${UA}`] } } },
});
const sid = session.sessionId;
const S = (p) => `/session/${sid}${p}`;
const js = (fn, ...args) => wd('POST', S('/execute/sync'), { script: `return (${fn}).apply(null, arguments)`, args });
const jsAsync = (fn, ...args) => wd('POST', S('/execute/async'), { script: `const done = arguments[arguments.length - 1]; Promise.resolve((${fn}).apply(null, Array.prototype.slice.call(arguments, 0, -1))).then(done, (e) => done({ error: String(e) }));`, args });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* page loading */ } await wait(300); } return false; };
const boot = async () => {
  await wd('POST', S('/url'), { url: URL });
  return waitFor(() => js(() => !!(window.__bf && document.querySelector('[data-testid=btn-singleplayer]'))), 60000);
};

try {
  await wd('POST', S('/window/rect'), { width: 900, height: 480 });
  await boot();
  await js((hosts, key) => { localStorage.setItem('blockfell.dropbox.hosts', hosts); localStorage.setItem('blockfell.dropbox.appKey', JSON.stringify(key)); },
    JSON.stringify({ api: mock.url, content: mock.url, www: mock.url }), KEY);
  await boot();
  await js(() => { window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason))); });
  const env = await js(() => ({ subtle: !!crypto.subtle, cs: typeof CompressionStream, ds: typeof DecompressionStream, avail: window.__bf.engine.cloud.dbx.availability }));
  check('WebKit has what sync needs (crypto.subtle, gzip streams)', env.subtle && env.cs === 'function' && env.ds === 'function' && env.avail.ok, env);

  // link with a code (what a Home Screen app on an iPad can always do)
  const url = await jsAsync(() => window.__bf.engine.cloud.dbx.beginCodeLink());
  const html = await (await fetch(url)).text();
  const code = /<code id="auth-code">([^<]+)</.exec(html)?.[1];
  const linked = await jsAsync((c) => window.__bf.engine.cloud.dbx.finishCodeLink(c).then(() => window.__bf.engine.cloud.onLinked()).then(() => window.__bf.ui.get().cloud.linked), code);
  const tok = (await ctl('/__ctl/state')).log.find((l) => l.path === '/oauth2/token');
  check('linking works in WebKit (PKCE challenge made with crypto.subtle, accepted by the token exchange)', linked === true && !!tok?.form.code_verifier, { linked, url: url?.slice?.(0, 60) });

  // a world, played and saved: uploaded as gzip made by WebKit
  await js(() => document.querySelector('[data-testid=btn-singleplayer]').click());
  await wait(500);
  await js(() => document.querySelector('[data-testid=btn-create-new]').click());
  await wait(400);
  await js(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('[data-testid=world-name]', 'WebKit Sync'); set('[data-testid=world-seed]', 'webkit-sync');
  });
  await js(() => document.querySelector('[data-testid=btn-create-world]').click());
  const inGame = await waitFor(() => js(() => window.__bf.state().screen === 'game'), 120000);
  await wait(2000);
  const mark = await js(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x) + 3, z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
    bf.setBlock(x, y, z, 'bricks');
    return { id: g.record.id, x, y, z };
  });
  await jsAsync(() => window.__bf.engine.saveAndQuit());
  await waitFor(() => js(() => window.__bf.state().screen === 'title'), 40000);
  const fr = await fetch(`${mock.url}/__ctl/file?path=/worlds/${mark.id}.blockfell`);
  let data = null;
  if (fr.ok) { const j = await fr.json(); data = JSON.parse(zlib.gunzipSync(Buffer.from(j.base64, 'base64')).toString()); }
  check('Save and Quit in WebKit uploads the world (gzip from CompressionStream, readable by any gzip)', inGame && data?.world?.name === 'WebKit Sync' && data.savedBy === 'iPhone (Safari)', { inGame, by: data?.savedBy });

  // changed elsewhere: WebKit downloads and unpacks it
  data.world.player.x += 10;
  data.world.lastPlayed += 60000;
  await ctl('/__ctl/put-file', { path: `/worlds/${mark.id}.blockfell`, base64: zlib.gzipSync(JSON.stringify(data)).toString('base64') });
  await jsAsync(() => window.__bf.engine.cloud.syncAll());
  const local = await jsAsync((id) => window.__bf.engine.saves.getWorld(id).then((w) => ({ x: w.player.x, lp: w.lastPlayed })), mark.id);
  check('a copy changed on another device is downloaded and read in WebKit (DecompressionStream)', Math.abs(local.x - data.world.player.x) < 0.01 && local.lp === data.world.lastPlayed, { local, want: data.world.player.x });
  const errs = await js(() => window.__errs);
  check('no script errors in WebKit', errs.length === 0, errs);
} catch (e) {
  check('webkit sync test ran to the end', false, String(e));
} finally {
  await wd('DELETE', S('')).catch(() => undefined);
  await mock.close();
}
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
