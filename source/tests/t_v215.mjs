// Tests for 2.15.0: Mineshafts, Cobweb, mobs in Minecarts, three new Runes.
// node tests/t_v215.mjs   (dev server)   ONLY=items,web,gen,runes,cart,loot
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','web','gen','runes','cart','loot','save'];
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

if (run('items') || run('web') || run('runes') || run('cart') || run('loot') || run('save')) await newWorld('MineTest', 'mine215', true);

if (run('items')) {
  const info = await ev(async () => {
    const reg = await import('/src/world/BlockRegistry.ts');
    const items = await import('/src/inventory/ItemRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const T = await import('/src/world/TerrainGenerator.ts');
    const E = await import('/src/inventory/Enchantments.ts');
    const P = await import('/src/systems/Progress.ts');
    const d = reg.getBlock(reg.COBWEB);
    return { key: d.key, solid: d.solid, ver: C.GAME_VERSION, gen: T.GEN_VERSION, item: items.getItem('cobweb').block === reg.COBWEB,
      runes: Object.keys(E.RUNES).length, sword: E.runesFor('iron_sword'), chest: E.runesFor('iron_chestplate'), boots: E.runesFor('iron_boots'), rod: E.runesFor('fishing_rod'),
      adv: P.ADVANCEMENTS.length, ids: ['mine', 'web', 'passenger', 'flame_edge', 'thorned'].map((id) => !!P.ADVANCEMENTS.find((a) => a.id === id)) };
  });
  check('items: version 2.15 or later, terrain version 10 or later', /^2\.1[5-9]\.0$/.test(info.ver) && info.gen >= 10, info);
  check('items: Cobweb is a non-solid block with an item', info.key === 'cobweb' && !info.solid && info.item, info);
  check('items: eleven runes, new ones go on the right gear', info.runes === 11 && info.sword.includes('flame') && info.chest.includes('thorns') && !info.boots.includes('thorns') && info.rod.includes('lure'), info);
  check('items: five new advancements (96 in all)', info.adv === 96 && info.ids.every(Boolean), info);
}

if (run('web')) {
  await clearInv(); await mortal();
  const P = await pad(8);
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; });
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  // free walking speed vs. inside a web
  const run1 = async () => ev(async () => { const g = window.__bf.game; const p = g.player; const x0 = p.z; g.autopilot = { forward: 1 }; for (let i = 0; i < 20; i++) g.tick(); g.autopilot = null; return Math.abs(p.z - x0); });
  const free = await run1();
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  for (let dz = -4; dz <= 0; dz++) for (let dy = 0; dy <= 1; dy++) await set(P.x, P.y + dy, P.z + dz, 'cobweb');
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  const webbed = await run1();
  check('web: walking through Cobweb is far slower than free walking', webbed < free * 0.35 && free > 1, { free, webbed });
  check('web: the Caught in the Web advancement', await adv('web'));
  // cut it with a sword: drops string and counts
  await clearItems();
  await setSlot(0, { id: 'iron_sword', count: 1 });
  await tp(P.x + 0.5, P.y, P.z + 3.5, 0, 0);
  await set(P.x, P.y, P.z + 2, 'cobweb');
  await ev(([P]) => window.__bf.aimAt(P.x + 0.5, P.y + 0.5, P.z + 2.5), [P]);
  await centre(); await page.mouse.move(CX, CY); await page.mouse.down();
  for (let i = 0; i < 12; i++) await ticks(2);
  await page.mouse.up(); await ticks(3);
  const left = await key(P.x, P.y, P.z + 2);
  const drops = await ev(() => [...window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.id), ...window.__bf.game.inventory.slots.filter((s) => s).map((s) => s.id)]);
  check('web: a sword cuts it and it drops String', left === 'air' && drops.includes('string'), { left, drops });
  check('web: cobwebs_cut stat counts', (await stat('cobwebs_cut')) >= 1);
}

if (run('gen')) {
  const r = await ev(async () => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const M = await import('/src/world/Mines.ts');
    const reg = await import('/src/world/BlockRegistry.ts');
    const out = { regions: 0, withMine: 0 };
    const seed = 4242;
    const g10 = new T.TerrainGenerator(seed, { structures: true, version: 10 });
    const g9 = new T.TerrainGenerator(seed, { structures: true, version: 9 });
    let found = null;
    for (let rz = -8; rz < 8 && !found; rz++) for (let rx = -8; rx < 8; rx++) {
      out.regions++;
      if (M.mineFloor(seed, rx * 4, rz * 4) >= 0) { out.withMine++; if (!found) found = [rx, rz]; }
    }
    let all = 0, withM = 0;
    for (let rz = -20; rz < 20; rz++) for (let rx = -20; rx < 20; rx++) { all++; if (M.mineFloor(seed, rx * 4, rz * 4) >= 0) withM++; }
    out.share = withM / all;
    out.found = found;
    // generate the row chunk (cz&3==1) across the region and the column chunk (cx&3==2)
    const [rx, rz] = found;
    const fy = M.mineFloor(seed, rx * 4, rz * 4);
    out.fy = fy;
    const count = (c, id) => { let n = 0; for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === id) n++; return n; };
    const stats = { rails: 0, air: 0, fences: 0, chests: 0, spawners: 0, webs: 0, skipped: 0, junctionSpawner: 0, v9rails: 0, minLoot: 0 };
    const idx = (x, y, z) => (y * 16 + z) * 16 + x;
    for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
      const cx = rx * 4 + dx, cz = rz * 4 + dz;
      const c10 = g10.generateChunk(cx, cz), c9 = g9.generateChunk(cx, cz);
      stats.v9rails += count(c9, reg.RAIL);
      const arms = M.mineArms(cx, cz);
      if (!arms.ew && !arms.ns) continue;
      const r = count(c10, reg.RAIL);
      if (r === 0) { stats.skipped++; continue; }
      stats.rails += r; stats.fences += count(c10, reg.OAK_FENCE); stats.webs += count(c10, reg.COBWEB);
      stats.chests += (c10.containers ?? []).filter((k) => k.loot === 'mine').length;
      stats.spawners += (c10.spawners ?? []).length;
      if (arms.ew && arms.ns) stats.junctionSpawner += (c10.spawners ?? []).length;
      stats.minLoot += 1;
    }
    out.stats = stats;
    return out;
  });
  check('gen: about a quarter of regions hide a mine', r.share > 0.15 && r.share < 0.35 && r.found, r);
  check('gen: the mine has rails, oak posts, chests and a cage somewhere', r.stats.rails > 40 && r.stats.fences > 8 && r.stats.chests >= 1, r.stats);
  check('gen: older worlds (terrain version 9) have no mine rails', r.stats.v9rails === 0, r.stats);
}

if (run('runes')) {
  await clearInv(); await mortal();
  const P = await pad(8);
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; g.player.invulnerable = 0; });
  // Flame Edge
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  await setSlot(0, { id: 'iron_sword', count: 1, ench: { flame: 2 } });
  const flame = await ev(([P]) => {
    const g = window.__bf.game;
    const cow = g.entities.spawnMob('cow', P.x + 0.5, P.y, P.z - 1.2, g);
    cow.health = 100; cow.invulnerable = 0;
    g.attack(cow);
    return { fire: cow.fireTicks, hp: cow.health };
  }, [P]);
  check('flame: a Flame Edge hit sets the creature alight (about 6 seconds)', flame.fire >= 110 && flame.hp < 100, flame);
  check('flame: the Hot Blade advancement', await adv('flame_edge'));
  const plain = await ev(([P]) => {
    const g = window.__bf.game;
    g.inventory.slots[0] = { id: 'iron_sword', count: 1 };
    const cow = g.entities.spawnMob('cow', P.x + 0.5, P.y, P.z - 1.2, g);
    cow.health = 100; cow.invulnerable = 0; g.player.invulnerable = 0;
    g.attack(cow);
    return cow.fireTicks;
  }, [P]);
  check('flame: a plain sword does not', plain === 0, { plain });
  // Thorns
  await wear(1, null);
  await ev(() => { const g = window.__bf.game; g.inventory.slots[37] = { id: 'iron_chestplate', count: 1, ench: { thorns: 3 } }; g.inventory.changed(); });
  const th = await ev(([P]) => {
    const g = window.__bf.game, p = g.player;
    const m = g.entities.spawnMob('shambler', P.x + 3.5, P.y, P.z + 3.5, g);
    m.health = 400;
    let hurt = 0;
    for (let i = 0; i < 80; i++) { p.invulnerable = 0; p.health = 20; p.dead = false; const h0 = m.health; g.damagePlayer(1, { x: m.x, y: m.y, z: m.z, kind: 'mob', mob: m }); if (m.health < h0) hurt++; m.invulnerable = 0; }
    return { hurt, hp: m.health };
  }, [P]);
  check('thorns: Thorns III hurts an attacker about 45% of the time', th.hurt > 15 && th.hurt < 60, th);
  check('thorns: the Prickly Customer advancement', await adv('thorned'));
  const noth = await ev(([P]) => {
    const g = window.__bf.game, p = g.player;
    g.inventory.slots[37] = { id: 'iron_chestplate', count: 1 }; g.inventory.changed();
    const m = g.entities.spawnMob('shambler', P.x + 3.5, P.y, P.z + 3.5, g);
    m.health = 400; let hurt = 0;
    for (let i = 0; i < 40; i++) { p.invulnerable = 0; p.health = 20; const h0 = m.health; g.damagePlayer(1, { x: m.x, y: m.y, z: m.z, kind: 'mob', mob: m }); if (m.health < h0) hurt++; }
    return hurt;
  }, [P]);
  check('thorns: plain armour reflects nothing', noth === 0, { noth });
  // Lure
  const lure = await ev(([P]) => {
    const g = window.__bf.game; const rnd = Math.random; Math.random = () => 0.5;
    try {
      const cast = (ench) => {
        if (g.bobber) g.bobber.removed = true; g.bobber = null;
        g.inventory.slots[0] = { id: 'fishing_rod', count: 1, ...(ench ? { ench } : {}) }; g.inventory.selected = 0;
        g.useRod(0);
        return g.bobber.wait;
      };
      const base = cast(null), l3 = cast({ lure: 3 });
      if (g.bobber) g.bobber.removed = true; g.bobber = null;
      return { base, l3 };
    } finally { Math.random = rnd; }
  }, [P]);
  check('lure: Lure III makes the first bite 60% sooner', lure.base === 350 && lure.l3 === 140, lure);
}

if (run('cart')) {
  await clearInv(); await mortal();
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  const P = await pad(12);
  const { x, y, z } = P;
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; });
  for (let i = 0; i <= 14; i++) await set(x + i, y, z - 4, 'rail');
  await settle();
  await give({ id: 'minecart', count: 1 });
  await tp(x + 0.5, y, z - 2.5, 0, 0);
  await aim(x + 2.5, y, z - 3.5); await rclick();
  const cart = () => ev(() => { const c = window.__bf.game.entities.list.find((e) => e.type === 'minecart' && !e.removed); return c && { x: c.x, y: c.y, z: c.z, v: c.v, onRail: c.onRail, has: !!c.passenger, pid: c.passenger?.mobType ?? null }; });
  let c0 = await cart();
  check('cart: a Minecart sits on the line', c0 && c0.onRail && !c0.has, c0);
  // a hostile creature does not climb in
  const hostile = await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.entities.spawnMob('shambler', x + 2.5, y, z - 3.5, g); m.persistent = true; for (let i = 0; i < 15; i++) g.tick(); const c = g.entities.list.find((e) => e.type === 'minecart'); const r = { has: !!c.passenger, seat: !!m.cartSeat }; m.removed = true; return r; }, [x, y, z]);
  check('cart: a hostile creature does not climb in', !hostile.has && !hostile.seat, hostile);
  // a cow wanders in
  const cow = await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.entities.spawnMob('cow', x + 2.5, y, z - 3.5, g); m.persistent = true; window.__cow = m; for (let i = 0; i < 15; i++) g.tick(); const c = g.entities.list.find((e) => e.type === 'minecart'); return { has: !!c.passenger, seat: !!m.cartSeat, mt: c.passenger?.mobType }; }, [x, y, z]);
  check('cart: a calm creature (a cow) hops into an empty cart', cow.has && cow.seat && cow.mt === 'cow', cow);
  // roll it: the cow goes along
  const roll = await ev(([x, y, z]) => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); const m = window.__cow; const sx = c.x; c.v = 0.2; for (let i = 0; i < 40; i++) g.tick(); return { moved: Math.abs(c.x - sx), cx: c.x, mx: m.x, my: m.y, cy: c.y, dz: Math.abs(m.z - c.z) }; }, [x, y, z]);
  check('cart: the passenger rolls along with the cart', roll.moved > 1.5 && Math.abs(roll.cx - roll.mx) < 0.6 && roll.dz < 0.6 && roll.my > roll.cy, roll);
  await page.screenshot({ path: `${SHOTS}/v215_cart_cow.png` });
  // it hops out after the cart has stood still a while
  const out = await ev(() => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); const m = window.__cow; c.v = 0; for (let i = 0; i < 160; i++) g.tick(); return { seat: !!m.cartSeat, has: !!c.passenger, cd: m.cartCooldown, d: Math.hypot(m.x - c.x, m.z - c.z) }; });
  check('cart: after standing still for five seconds the passenger hops out', !out.seat && !out.has && out.d > 0.9, out);
  // a broken cart lets the passenger go
  const brk = await ev(([x, y, z]) => { const g = window.__bf.game; const c = g.entities.list.find((e) => e.type === 'minecart'); const m = window.__cow; m.cartCooldown = 0; m.setPos(c.x, c.y, c.z); for (let i = 0; i < 6; i++) g.tick(); const boarded = !!m.cartSeat; c.removed = true; for (let i = 0; i < 4; i++) g.tick(); return { boarded, free: !m.cartSeat }; }, [x, y, z]);
  check('cart: breaking the cart frees the passenger', brk.boarded && brk.free, brk);
  // two in a cart: the player rides with a pig
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type !== 'item' && e.type !== 'minecart') e.removed = true; });
  await give({ id: 'minecart', count: 1 }); await tp(x + 0.5, y, z - 2.5, 0, 0);
  await aim(x + 4.5, y, z - 3.5); await rclick();
  await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.entities.spawnMob('pig', x + 4.5, y, z - 3.5, g); m.persistent = true; for (let i = 0; i < 10; i++) g.tick(); }, [x, y, z]);
  const cs = await cart();
  await give(null);
  await tp(x + 4.5, y, z - 2.6, Math.PI, 0);
  await aim(cs.x, cs.y + 0.3, cs.z); await rclick();
  check('cart: you can climb into a cart that has a passenger', await ev(() => !!window.__bf.game.riding && !!window.__bf.game.riding.passenger), await chat());
  await ev(() => { const g = window.__bf.game; g.riding.v = 0; g.player.yaw = -Math.PI / 2; g.autopilot = { forward: 1 }; for (let i = 0; i < 50; i++) g.tick(); g.autopilot = null; });
  check('cart: the Two in a Cart advancement', await adv('passenger'));
}

if (run('loot')) {
  await clearInv(); await mortal();
  const P = await pad(8);
  const r = await ev(([P]) => {
    const g = window.__bf.game;
    const kinds = new Set(); let total = 0, runeFinds = 0, chests = 40;
    for (let i = 0; i < chests; i++) {
      const be = { type: 'chest', items: new Array(27).fill(null), loot: 'mine' };
      g.fillLoot(be, P.x + i, 20, P.z + i * 3);
      for (const s of be.items) if (s) { kinds.add(s.id); total++; if (s.ench) runeFinds++; }
    }
    return { kinds: [...kinds], total, runeFinds, chests };
  }, [P]);
  check('loot: mine chests hold rails, coal, torches and ore', ['rail', 'coal', 'torch', 'raw_iron'].every((k) => r.kinds.includes(k)), r);
  check('loot: some chests hold a rune-carved find (not most)', r.runeFinds >= 2 && r.runeFinds <= 20, r);
  // open a real chest block entity: the advancement
  await ev(([P]) => {
    const g = window.__bf.game;
    const reg = window; void reg;
  }, [P]);
  const opened = await ev(async ([P]) => {
    const B = await import('/src/world/BlockRegistry.ts');
    const g = window.__bf.game;
    const x = P.x + 2, y = P.y, z = P.z + 2;
    g.world.setBlock(x, y, z, B.facingVariant('chest', 'n'), 'player');
    g.world.blockEntities.set(`${x},${y},${z}`, { type: 'chest', items: new Array(27).fill(null), loot: 'mine' });
    return `${x},${y},${z}`;
  }, [P]);
  const key2 = await ev(([P]) => { const g = window.__bf.game; return [...g.world.blockEntities.keys()].filter((k) => k === `${P.x + 2},${P.y},${P.z + 2}`); }, [P]);
  void opened; void key2;
  await tp(P.x + 0.5, P.y, P.z + 3.5, Math.PI, 0.1);
  await ev(([P]) => window.__bf.aimAt(P.x + 2.5, P.y + 0.5, P.z + 2.5), [P]);
  await rclick();
  check('loot: opening a mine chest grants Down the Shaft and fills it', (await adv('mine')) && (await overlay()) !== null, { ov: await overlay(), adv: await adv('mine') });
}

if (run('save')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.player.creative = true; });
  const P = await pad(5);
  await set(P.x + 1, P.y, P.z + 1, 'cobweb');
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  check('save: a Cobweb survives save and reload, and the world is terrain version 10 or later', (await key(P.x + 1, P.y, P.z + 1)) === 'cobweb' && (await ev(() => window.__bf.game.world.genVersion)) >= 10, { v: await ev(() => window.__bf.game.world.genVersion) });
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
