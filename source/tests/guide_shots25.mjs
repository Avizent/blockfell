// Screenshots and icons for the 2.14 guide pages: Powder Snow (icons only).
// node tests/guide_shots22.mjs  (dev server)  PARTS=icons,map,tune,music,storm,bow,trader
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots211';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'map,tune,music,storm,bow,trader').split(',');
const SEED = process.env.SEED || 'ridepics211';
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
  const ids = ['powder_snow'];
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
await page.fill('[data-testid=world-name]', 'Guide Pictures 211');
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


if (PARTS.includes('map')) {
  await ev(() => {
    const g = window.__bf.game;
    g.setGameMode('survival');
    g.inventory.slots.fill(null);
    g.inventory.slots[0] = { id: 'treasure_map', count: 1 };
    g.inventory.selected = 0; g.inventory.changed();
    g.useMap(0); window.__bf.engine.closeOverlay();
  });
  await ev(([x, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, 80, z); }, [P.x + 0.5, P.z + 0.5]);
  await ticks(40);
  await ev(() => { window.__bf.ui.set({ overlay: null }); });
  await shot('tm01_hud', true);
  await ev(() => { const g = window.__bf.game; g.useMap(0); });
  await wait(700);
  await page.screenshot({ path: `${OUT}/tm02_map.png` });
  await ev(() => { window.__bf.engine.closeOverlay(); window.__bf.game.setGameMode('creative'); }); await wait(300);
}
if (PARTS.includes('tune')) {
  await clearMobs(); await pad(P);
  await put(P.x, P.y, P.z - 2, 'tune_box');
  await ev(([x, y, z]) => {
    const g = window.__bf.game;
    g.openTuneBox(x, y, z);
    const t = g.tuneBoxTune();
    t.name = 'Gran Song'; t.tempo = 110;
    const mel = [3, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, 3, 4, -1, 5, -1, 6, -1, 5, -1, 3, -1, 2, -1, 0, -1];
    mel.forEach((v, i) => { t.mel[i] = v; });
    [0, 8, 16, 24].forEach((i, k) => { t.bass[i] = [0, 1, 0, 2][k]; });
    [0, 4, 8, 12, 16, 20, 24, 28].forEach((i) => { t.drum[i] = 1; });
    [4, 12, 20, 28].forEach((i) => { t.drum[i] = 2; });
    window.__bf.engine.input.exitLock();
  }, [P.x, P.y, P.z - 2]);
  await wait(900);
  await page.mouse.move(40, 40);
  await ev(() => window.__bf.game.previewTune(true));
  for (let i = 0; i < 14; i++) await ev(() => window.__bf.game.tick());
  await wait(500);
  await page.screenshot({ path: `${OUT}/tb01_editor.png` });
  await ev(() => { window.__bf.engine.closeOverlay(); }); await wait(300);
}
if (PARTS.includes('music')) {
  await clearMobs(); await pad(P);
  await put(P.x - 2, P.y - 1, P.z - 3, 'oak_planks'); await put(P.x - 2, P.y, P.z - 3, 'note_block');
  await put(P.x - 1, P.y - 1, P.z - 3, 'glass'); await put(P.x - 1, P.y, P.z - 3, 'note_block');
  await put(P.x, P.y, P.z - 3, 'note_block');
  await put(P.x + 1, P.y - 1, P.z - 3, 'stone'); await put(P.x + 1, P.y, P.z - 3, 'note_block');
  await put(P.x + 3, P.y, P.z - 3, 'jukebox');
  await put(P.x + 4, P.y, P.z - 3, 'tune_box');
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.inventory.slots[1] = { id: 'disc_jig', count: 1 }; g.inventory.selected = 1; g.useJukebox(x, y, z); for (let i = 0; i < 70; i++) g.tick(); }, [P.x + 3, P.y, P.z - 3]);
  await view([P.x + 0.8, P.y + 1.8, P.z + 2.2], [P.x + 1, P.y + 0.5, P.z - 3], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 18; i++) g.tick(); });
  await shot('mu01_scene');
  await ev(([x, y, z]) => { const g = window.__bf.game; g.useJukebox(x, y, z); }, [P.x + 3, P.y, P.z - 3]);
}
if (PARTS.includes('storm')) {
  await clearMobs(); await pad(P);
  await put(P.x + 2, P.y, P.z - 5, 'lightning_rod');
  await put(P.x - 3, P.y, P.z - 6, 'oak_planks'); await put(P.x - 3, P.y + 1, P.z - 6, 'oak_planks');
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; g.weather.set('storm', 99999, true); });
  await view([P.x - 1.5, P.y + 1.8, P.z + 5], [P.x + 2, P.y + 4, P.z - 5], false);
  await ev(([x, z]) => { const g = window.__bf.game; for (let i = 0; i < 30; i++) g.tick(); g.strike(x, z, true); }, [P.x + 2, P.z - 5]);
  await ev(() => { const g = window.__bf.game; g.tick(); });
  await shot('wt01_rod');
  await ev(() => { const g = window.__bf.game; g.weather.set('clear', 99999, true); });
}
if (PARTS.includes('bow')) {
  await clearMobs(); await pad(P);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 5500; g.weather.set('rain', 99999, true); for (let i = 0; i < 40; i++) g.tick(); g.weather.set('clear', 99999, false); const w = g.weather; w.rainbow = 1; w.rainbowTimer = 5000; w.rain = 0; });
  await view([P.x + 0.5, P.y + 1.7, P.z + 5], [P.x + 0.5, P.y + 30, P.z - 80], false);
  await ev(() => { const g = window.__bf.game; const sx = Math.cos(g.sky?.sunAngle ?? 0); window.__bf.game.weather.rainbow = 1; });
  // face away from the sun: try both directions and keep the one with the bow
  await shot('wt02_rainbow_a');
  await ev(() => { const p = window.__bf.game.player; p.yaw += Math.PI; });
  await ticks(3);
  await shot('wt02_rainbow_b');
}
if (PARTS.includes('trader')) {
  await clearMobs(); await pad(P);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; g.weather.set('clear', 99999, true); });
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item') e.removed = true; });
  const id = await still('trader', P.x + 0.6, P.y, P.z - 2.4, Math.PI - 0.2);
  await view([P.x + 0.3, P.y + 1.5, P.z + 2.6], [P.x + 0.6, P.y + 0.9, P.z - 2.4], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('wd01_trader');
  await ev(() => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.mobType === 'trader');
    g.setGameMode('survival');
    g.inventory.slots.fill(null); g.inventory.slots[0] = { id: 'amber', count: 12 }; g.inventory.changed();
    v.setPos(g.player.x, g.player.y, g.player.z - 2); window.__bf.engine.openTrade(v);
  });
  await wait(900);
  console.log('overlay', await ev(() => window.__bf.ui.get().overlay + ' ' + window.__bf.state().screen));
  await page.mouse.move(40, 40);
  await wait(300);
  await page.screenshot({ path: `${OUT}/wd02_trades.png` });
  await ev(() => { window.__bf.engine.closeOverlay(); window.__bf.game.setGameMode('creative'); }); await wait(300);
}
await b.close();
