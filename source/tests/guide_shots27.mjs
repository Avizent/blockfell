// Screenshots and icons for the 2.16 guide pages: textures stage 2, pit-heads, Carpets and Banners.
// node tests/guide_shots26.mjs  (dev server)  PARTS=icons,map,tune,music,storm,bow,trader
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots216';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,tex,pit,room').split(',');
const SEED = process.env.SEED || 'richpics216';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
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
  const ids = ['carpet_red', 'carpet_blue', 'carpet_yellow', 'banner_red', 'banner_blue', 'banner_green', 'banner_white', 'ladder'];
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




await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide Pictures 216');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();
await clean();
const put = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const pad = (at, r = 12) => ev(([at, r]) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = at ? at.x : Math.floor(p.x), z = at ? at.z : Math.floor(p.z), y = at ? at.y : Math.floor(p.y);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'grass'); bf.setBlock(x + dx, y - 2, z + dz, 'dirt'); for (let dy = 0; dy <= 12; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  return { x, y, z };
}, [at, r]);

if (PARTS.includes('tex')) {
  // a meadow: grass, flowers, tall grass, a stone-brick and plank cottage, sand, gravel, logs and leaves, snow
  await ev(() => { const g = window.__bf.game; g.player.flying = true; g.teleport(400.5, 90, 400.5); });
  await settle();
  const P = await pad(null, 12);
  await settle();
  const { x, y, z } = P;
  const at = (dx, dy, dz, k) => put(x + dx, y + dy, z + dz, k);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
    await at(dx, -1, dz - 4, dz % 2 ? 'cobblestone' : 'stone_bricks');
    for (let dy = 0; dy <= 2; dy++) if (Math.abs(dx) === 3 || Math.abs(dz) === 2) await at(dx, dy, dz - 4, dy === 1 && dx === 0 && dz === 2 ? 'air' : (dy === 2 ? 'planks' : 'bricks'));
    await at(dx, 3, dz - 4, 'planks');
  }
  await at(0, 0, -2, 'air'); await at(0, 1, -2, 'air');
  for (let i = 0; i < 6; i++) { await at(-8 + i, 0, 0, i % 2 ? 'flower_red' : 'flower_yellow'); await at(-8 + i, 0, 1, 'tall_grass'); }
  for (let i = 0; i < 4; i++) { await at(5 + i, -1, 1, 'sand'); await at(5 + i, -1, 2, 'gravel'); await at(5 + i, -1, 3, 'sandstone_side'); await at(5 + i, -1, 4, 'snow'); }
  for (let i = 0; i < 4; i++) await at(-6, i, 3, 'log_side');
  for (let dx = -8; dx <= -4; dx++) for (let dz = 1; dz <= 5; dz++) for (let dy = 4; dy <= 5; dy++) await at(dx + 0, dy, dz + 1, 'leaves');
  for (let i = 0; i < 4; i++) { await at(2 + i, 0, 3, i % 2 ? 'wool_red' : 'wool'); await at(2 + i, 0, 4, 'wool_blue'); }
  await settle();
  await view([x + 0.5, y + 3.2, z + 9.5], [x + 0.5, y + 1.2, z - 3]);
  await shot('tx01_meadow');
  await view([x + 9, y + 2.4, z + 6.5], [x + 5, y + 0.2, z + 2.5]);
  await shot('tx02_ground');
}

if (PARTS.includes('pit')) {
  const info = await ev(async () => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const M = await import('/src/world/Mines.ts');
    const reg = await import('/src/world/BlockRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const seed = window.__bf.game.world.seed;
    const gen = new T.TerrainGenerator(seed, { structures: true, version: 11 });
    for (let rz = -6; rz < 6; rz++) for (let rx = -6; rx < 6; rx++) {
      const fy = M.mineFloor(seed, rx * 4, rz * 4);
      if (fy < 0) continue;
      const cx = rx * 4 + M.entranceChunkX(seed, rx * 4, rz * 4), cz = rz * 4 + 1;
      const c = gen.generateChunk(cx, cz);
      let top = -1; for (let y = 0; y < 128; y++) if (c.blocks[C.localIndex(12, y, 6)] === reg.LADDERS.s) top = y;
      if (top > 0 && top - fy < 40) return { cx, cz, fy, top };
    }
    return null;
  });
  console.log('pit', JSON.stringify(info));
  const X = info.cx * 16 + 12, Z = info.cz * 16 + 6;
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); }, [X + 0.5, info.top + 8, Z + 9.5]);
  await settle(); await settle();
  await view([X + 4.5, info.top - 0.2, Z + 6.5], [X + 0.5, info.top - 1.4, Z + 0.5]);
  await shot('pt01_pithead');
  await view([X + 0.5, info.fy + 1.6, Z + 3.0], [X + 0.5, info.fy + 6, Z - 0.2]);
  await shot('pt02_ladder');
}

if (PARTS.includes('room')) {
  await ev(() => { const g = window.__bf.game; g.player.flying = true; g.teleport(500.5, 90, 500.5); });
  await settle();
  const P = await pad(null, 10);
  await settle();
  const { x, y, z } = P;
  const at = (dx, dy, dz, k) => put(x + dx, y + dy, z + dz, k);
  // a hall: plank floor, stone-brick walls, carpet runner and rugs, banners along the walls
  for (let dx = -6; dx <= 6; dx++) for (let dz = -8; dz <= 2; dz++) {
    await at(dx, -1, dz, 'planks');
    for (let dy = 0; dy <= 3; dy++) if (Math.abs(dx) === 6 || dz === -8) await at(dx, dy, dz, 'stone_bricks');
  }
  const cols = ['red', 'yellow', 'blue', 'green', 'purple', 'orange'];
  for (let dz = -7; dz <= 2; dz++) { await at(-1, 0, dz, 'carpet_red'); await at(0, 0, dz, 'carpet_red'); await at(1, 0, dz, 'carpet_red'); await at(-2, 0, dz, 'carpet_yellow'); await at(2, 0, dz, 'carpet_yellow'); }
  for (let i = 0; i < 4; i++) { await at(-5, 0, -6 + i * 2, `banner_${cols[i % 6]}:ns`); await at(5, 0, -6 + i * 2, `banner_${cols[(i + 2) % 6]}:ns`); }
  await at(0, 0, -7, 'banner_blue:ew');
  for (const dz of [-6, -2]) { await at(-4, 3, dz, 'lantern_hanging'); await at(4, 3, dz, 'lantern_hanging'); }
  for (let dz = -7; dz <= 1; dz += 2) { await at(-3, 0, dz, 'carpet_blue'); await at(3, 0, dz, 'carpet_blue'); }
  await settle();
  await view([x + 0.5, y + 2.0, z + 1.6], [x + 0.5, y + 0.8, z - 8]);
  await shot('cb01_hall');
  await view([x - 3.2, y + 1.9, z + 1.2], [x + 4.5, y + 0.9, z - 5]);
  await shot('cb02_banners');
}
await b.close();
