// Screenshots and icons for the 2.0 guide pages: the Cinderdeep.
// node tests/guide_shots12.mjs  (dev server)  PARTS=icons,gate,cavern,creatures,shrine  SEED=cinder
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots12';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,gate,cavern,creatures,shrine').split(',');
const SEED = process.env.SEED || 'cinder';
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
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 90000); await wait(800); };
const shot = async (name) => { await ev(() => window.__bf.ui.set({ toasts: [], chat: [], hideHud: true })); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.type === 'mob' || e.mobType) e.removed = true;
});

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['ashrock', 'ash', 'ember_ore', 'fire_opal_ore', 'glowcap', 'ashrock_bricks', 'ember_lamp', 'ember', 'fire_opal', 'cinder_charm',
    'spawn_cinderling', 'spawn_smoulderer', 'cinderstone', 'cinderstone_bricks', 'torch', 'lava_bucket', 'glass', 'string', 'stick', 'iron_ingot'];
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
await page.fill('[data-testid=world-name]', 'Cinderdeep Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();

if (PARTS.includes('gate')) {
  // a lit Deepgate on open ground, seen from a few blocks away
  await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x) + 5, z = Math.floor(p.z);
    const gate = g.buildGate(x, z);
    p.flying = true;
    g.teleport(gate.x - 4.2, gate.y + 3.1, gate.z + 3.4);
    bf.aimAt(gate.x + 0.5, gate.y + 0.6, gate.z + 0.5);
    window.__gate = gate;
  });
  await settle();
  await wait(1500);
  await shot('cd01_gate');
}

if (PARTS.includes('cavern') || PARTS.includes('creatures') || PARTS.includes('shrine')) {
  // the Cinderdeep pictures are taken with Options > Brightness at Bright (BRIGHT=0.5 for the default)
  await ev((v) => { window.__bf.engine.options.brightness = v; }, Number(process.env.BRIGHT ?? 1));
  await ev(() => void window.__bf.engine.changeDimension('cinderdeep', { kind: 'gate', x: Math.floor(window.__bf.game.player.x), z: Math.floor(window.__bf.game.player.z) }));
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await settle();
  await quiet();
}

if (PARTS.includes('cavern')) {
  // a long, open view sloping down to the lava sea: march rays from candidate spots in 8 directions
  const spot = await ev(() => {
    const g = window.__bf.game, w = g.world, p = g.player, LAVA = window.__bf.B.IS_LAVA;
    let best = null, bs = -1;
    for (let dx = -64; dx <= 64; dx += 4) for (let dz = -64; dz <= 64; dz += 4) {
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
      if (!w.isLoaded(x, z)) continue;
      for (const y of [44, 52, 60, 68]) {
        if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
        for (let a = 0; a < 8; a++) {
          const ang = (a * Math.PI) / 4, ux = Math.cos(ang), uz = Math.sin(ang);
          let run = 0, lava = 0, wide = 0;
          for (let k = 1; k <= 56; k++) {
            const bx = Math.floor(x + ux * k), bz = Math.floor(z + uz * k), by = Math.floor(y - k * 0.3);
            if (!w.isLoaded(bx, bz)) break;
            const id = w.getBlock(bx, by, bz);
            if (LAVA[id]) { lava = 1; break; }
            if (id !== 0) break;
            run++;
            // room to the sides as well
            if (w.getBlock(Math.floor(bx - uz * 4), by, Math.floor(bz + ux * 4)) === 0) wide++;
            if (w.getBlock(Math.floor(bx + uz * 4), by, Math.floor(bz - ux * 4)) === 0) wide++;
          }
          const sc = run + wide * 0.6 + lava * 25;
          if (sc > bs) { bs = sc; best = { x, y, z, yaw: Math.atan2(-ux, -uz), sc }; }
        }
      }
    }
    return best;
  });
  console.log('cavern spot', JSON.stringify(spot));
  await ev((s) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(s.x + 0.5, s.y - 0.4, s.z + 0.5); p.yaw = s.yaw; p.pitch = -0.3; }, spot);
  await settle();
  await wait(2500);
  await shot('cd02_cavern');
}

if (PARTS.includes('creatures')) {
  await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z) + 40, y = 66;
    // a flat ashrock shelf with glowcaps and a lamp, open above
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
      bf.setBlock(x + dx, y - 1, z + dz, Math.abs(dx) + Math.abs(dz) < 6 ? 'ash' : 'ashrock');
      for (let dy = 0; dy <= 6; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    for (const [dx, dz] of [[-3, 2], [-4, 1], [3, 3], [4, -2], [-2, -3]]) bf.setBlock(x + dx, y, z + dz, 'glowcap');
    bf.setBlock(x + 5, y, z + 4, 'ember_lamp');
    const a = g.entities.spawnMob('cinderling', x - 1.3, y, z + 0.5, g);
    const s = g.entities.spawnMob('smoulderer', x + 1.6, y, z + 1.2, g);
    a.yaw = 0.35; s.yaw = -0.3;
    for (const m of [a, s]) { m.persistent = true; m.tick = function () { this.beginTick(); }; if ('bodyYaw' in m) m.bodyYaw = m.yaw; m.prevYaw = m.yaw; }
    p.flying = true;
    g.teleport(x + 0.2, y + 0.6, z - 4.4);
    bf.aimAt(x + 0.1, y + 1.0, z + 0.8);
  });
  await settle();
  await wait(1500);
  await shot('cd03_creatures');
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
}

if (PARTS.includes('shrine')) {
  const s = await ev(() => {
    const g = window.__bf.game, p = g.player;
    const cx0 = Math.floor(p.x) >> 4, cz0 = Math.floor(p.z) >> 4;
    for (let r = 0; r < 14; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const res = g.world.generator.generateChunk(cx0 + dx, cz0 + dz);
      if (res.spawners.length) return res.spawners[0];
    }
    return null;
  });
  if (s) {
    await ev((s) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(s.x + 0.5, s.y + 2.2, s.z + 0.5 - 3.7); window.__bf.aimAt(s.x + 0.5, s.y + 0.2, s.z + 0.5); }, s);
    await settle();
    // keep the cage's creatures out of the picture (cages make nothing on Peaceful)
    await ev(() => { const g = window.__bf.game; g.difficulty = 'peaceful'; for (const e of g.entities.list) if (e.mobType) e.removed = true; });
    await wait(2000);
    await shot('cd04_shrine');
  }
}
await b.close();
