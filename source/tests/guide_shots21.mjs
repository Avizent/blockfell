// Screenshots and icons for the 2.9 guide pages: potatoes, milk, Powderbug, Gloommoth and Sporecap colours.
// node tests/guide_shots21.mjs  (dev server)  PARTS=icons,field,bug,moth,colours
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots29';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'field,bug,moth,colours').split(',');
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
  const ids = ['potato', 'baked_potato', 'milk_bucket', 'bucket', 'blast_powder', 'gloomdust', 'spawn_powderbug', 'spawn_gloommoth', 'string', 'glowcap', 'sporecap', 'party_popper', 'potion_night_eyes', 'furnace'];
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
await page.fill('[data-testid=world-name]', 'Guide Pictures 29');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();
await clean();
const put = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
/** A flat grass pad, 14 wide, with air above, centred on the player's column. */
const pad = (at) => ev((at) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = at ? at.x : Math.floor(p.x), z = at ? at.z : Math.floor(p.z), y = at ? at.y : Math.floor(p.y);
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'grass'); bf.setBlock(x + dx, y - 2, z + dz, 'dirt'); for (let dy = 0; dy <= 12; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  return { x, y, z };
}, at);
const clearMobs = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
await ev(() => { const g = window.__bf.game; g.player.flying = true; g.teleport(300.5, 80, 300.5); });
await settle();
const P = await pad();
await settle();
if (PARTS.includes('field')) {
  for (let i = 0; i < 4; i++) for (let k = -3; k <= 3; k++) {
    await put(P.x - 4 + i * 2, P.y - 1, P.z - 3 + k, 'farmland_moist');
    await put(P.x - 4 + i * 2, P.y, P.z - 3 + k, `potatoes:${i}`);
  }
  for (let k = -3; k <= 3; k++) { await put(P.x - 3, P.y - 1, P.z - 3 + k, 'water'); await put(P.x - 3, P.y, P.z - 3 + k, 'air'); }
  await view([P.x + 0.5, P.y + 2.4, P.z + 4.0], [P.x + 0.5, P.y + 0.3, P.z - 1.5], true);
  await shot('po01_field');
  await pad(P);
}
if (PARTS.includes('bug')) {
  await clearMobs();
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; });
  await still('powderbug', P.x - 1.2, P.y, P.z - 1.5, 0.35);
  await still('powderbug', P.x + 1.4, P.y, P.z - 2.5, -0.5, 'm.fuse = 18;');
  await view([P.x + 0.5, P.y + 1.3, P.z + 3.5], [P.x + 0.2, P.y + 0.5, P.z - 2], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 2; i++) g.tick(); });
  await shot('pb01_bugs');
}
if (PARTS.includes('moth')) {
  await clearMobs();
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 12900; });
  await still('gloommoth', P.x - 1.3, P.y + 2.6, P.z - 3.2, 0.4);
  await still('gloommoth', P.x + 1.9, P.y + 3.4, P.z - 4.6, -0.6);
  await view([P.x + 0.5, P.y + 1.4, P.z + 2.5], [P.x + 0.5, P.y + 2.8, P.z - 5], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 2; i++) g.tick(); });
  await shot('gm01_moths');
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; });
}
if (PARTS.includes('colours')) {
  await clearMobs();
  await still('sporecap', P.x - 1.6, P.y, P.z - 2.2, 0.45, 'm.setVariant(0);');
  await still('sporecap', P.x, P.y, P.z - 2.4, 0, 'm.setVariant(1);');
  await still('sporecap', P.x + 1.6, P.y, P.z - 2.2, -0.45, 'm.setVariant(2);');
  await view([P.x + 0.1, P.y + 1.0, P.z + 1.0], [P.x, P.y + 0.6, P.z - 2.3], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('sc01_colours');
}
await b.close();
