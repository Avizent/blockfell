// Tests for 2.0 "the Cinderdeep": the new blocks, items and recipes, the Cinderdeep's
// landscape (caverns over a lava sea, Ember Ore, Fire Opal, Glowcaps, Ember Shrines),
// lighting and going through a Deepgate and back, the rules down there (no water, no
// sleeping, maps, waking up on the surface), the Cinderling and the Smoulderer, the
// Cinder Charm, and saving a world with two dimensions.
// node tests/t_v20.mjs   (dev server)   ONLY=items,gen,gate,travel,rules,mobs,save,shrine
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import zlib from 'node:zlib';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'gen', 'gate', 'travel', 'rules', 'mobs', 'save', 'shrine'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720, CX = VW / 2, CY = VH / 2;
const errors = [];
const page = await b.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const give = (id, slot = 0, count = 1) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const screen = () => ev(() => window.__bf?.state().screen);
const dim = () => ev(() => window.__bf.game?.dim);
const chat = () => ev(() => window.__bf.ui.get().chat.map((c) => c.text));
const clearChat = () => ev(() => window.__bf.ui.set({ chat: [] }));
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(400); };
const inGame = async () => { await waitFor(async () => (await screen()) === 'game', 90000); await ev(() => window.__bf.allowUnlocked(true)); await settle(); };
const calm = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
  for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
});

async function newWorld(name, seed, creative = false) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', seed);
  if (creative) await page.click('[data-testid=btn-gamemode]');
  await page.click('[data-testid=btn-create-world]');
  await inGame();
  await calm();
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await wait(500);
  return ev(() => window.__bf.game.record.id);
}

/** A ring of eight Cinderstone on flat ground in front of the player; returns its centre. */
const makeRing = (material = 'cinderstone') => ev((material) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 4, z = Math.floor(p.z);
  const y = Math.floor(p.y);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    bf.setBlock(x + dx, y - 1, z + dz, 'stone');
    for (let dy = 0; dy <= 4; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
  }
  for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) bf.setBlock(x + dx, y, z + dz, material);
  p.flying = false;
  g.teleport(x - 2.5 + 0.5, y + 1, z + 0.5);
  return { x, y, z };
}, material);

await page.goto(URL);
await page.mouse.move(CX, CY);

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const B = await import('/src/world/BlockRegistry.ts');
    const I = await import('/src/inventory/ItemRegistry.ts');
    const T = await import('/src/meshing/textureNames.ts');
    const keys = ['ashrock', 'ash', 'ember_ore', 'fire_opal_ore', 'glowcap', 'ashrock_bricks', 'ember_lamp', 'deepgate'];
    return {
      ids: keys.map((k) => B.blockByKey(k)?.id ?? -1),
      tex: keys.map((k) => T.TEXTURE_NAMES.includes(k)), layers: T.TEXTURE_NAMES.length,
      light: [B.EMBER_LAMP, B.GLOWCAP, B.DEEPGATE, B.EMBER_ORE].map((i) => B.LIGHT_EMISSION[i]),
      gate: { solid: B.IS_SOLID[B.DEEPGATE], hard: B.getBlock(B.DEEPGATE).hardness, item: B.getBlock(B.DEEPGATE).item },
      items: ['ember', 'fire_opal', 'cinder_charm', 'spawn_cinderling', 'spawn_smoulderer', 'ashrock', 'ember_lamp'].map((i) => I.hasItem(i)),
      emberFuel: I.getItem('ember').fuel, coalFuel: I.getItem('coal').fuel,
      smelt: [I.getItem('ember_ore').smelt?.result, I.getItem('fire_opal_ore').smelt?.result],
      opalTier: B.getBlock(B.FIRE_OPAL_ORE).minTier, emberDrop: B.getBlock(B.EMBER_ORE).drops[0],
    };
  });
  check('blocks: Ashrock, Ash, Ember Ore, Fire Opal Ore, Glowcap, Ashrock Bricks, Ember Lamp, Deepgate are blocks 257-264 (above the old 8-bit limit)',
    JSON.stringify(t.ids) === JSON.stringify([257, 258, 259, 260, 261, 262, 263, 264]), t.ids);
  check('blocks: each has its own texture (layers stay below 256)', t.tex.every(Boolean) && t.layers < 256, { tex: t.tex, layers: t.layers });
  check('blocks: Ember Lamp shines 15, Glowcap 10, the Deepgate 11, Ember Ore glows 5', JSON.stringify(t.light) === '[15,10,11,5]', t.light);
  check('blocks: a Deepgate can be walked into, can\'t be mined and is never an item', t.gate.solid === 0 && t.gate.hard < 0 && t.gate.item === null, t.gate);
  check('items: Ember, Fire Opal, Cinder Charm and the two spawn eggs exist', t.items.every(Boolean), t.items);
  check('items: Ember burns 3x as long as coal; Ember Ore smelts to Ember, Fire Opal Ore to Fire Opal; Fire Opal needs an iron pickaxe',
    t.emberFuel === 3 * t.coalFuel && t.smelt[0] === 'ember' && t.smelt[1] === 'fire_opal' && t.opalTier === 2 && t.emberDrop.item === 'ember', t);
  const r = await ev(() => {
    const bf = window.__bf;
    return {
      bricks: bf.craft(['ashrock', 'ashrock', 'ashrock', 'ashrock'], 2),
      lamp: bf.craft([null, 'glass', null, 'glass', 'ember', 'glass', null, 'glass', null]),
      torch: bf.craft(['ember', 'stick'], 1),
      charm: bf.craft([null, 'string', null, 'iron_ingot', 'fire_opal', 'iron_ingot', null, 'iron_ingot', null]),
    };
  });
  check('recipes: Ashrock Bricks x4, Ember Lamp, 8 torches from an Ember and a stick, Cinder Charm (string, Fire Opal, 3 iron)',
    r.bricks?.id === 'ashrock_bricks' && r.bricks.count === 4 && r.lamp?.id === 'ember_lamp' && r.torch?.id === 'torch' && r.torch.count === 8 && r.charm?.id === 'cinder_charm', r);
}

// ======================================================================= GENERATION
if (run('gen')) {
  const g = await ev(async () => {
    const G = await import('/src/world/generators.ts');
    const C = await import('/src/world/Cinderdeep.ts');
    const B = await import('/src/world/BlockRegistry.ts');
    const gen = G.createGenerator('cinderdeep', 12345, { structures: true, version: 1 });
    let open = 0, cells = 0, lava = 0, lavaHigh = 0, ember = 0, opal = 0, caps = 0, bedrockFloor = 0, bedrockRoof = 0, shrines = 0, chests = 0, ms = 0;
    const mobs = {};
    const N = 10;
    let same = true;
    for (let cx = 0; cx < N; cx++) for (let cz = 0; cz < N; cz++) {
      const t0 = performance.now();
      const r = gen.generateChunk(cx, cz);
      ms += performance.now() - t0;
      if (cx === 3 && cz === 4) { const r2 = gen.generateChunk(cx, cz); same = r2.blocks.every((v, i) => v === r.blocks[i]); }
      shrines += r.spawners.length; chests += r.containers.filter((c) => c.loot === 'shrine').length;
      for (const s of r.spawners) mobs[s.mob] = (mobs[s.mob] ?? 0) + 1;
      for (let i = 0; i < r.blocks.length; i++) {
        const b = r.blocks[i], y = i >> 8;
        if (y === 0 && b === B.BEDROCK) bedrockFloor++;
        if (y === 127 && b === B.BEDROCK) bedrockRoof++;
        if (b === B.LAVA) { lava++; if (y > C.LAVA_SEA) lavaHigh++; }
        if (b === B.EMBER_ORE) ember++;
        if (b === B.FIRE_OPAL_ORE) opal++;
        if (b === B.GLOWCAP) caps++;
        if (y > C.LAVA_SEA && y < 120) { cells++; if (b === B.AIR) open++; }
      }
    }
    const n = N * N;
    return { n, open: open / cells, lava: lava / n, lavaHigh, ember: ember / n, opal: opal / n, caps: caps / n, floor: bedrockFloor / n, roof: bedrockRoof / n, shrines, chests, mobs, ms: ms / n, same, sea: C.LAVA_SEA, biome: gen.column(5, 5).biome, villages: gen.villages };
  });
  check('Cinderdeep: bedrock floor and roof under every column', g.floor === 256 && g.roof === 256, { floor: g.floor, roof: g.roof });
  check('Cinderdeep: great caverns - about a third of the space above the lava sea is open (30-50%)', g.open > 0.3 && g.open < 0.5, g.open.toFixed(3));
  check('Cinderdeep: a lava sea fills everything open below height 25 (plus a few lavafalls above)', g.sea === 24 && g.lava > 1500 && g.lavaHigh < g.lava * 0.1, { lava: g.lava, high: g.lavaHigh });
  check('Cinderdeep: Ember Ore is common (5-30 per chunk), Fire Opal rare (under 3 per chunk), Glowcaps on the floors', g.ember > 5 && g.ember < 30 && g.opal > 0.1 && g.opal < 3 && g.caps > 3, { ember: g.ember, opal: g.opal, caps: g.caps });
  check('Cinderdeep: Ember Shrines (a Monster Cage of Cinderlings or Smoulderers, and treasure) in a few chunks', g.shrines >= 2 && g.chests >= g.shrines && Object.keys(g.mobs).every((m) => m === 'cinderling' || m === 'smoulderer'), { shrines: g.shrines, chests: g.chests, mobs: g.mobs });
  check('Cinderdeep: every chunk is the same every time it is made (a pure function of the seed)', g.same);
  check('Cinderdeep: quick to make (under 8 ms a chunk here), its own biome, no villages', g.ms < 8 && g.biome === 11 && g.villages === null, { ms: g.ms.toFixed(2), biome: g.biome });
}

// ======================================================================= GATE
let W = null;
if (run('gate') || run('travel') || run('rules') || run('mobs') || run('save')) {
  W = await newWorld('Gate World', 'gates');
}
let ring = null;
if (run('gate')) {
  ring = await makeRing();
  await settle();
  await give('torch', 0, 4);
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
  check('lighting: a torch used on the floor inside a ring of 8 Cinderstone lights a Deepgate', (await key(ring.x, ring.y, ring.z)) === 'deepgate', await key(ring.x, ring.y, ring.z));
  const inv = await ev(() => window.__bf.inventory()[0]);
  check('lighting: the torch is used up (Survival)', inv === '0:torchx3', inv);
  check('lighting: a message says what to do', (await chat()).some((c) => /Deepgate is lit/.test(c)), await chat());
  await page.screenshot({ path: `${SHOTS}/v20_gate.png` });
  // breaking the ring puts it out
  await set(ring.x + 1, ring.y, ring.z, 'air');
  await ticks(3);
  check('a Deepgate goes out when its ring is broken', (await key(ring.x, ring.y, ring.z)) === 'air', await key(ring.x, ring.y, ring.z));
  // a broken ring can't be lit
  await give('torch', 0, 4);
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
  check('...and an incomplete ring can\'t be lit (the torch is just placed)', (await key(ring.x, ring.y, ring.z)) !== 'deepgate', await key(ring.x, ring.y, ring.z));
  await set(ring.x, ring.y, ring.z, 'air');
  // relight with a lava bucket, ring partly of Cinderstone Bricks
  await set(ring.x + 1, ring.y, ring.z, 'cinderstone_bricks');
  await give('lava_bucket', 0, 1);
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
  const lb = await ev(() => window.__bf.inventory()[0]);
  check('lighting: a lava bucket lights it too (the ring may mix in Cinderstone Bricks) and hands back the bucket', (await key(ring.x, ring.y, ring.z)) === 'deepgate' && lb === '0:bucketx1', { gate: await key(ring.x, ring.y, ring.z), lb });
  // the floor under it
  await set(ring.x, ring.y - 1, ring.z, 'air');
  await ticks(3);
  check('a Deepgate goes out when the block under it is removed', (await key(ring.x, ring.y, ring.z)) === 'air');
  await set(ring.x, ring.y - 1, ring.z, 'stone');
  await give('torch', 0, 4);
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
}

// ======================================================================= TRAVEL
if (run('travel')) {
  if (!ring) { ring = await makeRing(); await settle(); await give('torch', 0, 4); await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5); await rclick(); }
  check('travel: the gate is lit', (await key(ring.x, ring.y, ring.z)) === 'deepgate');
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 0.3, z + 0.5); g.player.vx = g.player.vz = 0; }, [ring.x, ring.y, ring.z]);
  await ticks(25);
  const glow = await ev(() => ({ t: window.__bf.game.gateTicks, hud: window.__bf.ui.get().hud.gate }));
  check('travel: standing in the gate, a glow builds up (HUD)', glow.t > 10 && glow.hud > 0.1, glow);
  await page.screenshot({ path: `${SHOTS}/v20_gate_glow.png` });
  // step out: it fades
  await ev(([x, y, z]) => window.__bf.game.teleport(x - 2 + 0.5, y + 1, z + 0.5), [ring.x, ring.y, ring.z]);
  await ticks(20);
  check('travel: stepping out lets the glow fade', (await ev(() => window.__bf.game.gateTicks)) === 0);
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 0.3, z + 0.5); }, [ring.x, ring.y, ring.z]);
  const sawLoading = await waitFor(async () => (await screen()) === 'loading', 8000);
  const title = await ev(() => window.__bf.ui.get().loading?.title);
  check('travel: after 3 seconds in the gate: "Entering the Cinderdeep"', sawLoading && title === 'Entering the Cinderdeep', { sawLoading, title });
  await inGame();
  const there = await ev(() => {
    const g = window.__bf.game, p = g.player;
    const gate = g.findGate(Math.floor(p.x), Math.floor(p.z), 4);
    return { dim: g.dim, x: p.x, y: p.y, z: p.z, gate, rec: g.record.player?.dim, dims: g.record.dims, sky: window.__bf.engine.renderer.sky.group.visible, adv: g.progress.done.has('deepgate') };
  });
  check('travel: you arrive in the Cinderdeep at the same spot (one block there is one block here)', there.dim === 'cinderdeep' && Math.abs(there.x - ring.x) < 16 && Math.abs(there.z - ring.z) < 16, there);
  check('travel: ...standing beside a lit Deepgate that leads back', !!there.gate && Math.hypot(there.gate.x + 0.5 - there.x, there.gate.z + 0.5 - there.z) < 2, there);
  check('travel: the world now records the Cinderdeep (generator 1) and that you are in it; "Into the Cinderdeep"', there.rec === 'cinderdeep' && there.dims?.cinderdeep?.genVersion === 1 && there.dims.cinderdeep.firstVisit > 0 && there.adv, there);
  check('travel: no sky down here', there.sky === false);
  await ev(() => { window.__bf.game.player.yaw += Math.PI; window.__bf.ui.set({ chat: [] }); });
  await wait(800);
  await page.screenshot({ path: `${SHOTS}/v20_arrival.png` });
  const look = await ev(() => { const u = window.__bf.engine.renderer.uniforms; return { amb: u.uAmbient.value, fog: u.uFogColor.value.toArray().map((v) => +v.toFixed(2)), far: u.uFogFar.value }; });
  check('look: a dull red glow everywhere and a smoky red haze', look.amb > 0.2 && look.fog[0] > look.fog[1] * 2 && look.far <= 96, look);
  const deepGate = there.gate;
  // and back
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 0.3, z + 0.5); }, [deepGate.x, deepGate.y, deepGate.z]);
  await waitFor(async () => (await screen()) === 'loading', 8000);
  const title2 = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const back = await ev(() => { const g = window.__bf.game, p = g.player; return { dim: g.dim, x: p.x, y: p.y, z: p.z, sky: window.__bf.engine.renderer.sky.group.visible, gate: g.findGate(Math.floor(p.x), Math.floor(p.z), 4) }; });
  check('travel: the Cinderdeep\'s gate brings you back ("Returning to the surface") beside the gate you lit', title2 === 'Returning to the surface' && back.dim === 'overworld' && back.gate?.x === ring.x && back.gate?.z === ring.z && back.sky, { title2, back, ring });
}

// ======================================================================= RULES (in the Cinderdeep)
async function goDeep() {
  if ((await dim()) === 'cinderdeep') return;
  await ev(() => void window.__bf.engine.changeDimension('cinderdeep', { kind: 'gate', x: Math.floor(window.__bf.game.player.x), z: Math.floor(window.__bf.game.player.z) }));
  await inGame();
  await calm();
}
if (run('rules')) {
  await goDeep();
  const p0 = await ev(() => { const p = window.__bf.game.player; return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }; });
  // a little test pad
  await ev((P) => { const bf = window.__bf; for (let dx = -3; dx <= 3; dx++) for (let dz = 2; dz <= 6; dz++) { bf.setBlock(P.x + dx, P.y - 1, P.z + dz, 'ashrock'); for (let dy = 0; dy <= 3; dy++) bf.setBlock(P.x + dx, P.y + dy, P.z + dz, 'air'); } }, p0);
  await give('water_bucket', 0, 1);
  await aim(p0.x + 0.5, p0.y - 0.02, p0.z + 4.5);
  await clearChat();
  await rclick();
  const w = await ev((P) => ({ here: window.__bf.getBlock(P.x, P.y, P.z + 4), inv: window.__bf.inventory()[0] }), p0);
  check('rules: water poured in the Cinderdeep hisses away to steam (the bucket is empty)', w.here === 'air' && w.inv === '0:bucketx1', w);
  // beds
  const bedMsg = await ev((P) => { const g = window.__bf.game; window.__bf.ui.set({ chat: [] }); g.trySleep(P.x, P.y, P.z + 3); return { msgs: window.__bf.ui.get().chat.map((c) => c.text), bed: g.player.bed }; }, p0);
  check('rules: beds don\'t work: "far too hot to sleep" (and your spawn point stays on the surface)', bedMsg.msgs.some((m) => /too hot to sleep/.test(m)) && !bedMsg.bed, bedMsg);
  // maps
  await give('dungeon_map', 0, 1);
  await clearChat();
  await rclick();
  const mapMsg = await chat();
  check('rules: maps only work on the surface', mapMsg.some((m) => /only work on the surface/.test(m)), mapMsg);
  // no rain, no thunder
  const wx = await ev(() => { const g = window.__bf.game; g.weather.set('thunder', 9999, true); const p = g.player; return { precip: g.precipAt(Math.floor(p.x), Math.floor(p.z)), raining: g.rainingOn(Math.floor(p.x), 200, Math.floor(p.z)) }; });
  for (let i = 0; i < 400; i++) await ev(() => window.__bf.game.tick());
  const strike = await ev(() => window.__bf.game.lastStrike);
  check('rules: no rain or lightning reach the Cinderdeep, even in a storm above', wx.precip === 0 && !wx.raining && !strike, { wx, strike });
  await ev(() => window.__bf.game.weather.set('clear', 99999, true));
  // milestones that need the sky don't fire down here
  const adv = await ev(() => { const g = window.__bf.game; g.teleport(g.player.x, 15, g.player.z); g.tick(); return g.progress.done.has('deep'); });
  check('rules: "Deep Dive" (below height 20) only counts on the surface', !adv);
  // death: you wake up on the surface
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 0; g.damagePlayer(100, { x: g.player.x, y: g.player.y, z: g.player.z, kind: 'lava' }); });
  await waitFor(async () => (await ev(() => window.__bf.ui.get().overlay)) === 'death', 5000);
  await ev(() => window.__bf.game.respawn());
  await waitFor(async () => (await screen()) === 'loading', 8000);
  const wake = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const home = await ev(() => { const g = window.__bf.game, p = g.player; return { dim: g.dim, dead: p.dead, health: p.health, dx: Math.abs(p.x - p.spawnX), dz: Math.abs(p.z - p.spawnZ) }; });
  check('rules: dying in the Cinderdeep, you wake up on the surface at your spawn point ("Waking up on the surface")', wake === 'Waking up on the surface' && home.dim === 'overworld' && !home.dead && home.health === 20 && home.dx < 2 && home.dz < 2, { wake, home });
  await calm();
}

// ======================================================================= CREATURES
if (run('mobs')) {
  await goDeep();
  const P = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z) + 30, y = 70;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'ashrock'); for (let dy = 0; dy <= 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
    p.flying = false;
    g.teleport(x + 0.5, y, z + 0.5);
    return { x, y, z };
  });
  await settle();
  const m = await ev((P) => {
    const g = window.__bf.game, out = {};
    for (const t of ['cinderling', 'smoulderer']) {
      const mob = g.entities.spawnMob(t, P.x + 4.5, P.y, P.z + 0.5, g);
      out[t] = { name: mob.spec.name, hp: mob.health, fireproof: !!mob.spec.fireproof, h: mob.height };
      mob.removed = true;
    }
    return out;
  }, P);
  check('creatures: the Cinderling (10 health, knee high) and the Smoulderer (24 health, taller than you), both fireproof',
    m.cinderling.hp === 10 && m.cinderling.h <= 1 && m.smoulderer.hp === 24 && m.smoulderer.h > 1.9 && m.cinderling.fireproof && m.smoulderer.fireproof, m);
  // fireproof: a Cinderling in lava takes no harm
  const lavaTest = await ev((P) => {
    const bf = window.__bf, g = bf.game;
    for (let dx = 5; dx <= 7; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(P.x + dx, P.y - 1, P.z + dz, 'lava');
    const mob = g.entities.spawnMob('cinderling', P.x + 6.5, P.y - 1, P.z + 0.5, g);
    mob.persistent = true;
    for (let i = 0; i < 80; i++) g.tick();
    const r = { hp: mob.health, alive: mob.alive, fire: mob.fireTicks };
    mob.removed = true;
    return r;
  }, P);
  check('creatures: lava doesn\'t hurt a Cinderling', lavaTest.hp === 10 && lavaTest.alive && lavaTest.fire === 0, lavaTest);
  // a Cinderling's hit sets you alight; it leaps at you
  await ev(() => { const g = window.__bf.game; g.difficulty = 'normal'; g.player.gameMode = 'survival'; g.player.health = 20; g.player.fireTicks = 0; });
  const hit = await ev((P) => {
    const g = window.__bf.game, p = g.player;
    p.invulnerable = 0;
    const mob = g.entities.spawnMob('cinderling', P.x + 4.5, P.y, P.z + 0.5, g);
    mob.persistent = true;
    let leapt = false, fire = 0, hp = 20;
    for (let i = 0; i < 200; i++) {
      g.tick();
      if (!mob.onGround && mob.vy > 0.2) leapt = true;
      if (p.fireTicks > fire) fire = p.fireTicks;
      if (p.health < hp) hp = p.health;
      if (fire > 0) break;
    }
    mob.removed = true;
    return { leapt, fire, hp };
  }, P);
  check('creatures: a Cinderling leaps at you, and its hit sets you on fire', hit.leapt && hit.fire > 0 && hit.hp < 20, hit);
  await ev(() => { const p = window.__bf.game.player; p.fireTicks = 0; p.health = 20; });
  // a Smoulderer throws embers
  const ember = await ev((P) => {
    const g = window.__bf.game, p = g.player;
    p.invulnerable = 0;
    const mob = g.entities.spawnMob('smoulderer', P.x + 0.5, P.y, P.z + 7.5, g);
    mob.persistent = true;
    let thrown = 0, burnt = false, kinds = new Set();
    const seen = new Set();
    for (let i = 0; i < 400 && !burnt; i++) {
      g.tick();
      for (const e of g.entities.list) if (e.type === 'ember' && !seen.has(e)) { seen.add(e); thrown++; }
      if (p.fireTicks > 0) burnt = true;
    }
    for (const e of g.entities.list) kinds.add(e.type);
    mob.removed = true;
    return { thrown, burnt, hp: p.health };
  }, P);
  check('creatures: a Smoulderer keeps its distance and throws embers that burn and set you alight', ember.thrown > 0 && ember.burnt && ember.hp < 20, ember);
  // the Cinder Charm halves fire damage
  const charm = await ev(() => {
    const g = window.__bf.game, p = g.player;
    const burn = () => { p.invulnerable = 0; p.health = 20; g.damagePlayer(4, { x: p.x, y: p.y, z: p.z, kind: 'burn' }); return 20 - p.health; };
    g.inventory.slots[40] = null; g.inventory.changed();
    const without = burn();
    const OFF = 40;
    g.inventory.slots[OFF] = { id: 'cinder_charm', count: 1 }; g.inventory.changed();
    const withIt = burn();
    p.fireTicks = 300; for (let i = 0; i < 3; i++) g.tick();
    const fire = p.fireTicks;
    g.inventory.slots[OFF] = null; g.inventory.changed();
    p.fireTicks = 0; p.health = 20;
    return { without, withIt, fire, charmSlot: g.hasCharm() };
  });
  check('Cinder Charm: in the off hand it halves fire and lava damage and puts fire out sooner', charm.withIt === charm.without / 2 && charm.fire <= 100, charm);
  // natural spawning down here
  const spawns = await ev(() => {
    const g = window.__bf.game;
    g.rules.doMobSpawning = true; g.difficulty = 'normal';
    for (const e of g.entities.list) if (e.type === 'mob') e.removed = true;
    for (let i = 0; i < 2400; i++) g.tick();
    const kinds = {};
    for (const e of g.entities.list) if (e.mobType) kinds[e.mobType] = (kinds[e.mobType] ?? 0) + 1;
    g.rules.doMobSpawning = false;
    for (const e of g.entities.list) if (e.type === 'mob' || e.mobType) e.removed = true;
    return kinds;
  });
  check('creatures: only Cinderlings and Smoulderers appear in the Cinderdeep (no animals)', Object.keys(spawns).length > 0 && Object.keys(spawns).every((k) => k === 'cinderling' || k === 'smoulderer'), spawns);
  await ev(() => { const g = window.__bf.game; g.difficulty = 'normal'; g.player.health = 20; g.player.fireTicks = 0; });
}

// ======================================================================= SAVE
if (run('save')) {
  // the overworld needs a change of its own (the gate tests make one when they run first)
  if ((await dim()) === 'overworld') await ev(() => { const p = window.__bf.game.player; window.__bf.setBlock(Math.floor(p.x) + 2, Math.floor(p.y) + 3, Math.floor(p.z), 'stone'); });
  await goDeep();
  const spot = await ev(() => { const g = window.__bf.game, p = g.player; const x = Math.floor(p.x) + 1, y = Math.floor(p.y), z = Math.floor(p.z); window.__bf.setBlock(x, y + 2, z, 'ember_lamp'); return { x, y: y + 2, z, px: p.x, pz: p.z }; });
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  const raw = await ev((id) => new Promise((resolve) => {
    const req = indexedDB.open('blockfell');
    req.onsuccess = () => {
      const db = req.result, out = { chunks: [], extra: [] };
      const t = db.transaction(['chunks', 'extra'], 'readonly');
      t.objectStore('chunks').getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿')).onsuccess = (e) => { out.chunks = e.target.result; };
      t.objectStore('extra').getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿')).onsuccess = (e) => { out.extra = e.target.result; };
      t.oncomplete = () => { db.close(); resolve(out); };
    };
  }), W);
  check('save: each dimension keeps its own chunks and extra data ("<world>|cinderdeep|...")',
    raw.chunks.some((k) => k.includes('|cinderdeep|')) && raw.chunks.some((k) => k.includes('|overworld|')) && raw.extra.includes(`${W}|cinderdeep`) && raw.extra.includes(`${W}|overworld`), raw);
  await ev((id) => void window.__bf.engine.playWorld(id), W);
  await waitFor(async () => (await screen()) === 'loading', 5000);
  const lt = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const again = await ev((S) => ({ dim: window.__bf.game.dim, lamp: window.__bf.getBlock(S.x, S.y, S.z), dx: Math.abs(window.__bf.game.player.x - S.px) }), spot);
  check('save: reopening the world puts you back in the Cinderdeep where you were ("Loading world: the Cinderdeep")', again.dim === 'cinderdeep' && again.lamp === 'ember_lamp' && again.dx < 1 && lt === 'Loading world: the Cinderdeep', { again, lt });
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  const file = await ev(async (id) => {
    const W2 = await import('/src/systems/WorldBackup.ts');
    const { backup } = await W2.createBackup(window.__bf.engine.saves, id);
    return { dims: Object.keys(backup.dims), cd: Object.keys(backup.dims.cinderdeep?.chunks ?? {}).length, rec: backup.world.dims, at: backup.world.player.dim };
  }, W);
  check('save: a backup (and the Dropbox copy) holds both dimensions', JSON.stringify(file.dims.sort()) === '["cinderdeep","overworld"]' && file.cd > 0 && file.rec?.cinderdeep?.genVersion === 1 && file.at === 'cinderdeep', file);
  const old = await ev(async () => {
    const G = await import('/src/world/generators.ts');
    return { need: G.needsNewerGenerator({ genVersion: 6, dims: { cinderdeep: { genVersion: 1 } }, player: { dim: 'cinderdeep' } }), needV2: G.needsNewerGenerator({ genVersion: 6, dims: { cinderdeep: { genVersion: 2 } } }) };
  });
  check('save: 2.0 can open its own Cinderdeep worlds; a newer Cinderdeep generator would need a newer Blockfell', !old.need && old.needV2, old);
}

// ======================================================================= SHRINE
if (run('shrine')) {
  if (!W || (await screen()) !== 'game') {
    if ((await screen()) === 'title') { await ev((id) => void window.__bf.engine.playWorld(id), W ?? ''); }
    if (!W) W = await newWorld('Shrine World', 'shrines', true);
    await inGame();
  }
  await goDeep();
  const s = await ev(async () => {
    const g = window.__bf.game, p = g.player;
    const cx0 = Math.floor(p.x) >> 4, cz0 = Math.floor(p.z) >> 4;
    for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const res = g.world.generator.generateChunk(cx0 + dx, cz0 + dz);
      const c = res.containers.find((c) => c.loot === 'shrine');
      if (c) return { chest: c, cage: res.spawners[0] };
    }
    return null;
  });
  check('shrine: there is an Ember Shrine within a few chunks', !!s, s);
  if (s) {
    await ev((S) => { const g = window.__bf.game; g.player.flying = true; g.teleport(S.cage.x + 0.5, S.cage.y + 3, S.cage.z + 0.5); }, s);
    await settle();
    const built = await ev((S) => ({ cage: window.__bf.getBlock(S.cage.x, S.cage.y, S.cage.z), chest: window.__bf.getBlock(S.chest.x, S.chest.y, S.chest.z), floor: window.__bf.getBlock(S.cage.x + 1, S.cage.y - 1, S.cage.z) }), s);
    check('shrine: a Monster Cage in the middle, a chest, an Ashrock Brick floor', built.cage === 'spawner' && /chest/.test(built.chest) && /ashrock/.test(built.floor), built);
    await ev((S) => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; g.teleport(S.chest.x + 0.5, S.chest.y + 1, S.chest.z + 0.5); }, s);
    await ticks(3);
    await aim(s.chest.x + 0.5, s.chest.y + 0.5, s.chest.z + 0.5);
    await ev((S) => { const g = window.__bf.game; g.teleport(S.chest.x + 0.5, S.chest.y + 1.1, S.chest.z + 0.5); }, s);
    await ev((S) => { window.__bf.game['interactWith'](S.chest.x, S.chest.y, S.chest.z, 'chest'); }, s);
    await wait(300);
    const loot = await ev((S) => {
      const be = window.__bf.game.world.blockEntities.get(`${S.chest.x},${S.chest.y},${S.chest.z}`);
      return { items: be?.items?.filter(Boolean).map((i) => i.id) ?? [], adv: window.__bf.game.progress.done.has('shrine') };
    }, s);
    check('shrine: its chest holds treasure from the shrine table (Ember and more), and opening it earns "Shrine Raider"', loot.items.length > 0 && loot.adv && loot.items.every((i) => ['ember', 'iron_ingot', 'rune_shard', 'amber', 'fire_opal', 'glowcap', 'bread', 'arrow', 'cinder_charm', 'iron_chestplate', 'iron_helmet'].includes(i)), loot);
    await ev(() => window.__bf.engine.closeOverlay());
    await page.screenshot({ path: `${SHOTS}/v20_shrine.png` });
  }
}

check('no script errors', errors.length === 0, errors.slice(0, 8));
console.log('\n' + results.map((r) => `${r[0]}  ${r[1].padEnd(100)} ${r[0] === 'FAIL' ? r[2].slice(0, 300) : ''}`).join('\n'));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await b.close();
