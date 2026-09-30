// Screenshots and item icons for the 1.2 (villages) pages of the How-to-Play guide.
// node tests/guide_shots3.mjs  (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots3';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,village,farming,styles').split(',');
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
const settle = async () => { await wait(1200); await waitFor(() => ev(() => window.__bf.state().chunks.meshQueue === 0), 60000); await wait(800); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const time = (t) => ev((t) => { window.__bf.game.dayNight.time = t; }, t);
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); if (id) inv.slots[0] = { id, count: 1 }; inv.selected = 0; inv.changed(); }, id);
const view = (x, y, z, ax, ay, az) => ev(([x, y, z, ax, ay, az]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; window.__bf.aimAt(ax, ay, az); }, [x, y, z, ax, ay, az]);
const freeze = (ids) => ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.tick = function () { this.beginTick(); }; }, ids);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.2');
await page.fill('[data-testid=world-seed]', 'villages');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await page.mouse.move(640, 360);
await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true; });
await wait(2500);

// ---------------------------------------------------------------- item icons
if (PARTS.includes('icons')) {
  const ICON_IDS = ['wooden_hoe', 'stone_hoe', 'iron_hoe', 'wheat_seeds', 'wheat', 'carrot', 'bread', 'hay_bale', 'bone_meal', 'bone', 'amber',
    'grain_bin', 'forge', 'mason_bench', 'scribe_desk', 'fletching_bench', 'spawn_villager', 'spawn_sentinel', 'path', 'dirt', 'grass', 'water_bucket',
    'coal', 'raw_iron', 'stone', 'feather', 'flint', 'arrow', 'lumen', 'glass', 'furnace', 'cobblestone', 'planks', 'iron_ingot', 'leather', 'emerald'];
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

const findVillage = (style) => ev((style) => {
  const vp = window.__bf.game.world.generator.villages;
  for (let r = 0; r <= 9; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
    const p = vp.planForRegion(rx, rz);
    if (p && (!style || p.style === style)) return { id: p.id, x: p.x, z: p.z, y: p.y, style: p.style, radius: p.radius };
  }
  return null;
}, style);
const goVillage = async (V) => {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, y + 14, z + 0.5); }, [V.x, V.y, V.z]);
  await waitFor(async () => (await ev((id) => !!window.__bf.game.villages.states.get(id)?.populated, V.id)), 60000);
  await settle();
};

// ---------------------------------------------------------------- the village
if (PARTS.includes('village')) {
  const V = await findVillage('timber');
  console.log('village', JSON.stringify(V));
  await goVillage(V);
  await time(2500);
  await ev((id) => { const g = window.__bf.game; g.villages.states.get(id).lastRaidDay = g.dayNight.day; }, V.id);
  await fast(600);   // let people get out and about
  await hold(null);
  await view(V.x + 30, V.y + 24, V.z + 30, V.x - 2, V.y, V.z - 2);
  await settle();
  await shot('v01_village');

  // a street scene by the well: four villagers and the Sentinel
  const staged = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id);
    const well = plan.buildings.find((q) => q.kind === 'well');
    const folk = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id);
    const jobs = ['farmer', 'smith', 'scribe', 'fletcher', 'mason', null];
    const pick = [];
    for (const j of jobs) { const v = folk.find((f) => f.job === j && !pick.includes(f)); if (v) pick.push(v); if (pick.length === 4) break; }
    const s = g.entities.list.find((e) => e.mobType === 'sentinel' && e.villageId === id);
    // find a path cell south of the well to stand on
    const cells = [];
    for (const [k, y] of plan.paths) { const [x, z] = k.split(',').map(Number); cells.push({ x, y, z }); }
    const cx = well ? well.x0 + 2 : plan.x, cz = well ? well.z0 + 2 : plan.z;
    return { cx, cz, cy: (well ? well.y : plan.y), ids: pick.map((v) => v.id), sid: s?.id ?? null };
  }, V.id);
  console.log('staged', JSON.stringify(staged));
  // line them up on the ground in front of the camera
  await freeze([...staged.ids, staged.sid]);
  const line = await ev(([id, st]) => {
    const g = window.__bf.game, w = g.world;
    const spots = [];
    const ok = (x, z) => { const y = w.highestSolid(x, z) + 1; return { x, z, y }; };
    const base = ok(st.cx, st.cz + 5);
    const list = [...st.ids];
    const res = [];
    list.forEach((vid, i) => {
      const e = g.entities.list.find((q) => q.id === vid);
      const s = ok(st.cx - 3 + i * 2, st.cz + 6 + (i % 2));
      e.sleeping = false;
      e.setPos(s.x + 0.5, s.y, s.z + 0.5); e.prevX = e.x; e.prevY = e.y; e.prevZ = e.z;
      e.yaw = Math.PI + (i - 1.5) * 0.25; e.prevYaw = e.yaw; e.headYaw = (1.5 - i) * 0.15;
      res.push(s);
    });
    if (st.sid) {
      const s = g.entities.list.find((q) => q.id === st.sid);
      const p = ok(st.cx + 5, st.cz + 3);
      s.setPos(p.x + 0.5, p.y, p.z + 0.5); s.prevX = s.x; s.prevY = s.y; s.prevZ = s.z; s.yaw = 0.5; s.prevYaw = 0.5;
    }
    return { base, res };
  }, [V.id, staged]);
  await freeze([...staged.ids, staged.sid]);
  await hold('amber');
  await view(staged.cx + 0.5, line.base.y + 1.3, staged.cz + 13.5, staged.cx + 0.5, line.base.y + 1.1, staged.cz + 4.5);
  await settle();
  await shot('v02_villagers');

  // the Sentinel up close, on open ground at the edge of the village
  const sent = await ev(([id, st]) => {
    const g = window.__bf.game, w = g.world, plan = g.villages.plan(id);
    let best = null;
    for (let dx = 4; dx <= 14 && !best; dx++) {
      const x = plan.maxX + dx, z = plan.z;
      const hs = [];
      for (let ox = -3; ox <= 3; ox++) for (let oz = -4; oz <= 4; oz++) hs.push(w.highestSolid(x + ox, z + oz));
      if (Math.max(...hs) - Math.min(...hs) <= 1) best = { x, z, y: w.highestSolid(x, z) + 1 };
    }
    if (!best) best = { x: plan.maxX + 6, z: plan.z, y: w.highestSolid(plan.maxX + 6, plan.z) + 1 };
    const s = g.entities.list.find((q) => q.id === st.sid);
    s.setPos(best.x + 0.5, w.highestSolid(best.x, best.z) + 1, best.z + 0.5); s.prevX = s.x; s.prevY = s.y; s.prevZ = s.z; s.yaw = -Math.PI / 2 - 0.4; s.prevYaw = s.yaw;
    const v = g.entities.list.find((q) => q.id === st.ids[1]);
    v.setPos(best.x - 0.5, w.highestSolid(best.x - 1, best.z + 2) + 1, best.z + 2.5); v.prevX = v.x; v.prevY = v.y; v.prevZ = v.z; v.yaw = -Math.PI / 2 + 0.5; v.prevYaw = v.yaw;
    return best;
  }, [V.id, staged]);
  await view(sent.x + 6.5, sent.y + 1.4, sent.z + 1.5, sent.x, sent.y + 1.4, sent.z + 1.0);
  await settle();
  await shot('v03_sentinel');

  // trading: a farmer who has reached Apprentice
  const farmerId = await ev((ids) => {
    const g = window.__bf.game;
    const v = g.entities.list.find((e) => ids.includes(e.id) && e.job === 'farmer') ?? g.entities.list.find((e) => ids.includes(e.id) && e.job);
    v.gainXp(12);
    return v.id;
  }, staged.ids);
  await ev((vid) => {
    const g = window.__bf.game;
    g.setGameMode('survival');
    const inv = g.inventory; inv.slots.fill(null);
    inv.slots[0] = { id: 'amber', count: 23 }; inv.slots[1] = { id: 'wheat', count: 40 }; inv.slots[2] = { id: 'carrot', count: 18 }; inv.slots[3] = { id: 'bread', count: 5 };
    inv.slots[9] = { id: 'wheat_seeds', count: 30 }; inv.slots[10] = { id: 'iron_hoe', count: 1 };
    inv.selected = 0; inv.changed();
    const v = g.entities.list.find((e) => e.id === vid);
    window.__bf.aimAt(v.x, v.y + 1.5, v.z);
    window.__bf.engine.openTrade(v);
  }, farmerId);
  await wait(800);
  await page.hover('[data-testid=trade-offer-0]');
  await wait(400);
  await shot('v04_trade');
  await page.mouse.move(640, 360);
  await page.keyboard.press('Escape'); await wait(400);
  await ev(() => window.__bf.game.setGameMode('creative'));
  // unfreeze everybody
  await ev(() => { for (const e of window.__bf.game.entities.list) delete e.tick; });

  // the village farm with its farmer
  const farm = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id);
    const f = plan.buildings.find((q) => q.kind === 'farm');
    // ripen the crops for the picture
    const bf = window.__bf;
    for (let x = f.x0 - 1; x < f.x0 + 13; x++) for (let z = f.z0 - 1; z < f.z0 + 13; z++) {
      const k = bf.getBlock(x, f.y + 1, z);
      if (k.startsWith('wheat:')) bf.setBlock(x, f.y + 1, z, 'wheat:' + (5 + ((x + z) % 3)));
      if (k.startsWith('carrots:')) bf.setBlock(x, f.y + 1, z, 'carrots:3');
    }
    const v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.job === 'farmer');
    return { x0: f.x0, z0: f.z0, y: f.y, rot: f.rot, w: f.w, d: f.d, vid: v?.id };
  }, V.id);
  await ev((f) => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.id === f.vid);
    if (v) { v.setPos(f.x0 + 3.5, f.y + 1, f.z0 + 2.5); v.prevX = v.x; v.prevY = v.y; v.prevZ = v.z; }
  }, farm);
  if (farm.vid) await freeze([farm.vid]);
  await hold('wooden_hoe');
  const fc = await ev(([id, f]) => {
    const g = window.__bf.game, plan = g.villages.plan(id), b = plan.buildings.find((q) => q.kind === 'farm');
    const [ax, az] = [b.x0, b.z0];
    const wx = b.rot === 'e' || b.rot === 'w' ? b.d : b.w, wz = b.rot === 'e' || b.rot === 'w' ? b.w : b.d;
    const cx = ax + wx / 2, cz = az + wz / 2;
    const dx = cx - plan.x, dz = cz - plan.z, l = Math.hypot(dx, dz) || 1;
    return { cx, cz, ux: dx / l, uz: dz / l };
  }, [V.id, farm]);
  await view(fc.cx + fc.ux * 11 + fc.uz * 3, farm.y + 6, fc.cz + fc.uz * 11 - fc.ux * 3, fc.cx, farm.y + 1, fc.cz);
  await settle();
  await shot('v05_farm');
  await ev(() => { for (const e of window.__bf.game.entities.list) delete e.tick; });

  // sleeping villager
  await time(13200);
  await fast(900);
  const bed = await ev((id) => {
    const g = window.__bf.game, bf = window.__bf;
    const v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.sleeping);
    if (!v) return null;
    const { x, y, z } = v.home;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (bf.getBlock(x + dx, y, z + dz) === 'air' && bf.getBlock(x + dx, y + 1, z + dz) === 'air') return { x, y, z, sx: x + dx, sz: z + dz };
    }
    return null;
  }, V.id);
  if (bed) {
    await ev((b) => { const bf = window.__bf; bf.setBlock(b.sx, b.y + 2, b.sz, 'air'); }, bed);
    await hold('torch');
    await view(bed.sx + 0.5, bed.y + 0.4, bed.sz + 0.5, bed.x + 0.5, bed.y + 0.6, bed.z + 0.5);
    await settle();
    await shot('v06_sleeping');
  }

  // a night raid (photographed at sunset, so there is still some light)
  await time(13000);
  await ev((id) => { const g = window.__bf.game; g.villages.states.get(id).lastRaidDay = undefined; g.villages.startRaid(id); }, V.id);
  await fast(70);
  await fast(260);
  const rv = await ev((id) => {
    const g = window.__bf.game, r = g.villages.raid, plan = g.villages.plan(id);
    const m = r.mobs.filter((q) => q.alive).sort((a, b) => Math.hypot(a.x - plan.x, a.z - plan.z) - Math.hypot(b.x - plan.x, b.z - plan.z))[0];
    return m ? { x: m.x, y: m.y, z: m.z, px: plan.x, pz: plan.z, py: plan.y } : null;
  }, V.id);
  if (rv) {
    const dx = rv.x - rv.px, dz = rv.z - rv.pz, l = Math.hypot(dx, dz) || 1;
    await hold('iron_sword');
    await ev(() => window.__bf.game.setGameMode('survival'));
    await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.raider) e.tick = function () { this.beginTick(); }; g.player.health = 20; g.dayNight.time = 12150; });
    await view(rv.x - (dx / l) * 7, rv.y + 6, rv.z - (dz / l) * 7, rv.x + (dx / l) * 2, rv.y + 1, rv.z + (dz / l) * 2);
    await settle();
    await shot('v07_raid');
    await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) delete e.tick; g.villages.endRaid('', false); for (const e of g.entities.list) if (e.spec?.hostile) e.removed = true; g.setGameMode('creative'); });
  }
}

// ---------------------------------------------------------------- your own farm
if (PARTS.includes('farming')) {
  await time(3000);
  const site = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x0 = Math.floor(p.x) + 3, z0 = Math.floor(p.z) - 6;
    let y = 0;
    for (let dx = -3; dx <= 12; dx++) for (let dz = -3; dz <= 12; dz++) y = Math.max(y, g.world.highestSolid(x0 + dx, z0 + dz));
    for (let dx = -8; dx <= 16; dx++) for (let dz = -8; dz <= 16; dz++) {
      for (let k = y - 3; k < y; k++) bf.setBlock(x0 + dx, k, z0 + dz, 'dirt');
      bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
      for (let k = 1; k <= 12; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
    }
    // 9x9 field with a water channel down the middle
    for (let dx = 0; dx < 9; dx++) for (let dz = 0; dz < 9; dz++) {
      if (dx === 4) { bf.setBlock(x0 + dx, y, z0 + dz, 'water'); continue; }
      bf.setBlock(x0 + dx, y, z0 + dz, 'farmland_moist');
      const crop = dx < 4 ? 'wheat:' + Math.min(7, Math.floor(dz * 7 / 8)) : 'carrots:' + Math.min(3, Math.floor(dz / 2.5));
      if (dz > 0 || dx < 4) bf.setBlock(x0 + dx, y + 1, z0 + dz, crop);
    }
    for (let dz = 0; dz < 9; dz++) bf.setBlock(x0 + 9, y, z0 + dz, 'farmland');
    bf.setBlock(x0 - 2, y + 1, z0 + 2, 'hay_bale'); bf.setBlock(x0 - 2, y + 1, z0 + 3, 'hay_bale'); bf.setBlock(x0 - 2, y + 2, z0 + 2, 'hay_bale');
    bf.setBlock(x0 - 2, y + 1, z0 + 5, 'grain_bin');
    return { x0, y, z0 };
  });
  await hold('wooden_hoe');
  await ev(() => window.__bf.game.setGameMode('survival'));
  await view(site.x0 + 4.5, site.y + 4.2, site.z0 + 14.5, site.x0 + 4.5, site.y, site.z0 + 4);
  await settle();
  await shot('v08_farming');
  await ev(() => window.__bf.game.setGameMode('creative'));
}

// ---------------------------------------------------------------- other village styles
if (PARTS.includes('styles')) {
  for (const style of ['sandstone', 'spruce']) {
    const V = await findVillage(style);
    console.log(style, JSON.stringify(V));
    if (!V) continue;
    await time(3000);
    await goVillage(V);
    await ev((id) => { const g = window.__bf.game; g.villages.states.get(id).lastRaidDay = g.dayNight.day; }, V.id);
    await fast(400);
    await hold(null);
    await view(V.x + 26, V.y + 18, V.z - 26, V.x, V.y, V.z);
    await settle();
    await shot(`v09_style_${style}`);
  }
}

await b.close();
