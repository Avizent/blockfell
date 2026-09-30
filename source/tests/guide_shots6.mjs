// Screenshots for the touch-controls page of the How-to-Play guide (emulated iPhone and iPad).
// node tests/guide_shots6.mjs  (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots6';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function session(w, h, name, body) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  const ev = (fn, a) => page.evaluate(fn, a);
  const wait = (ms) => page.waitForTimeout(ms);
  const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) });
  await page.goto(URL);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.tap('[data-testid=btn-singleplayer]'); await wait(300);
  await page.tap('[data-testid=btn-create-new]'); await wait(300);
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', 'decor');
  await page.tap('[data-testid=btn-create-world]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => { const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); g.dayNight.time = 3500; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  await wait(2500);
  await body({ page, ev, wait, waitFor, touch });
  await ctx.close();
}
const settle = async (ev, wait, waitFor) => { await wait(1000); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; })); await wait(1000); };
const clean = (ev, wait) => ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })).then(() => wait(300));

// ---- iPhone in landscape: the controls in use (thumb on the joystick, a finger holding to mine)
await session(844, 390, 'Phone', async ({ page, ev, wait, waitFor, touch }) => {
  await ev(() => {
    const g = window.__bf.game, inv = g.inventory;
    const hot = ['stone_pickaxe', 'planks', 'oak_fence', 'torch', 'lantern', 'bread', 'glass_pane', 'flower_pot', 'sign'];
    hot.forEach((id, i) => { inv.slots[i] = { id, count: id.endsWith('pickaxe') ? 1 : 12 + i }; });
    inv.selected = 1; inv.changed();
    const p = g.player; p.yaw = Math.PI * 0.3; p.pitch = -0.08;
  });
  await settle(ev, wait, waitFor);
  await clean(ev, wait);
  await touch('touchStart', [[118, 292, 1]]);
  await touch('touchMove', [[134, 262, 1]]);
  await touch('touchStart', [[134, 262, 1], [560, 170, 2]]);
  await wait(450);
  await page.screenshot({ path: `${OUT}/t01_touch.png` }); console.log('shot t01_touch');
  await touch('touchEnd', []);
  await wait(300);
  // the inventory with its close button
  await page.tap('[data-testid=touch-inventory]'); await wait(600);
  await clean(ev, wait);
  await page.screenshot({ path: `${OUT}/t02_inventory.png` }); console.log('shot t02_inventory');
});

// ---- iPad in landscape
await session(1024, 768, 'Tablet', async ({ page, ev, wait, waitFor }) => {
  await ev(() => {
    const g = window.__bf.game, inv = g.inventory;
    ['iron_pickaxe', 'cobblestone', 'oak_fence', 'torch', 'lantern', 'bread', 'glass_pane', 'flower_pot', 'painting'].forEach((id, i) => { inv.slots[i] = { id, count: i === 0 ? 1 : 20 }; });
    inv.selected = 0; inv.changed();
    const p = g.player; p.yaw = Math.PI * 0.3; p.pitch = -0.1;
  });
  await settle(ev, wait, waitFor);
  await clean(ev, wait);
  await page.screenshot({ path: `${OUT}/t03_ipad.png` }); console.log('shot t03_ipad');
});

await b.close();
