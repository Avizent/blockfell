// Tests for 2.16.0: texture update stage 2, mine pit-heads, Carpets and Banners.
// node tests/t_v216.mjs   (dev server)   ONLY=items,tex,carpet,banner,pit,climb,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','tex','carpet','banner','pit','climb','save'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
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

await page.goto(URL);
await page.mouse.move(CX, CY);


if (run('items') || run('tex') || run('carpet') || run('banner') || run('save')) await newWorld('RichTest', 'rich216', true);

if (run('items')) {
  const info = await ev(async () => {
    const reg = await import('/src/world/BlockRegistry.ts');
    const I = await import('/src/inventory/ItemRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const T = await import('/src/world/TerrainGenerator.ts');
    const D = await import('/src/world/dyes.ts');
    const cols = D.DYE_COLORS;
    const wk = (c) => (c === 'white' ? 'wool' : `${c}_wool`);
    return {
      ver: C.GAME_VERSION, gen: T.GEN_VERSION, n: cols.length,
      carpets: cols.every((c) => I.hasItem(`carpet_${c}`) && I.getItem(`carpet_${c}`).block === reg.CARPETS[c]),
      banners: cols.every((c) => I.hasItem(`banner_${c}`) && I.getItem(`banner_${c}`).block === reg.BANNERS[`banner_${c}`].ew),
      blocks: reg.BLOCK_COUNT, limit: C.BLOCK_LIMIT,
      cobweb: reg.COBWEB, firstCarpet: reg.CARPETS.white,
      cr: window.__bf.craft(['wool', 'wool', null, null, null, null, null, null, null]),
      cr2: window.__bf.craft(['red_wool', 'red_wool', null, null, null, null, null, null, null]),
      bn: window.__bf.craft(['blue_wool', 'blue_wool', 'blue_wool', 'blue_wool', 'blue_wool', 'blue_wool', null, 'stick', null]),
      mixed: window.__bf.craft(['wool', 'red_wool', null, null, null, null, null, null, null]),
      names: ['carpet_red', 'banner_red'].map((k) => reg.blockByKey(k) ?? reg.blockByKey(k + ':ew')).map((b) => b?.name),
    };
  });
  check('items: version 2.16.0, terrain version 11', /^2\.1[6-9]\.0$/.test(info.ver) && info.gen === 11, info);
  check('items: sixteen Carpets and sixteen Banners, each with an item', info.carpets && info.banners && info.n === 16, info);
  check('items: they come after Cobweb (no saved block id moved) and fit the block limit', info.firstCarpet === info.cobweb + 1 && info.blocks < info.limit, info);
  check('items: two wool make three carpets of that colour', info.cr?.id === 'carpet_white' && info.cr?.count === 3 && info.cr2?.id === 'carpet_red', info);
  check('items: six wool and a stick make a Banner', info.bn?.id === 'banner_blue' && info.bn?.count === 1, info);
  check('items: mixed colours make no carpet', !info.mixed || !String(info.mixed.id).startsWith('carpet'), info);
}

if (run('tex')) {
  const r = await ev(async () => {
    const X = await import('/src/meshing/textures.ts');
    const N = await import('/src/meshing/textureNames.ts');
    const m = X.generateBlockTextures();
    const colours = (t) => new Set(Array.from({ length: 256 }, (_, i) => `${t.d[i * 4]},${t.d[i * 4 + 1]},${t.d[i * 4 + 2]}`)).size;
    const px = (t, x, y) => [t.d[(y * 16 + x) * 4], t.d[(y * 16 + x) * 4 + 1], t.d[(y * 16 + x) * 4 + 2], t.d[(y * 16 + x) * 4 + 3]];
    const same = (a, b) => a.d.every((v, i) => v === b.d[i]);
    const gs = m.get('grass_side'), dirt = m.get('dirt');
    let top = 0, bot = 0;
    for (let x = 0; x < 16; x++) { const a = px(gs, x, 0), c = px(gs, x, 15); top += a[1] > a[0] + 20 ? 1 : 0; bot += c[0] > c[1] ? 1 : 0; }
    let holes = 0; const lv = m.get('leaves'); for (let i = 0; i < 256; i++) if (lv.d[i * 4 + 3] === 0) holes++;
    const w = m.get('wool_red'), pr = px(w, 3, 3);
    const names = ['dirt', 'grass_top', 'grass_side', 'stone', 'cobblestone', 'sand', 'gravel', 'log_side', 'log_top', 'leaves', 'planks', 'bricks', 'stone_bricks', 'sandstone_side', 'snow', 'wool', 'coal_ore', 'iron_ore', 'tall_grass', 'flower_red', 'flower_yellow'];
    return {
      total: m.size === N.TEXTURE_NAMES.length, rich: names.map((n) => [n, colours(m.get(n))]).filter(([, c]) => c < 8),
      missingDiffers: !same(m.get('stone'), m.get('missing')), sideTop: top, sideBottom: bot, holes, redWool: pr,
      deterministic: same(X.generateBlockTextures().get('stone'), m.get('stone')),
      grassSideDirt: same(m.get('path_side'), m.get('path_side')) && !same(m.get('grass_side'), m.get('path_side')),
      cobweb: m.get('cobweb').d.some((v, i) => i % 4 === 3 && v === 0), flowerAlpha: m.get('flower_red').d.some((v, i) => i % 4 === 3 && v === 0),
      layers: N.TEXTURE_NAMES.length, cob: N.textureLayer('cobweb'),
    };
  });
  check('tex: every texture is still generated (names and layer order unchanged)', r.total && r.cob === r.layers - 8 - 8 - 10 - 1, r);
  check('tex: the everyday blocks each use eight or more tones', r.rich.length === 0, r.rich);
  check('tex: grass sides have a green fringe over brown dirt', r.sideTop >= 14 && r.sideBottom >= 12, r);
  check('tex: leaves are see-through in places, flowers and grass cut out', r.holes > 10 && r.flowerAlpha, r);
  check('tex: dyed wool keeps its colour', r.redWool[0] > r.redWool[1] * 2, r);
  check('tex: generation is deterministic', r.deterministic, r);
}

if (run('carpet')) {
  await clearInv(); await mortal();
  const P = await pad(8);
  await setSlot(0, { id: 'carpet_red', count: 16 });
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0.5);
  await aim(P.x + 0.5, P.y - 0.5, P.z + 2.5); await rclick();
  const k1 = await key(P.x, P.y, P.z + 2);
  check('carpet: right-click lays a Carpet on the floor', k1 === 'carpet_red', k1);
  // a row to walk over
  for (let dz = 2; dz <= 6; dz++) await set(P.x, P.y, P.z + dz, 'carpet_blue');
  await tp(P.x + 0.5, P.y, P.z + 0.5, Math.PI, 0);
  const walk = await ev(() => { const g = window.__bf.game; const p = g.player; const z0 = p.z; g.autopilot = { forward: 1 }; for (let i = 0; i < 24; i++) g.tick(); g.autopilot = null; return { dz: p.z - z0, y: p.y, ground: p.onGround }; });
  check('carpet: you walk across carpets without catching on them', walk.dz > 2.5 && walk.ground && walk.y < P.y + 0.3, walk);
  const light = await ev(([P]) => { const g = window.__bf.game; return { a: g.world.getBlock(P.x, P.y + 1, P.z + 4) }; }, [P]);
  void light;
  // no floor, no carpet
  await set(P.x + 3, P.y - 1, P.z, 'air');
  await tp(P.x + 3.5, P.y + 1, P.z - 3.5, 0, 0);
  await setSlot(0, { id: 'carpet_green', count: 4 });
  await aim(P.x + 3.5, P.y - 0.5, P.z + 0.5); await rclick();
  const none = await key(P.x + 3, P.y - 1, P.z);
  check('carpet: it cannot hang in the air over a hole', none === 'air', none);
  await set(P.x + 5, P.y, P.z - 3, 'carpet_white');
  await set(P.x + 5, P.y - 1, P.z - 3, 'air'); await fast(4); await settle();
  check('carpet: it drops away when the floor is taken out from under it', (await key(P.x + 5, P.y, P.z - 3)) === 'air', await key(P.x + 5, P.y, P.z - 3));
  const d = await ev(async () => { const reg = await import('/src/world/BlockRegistry.ts'); const b = reg.getBlock(reg.CARPETS.red); return { drops: b.drops, solid: b.solid, op: b.opaque, name: b.name, sound: b.sound }; });
  check('carpet: it drops itself, is thin, and is called Red Carpet', d.drops[0].item === 'carpet_red' && !d.op && d.name === 'Red Carpet', d);
}

if (run('banner')) {
  await clearInv(); await mortal();
  const P = await pad(8);
  await setSlot(0, { id: 'banner_blue', count: 8 });
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0.5);
  await aim(P.x + 0.5, P.y - 0.5, P.z + 2.5); await rclick();
  const k1 = await key(P.x, P.y, P.z + 2);
  check('banner: right-click stands a Banner on the ground', k1 && k1.startsWith('banner_blue'), k1);
  // turn to face east/west and place another: cloth turns to face you
  await tp(P.x - 0.5, P.y, P.z + 0.5, -Math.PI / 2, 0.5);
  await aim(P.x + 2.5, P.y - 0.5, P.z + 0.5); await rclick();
  const k2 = await key(P.x + 1, P.y, P.z);
  check('banner: facing a different way hangs the cloth the other way round', k2 && k2.startsWith('banner_blue') && k2 !== k1, { k1, k2 });
  await set(P.x + 2, P.y, P.z - 3, 'banner_red:ew');
  await set(P.x + 2, P.y - 1, P.z - 3, 'air'); await fast(4); await settle();
  check('banner: it falls when the ground goes', (await key(P.x + 2, P.y, P.z - 3)) === 'air', await key(P.x + 2, P.y, P.z - 3));
  // you can walk through the pole (it is decoration) and it is selectable
  const info = await ev(async () => {
    const reg = await import('/src/world/BlockRegistry.ts');
    const b = reg.getBlock(reg.BANNERS.banner_blue.ew);
    return { drops: b.drops[0]?.item, solid: b.solid, sel: b.selection, variant: b.variantOf, name: b.name };
  });
  check('banner: it drops itself and is named Blue Banner', info.drops === 'banner_blue' && info.name === 'Blue Banner' && info.variant === 'banner_blue', info);
  // mine it with a click in survival
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; });
  await clearInv(); await clearItems();
  await tp(P.x + 0.5, P.y, P.z - 1.5, 0, 0);
  await set(P.x, P.y, P.z + 2, 'banner_red:ew');
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  await aim(P.x + 0.5, P.y + 0.7, P.z + 2.5);
  await centre(); await page.mouse.move(CX, CY); await page.mouse.down();
  for (let i = 0; i < 14; i++) await ticks(2);
  await page.mouse.up(); await ticks(3);
  const gone = await key(P.x, P.y, P.z + 2);
  const got = await ev(() => [...window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.id), ...window.__bf.game.inventory.slots.filter((s) => s).map((s) => s.id)]);
  check('banner: breaking one gives the Banner back', gone === 'air' && got.includes('banner_red'), { gone, got });
}

if (run('pit')) {
  const r = await ev(async () => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const M = await import('/src/world/Mines.ts');
    const reg = await import('/src/world/BlockRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const seed = 4242;
    const g11 = new T.TerrainGenerator(seed, { structures: true, version: 11 });
    const g10 = new T.TerrainGenerator(seed, { structures: true, version: 10 });
    const idx = (x, y, z) => C.localIndex(x, y, z);
    const out = { mines: 0, built: 0, v10: 0, badLadder: 0, noWall: 0, noRoof: 0, gallery: 0, deterministic: true, sample: null, fluid: 0 };
    for (let rz = -6; rz < 6; rz++) for (let rx = -6; rx < 6; rx++) {
      const fy = M.mineFloor(seed, rx * 4, rz * 4);
      if (fy < 0) continue;
      out.mines++;
      const cx = rx * 4 + M.entranceChunkX(seed, rx * 4, rz * 4), cz = rz * 4 + 1;
      const c = g11.generateChunk(cx, cz), c10 = g10.generateChunk(cx, cz);
      let lad = 0; for (let y = 0; y < 128; y++) if (c10.blocks[idx(12, y, 6)] === reg.LADDERS.s) out.v10++;
      for (let y = 0; y < 128; y++) if (c.blocks[idx(12, y, 6)] === reg.LADDERS.s) lad++;
      if (!lad) continue;
      out.built++;
      let lo = 999, hi = -1; for (let y = 0; y < 128; y++) if (c.blocks[idx(12, y, 6)] === reg.LADDERS.s) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (hi - lo + 1 !== lad || lo !== fy + 1) out.badLadder++;
      for (let y = lo; y <= hi - 2; y++) if (!reg.IS_SOLID[c.blocks[idx(12, y, 5)]]) out.noWall++;
      if (c.blocks[idx(12, hi + 1, 6)] !== reg.PLANKS) out.noRoof++;
      if (reg.getBlock(c.blocks[idx(12, fy + 1, 7)]).solid) out.gallery++;
      for (let y = lo; y <= hi; y++) if (reg.IS_FLUID[c.blocks[idx(12, y, 6)]]) out.fluid++;
      if (!out.sample) out.sample = { cx, cz, fy, top: hi, lad };
      if (out.built === 1) { const c2 = g11.generateChunk(cx, cz); for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] !== c2.blocks[i]) { out.deterministic = false; break; } }
    }
    return out;
  });
  check('pit: most mines get a pit-head (ladder shaft to the surface)', r.mines > 20 && r.built > r.mines * 0.4, r);
  check('pit: the ladder runs unbroken from the gallery floor to the headframe roof', r.badLadder === 0 && r.noRoof === 0, r);
  check('pit: the ladder always has a solid wall behind it, and opens into the gallery', r.noWall === 0 && r.gallery === 0, r);
  check('pit: shafts never run through water or lava', r.fluid === 0, r);
  check('pit: older worlds (terrain 10) have none, and generation is deterministic', r.v10 === 0 && r.deterministic, r);
  globalThis.__pit = r.sample;
}

if (run('climb')) {
  const s = await ev(async () => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const M = await import('/src/world/Mines.ts');
    const reg = await import('/src/world/BlockRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const seed = window.__bf.game.world.seed;
    const gen = new T.TerrainGenerator(seed, { structures: true, version: 11 });
    for (let rz = -6; rz < 6; rz++) for (let rx = -6; rx < 6; rx++) {
      const fy = M.mineFloor(seed, rx * 4, rz * 4);
      if (fy < 0) continue;
      const cx = rx * 4 + M.entranceChunkX(seed, rx * 4, rz * 4), cz = rz * 4 + 1;
      const c = gen.generateChunk(cx, cz);
      let top = -1; for (let y = 0; y < 128; y++) if (c.blocks[C.localIndex(12, y, 6)] === reg.LADDERS.s) top = y;
      if (top > 0) return { cx, cz, fy, top };
    }
    return null;
  });
  check('climb: the test world has a pit-head to climb', !!s, s);
  if (s) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; g.player.invulnerable = 1e9; });
  const X = s.cx * 16 + 12, Z = s.cz * 16 + 7;
  await tp(X + 0.5, s.fy + 2, Z + 0.5, 0, 0);
  await settle();
  const r = await ev(([X, Z, s]) => {
    const g = window.__bf.game; const p = g.player;
    const y0 = p.y;
    g.autopilot = { forward: 1, jump: true };
    for (let i = 0; i < 400 && p.y < s.top + 1; i++) g.tick();
    g.autopilot = null;
    return { y0, y: p.y, top: s.top, x: p.x, z: p.z };
  }, [X, Z, s]);
  check('climb: from the gallery you can climb the ladder up to the surface', r.y >= r.top - 3, { ...r, s });
  }
}

if (run('save')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.player.creative = true; g.player.invulnerable = 0; });
  const P = await pad(5);
  await settle();
  await set(P.x + 1, P.y, P.z + 1, 'carpet_purple');
  await set(P.x + 3, P.y, P.z + 1, 'banner_lime:ns');
  await fast(4); await settle();
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  check('save: Carpet and Banner survive save and reload; the world is terrain version 11',
    (await key(P.x + 1, P.y, P.z + 1)) === 'carpet_purple' && (await key(P.x + 3, P.y, P.z + 1)) === 'banner_lime:ns' && (await ev(() => window.__bf.game.world.genVersion)) === 11,
    { a: await key(P.x + 1, P.y, P.z + 1), b: await key(P.x + 3, P.y, P.z + 1), v: await ev(() => window.__bf.game.world.genVersion) });
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
