// Screenshots and icons for the 2.7 guide pages: saddles, horses and the Lavastrider.
// node tests/guide_shots19.mjs  (dev server)  PARTS=icons,saddled,horse,strider
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots27';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'saddled,horse,strider').split(',');
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
  const ids = ['saddle', 'ember_lure', 'spawn_horse', 'spawn_lavastrider', 'spawn_pig', 'leather', 'iron_ingot', 'ember', 'string', 'stick'];
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
await settle();
await quiet();
await clean();
/** A flat grass pad (r each way) with air above, in the middle of the land near the start. */
const pad = (r = 12) => ev((r) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'grass'); bf.setBlock(x + dx, y - 2, z + dz, 'dirt'); for (let dy = 0; dy <= 9; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  return { x, y, z };
}, r);
const put = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const P = await pad(14);
await settle();
const put2 = put;

const kit = (slots) => ev((slots) => {
  const g = window.__bf.game;
  g.player.gameMode = 'survival';
  for (let i = 0; i < 9; i++) g.inventory.slots[i] = null;
  slots.forEach((s, i) => { g.inventory.slots[i] = s; });
  g.inventory.selected = 0; g.inventory.changed();
}, slots);
const clearMobs = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });


if (PARTS.includes('saddled')) {
  await clearMobs();
  await kit([{ id: 'saddle', count: 1 }, { id: 'ember_lure', count: 1 }]);
  await still('pig', P.x - 1.2, P.y, P.z - 3.4, 0.5, 'm.saddled = true;');
  await still('horse', P.x + 1.8, P.y, P.z - 3.8, -0.5, 'm.saddled = true; m.setCoat(1);');
  await view([P.x + 0.5, P.y + 1.0, P.z + 1.6], [P.x + 0.3, P.y + 0.8, P.z - 3.6], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('rd01_saddled', true);
}

if (PARTS.includes('horse')) {
  await clearMobs();
  await kit([]);
  const id = await ev(([x, y, z]) => { const g = window.__bf.game, m = g.entities.spawnMob('horse', x, y, z, g); m.saddled = true; m.persistent = true; m.setCoat(3); return m.id; }, [P.x + 0.5, P.y, P.z - 1.0]);
  await view([P.x + 0.5, P.y + 0.1, P.z + 1.6], [P.x + 0.5, P.y + 1.0, P.z - 6.0], false);
  await ev((id) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); g.mount(m); }, id);
  await ev(() => { const g = window.__bf.game; g.player.yaw = 0.35; g.player.pitch = 0.08; });
  await ev(() => { window.__bf.game.autopilot = { forward: 0 }; });
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 11; i++) g.tick(); });
  await wait(300);
  await shot('rd02_horse', true);
  await ev(() => { window.__bf.game.autopilot = null; window.__bf.game.dismount(); });
}

if (PARTS.includes('strider')) {
  await clearMobs();
  await kit([{ id: 'ember_lure', count: 1 }]);
  await ev(([x, y, z]) => { for (let dx = -8; dx <= 8; dx++) for (let dz = -12; dz <= -4; dz++) { window.__bf.setBlock(x + dx, y - 1, z + dz, 'lava'); window.__bf.setBlock(x + dx, y - 2, z + dz, 'stone'); } }, [P.x, P.y, P.z]);
  await settle();
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 12600; });
  const top = P.y - 1 + 0.875;
  const id = await ev(([x, y, z]) => { const g = window.__bf.game, m = g.entities.spawnMob('lavastrider', x, y, z, g); m.saddled = true; m.persistent = true; m.yaw = m.prevYaw = 0.6; m.tick = function () { this.beginTick(); this.prevLimbAmount = this.limbAmount = 0; }; return m.id; }, [P.x + 0.5, top, P.z - 6.5]);
  await view([P.x + 3.0, P.y + 0.9, P.z - 1.2], [P.x + 0.5, top + 0.9, P.z - 6.5], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('rd03_strider', true);
}
await b.close();
