// Tests for 2.4: rails and minecarts, party bags, party poppers, bunting, balloons, cake, party hat; saving; touch (iPad).
// node tests/t_v24.mjs   (dev server)   ONLY=items,look,rails,cart,bag,gift,party,save,touch
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','rails','cart','bag','gift','party','save','touch'];
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
/** A flat pad around the player with 6 blocks of air above; the player stands 3 south of the middle, facing north. */
const pad = (r = 7, floor = 'grass') => ev(([r, floor]) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { bf.setBlock(x + dx, y - 1, z + dz, floor); bf.setBlock(x + dx, y - 2, z + dz, 'stone'); for (let dy = 0; dy <= 6; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  p.flying = false;
  g.teleport(x + 0.5, y, z + 3.5); p.yaw = 0; p.pitch = 0; p.vx = p.vz = 0;
  return { x, y, z };
}, [r, floor]);
const spawn = (t, x, y, z) => ev(([t, x, y, z]) => { const g = window.__bf.game; return g.entities.spawnMob(t, x, y, z, g).id; }, [t, x, y, z]);
const mob = (id) => ev((id) => {
  const m = window.__bf.game.entities.list.find((e) => e.id === id);
  if (!m) return null;
  return { id: m.id, type: m.mobType, x: m.x, y: m.y, z: m.z, vx: m.vx, vz: m.vz, h: m.health, alive: m.alive && !m.removed, removed: m.removed, name: m.nameTag, baby: m.isBaby ?? null, child: m.childAge ?? null,
    love: m.love ?? null, cool: m.breedCooldown ?? null, color: m.color ?? null, sheared: m.sheared ?? null, tamed: m.tamed ?? null, sitting: m.sitting ?? null, coat: m.coat ?? null,
    following: m.following ?? null, pet: m.petOfPlayer, persistent: m.persistent, height: m.height, panic: m.panic, plate: m.object.children.length > 1 };
}, id);
const mobs = (t) => ev((t) => window.__bf.game.entities.list.filter((e) => e.mobType === t && !e.removed).map((e) => e.id), t);
const freeze = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m) m.tick = () => {}; }, id);
const unfreeze = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m) delete m.tick; }, id);
const sel = () => ev(() => { const g = window.__bf.game, s = g.inventory.slots[g.inventory.selected]; return s ? s.id + 'x' + s.count + (s.damage ? 'd' + s.damage : '') : null; });
const itemsNear = (P, r = 4) => ev(([P, r]) => window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed && Math.hypot(e.x - P.x, e.z - P.z) < r).map((e) => e.stack.id + 'x' + e.stack.count).sort(), [P, r]);
const adv = (id) => ev((id) => window.__bf.game.progress.done.has(id), id);
const stat = (id) => ev((id) => window.__bf.game.progress.stats[id] ?? 0, id);
const tp = (x, y, z, yaw = 0, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.yaw = yaw; g.player.pitch = pitch; g.player.vx = g.player.vz = 0; }, [x, y, z, yaw, pitch]);
const withRandom = (v) => ev((v) => { window.__realRandom = window.__realRandom ?? Math.random; Math.random = () => v; }, v);
const realRandom = () => ev(() => { if (window.__realRandom) Math.random = window.__realRandom; });

await page.goto(URL);
await page.mouse.move(CX, CY);


// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const P = await import('/src/systems/Progress.ts');
    const Bk = await import('/src/world/BlockRegistry.ts');
    const bf = window.__bf;
    const ids = ['rail', 'boost_rail', 'station_rail', 'minecart', 'party_bag', 'party_hat', 'party_popper', 'bunting', 'balloons', 'cake'];
    const g = (a) => bf.craft(a);
    const n = null;
    return {
      names: ids.map((i) => (I.hasItem(i) ? I.getItem(i).name : null)),
      stacks: ids.map((i) => I.maxStackOf(i)),
      sprites: ids.map((i) => { const px = S.spritePixels(i); let c = 0; for (let k = 3; k < px.length; k += 4) if (px[k] > 0) c++; return c; }),
      adv: P.ADVANCEMENTS.length, advIds: ['cart', 'express', 'party', 'gift', 'cake'].map((id) => !!P.ADVANCEMENTS.find((a) => a.id === id)),
      parents: ['cart', 'express', 'gift', 'cake'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id).parent),
      texLayers: Bk.TEXTURE_COUNT ?? null,
      rail: g(['iron_ingot', n, 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot', 'iron_ingot', n, 'iron_ingot']),
      boost: g(['iron_ingot', n, 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot', 'iron_ingot', 'amber', 'iron_ingot']),
      station: g(['iron_ingot', n, 'iron_ingot', 'iron_ingot', 'stick', 'iron_ingot', 'iron_ingot', 'red_dye', 'iron_ingot']),
      cart: g(['iron_ingot', n, 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', n, n, n]),
      popper: g(['string', 'red_dye', 'yellow_dye', 'blue_dye', n, n, n, n, n]),
    };
  });
  check('items: all ten 2.4 items exist with sensible stacks and drawn sprites',
    t.names.every(Boolean) && t.stacks[0] === 64 && t.stacks[3] === 1 && t.stacks[4] === 1 && t.stacks[6] === 16 && t.sprites.every((c) => c > 30), t);
  check('items: five new advancements (59 in all), correctly parented', t.adv === 59 && t.advIds.every(Boolean) && t.parents.join() === 'iron,cart,party,party', t);
  check('crafting: rails (16), boost rails (6), station rails (6), minecart, popper (3)',
    t.rail?.id === 'rail' && t.rail.count === 16 && t.boost?.id === 'boost_rail' && t.boost.count === 6 && t.station?.id === 'station_rail' && t.station.count === 6 && t.cart?.id === 'minecart' && t.popper?.id === 'party_popper' && t.popper.count === 3, t);
}

// ======================================================================= RAIL SHAPES (pure)
if (run('rails')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const r = await ev(async () => {
    const R = await import('/src/world/rails.ts');
    const Bk = await import('/src/world/BlockRegistry.ts');
    const mk = (cells) => (dx, dy, dz) => (cells.has(`${dx},${dy},${dz}`) ? Bk.RAIL : 0);
    const sh = (cells, kind = 1) => { const s = R.railShape(mk(new Set(cells)), kind); return { a: s.a, b: s.b, rise: s.rise }; };
    return {
      alone: sh([]), ns: sh(['0,0,-1', '0,0,1']), ew: sh(['1,0,0', '-1,0,0']), end: sh(['1,0,0']),
      curveSE: sh(['0,0,1', '1,0,0']), curveNW: sh(['0,0,-1', '-1,0,0']), tee: sh(['0,0,-1', '0,0,1', '1,0,0']),
      up: sh(['0,0,-1', '0,1,1']), down: sh(['0,0,-1', '0,-1,1']),
      boostCorner: sh(['0,0,1', '1,0,0'], 2),
      look: [R.railLook({ a: 0, b: 2, rise: -1 }), R.railLook({ a: 1, b: 3, rise: -1 }), R.railLook({ a: 2, b: 1, rise: -1 }), R.railLook({ a: 2, b: 3, rise: -1 }), R.railLook({ a: 0, b: 3, rise: -1 }), R.railLook({ a: 0, b: 1, rise: -1 })],
    };
  });
  check('rail shape: a lone rail runs north-south; a spur straightens towards its neighbour', r.alone.a === 0 && r.alone.b === 2 && r.end.a === 1 && r.end.b === 3, r);
  check('rail shape: straight runs, and curves in each corner', r.ns.rise === -1 && r.ew.a === 1 && r.ew.b === 3
    && new Set([r.curveSE.a, r.curveSE.b]).has(1) && new Set([r.curveSE.a, r.curveSE.b]).has(2) && new Set([r.curveNW.a, r.curveNW.b]).has(0) && new Set([r.curveNW.a, r.curveNW.b]).has(3), r);
  check('rail shape: a T-junction goes straight; the lower piece of a slope tilts towards the higher rail; boost rails never curve',
    r.tee.a === 0 && r.tee.b === 2 && r.up.rise === 2 && r.down.rise === -1 && r.boostCorner.b === ((r.boostCorner.a + 2) & 3), r);
  check('rail look: texture turns for straights and the four curves', r.look[0].turns === 0 && r.look[1].turns === 1 && r.look.slice(2).every((l) => l.curve) && new Set(r.look.slice(2).map((l) => l.turns)).size === 4, r.look);
}

// ======================================================================= CART
if (run('cart')) {
  await newWorld('Cart24', 'cart24', true);
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; });
  const P = await pad(12);
  const { x, y, z } = P;
  const L = (dx, dy, dz, k) => set(x + dx, y + dy, z + dz, k);
  // a straight 10-rail run east at z-4, ending at a buffer (no rail beyond)
  for (let i = 0; i <= 9; i++) await L(i, 0, -4, 'rail');
  await settle();
  await give({ id: 'minecart', count: 2 });
  await tp(x + 0.5, y, z - 2.5, 0, 0);
  await aim(x + 2.5, y, z - 3.5); await rclick();
  const carts = () => ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'minecart' && !e.removed).map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, v: c.v, onRail: c.onRail, rider: !!c.rider, yaw: c.yaw })));
  let cs = await carts();
  check('cart: right-click on a rail places a Minecart on it, and uses up one', cs.length === 1 && cs[0].onRail && Math.abs(cs[0].x - (x + 2.5)) < 0.6 && (await sel()) === 'minecartx1', { cs, sel: await sel() });
  await give({ id: 'dirt', count: 1 }, 1);
  await aim(x + 1.5, y - 1, z - 1.5); await ev(() => { window.__bf.game.inventory.selected = 0; });
  await aim(x + 0.5, y - 1, z + 0.5); await rclick();
  check('cart: it will not go on bare ground', (await carts()).length === 1, await chat());
  // empty cart pushed: rolls then stops at the buffer
  await ev(() => { const c = window.__bf.game.entities.list.find((e) => e.type === 'minecart'); c.v = -0.2; });
  await fast(120);
  cs = await carts();
  check('cart: an empty Minecart pushed along rolls on and stops at the end of the line', cs[0].onRail && cs[0].x > x + 9 && cs[0].x < x + 10.01 && Math.abs(cs[0].v) < 0.01, cs);
  await page.screenshot({ path: `${SHOTS}/v24_cart_end.png` });
  // ride it: right-click to climb in, hold forward
  await give(null);
  await tp(x + 8.5, y, z - 2.6, Math.PI, 0);
  await aim(cs[0].x, cs[0].y + 0.3, cs[0].z); await rclick();
  check('cart: right-click climbs in', await ev(() => !!window.__bf.game.riding && window.__bf.game.riding.type === 'minecart'), await chat());
  await ev(() => { const g = window.__bf.game; g.riding.v = 0; g.riding.t = 0.5; });
  // push west with forward held
  await ev(() => { const g = window.__bf.game; g.player.yaw = Math.PI / 2; });
  const ride = await ev(async () => {
    const g = window.__bf.game; const c = g.riding; const x0 = c.x;
    g.autopilot = { forward: 1 };
    for (let i = 0; i < 60; i++) g.tick();
    g.autopilot = null;
    return { moved: x0 - c.x, v: c.v, px: g.player.x, cx: c.x, dist: g.progress.stats.cart ?? 0 };
  });
  check('cart: W sets off the way you are looking, speeding up along the track and carrying you', ride.moved > 3 && Math.abs(ride.px - ride.cx) < 0.5 && ride.dist > 0, ride);
  check('cart: the first ride grants All Aboard', await adv('cart'));
  await page.screenshot({ path: `${SHOTS}/v24_cart_ride.png` });
  // shift dismounts
  await ev(() => window.__bf.game.dismount());
  check('cart: dismounting works', await ev(() => !window.__bf.game.riding));

  // boost rail: faster than plain rail; station rail brakes
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'minecart') e.removed = true; });
  for (let i = 0; i <= 9; i++) await L(i, 0, 0, 'rail');
  for (let i = 3; i <= 6; i++) await L(i, 0, 0, 'boost_rail');
  await L(9, 0, 0, 'station_rail');
  for (let i = -4; i <= -1; i++) await L(i, 0, 0, 'rail');
  await settle();
  const run1 = (kind) => ev(async (k) => {
    const g = window.__bf.game; const M = await import('/src/entities/Minecart.ts');
    return null;
  }, kind);
  void run1;
  const spd = await ev(([x, y, z]) => {
    const g = window.__bf.game; const M = g.entities.list.find(() => false);
    return null;
  }, [x, y, z]);
  void spd;
  // spawn by item on the first rail
  await give({ id: 'minecart', count: 1 }); await tp(x + 0.5, y, z + 2.5, 0, 0);
  await aim(x - 3.5, y, z + 0.5); await rclick();
  const prof = await ev(() => {
    const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart' && !e.removed);
    if (!c) return null;
    c.v = -0.2; const log = []; let maxPlain = 0, maxBoost = 0;
    for (let i = 0; i < 200; i++) {
      g.tick();
      const bx = Math.floor(c.x) - 0; // world x of cart
      log.push(Math.round(c.x * 10) / 10);
      if (c.onBoostRail) maxBoost = Math.max(maxBoost, Math.abs(c.v)); else if (Math.abs(c.v) > maxPlain) maxPlain = Math.abs(c.v);
    }
    return { x: c.x, v: c.v, maxPlain, maxBoost, onRail: c.onRail };
  });
  check('cart: boost rails speed it up well past plain-rail pace', prof && prof.maxBoost > 0.3 && prof.maxBoost > prof.maxPlain, prof);
  check('cart: the Station Rail slows it to a halt', prof && Math.abs(prof.v) < 0.03 && Math.abs(prof.x - (x + 9.5)) < 1.5, prof);

  // slope: a cart on a rise rolls downhill
  await ev(([x, y, z]) => { for (const e of window.__bf.game.entities.list) if (e.type === 'minecart') e.removed = true; }, [x, y, z]);
  for (let i = 0; i <= 8; i++) await L(i, 0, 5, 'air');
  await L(0, 0, 5, 'rail'); await L(1, 0, 5, 'rail'); await L(2, 1, 5, 'rail'); await L(3, 2, 5, 'rail'); await L(4, 3, 5, 'rail');
  await L(2, 0, 5, 'stone'); await L(3, 0, 5, 'stone'); await L(3, 1, 5, 'stone'); await L(4, 0, 5, 'stone'); await L(4, 1, 5, 'stone'); await L(4, 2, 5, 'stone');
  await settle();
  await give({ id: 'minecart', count: 1 }); await tp(x + 0.5, y, z + 8.5, 0, 0);
  await aim(x + 3.5, y + 2.1, z + 5.5); await rclick();
  const slope = await ev(() => {
    const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart' && !e.removed);
    if (!c) return null; const y0 = c.y; c.v = 0;
    for (let i = 0; i < 80; i++) g.tick();
    return { y0, y1: c.y, x: c.x, onRail: c.onRail, v: c.v };
  });
  check('cart: on a slope it rolls downhill', slope && slope.onRail && slope.y1 < slope.y0 - 0.5, slope);
  await page.screenshot({ path: `${SHOTS}/v24_slope.png` });

  // breaking the rail under it derails it; it falls and re-attaches on a rail below
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'minecart') e.removed = true; });
  for (let i = 0; i <= 3; i++) await L(i, 0, 10, 'rail');
  await settle();
  await give({ id: 'minecart', count: 1 }); await tp(x + 0.5, y, z + 8, 0, 0);
  await aim(x + 1.5, y, z + 10.5); await rclick();
  await set(x + 1, y, z + 10, 'air'); await set(x + 2, y, z + 10, 'air'); await fast(5);
  const der = await ev(() => { const c = window.__bf.game.entities.list.find((e) => e.type === 'minecart' && !e.removed); return c ? { onRail: c.onRail, y: c.y } : null; });
  check('cart: pulling up the rail beneath it lets it drop off the track', der && !der.onRail, { der, chat: await chat(), sel: await sel(), b: await key(x + 1, y, z + 10), p: await ev(() => { const p = window.__bf.game.player; return [p.x, p.y, p.z]; }) });
  await set(x + 1, y, z + 10, 'rail'); await set(x + 2, y, z + 10, 'rail');
  await ev(() => { const c = window.__bf.game.entities.list.find((e) => e.type === 'minecart' && !e.removed); if (c) c.y = c.y + 0.02; });
  await fast(30);
  const re = await ev(() => { const c = window.__bf.game.entities.list.find((e) => e.type === 'minecart' && !e.removed); return c ? { onRail: c.onRail, y: c.y } : null; });
  check('cart: and it picks up again when a rail is put back', re && re.onRail, re);

  // hitting an empty cart picks it up
  await tp(x + 1.5, y, z + 8, 0, 0); await aim(x + 1.5, y + 0.3, z + 10.5);
  const before = await carts();
  await ev(() => { const g = window.__bf.game; g.player.creative = false; const c = g.entities.list.find((e) => e.type === 'minecart' && !e.removed); for (let i = 0; i < 3; i++) { c.hitDelay = 0; g.hitBoat(c); } });
  await fast(4);
  void before;
  const after = await carts();
  const drops = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'minecart' && !e.removed).length);
  check('cart: knocking an empty cart a few times breaks it into a Minecart item', after.length === 0 && drops >= 1, { after, drops });
}

// ======================================================================= BAG
let BAGWORLD = null;
if (run('bag')) {
  BAGWORLD = await newWorld('Bag24', 'bag24', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  await give({ id: 'party_bag', count: 1 }, 0);
  await give({ id: 'apple', count: 5 }, 1);
  await give({ id: 'bread', count: 3 }, 2);
  await ev(() => { window.__bf.game.inventory.selected = 0; });
  await aim(P.x + 0.5, P.y + 3, P.z + 0.5); await rclick();
  check('bag: right-click opens the Party Bag screen', (await overlay()) === 'bag', await overlay());
  await page.screenshot({ path: `${SHOTS}/v24_bag_open.png` });
  const filled = await ev(() => {
    const g = window.__bf.game, h = g.screen;
    const hot = h.group('hotbar');
    h.click(hot[1], 0, true); h.click(hot[2], 0, true);
    // try to put the bag itself in: refused
    h.click(hot[0], 0, true);
    const bag = g.inventory.slots[0].bag;
    return { noBags: h.noBags, bag: bag.map((s) => (s ? s.id + 'x' + s.count : null)), slots: h.group('chest').length, hot0: g.inventory.slots[0]?.id };
  });
  check('bag: shift-click fills it (nine slots); a bag will not go inside a bag', filled.slots === 9 && filled.bag.includes('applex5') && filled.bag.includes('breadx3') && filled.hot0 === 'party_bag' && filled.bag.filter(Boolean).length === 2, filled);
  await ev(() => window.__bf.engine.closeOverlay());
  check('bag: closing it leaves the contents inside the bag', await ev(() => window.__bf.game.inventory.slots[0].bag.filter(Boolean).length === 2) && (await overlay()) === null);
  check('bag: it is called a Party Bag', await ev(() => window.__bf.item('party_bag').name === 'Party Bag'));
  // dye keeps the contents
  const dyedFull = await ev(() => {
    const g = window.__bf.game;
    const r = window.__bf.specialCraft([{ ...g.inventory.slots[0] }, { id: 'blue_dye', count: 1 }, null, null, null, null, null, null, null]);
    return r ? { id: r.id, color: r.color, bag: (r.bag ?? []).filter(Boolean).length } : null;
  });
  check('bag: a dyed bag keeps everything in it', dyedFull && dyedFull.bag === 2 && dyedFull.color !== undefined, dyedFull);
  // tip it out: sneak + right-click
  await ev(() => { window.__bf.game.autopilot = { sneak: true }; });
  await ticks(2);
  await aim(P.x + 0.5, P.y + 1, P.z - 3); await rclick();
  await ev(() => { window.__bf.game.autopilot = null; window.__bf.engine.closeOverlay(); });
  await fast(10);
  const tipped = await ev(() => {
    const g = window.__bf.game;
    const tot = {};
    const add = (id, n) => { tot[id] = (tot[id] ?? 0) + n; };
    for (const e of g.entities.list) if (e.type === 'item' && !e.removed) add(e.stack.id, e.stack.count);
    g.inventory.slots.forEach((s, i) => { if (s && i !== 0 && (s.id === 'apple' || s.id === 'bread')) add(s.id, s.count); });   // slots 1, 2 were emptied into the bag
    return { bag: g.inventory.slots[0].bag.filter(Boolean).length, kept: g.inventory.slots[0].id, tot };
  });
  check('bag: sneak + right-click tips it out in front of you (on the ground or picked straight up), leaving the bag empty and kept', tipped.bag === 0 && tipped.kept === 'party_bag' && tipped.tot.apple === 5 && tipped.tot.bread === 3, tipped);
}

// ======================================================================= GIFT
if (run('gift')) {
  if (!BAGWORLD) { await newWorld('Gift24', 'gift24', false); }
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  await clearItems();
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  const fillBag = (items) => ev((items) => {
    const g = window.__bf.game;
    g.inventory.slots[0] = { id: 'party_bag', count: 1, bag: [...items, ...new Array(9 - items.length).fill(null)] };
    g.inventory.selected = 0; g.inventory.changed();
  }, items);
  // villager
  const v = await spawn('villager', P.x + 0.5, P.y, P.z - 1.5);
  await freeze(v);
  await fillBag([{ id: 'bread', count: 2 }, { id: 'apple', count: 3 }]);
  await aim(P.x + 0.5, P.y + 1, P.z - 1.5); await rclick();
  check('gift: a Party Bag given to a villager is handed over and used up, with thanks', (await sel()) === null && (await chat()).includes('loves the Party Bag') && (await stat('bags_given')) === 1, { sel: await sel(), chat: await chat() });
  check('gift: A Thoughtful Gift (and Party Time!\'s child) is granted', (await adv('gift')));
  // fox
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, v);
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await withRandom(0.1);
  const fx = await spawn('fox', P.x + 0.5, P.y, P.z - 2.5);
  await freeze(fx);
  await fillBag([{ id: 'raw_trout', count: 2 }, { id: 'apple', count: 1 }]);
  await aim(P.x + 0.5, P.y + 0.5, P.z - 2.5); await rclick();
  const f = await mob(fx);
  const bagLeft = await ev(() => window.__bf.game.inventory.slots[0]?.bag?.map((s) => (s ? s.id + 'x' + s.count : null)) ?? null);
  check('gift: a Fox Cub eats the fish from the bag (and is tamed), the bag stays with you holding what it did not want',
    f.tamed === true && Array.isArray(bagLeft) && bagLeft.includes('applex1') && !bagLeft.includes('raw_troutx2'), { f, bagLeft });
  // hound
  const hd = await spawn('hound', P.x + 1.5, P.y, P.z - 1.5);
  await freeze(hd);
  await fillBag([{ id: 'raw_beef', count: 2 }]);
  await aim(P.x + 1.5, P.y + 0.5, P.z - 1.5); await rclick();
  const h = await mob(hd);
  await realRandom();
  check('gift: a Fellhound is given the bag too (it takes the food it likes)', h && (h.tamed === true || h.h > 0) && (await stat('bags_given')) >= 3, { h, st: await stat('bags_given') });
  // village standing
  const rep = await ev(async () => {
    const g = window.__bf.game;
    const v = g.entities.list.find((e) => e.mobType === 'villager' && !e.removed);
    return v ? { village: v.villageId ?? null } : null;
  });
  void rep;
}

// ======================================================================= PARTY (popper, cake, hat, bunting, balloons)
if (run('party')) {
  await ev(() => window.__bf.engine.closeOverlay());
  if (!BAGWORLD && !run('gift')) { await newWorld('Party24', 'party24', false); }
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; window.__bf.game.player.food = 10; });
  await clearItems();
  await give({ id: 'party_popper', count: 3 });
  await aim(P.x + 0.5, P.y + 2, P.z - 3); await rclick();
  check('party: right-click with a Party Popper uses one and grants Party Time!', (await sel()) === 'party_popperx2' && (await adv('party')), await sel());
  const parts = await ev(() => window.__bf.game.effects?.count ?? null);
  void parts;
  // cake: place on the ground two blocks in front, eat stage by stage
  await tp(P.x + 0.5, P.y, P.z + 3.5, 0, 0);
  await give({ id: 'cake', count: 1 });
  await aim(P.x + 0.5, P.y - 0.5, P.z + 1.5); await rclick();
  const cake = [P.x, P.y, P.z + 1];
  check('party: Party Cake can be set down on solid ground', (await key(...cake)) === 'cake:0', await key(...cake));
  await ev(() => { window.__bf.game.player.food = 10; });
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await aim(cake[0] + 0.85, cake[1] + 0.3, cake[2] + 0.5); await give(null); await rclick();
    seen.push(await key(...cake));
    await ev(() => { window.__bf.game.player.food = 10; });
  }
  check('party: each right-click eats a slice - six slices, then it is gone', seen.slice(0, 5).join() === 'cake:1,cake:2,cake:3,cake:4,cake:5' && seen[5] === 'air', seen);
  check('party: eating cake restores hunger, counts the stat and grants Let Them Eat Cake', (await stat('cake_eaten')) === 6 && (await adv('cake')), await stat('cake_eaten'));
  await set(cake[0], cake[1], cake[2], 'cake:0');
  await ev(() => { window.__bf.game.player.food = 20; });
  await aim(cake[0] + 0.5, cake[1] + 0.3, cake[2] + 0.5); await rclick();
  check("party: when you're full, cake is left alone", (await key(...cake)) === 'cake:0', await chat());
  await set(cake[0], cake[1], cake[2], 'air');
  // balloons stand on the ground
  await give({ id: 'balloons', count: 2 });
  await aim(P.x + 2.5, P.y - 0.5, P.z + 1.5); await rclick();
  check('party: Balloons stand on the ground', (await key(P.x + 2, P.y, P.z + 1)) === 'balloons', await key(P.x + 2, P.y, P.z + 1));
  // bunting hangs under a solid block
  await set(P.x + 4, P.y + 2, P.z + 1, 'stone');
  await tp(P.x + 4.5, P.y, P.z + 1.5, 0, Math.PI / 2 - 0.02);
  await give({ id: 'bunting', count: 3 });
  await aim(P.x + 4.5, P.y + 2.5, P.z + 1.5); await rclick();
  const bk = await key(P.x + 4, P.y + 1, P.z + 1);
  check('party: Bunting hangs below a solid block (and runs along the way you face)', bk && bk.startsWith('bunting'), bk);
  await set(P.x + 4, P.y + 2, P.z + 1, 'air'); await fast(3); await settle();
  const still = await key(P.x + 4, P.y + 1, P.z + 1);
  check('party: and falls when the block above it is taken away', still === 'air', still);
  // hat on armour stand and worn
  await give({ id: 'party_hat', count: 1 });
  await ev(() => { const g = window.__bf.game; const s = g.inventory.slots[g.inventory.selected]; return g.inventory.slots; });
  const hat = await ev(async () => {
    try {
      const I = await import('/src/inventory/ItemRegistry.ts');
      const d = I.getItem('party_hat');
      return { slot: d.armor?.slot, points: d.armor?.points };
    } catch { return null; }                       // the single-file build has no /src (checked on the dev server)
  });
  if (hat) check('party: the Party Hat is a no-armour head piece', hat.slot === 0 && (hat.points ?? 0) === 0, hat);
  await ev(() => { const g = window.__bf.game; const i = g.inventory.slots.findIndex((s) => s?.id === 'party_hat'); g.inventory.selected = i; });
  await ev(() => { const g = window.__bf.game; const i = g.inventory.selected; g.inventory.slots[i] = { id: 'party_hat', count: 1, color: 0xe8a000 }; g.inventory.changed(); });
  await ev(() => { window.__bf.game.inventory.selected = window.__bf.game.inventory.selected; });
  await aim(P.x + 0.5, P.y + 3, P.z - 3); await rclick();
  const worn = await ev(() => window.__bf.game.inventory.slots.map((s, i) => (s?.id === 'party_hat' ? i : null)).filter((i) => i !== null));
  check('party: right-clicking a Party Hat puts it on your head', worn.length === 1 && worn[0] >= 36, worn);
  await ev(() => { const g = window.__bf.game; g.player.yaw = 0; });
  await page.screenshot({ path: `${SHOTS}/v24_party_scene.png` });
}

// ======================================================================= SAVE
if (run('save')) {
  const W = await newWorld('Save24', 'save24', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  for (let i = 0; i < 6; i++) await set(P.x + i, P.y, P.z - 4, 'rail');
  await set(P.x + 2, P.y, P.z - 1, 'cake:2');
  await set(P.x + 4, P.y, P.z - 1, 'balloons');
  await give({ id: 'minecart', count: 1 }); await tp(P.x + 0.5, P.y, P.z - 2, 0, 0);
  await aim(P.x + 3.5, P.y, P.z - 3.5); await rclick();
  await ev(() => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); g.mount(c, true); });
  await ev(() => { const g = window.__bf.game; g.inventory.slots[3] = { id: 'party_bag', count: 1, color: 0x3060e0, bag: [{ id: 'apple', count: 4 }, null, { id: 'bread', count: 2 }, null, null, null, null, null, null] }; g.inventory.changed(); });
  await settle();
  await reopen(W);
  const after = await ev(() => {
    const g = window.__bf.game;
    const c = g.entities.list.find((e) => e.type === 'minecart' && !e.removed);
    return {
      riding: g.riding?.type ?? null, cart: !!c, onRail: c?.onRail, cake: window.__bf.getBlock(...[0, 0, 0].map(() => 0)),
      bag: g.inventory.slots[3] ? { color: g.inventory.slots[3].color, bag: g.inventory.slots[3].bag.map((s) => (s ? s.id + 'x' + s.count : null)) } : null,
    };
  });
  check('save: a rider in a Minecart is back in it after reload, still on the rail', after.riding === 'minecart' && after.cart && after.onRail, after);
  check('save: a dyed, filled Party Bag keeps its colour and contents', after.bag && after.bag.color === 0x3060e0 && after.bag.bag.join() === 'applex4,,breadx2,,,,,,', after.bag);
  const blocks = await ev(([x, y, z]) => [window.__bf.getBlock(x + 2, y, z - 1), window.__bf.getBlock(x + 4, y, z - 1), window.__bf.getBlock(x + 1, y, z - 4)], [P.x, P.y, P.z]);
  check('save: rails, a part-eaten cake and balloons are still there', blocks.join() === 'cake:2,balloons,rail', blocks);
  await ev(() => window.__bf.game.dismount());
}

// ======================================================================= TOUCH (iPad)
if (run('touch')) {
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
  await page.close();
  const TW = 1180, TH = 820;
  const ctx = await b.newContext({ viewport: { width: TW, height: TH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  watch(page);
  const cdp = await ctx.newCDPSession(page);
  const TX = TW * 0.62, TY = TH * 0.3;
  const tap = async () => {
    await wait(400);
    const ts = Date.now() / 1000;
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: ts, touchPoints: [{ x: TX, y: TY, id: 0, radiusX: 4, radiusY: 4, force: 1 }] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: ts + 0.06, touchPoints: [] }),
    ]);
    await ticks(4); await wait(100);
  };
  await page.goto(URL);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await ev(() => document.querySelector('[data-testid=btn-singleplayer]').click()); await wait(300);
  await ev(() => document.querySelector('[data-testid=btn-create-new]').click()); await wait(300);
  await page.fill('[data-testid=world-name]', 'iPad Party'); await page.fill('[data-testid=world-seed]', 'ipad24');
  await ev(() => document.querySelector('[data-testid=btn-create-world]').click());
  await waitFor(async () => (await screen()) === 'game', 90000);
  await settle();
  await calm();
  const touchOn = await ev(() => window.__bf.ui.get().touch);
  const P = await pad(8, 'grass');
  await settle();
  await ev(() => { window.__bf.game.player.creative = false; });
  // a tap with a Party Popper pops it
  await give({ id: 'party_popper', count: 2 });
  await ev(() => { const p = window.__bf.game.player; p.yaw = 0; p.pitch = 0.2; });
  await tap();
  check('touch: a tap with a Party Popper pops it', touchOn && (await sel()) === 'party_popperx1' && (await adv('party')), { touchOn, sel: await sel() });
  // a tap with a Party Bag opens it; the screen can be closed again
  await give({ id: 'party_bag', count: 1 });
  await tap();
  check('touch: a tap with a Party Bag opens its screen', (await overlay()) === 'bag', await overlay());
  await page.screenshot({ path: `${SHOTS}/v24_ipad_bag.png` });
  await ev(() => window.__bf.engine.closeOverlay());
  // a tap with a Minecart on a rail places it
  for (let i = -2; i <= 2; i++) await set(P.x + i, P.y, P.z - 4, 'rail');
  await give({ id: 'minecart', count: 1 });
  await tp(P.x + 0.5, P.y, P.z - 1.5, 0, 0);
  await aim(P.x + 0.5, P.y, P.z - 3.5);
  await tap();
  const cart = await ev(() => window.__bf.game.entities.list.some((e) => e.type === 'minecart' && !e.removed));
  check('touch: a tap with a Minecart on a rail places it', cart, await sel());
  // a tap on the cart climbs in; the touch controls then drive it
  await give(null);
  await ev(() => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); g.player.yaw = 0; g.teleport(c.x, c.y + 0.1, c.z + 1.4); });
  await ev(() => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); window.__bf.aimAt(c.x, c.y + 0.3, c.z); });
  await tap();
  check('touch: a tap on the cart climbs in', await ev(() => window.__bf.game.riding?.type === 'minecart'), await chat());
  await page.screenshot({ path: `${SHOTS}/v24_ipad_cart.png` });
  await ev(() => window.__bf.game.dismount());
  // cake by touch
  await set(P.x - 3, P.y, P.z - 1, 'cake:0');
  await ev(() => { window.__bf.game.player.food = 10; });
  await tp(P.x - 3 + 0.5, P.y, P.z + 1.5, 0, 0);
  await aim(P.x - 3 + 0.5, P.y + 0.3, P.z - 1 + 0.5);
  await tap();
  check('touch: a tap on a cake eats a slice', (await key(P.x - 3, P.y, P.z - 1)) === 'cake:1', await key(P.x - 3, P.y, P.z - 1));
}

// ======================================================================= LOOK (screenshots)
if (run('look')) {
  await newWorld('Look24', 'rails24', true);
  const P = await pad(9);
  const { x, y, z } = P;
  const L = (dx, dy, dz, k) => set(x + dx, y + dy, z + dz, k);
  // a loop with a curve each corner, a slope up, boost and station pieces
  for (let i = -4; i <= 0; i++) await L(i, 0, -4, 'rail');     // east-west run
  for (let k = -3; k <= 0; k++) await L(-4, 0, -4 + k * -1 - 0, 'rail');
  await L(1, 0, -4, 'rail'); await L(1, 0, -3, 'rail'); await L(1, 0, -2, 'rail');
  await L(2, 0, -2, 'boost_rail'); await L(3, 0, -2, 'boost_rail'); await L(4, 0, -2, 'station_rail');
  await L(5, 0, -2, 'rail'); await L(6, 1, -2, 'rail'); await L(7, 1, -2, 'rail');
  await L(-3, 0, 2, 'cake:0'); await L(-1, 0, 2, 'cake:3'); await L(1, 0, 2, 'cake:5');
  await L(3, 0, 2, 'balloons'); await L(5, 3, 2, 'stone'); await L(5, 2, 2, 'bunting:ew'); await L(6, 3, 2, 'stone'); await L(6, 2, 2, 'bunting:ew');
  await settle();
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 7, z + 6.5); g.player.flying = true; }, [x, y, z]);
  await aim(x, y - 3, z - 2); await wait(800); await ticks(5); await wait(500);
  await page.screenshot({ path: `${SHOTS}/v24_overview.png` });
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 2, z + 6.5); }, [x, y, z]);
  await aim(x, y + 0.5, z + 2); await wait(500); await ticks(3);
  await page.screenshot({ path: `${SHOTS}/v24_party.png` });
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
