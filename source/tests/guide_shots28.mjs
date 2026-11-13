// Screenshots and icons for the 2.17 guide pages: Wildlings, Capture Orbs and the Creature Ledger.
// node tests/guide_shots26.mjs  (dev server)  PARTS=icons,map,tune,music,storm,bow,trader
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots217';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,wild,ledger').split(',');
const SEED = process.env.SEED || 'wildpics217';
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
  const ids = ['capture_orb', 'creature_ledger', 'spawn_emberling', 'spawn_mossback', 'spawn_stormkit'];
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
await page.fill('[data-testid=world-name]', 'Guide Pictures 217');
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


if (PARTS.includes('wild')) {
  await ev(() => { const g = window.__bf.game; g.player.flying = true; g.teleport(300.5, 90, 300.5); });
  await settle();
  const P = await pad(null, 10);
  await settle();
  const { x, y, z } = P;
  // a sandy patch, a mossy patch, a snowy patch, one Wildling on each, all facing the camera
  for (let dx = -8; dx <= -2; dx++) for (let dz = -4; dz <= 0; dz++) await put(x + dx, y - 1, z + dz, 'sand');
  for (let dx = 2; dx <= 8; dx++) for (let dz = -4; dz <= 0; dz++) await put(x + dx, y - 1, z + dz, 'snow');
  const put3 = [['emberling', -5, -2], ['mossback', 0, -2], ['stormkit', 5, -2]];
  for (const [t, dx, dz] of put3) await still(t, x + dx + 0.5, y, z + dz + 0.5, Math.PI);
  for (const dx of [-6, -4, 4, 6]) await put(x + dx, y, z - 4, dx < 0 ? 'cactus' : 'spruce_log');
  await settle();
  await view([x + 0.5, y + 1.7, z + 6.5], [x + 0.5, y + 0.5, z - 2]);
  await shot('wl01_three');
  await view([x - 4.2, y + 0.9, z + 1.2], [x - 5, y + 0.4, z - 2]);
  await shot('wl02_ember');
  await view([x + 0.5, y + 0.9, z + 1.2], [x + 0.5, y + 0.4, z - 2]);
  await shot('wl03_moss');
}

if (PARTS.includes('ledger')) {
  await ev(() => { const s = window.__bf.game.progress.stats; s.caught_emberling = 1; s.seen_emberling = 2; s.seen_mossback = 3; s.seen_stormkit = 1; window.__bf.ui.set({ overlay: 'ledger' }); });
  await wait(700);
  await page.screenshot({ path: `${OUT}/wl04_ledger.png` });
  console.log('shot wl04_ledger');
}
await b.close();
