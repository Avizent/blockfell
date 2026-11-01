// Screenshots and icons for the 2.10 guide pages: Moth Wings, Fireworks, fishing and jars, Spring Pads and the Hootlet.
// node tests/guide_shots22.mjs  (dev server)  PARTS=icons,glider,pad,jar,fire,owl
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots210';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'glider,pad,jar,fire,owl').split(',');
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
  const ids = ['moth_silk', 'moth_wings', 'firework', 'spring_pad', 'fish_jar', 'grilled_fish', 'raw_sunfin', 'raw_moonfin', 'raw_frostfin', 'raw_glowfin', 'raw_ruby_carp', 'raw_trout', 'raw_perch', 'spawn_hootlet', 'wheat_seeds', 'feather', 'blast_powder', 'stick', 'string', 'leather', 'iron_ingot', 'planks', 'glass', 'star_wings', 'gloomdust', 'fishing_rod', 'gunpowder'];
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
await page.fill('[data-testid=world-name]', 'Guide Pictures 210');
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

if (PARTS.includes('glider')) {
  // the inventory: Moth Wings on the picture of you, with the silk and string that make them
  await ev(() => {
    const g = window.__bf.game;
    g.setGameMode('survival');
    g.inventory.slots.fill(null);
    g.inventory.slots[36] = { id: 'leather_helmet', count: 1 };
    g.inventory.slots[37] = { id: 'moth_wings', count: 1 };
    g.inventory.slots[38] = { id: 'leather_leggings', count: 1 };
    g.inventory.slots[39] = { id: 'leather_boots', count: 1 };
    g.inventory.slots[0] = { id: 'iron_sword', count: 1 };
    g.inventory.slots[1] = { id: 'moth_silk', count: 4 };
    g.inventory.slots[2] = { id: 'string', count: 1 };
    g.inventory.slots[3] = { id: 'gloomdust', count: 3 };
    g.inventory.changed();
    window.__bf.engine.openInventory();
    window.__bf.engine.input.exitLock();
  });
  await wait(500);
  await page.mouse.move(470, 200);
  await wait(800);
  await shot('mw01_inventory', true);
  await ev(() => { window.__bf.engine.closeOverlay(); window.__bf.game.setGameMode('creative'); }); await wait(300);
}
if (PARTS.includes('pad')) {
  await clearMobs();
  await pad(P);
  for (const [dx, dz] of [[-2, -2], [0, -2], [2, -2], [-1, 0], [1, 0], [0, 2]]) await put(P.x + dx, P.y, P.z + dz, 'spring_pad');
  await view([P.x + 0.5, P.y + 3.2, P.z + 4.5], [P.x + 0.5, P.y, P.z - 1], true);
  await shot('sp01_pads');
}
if (PARTS.includes('jar')) {
  await clearMobs();
  await pad(P);
  const keys = ['jar:trout', 'jar:perch', 'jar:sunfin', 'jar:moonfin', 'jar:frostfin', 'jar:glowfin', 'jar:ruby_carp'];
  for (let i = 0; i < 7; i++) { await put(P.x - 3 + i, P.y - 1, P.z - 2, 'oak_planks'); await put(P.x - 3 + i, P.y, P.z - 2, keys[i]); }
  await put(P.x + 4, P.y, P.z - 2, 'fish_jar');
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 14000; });
  await view([P.x + 0.5, P.y + 1.5, P.z + 1.2], [P.x + 0.5, P.y + 0.45, P.z - 2], false);
  await shot('fj01_jars');
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; });
}
if (PARTS.includes('fire')) {
  await clearMobs();
  await pad(P);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 14500; });
  await view([P.x + 0.5, P.y + 1.4, P.z + 9], [P.x + 0.5, P.y + 12, P.z - 8], false);
  await ev(([x, y, z]) => {
    const g = window.__bf.game;
    window.__realRandom = window.__realRandom ?? Math.random;
    g.fireworks.launch(x - 5, y, z - 10, 0); g.fireworks.launch(x + 4, y, z - 12, 3); g.fireworks.launch(x + 0.5, y, z - 14, 6);
    let n = 0;
    for (let i = 0; i < 80; i++) { g.tick(); }
  }, [P.x + 0.5, P.y, P.z]);
  await ev(() => { const g = window.__bf.game; g.fireworks.launch(g.player.x - 3, g.player.y, g.player.z - 12, 0); g.fireworks.launch(g.player.x + 3, g.player.y, g.player.z - 11, 0); });
  // tick until the particle count peaks, then shoot
  let peak = 0;
  for (let i = 0; i < 70; i++) {
    await ev(() => window.__bf.game.tick());
    const n = await ev(() => window.__bf.game.particles.count);
    if (n > peak) peak = n;
    if (peak > 120 && n < peak - 8) break;
  }
  await shot('fw01_show');
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; });
}
if (PARTS.includes('owl')) {
  await clearMobs();
  await pad(P);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 4500; });
  const wild = await still('hootlet', P.x - 1.6, P.y, P.z - 2.2, Math.PI + 0.45);
  const tamed = await still('hootlet', P.x + 1.0, P.y, P.z - 2.2, Math.PI - 0.45, 'm.tame();');
  await view([P.x - 0.2, P.y + 0.7, P.z + 0.6], [P.x - 0.3, P.y + 0.4, P.z - 2.2], false);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.tick(); });
  await shot('ow01_owls');
}
await b.close();
