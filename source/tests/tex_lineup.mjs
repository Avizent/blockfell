// Lines up creatures for a texture before/after picture.  node tests/tex_lineup.mjs  (dev server)  OUT=/tmp/tex/before
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/tex/shot';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await wait(250); } return false; };
await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1000);
await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Tex');
await page.fill('[data-testid=world-seed]', 'texlineup');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game');
await ev(() => window.__bf.allowUnlocked(true));
await wait(2500);
await ev(() => { const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); g.dayNight.time = 5000; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; g.reach = () => 0.0001; g.inventory.selected = 8; g.inventory.slots[8] = null; g.inventory.changed(); });
const sets = {
  a: ['villager', 'trader', 'cow', 'sheep', 'hound'],
  b: ['shambler', 'skeleton', 'goat', 'horse', 'fox'],
};
for (const [name, row] of Object.entries(sets)) {
  await ev(async (row) => {
    const bf = window.__bf, g = bf.game, p = g.player;
    for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
    p.flying = true;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y0 = Math.floor(p.y) + 6;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -4; dz <= 9; dz++) { bf.setBlock(x0 + dx, y0 - 1, z0 + dz, 'grass'); for (let dy = 0; dy < 5; dy++) bf.setBlock(x0 + dx, y0 + dy, z0 + dz, 'air'); }
    row.forEach((t, i) => {
      const m = g.entities.spawnMob(t, x0 - 3.6 + i * 1.8 + 0.5, y0, z0 + 0.5, g);
      m.yaw = m.prevYaw = Math.PI - 0.25; m.tick = function () { this.beginTick(); this.prevLimbAmount = this.limbAmount = 0; };
    });
    g.teleport(x0 + 0.5, y0 + 1.5, z0 + 5.0);
    p.vx = p.vy = p.vz = 0; bf.aimAt(x0 + 0.5, y0 + 0.9, z0 + 0.5);
  }, row);
  await wait(2200);
  await ev(() => window.__bf.ui.set({ toasts: [], chat: [], hideHud: true }));
  await wait(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
await b.close();
