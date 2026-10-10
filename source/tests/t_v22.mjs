// Tests for 2.2 "the Starhollow": the new blocks, items and recipes; the Starhollow's
// landscape (the main island, the Roost, the four pylons and their Storm Bells, the
// arrival gate, outer islands with Starfall shrines, the void); lighting a Stargate
// with a Star Lens and going there and back; the rules up there (a starry sky, no
// rain or sleep, maps, falling into the void and being carried home with everything);
// the Hollowdrake (circling, its shield and the Storm Bells, star bolts, swoops,
// resting on the Roost, Peaceful, the victory, Star Scales, the exit gate, calling it
// back with a Star Lens); the End screen (once per world); Starwings (gliding, wear,
// mending); Drifters; and saving it all.
// node tests/t_v22.mjs   (dev server)   ONLY=items,gen,gate,travel,rules,drake,end,wings,drifter,save,touch
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'gen', 'gate', 'travel', 'rules', 'drake', 'end', 'wings', 'drifter', 'save', 'touch'];
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
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const give = (stack, slot = 0) => ev(([stack, slot]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; g.inventory.selected = slot; g.inventory.changed(); }, [stack, slot]);
const sel = () => ev(() => { const g = window.__bf.game, s = g.inventory.slots[g.inventory.selected]; return s ? s.id + 'x' + s.count : null; });
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
const lclick = async () => { await centre(); await page.mouse.click(CX, CY); await ticks(3); await wait(60); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(400); };
const inGame = async () => { await waitFor(async () => (await screen()) === 'game', 90000); await ev(() => window.__bf.allowUnlocked(true)); await settle(); };
const calm = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
  for (const e of g.entities.list) if (e.type !== 'item' && e.mobType !== 'hollowdrake') e.removed = true;
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
  await clearChat();
  await wait(300);
  return ev(() => window.__bf.game.record.id);
}
/** A ring of eight Glimmerstone on flat ground in front of the player; returns its centre. */
const makeStarRing = () => ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 4, z = Math.floor(p.z), y = Math.floor(p.y);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    bf.setBlock(x + dx, y - 1, z + dz, 'stone');
    for (let dy = 0; dy <= 4; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
  }
  for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) bf.setBlock(x + dx, y, z + dz, 'glimmerstone');
  p.flying = false;
  g.teleport(x - 2.5 + 0.5, y + 1, z + 0.5);
  return { x, y, z };
});
const goStar = async () => {
  if ((await dim()) === 'starhollow') return;
  await ev(() => void window.__bf.engine.changeDimension('starhollow', { kind: 'gate', x: Math.floor(window.__bf.game.player.x), z: Math.floor(window.__bf.game.player.z), gate: 'star' }));
  await inGame();
  await calm();
};
const drake = () => ev(() => {
  const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake' && !e.removed);
  return d ? { hp: d.health, shielded: d.shielded, phase: d.phase, x: +d.x.toFixed(1), y: +d.y.toFixed(1), z: +d.z.toFixed(1), dying: d.dyingTicks } : null;
});

await page.goto(URL);
await page.mouse.move(CX, CY);

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const B = await import('/src/world/BlockRegistry.ts');
    const I = await import('/src/inventory/ItemRegistry.ts');
    const T = await import('/src/meshing/textureNames.ts');
    const P = await import('/src/systems/Progress.ts');
    const keys = ['starstone', 'starstone_bricks', 'starbloom', 'stargate', 'storm_bell', 'storm_bell_rung', 'roost'];
    return {
      ids: keys.map((k) => B.blockByKey(k)?.id ?? -1),
      tex: ['starstone', 'starstone_bricks', 'starbloom', 'stargate', 'storm_bell', 'storm_bell_rung', 'storm_bell_mount', 'roost'].map((k) => T.TEXTURE_NAMES.includes(k)), layers: T.TEXTURE_NAMES.length,
      light: [B.STARGATE, B.STORM_BELL, B.STORM_BELL_RUNG, B.STARBLOOM, B.ROOST].map((i) => B.LIGHT_EMISSION[i]),
      unbreakable: [B.STARGATE, B.STORM_BELL, B.STORM_BELL_RUNG, B.ROOST].map((i) => B.getBlock(i).hardness < 0 && B.getBlock(i).item === null),
      gateSolid: B.IS_SOLID[B.STARGATE],
      items: ['starstone', 'starstone_bricks', 'starbloom', 'star_lens', 'star_scale', 'drift_silk', 'star_wings', 'spawn_drifter'].map((i) => I.hasItem(i)),
      wings: I.getItem('star_wings').armor, wingsDur: I.getItem('star_wings').durability,
      adv: ['stargate', 'storm_bells', 'hollowdrake', 'glide'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.title ?? null),
    };
  });
  check('blocks: Starstone, Starstone Bricks, Starbloom, Stargate, Storm Bell (lit and silent) and the Roost Stone are blocks 266-272', JSON.stringify(t.ids) === '[266,267,268,269,270,271,272]', t.ids);
  check('blocks: each has its own texture (layers stay below 256)', t.tex.every(Boolean) && t.layers < 256, { tex: t.tex, layers: t.layers });
  check('blocks: a Stargate shines 13 and can be walked into; a lit Storm Bell 12, a silent one 0; Starbloom 9; gates, bells and the Roost can\'t be mined or carried',
    JSON.stringify(t.light) === '[13,12,0,9,4]' && t.gateSolid === 0 && t.unbreakable.every(Boolean), t);
  check('items: Star Lens, Star Scale, Drift Silk, Starwings (chest slot, 1 armour), the new blocks and a Drifter spawn egg', t.items.every(Boolean) && t.wings?.slot === 1 && t.wings?.points === 1 && t.wingsDur === 432, t);
  check('advancements: Among the Stars, Silence the Bells, Free the Stars, Take Wing', t.adv.every(Boolean), t.adv);
  const r = await ev(async () => {
    const bf = window.__bf;
    const R = await import('/src/crafting/recipes.ts');
    const grid = (...c) => [...c, ...Array(9 - c.length).fill(null)];
    return {
      lens: bf.craft([null, 'rune_shard', null, 'glimmer_dust', 'fire_opal', 'glimmer_dust', null, 'rune_shard', null]),
      wings: bf.craft(['star_scale', null, 'star_scale', 'star_scale', 'drift_silk', 'star_scale', 'star_scale', null, 'star_scale']),
      bricks: bf.craft(['starstone', 'starstone', 'starstone', 'starstone'], 2),
      dye: bf.craft(['starbloom'], 1),
      mend: R.specialCraft(grid({ id: 'star_wings', count: 1, damage: 300 }, { id: 'star_scale', count: 1 }, { id: 'star_scale', count: 1 })),
      mendNew: R.specialCraft(grid({ id: 'star_wings', count: 1 }, { id: 'star_scale', count: 1 })),
    };
  });
  check('recipes: Star Lens (Fire Opal, 2 Glimmer Dust, 2 Rune Shards), Starwings (6 Star Scales, Drift Silk), Starstone Bricks x4, Starbloom -> 2 purple dye',
    r.lens?.id === 'star_lens' && r.wings?.id === 'star_wings' && r.bricks?.id === 'starstone_bricks' && r.bricks.count === 4 && r.dye?.id === 'purple_dye' && r.dye.count === 2, r);
  check('recipes: worn Starwings + Star Scales are mended a third each (unworn: nothing)', r.mend?.id === 'star_wings' && r.mend.damage === 12 && r.mendNew === null, r);
}

// ======================================================================= GENERATION
if (run('gen')) {
  const g = await ev(async () => {
    const G = await import('/src/world/generators.ts');
    const S = await import('/src/world/Starhollow.ts');
    const B = await import('/src/world/BlockRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const gen = G.createGenerator('starhollow', 12345, { structures: true });
    const at = (x, y, z) => { const c = gen.generateChunk(x >> 4, z >> 4); return c.blocks[C.localIndex(x & 15, y, z & 15)]; };
    const name = (id) => B.getBlock(id).key;
    const ring = (cx, y, cz) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dz]) => name(at(cx + dx, y, cz + dz)));
    const out = {
      roost: name(at(S.ROOST.x, S.ROOST.y, S.ROOST.z)), roostRing: ring(S.ROOST.x, S.ROOST.y, S.ROOST.z), under: name(at(0, S.ISLAND_TOP, 0)),
      arrival: name(at(S.ARRIVAL.x, S.ARRIVAL.y, S.ARRIVAL.z)), arrivalRing: ring(S.ARRIVAL.x, S.ARRIVAL.y, S.ARRIVAL.z),
      bells: [0, 1, 2, 3].map((i) => { const p = S.bellPos(i); return name(at(p.x, p.y, p.z)); }),
      ladders: [0, 1, 2, 3].map((i) => { const p = S.PYLONS[i]; const lx = p.x + (p.x > 0 ? -2 : 2); return name(at(lx, S.ISLAND_TOP + 3, p.z)); }),
      voidCol: (() => { let n = 0; for (let y = 0; y < 128; y++) if (at(100, y, 0) !== 0) n++; return n; })(),
      islandBottom: (() => { for (let y = 0; y < 128; y++) if (at(0, y, 0) !== 0) return y; return -1; })(),
    };
    // outer islands, shrines, the same chunk twice, speed
    let outerBlocks = 0, shrines = 0, blooms = 0;
    const t0 = performance.now();
    let n = 0;
    for (let cx = -24; cx <= 24; cx += 3) for (let cz = -24; cz <= 24; cz += 3) {
      const c = gen.generateChunk(cx, cz); n++;
      if (Math.hypot(cx * 16 + 8, cz * 16 + 8) > 120) for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === B.STARSTONE) outerBlocks++;
      for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === B.STARBLOOM) blooms++;
      shrines += c.containers.filter((k) => k.loot === 'starfall').length;
    }
    out.ms = +((performance.now() - t0) / n).toFixed(2);
    out.outerBlocks = outerBlocks; out.shrines = shrines; out.blooms = blooms;
    const a = gen.generateChunk(9, -7).blocks, b = G.createGenerator('starhollow', 12345, { structures: true }).generateChunk(9, -7).blocks;
    out.same = a.every((v, i) => v === b[i]);
    out.spawn = gen.findSpawn();
    out.biome = gen.column(5, 5).biome;
    return out;
  });
  check('landscape: the Roost Stone sits in a ring of eight Glimmerstone on Starstone Bricks in the middle of the main island', g.roost === 'roost' && g.roostRing.every((k) => k === 'glimmerstone') && g.under === 'starstone_bricks', g);
  check('landscape: a lit Stargate in a ring of Glimmerstone waits at the arrival point on the island\'s south side', g.arrival === 'stargate' && g.arrivalRing.every((k) => k === 'glimmerstone'), g);
  check('landscape: four pylons, each with a lit Storm Bell on top and a ladder up the side that faces the Roost', g.bells.every((k) => k === 'storm_bell') && g.ladders.every((k) => k.startsWith('ladder')), g);
  check('landscape: the main island floats (empty void beneath it and around it, nothing at the bottom of the world)', g.voidCol === 0 && g.islandBottom > 15, g);
  check('landscape: outer islands lie beyond the gap, with Starblooms and some Starfall shrines with chests', g.outerBlocks > 2000 && g.blooms > 20 && g.shrines >= 1, g);
  check('landscape: every chunk is the same each time (a pure function of the seed), and quick to make', g.same && g.ms < 25, g);
}

// ======================================================================= GATE
let W = null;
if (run('gate') || run('travel') || run('rules') || run('drake') || run('end') || run('save')) W = await newWorld('Star World', 'stars22');
let ring = null;
if (run('gate')) {
  ring = await makeStarRing();
  await settle();
  await give({ id: 'star_lens', count: 2 });
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
  check('lighting: a Star Lens used on the middle of a ring of 8 Glimmerstone lights a Stargate (the lens is used)', (await key(ring.x, ring.y, ring.z)) === 'stargate' && (await sel()) === 'star_lensx1', { k: await key(ring.x, ring.y, ring.z), sel: await sel() });
  check('lighting: a message says what to do', (await chat()).some((c) => /Stargate is lit/.test(c)), await chat());
  await page.screenshot({ path: `${SHOTS}/v22_stargate.png` });
  await set(ring.x - 1, ring.y, ring.z, 'air');
  await ticks(3);
  check('a Stargate goes out when its ring is broken', (await key(ring.x, ring.y, ring.z)) === 'air', await key(ring.x, ring.y, ring.z));
  await set(ring.x - 1, ring.y, ring.z, 'glimmerstone');
  await give({ id: 'torch', count: 2 });
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
  check('...and a torch doesn\'t light a Glimmerstone ring (it is just placed)', (await key(ring.x, ring.y, ring.z)) !== 'stargate', await key(ring.x, ring.y, ring.z));
  await set(ring.x, ring.y, ring.z, 'air');
  await give({ id: 'star_lens', count: 2 });
  await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5);
  await rclick();
}

// ======================================================================= TRAVEL
if (run('travel')) {
  if (!ring) { ring = await makeStarRing(); await settle(); await give({ id: 'star_lens', count: 1 }); await aim(ring.x + 0.5, ring.y - 0.02, ring.z + 0.5); await rclick(); }
  check('travel: the Stargate is lit', (await key(ring.x, ring.y, ring.z)) === 'stargate');
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 0.3, z + 0.5); g.player.vx = g.player.vz = 0; }, [ring.x, ring.y, ring.z]);
  await ticks(20);
  const glow = await ev(() => ({ t: window.__bf.game.gateTicks, hud: window.__bf.ui.get().hud.gate, star: window.__bf.ui.get().hud.gateStar, cls: document.querySelector('[data-testid=gate-glow]')?.className }));
  check('travel: standing in it, a violet glow builds up', glow.t > 8 && glow.hud > 0.1 && glow.star && /stargate-glow/.test(glow.cls ?? ''), glow);
  const sawLoading = await waitFor(async () => (await screen()) === 'loading', 8000);
  const title = await ev(() => window.__bf.ui.get().loading?.title);
  check('travel: after 3 seconds: "Entering the Starhollow"', sawLoading && title === 'Entering the Starhollow', { sawLoading, title });
  await inGame();
  const there = await ev(async () => {
    const g = window.__bf.game, p = g.player, S = await import('/src/world/Starhollow.ts');
    return { dim: g.dim, x: p.x, y: p.y, z: p.z, from: g.record.star?.from, adv: g.progress.done.has('stargate'), gate: window.__bf.getBlock(S.ARRIVAL.x, S.ARRIVAL.y, S.ARRIVAL.z), A: S.ARRIVAL, sky: window.__bf.engine.renderer.sky.group.visible, msg: window.__bf.ui.get().chat.map((c) => c.text) };
  });
  check('travel: you arrive in the Starhollow beside its arrival Stargate (whatever spot on the surface you left from)', there.dim === 'starhollow' && Math.hypot(there.x - there.A.x, there.z - there.A.z) < 2.5 && there.gate === 'stargate', there);
  check('travel: the spot you left from is remembered, "Among the Stars" is granted, and a message tells of the Hollowdrake', there.from?.x === ring.x && there.from?.z === ring.z && there.adv && there.msg.some((m) => /Hollowdrake/.test(m)), there);
  check('travel: a sky full of stars (the sky is drawn; it is always night up here)', there.sky, there);
  await calm();
  await ev(() => { const p = window.__bf.game.player; p.pitch = 0.15; });
  await ticks(10);
  await page.screenshot({ path: `${SHOTS}/v22_arrival.png` });
  // home again through the arrival gate
  await ev(async () => { const g = window.__bf.game, S = await import('/src/world/Starhollow.ts'); g.gateCooldown = 0; g.teleport(S.ARRIVAL.x + 0.5, S.ARRIVAL.y + 0.3, S.ARRIVAL.z + 0.5); });
  const back = await waitFor(async () => (await screen()) === 'loading', 8000);
  const t2 = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const home = await ev(() => { const g = window.__bf.game, p = g.player; return { dim: g.dim, x: p.x, z: p.z }; });
  check('travel: the arrival gate takes you home, beside the Stargate you left by ("Returning to the surface")', back && t2 === 'Returning to the surface' && home.dim === 'overworld' && Math.hypot(home.x - ring.x - 0.5, home.z - ring.z - 0.5) < 2.5, { t2, home, ring });
}

// ======================================================================= RULES
if (run('rules')) {
  await goStar();
  const r = await ev(() => {
    const g = window.__bf.game, p = g.player;
    window.__bf.ui.set({ chat: [] });
    g.trySleep(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    const sleepMsg = window.__bf.ui.get().chat.map((c) => c.text);
    return { sleepMsg, precip: g.precipAt(Math.floor(p.x), Math.floor(p.z)), clouds: window.__bf.engine.renderer.sky.cloudsEnabled };
  });
  check('rules: no sleeping ("only the stars"), no rain or snow, no clouds', r.sleepMsg.some((m) => /only the stars/.test(m)) && r.precip === 0 && r.clouds === false, r);
  // the void: carried home with everything
  const before = await ev(() => { const g = window.__bf.game; g.inventory.slots[5] = { id: 'iron_ingot', count: 7 }; g.inventory.changed(); const p = g.player; p.flying = false; g.teleport(p.x + 70, 40, p.z + 70); return { hp: p.health }; });
  const left = await waitFor(async () => (await screen()) === 'loading', 15000);
  const t = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const after = await ev(() => { const g = window.__bf.game, p = g.player; return { dim: g.dim, dead: p.dead, inv: window.__bf.inventory(), msg: window.__bf.ui.get().chat.map((c) => c.text), at: [p.x, p.z], spawn: [p.spawnX, p.spawnZ] }; });
  check('rules: falling into the void: the stars catch you and carry you home ("Going home") - not dead, nothing lost', left && t === 'Going home' && after.dim === 'overworld' && !after.dead && after.inv.includes('5:iron_ingotx7') && after.msg.some((m) => /stars caught you/.test(m)), { t, after });
  check('rules: ...you wake at your spawn point (no bed)', Math.hypot(after.at[0] - after.spawn[0], after.at[1] - after.spawn[1]) < 2, after);
}

// ======================================================================= THE HOLLOWDRAKE
if (run('drake')) {
  await goStar();
  await ev(() => { const g = window.__bf.game; g.difficulty = 'normal'; });
  const appeared = await waitFor(async () => !!(await drake()), 15000);
  let d = await drake();
  check('Hollowdrake: it is there, circling high over the Roost, with 100 hearts, shielded', appeared && d.hp === 200 && d.shielded && d.y > 75, d);
  await waitFor(async () => !!(await ev(() => window.__bf.ui.get().boss)), 5000);
  const bar = await ev(() => ({ boss: window.__bf.ui.get().boss, text: document.querySelector('[data-testid=boss-bar]')?.textContent }));
  check('Hollowdrake: its health bar shows at the top, with the four Storm Bells that shield it', bar.boss?.name === 'Hollowdrake' && bar.boss.hp === 1 && bar.boss.shield && /4 Storm Bells/.test(bar.text ?? ''), bar);
  await page.screenshot({ path: `${SHOTS}/v22_drake.png` });
  // the shield turns blows aside
  const sh = await ev(() => { const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake'); window.__bf.ui.set({ chat: [] }); d.invulnerable = 0; d.hurt(20, g, 0, 1, true); return { hp: d.health, msg: window.__bf.ui.get().chat.map((c) => c.text) }; });
  check('Hollowdrake: while the Storm Bells ring, blows bounce off its shield (and a message says to ring them)', sh.hp === 200 && sh.msg.some((m) => /ring all four/.test(m)), sh);
  // ring the bells: climb (teleport) to each pylon top and right-click the bell
  const bells = await ev(async () => { const S = await import('/src/world/Starhollow.ts'); return [0, 1, 2, 3].map((i) => S.bellPos(i)); });
  const left = [];
  for (const bp of bells) {
    await ev((bp) => { const g = window.__bf.game, p = g.player; p.flying = false; g.teleport(bp.x + 1.5, bp.y, bp.z + 0.5); }, bp);
    await settle();
    await give(null);
    await aim(bp.x + 0.5, bp.y + 0.45, bp.z + 0.5);
    await rclick();
    left.push(await ev(() => window.__bf.game.star.bellsLeft));
  }
  const after = await ev((bells) => ({ blocks: bells.map((b) => window.__bf.getBlock(b.x, b.y, b.z)), adv: window.__bf.game.progress.done.has('storm_bells'), msg: window.__bf.ui.get().chat.map((c) => c.text) }), bells);
  check('Storm Bells: right-clicking each bell rings it once and it falls silent (3, 2, 1, 0 left)', JSON.stringify(left) === '[3,2,1,0]' && after.blocks.every((k) => k === 'storm_bell_rung'), { left, after });
  check('Storm Bells: when the last falls silent, the shield is gone ("Silence the Bells")', after.adv && after.msg.some((m) => /shield is gone/.test(m)), after);
  await ticks(25);
  d = await drake();
  check('Hollowdrake: no shield any more', d && !d.shielded, d);
  // now it can be hurt; harder while it rests on the Roost
  const dmg = await ev(() => {
    const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
    d.invulnerable = 0; d.hurt(10, g, 0, 1, true); const a = d.health;
    d.phase = 'perch'; d.invulnerable = 0; d.hurt(10, g, 0, 1, true); const b = d.health;
    d.phase = 'circle';
    return { a, b };
  });
  check('Hollowdrake: unshielded it takes damage; resting on the Roost, half as much again', dmg.a === 190 && dmg.b === 175, dmg);
  // a star bolt and a swoop hurt the player (not on Peaceful)
  // (down on open ground between the Roost and the arrival gate, away from walls)
  await ev(() => { const g = window.__bf.game, p = g.player; p.flying = false; g.teleport(6.5, g.world.highestSolid(6, 26) + 1, 26.5); p.vx = p.vy = p.vz = 0; p.fallDistance = 0; });
  await settle();
  const hits = await ev(() => {
    const g = window.__bf.game, p = g.player, d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
    const stand = () => { g.teleport(6.5, g.world.highestSolid(6, 26) + 1, 26.5); p.vx = p.vy = p.vz = 0; p.fallDistance = 0; for (let i = 0; i < 4; i++) g.tick(); p.vx = p.vy = p.vz = 0; };
    stand();
    p.health = 20; p.invulnerable = 0;
    g.entities.spawnStarBolt(p.x, p.y + 1, p.z - 3, 0, 0, 0.6, d, 4);
    for (let i = 0; i < 12; i++) g.tick();
    const bolt = 20 - p.health;
    // a swoop: put it close and let it dive
    stand();
    p.health = 20; p.invulnerable = 0;
    d.setPos(p.x, p.y + 6, p.z - 6); d.phase = 'swoop'; d.phaseTicks = 0; d.struck = false;
    let maxVy = 0, swoop = 0;
    for (let i = 0; i < 60 && !swoop; i++) { g.tick(); if (p.health < 20) { swoop = 20 - p.health; maxVy = p.vy; } }
    // Peaceful: knocked about but unhurt
    stand();
    g.difficulty = 'peaceful'; p.health = 20; p.invulnerable = 0;
    d.setPos(p.x, p.y + 6, p.z - 6); d.phase = 'swoop'; d.phaseTicks = 0; d.struck = false;
    let struck = false;
    for (let i = 0; i < 60 && !struck; i++) { g.tick(); struck = d.attackAnim > 0; }   // (it strikes, then climbs away)
    const peaceful = { struck, hurt: 20 - p.health };
    g.difficulty = 'normal';
    return { bolt, swoop, maxVy, peaceful };
  });
  check('Hollowdrake: its star bolts hurt (2 hearts on Normal)', hits.bolt === 4, hits);
  check('Hollowdrake: it swoops down and strikes (3 hearts) and knocks you up and away', hits.swoop === 6 && hits.maxVy > 0.3, hits);
  check('Hollowdrake: on Peaceful its strikes don\'t hurt', hits.peaceful.struck && hits.peaceful.hurt === 0, hits.peaceful);
  // the victory
  const v = await ev(async () => {
    const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
    const S = await import('/src/world/Starhollow.ts');
    d.invulnerable = 0; d.hurt(500, g, 0, 1, true);
    const dying = d.phase;
    for (let i = 0; i < 110; i++) g.tick();
    const scales = g.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'star_scale' && Math.hypot(e.x - S.ROOST.x, e.z - S.ROOST.z) < 4).reduce((n, e) => n + e.stack.count, 0);
    return { dying, gone: !g.entities.list.some((e) => e.mobType === 'hollowdrake' && !e.removed), scales, gate: window.__bf.getBlock(S.ROOST.x, S.ROOST.y, S.ROOST.z), state: g.record.star, adv: g.progress.done.has('hollowdrake'), xp: g.entities.list.filter((e) => e.type === 'xp').length, boss: window.__bf.ui.get().boss, msg: window.__bf.ui.get().chat.map((c) => c.text) };
  });
  check('victory: beaten, it rises and fades into starlight', v.dying === 'dying' && v.gone, v);
  check('victory: 8 Star Scales and a heap of experience on the Roost; the health bar goes', v.scales === 8 && v.xp > 3 && v.boss === null, v);
  check('victory: a Stargate lights on the Roost, "Free the Stars", and the world remembers', v.gate === 'stargate' && v.adv && v.state.dragon === 'dead' && v.state.wins === 1 && v.msg.some((m) => /fades into starlight/.test(m)), v);
  await ev(async () => { const S = await import('/src/world/Starhollow.ts'); const g = window.__bf.game; g.teleport(S.ROOST.x + 3.5, S.ROOST.y + 1, S.ROOST.z + 0.5); });
  await settle();
  await page.screenshot({ path: `${SHOTS}/v22_victory.png` });
}

// ======================================================================= THE END
if (run('end')) {
  await goStar();
  // (if the drake test didn't run, beat it now)
  await ev(async () => {
    const g = window.__bf.game, S = await import('/src/world/Starhollow.ts');
    if (g.record.star?.dragon !== 'dead') {
      for (let i = 0; i < 4; i++) { const p = S.bellPos(i); window.__bf.setBlock(p.x, p.y, p.z, 'storm_bell_rung'); }
      for (let i = 0; i < 40; i++) g.tick();
      const d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
      if (d) { d.shielded = false; d.invulnerable = 0; d.hurt(500, g, 0, 1, true); for (let i = 0; i < 110; i++) g.tick(); }
    }
  });
  await ev(async () => { const g = window.__bf.game, S = await import('/src/world/Starhollow.ts'); g.gateCooldown = 0; g.teleport(S.ROOST.x + 0.5, S.ROOST.y + 0.3, S.ROOST.z + 0.5); });
  const shown = await waitFor(() => ev(() => !!document.querySelector('[data-testid=the-end]')), 10000);
  await wait(2500);
  const txt = await ev(() => document.querySelector('[data-testid=the-end]')?.textContent ?? '');
  check('the End: stepping into the Roost\'s Stargate after the victory shows the End screen: a story and the credits', shown && /THE END/.test(txt) && /Thank you for playing/.test(txt), txt.slice(0, 200));
  await page.screenshot({ path: `${SHOTS}/v22_end.png` });
  await page.click('[data-testid=btn-end-skip]');
  const went = await waitFor(async () => (await screen()) === 'loading', 8000);
  const t = await ev(() => window.__bf.ui.get().loading?.title);
  await inGame();
  const home = await ev(() => ({ dim: window.__bf.game.dim, seen: window.__bf.game.record.star?.seenEnd, msg: window.__bf.ui.get().chat.map((c) => c.text) }));
  check('the End: Skip (or the end of the words) takes you home ("Going home"), and it is marked as seen', went && t === 'Going home' && home.dim === 'overworld' && home.seen === true && home.msg.some((m) => /home again/.test(m)), { t, home });
  // the second time: straight home
  await goStar();
  await ev(async () => { const g = window.__bf.game, S = await import('/src/world/Starhollow.ts'); g.gateCooldown = 0; g.teleport(S.ROOST.x + 0.5, S.ROOST.y + 0.3, S.ROOST.z + 0.5); });
  const went2 = await waitFor(async () => (await screen()) === 'loading', 8000);
  const noEnd = await ev(() => !document.querySelector('[data-testid=the-end]'));
  await inGame();
  check('the End: it shows only once; after that the Roost\'s gate goes straight home', went2 && noEnd && (await dim()) === 'overworld', { went2, noEnd });
  // calling it back
  await goStar();
  await settle();
  const s = await ev(async () => {
    const g = window.__bf.game, S = await import('/src/world/Starhollow.ts'), p = g.player;
    p.flying = true; g.teleport(S.ROOST.x + 0.5, S.ROOST.y + 2, S.ROOST.z + 2.5);   // (within reach)
    g.inventory.slots[0] = { id: 'star_lens', count: 1 }; g.inventory.selected = 0; g.inventory.changed();
    return S.ROOST;
  });
  await ticks(3);
  await aim(s.x + 0.5, s.y + 0.78, s.z + 0.5);
  await rclick();
  await ticks(30);
  const back = await ev(async () => { const g = window.__bf.game, S = await import('/src/world/Starhollow.ts'); return { roost: window.__bf.getBlock(S.ROOST.x, S.ROOST.y, S.ROOST.z), bells: [0, 1, 2, 3].map((i) => { const p = S.bellPos(i); return window.__bf.getBlock(p.x, p.y, p.z); }), state: g.record.star.dragon, drake: g.entities.list.some((e) => e.mobType === 'hollowdrake' && !e.removed), inv: g.inventory.slots[0] }; });
  check('calling it back: a Star Lens on the Roost\'s gate relights the four Storm Bells and the Hollowdrake rises again', back.roost === 'roost' && back.bells.every((k) => k === 'storm_bell') && back.state === 'alive' && back.drake && !back.inv, back);
}

// ======================================================================= WINGS
if (run('wings')) {
  if (!W) W = await newWorld('Wing World', 'wings22');
  if ((await dim()) !== 'overworld') { await ev(() => void window.__bf.engine.changeDimension('overworld', { kind: 'home' })); await inGame(); }
  await calm();
  const g0 = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z), y = 100;
    // a tower to jump off
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(x + dx, y - 1, z + dz, 'stone');
    p.flying = false; g.teleport(x + 0.5, y, z + 0.5); p.yaw = 0; p.pitch = -0.15;
    g.inventory.slots[37] = { id: 'star_wings', count: 1 }; g.inventory.changed();
    return { x, y, z };
  });
  await settle();
  const res = await ev(async () => {
    const g = window.__bf.game, p = g.player, input = window.__bf.engine.input;
    // step off the edge, fall a moment, then jump in mid-air
    g.teleport(p.x, p.y, p.z - 2.2); p.vx = 0; p.vz = 0;
    for (let i = 0; i < 6; i++) g.tick();
    input.virtualKey('Space', true); g.tick(); input.virtualKey('Space', false); g.tick();
    const started = p.gliding;
    const y0 = p.y, z0 = p.z;
    let maxSpeed = 0;
    for (let i = 0; i < 100 && p.gliding; i++) { g.tick(); maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vz)); }
    return { started, dy: +(y0 - p.y).toFixed(1), dz: +(z0 - p.z).toFixed(1), maxSpeed: +maxSpeed.toFixed(2), still: p.gliding, wear: g.inventory.slots[37]?.damage ?? 0, adv: g.progress.done.has('glide'), fov: window.__bf.ui.get().hud.gliding };
  });
  check('wings: wearing Starwings, jumping while falling starts a glide', res.started, res);
  check('wings: a glide carries you far forward while sinking slowly (5 s: well over 20 blocks on, under a third as far down)', res.dz > 20 && res.dy < res.dz / 3, res);
  check('wings: gliding wears the wings (1 a second) and earns "Take Wing"', res.wear >= 4 && res.adv, res);
  // landing: a wide floor near where we started (the long glide above has left the loaded land behind)
  const land = await ev((g0) => {
    const bf = window.__bf, g = bf.game, p = g.player;
    for (let dx = -15; dx <= 15; dx++) for (let dz = -15; dz <= 15; dz++) { bf.setBlock(g0.x + dx, g0.y - 12, g0.z + dz, 'stone'); for (let dy = -11; dy <= -6; dy++) bf.setBlock(g0.x + dx, g0.y + dy, g0.z + dz, 'air'); }
    g.teleport(g0.x + 0.5, g0.y - 8, g0.z + 0.5); p.vx = p.vy = p.vz = 0; p.yaw = 0; p.pitch = -0.7; p.fallDistance = 0;
    p.gliding = true;
    const h0 = p.health;
    for (let i = 0; i < 400 && !p.onGround && !p.inWater; i++) g.tick();
    for (let i = 0; i < 3; i++) g.tick();
    return { ground: p.onGround, water: p.inWater, gliding: p.gliding, hurt: h0 - p.health };
  }, g0);
  check('wings: landing (on the ground or in water) ends the glide, and it doesn\'t hurt', (land.ground || land.water) && !land.gliding && land.hurt === 0, land);
  const no = await ev(() => {
    const g = window.__bf.game, p = g.player, input = window.__bf.engine.input;
    g.inventory.slots[37] = null; g.inventory.changed();
    g.teleport(p.x, p.y + 20, p.z);
    for (let i = 0; i < 6; i++) g.tick();
    input.virtualKey('Space', true); g.tick(); input.virtualKey('Space', false); g.tick();
    return p.gliding;
  });
  check('wings: without wings, jumping in mid-air does nothing', no === false, no);
  await ev(() => { const g = window.__bf.game; for (let i = 0; i < 200 && !g.player.onGround; i++) g.tick(); });
}

// ======================================================================= DRIFTERS
if (run('drifter')) {
  await goStar();
  const d = await ev(async () => {
    const g = window.__bf.game, p = g.player;
    // (keep the Hollowdrake out of it: this is about Drifters)
    g.difficulty = 'peaceful';
    for (const e of g.entities.list) if (e.mobType === 'hollowdrake') e.tick = function () { this.beginTick(); };
    const m = g.entities.spawnMob('drifter', p.x + 3, p.y + 6, p.z, g);
    const y0 = m.y;
    for (let i = 0; i < 100; i++) g.tick();
    const drift = { dy: +(m.y - y0).toFixed(2), alive: m.alive };
    // spawning on its own
    for (const e of g.entities.list) if (e.mobType === 'drifter') e.removed = true;
    g.rules.doMobSpawning = true;
    for (let i = 0; i < 1200; i++) g.tick();
    const n = g.entities.list.filter((e) => e.mobType === 'drifter' && !e.removed).length;
    g.rules.doMobSpawning = false;
    // drops
    const k = g.entities.spawnMob('drifter', p.x + 2, p.y + 2, p.z, g);
    k.hurt(50, g, 0, 1, true);
    for (let i = 0; i < 25; i++) g.tick();
    // (on the ground, or already picked up)
    const silk = g.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'drift_silk').length + g.inventory.slots.filter((x) => x?.id === 'drift_silk').length;
    return { drift, n, silk };
  });
  check('Drifters: they float (no falling) and drift about', d.drift.alive && Math.abs(d.drift.dy) < 4, d);
  check('Drifters: they drift in on their own in the Starhollow (at most 5 about)', d.n >= 1 && d.n <= 5, d);
  check('Drifters: one drops Drift Silk', d.silk >= 1, d);
}

// ======================================================================= SAVE
if (run('save')) {
  await goStar();
  const st0 = await ev(() => { const g = window.__bf.game; return { star: JSON.parse(JSON.stringify(g.record.star ?? null)), id: g.record.id }; });
  await ev(() => { const p = window.__bf.game.player; window.__bf.setBlock(Math.floor(p.x) + 2, Math.floor(p.y) + 2, Math.floor(p.z), 'starstone_bricks'); });
  const spot = await ev(() => { const p = window.__bf.game.player; return { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 2, z: Math.floor(p.z) }; });
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  await ev((id) => void window.__bf.engine.playWorld(id), st0.id);
  const lt = await waitFor(async () => (await ev(() => window.__bf.ui.get().loading?.title)) === 'Loading world: the Starhollow', 8000);
  await inGame();
  const again = await ev((S) => ({ dim: window.__bf.game.dim, block: window.__bf.getBlock(S.x, S.y, S.z), star: window.__bf.game.record.star }), spot);
  check('save: reopening a world left in the Starhollow puts you back up there, with what you built and its Hollowdrake state', lt && again.dim === 'starhollow' && again.block === 'starstone_bricks' && JSON.stringify(again.star?.dragon) === JSON.stringify(st0.star?.dragon), { lt, again, st0 });
  const old = await ev(async () => {
    const G = await import('/src/world/generators.ts');
    return { need: G.needsNewerGenerator({ genVersion: 6, dims: { cinderdeep: { genVersion: 2 }, starhollow: { genVersion: 1 } }, player: { dim: 'starhollow' } }), needV2: G.needsNewerGenerator({ genVersion: 6, dims: { starhollow: { genVersion: 2 } } }) };
  });
  check('save: 2.2 opens Starhollow worlds; a newer Starhollow generator would need a newer Blockfell', !old.need && old.needV2, old);
}


// ======================================================================= TOUCH (iPad)
if (run('touch')) {
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
  await page.close();
  const TW = 1180, TH = 820;
  const ctx = await b.newContext({ viewport: { width: TW, height: TH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const TX = TW * 0.62, TY = TH * 0.3;
  // a quick tap: both events sent together, 60 ms apart by their own timestamps (swiftshader frames are slow)
  const tapAt = async (x, y) => {
    await wait(300);
    const ts = Date.now() / 1000;
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: ts, touchPoints: [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: ts + 0.06, touchPoints: [] }),
    ]);
    await ticks(4); await wait(100);
  };
  await page.goto(URL);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await ev(() => document.querySelector('[data-testid=btn-singleplayer]').click()); await wait(300);
  await ev(() => document.querySelector('[data-testid=btn-create-new]').click()); await wait(300);
  await page.fill('[data-testid=world-name]', 'iPad Stars'); await page.fill('[data-testid=world-seed]', 'ipad22');
  await ev(() => document.querySelector('[data-testid=btn-create-world]').click());
  await waitFor(async () => (await screen()) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await settle();
  await goStar();
  // keep the Hollowdrake still, just in front of the first pylon
  const bp = await ev(async () => {
    const g = window.__bf.game, S = await import('/src/world/Starhollow.ts');
    g.difficulty = 'peaceful';
    const d = g.entities.list.find((e) => e.mobType === 'hollowdrake');
    if (d) d.tick = function () { this.beginTick(); };
    return S.bellPos(0);
  });
  await ev((bp) => { const g = window.__bf.game, p = g.player; p.flying = false; g.teleport(bp.x + 1.5, bp.y, bp.z + 0.5); }, bp);
  await settle();
  await give(null);
  await aim(bp.x + 0.5, bp.y + 0.45, bp.z + 0.5);
  await tapAt(TX, TY);
  const rung = await ev((bp) => ({ touch: window.__bf.ui.get().touch, block: window.__bf.getBlock(bp.x, bp.y, bp.z), left: window.__bf.game.star.bellsLeft }), bp);
  check('touch: on an iPad, tapping a Storm Bell rings it', rung.touch && rung.block === 'storm_bell_rung' && rung.left === 3, rung);
  // a tap on the (still shielded) Hollowdrake is a blow that bounces off
  const dpos = await ev((bp) => { const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake'); window.__bf.ui.set({ chat: [] }); d.setPos(bp.x - 3, bp.y + 1, bp.z + 0.5); d.prevX = d.x; d.prevY = d.y; d.prevZ = d.z; d.invulnerable = 0; return { x: d.x, y: d.y + 1.4, z: d.z }; }, bp);
  await give({ id: 'stone_sword', count: 1 });
  await aim(dpos.x, dpos.y, dpos.z);
  await tapAt(TX, TY);
  const bounced = await ev(() => { const g = window.__bf.game, d = g.entities.list.find((e) => e.mobType === 'hollowdrake'); return { hp: d.health, msg: window.__bf.ui.get().chat.map((c) => c.text) }; });
  check('touch: tapping the shielded Hollowdrake strikes it (and the shield turns the blow)', bounced.hp === 200 && bounced.msg.some((m) => /ring all four|Storm Bells/.test(m)), bounced);
  // Starwings: the Jump button in mid-air starts a glide
  await ev(() => { const g = window.__bf.game, p = g.player; g.inventory.slots[37] = { id: 'star_wings', count: 1 }; g.inventory.changed(); p.flying = false; g.teleport(0.5, 110, 30.5); p.vx = p.vy = p.vz = 0; p.yaw = Math.PI; p.pitch = -0.1; });
  await waitFor(() => ev(() => window.__bf.game.player.vy < -0.2), 8000);
  const box = await page.locator('[data-testid=touch-jump]').boundingBox();
  const jx = box.x + box.width / 2, jy = box.y + box.height / 2;
  const ts = Date.now() / 1000;
  await Promise.all([
    cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: ts, touchPoints: [{ x: jx, y: jy, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }),
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: ts + 0.08, touchPoints: [] }),
  ]);
  await ticks(6);
  const gl = await ev(() => { const p = window.__bf.game.player; return { gliding: p.gliding, vy: +p.vy.toFixed(2), y: +p.y.toFixed(1) }; });
  check('touch: wearing Starwings, tapping Jump in mid-air starts a glide', gl.gliding, gl);
  await ev(() => { const g = window.__bf.game; g.player.gliding = false; g.player.flying = true; });
}

console.log('\nerrors:', JSON.stringify(errors.slice(0, 8)));
check('no page errors', errors.length === 0, errors.slice(0, 8));
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} passed`);
fs.writeFileSync('/tmp/t_v22.json', JSON.stringify(results, null, 1));
await b.close();
process.exit(fails.length ? 1 : 0);
