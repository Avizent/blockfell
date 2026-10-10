// Screenshots and icons for the 2.2 guide pages: the Starhollow, the Hollowdrake, Starwings, Drifters and the End.
// node tests/guide_shots14.mjs  (dev server)  PARTS=icons,gate,view,drake,bell,wings,drifter,end
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots14';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,gate,view,drake,bell,wings,drifter,end').split(',');
const SEED = process.env.SEED || 'stars22';
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
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const shot = async (name, hud = false) => { await ev((hud) => window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: !hud }), hud); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.mobType && e.mobType !== 'hollowdrake') e.removed = true;
});
/** Stand (flying) at a spot and look at a point. */
const view = async (from, at) => {
  await ev(([f, a]) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(f[0], f[1], f[2]); p.vx = p.vy = p.vz = 0; window.__bf.aimAt(a[0], a[1], a[2]); }, [from, at]);
  await settle(); await ticks(4);
};
/** Holds the Hollowdrake still at a spot, facing `yaw`, wings at `flap`. */
const pose = (x, y, z, yaw, flap = 0.4) => ev(([x, y, z, yaw, flap]) => {
  const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
  if (!d) return false;
  d.tick = function () { this.beginTick(); };
  d.x = d.prevX = x; d.y = d.prevY = y; d.z = d.prevZ = z; d.yaw = d.prevYaw = yaw; d.pitch = 0; d.flap = flap; d.phase = 'circle';
  return true;
}, [x, y, z, yaw, flap]);

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['star_lens', 'star_scale', 'drift_silk', 'star_wings', 'spawn_drifter', 'starstone', 'starstone_bricks', 'starbloom', 'glimmerstone', 'glimmer_dust', 'rune_shard', 'fire_opal', 'purple_dye'];
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
await page.fill('[data-testid=world-name]', 'Star Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();

if (PARTS.includes('gate')) {
  // a lit Stargate on a stone pad near the spawn point
  const G = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    // the nearest flat, dry, grassy spot (7 x 7) to the spawn point
    let best = null;
    for (let r = 4; r < 48 && !best; r += 2) for (let a = 0; a < 24 && !best; a++) {
      const cx = Math.floor(p.x + Math.cos(a / 24 * Math.PI * 2) * r), cz = Math.floor(p.z + Math.sin(a / 24 * Math.PI * 2) * r);
      const h = g.world.highestSolid(cx, cz);
      let ok = h > 60;
      for (let dx = -3; dx <= 3 && ok; dx++) for (let dz = -3; dz <= 3 && ok; dz++) {
        const hh = g.world.highestSolid(cx + dx, cz + dz);
        if (hh !== h || bf.getBlock(cx + dx, hh, cz + dz) !== 'grass' || bf.getBlock(cx + dx, hh + 1, cz + dz) === 'water') ok = false;
      }
      if (ok) best = { x: cx, z: cz, h };
    }
    if (!best) best = { x: Math.floor(p.x) + 6, z: Math.floor(p.z), h: g.world.highestSolid(Math.floor(p.x) + 6, Math.floor(p.z)) };
    const x = best.x, z = best.z, y = best.h + 1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(x + dx, y - 1, z + dz, 'stone_bricks');
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy <= 3; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) bf.setBlock(x + dx, y, z + dz, 'glimmerstone');
    bf.setBlock(x, y, z, 'stargate');
    return { x, y, z };
  });
  await view([G.x - 3.4, G.y + 2.2, G.z + 4.2], [G.x + 0.5, G.y + 0.2, G.z + 0.5]);
  await wait(800);
  await shot('st01_gate');
}

// up to the Starhollow (Options > Brightness: Bright, as on the Cinderdeep pages)
await ev((v) => { window.__bf.engine.options.brightness = v; }, Number(process.env.BRIGHT ?? 1));
await ev(() => void window.__bf.engine.changeDimension('starhollow', { kind: 'gate', x: 0, z: 0, gate: 'star' }));
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();
await waitFor(() => ev(() => window.__bf.game.entities.list.some((e) => e.mobType === 'hollowdrake')), 15000);

if (PARTS.includes('view')) {
  // from the arrival gate: the pylons, the Roost, and the Hollowdrake beyond
  await pose(6, 80, 16, 2.75, 0.9);
  await view([0.5, 68.4, 48.5], [0.5, 71, 0]);
  await wait(800);
  await shot('st02_view');
}

if (PARTS.includes('drake')) {
  // close: the shielded Hollowdrake beside a pylon, with its health bar
  await ev(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.slots[0] = { id: 'iron_sword', count: 1 }; g.inventory.slots[1] = { id: 'bow', count: 1 }; g.inventory.slots[2] = { id: 'arrow', count: 32 }; g.inventory.slots[3] = { id: 'star_lens', count: 1 }; g.inventory.selected = 0; g.inventory.changed(); g.setGameMode('survival'); });
  // (seen from the top of a pylon, as it flies past a little below)
  await pose(8, 72.5, 8, -2.36, 0.2);
  await view([17.5, 81, 17.5], [8, 73.3, 8]);
  await wait(1500);
  await shot('st03_drake', true);
  await ev(() => window.__bf.game.setGameMode('creative'));
}

if (PARTS.includes('bell')) {
  // on top of a pylon, beside its Storm Bell, the Roost below
  const B = await ev(async () => { const S = await import('/src/world/Starhollow.ts'); return S.bellPos(1); });
  await pose(-40, 70, 60, 0, 0.3);
  await view([B.x + 0.5 + 2.1, B.y + 0.9, B.z + 0.5 + 2.1], [B.x + 0.5, B.y + 0.3, B.z + 0.5]);
  await ticks(3); await wait(800);
  await shot('st04_bell');
}

if (PARTS.includes('wings')) {
  // the inventory: Starwings on the picture of you
  await ev(() => {
    const g = window.__bf.game;
    g.setGameMode('survival');
    g.inventory.slots.fill(null);
    g.inventory.slots[36] = { id: 'iron_helmet', count: 1 };
    g.inventory.slots[37] = { id: 'star_wings', count: 1 };
    g.inventory.slots[38] = { id: 'iron_leggings', count: 1 };
    g.inventory.slots[39] = { id: 'iron_boots', count: 1 };
    g.inventory.slots[0] = { id: 'iron_sword', count: 1 };
    g.inventory.slots[1] = { id: 'star_lens', count: 1 };
    g.inventory.slots[2] = { id: 'star_scale', count: 5 };
    g.inventory.slots[3] = { id: 'drift_silk', count: 3 };
    g.inventory.slots[4] = { id: 'starbloom', count: 6 };
    g.inventory.changed();
    window.__bf.engine.openInventory();
    window.__bf.engine.input.exitLock();
  });
  await wait(500);
  await page.mouse.move(470, 200);
  await wait(800);
  await shot('st05_inventory', true);
  await ev(() => { window.__bf.engine.closeOverlay(); window.__bf.game.setGameMode('creative'); }); await wait(300);
  // gliding out over the gap towards the outer islands
  await pose(-30, 60, 90, 0, 0.3);
  await view([30, 92, 70], [70, 72, 120]);
  await ev(() => { const g = window.__bf.game, p = g.player; g.inventory.slots[37] = { id: 'star_wings', count: 1 }; g.inventory.changed(); p.flying = false; p.gliding = true; });
  await ticks(12); await wait(300);
  await shot('st06_glide');
  await ev(() => { const p = window.__bf.game.player; p.gliding = false; p.flying = true; });
}

if (PARTS.includes('drifter')) {
  // Drifters by the edge of the main island, outer islands behind
  const at = await ev(() => {
    const g = window.__bf.game;
    const spots = [[-50, 70.2, 40], [-48.6, 71.2, 42.2], [-51.6, 71.6, 42.8]];
    for (const [x, y, z] of spots) {
      const m = g.entities.spawnMob('drifter', x, y, z, g);
      m.tick = function () { this.beginTick(); };
      m.yaw = m.prevYaw = 2.4;
    }
    return spots[0];
  });
  await view([at[0] + 2.6, at[1] + 0.2, at[2] - 2.4], [at[0] - 1.0, at[1] + 1.3, at[2] + 1.6]);
  await wait(800);
  await shot('st07_drifters');
}

if (PARTS.includes('end')) {
  await ev(() => window.__bf.engine.showTheEnd());
  await wait(Number(process.env.END_WAIT ?? 15000));
  await page.screenshot({ path: `${OUT}/st08_end.png` });
  console.log('shot st08_end');
}

await b.close();
