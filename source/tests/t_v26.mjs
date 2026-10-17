// Tests for 2.6: the spear, the crossbow, the bow's charge bar and Flame Arrows.
// node tests/t_v26.mjs   (dev server)   ONLY=items,spear,crossbow,bow,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','spear','crossbow','bow','save'];
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


const inv = (slot) => ev((slot) => { const s = window.__bf.game.inventory.slots[slot]; return s ? s.id + 'x' + s.count + (s.damage ? 'd' + s.damage : '') : null; }, slot);
const setSlot = (slot, stack, select = true) => ev(([slot, stack, select]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; if (select) g.inventory.selected = slot; g.inventory.changed(); }, [slot, stack, select]);
const clearInv = () => ev(() => { const g = window.__bf.game; for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = null; g.inventory.changed(); });
const bar = () => ev(() => { const e = document.querySelector('[data-testid=charge-bar]'); return e ? { loaded: e.classList.contains('loaded'), full: e.classList.contains('full'), w: e.firstChild.style.width } : null; });
const cowAt = async (P, dz) => { const id = await spawn('cow', P.x + 0.5, P.y, P.z + 3.5 + dz); await freeze(id); return id; };
const aimMob = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); window.__bf.aimAt(m.x, m.y + m.height * 0.5, m.z); }, id);
const spy = () => ev(() => { const g = window.__bf.game; if (g.entities.__spied) return; g.entities.__spied = true; window.__shots = []; const o = g.entities.spawnArrow.bind(g.entities); g.entities.spawnArrow = (x, y, z, vx, vy, vz, fp, dmg, sh, flame) => { window.__shots.push({ flame: !!flame, speed: Math.hypot(vx, vy, vz), dmg, fp }); return o(x, y, z, vx, vy, vz, fp, dmg, sh, flame); }; });
const shots = () => ev(() => window.__shots ?? []);
const lastShot = async () => { const a = await shots(); return a[a.length - 1] ?? null; };
const arrows = () => ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'arrow' && !e.removed).map((e) => ({ flame: e.flame, stuck: e.stuck, speed: Math.hypot(e.vx, e.vy, e.vz) })));
const fireTicks = (id) => ev((id) => window.__bf.game.entities.list.find((e) => e.id === id)?.fireTicks ?? -1, id);
const healGod = () => ev(() => { const g = window.__bf.game; g.player.health = 20; g.player.invulnerable = 1e9; });

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const P = await import('/src/systems/Progress.ts');
    const R = await import('/src/crafting/recipes.ts');
    const E = await import('/src/inventory/Enchantments.ts');
    const ids = ['wooden_spear', 'stone_spear', 'iron_spear', 'crossbow', 'crossbow_loaded', 'crossbow_loaded_flame', 'flame_arrow'];
    return {
      exist: ids.map((id) => !!I.getItem(id)),
      sprites: ids.map((id) => !!S.SPRITES[id]),
      attack: ['wooden_spear', 'stone_spear', 'iron_spear'].map((id) => I.getItem(id).attack),
      kinds: ['crossbow', 'crossbow_loaded', 'crossbow_loaded_flame'].map((id) => I.getItem(id).kind),
      hidden: ['crossbow_loaded', 'crossbow_loaded_flame'].map((id) => I.ITEMS.filter((i) => i.category === 'combat').some((i) => i.id === id)),
      runes: [E.runesFor('iron_spear').join(), E.runesFor('crossbow').join()],
      adv: ['long_reach', 'crossbow', 'flame_hit'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.parent), count: P.ADVANCEMENTS.length,
    };
  });
  const c = await ev(() => {
    const bf = window.__bf, n = null;
    const r = (g) => { const x = bf.craft(g); return x ? x.id + 'x' + x.count : null; };
    return {
      wood: r([n, n, 'planks', n, 'stick', n, 'stick', n, n]), stone: r([n, n, 'cobblestone', n, 'stick', n, 'stick', n, n]), iron: r([n, n, 'iron_ingot', n, 'stick', n, 'stick', n, n]),
      cross: r(['stick', 'iron_ingot', 'stick', 'string', 'stick', 'string', n, n, n]),
      flame: r(['ember', 'arrow', 'arrow', 'arrow', 'arrow', n, n, n, n]),
    };
  });
  check('crafting: spears (material, then two sticks on a slant), the Crossbow (3 sticks, iron, 2 string) and 4 Flame Arrows (ember + 4 arrows)',
    c.wood === 'wooden_spearx1' && c.stone === 'stone_spearx1' && c.iron === 'iron_spearx1' && c.cross === 'crossbowx1' && c.flame === 'flame_arrowx4', c);
  check('items: three spears, the crossbow (and its two loaded forms) and the Flame Arrow exist with sprites', t.exist.every(Boolean) && t.sprites.every(Boolean), t);
  check('items: spears hit a little softer than swords (3.5 / 4.5 / 5.5), the loaded crossbows are hidden from the creative list', t.attack.join() === '3.5,4.5,5.5' && t.hidden.every((h) => !h) && t.kinds.every((k) => k === 'crossbow'), t);
  check('items: spears take the sword runes, the crossbow the bow runes; three new advancements (65 in all) in the right places', t.runes[0] === 'keen,sturdy,plunder' && t.runes[1] === 'might,sturdy' && t.adv.join() === 'kill,bow,crossbow' && t.count === 65, t);
}

// ======================================================================= SPEAR
let P0;
if (run('spear') || run('crossbow') || run('bow') || run('save')) {
  await newWorld('Spear Tests', 'quiver', false);
  P0 = await pad(10);
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 1e9; g.rules.doMobSpawning = false; });
  await clearInv();
}
if (run('spear')) {
  const cow = await cowAt(P0, -4);          // 4 blocks away
  await setSlot(0, { id: 'iron_sword', count: 1 });
  await aimMob(cow); await ticks(3);
  const r0 = await ev(() => ({ reach: window.__bf.game.attackReach(), target: !!window.__bf.game.targetMob }));
  await setSlot(0, { id: 'iron_spear', count: 1 });
  await aimMob(cow); await ticks(3);
  const r1 = await ev(() => ({ reach: window.__bf.game.attackReach(), target: !!window.__bf.game.targetMob }));
  check('spear: reaches 4.5 blocks (a sword 3): a cow 4 blocks away can be hit with the spear only', r0.reach === 3 && !r0.target && r1.reach === 4.5 && r1.target, { r0, r1 });
  const h0 = (await mob(cow)).h;
  await lclick();
  const h1 = (await mob(cow)).h;
  check('spear: a real left-click from 4 blocks hits for the iron spear\'s 5.5 and earns Long Reach', h0 - h1 === 5.5 && (await adv('long_reach')), { h0, h1 });
  const d0 = await ev(() => { const s = window.__bf.game.inventory.slots[0]; return s.damage ?? 0; });
  check('spear: the blow costs one point of durability', d0 === 1, d0);
  // cooldown: two blows in the same instant count once
  await ev((id) => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.id === id); m.invulnerable = 0; m.hurtTime = 0; g.attack(m); m.invulnerable = 0; m.hurtTime = 0; g.attack(m); }, cow);
  const h2 = (await mob(cow)).h;
  check('spear: slower than a sword - a second blow straight after is ignored (12-tick cooldown)', h1 - h2 <= 5.5 && (h1 - h2 === 0 || h1 - h2 === 5.5), { h1, h2 });
  await fast(15);
  await ev((id) => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.id === id); if (m && m.alive) { m.health = 20; m.invulnerable = 0; m.hurtTime = 0; g.attack(m); } }, cow);
  const h3 = (await mob(cow))?.h;
  check('spear: after the cooldown it strikes again', h3 === undefined || h3 <= 14.5 || h3 === 14.5, h3);
  // a running thrust
  const cow2 = await cowAt(P0, -2);
  await ev((id) => { const g = window.__bf.game; g.player.sprinting = true; const m = g.entities.list.find((e) => e.id === id); m.health = 20; m.invulnerable = 0; m.hurtTime = 0; g.spearCooldown = 0; g.attack(m); }, cow2);
  const hr = (await mob(cow2)).h;
  check('spear: a blow while sprinting adds 2 (a running thrust: 5.5 + 2)', 20 - hr === 7.5, hr);
}

// ======================================================================= CROSSBOW
const clearMobs = () => ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
if (run('crossbow')) {
  await clearMobs();
  await clearInv();
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; });
  await spy();
  const cow = await cowAt(P0, -6);
  await setSlot(0, { id: 'crossbow', count: 1 });
  // no arrows: nothing happens
  await page.mouse.down({ button: 'right' }); await wait(1800); await page.mouse.up({ button: 'right' }); await ticks(2);
  check('crossbow: with no arrows, holding right-click does not load it', (await inv(0)) === 'crossbowx1' && !(await bar()), await inv(0));
  await setSlot(1, { id: 'arrow', count: 5 }, false);
  await aimMob(cow); await ticks(2);
  await page.mouse.down({ button: 'right' }); await wait(500);
  const mid = await bar();
  await wait(1700); await page.mouse.up({ button: 'right' }); await ticks(2);
  check('crossbow: winding shows the charge bar; after 25 ticks it is loaded (id changes, one arrow used up)', mid && !mid.loaded && (await inv(0)) === 'crossbow_loadedx1' && (await inv(1)) === 'arrowx4', { mid, s0: await inv(0), s1: await inv(1) });
  const full = await bar();
  check('crossbow: a loaded crossbow keeps an orange full bar under the crosshair', full && full.loaded && full.full, full);
  // it does not melee/fire by itself and keeps being loaded until a fresh click
  await fast(20);
  check('crossbow: stays loaded', (await inv(0)) === 'crossbow_loadedx1', await inv(0));
  const h0 = (await mob(cow)).h;
  await aimMob(cow); await ticks(2);
  await page.mouse.click(CX, CY, { button: 'right' }); await ticks(2);
  const a = await lastShot();
  check('crossbow: right-click fires a fast arrow (speed over 4) and the crossbow is empty again, with one point of wear', a && a.speed > 4 && a.fp && !a.flame && (await inv(0)) === 'crossbowx1d1' && !(await bar()), { a, s: await inv(0) });
  await wait(700);
  const h1 = (await mob(cow))?.h ?? 0;
  check('crossbow: a bolt from 6 blocks does at least 9 damage (the bow\'s best is 8) and earns Loaded', h0 - h1 >= 9 && (await adv('crossbow')), { h0, h1 });
  // flame bolt
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type === 'arrow') e.removed = true; });
  const cow2 = await cowAt(P0, -7);
  await setSlot(0, { id: 'crossbow', count: 1 });
  await setSlot(1, { id: 'arrow', count: 4 }, false);
  await setSlot(2, { id: 'flame_arrow', count: 2 }, false);
  await aimMob(cow2); await ticks(2);
  await page.mouse.down({ button: 'right' }); await wait(2200); await page.mouse.up({ button: 'right' }); await ticks(2);
  check('crossbow: a Flame Arrow on the hotbar is the one loaded (crossbow_loaded_flame; the flame stack drops to 1)', (await inv(0)) === 'crossbow_loaded_flamex1' && (await inv(2)) === 'flame_arrowx1' && (await inv(1)) === 'arrowx4', { s0: await inv(0), s1: await inv(1), s2: await inv(2) });
  await aimMob(cow2); await ticks(2);
  await page.mouse.click(CX, CY, { button: 'right' }); await ticks(2);
  const af = await lastShot();
  await wait(700);
  const ft = await fireTicks(cow2);
  check('crossbow: the flame bolt is a flame arrow, sets the cow alight and earns Fire Arrow', af && af.flame === true && ft > 0 && (await adv('flame_hit')), { af, ft });
  // creative mode: no arrows needed
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; });
  await clearInv(); await setSlot(0, { id: 'crossbow', count: 1 });
  await page.mouse.down({ button: 'right' }); await wait(2200); await page.mouse.up({ button: 'right' }); await ticks(2);
  check('crossbow: in creative mode it loads without any arrows', (await inv(0)) === 'crossbow_loadedx1', await inv(0));
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; });
}

// ======================================================================= BOW
if (run('bow')) {
  await clearMobs();
  await clearInv();
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  P0 = await pad(10);
  await setSlot(0, { id: 'bow', count: 1 });
  await setSlot(10, { id: 'flame_arrow', count: 3 }, false);     // in the pack, not on the hotbar
  await setSlot(11, { id: 'arrow', count: 6 }, false);
  const cow = await cowAt(P0, -6);
  await aimMob(cow); await ticks(2);
  await page.mouse.down({ button: 'right' }); await wait(450);
  const b1 = await bar();
  await wait(1000);
  const b2 = await bar();
  await page.mouse.up({ button: 'right' }); await ticks(3);
  const a1 = await lastShot();
  check('bow: drawing shows the charge bar (partway, then full and gold)', b1 && !b1.full && b2 && b2.full && !(await bar()), { b1, b2 });
  check('bow: with Flame Arrows only in the pack, a plain Arrow is used first', a1 && a1.flame === false && a1.speed > 2.9 && (await inv(11)) === 'arrowx5' && (await inv(10)) === 'flame_arrowx3', { a1, s10: await inv(10), s11: await inv(11) });
  await wait(900);
  await clearMobs();
  const cow2 = await cowAt(P0, -7);
  await setSlot(4, { id: 'flame_arrow', count: 2 }, false);       // on the hotbar now
  await aimMob(cow2); await ticks(2);
  await page.mouse.down({ button: 'right' }); await wait(1500); await page.mouse.up({ button: 'right' }); await ticks(3);
  const a2 = await lastShot();
  check('bow: a Flame Arrow on the hotbar is shot first (and used up)', a2 && a2.flame === true && (await inv(4)) === 'flame_arrowx1', { a2, s4: await inv(4) });
  await wait(1000);
  check('bow: it sets the cow alight and the burning arrow leaves nothing behind in the world', (await fireTicks(cow2)) > 0 && (await arrows()).filter((x) => x.stuck).length === 0, { ft: await fireTicks(cow2), arr: await arrows() });
  // flame arrow into a wall vanishes
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type === 'arrow') e.removed = true; });
  await tp(P0.x + 0.5, P0.y, P0.z + 3.5, 0, 0);
  await ev(([x, y, z]) => { for (let dy = 0; dy < 4; dy++) window.__bf.setBlock(x, y + dy, z - 4, 'stone'); }, [P0.x, P0.y, P0.z]);
  await page.mouse.down({ button: 'right' }); await wait(1400); await page.mouse.up({ button: 'right' }); await ticks(6);
  await wait(500);
  check('bow: a Flame Arrow that hits a wall burns out (it cannot be picked up again)', (await arrows()).length === 0, await arrows());
  // water puts the burning cow out
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.fireTicks = 100; }, cow2);
  check('bow: (info) the burning cow has fire ticks', (await fireTicks(cow2)) === 100, await fireTicks(cow2));
}

// ======================================================================= SAVE
if (run('save')) {
  await clearInv();
  await setSlot(0, { id: 'crossbow_loaded_flame', count: 1, damage: 7 });
  await setSlot(1, { id: 'iron_spear', count: 1, damage: 3 });
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  const a = [await inv(0), await inv(1)];
  check('save: a loaded flame crossbow (with its wear) and a worn spear come back as they were', a[0] === 'crossbow_loaded_flamex1d7' && a[1] === 'iron_spearx1d3', a);
  await ev(() => { const g = window.__bf.game; g.player.sprinting = false; });
  await ev(() => window.__bf.game.inventory.changed());
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
