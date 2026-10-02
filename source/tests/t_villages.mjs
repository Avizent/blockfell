// Tests for 1.2: farming, villages, villagers, professions, trading, the
// Sentinel and night raids. Run against the dev server: node tests/t_villages.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, typeof info === 'string' ? info : JSON.stringify(info)]); console.log(ok ? 'PASS' : 'FAIL', name); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 5000); };
/** Runs the simulation n ticks straight away (no rendering in between). */
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(640, 360); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(640, 360, { button: 'right' }); await ticks(3); await wait(100); };
const lclick = async () => { await centre(); await page.mouse.click(640, 360); await ticks(3); await wait(100); };
const run = (name) => !only || only.includes(name);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Village Test');
await page.fill('[data-testid=world-seed]', 'villages');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
await wait(2500);

const give = (id, slot = 0, count = 64) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const blockAt = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const setB = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const tp = (x, y, z, yaw = 0, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.yaw = yaw; g.player.pitch = pitch; g.player.vx = g.player.vy = g.player.vz = 0; }, [x, y, z, yaw, pitch]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const count = (id) => ev((id) => window.__bf.game.inventory.countItem(id), id);
const setMode = (m) => ev((m) => { const g = window.__bf.game; g.player.gameMode = m; g.player.flying = false; }, m);
const clearInv = () => ev(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.changed(); });

// A flat grass test area 3 blocks above the ground at spawn, open to the sky.
const base = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.rules.doMobSpawning = false;
  g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true);   // keep the sky clear for these tests
  for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 3;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
    bf.setBlock(x0 + dx, y - 1, z0 + dz, 'stone');
    bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
    for (let k = 1; k <= 8; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  g.player.gameMode = 'survival'; g.player.flying = false;
  g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  g.dayNight.time = 1000;
  return { x: x0, y, z: z0 };
});
await wait(1500);
const Y = base.y + 1;

// ------------------------------------------------------------------ farming
if (run('farming')) {
  const fx = base.x, fz = base.z - 3;
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await give('wooden_hoe', 0, 1);
  await aim(fx + 0.5, base.y + 1, fz + 0.5);
  await rclick();
  check('a hoe turns grass into farmland', (await blockAt(fx, base.y, fz)) === 'farmland', await blockAt(fx, base.y, fz));
  await give('wheat_seeds', 1, 10);
  await aim(fx + 0.5, base.y + 1, fz + 0.5);
  await rclick();
  check('seeds are planted on farmland', (await blockAt(fx, base.y + 1, fz)) === 'wheat:0', await blockAt(fx, base.y + 1, fz));
  // seeds do not go on grass
  await aim(fx + 2.5, base.y + 1, fz + 0.5);
  await rclick();
  check('seeds cannot be planted on plain grass', (await blockAt(fx + 2, base.y + 1, fz)) === 'air', await blockAt(fx + 2, base.y + 1, fz));
  check('planting uses up a seed', (await count('wheat_seeds')) === 9, await count('wheat_seeds'));
  // bone meal
  await give('bone_meal', 2, 8);
  await aim(fx + 0.5, base.y + 1.1, fz + 0.5);
  await rclick();
  const st = await blockAt(fx, base.y + 1, fz);
  check('bone meal makes a crop grow', st !== 'wheat:0' && st.startsWith('wheat:'), st);
  // moisture: water within 4 blocks makes farmland moist
  await setB(fx + 3, base.y, fz, 'water');
  await ev(([x, y, z]) => { const g = window.__bf.game; for (let i = 0; i < 3; i++) g.randomTick(x, y, z, window.__bf.B.blockByKey(window.__bf.getBlock(x, y, z)).id); }, [fx, base.y, fz]);
  check('farmland near water becomes moist', (await blockAt(fx, base.y, fz)) === 'farmland_moist', await blockAt(fx, base.y, fz));
  // growth by random ticks (needs light)
  const grown = await ev(([x, y, z]) => {
    const bf = window.__bf, g = bf.game;
    for (let i = 0; i < 200 && bf.getBlock(x, y, z) !== 'wheat:7'; i++) g.randomTick(x, y, z, bf.B.blockByKey(bf.getBlock(x, y, z)).id);
    return bf.getBlock(x, y, z);
  }, [fx, base.y + 1, fz]);
  check('crops grow to full size with random ticks', grown === 'wheat:7', grown);
  const dark = await ev(([x, y, z]) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(x, y, z, 'wheat:2');
    g.world.getLight = ((orig) => { g.__origLight = orig; return () => 0; })(g.world.getLight.bind(g.world));
    for (let i = 0; i < 100; i++) g.randomTick(x, y, z, bf.B.blockByKey(bf.getBlock(x, y, z)).id);
    g.world.getLight = g.__origLight;
    const r = bf.getBlock(x, y, z);
    bf.setBlock(x, y, z, 'wheat:7');
    return r;
  }, [fx, base.y + 1, fz]);
  check('crops do not grow in the dark', dark === 'wheat:2', dark);
  // harvest a ripe crop
  await clearInv();
  await give('dirt', 8, 1);
  await aim(fx + 0.5, base.y + 1.1, fz + 0.5);
  await lclick();
  await ticks(10);
  await tp(fx + 0.5, Y, fz + 0.5, 0, 0);
  await ticks(20); await wait(300);
  const wheat = await count('wheat'), seeds = await count('wheat_seeds');
  check('ripe wheat drops wheat and seeds', wheat >= 1 && seeds >= 1, { wheat, seeds });
  // carrots
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await give('carrot', 1, 4);
  await aim(fx + 0.5, base.y + 1, fz + 0.5);
  await rclick();
  check('carrots are planted on farmland', (await blockAt(fx, base.y + 1, fz)) === 'carrots:0', await blockAt(fx, base.y + 1, fz));
  // trampling: jumping down onto farmland turns it back into dirt
  await setB(fx, base.y + 1, fz, 'air');
  await tp(fx + 0.5, base.y + 3.5, fz + 0.5, 0, 0);
  await fast(40);
  check('falling onto farmland tramples it', (await blockAt(fx, base.y, fz)) === 'dirt', await blockAt(fx, base.y, fz));
  // dry farmland with nothing planted turns back into dirt
  await setB(fx + 3, base.y, fz, 'grass');
  await setB(fx - 3, base.y, fz, 'farmland');
  const dried = await ev(([x, y, z]) => {
    const bf = window.__bf, g = bf.game;
    for (let i = 0; i < 200 && bf.getBlock(x, y, z) !== 'dirt'; i++) g.randomTick(x, y, z, bf.B.blockByKey(bf.getBlock(x, y, z)).id);
    return bf.getBlock(x, y, z);
  }, [fx - 3, base.y, fz]);
  check('dry, empty farmland turns back into dirt', dried === 'dirt', dried);
  // a shovel makes a village path
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await give('wooden_shovel', 0, 1);
  await aim(base.x + 2.5, base.y + 1, base.z + 0.5);
  await rclick();
  check('a shovel turns grass into a village path', (await blockAt(base.x + 2, base.y, base.z)) === 'path', await blockAt(base.x + 2, base.y, base.z));
  // recipes
  const rec = await ev(async () => {
    const { recipes } = await import('/src/crafting/recipes.ts');
    const W = { id: 'wheat', count: 1 }, P = { id: 'planks', count: 1 };
    const r = (grid, w) => { const m = recipes.match(grid, w); return m ? m.result.id ?? m.result[0] : null; };
    return {
      bread: r([W, W, W, null, null, null, null, null, null], 3),
      hay: r([W, W, W, W, W, W, W, W, W], 3),
      bin: r([P, null, P, P, W, P, P, P, P], 3),
    };
  });
  check('bread, hay bales and grain bins can be crafted', rec.bread === 'bread' && rec.hay === 'hay_bale' && rec.bin === 'grain_bin', rec);
  await setB(base.x - 3, base.y, base.z + 3, 'farmland');
  await shot('v_farming');
}

// ------------------------------------------------------------------ villages
const V = await ev(() => {
  const vp = window.__bf.game.world.generator.villages;
  for (let r = 0; r <= 4; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
    const p = vp.planForRegion(rx, rz);
    if (p) return { id: p.id, x: p.x, z: p.z, y: p.y, style: p.style, radius: p.radius, beds: p.buildings.filter((b) => b.bed).length, jobs: p.buildings.filter((b) => b.job).length, n: p.buildings.length };
  }
  return null;
});
check('new worlds generate villages', !!V && V.n >= 5, V);
const gv = await ev(() => window.__bf.game.world.genVersion);
check('new worlds use terrain version 3 or later (villages on)', gv >= 3, gv);
if (run('compat')) {
  const compat = await ev(async () => {
    const { World } = await import('/src/world/World.ts');
    const a = new World('villages', true, 2), c = new World('villages', false, 3), d = new World('villages', true, 1);
    return { v2: a.generator.villages === null, noStructures: c.generator.villages === null, v1: d.generator.villages === null };
  });
  check('worlds from 1.0/1.1 and worlds without structures get no villages', compat.v2 && compat.noStructures && compat.v1, compat);
}

const vill = () => ev((id) => {
  const g = window.__bf.game;
  return g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed).map((e) => ({ id: e.id, job: e.job, x: e.x, y: e.y, z: e.z, sleep: e.sleeping, home: e.home, work: e.work, level: e.level }));
}, V.id);
const sentinels = () => ev((id) => window.__bf.game.entities.list.filter((e) => e.mobType === 'sentinel' && e.villageId === id && e.alive && !e.removed).map((e) => ({ x: e.x, y: e.y, z: e.z, angry: e.angry })), V.id);

if (V) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.player.flying = true; g.teleport(x + 0.5, y + 12, z + 0.5); }, [V.x, V.y, V.z]);
  await waitFor(async () => (await ev((id) => !!window.__bf.game.villages.states.get(id)?.populated, V.id)), 60000);
  for (let i = 0; i < 40; i++) { await wait(500); const q = await ev(() => window.__bf.state().chunks.meshQueue); if (q === 0 && i > 4) break; }
}

if (V && run('structure')) {
  const s = await ev((id) => {
    const bf = window.__bf, g = bf.game, plan = g.villages.plan(id);
    let beds = 0, stations = 0, doors = 0, paths = 0, pathCells = 0;
    for (const b of plan.buildings) {
      if (b.bed && bf.getBlock(b.bed.x, b.bed.y, b.bed.z).startsWith('bed:foot')) beds++;
      if (b.work && bf.B.professionOfBlock(g.world.getBlock(b.work.x, b.work.y, b.work.z)) === b.job) stations++;
    }
    for (const [k, y] of plan.paths) { const [x, z] = k.split(',').map(Number); pathCells++; if (bf.getBlock(x, y, z) === 'path') paths++; }
    for (let x = plan.x - plan.radius; x <= plan.x + plan.radius; x++) for (let z = plan.z - plan.radius; z <= plan.z + plan.radius; z++) for (let y = plan.y - 8; y <= plan.y + 10; y++) {
      if (bf.getBlock(x, y, z).startsWith('oak_door:lower')) doors++;
    }
    const bedsPlanned = plan.buildings.filter((b) => b.bed).length, jobsPlanned = plan.buildings.filter((b) => b.job).length;
    return { beds, bedsPlanned, stations, jobsPlanned, doors, paths, pathCells, well: plan.buildings.some((b) => b.kind === 'well'), farms: plan.buildings.filter((b) => b.kind === 'farm').length };
  }, V.id);
  check('village houses have beds where the plan says', s.beds === s.bedsPlanned && s.beds > 0, s);
  check('workplaces have the right workstation', s.stations === s.jobsPlanned && s.stations > 0, s);
  check('houses have doors', s.doors >= s.bedsPlanned, s);
  check('streets are paved with village path', s.paths / s.pathCells > 0.8, s);
  check('village has a well and farm plots', s.well && s.farms >= 1, s);
  const crops = await ev((id) => {
    const bf = window.__bf, g = bf.game, plan = g.villages.plan(id);
    let crops = 0, farmland = 0;
    for (const b of plan.buildings) if (b.kind === 'farm') for (let x = b.x0; x < b.x0 + 12; x++) for (let z = b.z0; z < b.z0 + 12; z++) {
      const k = bf.getBlock(x, b.y + 1, z), f = bf.getBlock(x, b.y, z);
      if (k.startsWith('wheat:') || k.startsWith('carrots:')) crops++;
      if (f.startsWith('farmland')) farmland++;
    }
    return { crops, farmland };
  }, V.id);
  check('farm plots are planted', crops.crops > 5 && crops.farmland > 5, crops);
}

if (V && run('population')) {
  const vs = await vill(), ss = await sentinels();
  check('villagers move in when a village first loads (one per bed)', vs.length === V.beds, { villagers: vs.length, beds: V.beds });
  check('villagers with a workplace have its profession', vs.filter((v) => v.job).length === V.jobs, { jobs: vs.filter((v) => v.job).map((v) => v.job), planned: V.jobs });
  check('each villager has its own bed', new Set(vs.map((v) => v.home && `${v.home.x},${v.home.y},${v.home.z}`)).size === vs.length, vs.map((v) => v.home));
  check('a Sentinel guards the village', ss.length === 1, ss);
  // populating is remembered: reloading the chunk does not add more villagers
  await ev((id) => { const g = window.__bf.game, p = g.villages.plan(id); g.villages.onChunkLoaded(g.world.getChunk(Math.floor(p.x / 16), Math.floor(p.z / 16))); }, V.id);
  check('a village is only populated once', (await vill()).length === V.beds && (await sentinels()).length === 1);
}

if (V && run('routine')) {
  // no surprise raid while watching the daily routine
  await ev((id) => { const g = window.__bf.game; g.dayNight.time = 2000; g.villages.states.get(id).lastRaidDay = g.dayNight.day; }, V.id);
  const before = await vill();
  await fast(300);
  const after = await vill();
  const moved = after.filter((a) => { const o = before.find((b) => b.id === a.id); return o && Math.hypot(o.x - a.x, o.z - a.z) > 1; }).length;
  check('villagers walk around the village by day', moved >= Math.ceil(after.length / 3), { moved, of: after.length });
  const workers = await ev((id) => window.__bf.game.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.work).map((e) => Math.hypot(e.x - e.work.x - 0.5, e.z - e.work.z - 0.5)), V.id);
  // over a minute of village life, who is seen working at their own workstation?
  const near = await ev((id) => {
    const g = window.__bf.game; const seen = new Set();
    for (let k = 0; k < 16; k++) {
      for (let i = 0; i < 100; i++) g.tick();
      for (const e of g.entities.list) if (e.mobType === 'villager' && e.villageId === id && e.work && e.mode === 'working' && Math.hypot(e.x - e.work.x - 0.5, e.z - e.work.z - 0.5) < 2.5) seen.add(e.id);
    }
    return seen.size;
  }, V.id);
  check('villagers go to work at their workstations', near >= 2, { near, workers: workers.length });
  await shot('v_day');
  // evening: everyone walks home; at night they sleep
  await ev(() => { window.__bf.game.dayNight.time = 11700; });
  await fast(700);
  const eve = await vill();
  const home = eve.filter((v) => v.home && Math.hypot(v.x - v.home.x - 0.5, v.z - v.home.z - 0.5) < 3).length;
  check('villagers walk home in the evening', home >= eve.length - 1, { home, of: eve.length });
  await ev(() => { window.__bf.game.dayNight.time = 13000; });
  await fast(200);
  const night = await vill();
  const asleep = night.filter((v) => v.sleep).length;
  check('villagers sleep in their beds at night', asleep >= night.length - 1, { asleep, of: night.length });
  const openDoors = await ev((id) => {
    const bf = window.__bf, plan = bf.game.villages.plan(id); let open = 0, all = 0;
    for (let x = plan.x - plan.radius; x <= plan.x + plan.radius; x++) for (let z = plan.z - plan.radius; z <= plan.z + plan.radius; z++) for (let y = plan.y - 8; y <= plan.y + 10; y++) {
      const k = bf.getBlock(x, y, z); if (k.startsWith('oak_door:lower')) { all++; if (k.includes(':o:')) open++; }
    }
    return { open, all };
  }, V.id);
  check('villagers close the doors behind them', openDoors.open === 0, openDoors);
  // a look inside a house at night
  const inside = await ev((id) => {
    const g = window.__bf.game;
    const v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.sleeping);
    if (!v) return null;
    return { x: v.home.x, y: v.home.y, z: v.home.z };
  }, V.id);
  if (inside) {
    const spot = await ev(([x, y, z]) => {
      const bf = window.__bf;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const bx = x + dx, bz = z + dz;
        if (bf.getBlock(bx, y, bz) === 'air' && bf.getBlock(bx, y + 1, bz) === 'air') return [bx, bz];
      }
      return null;
    }, [inside.x, inside.y, inside.z]);
    if (spot) {
      await ev(([x, y, z, bx, bz]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(bx + 0.5, y + 0.2, bz + 0.5); window.__bf.aimAt(x + 0.5, y + 0.5, z + 0.5); }, [inside.x, inside.y, inside.z, spot[0], spot[1]]);
      await wait(2500);
      await shot('v_sleeping');
    }
  }
  // morning: they wake up
  await ev(() => { window.__bf.game.dayNight.time = 23400; });
  await fast(40);
  const morning = await vill();
  check('villagers wake up in the morning', morning.every((v) => !v.sleep), morning.filter((v) => v.sleep).length);
  // a bed the player puts in the village brings a newcomer at dawn
  const nb = await ev((id) => {
    const bf = window.__bf, g = bf.game, plan = g.villages.plan(id), w = g.world;
    for (let r = 4; r < 30; r++) for (let a = 0; a < 16; a++) {
      const x = Math.round(plan.x + Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(plan.z + Math.sin(a / 16 * Math.PI * 2) * r);
      const y = w.highestSolid(x, z) + 1;
      if (w.highestSolid(x + 1, z) + 1 !== y || bf.getBlock(x, y - 1, z) === 'water' || plan.paths.has(x + ',' + z) || plan.paths.has(x + 1 + ',' + z)) continue;
      if (bf.getBlock(x, y, z) !== 'air' || bf.getBlock(x + 1, y, z) !== 'air' || bf.getBlock(x, y + 1, z) !== 'air') continue;
      bf.setBlock(x, y, z, 'bed:foot:e'); bf.setBlock(x + 1, y, z, 'bed:head:e');
      return { x, y, z };
    }
    return null;
  }, V.id);
  const n0 = (await vill()).length;
  await ev(() => { window.__bf.game.dayNight.time = 24000 * 3 + 900; });
  await fast(120);
  const later = await vill();
  const newcomer = later.find((v) => nb && v.home && v.home.x === nb.x && v.home.y === nb.y && v.home.z === nb.z);
  check('a newcomer moves into a bed the player adds to the village', !!nb && later.length === n0 + 1 && !!newcomer, { nb, n0, n: later.length });
  await ev(() => { window.__bf.game.dayNight.time = 2000; });
}

// ------------------------------------------------------------------ jobs and trading (test area)
if (run('trading')) {
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 2000; });
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await setMode('survival');
  await ev((b) => { const bf = window.__bf; for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) { bf.setBlock(b.x + dx, b.y, b.z + dz, 'grass'); for (let k = 1; k <= 8; k++) bf.setBlock(b.x + dx, b.y + k, b.z + dz, 'air'); } }, base);
  await wait(500);
  // an unemployed villager from a spawn egg
  await give('spawn_villager', 0, 2);
  await aim(base.x + 0.5, base.y + 1, base.z - 3 + 0.5);
  await rclick();
  const vid = await ev(() => { const g = window.__bf.game; const v = g.entities.list.filter((e) => e.mobType === 'villager' && !e.villageId).pop(); return v ? v.id : null; });
  check('a villager spawn egg makes a villager', vid !== null, vid);
  const vget = () => ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); return v ? { job: v.job, level: v.level, xp: v.tradeXp, trades: v.trades.map((t) => ({ cost: t.cost, result: t.result, uses: t.uses, max: t.maxUses })), work: v.work, x: v.x, y: v.y, z: v.z } : null; }, vid);
  // right-clicking an unemployed villager does not open trades
  const lookAtV = async () => { const v = await vget(); await ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); v.tradingWith = true; }, vid); await fast(2); const w = await vget(); await aim(w.x, w.y + 1.2, w.z); };
  await ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); v.setPos(window.__bf.game.player.x, window.__bf.game.player.y, window.__bf.game.player.z - 2.5); }, vid);
  await lookAtV();
  await give('dirt', 0, 1);
  await rclick();
  check('an unemployed villager has nothing to trade', (await ev(() => window.__bf.state().overlay)) === null);
  await ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); v.tradingWith = false; }, vid);
  // placing a forge gives it the Smith profession
  await setB(base.x + 3, Y, base.z - 3, 'forge');
  await fast(260);
  let v = await vget();
  check('a villager takes the job of a nearby free workstation', v.job === 'smith' && v.work && v.work.x === base.x + 3, v);
  check('a new Smith has two Novice trades', v.trades.length === 2 && v.level === 1, v.trades);
  // trade screen
  await ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); v.setPos(window.__bf.game.player.x, window.__bf.game.player.y, window.__bf.game.player.z - 2.5); }, vid);
  await lookAtV();
  await rclick();
  const ov = await ev(() => window.__bf.state().overlay);
  check('right-clicking a villager with a job opens its trades', ov === 'trade', ov);
  const title = ov === 'trade' ? await page.textContent('[data-testid=trade-title]') : '';
  check('the trade screen shows profession and level', /Novice Smith/.test(title), title);
  await shot('v_trade');
  // make both offers affordable and trade offer 0 once
  v = await vget();
  await ev((trades) => { const g = window.__bf.game; g.inventory.slots.fill(null); let s = 9; for (const t of trades) { for (let k = 0; k < 4; k++) g.inventory.slots[s++] = { id: t.cost[0], count: 64 }; } g.inventory.slots[s++] = { id: 'amber', count: 64 }; g.inventory.changed(); }, v.trades);
  await wait(300);
  const t0 = v.trades[0];
  const beforeCost = await count(t0.cost[0]), beforeRes = await count(t0.result[0]);
  await page.click('[data-testid=trade-offer-0]');
  await ticks(2);
  const afterCost = await count(t0.cost[0]), afterRes = await count(t0.result[0]);
  check('a trade takes the price and gives the goods', beforeCost - afterCost === t0.cost[1] - (t0.cost[0] === t0.result[0] ? t0.result[1] : 0) && afterRes - beforeRes === t0.result[1] - (t0.cost[0] === t0.result[0] ? t0.cost[1] : 0), { t0, beforeCost, afterCost, beforeRes, afterRes });
  v = await vget();
  check('trading uses up an offer and gives the villager experience', v.trades[0].uses === 1 && v.xp > 0, v);
  // shift-click: trade as many as possible -> sold out and level up
  await page.keyboard.down('Shift');
  await page.click('[data-testid=trade-offer-0]');
  await page.keyboard.up('Shift');
  await ticks(2);
  v = await vget();
  check('shift-click trades until the offer is sold out', v.trades[0].uses === v.trades[0].max, v.trades[0]);
  check('villagers level up with trading and learn new offers', v.level >= 2 && v.trades.length >= 4, { level: v.level, n: v.trades.length });
  await wait(300);
  const title2 = await page.textContent('[data-testid=trade-title]');
  check('the level is shown on the trade screen', /Apprentice|Journeyman/.test(title2), title2);
  const cls = await page.getAttribute('[data-testid=trade-offer-0]', 'class');
  check('a sold-out offer is shown as unavailable', /disabled/.test(cls), cls);
  await shot('v_trade_levelled');
  const adv = await ev(() => window.__bf.game.progress.done.has('trade'));
  check('trading grants the "Fair Trade" advancement', adv);
  await page.keyboard.press('Escape'); await ticks(3);
  check('Escape closes the trade screen', (await ev(() => window.__bf.state().overlay)) === null);
  // walking away closes the trade screen
  await ev((id) => { const g = window.__bf.game; const v = g.entities.list.find((e) => e.id === id); v.setPos(g.player.x, g.player.y, g.player.z - 2); window.__bf.engine.openTrade(v); }, vid);
  await ticks(2);
  const opened = await ev(() => window.__bf.state().overlay);
  await ev((id) => { const g = window.__bf.game; const v = g.entities.list.find((e) => e.id === id); v.setPos(g.player.x + 12, g.player.y, g.player.z); }, vid);
  await ticks(3);
  check('the trade screen closes when the villager is left behind', opened === 'trade' && (await ev(() => window.__bf.state().overlay)) === null);
  // restock: the villager goes to its workstation during the day
  await fast(2400);
  v = await vget();
  check('villagers restock at their workstation', v.trades[0].uses === 0, v.trades[0]);
  // a second villager does not take a claimed workstation
  await give('spawn_villager', 0, 1);
  await aim(base.x - 2 + 0.5, base.y + 1, base.z - 1 + 0.5);
  await rclick();
  await fast(260);
  const second = await ev((id) => { const g = window.__bf.game; const v = g.entities.list.filter((e) => e.mobType === 'villager' && !e.villageId && e.id !== id).pop(); return v ? { job: v.job } : null; }, vid);
  check('a workstation serves only one villager', second && second.job === null, second);
  // a villager that never traded loses its job when its workstation is broken
  await setB(base.x - 5, Y, base.z - 5, 'mason_bench');
  await fast(260);
  const mason = await ev((id) => { const g = window.__bf.game; const v = g.entities.list.filter((e) => e.mobType === 'villager' && !e.villageId && e.id !== id).pop(); return v ? v.job : null; }, vid);
  await setB(base.x - 5, Y, base.z - 5, 'air');
  await fast(260);
  const jobless = await ev((id) => { const g = window.__bf.game; const v = g.entities.list.filter((e) => e.mobType === 'villager' && !e.villageId && e.id !== id).pop(); return v ? v.job : 'gone'; }, vid);
  check('an untraded villager loses its job with its workstation', mason === 'mason' && jobless === null, { mason, jobless });
  // a villager who has traded keeps its profession
  await setB(base.x + 3, Y, base.z - 3, 'air');
  await fast(260);
  v = await vget();
  check('a villager who has traded keeps its profession', v.job === 'smith', v.job);
  await setB(base.x + 3, Y, base.z - 3, 'forge');
}

// ------------------------------------------------------------------ Sentinel & hostiles
if (V && run('sentinel')) {
  await ev((b) => { const g = window.__bf.game; g.dayNight.time = 14000; g.player.gameMode = 'creative'; g.player.flying = true; g.teleport(b.x + 0.5, b.y + 8, b.z + 6.5); }, base);
  await waitFor(async () => ev((b) => window.__bf.game.world.isLoaded(b.x + 8, b.z + 8) && window.__bf.game.world.isLoaded(b.x - 8, b.z - 8), base), 30000);
  await wait(500);
  // a Sentinel fights a shambler (open test area at night)
  const r = await ev((b) => {
    const g = window.__bf.game;
    g.player.gameMode = 'creative'; g.player.flying = true;
    g.teleport(b.x + 0.5, b.y + 8, b.z + 6.5);
    for (const e of g.entities.list) if (e.mobType === 'villager' && !e.villageId) e.setPos(b.x - 10.5, b.y + 1, b.z + 10.5);
    const s = g.entities.spawnMob('sentinel', b.x + 0.5, b.y + 1, b.z + 0.5, g);
    const m = g.entities.spawnMob('shambler', b.x + 6.5, b.y + 1, b.z + 0.5, g);
    m.persistent = true;
    const h0 = m.health;
    let hit = 0;
    for (let i = 0; i < 300 && m.alive && !m.removed; i++) { g.tick(); if (m.health < h0 && !hit) hit = i; }
    const out = { h0, h: m.health, alive: m.alive && !m.removed, hit, flung: m.vy };
    m.removed = true; s.removed = true;
    return out;
  }, base);
  check('the Sentinel fights hostile creatures', !r.alive || r.h < r.h0, r);
  // hostiles go after villagers at night
  const hunt = await ev((b) => {
    const g = window.__bf.game;
    for (const e of g.entities.list) if (e.mobType === 'villager' && !e.villageId) e.setPos(b.x - 10.5, b.y + 1, b.z + 10.5);
    const v = g.entities.spawnMob('villager', b.x + 0.5, b.y + 1, b.z + 0.5, g);
    const m = g.entities.spawnMob('shambler', b.x + 6.5, b.y + 1, b.z + 0.5, g);
    m.persistent = true;
    let targeted = false; const h0 = v.health;
    for (let i = 0; i < 300; i++) { g.tick(); if (m.targetEnt === v) targeted = true; }
    const out = { targeted, hurt: v.health < h0 || !v.alive, h: v.health, fled: Math.hypot(v.x - b.x - 0.5, v.z - b.z - 0.5) };
    m.removed = true; v.removed = true;
    return out;
  }, base);
  check('hostile creatures hunt villagers', hunt.targeted, hunt);
  check('villagers run from hostile creatures (or get hurt)', hunt.hurt || hunt.fled > 6, hunt);
  // hitting a villager makes the Sentinel angry at the player
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 10, z + 0.5); }, [V.x, V.y, V.z]);
  await wait(1500);
  await setMode('survival');
  const a0 = await ev((id) => {
    const g = window.__bf.game;
    const s = g.entities.list.find((e) => e.mobType === 'sentinel' && e.villageId === id && e.alive);
    const v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.alive);
    v.hurt(1, g, 0, 0, true);
    return s.angry;
  }, V.id);
  // carry on the quarrel on open, flat ground (the test area) so nothing is in the way
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); }, base);
  await waitFor(() => ev((b) => window.__bf.game.world.isLoaded(b.x + 8, b.z + 8) && window.__bf.game.world.isLoaded(b.x - 8, b.z - 8), base), 30000);
  const angry = await ev(([id, b, a]) => {
    const g = window.__bf.game;
    const s = g.entities.list.find((e) => e.mobType === 'sentinel' && e.villageId === id && e.alive);
    g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5);
    s.setPos(b.x + 4.5, b.y + 1, b.z + 0.5);
    g.player.health = 20;
    const h0 = g.player.health;
    for (let i = 0; i < 200 && g.player.health === h0; i++) g.tick();
    const out = { angry: a, hurt: h0 - g.player.health };
    const plan = g.villages.plan(id);
    s.setPos(plan.x + 4.5, plan.y + 2, plan.z + 0.5);
    return out;
  }, [V.id, base, a0]);
  check('attacking a villager angers the Sentinel', angry.angry > 0, angry);
  check('an angry Sentinel attacks the player', angry.hurt > 0, angry);
  await ev((id) => { const g = window.__bf.game; for (const e of g.entities.list) if (e.mobType === 'sentinel') e.angry = 0; g.player.health = 20; g.player.gameMode = 'creative'; }, V.id);
}

// ------------------------------------------------------------------ raids
if (V && run('raid')) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.player.flying = true; g.teleport(x + 0.5, y + 6, z + 0.5); g.dayNight.time = 13000; }, [V.x, V.y, V.z]);
  await waitFor(() => ev((v) => { const w = window.__bf.game.world, r = v.radius + 14; return w.isLoaded(v.x + r, v.z) && w.isLoaded(v.x - r, v.z) && w.isLoaded(v.x, v.z + r) && w.isLoaded(v.x, v.z - r); }, V), 60000);
  await wait(500);
  const started = await ev((id) => window.__bf.game.villages.startRaid(id), V.id);
  check('a raid can start at night', started);
  await fast(70);
  const r1 = await ev(() => { const r = window.__bf.game.villages.raid; return r ? { wave: r.wave, waves: r.waves, n: r.mobs.length, raiders: r.mobs.every((m) => !!m.raider) } : null; });
  check('raiders arrive in waves', r1 && r1.wave === 1 && r1.n >= 3 && r1.raiders, r1);
  await ticks(3); await wait(400);
  const bar = await ev(() => window.__bf.ui.get().raid);
  check('a raid bar shows the wave', !!bar && /Wave 1 of/.test(bar.label), bar);
  await shot('v_raid');
  // raiders march on the village
  const march = await ev((id) => {
    const g = window.__bf.game, plan = g.villages.plan(id), r = g.villages.raid;
    const d = () => r.mobs.reduce((a, m) => a + Math.hypot(m.x - plan.x, m.z - plan.z), 0) / r.mobs.length;
    const d0 = d();
    for (let i = 0; i < 200; i++) g.tick();
    return { d0, d1: d() };
  }, V.id);
  check('raiders march towards the village', march.d1 < march.d0 - 2, march);
  // defeat every wave
  const won = await ev((id) => {
    const g = window.__bf.game;
    let guard = 0;
    while (g.villages.raid && guard++ < 40) {
      for (const m of g.villages.raid.mobs) if (m.alive) m.hurt(1000, g, 0, 0, true);
      for (let i = 0; i < 130; i++) g.tick();
    }
    const st = g.villages.states.get(id);
    return { over: !g.villages.raid, hero: g.progress.done.has('hero'), rep: st.rep ?? 0, disc: g.discount(id), won: g.progress.stats.raids_won };
  }, V.id);
  check('defeating every wave wins the raid', won.over && won.won === 1, won);
  check('winning a raid grants "Hero of the Village" (and a big rise in standing, 1.8)', won.hero && won.rep >= 30, won);
  check('heroes get a discount from that village', won.disc > 0, won);
  const cost = await ev((id) => {
    const g = window.__bf.game;
    const v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.job);
    const t = { cost: ['amber', 10], result: ['stone', 1] };
    return { base: t.cost[1], now: g.tradeCost(v, t).cost[1] };
  }, V.id);
  check('amber prices are lower for a hero', cost.now < cost.base, cost);
  const bar2 = await ev(() => window.__bf.ui.get().raid);
  check('the raid bar goes away after the raid', bar2 === null, bar2);
}

// ------------------------------------------------------------------ save & reload
if (V && run('save')) {
  const snap = await ev((id) => {
    const g = window.__bf.game;
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id);
    const smith = g.entities.list.find((e) => e.mobType === 'villager' && !e.villageId && e.job === 'smith');
    return { n: vs.length, jobs: vs.map((v) => v.job).sort().join(','), smith: smith ? { level: smith.level, xp: smith.tradeXp, trades: smith.trades.length, work: smith.work } : null };
  }, V.id);
  const fl = await ev(() => { const g = window.__bf.game, p = g.player; const x = Math.floor(p.x) + 2, z = Math.floor(p.z) + 2, y = g.world.highestSolid(x, z) + 1; window.__bf.setBlock(x, y, z, 'farmland_moist'); window.__bf.setBlock(x, y + 1, z, 'wheat:5'); window.__bf.setBlock(x, y + 2, z, 'air'); return { x, y, z }; });
  await page.keyboard.press('Escape'); await wait(400);
  await page.click('[data-testid=btn-save-quit]');
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 20000);
  await page.click('[data-testid=btn-singleplayer]'); await wait(500);
  await page.locator('[data-testid=world-entry]', { hasText: 'Village Test' }).first().click();
  await page.click('[data-testid=btn-play-selected]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await wait(3000);
  const again = await ev((id) => {
    const g = window.__bf.game;
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id);
    const smith = g.entities.list.find((e) => e.mobType === 'villager' && !e.villageId && e.job === 'smith');
    const st = g.villages.states.get(id);
    return { n: vs.length, jobs: vs.map((v) => v.job).sort().join(','), smith: smith ? { level: smith.level, xp: smith.tradeXp, trades: smith.trades.length, work: smith.work } : null, populated: st?.populated, hero: (st?.rep ?? 0) >= 30, sentinels: g.entities.list.filter((e) => e.mobType === 'sentinel' && e.villageId === id).length };
  }, V.id);
  check('villagers are saved with the world', again.n === snap.n && again.jobs === snap.jobs, { snap, again });
  check('professions, levels and trades are saved', !!again.smith && JSON.stringify(again.smith) === JSON.stringify(snap.smith), { snap: snap.smith, again: again.smith });
  check('village state (populated, hero) is saved', again.populated === true && again.hero === true && again.sentinels === 1, again);
  const farm = [await blockAt(fl.x, fl.y, fl.z), await blockAt(fl.x, fl.y + 1, fl.z)];
  check('farmland and crops are saved', farm[0].startsWith('farmland') && farm[1].startsWith('wheat:'), farm);
}

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n===== VILLAGE RESULTS =====');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(64)} ${i.slice(0, 200)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
