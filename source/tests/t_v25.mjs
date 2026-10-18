// Tests for 2.5: potions, the Brewing Stand, the six effects, splash potions, saving.
// node tests/t_v25.mjs   (dev server)   ONLY=items,effects,bottle,brew,splash,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','effects','bottle','brew','splash','save'];
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

const stand = (P, dx = 0, dz = -2) => [P.x + dx, P.y, P.z + dz];
const beAt = (x, y, z) => ev(([x, y, z]) => { const be = window.__bf.game.world.blockEntities.get(`${x},${y},${z}`); return be ? JSON.parse(JSON.stringify(be)) : null; }, [x, y, z]);
const setBe = (x, y, z, items, extra = {}) => ev(([x, y, z, items, extra]) => { const w = window.__bf.game.world; w.blockEntities.set(`${x},${y},${z}`, { type: 'brewing', items, fuel: 0, brewTime: 0, ...extra }); window.__bf.game.stands.add(`${x},${y},${z}`); }, [x, y, z, items, extra]);
const fx = () => ev(() => { const f = window.__bf.game.potions; return f.rows().map((r) => r.id); });
const air = () => ev(() => window.__bf.game.player.air);
const hp = () => ev(() => window.__bf.game.player.health);
const NEWEFF = ['swiftness', 'might', 'mending', 'night_eyes', 'deep_breath', 'emberward'];

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const P = await import('/src/systems/Progress.ts');
    const Bk = await import('/src/world/BlockRegistry.ts');
    const Po = await import('/src/inventory/potions.ts');
    const bf = window.__bf, n = null;
    const E = ['swiftness', 'might', 'mending', 'night_eyes', 'deep_breath', 'emberward'];
    const ids = ['brewing_stand', 'glass_bottle', 'water_bottle', ...E.map((e) => 'potion_' + e), ...E.map((e) => 'splash_' + e)];
    const brew = E.map((e, i) => Po.brewResult('water_bottle', Po.EFFECTS[i].ingredient));
    const splash = E.map((e) => Po.brewResult('potion_' + e, 'glimmer_dust'));
    const colours = new Set(Po.EFFECTS.map((e) => e.rgb.join()));
    return {
      names: ids.map((i) => (I.hasItem(i) ? I.getItem(i).name : null)),
      stacks: ids.map((i) => I.maxStackOf(i)),
      sprites: ids.map((i) => { const px = S.spritePixels(i); let c = 0; for (let k = 3; k < px.length; k += 4) if (px[k] > 0) c++; return c; }),
      adv: P.ADVANCEMENTS.length, advIds: ['brew_stand', 'brew_drink', 'brew_splash'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.parent),
      brew, splash, wrong: [Po.brewResult('water_bottle', 'coal'), Po.brewResult('water_bottle', 'glimmer_dust'), Po.brewResult('potion_might', 'feather'), Po.brewResult('splash_might', 'glimmer_dust'), Po.brewResult('glass_bottle', 'feather')],
      distinct: colours.size,
      last: [Bk.BLOCKS[Bk.BLOCKS.length - 1].key, Bk.BLOCKS[Bk.BLOCKS.length - 2].key, Bk.BREWING_STAND, Bk.DRAKE_TROPHY, Math.max(...Bk.BLOCKS.filter((b) => b.key !== 'brewing_stand' && b.key !== 'drake_trophy').map((b) => b.id))],
      bottles: bf.craft(['glass', n, 'glass', n, 'glass', n, n, n, n]),
      stand: bf.craft([n, 'iron_ingot', n, 'cobblestone', 'cobblestone', 'cobblestone', n, n, n]),
    };
  });
  check('items: stand, bottles, 6 potions and 6 splash potions exist (stack 16), each with a drawn sprite',
    t.names.every(Boolean) && t.stacks.slice(1).every((s) => s === 16) && t.sprites.every((c) => c > 30), t);
  check('items: three new advancements, parented stand -> drink -> splash', t.adv >= 62 && t.advIds.join() === 'furnace,brew_stand,brew_drink', t);
  check('brewing table: each ingredient makes its potion, glimmer dust makes it splash; wrong pairs make nothing',
    t.brew.join() === 'potion_swiftness,potion_might,potion_mending,potion_night_eyes,potion_deep_breath,potion_emberward' &&
    t.splash.join() === 'splash_swiftness,splash_might,splash_mending,splash_night_eyes,splash_deep_breath,splash_emberward' && t.wrong.every((r) => r === null) && t.distinct === 6, t);
  check('save safety: the Brewing Stand (286) and Trophy (285) keep their ids (no saved block id moved; later releases only append)', t.last[2] === 286 && t.last[3] === 285, t.last);
  check('crafting: 3 glass make 3 Glass Bottles; iron + 3 cobblestone make a Brewing Stand', t.bottles?.id === 'glass_bottle' && t.bottles.count === 3 && t.stand?.id === 'brewing_stand', t);
}

// ======================================================================= EFFECTS
if (run('effects')) {
  await newWorld('Fx25', 'fx25', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  // swiftness: really faster (hold W for 30 ticks with and without it)
  const run30 = async () => {
    await tp(P.x + 0.5, P.y, P.z + 6.5, 0, 0);
    await page.keyboard.down('KeyW'); await fast(30); await page.keyboard.up('KeyW');
    return ev((z) => Math.abs(window.__bf.game.player.z - z), P.z + 6.5);
  };
  const base = await run30();
  await ev(() => window.__bf.game.potions.add('swiftness', 3000));
  const quick = await run30();
  check('swiftness: you cover a third more ground', quick / base > 1.2 && quick / base < 1.45, { base, quick });
  await ev(() => window.__bf.game.potions.clear());
  // might: bare hand does 1; with Might 4
  const cow = await spawn('pig', P.x + 0.5, P.y, P.z - 1.5); await freeze(cow);
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  const hit = async () => { const h0 = (await mob(cow)).h; await ev((id) => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.id === id); m.invulnerable = 0; m.hurtTime = 0; g.attack(m); }, cow); return h0 - (await mob(cow)).h; };
  const d0 = await hit();
  await ev(() => window.__bf.game.potions.add('might', 3000));
  const d1 = await hit();
  check('might: a bare-handed blow does 1.5 hearts more (1 -> 4)', d0 === 1 && d1 === 4, { d0, d1 });
  await ev(() => window.__bf.game.potions.clear());
  // mending
  await ev(() => { const g = window.__bf.game; g.player.health = 10; g.player.food = 10; g.potions.add('mending', 3000); });
  await fast(80);
  const h = await hp();
  check('mending: half a heart every two seconds (two beats in 80 ticks, with too little food for natural healing)', h === 12, h);
  await ev(() => { const g = window.__bf.game; g.potions.clear(); g.player.health = 20; g.player.food = 20; });
  // night eyes
  const amb = async () => { await wait(500); return ev(() => window.__bf.engine.renderer.uniforms.uAmbient.value); };
  const a0 = await amb();
  await ev(() => window.__bf.game.potions.add('night_eyes', 3000));
  const a1 = await amb();
  check('night eyes: the world is lit even in the dark (ambient light floor 0.5)', a1 >= 0.5 && a0 < 0.2, { a0, a1 });
  await ev(() => window.__bf.game.potions.clear());
  // deep breath: head under water for 100 ticks
  const dive = async () => {
    await ev(([x, y, z]) => { const bf = window.__bf; for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(x + dx, y + dy, z + dz, dy < 0 ? 'stone' : 'water'); const g = bf.game; g.player.air = 300; g.teleport(x + 0.5, y, z + 0.5); }, [P.x + 4, P.y, P.z - 5]);
    await fast(100);
    return air();
  };
  const airWet = await dive();
  await ev(() => window.__bf.game.potions.add('deep_breath', 3000));
  const airDry = await dive();
  check('deep breath: under water the air runs down without it, and not with it', airWet < 250 && airDry === 300, { airWet, airDry });
  await ev(() => window.__bf.game.potions.clear());
  await tp(P.x + 0.5, P.y + 6, P.z + 5.5, 0, 0);
  // emberward: standing in lava
  const burn = async () => {
    await ev(([x, y, z]) => { const bf = window.__bf, g = bf.game; for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(x + dx, y + dy, z + dz, dy < 0 ? 'stone' : dy === 0 ? 'lava' : 'air'); g.player.health = 20; g.player.invulnerable = 0; g.player.fireTicks = 0; g.teleport(x + 0.5, y, z + 0.5); }, [P.x - 5, P.y, P.z - 5]);
    await fast(40);
    return ev(() => ({ hp: window.__bf.game.player.health, fire: window.__bf.game.player.fireTicks }));
  };
  const lava = await burn();
  await ev(() => window.__bf.game.potions.add('emberward', 3000));
  const safe = await burn();
  check('emberward: lava hurts and sets you alight without it; with it, nothing', lava.hp < 20 && safe.hp === 20 && safe.fire === 0, { lava, safe });
  await ev(([x, y, z]) => { const bf = window.__bf; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bf.setBlock(x + dx, y, z + dz, 'air'); }, [P.x - 5, P.y, P.z - 5]);
  await ev(() => { const g = window.__bf.game; g.potions.clear(); g.player.fireTicks = 0; g.player.health = 20; });
  await tp(P.x + 0.5, P.y + 6, P.z + 6.5, 0, 0);
  // list on screen, expiry, no stacking
  await ev(() => { const f = window.__bf.game.potions; f.add('swiftness', 600); f.add('swiftness', 40); f.add('might', 100); });
  await fast(10); await wait(600);
  const ticksNow = await ev(() => window.__bf.game.potions.ticksLeft('swiftness'));
  const dom = await ev(() => [...document.querySelectorAll('[data-testid=effects-list] .effect-row')].map((r) => r.textContent));
  check('effects: drinking again never shortens or stacks; the list shows the name and time', ticksNow > 300 && dom.length === 2 && /Swiftness/.test(dom[0]) && /Might/.test(dom[1]), { ticksNow, dom });
  await page.screenshot({ path: `${SHOTS}/v25_effects.png` });
  await fast(150);
  const left = await fx();
  const msgs = await chat();
  check('effects: Might ran out and says so; Swiftness is still running', left.join() === 'swiftness' && /Might has worn off/.test(msgs), { left, msgs });
  await fast(700);
  const sp = await ev(() => ({ rows: window.__bf.game.potions.rows().length, mul: window.__bf.game.player.speedMul }));
  check('effects: when the last one ends, speed goes back to normal', sp.rows === 0 && sp.mul === 1, sp);
}

// ======================================================================= BOTTLE (fill and drink with real input)
if (run('bottle')) {
  await newWorld('Bottle25', 'bottle25', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  await set(P.x, P.y, P.z - 3, 'water');
  await give({ id: 'glass_bottle', count: 2 });
  await tp(P.x + 0.5, P.y, P.z - 0.5, 0, 0);
  await aim(P.x + 0.5, P.y + 0.5, P.z - 2.5); await rclick();
  const s1 = await ev(() => window.__bf.game.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join());
  check('bottle: right-click on water fills a Glass Bottle (the pond stays)', /water_bottlex1/.test(s1) && /glass_bottlex1/.test(s1) && (await key(P.x, P.y, P.z - 3)) === 'water', s1);
  await give({ id: 'potion_swiftness', count: 2 });
  await tp(P.x + 0.5, P.y, P.z + 2.5, 0, 0);
  await centre();
  await page.mouse.down({ button: 'right' }); await wait(900);
  const mid = await fx();
  await wait(2200); await page.mouse.up({ button: 'right' }); await ticks(3);
  const after = await ev(() => ({ rows: window.__bf.game.potions.rows().map((r) => r.id), inv: window.__bf.game.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join(), adv: window.__bf.game.progress.done.has('brew_drink'), n: window.__bf.game.progress.stats.potions_drunk }));
  check('drink: holding use for 1.6 s drinks the Potion of Swiftness; the bottle comes back empty; "Down the Hatch"',
    mid.length === 0 && after.rows[0] === 'swiftness' && /potion_swiftnessx1/.test(after.inv) && /glass_bottle/.test(after.inv) && after.adv && after.n >= 1, { mid, after });
  await wait(300);
}

// ======================================================================= BREWING STAND
if (run('brew')) {
  await newWorld('Brew25', 'brew25', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  const [sx, sy, sz] = stand(P);
  await set(sx, sy, sz, 'brewing_stand');
  await tp(P.x + 0.5, P.y, P.z + 1.5, 0, 0);
  await aim(sx + 0.5, sy + 0.4, sz + 0.5); await rclick();
  const ov = await overlay();
  const groups = await ev(() => { const h = window.__bf.game.screen; return h ? [h.group('brew_bottle').length, h.group('brew_ingredient').length, h.group('brew_fuel').length] : null; });
  check('stand: right-click opens the Brewing Stand screen (3 bottle slots, 1 ingredient, 1 fuel)', ov === 'brewing' && groups?.join() === '3,1,1', { ov, groups });
  const dom = await ev(() => !!document.querySelector('[data-testid=brew-progress]') && !!document.querySelector('[data-testid=brew-fuel]'));
  await page.screenshot({ path: `${SHOTS}/v25_stand.png` });
  const rules = await ev(() => {
    const h = window.__bf.game.screen, st = (id) => ({ id, count: 1 });
    const cap = (g, id) => h.capacity(h.group(g)[0], st(id));
    return { bottleOk: [cap('brew_bottle', 'water_bottle'), cap('brew_bottle', 'potion_might'), cap('brew_bottle', 'apple'), cap('brew_bottle', 'splash_might')], ingOk: [cap('brew_ingredient', 'feather'), cap('brew_ingredient', 'glimmer_dust'), cap('brew_ingredient', 'dirt')], fuelOk: [cap('brew_fuel', 'coal'), cap('brew_fuel', 'feather')] };
  });
  check('stand: slots take only what belongs (bottles, ingredients, coal)', rules.bottleOk.join() === '1,1,0,0' && rules.ingOk[0] > 0 && rules.ingOk[1] > 0 && rules.ingOk[2] === 0 && rules.fuelOk[0] > 0 && rules.fuelOk[1] === 0 && dom, { rules, dom });
  await ev(() => window.__bf.engine.closeOverlay());
  await ticks(2);
  // a full brew: 3 water bottles + feather + coal, with the screen closed
  await setBe(sx, sy, sz, [{ id: 'water_bottle', count: 1 }, { id: 'water_bottle', count: 1 }, { id: 'water_bottle', count: 1 }, { id: 'feather', count: 2 }, { id: 'coal', count: 2 }]);
  await fast(200);
  const half = await beAt(sx, sy, sz);
  await fast(220);
  const done = await beAt(sx, sy, sz);
  check('brew: after 20 seconds all three bottles are Swiftness; one feather and one coal are spent (nine brews of fuel left)',
    half.brewTime > 150 && half.items[0].id === 'water_bottle' && done.items.slice(0, 3).every((s) => s?.id === 'potion_swiftness') && done.items[3].count === 1 && done.items[4].count === 1 && done.fuel === 9 && done.brewTime === 0, { half: half.brewTime, done });
  // splash: potions + glimmer dust
  await ev(([x, y, z]) => { const be = window.__bf.game.world.blockEntities.get(`${x},${y},${z}`); be.items[3] = { id: 'glimmer_dust', count: 1 }; }, [sx, sy, sz]);
  await fast(430);
  const sp = await beAt(sx, sy, sz);
  check('brew: potion + Glimmer Dust makes it a splash potion (using the fuel already lit, not a second coal)', sp.items.slice(0, 3).every((s) => s?.id === 'splash_swiftness') && sp.items[3] === null && sp.items[4].count === 1 && sp.fuel === 8, sp);
  // refusals: wrong ingredient, no fuel
  await setBe(sx, sy, sz, [{ id: 'water_bottle', count: 1 }, null, null, { id: 'dirt', count: 1 }, { id: 'coal', count: 1 }]);
  await fast(450);
  const no1 = await beAt(sx, sy, sz);
  await setBe(sx, sy, sz, [{ id: 'water_bottle', count: 1 }, null, null, { id: 'feather', count: 1 }, null]);
  await fast(450);
  const no2 = await beAt(sx, sy, sz);
  check('brew: a wrong ingredient does nothing; with no coal it does not brew', no1.items[0].id === 'water_bottle' && no1.brewTime === 0 && no2.items[0].id === 'water_bottle' && no2.brewTime === 0, { no1, no2 });
  // each of the six, in one go
  const E = [['feather', 'potion_swiftness'], ['bone', 'potion_might'], ['starbloom', 'potion_mending'], ['glowcap', 'potion_night_eyes'], ['drift_silk', 'potion_deep_breath'], ['ember', 'potion_emberward']];
  const got = [];
  for (const [ing, want] of E) {
    await setBe(sx, sy, sz, [{ id: 'water_bottle', count: 1 }, null, null, { id: ing, count: 1 }, { id: 'coal', count: 1 }]);
    await fast(410);
    got.push((await beAt(sx, sy, sz)).items[0]?.id === want);
  }
  check('brew: all six ingredients make their six potions', got.every(Boolean), got);
  // breaking spills; reopening keeps contents
  await setBe(sx, sy, sz, [{ id: 'potion_might', count: 1 }, null, null, { id: 'feather', count: 3 }, { id: 'coal', count: 4 }]);
  await clearItems();
  await ev(([x, y, z]) => window.__bf.game.breakBlockAt(x, y, z, true, true), [sx, sy, sz]);
  await ticks(2);
  const spilled = await itemsNear({ x: sx, z: sz }, 4);
  check('stand: breaking it spills its bottles, ingredient and coal, and drops the stand', spilled.some((s) => s.startsWith('brewing_stand')) && spilled.some((s) => s.startsWith('potion_might')) && spilled.some((s) => s.startsWith('feather')) && spilled.some((s) => s.startsWith('coal')), spilled);
}

// ======================================================================= SPLASH
if (run('splash')) {
  await newWorld('Splash25', 'splash25', false);
  const P = await pad(10);
  await ev(() => { window.__bf.game.player.creative = false; });
  const pig = await spawn('pig', P.x + 0.5, P.y, P.z - 2.0); await freeze(pig);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.health = 3; m.fireTicks = 100; }, pig);
  await give({ id: 'splash_mending', count: 2 });
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  await centre();
  await ev(() => { const g = window.__bf.game; window.__sh = []; const o = g.shatterPotion.bind(g); g.shatterPotion = (x, y, z, e) => { window.__sh.push([x, y, z, e, g.player.x, g.player.y, g.player.z, g.player.pitch]); return o(x, y, z, e); }; g.player.pitch = -1.15; });
  await page.mouse.click(CX, CY, { button: 'right' });
  await fast(60);
  const st = await ev((id) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); return { flying: g.entities.list.filter((e) => e.type === 'splash_potion').length, left: g.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join(), fx: g.potions.rows().map((r) => r.id), mobHp: m.health, adv: g.progress.done.has('brew_splash'), sh: window.__sh }; }, pig);
  check('splash: right-click throws it; it shatters on the ground (none left flying) and one is used up; "Splash Zone"', st.flying === 0 && /splash_mendingx1/.test(st.left) && st.adv, st);
  check('splash: the Mending cloud heals the player and creatures near the spot (a 3-hp pig is healed 3 hearts)', st.fx.join() === 'mending' && st.mobHp === 9, st);
  // Emberward douses; far away does nothing
  await give({ id: 'splash_emberward', count: 1 });
  await ev(() => { const g = window.__bf.game; g.potions.clear(); });
  await tp(P.x + 0.5 - 8, P.y, P.z + 0.5 + 6, 0, 0);
  await ev(() => { window.__bf.game.player.pitch = 0.2; });
  await centre(); await page.mouse.click(CX, CY, { button: 'right' });
  await fast(60);
  const far = await ev((id) => ({ fx: window.__bf.game.potions.rows().map((r) => r.id), fire: window.__bf.game.entities.list.find((e) => e.id === id).fireTicks }), pig);
  check('splash: out of range (about 4 blocks) it does nothing to you, nor to creatures', far.fx.length === 0 && far.fire > 0, far);
  await page.screenshot({ path: `${SHOTS}/v25_splash.png` });
}

// ======================================================================= SAVE
if (run('save')) {
  const W = await newWorld('Save25', 'save25', false);
  const P = await pad(8);
  await ev(() => { window.__bf.game.player.creative = false; });
  const [sx, sy, sz] = stand(P);
  await set(sx, sy, sz, 'brewing_stand');
  await setBe(sx, sy, sz, [{ id: 'water_bottle', count: 1 }, null, { id: 'water_bottle', count: 1 }, { id: 'glowcap', count: 2 }, { id: 'coal', count: 3 }], { fuel: 4, brewTime: 120 });
  await ev(() => { const f = window.__bf.game.potions; f.add('night_eyes', 2400); f.add('mending', 600); });
  await give({ id: 'potion_might', count: 3 }, 2);
  await settle();
  await reopen(W);
  const a = await ev(([x, y, z]) => { const g = window.__bf.game; return { fx: Object.fromEntries(g.potions.rows().map((r) => [r.id, r.seconds])), blk: window.__bf.getBlock(x, y, z), inv: g.inventory.slots[2]?.id + 'x' + g.inventory.slots[2]?.count }; }, [sx, sy, sz]);
  check('save: effects are still running after Save and Quit, with about the same time left (and nothing else switched on)', a.fx.night_eyes > 100 && a.fx.night_eyes <= 120 && a.fx.mending > 20 && a.fx.mending <= 30 && Object.keys(a.fx).length === 2, a);
  const be = await beAt(sx, sy, sz);
  check('save: a Brewing Stand keeps its bottles, ingredient, coal, fuel and progress, and potions in the inventory keep their kind',
    a.blk === 'brewing_stand' && be?.items[0]?.id === 'water_bottle' && be.items[3].id === 'glowcap' && be.items[4].count === 3 && be.fuel === 4 && be.brewTime >= 120 && a.inv === 'potion_mightx3', { a, be });
  await fast(300);
  const cont = await beAt(sx, sy, sz);
  check('save: the reloaded stand carries on brewing and finishes (Night Eyes)', cont.items[0]?.id === 'potion_night_eyes' && cont.items[2]?.id === 'potion_night_eyes', cont);
  await ev(() => { const g = window.__bf.game; g.potions.clear(); });
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
