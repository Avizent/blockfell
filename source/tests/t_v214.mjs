// Tests for 2.14.0: Powder Snow.
// node tests/t_v214.mjs   (dev server)   ONLY=items,sink
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','sink','boots','freeze','gen','save'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720, CX = VW / 2, CY = VH / 2;
const errors = [];
let page = await b.newPage({ viewport: { width: VW, height: VH } });
const watch = (pg) => { pg.on('pageerror', (e) => errors.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
watch(page);
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const give = (stack, slot = 0) => ev(([stack, slot]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; g.inventory.selected = slot; g.inventory.changed(); }, [stack, slot]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const screen = () => ev(() => window.__bf?.state().screen);
const overlay = () => ev(() => window.__bf.ui.get().overlay);
const chat = () => ev(() => window.__bf.ui.get().chat.map((c) => c.text ?? c).join(' | '));
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const lclick = async () => { await centre(); await page.mouse.click(CX, CY); await ticks(3); await wait(60); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(400); };
const inGame = async () => { await waitFor(async () => (await screen()) === 'game', 90000); await ev(() => window.__bf.allowUnlocked(true)); await settle(); };
const calm = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
  for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
});
const clearItems = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item' || e.type === 'xp') e.removed = true; });
async function newWorld(name, seed, creative = false) {
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
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
  await wait(300);
  return ev(() => window.__bf.game.record.id);
}
async function reopen(id) {
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  await ev((id) => void window.__bf.engine.playWorld(id), id);
  await inGame();
  await ev(() => { const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.weather.set('clear', 99999, true); });
}

const pad = (r = 7, floor = 'grass') => ev(([r, floor]) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  if (!window.__base || window.__baseWorld !== g.record.id) { window.__base = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }; window.__baseWorld = g.record.id; }
  const { x, y, z } = window.__base;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { for (let dy = -8; dy <= -1; dy++) bf.setBlock(x + dx, y + dy, z + dz, dy === -1 ? floor : 'stone'); for (let dy = 0; dy <= 8; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  p.flying = false;
  g.teleport(x + 0.5, y, z + 0.5); p.yaw = 0; p.pitch = 0; p.vx = p.vz = 0;
  return { x, y, z };
}, [r, floor]);
const tp = (x, y, z, yaw = 0, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.yaw = yaw; g.player.pitch = pitch; g.player.vx = g.player.vy = g.player.vz = 0; }, [x, y, z, yaw, pitch]);
const adv = (id) => ev((id) => window.__bf.game.progress.done.has(id), id);
const stat = (id) => ev((id) => window.__bf.game.progress.stats[id] ?? 0, id);
const setSlot = (slot, stack, select = true) => ev(([slot, stack, select]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; if (select) g.inventory.selected = slot; g.inventory.changed(); }, [slot, stack, select]);
const clearInv = () => ev(() => { const g = window.__bf.game; for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = null; g.inventory.changed(); });
const wear = (slot, id) => ev(([slot, id]) => { const g = window.__bf.game; g.inventory.slots[36 + slot] = id ? { id, count: 1 } : null; g.inventory.changed(); }, [slot, id]);
const pl = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z, vy: p.vy, hp: p.health, freeze: p.freeze, inP: p.inPowder, eyeP: p.eyeInPowder, ground: p.onGround, walker: p.powderWalker }; });
const mortal = () => ev(() => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; g.player.gameMode = 'survival'; g.player.freeze = 0; g.difficulty = 'normal'; });
/** A 7x7 field of Powder Snow, 4 deep, level with the floor, with the player standing just north of it. */
async function field() {
  const P = await pad(9);
  await ev(([P]) => { const bf = window.__bf; for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -5; dy <= -1; dy++) bf.setBlock(P.x + dx, P.y + dy, P.z + dz, dy === -5 ? 'stone' : 'powder_snow'); }, [P]);
  await wait(300);
  return P;
}
await page.goto(URL);
await page.mouse.move(CX, CY);


if (run('items') || run('sink') || run('boots') || run('freeze') || run('save')) {
  await newWorld('PowderTest', 'powder214', false);
}

if (run('items')) {
  const r = await ev(() => {
    const bf = window.__bf, g = bf.game;
    const it = g.inventory && null;
    return { ver: window.__bf.game.constructor && null };
  });
  const info = await ev(async () => {
    const reg = await import('/src/world/BlockRegistry.ts');
    const items = await import('/src/inventory/ItemRegistry.ts');
    const def = reg.getBlock(reg.POWDER_SNOW);
    const item = items.getItem('powder_snow');
    return { key: def.key, solid: def.solid, opaque: def.opaque, sound: def.sound, tool: def.tool, itemBlock: item.block === reg.POWDER_SNOW, cat: item.category, gate: reg.GATE_RING.length, last: reg.BLOCK_COUNT };
  });
  check('block: Powder Snow is registered, non-solid, mined with a shovel', info.key === 'powder_snow' && !info.solid && info.tool === 'shovel' && info.sound === 'snow' && info.itemBlock, info);
  const P = await pad(5);
  await set(P.x + 2, P.y, P.z, 'powder_snow');
  check('block: can be set and read back', (await key(P.x + 2, P.y, P.z)) === 'powder_snow');
  // place it from the hand: aim at the top of the floor block two north of the player
  await setSlot(0, { id: 'powder_snow', count: 4 });
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  await ev(([P]) => window.__bf.aimAt(P.x + 0.5, P.y - 0.05, P.z - 2 + 0.5), [P]);
  await rclick();
  const placed = await key(P.x, P.y, P.z - 2);
  check('block: the item places Powder Snow', placed === 'powder_snow', { placed });
  await setSlot(0, { id: 'iron_shovel', count: 1 });
  await clearItems();
  await ev(([P]) => window.__bf.aimAt(P.x + 0.5, P.y + 0.5, P.z - 2 + 0.5), [P]);
  await centre();
  await page.mouse.move(CX, CY);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await ticks(2);
  await page.mouse.up(); await ticks(3);
  const broke = await key(P.x, P.y, P.z - 2);
  const drops = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.id));
  check('block: a shovel mines it and it drops itself', broke === 'air' && drops.includes('powder_snow'), { broke, drops });
}

if (run('sink')) {
  await clearInv(); await mortal();
  const P = await field();
  // drop in from 3 blocks up: no fall damage, ends up inside, slowly
  await tp(P.x + 0.5, P.y + 4, P.z + 0.5);
  await mortal();
  await ticks(1);
  let minY = 99, hpMin = 20;
  for (let i = 0; i < 40; i++) { await fast(1); const s = await pl(); minY = Math.min(minY, s.y); hpMin = Math.min(hpMin, s.hp); }
  const s1 = await pl();
  check('sink: falling in does no fall damage', hpMin === 20, { hpMin });
  check('sink: you sink below the surface and are inside it', s1.y < P.y - 1.5 && s1.inP, s1);
  check('sink: you sink slowly (not a plunge)', await (async () => { await tp(P.x + 0.5, P.y + 2, P.z + 0.5); await mortal(); const y0 = (await pl()).y; await fast(20); const y1 = (await pl()).y; return y0 - y1 < 4; })());
  check('sink: advancement Sinking Feeling', await adv('powder'));
  // stands on the bottom (stone at -5, powder -4..-1): feet end at P.y-4
  await fast(80);
  const s2 = await pl();
  check('sink: comes to rest on the floor under the drift', Math.abs(s2.y - (P.y - 4)) < 0.2, s2);
  // holding jump climbs out
  await page.keyboard.down('Space');
  await fast(70);
  await page.keyboard.up('Space');
  const s3 = await pl();
  check('sink: holding jump wades you back up to the top', s3.y > P.y - 0.6, s3);
  // slow walking: same 30 ticks on open ground and up to the knees in the drift
  const run30 = async (x, z) => {
    await tp(x, P.y, z, 3.14159); await fast(6);
    const a = await pl();
    await page.keyboard.down('KeyW'); await fast(30); await page.keyboard.up('KeyW');
    const c = await pl();
    return Math.hypot(c.x - a.x, c.z - a.z);
  };
  const open = await run30(P.x + 0.5, P.z + 8.5);
  await ev(([P]) => { for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) window.__bf.setBlock(P.x + dx, P.y, P.z + dz, 'powder_snow'); }, [P]);
  await wait(200);
  await tp(P.x + 0.5, P.y - 0.9, P.z + 2.9, 3.14159); await fast(4);
  const a = await pl();
  await page.keyboard.down('KeyW'); await fast(30); await page.keyboard.up('KeyW');
  const c = await pl();
  const deep = Math.hypot(c.x - a.x, c.z - a.z);
  check('sink: moving through the drift is far slower than open ground', open > 2 && deep < open * 0.5, { open, deep });
}


if (run('boots')) {
  await clearInv(); await mortal();
  const P = await field();
  await wear(3, 'leather_boots');
  await tp(P.x + 0.5, P.y + 3, P.z + 0.5);
  await mortal();
  await fast(40);
  const s1 = await pl();
  check('boots: Leather Boots hold you on top of Powder Snow', Math.abs(s1.y - P.y) < 0.15 && s1.ground && !s1.inP && s1.walker, s1);
  check('boots: advancement Light on Your Feet', await adv('powder_boots'));
  // walk across without sinking
  await tp(P.x + 0.5, P.y, P.z + 3.9, 0); await fast(6);
  await page.keyboard.down('KeyW'); await fast(40); await page.keyboard.up('KeyW');
  const s2 = await pl();
  check('boots: you can walk across the top of the drift', s2.z < P.z - 0.5 && s2.y > P.y - 0.15, s2);
  // jump on top
  await tp(P.x + 0.5, P.y, P.z + 0.5); await fast(10);
  await page.keyboard.down('Space'); await fast(6); await page.keyboard.up('Space');
  const s3 = await pl();
  check('boots: normal jumping on top', s3.y > P.y + 0.3, s3);
  await fast(25);
  // sneak to drop in
  await page.keyboard.down('ShiftLeft'); await fast(60);
  const s4 = await pl();
  await page.keyboard.up('ShiftLeft');
  check('boots: sneaking lets you sink in', s4.y < P.y - 1 && s4.inP, s4);
  // boots worn out do nothing; other boots do nothing
  await wear(3, 'iron_boots');
  await tp(P.x + 0.5, P.y + 2, P.z + 0.5); await mortal(); await fast(30);
  const s5 = await pl();
  check('boots: Iron Boots do not hold you up', s5.y < P.y - 0.8 && s5.inP, s5);
  await wear(3, 'leather_boots');
  await ev(() => { const g = window.__bf.game; g.inventory.slots[39].damage = 79; g.inventory.changed(); });
  await tp(P.x + 0.5, P.y + 2, P.z + 0.5); await mortal(); await fast(30);
  const s6 = await pl();
  check('boots: worn-out Leather Boots do not hold you up', s6.y < P.y - 0.8, s6);
  await wear(3, null);
}

if (run('freeze')) {
  await clearInv(); await mortal();
  const P = await field();
  await wear(0, null); await wear(1, null); await wear(2, null); await wear(3, null);
  await ev(() => { const p = window.__bf.game.player; p.invulnerable = 0; });
  await tp(P.x + 0.5, P.y - 1.5, P.z + 0.5); await mortal();
  await fast(70);
  const f1 = await pl();
  check('freeze: the meter climbs while you stand in it', f1.freeze > 60 && f1.freeze < 80, f1);
  check('freeze: no damage before frozen solid', f1.hp === 20, f1);
  await fast(130);
  const f2 = await pl();
  check('freeze: frozen solid at 140 and then you take damage', f2.freeze === 140 && f2.hp < 20, f2);
  check('freeze: advancement Brrr!', await adv('frozen'));
  const hud = await ev(() => window.__bf.ui.get().hud.freeze);
  check('freeze: the HUD frost reading is full', hud === 1, { hud });
  const ov = await page.$('[data-testid=frostbite]');
  check('freeze: the frost overlay is on screen', !!ov);
  // damage ignores armour
  await wear(0, 'iron_helmet'); await wear(1, 'iron_chestplate'); await wear(2, 'iron_leggings');
  await ev(() => { const p = window.__bf.game.player; p.health = 20; p.freeze = 140; p.invulnerable = 0; });
  const hp0 = (await pl()).hp;
  await fast(120);
  const hp1 = (await pl()).hp;
  check('freeze: iron armour does not stop the cold (about 1 per 2 seconds)', hp0 - hp1 >= 2 && hp0 - hp1 <= 4, { hp0, hp1 });
  // thaw
  await tp(P.x + 0.5, P.y + 0.5, P.z + 6.5); await ev(() => { window.__bf.game.player.invulnerable = 1e9; });
  await fast(30);
  const t1 = await pl();
  check('freeze: you thaw (twice as fast as you freeze) outside', t1.freeze <= 80 && t1.freeze > 0, t1);
  await fast(60);
  check('freeze: fully thawed', (await pl()).freeze === 0, await pl());
  // leather = immune
  await wear(0, null); await wear(1, null); await wear(2, null);
  await wear(1, 'leather_chestplate');
  await tp(P.x + 0.5, P.y - 1.5, P.z + 0.5); await mortal();
  await fast(200);
  const l1 = await pl();
  check('freeze: any leather piece keeps you warm', l1.freeze === 0 && l1.hp === 20 && l1.inP, l1);
  await wear(1, null);
  // eyes in powder: white-out
  await tp(P.x + 0.5, P.y - 4, P.z + 0.5); await mortal();
  await fast(5);
  await wait(300);
  check('freeze: white-out overlay with your eyes buried', !!(await page.$('[data-testid=in-powder]')));
  // creative never freezes
  await ev(() => { const p = window.__bf.game.player; p.gameMode = 'creative'; p.freeze = 0; });
  await fast(200);
  check('freeze: creative players do not freeze', (await pl()).freeze === 0);
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; });
  // death message
  await tp(P.x + 0.5, P.y - 1.5, P.z + 0.5); await ev(() => { const p = window.__bf.game.player; p.health = 1; p.freeze = 140; p.invulnerable = 0; });
  await fast(60);
  const dm = await ev(() => window.__bf.ui.get().deathMessage);
  check('freeze: dying says you froze', /froze/i.test(String(dm)), { dm });
}

if (run('gen')) {
  const r = await ev(async () => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const reg = await import('/src/world/BlockRegistry.ts');
    const biomes = await import('/src/world/BiomeSystem.ts');
    const out = { v9: 0, v8: 0, chunks: 0, pitsOnSteep: 0, deepMax: 0, trunkOnPowder: 0, topSamples: [] };
    const g9 = new T.TerrainGenerator(777, { structures: true, version: 9 });
    const g8 = new T.TerrainGenerator(777, { structures: true, version: 8 });
    const tmp = { height: 0, biome: 0, mountain: 0, river: 0 };
    // find snowy chunks
    const snowy = [];
    for (let cz = -80; cz <= 80 && snowy.length < 14; cz += 2) for (let cx = -80; cx <= 80 && snowy.length < 14; cx += 2) {
      const c = g9.column(cx * 16 + 8, cz * 16 + 8, tmp);
      if (c.biome === biomes.BIOME_SNOWY && c.height > 60) snowy.push([cx, cz]);
    }
    out.snowyFound = snowy.length;
    const CS = 16, WH = 256;
    for (const [cx, cz] of snowy) {
      const c9 = g9.generateChunk(cx, cz), c8 = g8.generateChunk(cx, cz);
      out.chunks++;
      for (let i = 0; i < c9.blocks.length; i++) if (c9.blocks[i] === reg.POWDER_SNOW) out.v9++;
      for (let i = 0; i < c8.blocks.length; i++) if (c8.blocks[i] === reg.POWDER_SNOW) out.v8++;
    }
    // the depth function itself
    let cells = 0, pits = 0, maxD = 0;
    for (let x = 0; x < 140; x += 14) for (let z = 0; z < 140; z += 14) {
      cells++;
      let any = 0;
      for (let dx = 0; dx < 14; dx++) for (let dz = 0; dz < 14; dz++) { const d = g9.powderDepth(x + dx, z + dz); if (d) any++; if (d > maxD) maxD = d; }
      if (any) pits++;
    }
    out.cells = cells; out.pitCells = pits; out.maxDepth = maxD;
    return out;
  });
  check('gen: version 9 snowy chunks contain Powder Snow pits', r.snowyFound > 0 && r.v9 > 0, r);
  check('gen: older (version 8) worlds are unchanged: no Powder Snow', r.v8 === 0, r);
  check('gen: pits are a minority of ground (about 3 cells in 10) and 2-4 deep', r.pitCells >= 15 && r.pitCells <= 50 && r.maxDepth >= 3 && r.maxDepth <= 4, r);
}

if (run('save')) {
  await newWorld('PowderSave', 'powder215', false);
  await clearInv(); await mortal();
  const P = await field();
  const id = await ev(() => window.__bf.game.record.id);
  await ev(([P]) => { const bf = window.__bf; bf.setBlock(P.x + 5, P.y, P.z, 'powder_snow'); }, [P]);
  await wear(3, 'leather_boots');
  await ev(() => { window.__bf.game.player.freeze = 77; });
  await reopen(id);
  check('save: Powder Snow survives save and reload', (await key(P.x + 5, P.y, P.z)) === 'powder_snow' && (await key(P.x, P.y - 2, P.z)) === 'powder_snow');
  await tp(P.x + 0.5, P.y + 2.5, P.z + 0.5); await mortal();
  await ev(() => { const g = window.__bf.game; g.inventory.slots[39] = { id: 'leather_boots', count: 1 }; g.inventory.changed(); });
  await fast(40);
  const s = await pl();
  check('save: boots still work after reload', Math.abs(s.y - P.y) < 0.15 && !s.inP, s);
}

if (run('shots')) {
  await newWorld('PowderShots', 'powder216', false);
  const P = await pad(12, 'snowy_grass');
  await ev(([P]) => {
    const bf = window.__bf, g = bf.game;
    // a rough round pit like the generator makes, 3 deep, in snow
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) bf.setBlock(P.x + dx, P.y - 1, P.z + dz, 'snow');
    for (let dx = -3; dx <= 3; dx++) for (let dz = -6; dz <= 0; dz++) if (dx * dx + (dz + 3) * (dz + 3) <= 11) for (let dy = -3; dy <= -1; dy++) bf.setBlock(P.x + dx, P.y + dy, P.z + dz, 'powder_snow');
    g.dayNight.time = 5000; g.player.gameMode = 'creative'; g.player.flying = true;
    window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: true });
    g.inventory.slots[8] = null; g.inventory.selected = 8; g.inventory.changed(); g.reach = () => 0.0001;
  }, [P]);
  await wait(500);
  const shot = async (name, x, y, z, yaw, pitch) => { await tp(x, y, z, yaw, pitch); await wait(900); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
  await shot('pw_pit', P.x + 0.5, P.y + 4.0, P.z + 6.5, 0, -0.5);
  await shot('pw_close', P.x + 0.5, P.y + 1.6, P.z + 3.5, 0, -0.62);
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.flying = false; });
  await ev(([P]) => { const g = window.__bf.game; g.player.invulnerable = 1e9; g.teleport(P.x + 0.5, P.y + 0.2, P.z - 2.5); g.player.yaw = 0; g.player.pitch = -0.1; }, [P]);
  await fast(35);
  await ev(() => { window.__bf.ui.set({ hideHud: false }); });
  await ev(() => { const p = window.__bf.game.player; p.freeze = 120; });
  await fast(1); await ev(() => window.__bf.ui.set({ toasts: [] })); await wait(600);
  await page.screenshot({ path: SHOTS + '/pw_frost.png' });
  await ev(([P]) => { const g = window.__bf.game; g.teleport(P.x + 0.5, P.y - 3, P.z - 2.5); }, [P]);
  await fast(4); await ev(() => window.__bf.ui.set({ toasts: [] })); await wait(600);
  await page.screenshot({ path: SHOTS + '/pw_inside.png' });
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
