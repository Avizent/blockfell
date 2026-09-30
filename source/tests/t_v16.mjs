// Tests for 1.6: Continue / reopen the last world / backup reminder, offline play and
// updates (single-file build), boats and fishing.
// node tests/t_v16.mjs                      (dev server: items, boat, fish, continue)
// ONLY=offline URL1=http://localhost:8765/ UPD_DIR=/path/copy UPD_URL=http://localhost:8767/ node tests/t_v16.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'boat', 'fish', 'continue'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720, CX = VW / 2, CY = VH / 2;
const errors = [];

function helpers(page) {
  const ev = (fn, a) => page.evaluate(fn, a);
  const wait = (ms) => page.waitForTimeout(ms);
  const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
  const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
  const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
  const screen = () => ev(() => window.__bf?.state().screen);
  return { ev, wait, waitFor, ticks, fast, screen };
}

async function newWorld(page, name, seed) {
  const { ev, wait, waitFor } = helpers(page);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', seed);
  await page.click('[data-testid=btn-create-world]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
  await wait(2000);
}

// ======================================================================= ITEMS, BOATS, FISHING (one world)
if (run('items') || run('boat') || run('fish')) {
  const page = await b.newPage({ viewport: { width: VW, height: VH } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const { ev, wait, waitFor, ticks, fast } = helpers(page);
  await page.goto(URL);
  await page.mouse.move(CX, CY);
  await newWorld(page, 'Lake Test', 'lake');
  const give = (id, slot = 0, count = 1) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
  const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
  const centre = async () => {
    const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
    await page.mouse.move(CX, CY); await ticks(1);
    await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
    await ticks(2);
  };
  const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
  const lclick = async () => { await centre(); await page.mouse.click(CX, CY); await ticks(3); await wait(100); };
  const count = (id) => ev((id) => window.__bf.game.inventory.countItem(id), id);

  // a quiet stone-lined pond (16 x 14, two deep) with a stone pier on its south side
  const base = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
    g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
    for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
    g.setGameMode('survival'); p.flying = false;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = 70;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -18; dz <= 6; dz++) {
      for (let k = -3; k <= 10; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, k < 0 ? 'stone' : 'air');
    }
    // the pond: x -8..7, z -16..-3, water in y 68..69 (surface 69.875)
    for (let dx = -8; dx <= 7; dx++) for (let dz = -16; dz <= -3; dz++) for (let k = -2; k <= -1; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'water');
    g.teleport(x0 + 0.5, y, z0 + 0.5);
    return { x: x0, y, z: z0 };
  });
  const X = base.x, Y = base.y, Z = base.z;
  const SURF = Y - 1 + 14 / 16;
  await ticks(10);

  // ------------------------------------------------------------------ items
  if (run('items')) {
    const boatR = await ev(() => window.__bf.craft(['planks', null, 'planks', 'planks', 'planks', 'planks'], 3));
    check('five planks in a U make a boat', boatR?.id === 'boat' && boatR.count === 1, boatR);
    const rodR = await ev(() => window.__bf.craft([null, null, 'stick', null, 'stick', 'string', 'stick', null, 'string'], 3));
    check('three sticks and two string make a fishing rod', rodR?.id === 'fishing_rod', rodR);
    const items = await ev(() => Object.fromEntries(['boat', 'fishing_rod', 'raw_trout', 'cooked_trout', 'raw_perch', 'cooked_perch'].map((id) => [id, window.__bf.item(id)])));
    check('boat and rod are in the Tools tab, fish in Food', items.boat.category === 'tools' && items.fishing_rod.category === 'tools' && items.raw_trout.category === 'food' && items.cooked_perch.category === 'food', items);
    check('raw fish cooks in a furnace', items.raw_trout.smelt?.result === 'cooked_trout' && items.raw_perch.smelt?.result === 'cooked_perch', items);
    const icons = await ev(() => ['boat', 'fishing_rod', 'raw_trout', 'cooked_perch'].map((id) => { const px = window.__bf.engine.icons.pixels(id); let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++; return n; }));
    check('each new item has its own pixel-art icon', icons.every((n) => n > 40 && n < 256), icons);
    // eat cooked trout
    await ev(() => { window.__bf.game.player.food = 10; });
    await give('cooked_trout', 0, 2);
    await aim(X + 0.5, Y + 5, Z - 30);
    await centre();
    await page.mouse.down({ button: 'right' }); await fast(40); await page.mouse.up({ button: 'right' }); await ticks(2);
    const food = await ev(() => window.__bf.game.player.food);
    check('cooked trout is eaten and fills 5 hunger', food === 15 && (await count('cooked_trout')) === 1, { food });
  }

  // ------------------------------------------------------------------ boats
  if (run('boat')) {
    const boats = () => ev(() => window.__bf.game.entities.boats().map((b) => ({ x: b.x, y: b.y, z: b.z, yaw: b.yaw, afloat: b.afloat, rider: b.rider })));
    const riding = () => ev(() => !!window.__bf.game.riding);
    const home = () => ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y, z + 0.5); g.player.yaw = 0; g.player.pitch = 0; }, [X, Y, Z]);
    await give('boat', 0, 1);
    await aim(X + 0.5, Y - 0.2, Z - 3.5);
    await rclick();
    let bs = await boats();
    check('a boat is put on the water where you look (the item is used)', bs.length === 1 && bs[0].z < Z - 2.5 && bs[0].z > Z - 5 && (await count('boat')) === 0, bs);
    await fast(60);
    bs = await boats();
    check('it floats with its hull just under the surface', bs[0].afloat && Math.abs(bs[0].y - (SURF - 0.3)) < 0.06, { y: bs[0].y, want: SURF - 0.3 });
    await page.screenshot({ path: `${SHOTS}/v16_boat.png` });
    await aim(bs[0].x, bs[0].y + 0.3, bs[0].z);
    await rclick();
    const inBoat = await ev(() => { const g = window.__bf.game, p = g.player, bt = g.riding; return bt && { dx: p.x - bt.x, dz: p.z - bt.z, eye: p.eyeY - bt.y }; });
    check('right-click climbs into the boat (seated, eyes about a metre above the water)', !!inBoat && Math.abs(inBoat.dx) < 0.01 && Math.abs(inBoat.dz) < 0.01 && inBoat.eye > 1.0 && inBoat.eye < 1.5, inBoat);
    // row north (yaw 0 = -z)
    await ev(() => { const g = window.__bf.game; g.riding.yaw = 0; g.player.yaw = 0; g.player.pitch = 0; });
    const r0 = (await boats())[0];
    await page.keyboard.down('KeyW'); await fast(30); await page.keyboard.up('KeyW');
    const r1 = (await boats())[0];
    const speed = await ev(() => Math.hypot(window.__bf.game.riding.vx, window.__bf.game.riding.vz));
    check('W rows the boat forwards', r0.z - r1.z > 3 && Math.abs(r1.x - r0.x) < 0.3 && speed < 0.4, { dz: r0.z - r1.z, speed });
    const pr = await ev(() => { const g = window.__bf.game; return { dx: g.player.x - g.riding.x, dz: g.player.z - g.riding.z }; });
    check('the player moves with the boat', Math.abs(pr.dx) < 0.01 && Math.abs(pr.dz) < 0.01, pr);
    await page.keyboard.down('KeyD'); await fast(20); await page.keyboard.up('KeyD');
    const r2 = (await boats())[0];
    check('D turns it to the right', r2.yaw < r1.yaw - 1, { before: r1.yaw, after: r2.yaw });
    await ev(() => { const g = window.__bf.game; g.riding.yaw = 0; });
    await page.keyboard.down('KeyW'); await fast(160); await page.keyboard.up('KeyW');
    const r3 = (await boats())[0];
    check('the pond edge stops it (it stays on the water, rider aboard)', r3.z > Z - 17 && r3.afloat && (await riding()), r3);
    const stats = await ev(() => ({ boat: window.__bf.game.progress.stats.boat ?? 0, adv: window.__bf.game.progress.done.has('boat') }));
    check('rowing counts "Distance by Boat" and earns Set Sail', stats.boat > 500 && stats.adv, stats);
    // Shift climbs out onto the bank
    await ev((z) => { const g = window.__bf.game; g.riding.setPos(g.riding.x, g.riding.y, z - 4); g.riding.vx = g.riding.vz = 0; }, Z);
    await fast(3);
    await page.keyboard.press('ShiftLeft'); await fast(3);
    const out = await ev(() => { const g = window.__bf.game, p = g.player; return { riding: !!g.riding, x: p.x, y: p.y, z: p.z, water: p.inWater }; });
    check('Shift climbs out onto dry land beside the boat', !out.riding && out.z > Z - 3.5 && Math.abs(out.y - Y) < 0.01, out);
    // hit it three times: it breaks and drops a boat
    const bb = (await boats())[0];
    await aim(bb.x, bb.y + 0.3, bb.z);
    await lclick(); await fast(6);
    const after1 = (await boats()).length;
    await lclick(); await fast(6); await lclick(); await fast(6);
    const dropped = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'boat').length);
    check('three hits break the boat and it drops as an item', after1 === 1 && (await boats()).length === 0 && dropped === 1, { after1, dropped });
    await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item') e.removed = true; });
    // on land it hardly moves
    await home();
    await give('boat', 0, 1);
    await aim(X + 2.5, Y, Z + 2.5);
    await rclick();
    const land = (await boats())[0];
    await aim(land.x, land.y + 0.3, land.z); await rclick();
    await ev(() => { const g = window.__bf.game; g.riding.yaw = Math.PI; });
    await page.keyboard.down('KeyW'); await fast(40); await page.keyboard.up('KeyW');
    const land2 = (await boats())[0];
    // (about 12 blocks in the same time on water)
    check('on land a boat is dragged along slowly', !land2.afloat && Math.hypot(land2.x - land.x, land2.z - land.z) < 3, { moved: Math.hypot(land2.x - land.x, land2.z - land.z) });
    await page.keyboard.press('ShiftLeft'); await fast(3);
    // Creative: one hit, nothing dropped
    await ev(() => window.__bf.game.setGameMode('creative'));
    await aim(land2.x, land2.y + 0.3, land2.z); await lclick(); await fast(30);
    check('in Creative one hit removes a boat and drops nothing', (await boats()).length === 0 && (await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'boat').length)) === 0);
    await ev(() => window.__bf.game.setGameMode('survival'));
    // sitting in a boat is saved: back in it after Save and Quit
    await home();
    await give('boat', 0, 1);
    await aim(X + 0.5, Y - 0.2, Z - 3.5); await rclick(); await fast(40);
    const sb = (await boats())[0];
    await aim(sb.x, sb.y + 0.3, sb.z); await rclick();
    const wid = await ev(() => window.__bf.game.record.id);
    await ev(() => window.__bf.engine.saveAndQuit());
    await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 20000);
    await ev((id) => window.__bf.engine.playWorld(id), wid);
    await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'game', 60000);
    await ticks(5);
    const back = await ev(() => { const g = window.__bf.game; return { riding: !!g.riding, boats: g.entities.boats().length, afloat: g.riding?.afloat }; });
    check('saved in a boat: after loading you are sitting in it again', back.riding && back.boats === 1, back);
    await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
    await page.keyboard.press('ShiftLeft'); await ticks(3);
    await ev(([x, y, z]) => { const g = window.__bf.game; for (const bt of g.entities.boats()) bt.removed = true; g.teleport(x + 0.5, y, z + 0.5); }, [X, Y, Z]);
    await ticks(5);
  }

  // ------------------------------------------------------------------ fishing
  if (run('fish')) {
    const bob = () => ev(() => { const bb = window.__bf.game.bobber; return bb && { state: bb.state, wait: bb.wait, bite: bb.bite, approach: bb.approach, x: bb.x, y: bb.y, z: bb.z }; });
    const rodDamage = () => ev(() => window.__bf.game.inventory.slots[0]?.damage ?? 0);
    await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y, z + 0.5); g.player.yaw = 0; g.player.pitch = 0; }, [X, Y, Z]);
    await give('fishing_rod', 0, 1);
    await aim(X + 0.5, SURF, Z - 7);
    await rclick();
    let fb = await bob();
    check('right-click with a fishing rod casts the line', !!fb, fb);
    await fast(60);
    fb = await bob();
    check('the float lands on the water and bobs there', fb?.state === 'floating' && Math.abs(fb.y - (SURF - 0.12)) < 0.1 && fb.z < Z - 3, fb);
    await page.screenshot({ path: `${SHOTS}/v16_fishing.png` });
    // nothing biting: reeling in brings nothing and costs nothing
    await rclick();
    check('reeling in with no bite catches nothing and does not wear the rod', !(await bob()) && (await rodDamage()) === 0);
    // a bite: the float is pulled under; reel in now
    await rclick(); await fast(60);
    await ev(() => window.__bf.hurryBite());
    let saw = null;
    for (let i = 0; i < 90 && !saw; i++) { await fast(1); const s = await bob(); if (s?.approach > 0 && !saw) saw = 'approach'; if (s?.bite > 0) saw = 'bite'; }
    if (saw !== 'bite') for (let i = 0; i < 90; i++) { await fast(1); const s = await bob(); if (s?.bite > 0) { saw = 'bite'; break; } }
    const biting = await bob();
    check('a fish swims up and bites (the float dips)', saw === 'bite' && biting.bite > 0 && biting.y < SURF - 0.12, biting);
    const before = await ev(() => window.__bf.game.inventory.countItem('raw_trout'));
    await ev(() => { window.__realRandom = Math.random; Math.random = () => 0.1; });
    await rclick();
    await ev(() => { Math.random = window.__realRandom; });
    await fast(60);
    const caught = await ev(() => ({ trout: window.__bf.game.inventory.countItem('raw_trout'), stat: window.__bf.game.progress.stats.fish_caught ?? 0, adv: window.__bf.game.progress.done.has('fish'), xp: window.__bf.game.player.xpTotal }));
    check('reeling in during the bite lands the fish, which flies to you', caught.trout === before + 1, caught);
    check('catching counts in "Fish Caught", earns Catch of the Day and some experience', caught.stat === 1 && caught.adv && caught.xp > 0, caught);
    check('a catch wears the rod by 1', (await rodDamage()) === 1);
    // a missed bite: the fish gets away and the wait starts again
    await rclick(); await fast(60);
    await ev(() => window.__bf.hurryBite());
    for (let i = 0; i < 200; i++) { await fast(1); if ((await bob())?.bite > 0) break; }
    for (let i = 0; i < 60; i++) { await fast(1); if (!((await bob())?.bite > 0)) break; }
    const missed = await bob();
    check('miss the bite and the fish gets away (the wait starts again)', missed && missed.bite === 0 && missed.wait > 50, missed);
    // switching items snaps the line
    await ev(() => { const g = window.__bf.game; g.inventory.selected = 3; g.inventory.changed(); });
    await fast(2);
    check('putting the rod away snaps the line', !(await bob()));
    await ev(() => { const g = window.__bf.game; g.inventory.selected = 0; g.inventory.changed(); });
    // cast onto the ground: reeling it back wears the rod by 2
    await aim(X + 0.5, Y, Z + 4);
    await rclick(); await fast(40);
    const onGround = await bob();
    const d0 = await rodDamage();
    await rclick();
    check('a float on the ground is reeled back at twice the wear', onGround?.state === 'ground' && (await rodDamage()) === d0 + 2, { onGround, d0, d1: await rodDamage() });
    // rain brings fish sooner
    const rate = await ev(() => {
      const g = window.__bf.game;
      const bb = g.entities.spawnBobber(g.player.x, 71, g.player.z - 7, 0, 0, 0);
      bb.state = 'floating';
      const measure = (rain) => { g.weather.set(rain ? 'rain' : 'clear', 99999, true); bb.wait = 100000; bb.approach = 0; bb.bite = 0; const w0 = bb.wait; for (let i = 0; i < 2000; i++) bb.fish(g, 69.875); return w0 - bb.wait; };
      const dry = measure(false), wet = measure(true);
      bb.removed = true; g.weather.set('clear', 99999, true);
      return { dry, wet };
    });
    check('fish bite sooner in the rain', rate.dry === 2000 && rate.wet > 2300, rate);
    // the loot table: mostly fish, a little junk and treasure
    const table = await ev(() => { const n = { fish: 0, junk: 0, treasure: 0 }; for (let i = 0; i < 4000; i++) n[window.__bf.rollCatch(i / 4000).kind]++; return n; });
    check('catches: about 85% fish, 10% junk, 5% treasure', Math.abs(table.fish / 4000 - 0.85) < 0.01 && Math.abs(table.junk / 4000 - 0.10) < 0.01 && Math.abs(table.treasure / 4000 - 0.05) < 0.01, table);
    // fishing from a boat
    await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y, z + 0.5); }, [X, Y, Z]);
    await give('boat', 1, 1);
    await aim(X + 0.5, Y - 0.2, Z - 3.5); await rclick(); await fast(40);
    const fbt = (await ev(() => window.__bf.game.entities.boats()))[0];
    const bt = await ev(() => { const b = window.__bf.game.entities.boats()[0]; return { x: b.x, y: b.y, z: b.z }; });
    await aim(bt.x, bt.y + 0.3, bt.z); await rclick();
    await ev(() => { const g = window.__bf.game; g.inventory.selected = 0; g.inventory.changed(); g.player.yaw = 0; });
    await aim(X + 0.5, SURF, Z - 12);
    await rclick(); await fast(60);
    const fromBoat = await bob();
    check('you can fish from a boat', !!fbt && (await ev(() => !!window.__bf.game.riding)) && fromBoat?.state === 'floating', fromBoat);
    await page.screenshot({ path: `${SHOTS}/v16_boat_fishing.png` });
    await rclick();
    await page.keyboard.press('ShiftLeft'); await fast(2);
  }
  check('no script errors (boats and fishing)', errors.length === 0, errors.slice(0, 5));
  await page.close();
}

// ======================================================================= CONTINUE, REOPEN, BACKUP NOTE
if (run('continue')) {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  await ctx.addInitScript(() => {
    window.__persistCalls = 0;
    if (navigator.storage?.persist) { const o = navigator.storage.persist.bind(navigator.storage); navigator.storage.persist = () => { window.__persistCalls++; return o(); }; }
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const { ev, wait, waitFor, screen } = helpers(page);
  await page.goto(URL);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await wait(800);
  check('with no worlds yet there is no Continue button', !(await page.$('[data-testid=btn-continue]')));
  await newWorld(page, 'First World', 'one');
  const firstId = await ev(() => window.__bf.game.record.id);
  const persist = await ev(() => window.__persistCalls);
  check('entering a world asks the browser to keep Blockfell\'s storage', persist >= 1, persist);
  check('while a world is open it is remembered for reopening', (await ev(() => localStorage.getItem('blockfell.resume'))) === firstId);
  // the app is closed without Save and Quit (a phone closing it in the background): reopening goes straight back in
  await page.reload();
  const resumed = await waitFor(async () => (await screen()) === 'game', 90000);
  check('reopened after closing mid-game: straight back into the same world', resumed && (await ev(() => window.__bf.game?.record.id)) === firstId);
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 20000);
  check('Save and Quit forgets it (next start shows the title screen)', (await ev(() => localStorage.getItem('blockfell.resume'))) === null);
  await page.reload();
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await wait(2500);
  const cont = await page.textContent('[data-testid=btn-continue]').catch(() => null);
  check('after quitting, the title screen stays up and offers "Continue: First World"', (await screen()) === 'title' && /Continue: First World/.test(cont || ''), cont);
  await page.screenshot({ path: `${SHOTS}/v16_title_continue.png` });
  await newWorld(page, 'Second World', 'two');
  const secondId = await ev(() => window.__bf.game.record.id);
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 20000); await wait(800);
  const cont2 = await page.textContent('[data-testid=btn-continue]');
  check('Continue follows the world played last', /Second World/.test(cont2), cont2);
  await page.click('[data-testid=btn-continue]');
  check('Continue loads it', await waitFor(async () => (await screen()) === 'game' && (await ev(() => window.__bf.game?.record.id)) === secondId, 60000));
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 20000); await wait(500);
  // the world list starts with the latest world selected
  await page.click('[data-testid=btn-singleplayer]'); await wait(800);
  const sel = await ev(() => ({ sel: window.__bf.ui.get().selectedWorld, play: !document.querySelector('[data-testid=btn-play-selected]').disabled }));
  check('the world list opens with the world played last already selected', sel.sel === secondId && sel.play, sel);
  const note1 = await page.textContent('[data-testid=backup-note]');
  check('a world never exported shows "Not backed up yet" with a reminder', /Not backed up yet - use Export World/.test(note1 || ''), note1);
  await ev((id) => window.__bf.engine.markBackedUp(id), secondId); await wait(600);
  const note2 = await page.textContent('[data-testid=backup-note]');
  check('after an export it shows "Last backup today"', /^Last backup today$/.test((note2 || '').trim()), note2);
  await ev(async (id) => { const s = window.__bf.engine.saves; const r = await s.getWorld(id); r.lastBackup = Date.now() - 10 * 86400000; r.lastPlayed = Date.now(); await s.putWorld(r); window.__bf.ui.set((u) => ({ worldsVersion: u.worldsVersion + 1 })); }, secondId);
  await wait(600);
  const note3 = await page.textContent('[data-testid=backup-note]');
  check('played since a backup more than a week old: the reminder comes back', /Last backup 10 days ago - use Export World/.test(note3 || ''), note3);
  await page.screenshot({ path: `${SHOTS}/v16_worlds_backup.png` });
  // Options: Reopen Last World off
  await ev(() => window.__bf.engine.setOption('reopenLastWorld', false));
  await ev((id) => window.__bf.engine.playWorld(id), firstId);
  await waitFor(async () => (await screen()) === 'game', 60000); await wait(500);
  await page.reload();
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await wait(3000);
  check('with Reopen Last World off, a restart shows the title screen', (await screen()) === 'title');
  await ev(() => window.__bf.engine.setOption('reopenLastWorld', true));
  // a remembered world that no longer loads never traps the start-up
  await ev(() => localStorage.setItem('blockfell.resume', 'no-such-world'));
  await page.reload();
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await wait(3000);
  check('a missing remembered world is simply forgotten', (await screen()) === 'title' && (await ev(() => localStorage.getItem('blockfell.resume'))) === null);
  const regs = await ev(async () => (await navigator.serviceWorker.getRegistrations()).length);
  check('no offline copy is installed by the development server', regs === 0, regs);
  check('no script errors (continue)', errs.length === 0, errs.slice(0, 5));
  await ctx.close();
}

// ======================================================================= OFFLINE AND UPDATES (single-file build)
if (run('offline')) {
  const URL1 = process.env.URL1 || 'http://localhost:8765/';
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const { ev, wait, waitFor } = helpers(page);
  await page.goto(URL1);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const sw = await ev(async () => { await navigator.serviceWorker.ready; await new Promise((r) => setTimeout(r, 1500)); const c = await caches.open('blockfell-page-v1'); return { keys: (await c.keys()).map((k) => k.url), ctl: !!navigator.serviceWorker.controller }; });
  check('served from a web address, Blockfell keeps an offline copy of itself', sw.keys.length === 1 && sw.keys[0] === URL1, sw);
  await ctx.setOffline(true);
  await page.reload();
  const off = await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }).then(() => true, () => false);
  check('with no connection it still starts', off);
  await newWorld(page, 'Offline World', 'off');
  check('...and a new world can be made and played offline', (await ev(() => window.__bf.state().screen)) === 'game');
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 20000);
  await ctx.setOffline(false);
  check('no update notice when nothing new is online', !(await page.$('[data-testid=update-banner]')) && (await ev(() => window.__bf.checkUpdate(true))) === null);
  check('no script errors (offline)', errs.length === 0, errs.slice(0, 5));
  await ctx.close();

  // updates: a copy of the build on another port, then a "new version" of it appears
  const dir = process.env.UPD_DIR, URL2 = process.env.UPD_URL;
  if (dir && URL2) {
    const ctx2 = await b.newContext({ viewport: { width: VW, height: VH } });
    const p2 = await ctx2.newPage();
    const h2 = helpers(p2);
    await p2.goto(URL2);
    await p2.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
    await h2.ev(async () => { await navigator.serviceWorker.ready; await new Promise((r) => setTimeout(r, 1500)); });
    const html = fs.readFileSync(`${dir}/index.html`, 'utf8');
    fs.writeFileSync(`${dir}/index.html`, html.replace(/(<meta name="blockfell-build" content=")[^"]*"/, '$1test-new-build"').replace(/(<meta name="blockfell-version" content=")[^"]*"/, '$19.9.9"'));
    const found = await h2.ev(() => window.__bf.checkUpdate(true));
    await h2.wait(500);
    const banner = await p2.textContent('[data-testid=update-banner]').catch(() => null);
    check('a newer build online is downloaded and offered: "Blockfell 9.9.9 is ready"', found === '9.9.9' && /Blockfell 9\.9\.9 is ready/.test(banner || ''), { found, banner });
    await p2.screenshot({ path: `${SHOTS}/v16_update.png` });
    await p2.click('[data-testid=btn-restart-update]');
    await p2.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
    const served = await h2.ev(() => document.querySelector('meta[name=blockfell-build]')?.getAttribute('content'));
    check('Restart starts the new version', served === 'test-new-build', served);
    fs.writeFileSync(`${dir}/index.html`, html);
    await ctx2.close();
  }
}

await b.close();
console.log('\n==== SUMMARY');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(72)} ${i.slice(0, 200)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
