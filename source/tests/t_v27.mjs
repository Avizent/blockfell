// Tests for 2.7: saddles, riding (pig, Horse, Lavastrider), the Ember Lure.
// node tests/t_v27.mjs   (dev server)   ONLY=items,pig,horse,strider,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','pig','horse','strider','save'];
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


const rideInfo = () => ev(() => { const g = window.__bf.game, r = g.riding; return r ? { type: r.mobType ?? r.type, rider: r.rider, x: r.x, y: r.y, z: r.z, onLava: r.onLava ?? null, seat: r.seat } : null; });
const playerPos = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z, hp: p.health, fire: p.fireTicks }; });
const drive = (o) => ev((o) => { window.__bf.game.autopilot = o; }, o);
const mobProp = (id, k) => ev(([id, k]) => window.__bf.game.entities.list.find((e) => e.id === id)?.[k], [id, k]);
const mobSet = (id, k, v) => ev(([id, k, v]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m) m[k] = v; }, [id, k, v]);
const dismount = () => ev(() => { window.__bf.game.dismount(); });
const steady = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m) { m.hasTarget = false; m.panic = 0; m.chasing = false; } }, id);
const faceAt = (x, y, z) => aim(x, y, z);

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const P = await import('/src/systems/Progress.ts');
    const M = await import('/src/entities/mobModels.ts');
    const ids = ['saddle', 'ember_lure', 'spawn_horse', 'spawn_lavastrider'];
    const models = [0, 1, 2, 3, 4].map((c) => M.horseModel(c)).concat([M.mobModel('lavastrider'), M.mobModel('pig')]);
    return {
      exist: ids.map((id) => !!I.getItem(id)), sprites: ids.map((id) => !!S.SPRITES[id]), stack: [I.getItem('saddle').maxStack, I.getItem('ember_lure').maxStack],
      saddles: models.map((m) => m.parts.has ? m.parts.has('saddle') : null), count: P.ADVANCEMENTS.length,
      adv: ['saddle_up', 'lava_walker', 'gallop'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.parent),
      horseCoats: M.HORSE_COAT_COUNT,
    };
  });
  const c = await ev(() => {
    const bf = window.__bf, n = null;
    const r = (g) => { const x = bf.craft(g); return x ? x.id + 'x' + x.count : null; };
    return { saddle: r(['leather', 'leather', 'leather', 'leather', 'iron_ingot', 'leather', n, n, n]), lure: r(['stick', 'string', 'ember', n, n, n, n, n, n]), lure2: r([n, 'ember', n, 'string', n, 'stick', n, n, n]) };
  });
  check('crafting: a Saddle (5 leather and an iron ingot) and an Ember Lure (stick, string, ember, any order)', c.saddle === 'saddlex1' && c.lure === 'ember_lurex1' && c.lure2 === 'ember_lurex1', c);
  check('items: Saddle, Ember Lure and the two new spawn eggs exist with sprites; they stack to 1', t.exist.every(Boolean) && t.sprites.every(Boolean) && t.stack.join() === '1,1', t);
  check('items: the horse (5 coats) and Lavastrider models build, each with a saddle part; 68 advancements, Saddle Up under Set Sail', t.horseCoats === 5 && t.count >= 68 && t.adv.join() === 'boat,saddle_up,saddle_up', t);
}

// ======================================================================= PIG (the shared riding system)
let P0;
if (run('pig') || run('horse') || run('strider') || run('save')) {
  await newWorld('Riding Tests', 'saddlebags', false);
  P0 = await pad(16);
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 1e9; g.rules.doMobSpawning = false; });
  await clearInv();
}
let pig;
if (run('pig')) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y, z + 1.5); g.player.yaw = 0; }, [P0.x, P0.y, P0.z]);
  pig = await spawn('pig', P0.x + 0.5, P0.y, P0.z - 1.5);
  await freeze(pig);
  await setSlot(0, null);
  await aimMob(pig); await rclick();
  check('pig: right-clicking a pig with no saddle does nothing (no riding)', !(await rideInfo()) && !(await mobProp(pig, 'saddled')), await rideInfo());
  await setSlot(0, { id: 'saddle', count: 1 });
  await aimMob(pig);
  await rclick();
  const sd = await mobProp(pig, 'saddled');
  check('pig: a Saddle goes on (and is used up); the pig stays put and now wears a visible saddle', sd === true && (await inv(0)) === null && (await mobProp(pig, 'persistent')) === true, { sd, s: await inv(0), c: await chat() });
  const vis = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); let v = null; m.object.traverse((o) => { if (o.name === 'saddle') v = o.visible; }); return m.parts.get('saddle')?.visible ?? v; }, pig);
  await ticks(2); await wait(150);
  await aimMob(pig); await rclick();
  const r1 = await rideInfo();
  check('pig: right-clicking the saddled pig climbs on (Saddle Up) and seats the player on its back', r1 && r1.type === 'pig' && r1.rider && (await adv('saddle_up')), { r1, vis });
  const pp = await playerPos();
  check('pig: the rider sits at the saddle height', Math.abs(pp.y - (r1.y + r1.seat)) < 0.2 && Math.hypot(pp.x - r1.x, pp.z - r1.z) < 0.3, { pp, r1 });
  await unfreeze(pig);
  await ev(() => { const g = window.__bf.game; g.player.yaw = 0; });
  const z0 = (await rideInfo()).z;
  await drive({ forward: 1 });
  await ticks(40);
  const z1 = (await rideInfo()).z;
  await drive(null);
  const dp = z0 - z1;
  check('pig: W sets it off in the direction you look (north), at a walking-to-trotting pace', dp > 4 && dp < 12, { z0, z1, dp });
  check('pig: the player rides along with it', (await ev(() => { const g = window.__bf.game, p = g.player, r = g.riding; return Math.hypot(p.x - r.x, p.z - r.z) < 0.4; })));
  await ev(() => { const g = window.__bf.game; g.player.yaw = Math.PI / 2; });
  const x0 = (await rideInfo()).x;
  await drive({ forward: 1 }); await ticks(25); await drive(null);
  const x1 = (await rideInfo()).x;
  check('pig: it turns to wherever you look (west)', x0 - x1 > 2, { x0, x1 });
  // not hittable while riding
  await aimMob(pig); await ticks(3);
  check('pig: you cannot target the creature you are sitting on', (await ev(() => window.__bf.game.targetMob)) === null || (await ev(() => window.__bf.game.targetMob?.rider !== true)));
  // dismount
  await page.keyboard.down('ShiftLeft'); await ticks(3); await page.keyboard.up('ShiftLeft'); await ticks(3);
  const after = await rideInfo();
  check('pig: Shift climbs off, beside the pig', after === null && (await mobProp(pig, 'rider')) === false, after);
  // unsaddle
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 1e9; });
  await mobSet(pig, 'hasTarget', false);
  await freeze(pig);
  await clearItems();
  await setSlot(0, null);
  await drive({ sneak: true }); await ticks(2);
  await aimMob(pig); await rclick();
  await drive(null); await ticks(2);
  const items = await itemsNear({ x: await mobProp(pig, 'x'), z: await mobProp(pig, 'z') }, 3);
  check('pig: sneak + right-click with an empty hand takes the saddle off (it drops, or lands in your pack)', (await mobProp(pig, 'saddled')) === false && (items.includes('saddlex1') || (await ev(() => window.__bf.game.inventory.slots.some((s) => s && s.id === 'saddle')))), { items, sd: await mobProp(pig, 'saddled') });
  // babies cannot be saddled
  const baby = await spawn('pig', P0.x + 3.5, P0.y, P0.z - 1.5);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).makeBaby(5000); }, baby);
  await freeze(baby);
  await setSlot(0, { id: 'saddle', count: 1 });
  await aimMob(baby); await rclick();
  check('pig: a piglet cannot be saddled', (await mobProp(baby, 'saddled')) === false && (await inv(0)) === 'saddlex1', await inv(0));
  // a dying mount drops you
  await unfreeze(pig);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).saddled = true; }, pig);
  await freeze(pig); await setSlot(0, null);
  await aimMob(pig); await rclick();
  const rr = await rideInfo();
  await unfreeze(pig);
  await ev((id) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.hurt(100, g, 0, 0, false); }, pig);
  await ticks(6);
  check('pig: if the mount dies, you are put back on your feet', rr && !(await rideInfo()), { rr, now: await rideInfo() });
}

// ======================================================================= HORSE
let horse;
if (run('horse')) {
  await clearItems();
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y, z + 3.5); g.player.yaw = 0; g.player.pitch = 0; }, [P0.x, P0.y, P0.z]);
  horse = await spawn('horse', P0.x + 0.5, P0.y, P0.z + 0.5);
  const coats = [];
  for (let c = 0; c < 5; c++) { await ev(([id, c]) => window.__bf.game.entities.list.find((e) => e.id === id).setCoat(c), [horse, c]); coats.push(await mobProp(horse, 'coat')); }
  await ev(([id]) => window.__bf.game.entities.list.find((e) => e.id === id).setCoat(2), [horse]);
  check('horse: it comes in five coats (setCoat 0..4) and keeps the one it is given', coats.join() === '0,1,2,3,4' && (await mobProp(horse, 'coat')) === 2, coats);
  await freeze(horse);
  await setSlot(0, { id: 'saddle', count: 1 });
  await aimMob(horse); await rclick();
  await setSlot(0, null);
  await ticks(3); await aimMob(horse); await rclick();
  const r = await rideInfo();
  check('horse: saddle it and climb on', r && r.type === 'horse' && r.rider, r);
  await unfreeze(horse);
  await steady(horse);
  await ev(() => { window.__bf.game.player.yaw = 0; });
  const z0 = (await rideInfo()).z;
  await drive({ forward: 1 }); await ticks(40);
  const z1 = (await rideInfo()).z;
  await drive(null);
  const dh = z0 - z1;
  check('horse: a gallop is much faster than the pig\'s trot (at least 12 blocks in 2 seconds; the pig goes about 8)', dh > 12, { dh });
  // jump
  await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.riding; m.vx = m.vz = 0; m.setPos(x + 0.5, y, z + 8.5); }, [P0.x, P0.y, P0.z]);
  await ticks(10);
  const y0 = (await rideInfo()).y;
  let maxY = y0;
  await drive({ jump: true });
  for (let i = 0; i < 16; i++) { await ticks(1); const r2 = await rideInfo(); if (r2) maxY = Math.max(maxY, r2.y); }
  await drive(null);
  check('horse: Jump takes it over 1.3 blocks or more (a fence)', maxY - y0 > 1.3, { y0, maxY });
  // a one-block step is climbed while galloping
  await ev(([x, y, z]) => { for (let dx = -3; dx <= 3; dx++) window.__bf.setBlock(x + dx, y, z + 5, 'stone'); const g = window.__bf.game; g.riding.setPos(x + 0.5, y, z + 9.5); g.riding.vx = g.riding.vz = 0; }, [P0.x, P0.y, P0.z]);
  await ticks(8);
  await ev(() => { window.__bf.game.player.yaw = 0; });
  let top = 0;
  await drive({ forward: 1 });
  for (let i = 0; i < 20; i++) { await ticks(2); const q = await rideInfo(); if (q) top = Math.max(top, q.y); }
  await drive(null);
  const r3 = await rideInfo();
  check('horse: it steps up a one-block rise as it runs', top > P0.y + 0.9 && r3.z < P0.z + 4, { top, r3, P0 });
  // gallop advancement (300 blocks)
  await ev(() => { window.__bf.game.progress.stats.horse = 29950; });
  await ev(() => { window.__bf.game.player.yaw = Math.PI; });
  await drive({ forward: 1 }); await ticks(12); await drive(null);
  check('horse: Gallop! once you have ridden 300 blocks; distance is counted', (await adv('gallop')) && (await stat('ride')) > 500, { s: await stat('horse'), r: await stat('ride') });
}

// ======================================================================= LAVASTRIDER
if (run('strider')) {
  if (!P0) throw new Error('needs a world');
  await dismount(); await clearItems();
  // a lava pool 9 wide, 12 long, to the north; solid grass around
  await ev(([x, y, z]) => { for (let dx = -4; dx <= 4; dx++) for (let dz = -14; dz <= -3; dz++) { window.__bf.setBlock(x + dx, y - 1, z + dz, 'lava'); window.__bf.setBlock(x + dx, y - 2, z + dz, 'stone'); for (let dy = 0; dy < 5; dy++) window.__bf.setBlock(x + dx, y + dy, z + dz, 'air'); } }, [P0.x, P0.y, P0.z]);
  await settle();
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; g.teleport(x + 0.5, y, z + 3.5); g.player.yaw = 0; g.player.pitch = 0; }, [P0.x, P0.y, P0.z]);
  const ls = await spawn('lavastrider', P0.x + 0.5, P0.y, P0.z + 0.5);
  await freeze(ls);
  await setSlot(0, { id: 'saddle', count: 1 });
  await aimMob(ls); await rclick();
  await setSlot(0, null); await ticks(3);
  await aimMob(ls); await rclick();
  const r = await rideInfo();
  check('strider: a Lavastrider takes a saddle and a rider; the chat tells you to hold an Ember Lure', r && r.type === 'lavastrider' && (await chat()).toLowerCase().includes('ember lure'), { r, c: await chat() });
  await unfreeze(ls);
  await steady(ls);
  await ev(() => { window.__bf.game.player.yaw = 0; });
  const a0 = await rideInfo();
  await drive({ forward: 1 }); await ticks(25);
  const a1 = await rideInfo();
  await drive(null);
  check('strider: without an Ember Lure in hand it ignores your steering', Math.hypot(a1.x - a0.x, a1.z - a0.z) < 3.5, { a0, a1 });
  await steady(ls);
  await setSlot(0, { id: 'ember_lure', count: 1 });
  await ev(() => { const g = window.__bf.game; g.riding.setPos(g.riding.x, g.riding.y, g.riding.z); g.player.yaw = 0; });
  await ev(([x, y, z]) => { const g = window.__bf.game; g.riding.setPos(x + 0.5, y, z + 9.5); g.riding.vx = g.riding.vz = 0; }, [P0.x, P0.y, P0.z]);
  await ticks(5);
  const g0 = await rideInfo();
  await drive({ forward: 1 }); await ticks(20);
  const g1 = await rideInfo();
  await drive(null);
  const landSpeed = Math.hypot(g1.x - g0.x, g1.z - g0.z);
  check('strider: holding the Ember Lure it follows your steering over land (slowly)', landSpeed > 1.2 && landSpeed < 4, { g0, g1 });
  await ev(([x, y, z]) => { const g = window.__bf.game; g.riding.setPos(x + 0.5, y, z - 2.6); g.riding.vx = g.riding.vz = 0; g.player.yaw = 0; }, [P0.x, P0.y, P0.z]);
  await drive({ forward: 1 }); await ticks(12); // out onto the pool
  const l1 = await rideInfo(); const pp = await playerPos();
  const lavaTop = P0.y - 1 + 0.875;
  check('strider: it strides out over the lava, standing on the surface, and you are not burnt', l1.onLava === true && Math.abs(l1.y - lavaTop) < 0.15 && pp.hp === 20 && pp.fire <= 0, { l1, lavaTop, pp });
  check('strider: Lava Walker earned', await adv('lava_walker'));
  // speed on lava vs land
  await ev(([x, y, z]) => { const g = window.__bf.game; g.riding.setPos(x + 0.5, y - 0.125, z - 3.6); g.riding.vx = g.riding.vz = 0; g.player.yaw = 0; }, [P0.x, P0.y, P0.z]);
  await drive({ forward: 1 });
  await ticks(5);
  const m0 = await rideInfo(); await ticks(20); const m1 = await rideInfo();
  const lavaSpeed = Math.hypot(m1.x - m0.x, m1.z - m0.z);
  check('strider: it is much quicker over lava than over land', lavaSpeed > landSpeed * 1.3, { lavaSpeed, landSpeed });
  await drive(null);
  // fallen into lava from a height: put back on the surface, not sunk
  await ev(([x, y, z]) => { const g = window.__bf.game; g.riding.setPos(x + 0.5, y + 3, z - 8.5); g.riding.vy = 0; }, [P0.x, P0.y, P0.z]);
  await ticks(40);
  const f1 = await rideInfo();
  check('strider: dropped onto lava from above it lands on the surface and does not sink', Math.abs(f1.y - lavaTop) < 0.2, { f1, lavaTop });
  await dismount(); await ticks(2);
  // an ordinary pig will not walk into lava
  const pigx = await spawn('pig', P0.x + 0.5, P0.y, P0.z - 2.2);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.hasTarget = true; m.targetX = m.x; m.targetZ = m.z - 8; }, pigx);
  await ticks(60);
  const py = await mobProp(pigx, 'y');
  check('strider: (control) a plain pig still keeps out of the lava', py > P0.y - 0.5, { py });
}

// ======================================================================= SAVE
if (run('save')) {
  await drive(null); await dismount(); await clearItems();
  await ev(([x, y, z]) => { const g = window.__bf.game; if (g.player.dead) g.respawn(); g.player.health = 20; g.player.fireTicks = 0; g.player.invulnerable = 1e9; g.teleport(x + 0.5, y, z + 3.5); }, [P0.x, P0.y, P0.z]);
  await ticks(3);
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.invulnerable = 1e9; g.teleport(x + 0.5, y, z + 3.5); g.player.yaw = 0; }, [P0.x, P0.y, P0.z]);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item' && e.type !== 'player' && e.mobType) e.removed = true; });
  await ticks(2);
  const h = await spawn('horse', P0.x + 0.5, P0.y, P0.z + 0.5);
  await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setCoat(4); m.saddled = true; m.persistent = true; }, [h]);
  await freeze(h);
  await aimMob(h); await rclick();
  const ridden = await rideInfo();
  if (!ridden) console.log('DBG', JSON.stringify(await ev((id) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); return { tm: g.targetMob?.id, h: id, riding: !!g.riding, saddled: m.saddled, rider: m.rider, alive: m.alive, d: Math.hypot(m.x - g.player.x, m.z - g.player.z), sneak: g.player.sneaking, dead: g.player.dead, held: g.inventory.selectedStack?.id, ent: g.entities.list.filter((e) => e.mobType).map((e) => e.mobType + e.id) }; }, h)));
  await unfreeze(h);
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  const g = await ev(() => { const gm = window.__bf.game, r = gm.riding; return r ? { type: r.mobType, saddled: r.saddled, coat: r.coat, rider: r.rider } : null; });
  check('save: a saddled horse of its own coat is still there after Save and Quit, and you are still riding it', ridden && g && g.type === 'horse' && g.saddled && g.coat === 4 && g.rider, { ridden, g });
  await dismount();
  const kept = await ev(() => window.__bf.game.entities.list.filter((e) => e.mobType === 'horse' && e.saddled).length);
  check('save: the saddle stays on after you climb off', kept === 1, kept);
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
