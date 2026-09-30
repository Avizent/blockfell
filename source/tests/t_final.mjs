// FINAL INTEGRATION TEST (spec section 42). Prints a PASS/FAIL table.
const vw = Number(process.env.VW ?? 960), vh = Number(process.env.VH ?? 540);
export default async (page, h) => {
  const results = [];
  const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, typeof info === 'string' ? info : JSON.stringify(info)]); };
  const st = () => h.state();
  const ev = h.ev;
  const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await h.wait(250); } return false; };
  const center = async () => page.mouse.move(vw / 2, vh / 2);

  // 1. launch
  await page.waitForSelector('[data-testid=title-screen]');
  check('title screen shown', true);
  await h.shot('f01_title');
  // 2. create survival world
  await page.click('[data-testid=btn-singleplayer]');
  check('world selection opens', await waitFor(async () => (await st()).screen === 'worlds', 3000));
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', 'Integration Survival');
  await page.fill('[data-testid=world-seed]', 'integration');
  await h.shot('f02_create');
  await page.click('[data-testid=btn-create-world]');
  const sawLoading = await waitFor(async () => (await st()).screen === 'loading', 5000);
  check('loading/generation screen shown', sawLoading);
  await h.shot('f03_loading');
  const inGame = await waitFor(async () => (await st()).screen === 'game', 90000);
  check('spawned into generated world', inGame);
  await ev(() => window.__bf.allowUnlocked(true));
  await h.wait(1500);
  let s = await st();
  check('spawn is safe (on ground, full health)', s.player.onGround && s.player.health === 20, s.player);
  await center();
  await h.wait(300);
  // look with mouse
  const yaw0 = s.player.yaw;
  await page.mouse.move(vw / 2 + 120, vh / 2); await h.wait(300);
  check('mouse look changes yaw', Math.abs((await st()).player.yaw - yaw0) > 0.05, { yaw0, yaw1: (await st()).player.yaw });
  await center(); await h.wait(200);
  // WASD, jump, sprint, sneak
  const p0 = (await st()).player;
  await page.keyboard.down('KeyW'); await h.wait(1000); await page.keyboard.up('KeyW');
  const p1 = (await st()).player;
  check('W walks forward', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2));
  await page.keyboard.down('KeyD'); await h.wait(600); await page.keyboard.up('KeyD');
  const p2 = (await st()).player;
  check('D strafes', Math.hypot(p2.x - p1.x, p2.z - p1.z) > 0.5);
  await h.wait(400);
  const yj = (await st()).player.y;
  await page.keyboard.down('Space');
  let maxY = yj; for (let i = 0; i < 8; i++) { await h.wait(60); maxY = Math.max(maxY, (await st()).player.y); }
  await page.keyboard.up('Space');
  check('Space jumps', maxY - yj > 0.5, (maxY - yj).toFixed(2));
  await h.wait(600);
  // build a flat test pad so sprint/sneak are not blocked by trees
  await ev(() => { const bf = window.__bf, g = bf.game, x = Math.floor(g.player.x), z = Math.floor(g.player.z), y = Math.floor(g.player.y) - 1;
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) { bf.setBlock(x + dx, y, z + dz, 'grass'); for (let k = 1; k <= 4; k++) bf.setBlock(x + dx, y + k, z + dz, 'air'); }
    g.player.yaw = 0; g.player.pitch = 0; window.__pad = { x, y, z }; });
  await h.wait(1200);
  // The headless software-rendered browser can stall for several hundred ms between
  // frames, so wait for game ticks, not wall-clock time, before reading the result.
  const tickNow = () => ev(() => window.__bf.game.tickCount);
  const afterTicks = async (from, n, maxMs = 5000) => { const t = Date.now(); while (Date.now() - t < maxMs && (await tickNow()) < from + n) await h.wait(50); };
  await page.keyboard.down('ControlLeft'); await page.keyboard.down('KeyW'); await h.wait(700);
  await afterTicks(await tickNow(), 2);
  check('Ctrl sprints', (await st()).player.sprinting);
  await page.keyboard.up('KeyW'); await page.keyboard.up('ControlLeft');
  await page.keyboard.down('ShiftLeft');
  await afterTicks(await tickNow(), 3);
  { const sn = await ev(() => { const bf = window.__bf, i = bf.engine.input, p = bf.game.player; return { sneaking: p.sneaking, flying: p.flying, focus: i.gameFocus, down: [...i.down] }; });
    check('Shift sneaks', sn.sneaking, sn.sneaking ? '' : sn); }
  await page.keyboard.up('ShiftLeft');
  await h.wait(300);
  // target & mine a block with the hand
  await ev(() => { const g = window.__bf.game, p = window.__pad; g.teleport(p.x + 0.5, p.y + 1, p.z + 0.5); window.__bf.setBlock(p.x, p.y + 1, p.z - 2, 'dirt'); });
  await h.wait(800);
  await ev(() => { const p = window.__pad; window.__bf.aimAt(p.x + 0.5, p.y + 1.5, p.z - 1); });
  // the target is recomputed on the next game tick; the headless renderer can be slow
  await waitFor(async () => !!(await st()).target, 5000);
  s = await st();
  check('crosshair targets a block', !!s.target && s.target.block === 'dirt', s.target);
  const chunkBefore = await ev(() => { const p = window.__pad; return window.__bf.chunkInfo(p.x >> 4, (p.z - 2) >> 4); });
  await page.mouse.down(); await h.wait(1600); await page.mouse.up();
  await h.wait(1200);
  const mined = await ev(() => { const p = window.__pad; return window.__bf.getBlock(p.x, p.y + 1, p.z - 2); });
  const chunkAfter = await ev(() => { const p = window.__pad; return window.__bf.chunkInfo(p.x >> 4, (p.z - 2) >> 4); });
  check('holding left mouse mines the block', mined === 'air', mined);
  check('only the edited chunk was remeshed (version bumped, re-meshed)', chunkAfter.meshedVersion > chunkBefore.meshedVersion && chunkAfter.meshedVersion === chunkAfter.version, { chunkBefore, chunkAfter });
  // walk over the dropped item to pick it up
  await ev(() => { window.__bf.game.player.pitch = 0; });
  await page.keyboard.down('KeyW'); await h.wait(700); await page.keyboard.up('KeyW');
  await h.wait(800);
  const inv1 = await ev(() => window.__bf.inventory());
  check('mined block was collected', inv1.some((x) => x.includes('dirt')), inv1);
  // hotbar selection via keys and wheel, then place the dirt
  await page.keyboard.press('Digit3'); await h.wait(700);
  check('number key selects slot', (await ev(() => window.__bf.game.inventory.selected)) === 2);
  await page.mouse.wheel(0, 100); await h.wait(700);
  check('mouse wheel cycles hotbar', (await ev(() => window.__bf.game.inventory.selected)) === 3);
  await page.keyboard.press('Digit1'); await h.wait(700);
  await ev(() => { const g = window.__bf.game, p = window.__pad; g.teleport(p.x + 0.5, p.y + 1, p.z + 0.5); window.__bf.aimAt(p.x + 0.5, p.y + 1, p.z - 1.5); });
  await h.wait(300);
  await page.mouse.click(vw / 2, vh / 2, { button: 'right' });
  await h.wait(800);
  const placed = await ev(() => { const p = window.__pad; return [window.__bf.getBlock(p.x, p.y + 1, p.z - 2), window.__bf.getBlock(p.x, p.y + 1, p.z - 1)]; });
  check('right mouse places a block', placed.includes('dirt'), placed);
  await h.shot('f04_placed');
  // inventory interactions
  await ev(() => { const g = window.__bf.game; g.inventory.slots[9] = { id: 'log', count: 5 }; g.inventory.slots[10] = { id: 'cobblestone', count: 40 }; g.inventory.slots[11] = { id: 'cobblestone', count: 30 }; g.inventory.changed(); });
  await page.keyboard.press('KeyE'); await h.wait(500);
  check('E opens survival inventory', (await st()).overlay === 'inventory');
  await h.shot('f05_inventory');
  // split stack (right click) and place half
  await page.click('[data-slot="main:10"]', { button: 'right' });
  await page.click('[data-slot="main:20"]');
  let slots = await ev(() => window.__bf.game.inventory.slots.map((x) => x && x.id + 'x' + x.count));
  check('right-click splits a stack', slots[10] === 'cobblestonex20' && slots[20] === 'cobblestonex20', [slots[10], slots[20]]);
  // merge stacks
  await page.click('[data-slot="main:20"]');
  await page.click('[data-slot="main:11"]');
  slots = await ev(() => window.__bf.game.inventory.slots.map((x) => x && x.id + 'x' + x.count));
  check('left-click merges stacks (max 64)', slots[11] === 'cobblestonex50', slots[11]);
  // move item
  await page.click('[data-slot="main:9"]');
  await page.click('[data-slot="hotbar:5"]');
  slots = await ev(() => window.__bf.game.inventory.slots.map((x) => x && x.id + 'x' + x.count));
  check('items move between slots', slots[5] === 'logx5' && !slots[9], slots[5]);
  // shift-click transfer hotbar -> main
  await page.click('[data-slot="hotbar:5"]', { modifiers: ['Shift'] });
  slots = await ev(() => window.__bf.game.inventory.slots.map((x) => x && x.id + 'x' + x.count));
  check('shift-click transfers to other section', !slots[5] && slots.slice(9, 36).includes('logx5'));
  // craft planks + sticks in 2x2
  const logIdx = slots.findIndex((x) => x === 'logx5');
  await page.click(`[data-slot="main:${logIdx}"]`);
  await page.click('[data-slot="craft:0"]', { button: 'right' });
  await page.click(`[data-slot="main:${logIdx}"]`);
  await page.click('[data-slot="output:0"]', { modifiers: ['Shift'] });
  const craftInv = await ev(() => window.__bf.inventory());
  check('crafting consumes ingredients and yields planks', craftInv.some((x) => x.includes('planksx4')) && craftInv.some((x) => x.includes('logx4')), craftInv);
  await page.keyboard.press('KeyE'); await h.wait(400);
  check('E closes inventory', (await st()).overlay === null);
  // keep playing a moment, then save & quit
  await page.keyboard.down('KeyS'); await h.wait(400); await page.keyboard.up('KeyS');
  // wait until the player has come to rest (the headless simulation runs slower than real time)
  await waitFor(() => ev(() => { const p = window.__bf.game.player; return p.onGround && p.vx === 0 && p.vz === 0; }), 15000);
  const before = (await st()).player;
  const invBefore = await ev(() => window.__bf.inventory());
  await page.keyboard.press('Escape'); await h.wait(400);
  check('Esc opens pause menu', (await st()).overlay === 'pause');
  await h.shot('f06_pause');
  await page.click('[data-testid=btn-save-quit]');
  check('Save and Quit returns to title', await waitFor(async () => (await st()).screen === 'title', 15000));
  // reload
  await page.click('[data-testid=btn-singleplayer]');
  await h.wait(600);
  await page.click('[data-testid=world-entry]');
  await page.click('[data-testid=btn-play-selected]');
  await waitFor(async () => (await st()).screen === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await h.wait(2500);
  const after = (await st()).player;
  check('reload restores position', Math.hypot(after.x - before.x, after.z - before.z) < 0.01 && Math.abs(after.y - before.y) < 0.01, { b: [before.x, before.y, before.z], a: [after.x, after.y, after.z] });
  const invAfter = await ev(() => window.__bf.inventory());
  check('reload restores inventory', JSON.stringify(invAfter) === JSON.stringify(invBefore), { invBefore, invAfter });
  const persisted = await ev(() => { const p = window.__pad; return [window.__bf.getBlock(p.x, p.y + 1, p.z - 2), window.__bf.getBlock(p.x, p.y + 1, p.z - 1), window.__bf.getBlock(p.x + 5, p.y + 1, p.z)]; });
  check('placed/mined blocks persist after reload', persisted.includes('dirt') && persisted[2] === 'air', persisted);
  // back to title for creative
  await page.keyboard.press('Escape'); await h.wait(300);
  await page.click('[data-testid=btn-save-quit]');
  await waitFor(async () => (await st()).screen === 'title', 15000);
  await page.click('[data-testid=btn-singleplayer]');
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', 'Integration Creative');
  await page.fill('[data-testid=world-seed]', 'creative-run');
  await page.click('[data-testid=btn-gamemode]');
  await page.click('[data-testid=btn-create-world]');
  await waitFor(async () => (await st()).screen === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await h.wait(1500);
  await center(); await h.wait(200);
  check('creative world created', (await st()).player.mode === 'creative');
  await page.keyboard.press('KeyE'); await h.wait(400);
  check('creative inventory opens', (await st()).overlay === 'creative');
  await page.click('[data-testid=tab-search]');
  await page.keyboard.type('brick');
  await h.wait(300);
  await h.shot('f07_creative_search');
  const found = await page.locator('[data-testid=cat-bricks]').count();
  check('creative search finds items', found === 1);
  await page.click('[data-testid=cat-bricks]');
  await page.click('[data-slot="hotbar:0"]');
  await page.keyboard.press('Escape'); await h.wait(400);
  const hb = await ev(() => window.__bf.game.inventory.get(0));
  check('catalogue item assigned to hotbar', hb && hb.id === 'bricks', hb);
  // instant break + unlimited placement
  await ev(() => { const bf = window.__bf, g = bf.game, x = Math.floor(g.player.x), z = Math.floor(g.player.z), y = Math.floor(g.player.y) - 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { bf.setBlock(x + dx, y, z + dz, 'stone'); for (let k = 1; k <= 3; k++) bf.setBlock(x + dx, y + k, z + dz, 'air'); }
    bf.setBlock(x, y + 1, z - 2, 'stone'); window.__cpad = { x, y, z }; g.inventory.selected = 0; g.inventory.changed(); });
  await h.wait(800);
  await ev(() => { const p = window.__cpad; window.__bf.aimAt(p.x + 0.5, p.y + 1.5, p.z - 1); });
  await h.wait(300);
  await page.mouse.click(vw / 2, vh / 2);
  await h.wait(600);
  check('creative breaks blocks instantly', (await ev(() => { const p = window.__cpad; return window.__bf.getBlock(p.x, p.y + 1, p.z - 2); })) === 'air');
  await ev(() => { const p = window.__cpad; window.__bf.aimAt(p.x + 0.5, p.y + 1, p.z - 1.5); });
  await h.wait(300);
  for (let i = 0; i < 3; i++) { await page.mouse.click(vw / 2, vh / 2, { button: 'right' }); await h.wait(300); }
  const brick = await ev(() => window.__bf.game.inventory.get(0));
  check('creative placement is unlimited', brick.count === 64, brick);
  // flight
  await page.keyboard.press('Space'); await h.wait(80); await page.keyboard.press('Space'); await h.wait(900);
  check('double-tap Space toggles flight', (await st()).player.flying);
  const fy0 = (await st()).player.y;
  // headless software rendering runs the simulation slower than real time, so hold keys until a
  // target is reached (or a generous timeout) instead of for a fixed wall-clock time
  await page.keyboard.down('Space'); await waitFor(async () => (await st()).player.y > fy0 + 3.5, 6000); await page.keyboard.up('Space');
  const fy1 = (await st()).player.y;
  await page.keyboard.down('ShiftLeft'); await waitFor(async () => (await st()).player.y < fy1 - 1.5, 6000); await page.keyboard.up('ShiftLeft');
  const fy2 = (await st()).player.y;
  check('fly up with Space, down with Shift', fy1 > fy0 + 3 && fy2 < fy1 - 1, { fy0, fy1, fy2 });
  // travel far: new chunks generate, distant ones unload
  const c0 = (await st()).chunks;
  await ev(() => { const g = window.__bf.game; g.player.yaw = Math.PI / 2; g.player.pitch = -0.2; g.autopilot = { forward: 1, strafe: 0, jump: false, sneak: false, sprint: true }; });
  await h.wait(20000);
  await ev(() => { window.__bf.game.autopilot = null; });
  const c1 = (await st()).chunks;
  const dist = await ev(() => { const g = window.__bf.game, p = window.__cpad; return Math.hypot(g.player.x - p.x, g.player.z - p.z); });
  check('travelling generates new chunks', c1.totalGenerated > c0.totalGenerated + 20, { flown: dist.toFixed(0), gen0: c0.totalGenerated, gen1: c1.totalGenerated });
  check('distant chunks unload', c1.totalUnloaded > 0 && c1.loaded < 400, { unloaded: c1.totalUnloaded, loaded: c1.loaded });
  await h.shot('f08_far');
  // return: modifications intact
  await ev(() => { const g = window.__bf.game, p = window.__cpad; g.teleport(p.x + 0.5, p.y + 1, p.z + 0.5); });
  await waitFor(async () => (await ev(() => { const p = window.__cpad; return !!window.__bf.chunkInfo(p.x >> 4, p.z >> 4); })), 30000);
  await h.wait(1500);
  const back = await ev(() => { const p = window.__cpad; return [window.__bf.getBlock(p.x, p.y + 1, p.z - 2), window.__bf.getBlock(p.x, p.y + 1, p.z - 1), window.__bf.getBlock(p.x + 2, p.y, p.z + 2)]; });
  check('modifications correct after returning', back.includes('bricks') && back[2] === 'stone', back);
  // day/night
  const t0 = await ev(() => window.__bf.game.dayNight.time);
  await h.wait(2000);
  const t1 = await ev(() => window.__bf.game.dayNight.time);
  check('world time advances', t1 > t0, { t0, t1 });
  const u = await ev(() => { const g = window.__bf.game; g.dayNight.time = 18000; return new Promise((r) => setTimeout(() => r(window.__bf.engine.renderer.uniforms.uDaylight.value), 500)); });
  check('night darkens sky light in the renderer', u < 0.5, u);
  await ev(() => { window.__bf.game.dayNight.time = 6000; });
  // entities: spawn a pig and hit it
  await ev(() => { const g = window.__bf.game, p = g.player; p.flying = false; const m = g.entities.spawnMob('pig', p.x + 2.2, p.y, p.z, g); m.tick = function () { this.beginTick(); }; window.__pig = m; window.__bf.aimAt(m.x, m.y + 0.5, m.z); });
  await h.wait(1000);
  await page.mouse.click(vw / 2, vh / 2);
  await h.wait(1000);
  const pigHp = await ev(() => window.__pig.health);
  check('entity can be interacted with (hit)', pigHp < 10, pigHp);
  await h.shot('f09_entity');
  // perf snapshot
  const perf = await ev(() => { const s = window.__bf.state(); return { draws: s.drawCalls, tris: s.triangles, loaded: s.chunks.loaded, visible: s.chunks.visible, meshMs: s.chunks.meshMs.toFixed(1), lightMs: s.chunks.lightMs.toFixed(1), genMs: s.chunks.genMs.toFixed(1) }; });
  check('renderer stats (informational)', true, perf);

  console.log('\n===== FINAL INTEGRATION RESULTS =====');
  for (const r of results) console.log(r[0].padEnd(5), r[1].padEnd(58), r[2].slice(0, 160));
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
};
