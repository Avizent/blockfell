// 1.9 Dropbox sync, end to end, with two "devices" (two browser profiles: a Mac and an
// iPad) sharing one Dropbox - the test stand-in in tests/mock-dropbox.mjs, which
// follows Dropbox's documented API (PKCE OAuth, refresh tokens, rev-checked uploads).
//   node tests/t_sync.mjs        (dev server on :5173; starts the mock on :8790)
//   URL=http://localhost:8765/ node tests/t_sync.mjs   (the single-file build)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { startMockDropbox } from './mock-dropbox.mjs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const MOCK_PORT = Number(process.env.MOCK_PORT || 8790);
const KEY = 'testappkey123';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, typeof info === 'string' ? info : JSON.stringify(info)]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400)); };

const mock = await startMockDropbox({ port: MOCK_PORT, appKey: KEY, redirects: [new globalThis.URL(URL).origin + '/'] });
const ctl = async (path, body) => (await fetch(mock.url + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })).json();
const ctlReady = ctl('/__ctl/set', { pageSize: 1 });   // every listing of 2+ worlds comes in pages (has_more)
await ctlReady;
const mockFiles = async () => (await ctl('/__ctl/state')).files;
const mockFile = async (id) => {
  const r = await fetch(`${mock.url}/__ctl/file?path=/worlds/${id}.blockfell`);
  if (!r.ok) return null;
  const j = await r.json();
  return { meta: j.meta, data: JSON.parse(zlib.gunzipSync(Buffer.from(j.base64, 'base64')).toString()) };
};

const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const errors = [];
const HOSTS = JSON.stringify({ api: mock.url, content: mock.url, www: mock.url });

async function device(name, opts) {
  const ctx = await b.newContext(opts.context);
  await ctx.addInitScript(([hosts, key]) => {
    localStorage.setItem('blockfell.dropbox.hosts', hosts);
    if (key) localStorage.setItem('blockfell.dropbox.appKey', JSON.stringify(key));
  }, [HOSTS, opts.key ?? null]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`${name}: ${e}`); console.log('pageerror', name, String(e)); });
  const d = { name, ctx, page };
  d.ev = (fn, a) => page.evaluate(fn, a);
  d.wait = (ms) => page.waitForTimeout(ms);
  d.waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await d.wait(200); } return false; };
  d.screen = () => d.ev(() => window.__bf?.state().screen);
  d.cloud = () => d.ev(() => window.__bf.ui.get().cloud);
  // every toast since the page loaded (they only stay up for 5 seconds)
  d.toasts = () => d.ev(() => window.__toastLog ?? []);
  d.clearToasts = () => d.ev(() => { window.__toastLog = []; });
  d.chat = () => d.ev(() => window.__bf.ui.get().chat.map((c) => c.text));
  d.logToasts = () => d.ev(() => {
    const u = window.__bf.ui, seen = new Set();
    window.__toastLog = [];
    const grab = () => { for (const t of u.get().toasts) if (!seen.has(t.id)) { seen.add(t.id); window.__toastLog.push(`${t.title}|${t.desc}`); } };
    grab(); u.subscribe(grab);
  });
  d.open = async () => { await page.goto(URL); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await d.logToasts(); await d.wait(600); };
  d.toWorlds = async () => {
    if ((await d.screen()) !== 'worlds') { await tap(page, '[data-testid=btn-singleplayer]'); await page.waitForSelector('[data-testid=world-select]'); }
    await d.wait(300);
    await d.ev(() => window.__bf.engine.cloud.syncAll());
    await d.wait(400);
  };
  d.worlds = () => d.ev(async () => (await window.__bf.engine.saves.listWorlds()).map((w) => ({ id: w.id, name: w.name, lastPlayed: w.lastPlayed })));
  d.state = (id) => d.ev((id) => window.__bf.engine.cloud.state(id) ?? null, id);
  d.play = async (id) => {
    await d.ev((id) => void window.__bf.engine.playWorld(id), id);
    await d.waitFor(async () => { const s = await d.screen(); return s === 'game' || (s === 'worlds' && await d.ev(() => !!window.__bf.ui.get().syncPrompt)); }, 90000);
    if ((await d.screen()) === 'game') { await d.ev(() => window.__bf.allowUnlocked(true)); await d.wait(1200); }
    return d.screen();
  };
  d.quit = async () => { await d.ev(() => window.__bf.engine.saveAndQuit()); await d.waitFor(async () => (await d.screen()) === 'title', 40000); await d.wait(300); };
  d.create = async (wname, seed) => {
    await d.toWorlds();
    await tap(page, '[data-testid=btn-create-new]');
    await page.fill('[data-testid=world-name]', wname);
    await page.fill('[data-testid=world-seed]', seed);
    await tap(page, '[data-testid=btn-create-world]');
    await d.waitFor(async () => (await d.screen()) === 'game', 90000);
    await d.ev(() => window.__bf.allowUnlocked(true));
    await d.wait(1500);
    return d.ev(() => window.__bf.game.record.id);
  };
  return d;
}

/** Clicks a button; if the browser doesn't settle it for a while (a busy frame), presses it directly. */
async function tap(page, sel) {
  try { await page.click(sel, { timeout: 8000 }); } catch { await page.$eval(sel, (el) => el.click()); }
}

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const mac = await device('Mac', { context: { viewport: { width: 1280, height: 720 }, userAgent: MAC_UA } });
const ipad = await device('iPad', { key: KEY, context: { viewport: { width: 1180, height: 820 }, userAgent: IPAD_UA, hasTouch: true } });

// ================================================================== linking
await mac.open();
await tap(mac.page, '[data-testid=btn-singleplayer]');
await tap(mac.page, '[data-testid=btn-dropbox]');
await mac.page.waitForSelector('[data-testid=cloud-screen]');
check('Dropbox Sync is reached from the world list', true);
check('without an app key it asks for one', await mac.page.locator('[data-testid=dropbox-app-key]').count() === 1);
await mac.page.fill('[data-testid=dropbox-app-key]', KEY);
await tap(mac.page, '[data-testid=btn-save-app-key]');
await mac.page.waitForSelector('[data-testid=btn-link-dropbox]');
check('...and then offers Link to Dropbox', true);
await tap(mac.page, '[data-testid=btn-link-dropbox]');
await mac.page.waitForURL(/code=|localhost/, { timeout: 30000 });
await mac.waitFor(() => mac.ev(() => !!window.__bf?.ui.get().cloud.linked), 60000);
const macLinked = await mac.cloud();
const log1 = (await ctl('/__ctl/state')).log;
const tokenReq = log1.find((l) => l.path === '/oauth2/token');
check('linking by redirect: Dropbox sends the browser back and Blockfell is linked', macLinked.linked && /Test Player/.test(macLinked.account), macLinked);
check('...using PKCE (a code verifier, no client secret) and asking for a refresh token', !!tokenReq && tokenReq.form.grant_type === 'authorization_code' && tokenReq.form.code_verifier?.length >= 43 && !tokenReq.form.client_secret && tokenReq.form.client_id === KEY, tokenReq?.form);
check('...and the code is cleared from the address bar', !/code=/.test(mac.page.url()), mac.page.url());
const stored = await mac.ev(() => JSON.parse(localStorage.getItem('blockfell.dropbox.v1') ?? 'null'));
check('...the refresh token is kept in this browser (not the access token)', !!stored?.refreshToken && !JSON.stringify(stored).includes('"sl.'), Object.keys(stored ?? {}));

// iPad: the code flow (Dropbox shows a code to paste)
await ipad.open();
await tap(ipad.page, '[data-testid=btn-singleplayer]');
await tap(ipad.page, '[data-testid=btn-dropbox]');
await ipad.page.waitForSelector('[data-testid=btn-link-code]');
const popP = ipad.ctx.waitForEvent('page');
await tap(ipad.page, '[data-testid=btn-link-code]');
const pop = await popP;
await pop.waitForSelector('#auth-code');
const code = (await pop.textContent('#auth-code')).trim();
await pop.close();
await ipad.page.fill('[data-testid=dropbox-code]', code);
await tap(ipad.page, '[data-testid=btn-finish-code]');
await ipad.waitFor(() => ipad.ev(() => window.__bf.ui.get().cloud.linked), 20000);
await ipad.page.waitForSelector('[data-testid=cloud-account]');
check('linking with a code (for a Home Screen app): paste the code Dropbox shows', (await ipad.cloud()).linked, await ipad.cloud());
await tap(ipad.page, '[data-testid=btn-cloud-done]');

// ================================================================== a world made on the Mac goes to Dropbox
await mac.open();
const W = await mac.create('Shared World', 'sync-seed');
const mark = await mac.ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 3, z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
  bf.setBlock(x, y, z, 'bricks');
  g.inventory.slots[0] = { id: 'iron_pickaxe', count: 1 }; g.inventory.slots[1] = { id: 'torch', count: 23 }; g.inventory.changed();
  g.teleport(p.x + 1.5, p.y, p.z + 2.5);
  return { x, y, z, px: g.player.x, pz: g.player.z };
});
await mac.wait(500);
await mac.quit();
let f = await mockFile(W);
check('Save and Quit uploads the world to Dropbox > Apps > Blockfell > worlds', !!f && f.data.world.name === 'Shared World' && f.data.format === 'blockfell-world', f?.meta);
check('...the copy says which device saved it', f?.data.savedBy === 'Mac (Chrome)', f?.data.savedBy);
check('...with the player where they stood', !!f && Math.abs(f.data.world.player.x - mark.px) < 0.01 && Math.abs(f.data.world.player.z - mark.pz) < 0.01, f?.data.world.player);
await tap(mac.page, '[data-testid=btn-singleplayer]');
await mac.wait(800);
const st1 = await mac.state(W);
check('...and the world list shows it synced', st1?.rev === f?.meta.rev && !st1.dirty && /In Dropbox, synced/.test((await mac.cloud()).worlds[W]?.text ?? ''), { st1, ui: (await mac.cloud()).worlds[W] });
await mac.page.screenshot({ path: `${SHOTS}/sync_mac_list.png` });

// ================================================================== the iPad gets it
await ipad.toWorlds();
let iw = await ipad.worlds();
check('the iPad\'s world list downloads it from Dropbox', iw.some((w) => w.id === W && w.name === 'Shared World'), iw);
check('...keeping when it was last played (not the download time)', iw.find((w) => w.id === W)?.lastPlayed === f?.data.world.lastPlayed);
await ipad.page.screenshot({ path: `${SHOTS}/sync_ipad_list.png` });
await ipad.play(W);
const onIpad = await ipad.ev((m) => {
  const bf = window.__bf, g = bf.game;
  return { block: bf.getBlock(m.x, m.y, m.z), x: g.player.x, z: g.player.z, inv: g.inventory.slots.slice(0, 2).map((s) => s && `${s.id}x${s.count}`) };
}, mark);
check('...and it opens there exactly as left on the Mac (block, position, inventory)', onIpad.block === 'bricks' && Math.abs(onIpad.x - mark.px) < 0.01 && Math.abs(onIpad.z - mark.pz) < 0.01 && onIpad.inv[0] === 'iron_pickaxe x1'.replace(' ', '') && onIpad.inv[1] === 'torchx23', onIpad);
// play on the iPad: break the gold, place diamond, move, Save and Quit
const mark2 = await ipad.ev((m) => {
  const bf = window.__bf, g = bf.game;
  bf.setBlock(m.x, m.y, m.z, 'air'); bf.setBlock(m.x, m.y, m.z + 2, 'glass');
  g.teleport(g.player.x - 4.25, g.player.y, g.player.z + 1.0);
  return { px: g.player.x, pz: g.player.z };
}, mark);
await ipad.wait(400);
await mac.open();   // the Mac is sitting on its title screen (it synced on start, before the iPad's play)
await mac.clearToasts();
await ipad.quit();
f = await mockFile(W);
check('the iPad\'s play goes back to Dropbox on Save and Quit', f?.data.savedBy === 'iPad (Safari)' && Math.abs(f.data.world.player.x - mark2.px) < 0.01, { by: f?.data.savedBy, p: f?.data.world.player });

// ================================================================== back on the Mac: Continue brings the iPad's play
const cont = await mac.page.locator('[data-testid=btn-continue]').count();
await tap(mac.page, '[data-testid=btn-continue]');
await mac.waitFor(async () => (await mac.screen()) === 'game', 90000);
await mac.ev(() => window.__bf.allowUnlocked(true));
await mac.wait(1200);
const onMac = await mac.ev((m) => { const bf = window.__bf, g = bf.game; return { gold: bf.getBlock(m.x, m.y, m.z), diamond: bf.getBlock(m.x, m.y, m.z + 2), x: g.player.x, z: g.player.z }; }, mark);
check('Continue on the Mac first fetches the iPad\'s newer copy from Dropbox', cont === 1 && onMac.gold === 'air' && onMac.diamond === 'glass' && Math.abs(onMac.x - mark2.px) < 0.01, onMac);
check('...and says so', (await mac.toasts()).some((t) => /Updated from Dropbox/.test(t)), await mac.toasts());

// ================================================================== uploads while playing
await ctl('/__ctl/clear-log');
await mac.ev(() => window.__bf.game.save());
await mac.waitFor(async () => !(await mac.state(W))?.dirty, 15000);
const up1 = (await ctl('/__ctl/state')).log.filter((l) => l.path === '/2/files/upload').length;
check('the first autosave in a session uploads straight away', up1 === 1 && !(await mac.state(W)).dirty, { up1, st: await mac.state(W) });
await mac.ev(() => window.__bf.game.save());
await mac.wait(1500);
const up2 = (await ctl('/__ctl/state')).log.filter((l) => l.path === '/2/files/upload').length;
check('...later autosaves within 2 minutes wait (the world is marked to upload)', up2 === 1 && (await mac.state(W)).dirty, { up2 });
await mac.ev(() => window.__bf.game.save({ urgent: true }));
await mac.waitFor(async () => !(await mac.state(W))?.dirty, 15000);
const upLog = (await ctl('/__ctl/state')).log.filter((l) => l.path === '/2/files/upload');
check('...leaving the app (page hidden) uploads at once', upLog.length === 2, upLog.length);
const arg = JSON.parse(upLog[1].arg);
check('...each upload names the rev it replaces, so another device\'s save is never overwritten', arg.mode?.['.tag'] === 'update' && typeof arg.mode.update === 'string' && arg.autorename === false, arg);
// the visibilitychange path itself
await ctl('/__ctl/clear-log');
await mac.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await mac.waitFor(async () => (await ctl('/__ctl/state')).log.some((l) => l.path === '/2/files/upload'), 15000);
await mac.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
check('...(switching away from the tab saves and uploads)', (await ctl('/__ctl/state')).log.some((l) => l.path === '/2/files/upload'));
await mac.quit();

// ================================================================== played on both at once: a conflict
await ipad.open();
await ipad.toWorlds();
await ipad.play(W);
await mac.open();
await mac.play(W);
await ipad.ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 7, g.player.y, g.player.z); });
await ipad.ev(() => window.__bf.game.save({ urgent: true }));
await ipad.waitFor(async () => !(await ipad.state(W))?.dirty, 15000);
await mac.ev(() => { const bf = window.__bf, g = bf.game; bf.setBlock(Math.floor(g.player.x) + 2, Math.floor(g.player.y), Math.floor(g.player.z) - 2, 'bricks'); });
await mac.ev(() => window.__bf.game.save({ urgent: true }));
await mac.waitFor(async () => !!(await mac.state(W))?.conflictRev, 15000);
check('saving on the Mac after the iPad saved the same world is refused (rev changed): no overwrite', !!(await mac.state(W)).conflictRev && (await mockFile(W)).data.savedBy === 'iPad (Safari)', await mac.state(W));
check('...the Mac player is told once, and their play is kept on the Mac', (await mac.chat()).filter((c) => /also saved on another device/.test(c)).length === 1, await mac.chat());
await mac.quit();
check('...Save and Quit says it wasn\'t sent', (await mac.toasts()).some((t) => /Not sent to Dropbox/.test(t)), await mac.toasts());
await ipad.quit();
await tap(mac.page, '[data-testid=btn-singleplayer]');
await mac.wait(600);
check('...the world list flags it: changed on two devices', /two devices/.test((await mac.cloud()).worlds[W]?.text ?? ''), (await mac.cloud()).worlds[W]);
const out = await mac.play(W);
await mac.page.waitForSelector('[data-testid=conflict-remote]');
await mac.wait(400);
const remoteLine = await mac.page.textContent('[data-testid=conflict-remote]');
const localLine = await mac.page.textContent('[data-testid=conflict-local]');
check('...opening it asks which copy to keep, showing both', out === 'worlds' && /from iPad \(Safari\)/.test(remoteLine) && /On this Mac/.test(localLine), { remoteLine, localLine });
await mac.page.screenshot({ path: `${SHOTS}/sync_conflict.png` });
await tap(mac.page, '[data-testid=btn-keep-both]');
await mac.waitFor(async () => !(await mac.ev(() => window.__bf.ui.get().syncPrompt)), 20000);
await mac.wait(800);
let mw = await mac.worlds();
const copy = mw.find((w) => w.name === 'Shared World (Mac copy)');
const files = await mockFiles();
check('Keep Both: the Mac\'s copy becomes a new world, and both are in Dropbox', !!copy && files.some((x) => x.name === `${copy.id}.blockfell`) && files.some((x) => x.name === `${W}.blockfell`), { mw, files: files.map((x) => x.name) });
const keptIpad = await mockFile(W);
const copyFile = copy && await mockFile(copy.id);
check('...the original is now the iPad\'s copy, the new one the Mac\'s', keptIpad.data.savedBy === 'iPad (Safari)' && copyFile?.data.savedBy === 'Mac (Chrome)' && !(await mac.state(W)).conflictRev && !(await mac.state(W)).dirty, { a: keptIpad.data.savedBy, b: copyFile?.data.savedBy });

// "Keep This Copy" and "Use Dropbox Copy"
const dbg = [];
async function makeConflict() {
  // the Mac plays with no connection...
  await mac.page.route(`${mock.url}/**`, (r) => r.abort());
  await mac.open();
  await mac.play(W);
  await mac.ev(() => { const g = window.__bf.game; g.teleport(g.player.x - 3, g.player.y, g.player.z); });
  await mac.quit();
  await mac.page.unroute(`${mock.url}/**`);
  // ...and meanwhile the iPad plays it too
  await ipad.open(); await ipad.toWorlds(); await ipad.play(W);
  await ipad.ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 1, g.player.y, g.player.z); });
  const before = (await mockFile(W)).meta.rev;
  await ipad.quit();
  dbg.push({ ipadState: await ipad.state(W), before, after: (await mockFile(W)).meta.rev });
  // the Mac back online
  await mac.open();
  await tap(mac.page, '[data-testid=btn-singleplayer]');
  await mac.ev(() => window.__bf.engine.cloud.syncAll());
  return mac.state(W);
}
let cs = await makeConflict();
check('a world played offline on the Mac while the iPad played it: a conflict at the next sync', !!cs?.conflictRev, { cs, dbg });
const macPos = await mac.ev(async (id) => (await window.__bf.engine.saves.getWorld(id)).player.x, W);
await mac.play(W);
await mac.page.waitForSelector('[data-testid=btn-keep-mine]');
await tap(mac.page, '[data-testid=btn-keep-mine]');
await mac.waitFor(async () => !(await mac.ev(() => window.__bf.ui.get().syncPrompt)), 20000);
f = await mockFile(W);
check('Keep This Copy sends the Mac\'s copy to Dropbox', f.data.savedBy === 'Mac (Chrome)' && Math.abs(f.data.world.player.x - macPos) < 0.01, { by: f.data.savedBy, x: f.data.world.player.x, macPos });
cs = await makeConflict();
const ipadCopy = await mockFile(W);
await mac.play(W);
await mac.page.waitForSelector('[data-testid=btn-use-dropbox]');
await tap(mac.page, '[data-testid=btn-use-dropbox]');
await mac.waitFor(async () => !(await mac.ev(() => window.__bf.ui.get().syncPrompt)), 20000);
const macNow = await mac.ev(async (id) => (await window.__bf.engine.saves.getWorld(id)).player.x, W);
check('Use Dropbox Copy replaces the Mac\'s copy with the iPad\'s', Math.abs(macNow - ipadCopy.data.world.player.x) < 0.01 && !(await mac.state(W)).dirty, { macNow, ipad: ipadCopy.data.world.player.x });

// ================================================================== offline
await mac.open();
await mac.page.route(`${mock.url}/**`, (r) => r.abort());
await mac.play(W);
check('opening a world with no connection plays this device\'s copy', (await mac.screen()) === 'game' && (await mac.toasts()).some((t) => /not reached/.test(t)), await mac.toasts());
await mac.ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 2, g.player.y, g.player.z); });
await mac.quit();
check('...Save and Quit keeps it here to upload later', (await mac.toasts()).some((t) => /Saved on this device/.test(t)) && (await mac.state(W)).dirty, await mac.toasts());
await tap(mac.page, '[data-testid=btn-singleplayer]');
await mac.wait(800);
const offUi = await mac.cloud();
check('...the world list says it is waiting, and Dropbox is offline', offUi.offline && /Waiting to upload/.test(offUi.worlds[W]?.text ?? '') && /offline/.test(await mac.page.textContent('[data-testid=cloud-summary]')), offUi.worlds[W]);
await mac.page.unroute(`${mock.url}/**`);
await mac.ev(() => window.dispatchEvent(new Event('online')));
await mac.waitFor(async () => !(await mac.state(W))?.dirty, 20000);
check('...and back online it uploads by itself', !(await mac.state(W)).dirty && !(await mac.cloud()).offline, await mac.state(W));

// ================================================================== tokens
await ctl('/__ctl/clear-log');
await ctl('/__ctl/expire-access');
await mac.ev(() => window.__bf.engine.cloud.syncAll());
const tl = (await ctl('/__ctl/state')).log;
check('an expired access token is refreshed with the refresh token, without bothering the player', tl.some((l) => l.path === '/oauth2/token' && l.form.grant_type === 'refresh_token' && l.form.client_id === KEY) && (await mac.cloud()).linked && !(await mac.cloud()).message, tl.map((l) => l.path));
await ctl('/__ctl/set', { rateLimitNext: 1 });
await mac.ev(() => window.__bf.engine.cloud.syncAll());
check('a "too many requests" answer is waited out and retried', !(await mac.cloud()).message && !(await mac.cloud()).offline, await mac.cloud());
await ctl('/__ctl/revoke', { refresh: (await mac.ev(() => JSON.parse(localStorage.getItem('blockfell.dropbox.v1')))).refreshToken });   // the Mac's link only
await mac.ev(() => { window.__bf.engine.cloud.dbx.access = null; });
await mac.ev(() => window.__bf.engine.cloud.syncAll());
const rl = await mac.cloud();
check('if the link is revoked (in Dropbox\'s settings), Blockfell asks to link again', rl.relink && !rl.linked && /expired/.test(await mac.page.textContent('[data-testid=cloud-summary]')), rl);
await tap(mac.page, '[data-testid=btn-dropbox]');
await mac.page.waitForSelector('[data-testid=cloud-relink]');
await tap(mac.page, '[data-testid=btn-link-dropbox]');
await mac.waitFor(() => mac.ev(() => !!window.__bf?.ui.get().cloud.linked), 60000);
check('...linking again (same Dropbox) carries on where it was', (await mac.cloud()).linked && (await mac.state(W))?.rev, await mac.state(W));

// ================================================================== delete here only / everywhere
await ipad.open();
await ipad.toWorlds();
iw = await ipad.worlds();
const copyId = copy?.id;
check('the iPad gets the Mac copy world too', iw.some((w) => w.id === copyId), iw);
await ipad.page.locator('[data-testid=world-entry]', { hasText: 'Shared World (Mac copy)' }).click();
await tap(ipad.page, '[data-testid=btn-delete-world]');
await ipad.page.waitForSelector('[data-testid=btn-delete-everywhere]');
await ipad.page.screenshot({ path: `${SHOTS}/sync_delete.png` });
await tap(ipad.page, '[data-testid=btn-confirm-delete]');
await ipad.wait(800);
await ipad.ev(() => window.__bf.engine.cloud.syncAll());
iw = await ipad.worlds();
check('Delete Here Only removes it from the iPad, and it is not downloaded again', !iw.some((w) => w.id === copyId) && (await mockFiles()).some((x) => x.name === `${copyId}.blockfell`), iw);
await tap(ipad.page, '[data-testid=btn-dropbox]');
await ipad.page.waitForSelector('[data-testid=cloud-remote-only]');
check('...the Dropbox Sync screen lists it as in Dropbox, not on this device', /Shared World \(Mac copy\)/.test(await ipad.page.textContent('[data-testid=cloud-remote-only]')));
await tap(ipad.page, '[data-testid=btn-download-world]');
await ipad.waitFor(async () => (await ipad.worlds()).some((w) => w.id === copyId), 15000);
check('...and Download brings it back', (await ipad.worlds()).some((w) => w.id === copyId));
await tap(ipad.page, '[data-testid=btn-cloud-done]');
await mac.open();
await mac.toWorlds();
await mac.page.locator('[data-testid=world-entry]', { hasText: 'Shared World (Mac copy)' }).click();
await tap(mac.page, '[data-testid=btn-delete-world]');
await mac.page.waitForSelector('[data-testid=btn-delete-everywhere]');
await tap(mac.page, '[data-testid=btn-delete-everywhere]');
await mac.wait(800);
check('Delete Everywhere removes it from Dropbox too', !(await mockFiles()).some((x) => x.name === `${copyId}.blockfell`) && !(await mac.worlds()).some((w) => w.id === copyId));
await ipad.toWorlds();
check('...another device keeps its copy, marked as only on that device', (await ipad.worlds()).some((w) => w.id === copyId) && /Only here/.test((await ipad.cloud()).worlds[copyId]?.text ?? ''), (await ipad.cloud()).worlds[copyId]);

// ================================================================== a newer version's world
const base = await mockFile(W);
const newer = { ...base.data, gameVersion: '9.9.0', world: { ...base.data.world, id: 'wnewer1', name: 'From The Future', version: '9.9.0' } };
await ctl('/__ctl/put-file', { path: '/worlds/wnewer1.blockfell', base64: zlib.gzipSync(JSON.stringify(newer)).toString('base64') });
await ipad.toWorlds();
check('a world saved by a newer Blockfell is not loaded here', !(await ipad.worlds()).some((w) => w.id === 'wnewer1'));
await tap(ipad.page, '[data-testid=btn-dropbox]');
await ipad.page.waitForSelector('[data-testid=cloud-remote-only]');
check('...the Dropbox Sync screen says it needs that version', /From The Future.*needs Blockfell 9\.9\.0/.test(await ipad.page.textContent('[data-testid=cloud-remote-only]')));
await tap(ipad.page, '[data-testid=btn-cloud-done]');
// a world this device has, updated elsewhere by a newer version
const upd = { ...base.data, gameVersion: '9.9.0' };
await ctl('/__ctl/put-file', { path: `/worlds/${W}.blockfell`, base64: zlib.gzipSync(JSON.stringify(upd)).toString('base64') });
await ipad.toWorlds();
check('...an older device\'s copy of a world played in a newer version is flagged: restart to update', /needs Blockfell 9\.9\.0/.test((await ipad.cloud()).worlds[W]?.text ?? ''), (await ipad.cloud()).worlds[W]);
const np = await ipad.play(W);
const npOk = await ipad.page.waitForSelector('[data-testid=btn-update-blockfell]', { timeout: 15000 }).then(() => true, () => false);
await ipad.page.screenshot({ path: `${SHOTS}/sync_newer.png` });
check('...and opening it asks to update Blockfell first', npOk, { np, prompt: await ipad.ev(() => window.__bf.ui.get().syncPrompt), st: await ipad.state(W), screen: await ipad.screen() });
if ((await ipad.screen()) === 'game') await ipad.quit();
await tap(ipad.page, '[data-testid=btn-sync-cancel]').catch(() => undefined);
await ctl('/__ctl/put-file', { path: `/worlds/${W}.blockfell`, base64: zlib.gzipSync(JSON.stringify(base.data)).toString('base64') });
await ctl('/__ctl/delete-file', { path: '/worlds/wnewer1.blockfell' });

// ================================================================== a browser that can't read Dropbox's result header
await ctl('/__ctl/set', { exposeResult: false });
await mac.open();
await mac.play(W);
const hx = await mac.ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 5, g.player.y, g.player.z); return g.player.x; });
await mac.quit();
const fx = await mockFile(W);
await ipad.toWorlds();
const sx = await ipad.state(W);
const ix = await ipad.ev(async (id) => (await window.__bf.engine.saves.getWorld(id)).player.x, W);
check('downloads work when the browser can\'t read Dropbox\'s result header (the rev is looked up instead)', sx?.rev === fx.meta.rev && !sx.newer && Math.abs(ix - hx) < 0.01, { sx, rev: fx.meta.rev, ix, hx });
await ctl('/__ctl/set', { exposeResult: true });

// ================================================================== listing pages, unlink
check('Dropbox folder listings are followed across pages (has_more)', (await ctl('/__ctl/state')).log.some((l) => l.path === '/2/files/list_folder/continue'));
await ctl('/__ctl/clear-log');
await mac.open();
await tap(mac.page, '[data-testid=btn-singleplayer]');
await tap(mac.page, '[data-testid=btn-dropbox]');
await mac.page.waitForSelector('[data-testid=btn-unlink-dropbox]');
await tap(mac.page, '[data-testid=btn-unlink-dropbox]');
await mac.page.waitForSelector('[data-testid=btn-link-dropbox]');
const ul = await ctl('/__ctl/state');
check('Unlink revokes the token in Dropbox and forgets it here; the worlds stay', ul.log.some((l) => l.path === '/2/auth/token/revoke') && !(await mac.ev(() => localStorage.getItem('blockfell.dropbox.v1'))) && (await mac.worlds()).some((w) => w.id === W));

// not available from a file
const single = '/home/claude/blockfell/dist-single/index.html';
if (fs.existsSync(single) && fs.readFileSync(single, 'utf8').includes('cloud-unavailable')) {
  const fp = await mac.ctx.newPage();
  await fp.goto('file://' + single);
  await fp.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await fp.click('[data-testid=btn-singleplayer]');
  await fp.click('[data-testid=btn-dropbox]');
  await fp.waitForSelector('[data-testid=cloud-unavailable]');
  check('opened from a file, Dropbox Sync explains it needs the web address', /web address/.test(await fp.textContent('[data-testid=cloud-unavailable]')));
  await fp.close();
}

check('no script errors', errors.length === 0, errors);
console.log('\n' + results.map((r) => `${r[0]}  ${r[1].padEnd(90)} ${r[0] === 'FAIL' ? r[2].slice(0, 300) : ''}`).join('\n'));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await b.close();
await mock.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
