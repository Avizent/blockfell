// Tests for 1.4: fences and gates, ladders, trapdoors, glass panes, flower dyes and
// coloured wool, signs, lanterns, flower pots and paintings.
// Run against the dev server: node tests/t_decor.mjs  (ONLY=fences,signs ... to pick sections)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = Number(process.env.VW || 1280), VH = Number(process.env.VH || 720);
const page = await b.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 5000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const CX = VW / 2, CY = VH / 2;
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const lclick = async () => { await centre(); await page.mouse.click(CX, CY); await ticks(3); await wait(100); };
const run = (name) => {
  if (only && !only.includes(name)) return false;
  return true;
};
const closeOverlays = () => page.evaluate(() => { if (window.__bf.state().overlay) window.__bf.engine.closeOverlay(); });

await page.goto(URL);
await page.mouse.move(CX, CY);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Decor Test');
await page.fill('[data-testid=world-seed]', 'decor');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
await wait(2500);

const give = (id, slot = 0, count = 64) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const count = (id) => ev((id) => window.__bf.game.inventory.countItem(id), id);
const setMode = (m) => ev((m) => { const g = window.__bf.game; g.setGameMode(m); g.player.flying = false; }, m);
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const tp = (x, y, z, yaw = null, pitch = null) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); if (yaw !== null) g.player.yaw = yaw; if (pitch !== null) g.player.pitch = pitch; }, [x, y, z, yaw, pitch]);
const drops = (id) => ev((id) => window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed && e.stack.id === id).reduce((a, e) => a + e.stack.count, 0), id);
const clearDrops = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item') e.removed = true; });
const autopilot = (m) => ev((m) => { window.__bf.game.autopilot = m; }, m);
const pos = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z }; });
// yaw that looks toward -Z (north) is 0; toward +X (east) is -PI/2
const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };

// A flat grass test area on stone at spawn, open to the sky, around noon, no creatures.
const base = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.rules.doMobSpawning = false;
  g.rules.doDaylightCycle = false;
  g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true);
  for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 3;
  for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) {
    bf.setBlock(x0 + dx, y - 2, z0 + dz, 'stone');
    bf.setBlock(x0 + dx, y - 1, z0 + dz, 'stone');
    bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
    for (let k = 1; k <= 12; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  g.setGameMode('survival'); g.player.flying = false;
  g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  g.dayNight.time = 6000;
  return { x: x0, y, z: z0 };
});
await wait(2000);
const X = base.x, Y = base.y + 1, Z = base.z;   // Y = first air layer above the grass

// ================================================================== ITEMS AND RECIPES
if (run('items')) {
  await closeOverlays();
  const it = await ev(() => {
    const ids = ['oak_fence', 'oak_fence_gate', 'ladder', 'oak_trapdoor', 'glass_pane', 'sign', 'lantern', 'flower_pot', 'painting'];
    const all = window.__bf.items();
    const byId = Object.fromEntries(all.map((i) => [i.id, i]));
    return {
      missing: ids.filter((i) => !byId[i]),
      deco: ids.filter((i) => byId[i]?.category === 'decoration').length,
      dyes: all.filter((i) => i.id.endsWith('_dye')).length,
      wools: all.filter((i) => i.id.endsWith('_wool') && i.block !== undefined).length,
      flowers: ['flower_blue', 'flower_white'].filter((i) => byId[i]).length,
      names: [byId.flower_blue?.name, byId.flower_white?.name, byId.light_blue_dye?.name, byId.magenta_wool?.name],
    };
  });
  check('all new decoration items exist, in their own creative tab', it.missing.length === 0 && it.deco === 9, it);
  check('16 dyes, 15 new wool colours and two new flowers', it.dyes === 16 && it.wools === 15 && it.flowers === 2, it);
  const craft = (grid, w = 3) => ev(([grid, w]) => window.__bf.craft(grid, w), [grid, w]);
  const _ = null;
  const r = {
    fence: await craft(['planks', 'stick', 'planks', 'planks', 'stick', 'planks', _, _, _]),
    gate: await craft(['stick', 'planks', 'stick', 'stick', 'planks', 'stick', _, _, _]),
    ladder: await craft(['stick', _, 'stick', 'stick', 'stick', 'stick', 'stick', _, 'stick']),
    trapdoor: await craft(['planks', 'planks', 'planks', 'planks', 'planks', 'planks', _, _, _]),
    pane: await craft(['glass', 'glass', 'glass', 'glass', 'glass', 'glass', _, _, _]),
    sign: await craft(['planks', 'planks', 'planks', 'planks', 'planks', 'planks', _, 'stick', _]),
    lantern: await craft([_, 'iron_ingot', _, 'glass', 'torch', 'glass', _, 'glass', _]),
    potBricks: await craft(['bricks', _, 'bricks', _, 'bricks', _, _, _, _]),
    potTerracotta: await craft(['terracotta', _, 'terracotta', _, 'terracotta', _, _, _, _]),
    painting: await craft(['stick', 'stick', 'stick', 'stick', 'lime_wool', 'stick', 'stick', 'stick', 'stick']),
  };
  check('fence: planks and sticks make 3', r.fence?.id === 'oak_fence' && r.fence.count === 3, r.fence);
  check('fence gate from sticks and planks', r.gate?.id === 'oak_fence_gate', r.gate);
  check('ladder: seven sticks make 3', r.ladder?.id === 'ladder' && r.ladder.count === 3, r.ladder);
  check('trapdoor: six planks make 2', r.trapdoor?.id === 'oak_trapdoor' && r.trapdoor.count === 2, r.trapdoor);
  check('glass pane: six glass make 16', r.pane?.id === 'glass_pane' && r.pane.count === 16, r.pane);
  check('sign: six planks and a stick make 3', r.sign?.id === 'sign' && r.sign.count === 3, r.sign);
  check('lantern from iron, glass and a torch', r.lantern?.id === 'lantern', r.lantern);
  check('flower pot from bricks or terracotta', r.potBricks?.id === 'flower_pot' && r.potTerracotta?.id === 'flower_pot', [r.potBricks, r.potTerracotta]);
  check('painting: sticks around any wool', r.painting?.id === 'painting', r.painting);
  const d = {
    red: await craft(['flower_red'], 1), yellow: await craft(['flower_yellow'], 1), blue: await craft(['flower_blue'], 1),
    white: await craft(['flower_white'], 1), bone: await craft(['bone_meal'], 1), black: await craft(['coal'], 1), brown: await craft(['dead_bush'], 1),
    green: await ev(() => window.__bf.item('cactus').smelt),
  };
  check('flowers give their dye (two each)', d.red?.id === 'red_dye' && d.red.count === 2 && d.yellow?.id === 'yellow_dye' && d.blue?.id === 'blue_dye' && d.white?.id === 'white_dye', d);
  check('bone meal, coal, dry shrubs and cactus give white, black, brown and green', d.bone?.id === 'white_dye' && d.black?.id === 'black_dye' && d.brown?.id === 'brown_dye' && d.green?.result === 'green_dye', d);
  const mix = {
    orange: await craft(['red_dye', 'yellow_dye'], 2), lightBlue: await craft(['blue_dye', _, _, 'white_dye'], 2),
    purple: await craft(['red_dye', 'blue_dye'], 2), magenta: await craft(['purple_dye', 'pink_dye'], 2),
    lime: await craft(['green_dye', 'white_dye'], 2), cyan: await craft(['blue_dye', 'green_dye'], 2),
  };
  check('two dyes mix into a new colour', mix.orange?.id === 'orange_dye' && mix.orange.count === 2 && mix.lightBlue?.id === 'light_blue_dye'
    && mix.purple?.id === 'purple_dye' && mix.magenta?.id === 'magenta_dye' && mix.lime?.id === 'lime_dye' && mix.cyan?.id === 'cyan_dye', mix);
  const wool = {
    one: await craft(['wool', 'blue_dye'], 2), redye: await craft(['red_wool', _, _, 'black_dye'], 2),
    eight: await craft(['wool', 'wool', 'wool', 'wool', 'yellow_dye', 'wool', 'wool', 'wool', 'wool']),
    torch: await craft(['coal', _, 'stick', _], 2),
  };
  check('wool + dye = coloured wool (and wool can be dyed again)', wool.one?.id === 'blue_wool' && wool.redye?.id === 'black_wool', wool);
  check('eight wool around a dye make eight coloured wool', wool.eight?.id === 'yellow_wool' && wool.eight.count === 8, wool.eight);
  check('coal still makes torches with a stick', wool.torch?.id === 'torch' && wool.torch.count === 4, wool.torch);
}

// ================================================================== FENCES AND GATES
if (run('fences')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  await tp(X + 0.5, Y, Z + 3.5, YAW.n, -0.6);
  await give('oak_fence', 0, 10);
  // place three fences in a row by clicking the grass
  for (const dx of [-1, 0, 1]) { await aim(X + dx + 0.5, Y - 0.02, Z + 0.5); await rclick(); }
  const row = [await key(X - 1, Y, Z), await key(X, Y, Z), await key(X + 1, Y, Z)];
  check('fences are placed by right-clicking the ground', row.every((k) => k === 'oak_fence'), row);
  check('placing uses them up', (await count('oak_fence')) === 7, await count('oak_fence'));
  const sel = await ev(([x, y, z]) => { const g = window.__bf.game; const w = g.world; return [g.selectionOf(w.getBlock(x, y, z), x, y, z), g.selectionOf(w.getBlock(x - 1, y, z), x - 1, y, z)]; }, [X, Y, Z]);
  check('neighbouring fences join up (the middle one reaches both ways)', sel[0][0] === 0 && sel[0][3] === 1 && sel[0][2] > 0.3 && sel[0][5] < 0.7, sel);
  check('the end fence only reaches toward its neighbour', sel[1][0] > 0.3 && sel[1][3] === 1, sel[1]);
  await set(X - 2, Y, Z, 'stone');
  const toStone = await ev(([x, y, z]) => { const g = window.__bf.game; return g.selectionOf(g.world.getBlock(x, y, z), x, y, z); }, [X - 1, Y, Z]);
  check('fences join solid blocks', toStone[0] === 0, toStone);
  await set(X - 2, Y, Z, 'air');
  // a long fence line: walking and jumping into it gets you nowhere
  for (let dx = -8; dx <= 8; dx++) await set(X + dx, Y, Z, 'oak_fence');
  await tp(X + 0.5, Y, Z + 2.5, YAW.n, 0);
  await autopilot({ forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }); await fast(40);
  const walk = await pos();
  await autopilot({ forward: 1, strafe: 0, jump: true, sneak: false, sprint: false }); await fast(80);
  const jump = await pos();
  await autopilot(null);
  check('you cannot walk through a fence', walk.z > Z + 0.9, walk);
  check('fences are too tall to jump over', jump.z > Z + 0.9, jump);
  // creatures stay in a pen
  const pen = await ev(([x0, y, z0]) => {
    const bf = window.__bf, g = bf.game;
    const X0 = x0 + 3, Z0 = z0 - 9;
    for (let i = 0; i <= 4; i++) { bf.setBlock(X0 + i, y, Z0, 'oak_fence'); bf.setBlock(X0 + i, y, Z0 + 4, 'oak_fence'); bf.setBlock(X0, y, Z0 + i, 'oak_fence'); bf.setBlock(X0 + 4, y, Z0 + i, 'oak_fence'); }
    const pigs = [g.entities.spawnMob('pig', X0 + 2.5, y, Z0 + 2.5, g), g.entities.spawnMob('sheep', X0 + 1.5, y, Z0 + 1.5, g)];
    for (let i = 0; i < 2400; i++) g.tick();
    const out = pigs.map((m) => ({ x: m.x, z: m.z, inside: m.x > X0 + 0.5 && m.x < X0 + 4.5 && m.z > Z0 + 0.5 && m.z < Z0 + 4.5 }));
    for (const m of pigs) m.removed = true;
    for (let i = 0; i <= 4; i++) { bf.setBlock(X0 + i, y, Z0, 'air'); bf.setBlock(X0 + i, y, Z0 + 4, 'air'); bf.setBlock(X0, y, Z0 + i, 'air'); bf.setBlock(X0 + 4, y, Z0 + i, 'air'); }
    return out;
  }, [X, Y, Z]);
  check('animals stay inside a fenced pen', pen.every((m) => m.inside), pen);
  check('creatures never spawn on fences', await ev(() => { const B = window.__bf.B; return B.SPAWN_FLOOR[B.OAK_FENCE] === 0 && B.SPAWN_FLOOR[B.GLASS_PANE] === 0 && B.SPAWN_FLOOR[B.STONE] === 1; }));
  // a gate in the line
  await set(X, Y, Z, 'air');
  await give('oak_fence_gate', 0, 4);
  await tp(X + 0.5, Y, Z + 2.5, YAW.n, -0.5);
  await aim(X + 0.5, Y - 0.02, Z + 0.5); await rclick();
  const g0 = await key(X, Y, Z);
  check('a fence gate fits into the gap (facing the way you look)', g0 === 'oak_fence_gate:n:c', g0);
  const joins = await ev(([x, y, z]) => { const g = window.__bf.game; return g.selectionOf(g.world.getBlock(x - 1, y, z), x - 1, y, z); }, [X, Y, Z]);
  check('fences join onto the gate', joins[3] === 1, joins);
  await autopilot({ forward: 1, strafe: 0, jump: true, sneak: false, sprint: false }); await fast(60); await autopilot(null);
  check('a closed gate blocks the way', (await pos()).z > Z + 0.9, await pos());
  await tp(X + 0.5, Y, Z + 2.5, YAW.n, -0.35);
  await aim(X + 0.5, Y + 0.5, Z + 0.5); await rclick();
  const g1 = await key(X, Y, Z);
  check('right-click opens the gate', g1 === 'oak_fence_gate:n:o', g1);
  await shot('d_gate_open');
  await autopilot({ forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }); await fast(50); await autopilot(null);
  const through = await pos();
  check('you walk through an open gate', through.z < Z - 0.5, through);
  // close it from the far side, then open it from there: it swings the other way
  await tp(X + 0.5, Y, Z - 2.5, YAW.s, -0.35);
  await aim(X + 0.5, Y + 0.5, Z + 0.5); await rclick();
  const g2 = await key(X, Y, Z);
  await rclick();
  const g3 = await key(X, Y, Z);
  check('the gate closes, and opened from the other side it swings away from you', g2 === 'oak_fence_gate:n:c' && g3 === 'oak_fence_gate:s:o', [g2, g3]);
  await ev(() => window.__bf.game.teleport(window.__bf.game.player.x, window.__bf.game.player.y, window.__bf.game.player.z));
  for (let dx = -8; dx <= 8; dx++) await set(X + dx, Y, Z, 'air');
}

// ================================================================== LADDERS
if (run('ladders')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  // a stone pillar 7 high, a ladder clicked onto its south face
  for (let k = 0; k < 7; k++) await set(X + 6, Y + k, Z - 6, 'stone');
  await tp(X + 6.5, Y, Z - 3.5, YAW.n, -0.2);
  await give('ladder', 0, 16);
  await aim(X + 6.5, Y + 0.5, Z - 5); await rclick();
  const l0 = await key(X + 6, Y, Z - 5);
  check('a ladder goes on the side of a block, facing out', l0 === 'ladder:s', l0);
  for (let k = 1; k < 6; k++) await set(X + 6, Y + k, Z - 5, 'ladder:s');
  await tp(X + 6.5, Y, Z - 4.3, YAW.n, 0);
  await autopilot({ forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }); await fast(50); await autopilot(null);
  const up = await pos();
  check('walking into a ladder climbs it', up.y > Y + 3.5, { y: up.y, Y });
  await autopilot({ forward: 0, strafe: 0, jump: false, sneak: true, sprint: false }); await fast(3);
  const h0 = await pos(); await fast(30); const h1 = await pos(); await autopilot(null);
  check('sneaking holds you on the ladder', Math.abs(h1.y - h0.y) < 0.05 && h1.y > Y + 2, { h0: h0.y, h1: h1.y });
  const hp0 = await ev(() => window.__bf.game.player.health);
  await autopilot({ forward: 0, strafe: 0, jump: false, sneak: false, sprint: false }); await fast(80); await autopilot(null);
  const down = await pos();
  const hp1 = await ev(() => window.__bf.game.player.health);
  check('letting go slides you gently down, without fall damage', down.y < Y + 0.1 && hp1 === hp0, { y: down.y, hp0, hp1 });
  // the wall goes, the ladder drops
  await set(X + 6, Y + 3, Z - 6, 'air');
  await fast(6);
  const gone = await key(X + 6, Y + 3, Z - 5);
  check('a ladder falls off when its wall is removed', gone === 'air' && (await drops('ladder')) >= 1, { gone, drops: await drops('ladder') });
  await shot('d_ladder');
  for (let k = 0; k < 7; k++) { await set(X + 6, Y + k, Z - 6, 'air'); await set(X + 6, Y + k, Z - 5, 'air'); }
}

// ================================================================== TRAPDOORS
if (run('trapdoors')) {
  await closeOverlays();
  await setMode('survival');
  await set(X - 6, Y, Z - 6, 'stone'); await set(X - 6, Y + 1, Z - 6, 'stone');
  await tp(X - 5.5, Y, Z - 3.5, YAW.n, -0.1);
  await give('oak_trapdoor', 0, 8);
  await aim(X - 5.5, Y + 0.8, Z - 5); await rclick();
  const top = await key(X - 6, Y, Z - 5);
  await set(X - 6, Y, Z - 5, 'air');
  await aim(X - 5.5, Y + 0.2, Z - 5); await rclick();
  const bottom = await key(X - 6, Y, Z - 5);
  check('clicking the upper half of a wall makes a top trapdoor, the lower half a bottom one', top === 'oak_trapdoor:n:top:c' && bottom === 'oak_trapdoor:n:bottom:c', [top, bottom]);
  await set(X - 6, Y, Z - 5, 'air'); await set(X - 6, Y, Z - 6, 'air'); await set(X - 6, Y + 1, Z - 6, 'air');
  // a hatch over a hole: stand on it, open it, fall through
  const hx = X - 3, hz = Z - 9;
  await set(hx, Y - 1, hz, 'air'); await set(hx, Y - 2, hz, 'air'); await set(hx, Y - 3, hz, 'air');
  await tp(hx + 0.5, Y, hz + 2.5, YAW.n, -0.7);
  await aim(hx + 0.5, Y - 1.5, hz + 0.3);
  await aim(hx + 0.5, Y - 0.05, hz + 1);   // top of the grass in front of the hole
  await set(hx, Y - 1, hz, 'oak_trapdoor:n:top:c');
  const t0 = await key(hx, Y - 1, hz);
  await tp(hx + 0.5, Y, hz + 0.5); await fast(10);
  const on = await pos();
  check('you can stand on a closed trapdoor', Math.abs(on.y - Y) < 0.05, { y: on.y, Y, t0 });
  await tp(hx + 0.5, Y, hz + 1.9, YAW.n, -1.2); await fast(3);
  await aim(hx + 0.5, Y - 0.1, hz + 0.5); await rclick();
  const opened = await key(hx, Y - 1, hz);
  await tp(hx + 0.5, Y, hz + 0.5); await fast(30);
  const fell = await pos();
  check('open it and you drop through', opened === 'oak_trapdoor:n:top:o' && fell.y < Y - 1.5, { opened, y: fell.y });
  await shot('d_trapdoor');
  await tp(X + 0.5, Y, Z + 0.5);
  await set(hx, Y - 1, hz, 'grass'); await set(hx, Y - 2, hz, 'stone'); await set(hx, Y - 3, hz, 'stone');
}

// ================================================================== GLASS PANES
if (run('panes')) {
  await closeOverlays();
  await setMode('survival');
  await tp(X + 0.5, Y, Z + 3.5, YAW.n, -0.6);
  await give('glass_pane', 0, 16);
  for (const dx of [-1, 0, 1]) { await aim(X + dx + 0.5, Y - 0.02, Z + 0.5); await rclick(); }
  await set(X + 2, Y, Z, 'glass');
  const s = await ev(([x, y, z]) => { const g = window.__bf.game, w = g.world; return [0, 1].map((d) => g.selectionOf(w.getBlock(x + d, y, z), x + d, y, z)); }, [X, Y, Z]);
  check('glass panes join each other and plain glass', (await key(X, Y, Z)) === 'glass_pane' && s[0][0] === 0 && s[0][3] === 1 && s[1][3] === 1, s);
  await tp(X + 0.5, Y, Z + 2.5, YAW.n, 0);
  await autopilot({ forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }); await fast(40); await autopilot(null);
  check('a pane stops you like a wall', (await pos()).z > Z + 0.8, await pos());
  await clearDrops();
  await tp(X + 0.5, Y, Z + 2.5, YAW.n, -0.3);
  await aim(X + 0.5, Y + 0.5, Z + 0.5);
  await ev(() => { const p = window.__bf.game.inventory; p.slots[0] = null; p.changed(); });
  for (let i = 0; i < 20 && (await key(X, Y, Z)) === 'glass_pane'; i++) { await page.mouse.down(); await ticks(4); }
  await page.mouse.up(); await fast(5);
  check('breaking a pane shatters it (no drop, like glass)', (await key(X, Y, Z)) === 'air' && (await drops('glass_pane')) === 0, { k: await key(X, Y, Z) });
  for (const dx of [-1, 0, 1, 2]) await set(X + dx, Y, Z, 'air');
}

// ================================================================== FLOWERS, DYES, WOOL
if (run('dyes')) {
  await closeOverlays();
  const bloom = await ev(([x, y, z]) => {
    const g = window.__bf.game, B = window.__bf.B;
    let blue = 0, white = 0, red = 0, yellow = 0;
    for (let i = 0; i < 60; i++) {
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) g.world.setBlock(x + 10 + dx, y + 1, z + 10 + dz, B.AIR);
      g.useBoneMeal(x + 10, y, z + 10);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const b = g.world.getBlock(x + 10 + dx, y + 1, z + 10 + dz);
        if (b === B.FLOWER_BLUE) blue++; else if (b === B.FLOWER_WHITE) white++; else if (b === B.FLOWER_RED) red++; else if (b === B.FLOWER_YELLOW) yellow++;
      }
    }
    return { blue, white, red, yellow };
  }, [X, base.y, Z]);
  check('bone meal on grass grows all four flowers (Skybells and Moon Daisies too)', bloom.blue > 0 && bloom.white > 0 && bloom.red > 0 && bloom.yellow > 0, bloom);
  const wild = await ev(() => {
    const g = window.__bf.game, B = window.__bf.B;
    let blue = 0, white = 0;
    for (const c of g.world.chunks.values()) for (let i = 0; i < c.blocks.length; i++) { if (c.blocks[i] === B.FLOWER_BLUE) blue++; else if (c.blocks[i] === B.FLOWER_WHITE) white++; }
    return { blue, white, gen: g.world.genVersion };
  });
  check('new worlds (terrain version 4 and later) grow Skybells and Moon Daisies in the wild', wild.gen >= 4 && wild.blue > 0 && wild.white > 0, wild);
  await setMode('survival');
  await tp(X + 0.5, Y, Z + 3.5, YAW.n, -0.6);
  await give('magenta_wool', 0, 4);
  await aim(X + 0.5, Y - 0.02, Z + 0.5); await rclick();
  check('coloured wool places like any block', (await key(X, Y, Z)) === 'magenta_wool', await key(X, Y, Z));
  await set(X, Y, Z, 'air');
  // craft through the real crafting grid in the inventory screen
  await ev(() => window.__bf.engine.openInventory()); await wait(300);
  const out = await ev(() => {
    const g = window.__bf.game;
    g.craft2.slots[0] = { id: 'flower_red', count: 1 }; g.craft2.changed();
    g.screen.updateCraftResult();
    return g.craftOut2.slots[0];
  });
  check('the inventory crafting grid turns an Ember Poppy into red dye', out?.id === 'red_dye' && out.count === 2, out);
  await ev(() => window.__bf.engine.closeOverlay()); await wait(200);
}

// ================================================================== SIGNS
if (run('signs')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  await tp(X + 0.5, Y, Z + 3.5, YAW.n, -0.6);
  await give('sign', 0, 8);
  await aim(X + 0.5, Y - 0.02, Z + 0.5); await rclick();
  const k0 = await key(X, Y, Z);
  const ov = await ev(() => window.__bf.state().overlay);
  check('placing a sign stands it up and opens the editor', k0 === 'sign' && ov === 'sign', { k0, ov });
  await page.fill('[data-testid=sign-line-0]', 'Welcome to');
  await page.fill('[data-testid=sign-line-1]', 'Blockfell');
  await page.fill('[data-testid=sign-line-3]', 'est. 2026');
  await page.click('[data-testid=btn-sign-done]'); await wait(300);
  const be = await ev(([x, y, z]) => window.__bf.game.blockEntityAt(x, y, z), [X, Y, Z]);
  check('the text is written on the sign', be?.type === 'sign' && be.lines[0] === 'Welcome to' && be.lines[1] === 'Blockfell' && be.lines[2] === '' && be.lines[3] === 'est. 2026', be);
  check('Done closes the editor and writing earns an advancement', (await ev(() => window.__bf.state().overlay)) === null && (await ev(() => window.__bf.game.progress.done.has('sign'))));
  const rot = await ev(() => { const p = window.__bf.game.player; return ((Math.round(p.yaw / (Math.PI / 8)) % 16) + 16) % 16; });
  check('a standing sign turns to face the player who placed it', be.rot === rot, { rot: be.rot, want: rot });
  await wait(600);
  const ink = await ev(([x, y, z]) => {
    const c = window.__bf.game.signs.canvasAt(x, y, z);
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 200) dark++;
    return dark;
  }, [X, Y, Z]);
  check('the sign renderer paints the words onto the board', ink > 300, ink);
  await tp(X + 0.5, Y, Z + 2.2, YAW.n, -0.25); await wait(800);
  await shot('d_sign');
  // re-open to edit: the editor shows the text, Escape keeps changes
  await tp(X + 0.5, Y, Z + 3.5, YAW.n, -0.4);
  await aim(X + 0.5, Y + 0.7, Z + 0.5); await rclick();
  const shown = await page.inputValue('[data-testid=sign-line-1]').catch(() => null);
  check('right-clicking a sign opens it for editing with its text', shown === 'Blockfell', shown);
  await page.fill('[data-testid=sign-line-2]', 'Pop. 3');
  await page.keyboard.press('Escape'); await wait(300);
  const be2 = await ev(([x, y, z]) => window.__bf.game.blockEntityAt(x, y, z), [X, Y, Z]);
  check('Escape closes the editor and keeps the edit', be2.lines[2] === 'Pop. 3' && (await ev(() => window.__bf.state().overlay)) === null, be2.lines);
  // long lines stop at the edge of the board
  await rclick();
  await page.fill('[data-testid=sign-line-3]', '');
  await page.focus('[data-testid=sign-line-3]');
  await page.keyboard.type('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ');
  const typed = await page.inputValue('[data-testid=sign-line-3]');
  await page.click('[data-testid=btn-sign-done]'); await wait(200);
  check('a line only holds as much as fits on the board', typed.length >= 8 && typed.length < 30 && typed === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, typed.length), typed);
  // dye the writing
  await give('red_dye', 1, 2);
  await rclick();
  const dyed = await ev(([x, y, z]) => window.__bf.game.blockEntityAt(x, y, z).color, [X, Y, Z]);
  check('right-clicking with a dye colours the text (using the dye)', dyed === 'red' && (await count('red_dye')) === 1 && (await ev(() => window.__bf.state().overlay)) === null, { dyed, left: await count('red_dye') });
  // wall sign
  await set(X + 3, Y, Z, 'stone');
  await give('sign', 0, 8);
  await tp(X + 3.5, Y, Z + 3.5, YAW.n, -0.2);
  await aim(X + 3.5, Y + 0.5, Z + 1); await rclick();
  const wk = await key(X + 3, Y, Z + 1);
  check('clicking the side of a block hangs a wall sign facing out', wk === 'wall_sign:s' && (await ev(() => window.__bf.state().overlay)) === 'sign', wk);
  await page.fill('[data-testid=sign-line-1]', 'Wall');
  await page.click('[data-testid=btn-sign-done]'); await wait(200);
  await set(X + 3, Y, Z, 'air'); await fast(6);
  check('a wall sign drops when its wall is removed', (await key(X + 3, Y, Z + 1)) === 'air' && (await drops('sign')) >= 1, await drops('sign'));
  const orphan = await ev(([x, y, z]) => window.__bf.game.blockEntityAt(x, y, z) ?? null, [X + 3, Y, Z + 1]);
  check('its text goes with it', orphan === null, orphan);
  await wait(500);
  check('only signs that exist are drawn', (await ev(() => window.__bf.game.signs.count)) === 1, await ev(() => [...window.__bf.game.world.blockEntities.entries()]));
  await set(X, Y, Z, 'air');
}

// ================================================================== LANTERNS
if (run('lanterns')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  await tp(X - 3.5, Y, Z + 3.5, YAW.n, -0.6);
  await give('lantern', 0, 4);
  await aim(X - 3.5, Y - 0.02, Z + 0.5); await rclick();
  check('a lantern stands on the ground', (await key(X - 4, Y, Z)) === 'lantern', await key(X - 4, Y, Z));
  await set(X - 6, Y + 2, Z, 'planks');
  await tp(X - 5.5, Y, Z + 2.5, YAW.n, 0.3);
  await aim(X - 5.5, Y + 1.99, Z + 0.5); await rclick();
  check('clicking the underside of a block hangs it on a chain', (await key(X - 6, Y + 1, Z)) === 'lantern:hanging', await key(X - 6, Y + 1, Z));
  const lit = await waitFor(async () => (await ev(([x, y, z]) => window.__bf.game.world.getLight(x, y, z) & 15, [X - 4, Y, Z + 2])) >= 12, 10000);
  const l = await ev(([x, y, z]) => window.__bf.game.world.getLight(x, y, z) & 15, [X - 4, Y, Z + 2]);
  check('lanterns give off bright light', lit && l >= 12, l);
  await set(X - 6, Y + 2, Z, 'air'); await fast(6);
  check('a hanging lantern drops when the block above goes', (await key(X - 6, Y + 1, Z)) === 'air' && (await drops('lantern')) >= 1, await drops('lantern'));
}

// ================================================================== FLOWER POTS
if (run('pots')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  await ev(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.changed(); });
  await tp(X + 0.5, Y, Z - 2.5, YAW.s, -0.6);
  await give('flower_pot', 0, 4);
  await aim(X + 0.5, Y - 0.02, Z + 0.5); await rclick();
  const p0 = await key(X, Y, Z);
  await give('flower_red', 1, 3);
  await aim(X + 0.5, Y + 0.3, Z + 0.5); await rclick();
  const p1 = await key(X, Y, Z);
  check('plant a flower in a pot', p0 === 'flower_pot' && p1 === 'flower_pot:flower_red' && (await count('flower_red')) === 2, { p0, p1, left: await count('flower_red') });
  await ev(() => { const g = window.__bf.game; g.inventory.selected = 5; g.inventory.changed(); });
  await rclick();
  check('right-click with an empty hand takes the flower back out', (await key(X, Y, Z)) === 'flower_pot' && (await count('flower_red')) === 3, { k: await key(X, Y, Z), n: await count('flower_red') });
  await give('cactus', 2, 1);
  await rclick();
  check('cacti fit in pots too', (await key(X, Y, Z)) === 'flower_pot:cactus', await key(X, Y, Z));
  await ev(() => { const g = window.__bf.game; g.inventory.selected = 5; g.inventory.changed(); });
  for (let i = 0; i < 10 && (await key(X, Y, Z)) !== 'air'; i++) { await page.mouse.down(); await ticks(3); }
  await page.mouse.up(); await fast(3);
  check('breaking a potted plant drops the pot and the plant', (await drops('flower_pot')) === 1 && (await drops('cactus')) === 1, { pot: await drops('flower_pot'), cactus: await drops('cactus') });
  await tp(X + 0.5, Y, Z - 2.5, YAW.s, -0.5);
  await ev(([x, y, z]) => { const bf = window.__bf; bf.setBlock(x - 1, y, z, 'flower_pot:flower_blue'); bf.setBlock(x, y, z, 'flower_pot:flower_white'); bf.setBlock(x + 1, y, z, 'flower_pot:dead_bush'); bf.setBlock(x + 2, y, z, 'flower_pot:flower_yellow'); }, [X, Y, Z]);
  await wait(800);
  await shot('d_pots');
  for (const dx of [-1, 0, 1, 2]) await set(X + dx, Y, Z, 'air');
}

// ================================================================== PAINTINGS
if (run('paintings')) {
  await closeOverlays();
  await setMode('survival');
  await clearDrops();
  await ev(() => { for (const p of window.__bf.game.entities.paintings()) p.removed = true; });
  // a stone wall 6 wide and 4 tall, facing south
  const WX = X - 3, WZ = Z - 12;
  for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 4; dy++) await set(WX + dx, Y + dy, WZ, 'stone_bricks');
  await tp(WX + 2.5, Y, WZ + 3.5, YAW.n, 0);
  await give('painting', 0, 8);
  await aim(WX + 1.5, Y + 1.5, WZ + 1); await rclick();
  let ps = await ev(() => window.__bf.game.entities.paintings().map((p) => ({ id: p.motif.id, w: p.motif.w, h: p.motif.h, x: p.ax, y: p.ay, z: p.az, f: p.facing })));
  check('a painting hangs on the wall, the largest size that fits (4 x 3 here)', ps.length === 1 && ps[0].w === 4 && ps[0].h === 3 && ps[0].f === 's' && ps[0].z === WZ + 1, ps);
  check('hanging it uses the item and earns an advancement', (await count('painting')) === 7 && (await ev(() => window.__bf.game.progress.done.has('painting'))));
  // the free strip next to it takes a smaller one; paintings never overlap
  const freeX = ps[0].x === WX ? WX + 4.5 : WX + 0.5;
  await aim(freeX, Y + 1.5, WZ + 1); await rclick();
  ps = await ev(() => window.__bf.game.entities.paintings().map((p) => ({ id: p.motif.id, w: p.motif.w, h: p.motif.h, x: p.ax, y: p.ay, cells: p.cells().map((c) => c.join(',')) })));
  const cells = ps.flatMap((p) => p.cells);
  check('the space beside it gets a smaller painting, with no overlap', ps.length === 2 && ps[1].w * ps[1].h < 12 && new Set(cells).size === cells.length, ps.map((p) => [p.id, p.w, p.h]));
  // right-click shows another picture of the same size
  const before = ps[0].id;
  await aim(WX + 2 + (ps[0].x === WX ? 0 : 2), Y + 2.5, WZ + 1); await rclick();
  const after = await ev(() => { const p = window.__bf.game.entities.paintings()[0]; return { id: p.motif.id, w: p.motif.w, h: p.motif.h }; });
  check('right-clicking a painting changes it to another of the same size', after.id !== before && after.w === 4 && after.h === 3, { before, after });
  await tp(WX + 3, Y, WZ + 5.5, YAW.n, 0.25); await wait(1000);
  await shot('d_paintings');
  // punch it off the wall
  await tp(WX + 2.5, Y, WZ + 3.5, YAW.n, 0);
  await aim(WX + 2 + (ps[0].x === WX ? 0 : 2), Y + 1.5, WZ + 1); await lclick();
  const left = await ev(() => window.__bf.game.entities.paintings().length);
  await fast(2);
  check('hitting a painting takes it down and drops it', left === 1 && (await drops('painting')) === 1, { left, drops: await drops('painting') });
  // sneaking hangs the smallest size
  await clearDrops();
  await autopilot({ forward: 0, strafe: 0, jump: false, sneak: true, sprint: false }); await ticks(3);
  await aim(WX + 2 + (ps[0].x === WX ? 0 : 2), Y + 1.5, WZ + 1); await rclick();
  await autopilot(null);
  const small = await ev(() => window.__bf.game.entities.paintings().filter((p) => p.motif.w * p.motif.h === 1).length);
  check('sneaking hangs a small (1 x 1) painting', small === 1, small);
  // remove the wall block behind a painting: it pops off
  const pn = await ev(() => { const p = window.__bf.game.entities.paintings().find((q) => q.motif.w * q.motif.h === 1); const c = p.cells()[0]; return c; });
  await set(pn[0], pn[1], pn[2] - 1, 'air');
  await fast(45);
  const popped = await ev(() => window.__bf.game.entities.paintings().filter((p) => p.motif.w * p.motif.h === 1).length);
  check('a painting falls when its wall is broken', popped === 0 && (await drops('painting')) >= 1, { popped, drops: await drops('painting') });
  await set(pn[0], pn[1], pn[2] - 1, 'stone_bricks');
  const motifs = await ev(() => window.__bf.motifs().map((m) => `${m.id}:${m.w}x${m.h}`));
  check('18 original paintings in six sizes', motifs.length === 18 && new Set(motifs.map((m) => m.split(':')[1])).size === 6, motifs);
}

// ================================================================== SAVE AND LOAD
if (run('save')) {
  await closeOverlays();
  await setMode('creative');
  // a little of everything, then save, quit and come back
  const WX = X - 3, WZ = Z - 12;
  await ev(([x, y, z, wx, wz]) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(x + 8, y, z + 8, 'sign');
    g.world.blockEntities.set(`${x + 8},${y},${z + 8}`, { type: 'sign', lines: ['Saved', 'and', 'restored', ''], rot: 4, color: 'blue' });
    bf.setBlock(x + 9, y, z + 8, 'flower_pot:flower_white');
    bf.setBlock(x + 10, y, z + 8, 'oak_fence_gate:e:o');
    bf.setBlock(x + 11, y, z + 8, 'cyan_wool');
    bf.setBlock(x + 12, y, z + 8, 'lantern');
    bf.setBlock(x + 13, y, z + 8, 'oak_trapdoor:w:top:o');
    for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 4; dy++) bf.setBlock(wx + dx, y + dy, wz, 'stone_bricks');
  }, [X, Y, Z, WX, WZ]);
  const want = await ev(() => window.__bf.game.entities.paintings().map((p) => `${p.motif.id}@${p.ax},${p.ay},${p.az}:${p.facing}`).sort());
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 30000);
  await ev(async () => { const w = (await window.__bf.engine.listWorlds()).find((q) => q.name === 'Decor Test'); await window.__bf.engine.playWorld(w.id); });
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'game', 60000);
  await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; });
  await wait(1500);
  const got = await ev(([x, y, z]) => {
    const g = window.__bf.game, bf = window.__bf;
    return {
      sign: g.blockEntityAt(x + 8, y, z + 8),
      blocks: [8, 9, 10, 11, 12, 13].map((d) => bf.getBlock(x + d, y, z + 8)),
      paintings: g.entities.paintings().map((p) => `${p.motif.id}@${p.ax},${p.ay},${p.az}:${p.facing}`).sort(),
    };
  }, [X, Y, Z]);
  check('sign text, turn and colour survive saving', got.sign?.lines?.join('|') === 'Saved|and|restored|' && got.sign.rot === 4 && got.sign.color === 'blue', got.sign);
  check('pots, gates, wool, lanterns and trapdoors survive saving', JSON.stringify(got.blocks) === JSON.stringify(['sign', 'flower_pot:flower_white', 'oak_fence_gate:e:o', 'cyan_wool', 'lantern', 'oak_trapdoor:w:top:o']), got.blocks);
  check('paintings stay where they were hung', want.length >= 1 && JSON.stringify(got.paintings) === JSON.stringify(want), { want, got: got.paintings });
}

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n==== SUMMARY');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(66)} ${i.slice(0, 220)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
