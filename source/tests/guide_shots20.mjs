// Screenshots and icons for the 2.8 guide pages: Spore Isle, the Sporecap and the Trident.
// node tests/guide_shots20.mjs  (dev server)  PARTS=icons,isle,mushroom,sporecap,trident
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots28';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'isle,mushroom,sporecap,trident').split(',');
const SEED = process.env.SEED || 'ridepics27';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(250); } return false; };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 120000); await wait(800); };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const shot = async (name, hud = false) => { await ev((hud) => window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: !hud }), hud); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.mobType || e.type === 'item') e.removed = true;
});
/** No block outline and an empty hand in the pictures. */
const clean = () => ev(() => { const g = window.__bf.game; g.reach = () => 0.0001; g.inventory.slots[8] = null; g.inventory.selected = 8; g.inventory.changed(); });
/** Stand (flying) at a spot and look at a point. */
const view = async (from, at, fly = true) => {
  await ev(([f, a, fly]) => { const g = window.__bf.game, p = g.player; p.flying = fly; g.teleport(f[0], f[1], f[2]); p.vx = p.vy = p.vz = 0; window.__bf.aimAt(a[0], a[1], a[2]); }, [from, at, fly]);
  await settle(); await ticks(4);
};
/** Spawns a creature that holds still (and, by default, faces `yaw`). */
const still = (t, x, y, z, yaw, setup = '') => ev(([t, x, y, z, yaw, setup]) => {
  const g = window.__bf.game, m = g.entities.spawnMob(t, x, y, z, g);
  m.yaw = m.prevYaw = yaw;
  // eslint-disable-next-line no-new-func
  if (setup) new Function('m', 'g', setup)(m, g);
  m.tick = function () { this.beginTick(); this.prevLimbAmount = this.limbAmount = 0; };
  return m.id;
}, [t, x, y, z, yaw, setup]);
const ground = (x, z) => ev(([x, z]) => window.__bf.game.world.highestSolid(Math.floor(x), Math.floor(z)) + 1, [x, z]);

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['sporecap', 'spore_stew', 'trident', 'spore_lamp', 'sporeloam', 'spore_stem', 'cap_violet', 'cap_crimson', 'cap_gills', 'spore_tuft', 'spawn_sporecap', 'carrot', 'glass', 'iron_ingot', 'stick', 'shears'];
  const out = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const res = {};
    for (const id of ids) {
      const st = ic.style(id);
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      res[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return res;
  }, ids);
  for (const [id, url] of Object.entries(out)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(out).length);
}


// a creative world
await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Riding Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
const ISLE = { x: -565, z: 211 };
await ev(([x, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, 90, z - 60); }, [ISLE.x, ISLE.z]);
await settle();
await quiet();
await clean();
const put = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const kit = (slots) => ev((slots) => {
  const g = window.__bf.game;
  g.player.gameMode = 'survival';
  for (let i = 0; i < 9; i++) g.inventory.slots[i] = null;
  slots.forEach((s, i) => { g.inventory.slots[i] = s; });
  g.inventory.selected = 0; g.inventory.changed();
}, slots);
const clearMobs = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });



const kit2 = kit;
if (PARTS.includes('isle')) {
  await view([ISLE.x + 4, 96, ISLE.z - 78], [ISLE.x, 66, ISLE.z], true);
  await shot('sp01_isle');
}
// find a giant mushroom: a spore_stem column with a doorway (air at the south side) 
const giant = await ev(([x, z]) => {
  const bf = window.__bf;
  for (let dz = -34; dz <= 34; dz++) for (let dx = -34; dx <= 34; dx++) {
    const wx = x + dx, wz = z + dz;
    for (let y = 60; y < 80; y++) {
      if (bf.getBlock(wx, y, wz) === 'air' && bf.getBlock(wx + 1, y, wz) === 'spore_stem' && bf.getBlock(wx - 1, y, wz) === 'spore_stem' && bf.getBlock(wx, y, wz - 1) === 'spore_stem' && bf.getBlock(wx, y + 1, wz) === 'air' && bf.getBlock(wx, y, wz + 1) === 'air') return { wx, y, wz };
    }
  }
  return null;
}, [ISLE.x, ISLE.z]);
console.log('giant', JSON.stringify(giant));
if (PARTS.includes('mushroom') && giant) {
  await view([giant.wx + 0.5, giant.y + 16, giant.wz + 22.5], [giant.wx + 0.5, giant.y + 6, giant.wz + 0.5], true);
  await shot('sp02_giant');
  await view([giant.wx + 0.5, giant.y + 1.4, giant.wz + 1.4], [giant.wx + 0.5, giant.y + 6, giant.wz + 0.5], true);
  await shot('sp03_inside');
}
if (PARTS.includes('sporecap')) {
  await clearMobs();
  const gx = ISLE.x - 8, gz = ISLE.z - 14;
  const gy = await ground(gx, gz);
  await kit([null]); await still('sporecap', gx - 0.9, gy, gz - 1.6, 0.4);
  await still('sporecap', gx + 0.9, gy, gz - 1.8, -0.5, 'm.sheared = true;');
  await view([gx + 0.1, gy + 1.0, gz + 1.4], [gx, gy + 0.6, gz - 1.7], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('sp04_sporecaps', true);
}
if (PARTS.includes('trident')) {
  await clearMobs();
  const gx = ISLE.x + 6, gz = ISLE.z - 16;
  const gy = await ground(gx, gz);
  await kit([{ id: 'trident', count: 1 }]);
  await view([gx + 0.5, gy + 1.0, gz + 3.5], [gx + 0.5, gy + 0.9, gz - 6], false);
  await ev(() => window.__bf.ui.set({ charge: 0.8 }));
  await shot('sp05_trident', true);
}
await b.close();
