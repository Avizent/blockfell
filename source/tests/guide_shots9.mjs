// Screenshots and item icons for the 1.8 guide pages: village life.
// node tests/guide_shots9.mjs  (dev server)     PARTS=icons,gather,children,map,glow  SEED=villages
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots9';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,gather,children,map,glow').split(',');
const SEED = process.env.SEED || 'villages';
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
const shot = async (name, keepChat = false) => { await ev((k) => window.__bf.ui.set({ ...(k ? {} : { chat: [] }), toasts: [], heldName: null }), keepChat); await wait(300); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const settle = async () => { await wait(1200); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(1200); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); const hot = [id, 'bread', 'apple', 'torch', 'iron_sword', 'map_table', 'bell']; hot.forEach((h, i) => { if (h) inv.slots[i] = { id: h, count: ['bread', 'apple', 'torch'].includes(h) ? 16 : 1 }; }); inv.selected = 0; inv.changed(); }, id);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.8');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => {
  window.__bf.allowUnlocked(true);
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 3000;
});

if (PARTS.includes('icons')) {
  const ICON_IDS = ['bell', 'map_table', 'dungeon_map', 'ruin_map', 'village_map', 'bread', 'apple', 'spawn_villager'];
  const icons = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const out = {};
    for (const id of ids) {
      const st = ic.style(id);
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

// the village next to spawn, populated, with its Sentinel parked out of the picture
const V = await ev(() => {
  const vp = window.__bf.game.world.generator.villages;
  for (let r = 0; r <= 4; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
    const p = vp.planForRegion(rx, rz);
    if (p) return { id: p.id, x: p.x, z: p.z, y: p.y };
  }
  return null;
});
await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, y + 12, z + 0.5); }, [V.x, V.y, V.z]);
await waitFor(async () => (await ev((id) => !!window.__bf.game.villages.states.get(id)?.populated, V.id)), 60000);
await settle();
console.log('village', JSON.stringify(V));

/** Freezes every villager where it stands (so a picture can be lined up). */
const freezeAll = () => ev((id) => { for (const e of window.__bf.game.entities.list) if (e.villageId === id && !e._tick) { e._tick = e.tick; e.tick = function () { this.beginTick(); }; } }, V.id);
const unfreezeAll = () => ev((id) => { for (const e of window.__bf.game.entities.list) if (e._tick) { e.tick = e._tick; delete e._tick; } }, V.id);
/** A spot on a street 8-10 blocks from the well, and the direction (unit vector) from there to the well. */
const streetView = (dist = 9) => ev(([id, dist]) => {
  const g = window.__bf.game, plan = g.villages.plan(id);
  for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    let ok = true;
    for (let t = 4; t <= 10; t++) if (!plan.paths.has(`${plan.x + dx * t},${plan.z + dz * t}`)) ok = false;
    if (!ok) continue;
    const t = dist, x = plan.x + dx * t, z = plan.z + dz * t;
    return { x, z, y: plan.paths.get(`${x},${z}`) + 1, dx: -dx, dz: -dz, cx: plan.x, cz: plan.z, cy: plan.y };
  }
  return null;
}, [V.id, dist]);
const go = (x, y, z, ax, ay, az) => ev(([x, y, z, ax, ay, az]) => {
  const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; window.__bf.aimAt(ax, ay, az);
}, [x, y, z, ax, ay, az]);

// ---- 1. midday: the village gathers round the bell on the well (and a villager's card)
if (PARTS.includes('gather')) {
  const G = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id), mp = g.villages.meetingPoint(id);
    for (const e of g.entities.list) if (e.mobType === 'sentinel' && e.villageId === id) e.setPos(plan.x + 0.5, plan.y + 1, plan.z - 20.5);
    g.dayNight.time = 5700;
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed);
    for (const v of vs) { v.modeTimer = 1; v.path = null; v.fear = 0; v.alarm = 0; v.sleeping = false; }
    for (let i = 0; i < 900; i++) g.tick();
    return { mp, near: vs.filter((v) => Math.hypot(v.x - mp.x, v.z - mp.z) < 6).map((v) => ({ id: v.id, x: v.x, z: v.z, job: v.job })) };
  }, V.id);
  console.log('gather', JSON.stringify(G));
  await freezeAll();
  // stand back on a street, 8 blocks out, looking at the well; aim at the gathered villager nearest the view (its card shows)
  const S = await streetView(8);
  const C = await ev(([S, near]) => {
    const v = near.map((n) => ({ ...n, d: Math.hypot(n.x - S.x - 0.5, n.z - S.z - 0.5) })).sort((a, b) => a.d - b.d)[0];
    return { ...S, v };
  }, [S, G.near]);
  console.log('camera', JSON.stringify(C));
  await go(C.x + 0.5, C.y + 0.9, C.z + 0.5, G.mp.x + 0.5, G.mp.y - 1, G.mp.z + 0.5);
  await hold(null);
  await settle();
  await ev(([t, y]) => { window.__bf.aimAt(t.x, y, t.z); }, [C.v, C.y + 1.1]);
  await fast(4);
  await wait(800);
  await shot('vl01_gather');
  await unfreezeAll();
}

// ---- 2. children playing by the well
if (PARTS.includes('children')) {
  const K = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id), st = g.villages.states.get(id);
    g.dayNight.time = 2600;
    // three children: food in store, and beds for them
    const out = [];
    for (let k = 0; k < 3; k++) {
      st.food = 30;
      let c = g.villages.birth(plan, true);
      if (!c) {   // (no free bed: a child anyway, for the picture)
        c = g.entities.spawnMob('villager', plan.x + 3.5, plan.y + 1, plan.z + 0.5 + k, g);
        c.villageId = id; c.makeChild(20000);
      }
      c.childAge = 14000 + k * 3000;
      out.push(c.id);
    }
    return { kids: out, x: plan.x, y: plan.y, z: plan.z };
  }, V.id);
  // put them on the street in front of the well, playing, with two grown-ups watching
  const S = await streetView();
  await ev(([K, S]) => {
    const g = window.__bf.game;
    const px = -S.dz, pz = S.dx;            // across the street
    const at = (along, across) => [K.x + 0.5 - S.dx * along + px * across, K.z + 0.5 - S.dz * along + pz * across];
    const spots = [at(4.2, -1.2), at(5.0, 0.6), at(3.6, 1.4)];
    const ground = (x, z) => g.world.highestSolid(Math.floor(x), Math.floor(z)) + 1;
    K.kids.forEach((cid, i) => { const c = g.entities.list.find((e) => e.id === cid); const [x, z] = spots[i]; c.setPos(x, ground(x, z), z); c.yaw = Math.PI * (0.3 + i * 0.6); });
    const adults = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === K.id && e.alive && !e.isChild).slice(0, 2);
    adults.forEach((a, i) => { const [x, z] = at(3.2, i ? 2.6 : -2.6); a.setPos(x, ground(x, z), z); a.yaw = Math.atan2(-(spots[1][0] - x), -(spots[1][1] - z)); a.sleeping = false; });
  }, [{ ...K, id: V.id }, S]);
  await freezeAll();
  const kc = await ev(([cid]) => { const c = window.__bf.game.entities.list.find((e) => e.id === cid); return { x: c.x, y: c.y, z: c.z }; }, [K.kids[1]]);
  await go(S.x + 0.5, S.y + 0.6, S.z + 0.5, kc.x, kc.y + 0.6, kc.z);
  await hold('apple');
  await settle();
  await ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [kc.x, kc.y + 0.55, kc.z]);
  await fast(4);
  await wait(800);
  await shot('vl02_children');
  await unfreezeAll();
}

// ---- 3. a Dungeon Map from the Mapmaker: the map screen, and the compass while holding it
if (PARTS.includes('map')) {
  const M = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id);
    let v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.job === 'mapmaker' && e.alive);
    if (!v) { v = g.entities.spawnMob('villager', plan.x + 3.5, plan.y + 1, plan.z + 0.5, g); v.villageId = id; v.setJob('mapmaker'); }
    v.gainXp(20);
    g.inventory.slots.fill(null);
    const i = v.trades.findIndex((t) => t.result[0] === 'dungeon_map');
    g.trade(v, i);
    const slot = g.inventory.slots.findIndex((s) => s && s.id === 'dungeon_map');
    g.inventory.selected = slot; g.inventory.changed();
    return g.inventory.slots[slot].map;
  }, V.id);
  console.log('map', JSON.stringify(M));
  // stand on a rise some way off, facing roughly towards it
  await ev((t) => {
    const g = window.__bf.game, p = g.player;
    const x = t.x - 70, z = t.z + 40;
    p.flying = true;
    g.teleport(x + 0.5, g.world.generator.column(x, z).height + 3, z + 0.5);
    p.yaw = Math.atan2(-(t.x - x), -(t.z - z)) + 0.35; p.pitch = -0.12;
  }, M);
  await settle();
  await fast(8);
  await wait(600);
  await shot('vl04_compass');
  await ev(() => { const g = window.__bf.game; g.useMap(g.inventory.selected); });
  await wait(1500);
  await shot('vl03_map');
  await ev(() => window.__bf.engine.closeOverlay());
}

// ---- 4. ringing the bell at dusk: villagers hurry home, a Shambler behind a house glows through the wall
if (PARTS.includes('glow')) {
  const S = await streetView(9);
  const R = await ev(([id, S]) => {
    const g = window.__bf.game, plan = g.villages.plan(id), bell = g.villages.bellOf(plan);
    g.dayNight.time = 12300;
    // two Shamblers and a Crawler lurking in the ground beside the street, between the player and the well
    const px = -S.dz, pz = S.dx;            // across the street
    const mobs = [];
    for (const [type, along, across, dy] of [['shambler', 3.5, -2.6, -3], ['shambler', 5.5, 2.4, -3], ['crawler', 4.6, -0.2, -2]]) {
      const x = Math.floor(S.x + S.dx * along + px * across), z = Math.floor(S.z + S.dz * along + pz * across);
      const y = g.world.highestSolid(x, z) + dy;
      const m = g.entities.spawnMob(type, x + 0.5, y, z + 0.5, g);
      m.persistent = true; m.yaw = Math.atan2(S.dx, S.dz) + (Math.random() - 0.5);
      m._tick = m.tick; m.tick = function () { this.beginTick(); if (this.glowTicks > 0) this.glowTicks--; };
      mobs.push({ x: m.x, y: m.y, z: m.z });
    }
    window.__bf.ui.set({ chat: [] });
    g.villages.ring(bell.x, bell.y, bell.z);
    for (let i = 0; i < 40; i++) g.tick();
    return { bell, mobs, glow: g.entities.list.filter((e) => e.glowTicks > 0).length };
  }, [V.id, S]);
  console.log('glow', JSON.stringify(R));
  // standing on the street, a little raised, looking down the street towards the well: the monsters show through the ground
  const mid = R.mobs.reduce((a, m) => ({ x: a.x + m.x / 3, y: a.y + m.y / 3, z: a.z + m.z / 3 }), { x: 0, y: 0, z: 0 });
  await go(S.x + 0.5, S.y + 1.6, S.z + 0.5, mid.x, mid.y + 0.4, mid.z);
  await hold(null);
  await settle();
  await ev(() => {
    for (const e of window.__bf.game.entities.list) if (e.glowTicks > 0) e.glowTicks = 600;
    const keep = window.__bf.ui.get().chat.filter((c) => /bell rings/.test(c.text));
    window.__bf.ui.set({ chat: keep });
  });
  await fast(2);
  await wait(800);
  await shot('vl05_glow', true);
}

await b.close();
