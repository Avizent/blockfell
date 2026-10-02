// Screenshots for the 1.9 guide pages: Dropbox sync (against the Dropbox stand-in).
// node tests/guide_shots10.mjs   (dev server on :5173)  -> /tmp/guide_shots10/sy01_screen.png ...
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { startMockDropbox } from './mock-dropbox.mjs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots10';
const KEY = 'testappkey123';
fs.mkdirSync(OUT, { recursive: true });
const mock = await startMockDropbox({ port: 8792, appKey: KEY, redirects: [new globalThis.URL(URL).origin + '/'] });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const HOSTS = JSON.stringify({ api: mock.url, content: mock.url, www: mock.url });
async function device(ua) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, userAgent: ua });
  await ctx.addInitScript(([h, k]) => { localStorage.setItem('blockfell.dropbox.hosts', h); localStorage.setItem('blockfell.dropbox.appKey', JSON.stringify(k)); }, [HOSTS, KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  const d = { ctx, page };
  d.ev = (fn, a) => page.evaluate(fn, a);
  d.wait = (ms) => page.waitForTimeout(ms);
  d.waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await d.wait(250); } return false; };
  d.screen = () => d.ev(() => window.__bf?.state().screen);
  d.open = async () => { await page.goto(URL); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await d.wait(800); };
  d.create = async (name, seed) => {
    await page.click('[data-testid=btn-singleplayer]');
    await page.click('[data-testid=btn-create-new]');
    await page.fill('[data-testid=world-name]', name);
    await page.fill('[data-testid=world-seed]', seed);
    await page.click('[data-testid=btn-create-world]');
    await d.waitFor(async () => (await d.screen()) === 'game', 90000);
    await d.wait(2500);
    const id = await d.ev(() => window.__bf.game.record.id);
    await d.ev(() => window.__bf.engine.saveAndQuit());
    await d.waitFor(async () => (await d.screen()) === 'title', 40000);
    return id;
  };
  d.play = async (id) => { await d.ev((id) => void window.__bf.engine.playWorld(id), id); await d.waitFor(async () => (await d.screen()) === 'game', 90000); await d.wait(1500); };
  d.quit = async () => { await d.ev(() => window.__bf.engine.saveAndQuit()); await d.waitFor(async () => (await d.screen()) === 'title', 40000); await d.wait(500); };
  d.shot = async (n) => { await d.ev(() => window.__bf.ui.set({ toasts: [] })); await d.wait(400); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
  return d;
}
const mac = await device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
const ipad = await device('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');

// the Dropbox Sync screen before linking
await mac.open();
await mac.page.click('[data-testid=btn-singleplayer]');
await mac.page.click('[data-testid=btn-dropbox]');
await mac.page.waitForSelector('[data-testid=btn-link-dropbox]');
// (as it looks with the app key built in: no key line)
await mac.ev(() => document.querySelector('[data-testid=btn-change-key]')?.parentElement?.remove());
await mac.shot('sy01_link');
await mac.page.click('[data-testid=btn-link-dropbox]');
await mac.waitFor(() => mac.ev(() => !!window.__bf?.ui.get().cloud.linked), 60000);
await mac.page.waitForSelector('[data-testid=btn-singleplayer]');

// three worlds on the Mac
const castle = await mac.create('Castle Build', 'castle');
const island = await mac.create('Island Survival', 'island');
await mac.create('Village Trading', 'villages');

// the iPad links and plays the island
await ipad.open();
await ipad.ev(async () => { const c = window.__bf.engine.cloud; const url = await c.dbx.beginCodeLink(); window.__codeUrl = url; });
const url = await ipad.ev(() => window.__codeUrl);
const code = /<code id="auth-code">([^<]+)</.exec(await (await fetch(url)).text())[1];
await ipad.ev(async (c) => { const cl = window.__bf.engine.cloud; await cl.dbx.finishCodeLink(c); await cl.onLinked(); await cl.syncAll(); }, code);
await ipad.play(island);
await ipad.ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 6, g.player.y, g.player.z); });
await ipad.quit();

// the Mac plays it offline too, then comes back online: changed on two devices
await mac.page.route(`${mock.url}/**`, (r) => r.abort());
await mac.open();
await mac.play(island);
await mac.ev(() => { const g = window.__bf.game; g.teleport(g.player.x - 4, g.player.y, g.player.z); });
await mac.quit();
await mac.ev(() => window.__bf.engine.cloud.syncAll());
await mac.page.unroute(`${mock.url}/**`);
// and the castle is waiting to upload (played offline as well)
await mac.page.route(`${mock.url}/**`, (r) => r.abort());
await mac.play(castle);
await mac.quit();
await mac.page.unroute(`${mock.url}/**`);
await mac.page.click('[data-testid=btn-singleplayer]');
await mac.wait(400);
await mac.ev(() => window.__bf.engine.cloud.syncAll());
await mac.wait(600);
// show the castle as waiting (as it would be offline) for the picture: mark it dirty again
await mac.ev((id) => window.__bf.engine.cloud.markDirty(id), castle);
await mac.wait(500);
await mac.page.locator('[data-testid=world-entry]', { hasText: 'Island Survival' }).click();
await mac.shot('sy02_list');
await mac.page.click('[data-testid=btn-dropbox]');
await mac.page.waitForSelector('[data-testid=cloud-account]');
await mac.shot('sy03_linked');
await mac.page.click('[data-testid=btn-cloud-done]');
await mac.ev((id) => void window.__bf.engine.playWorld(id), island);
await mac.page.waitForSelector('[data-testid=btn-keep-mine]');
await mac.wait(600);
await mac.shot('sy04_conflict');
await b.close();
await mock.close();
