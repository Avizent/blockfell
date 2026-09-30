// Screenshots and item icons for the 1.3 (weather and Fellhound) pages of the How-to-Play guide.
// node tests/guide_shots4.mjs  (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots4';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,rain,hounds,snow').split(',');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
const shot = async (name) => { await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const settle = async () => { await wait(1200); await waitFor(() => ev(() => window.__bf.state().chunks.meshQueue === 0), 60000); await wait(1000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const time = (t) => ev((t) => { window.__bf.game.dayNight.time = t; }, t);
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); if (id) inv.slots[0] = { id, count: 1 }; inv.selected = 0; inv.changed(); }, id);
const view = (x, y, z, ax, ay, az) => ev(([x, y, z, ax, ay, az]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; window.__bf.aimAt(ax, ay, az); }, [x, y, z, ax, ay, az]);
const weather = (k) => ev((k) => window.__bf.game.weather.set(k, 99999, true), k);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.3');
await page.fill('[data-testid=world-seed]', 'villages');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await page.mouse.move(640, 360);
await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true; });
await wait(2500);

if (PARTS.includes('icons')) {
  const ICON_IDS = ['spawn_hound', 'raw_beef', 'raw_porkchop', 'raw_mutton', 'raw_chicken', 'raw_rabbit', 'cooked_porkchop', 'steak', 'bed', 'water_bucket', 'stick'];
  const icons = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const out = {};
    for (const id of ids) {
      let st = null;
      try { st = ic.style(id); } catch { st = null; }
      if (!st) continue;
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      out[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return out;
  }, ICON_IDS);
  for (const [id, url] of Object.entries(icons)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(icons).length);
}

const V = await ev(() => {
  const vp = window.__bf.game.world.generator.villages;
  for (let r = 0; r <= 4; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
    const p = vp.planForRegion(rx, rz);
    if (p && p.style === 'timber') return { id: p.id, x: p.x, z: p.z, y: p.y, radius: p.radius };
  }
  return null;
});

if (PARTS.includes('rain') && V) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, y + 14, z + 0.5); }, [V.x, V.y, V.z]);
  await waitFor(async () => (await ev((id) => !!window.__bf.game.villages.states.get(id)?.populated, V.id)), 60000);
  await settle();
  await time(4500);
  await ev((id) => { const g = window.__bf.game; g.villages.states.get(id).lastRaidDay = g.dayNight.day; }, V.id);
  await fast(300);
  // rain in the village, from a street corner
  await weather('rain');
  await hold(null);
  const well = await ev((id) => { const p = window.__bf.game.villages.plan(id); const w = p.buildings.find((q) => q.kind === 'well'); return w ? { x: w.x0 + 2, z: w.z0 + 2, y: w.y } : { x: p.x, z: p.z, y: p.y }; }, V.id);
  await view(well.x + 0.5, well.y + 2.4, well.z + 13.5, well.x + 0.5, well.y + 1.2, well.z + 3.5);
  await settle();
  await shot('w01_rain');
  // a thunderstorm with a bolt of lightning
  await weather('thunder');
  await time(9000);
  await view(V.x + 26, V.y + 12, V.z + 26, V.x - 6, V.y + 8, V.z - 6);
  await settle();
  await ev((v) => { const g = window.__bf.game; g.strike(v.x - 14, v.z - 10); }, V);
  await wait(70);
  await shot('w02_storm');
  await wait(1500);
}

if (PARTS.includes('hounds') && V) {
  await weather('clear');
  await time(3000);
  // a meadow cleared just outside the village (load the area first)
  await ev((v) => { const g = window.__bf.game; g.player.flying = true; g.teleport(v.x + v.radius + 12.5, v.y + 12, v.z + 8.5); }, V);
  await waitFor(() => ev((v) => { const w = window.__bf.game.world, x = v.x + v.radius + 12; return w.isLoaded(x + 14, v.z + 14) && w.isLoaded(x - 14, v.z - 14) && w.isLoaded(x + 14, v.z - 14) && w.isLoaded(x - 14, v.z + 14); }, V), 60000);
  await settle();
  const site = await ev((v) => {
    const g = window.__bf.game, bf = window.__bf, gen = g.world.generator;
    const x = v.x + v.radius + 12, z = v.z;
    const y = gen.column(x, z).height;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
      for (let k = y - 3; k < y; k++) bf.setBlock(x + dx, k, z + dz, 'dirt');
      bf.setBlock(x + dx, y, z + dz, 'grass');
      for (let k = 1; k <= 14; k++) bf.setBlock(x + dx, y + k, z + dz, 'air');
      if ((dx * 7 + dz * 13) % 5 === 0 && Math.abs(dx) + Math.abs(dz) > 3) bf.setBlock(x + dx, y + 1, z + dz, 'tall_grass');
    }
    return { x, z, y: y + 1 };
  }, V);
  await ev((s) => { const g = window.__bf.game; g.teleport(s.x + 0.5, s.y + 6, s.z + 8.5); }, site);
  await settle();
  // a wild pack
  const ids = await ev((s) => {
    const g = window.__bf.game, w = g.world;
    const out = [];
    const place = (dx, dz, yaw) => {
      const x = s.x + dx, z = s.z + dz;
      const m = g.entities.spawnMob('hound', x + 0.5, w.highestSolid(Math.floor(x), Math.floor(z)) + 1, z + 0.5, g);
      m.yaw = yaw; m.prevYaw = yaw; m.tick = function () { this.beginTick(); };
      out.push(m.id);
      return m;
    };
    place(-1.5, 0, Math.PI * 0.85);
    place(1.2, -1.2, Math.PI * 1.15);
    place(0, 1.8, Math.PI * 0.95);
    return out;
  }, site);
  await hold(null);
  await view(site.x + 0.5, site.y + 1.5, site.z + 6.5, site.x, site.y + 0.6, site.z);
  await settle();
  await shot('h01_pack');
  await ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.removed = true; }, ids);
  // your companions: one sitting, one standing by your side
  const pets = await ev((s) => {
    const g = window.__bf.game, w = g.world;
    const mk = (dx, dz, yaw, sit) => {
      const x = s.x + dx, z = s.z + dz;
      const m = g.entities.spawnMob('hound', x + 0.5, w.highestSolid(Math.floor(x), Math.floor(z)) + 1, z + 0.5, g);
      m.tame(); m.sitting = sit;
      m.yaw = yaw; m.prevYaw = yaw; m.tick = function () { this.beginTick(); };
      return m.id;
    };
    return [mk(-1.3, 0.5, Math.PI * 0.8, true), mk(1.3, 0, Math.PI * 1.2, false)];
  }, site);
  await hold('raw_beef');
  await view(site.x + 0.5, site.y + 1.4, site.z + 5.5, site.x, site.y + 0.6, site.z + 0.3);
  await settle();
  await shot('h02_companions');
  // taming: hearts over a newly tamed hound
  await ev((ids) => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.id === ids[1]); g.effect('heart', m.x, m.y + 1.1, m.z, 8); }, pets);
  await wait(250);
  await shot('h03_hearts');
  // a Fellhound fights a Shambler at dusk
  await ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.removed = true; }, pets);
  await time(11200);
  const fight = await ev((s) => {
    const g = window.__bf.game, w = g.world;
    const hd = g.entities.spawnMob('hound', s.x + 0.6, w.highestSolid(s.x, s.z) + 1, s.z + 0.5, g);
    hd.tame();
    const sh = g.entities.spawnMob('shambler', s.x - 0.9, w.highestSolid(s.x - 1, s.z) + 1, s.z + 0.5, g);
    sh.yaw = -Math.PI / 2; sh.prevYaw = sh.yaw;           // facing the hound (+x)
    hd.yaw = Math.PI / 2; hd.prevYaw = hd.yaw; hd.attackAnim = 4;   // facing the shambler (-x)
    for (const m of [hd, sh]) m.tick = function () { this.beginTick(); };
    return [hd.id, sh.id];
  }, site);
  await hold('iron_sword');
  await view(site.x + 0.1, site.y + 1.5, site.z + 4.6, site.x - 0.1, site.y + 0.8, site.z + 0.5);
  await settle();
  await shot('h04_fight');
  await ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.removed = true; }, fight);
}

if (PARTS.includes('snow')) {
  const sn = await ev(() => {
    const g = window.__bf.game, gen = g.world.generator;
    for (let r = 64; r < 2400; r += 24) for (let a = 0; a < 32; a++) {
      const x = Math.floor(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 32 * Math.PI * 2) * r);
      const c = gen.column(x, z);
      if (c.biome !== 6 || c.height < 66 || c.height > 118) continue;
      let ok = true;
      for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) if (gen.column(x + dx, z + dz).biome !== 6) ok = false;
      if (ok) return { x, z, h: c.height };
    }
    return null;
  });
  console.log('snow', JSON.stringify(sn));
  if (sn) {
    await weather('rain');
    await time(4000);
    await hold(null);
    await ev((s) => { const g = window.__bf.game; g.player.flying = true; g.teleport(s.x + 0.5, s.h + 3, s.z + 0.5); g.player.pitch = -0.05; }, sn);
    await settle();
    await ev((s) => { const g = window.__bf.game; g.teleport(s.x + 0.5, s.h + 2.6, s.z + 0.5); g.player.pitch = -0.08; }, sn);
    await wait(1500);
    await shot('w03_snow');
  }
}

await b.close();
