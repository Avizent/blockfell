// Screenshots and icons for the 2.5 guide pages: potions and the Brewing Stand.
// node tests/guide_shots17.mjs  (dev server)  PARTS=icons,stand,screen,potions,splash
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots17';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,stand,screen,potions,splash').split(',');
const SEED = process.env.SEED || 'brewpics25';
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
  const ids = ['brewing_stand', 'glass_bottle', 'water_bottle', 'potion_swiftness', 'potion_might', 'potion_mending', 'potion_night_eyes', 'potion_deep_breath', 'potion_emberward', 'splash_swiftness', 'splash_might', 'splash_mending', 'splash_night_eyes', 'splash_deep_breath', 'splash_emberward', 'feather', 'bone', 'starbloom', 'glowcap', 'drift_silk', 'ember', 'glimmer_dust', 'coal', 'iron_ingot', 'cobblestone', 'glass'];
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
await page.fill('[data-testid=world-name]', 'Brew Pictures');
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

if (PARTS.includes('stand')) {
  await put(P.x, P.y, P.z, 'brewing_stand');
  await put(P.x + 1, P.y, P.z, 'glass');
  await settle();
  await view([P.x + 0.5, P.y + 1.1, P.z + 2.0], [P.x + 0.5, P.y + 0.4, P.z + 0.5], false);
  await shot('br01_stand');
}

if (PARTS.includes('screen')) {
  await ev(([x, y, z]) => {
    const g = window.__bf.game;
    g.player.creative = false;
    for (let i = 0; i < 9; i++) g.inventory.slots[i] = null;
    g.inventory.slots[0] = { id: 'water_bottle', count: 5 }; g.inventory.slots[1] = { id: 'feather', count: 6 }; g.inventory.slots[2] = { id: 'coal', count: 8 };
    g.inventory.slots[3] = { id: 'glimmer_dust', count: 4 }; g.inventory.slots[4] = { id: 'potion_swiftness', count: 2 };
    g.inventory.changed();
    g.world.blockEntities.set(`${x},${y},${z}`, { type: 'brewing', items: [{ id: 'water_bottle', count: 1 }, { id: 'water_bottle', count: 1 }, { id: 'water_bottle', count: 1 }, { id: 'feather', count: 3 }, { id: 'coal', count: 5 }], fuel: 7, brewTime: 230 });
    g.stands.add(`${x},${y},${z}`);
    g.openBlockUI(x, y, z, 'brewing');
    window.__bf.ui.set({ brew: { progress: 0.58, fuel: 0.7 } });
  }, [P.x, P.y, P.z]);
  await wait(800);
  await ev(() => window.__bf.ui.set({ toasts: [], chat: [], brew: { progress: 0.58, fuel: 0.7 } }));
  await page.screenshot({ path: `${OUT}/br02_screen.png` });
  console.log('shot br02_screen');
  await ev(() => window.__bf.engine.closeOverlay());
}

if (PARTS.includes('potions')) {
  await ev(() => {
    const g = window.__bf.game;
    g.player.creative = false;
    const E = ['swiftness', 'might', 'mending', 'night_eyes', 'deep_breath', 'emberward'];
    for (let i = 0; i < 6; i++) g.inventory.slots[i] = { id: 'potion_' + E[i], count: 1 };
    g.inventory.slots[6] = { id: 'splash_mending', count: 3 }; g.inventory.slots[7] = { id: 'water_bottle', count: 4 }; g.inventory.slots[8] = { id: 'glass_bottle', count: 6 };
    g.inventory.selected = 0; g.inventory.changed();
    g.potions.add('swiftness', 20 * 148); g.potions.add('night_eyes', 20 * 196); g.potions.add('mending', 20 * 41);
  });
  await view([P.x + 2.2, P.y + 1.5, P.z + 3.2], [P.x + 0.5, P.y + 0.8, P.z + 0.5], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 12; i++) g.tick(); });
  await wait(600);
  await shot('br03_hud', true);
}

if (PARTS.includes('splash')) {
  await ev(() => { const g = window.__bf.game; g.potions.clear(); g.player.creative = false; });
  await view([P.x + 1.2, P.y + 1.6, P.z + 6], [P.x + 1, P.y + 0.4, P.z + 1], false);
  await ev(([x, y, z]) => { const g = window.__bf.game; g.shatterPotion(x, y, z, 'mending'); for (let i = 0; i < 2; i++) g.effect('star', x, y + 0.3, z, 40); }, [P.x + 1, P.y + 0.6, P.z + 1]);
  await wait(250);
  await page.screenshot({ path: `${OUT}/br04_splash.png` });
  console.log('shot br04_splash');
}
await b.close();
