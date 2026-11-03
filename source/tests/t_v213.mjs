// Tests for 2.13.0: Axolotls, Squid and Guardians.
// node tests/t_v211.mjs   (dev server)   ONLY=items,glider
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','aqua','save','shots'];
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





const hurtPlayer = () => ev(() => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; g.player.gameMode = 'survival'; g.difficulty = 'normal'; });



const isWater = (k) => /^water/.test(String(k));
/** Builds a water tank 11 wide, 11 long and 9 deep north of the player; returns the pad position. */
async function tank() {
  const P = await pad(10);
  await ev(([P]) => {
    const bf = window.__bf;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -13; dz <= -1; dz++) for (let dy = -10; dy <= -1; dy++) {
      const inside = Math.abs(dx) <= 5 && dz >= -12 && dz <= -2 && dy >= -9;
      bf.setBlock(P.x + dx, P.y + dy, P.z + dz, inside ? 'water' : 'stone');
    }
    for (let dx = -6; dx <= 6; dx++) for (let dz = -13; dz <= -1; dz++) for (let dy = 0; dy <= 6; dy++) bf.setBlock(P.x + dx, P.y + dy, P.z + dz, 'air');
  }, [P]);
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 1e9; g.player.health = 20; });
  await wait(300);
  return P;
}
/** Runs n ticks and counts the ticks a creature was out of the water; returns where it ended up. */
const swimRun = (id, n) => ev(([id, n]) => {
  const g = window.__bf.game; const m = g.entities.list.find((e) => e.id === id);
  let out = 0, dist = 0, lx = m.x, ly = m.y, lz = m.z, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    g.tick();
    if (!m.alive || m.removed) break;
    const k = window.__bf.getBlock(Math.floor(m.x), Math.floor(m.y + m.height * 0.5), Math.floor(m.z));
    if (!/^water/.test(String(k))) out++;
    dist += Math.hypot(m.x - lx, m.y - ly, m.z - lz); lx = m.x; ly = m.y; lz = m.z; minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
  }
  return { out, dist: +dist.toFixed(1), alive: m.alive && !m.removed, x: m.x, y: m.y, z: m.z, minY, maxY, h: m.health };
}, [id, n]);

if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const C = await import('/src/world/constants.ts');
    const M = await import('/src/entities/Mob.ts');
    const P = await import('/src/systems/Progress.ts');
    const Pt = await import('/src/inventory/potions.ts');
    const eggs = ['axolotl', 'squid', 'guardian'];
    return {
      ver: C.GAME_VERSION, has: ['ink_sac', 'tide_shard', ...eggs.map((e) => 'spawn_' + e)].every((i) => I.hasItem(i)),
      sprites: ['ink_sac', 'tide_shard', ...eggs.map((e) => 'spawn_' + e)].every((i) => !!S.SPRITES[i]),
      specs: eggs.every((e) => !!M.MOB_SPECS[e]), hostile: M.MOB_SPECS.guardian.hostile && !M.MOB_SPECS.squid.hostile && !M.MOB_SPECS.axolotl.hostile,
      drops: JSON.stringify([M.MOB_SPECS.squid.drops, M.MOB_SPECS.guardian.drops.map((d) => d[0])]),
      adv: ['axolotl', 'axolotl_ally', 'ink', 'guardian'].every((id) => P.ADVANCEMENTS.some((a) => a.id === id)),
      alt: Pt.EFFECTS.find((e) => e.id === 'deep_breath').alt,
    };
  });
  check('items: version 2.13.0, Ink Sac, Tide Shard, three spawn eggs, sprites, specs', t.ver === '2.13.0' && t.has && t.sprites && t.specs && t.hostile, t);
  check('items: Squid drops Ink Sacs, Guardian drops Tide Shards, four advancements, Tide Shard brews Deep Breath', /ink_sac/.test(t.drops) && /tide_shard/.test(t.drops) && t.adv && t.alt === 'tide_shard', t);
}


if (run('aqua')) {
  await newWorld('v213', 'aqua-1', true);
  await ev(() => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; g.difficulty = 'normal'; });
  const P = await tank();
  const shore = () => tp(P.x + 0.5, P.y, P.z - 0.5, 0, 0);
  // ---- swimming
  const sq = await spawn('squid', P.x + 0.5, P.y - 5, P.z - 7);
  const ax = await spawn('axolotl', P.x + 0.5, P.y - 9, P.z - 7);
  const r1 = await swimRun(sq, 400);
  check('squid: swims about inside the water for 20 s and does not leave it', r1.alive && r1.out < 6 && r1.dist > 3, r1);
  const r2 = await swimRun(ax, 400);
  check('axolotl: paddles about inside the water for 20 s and does not leave it', r2.alive && r2.out < 6 && r2.dist > 1, r2);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  // ---- an axolotl swims to a raw fish in your hand
  const ax2 = await spawn('axolotl', P.x - 3.5, P.y - 9, P.z - 11);
  await tp(P.x + 0.5, P.y - 5, P.z - 3.5);
  await setSlot(0, { id: 'raw_trout', count: 3 });
  const r3 = await swimRun(ax2, 300);
  const dFish = await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id), p = g.player; return Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z); }, [ax2]);
  check('axolotl: swims over to the player holding a raw fish', dFish < 3.5, { dFish, r3 });
  await setSlot(0, null);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  // ---- feeding with a real right-click
  await shore();
  const ax3 = await spawn('axolotl', P.x + 0.5, P.y - 1.4, P.z - 1.5);
  await freeze(ax3);
  await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.health = 6; }, [ax3]);
  await setSlot(0, { id: 'raw_trout', count: 2 });
  await aim(P.x + 0.5, P.y - 1.2, P.z - 1.5);
  await rclick();
  const m3 = await mob(ax3);
  check('axolotl: a raw fish right-clicked on it mends 4 health, is used up, and earns Pond Pal', m3.h === 10 && (await sel()) === 'raw_troutx1' && (await adv('axolotl')) && (await stat('axolotls_fed')) === 1, { m3, sel: await sel() });
  const notFish = await (async () => { await setSlot(0, { id: 'apple', count: 1 }); await rclick(); return (await mob(ax3)).h; })();
  check('axolotl: an apple does nothing', notFish === 10, notFish);
  // ---- plays dead and heals
  await unfreeze(ax3);
  await withRandom(0);
  const before = await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.invulnerable = 0; m.hurt(4, g, 1, 0, true); return { h: m.health, dead: m.playDead }; }, [ax3]);
  await realRandom();
  await fast(130);
  const after = await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return { h: m.health, dead: m.playDead }; }, [ax3]);
  check('axolotl: hurt, it plays dead and heals while it does', before.dead > 0 && after.h > before.h, { before, after });
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  // ---- fights a hostile creature in the water and rewards you
  await tp(P.x + 0.5, P.y, P.z + 6);
  const ax4 = await spawn('axolotl', P.x - 1.5, P.y - 9, P.z - 11);
  const bug = await spawn('powderbug', P.x + 0.5, P.y - 9, P.z - 11);
  await ev(() => { const g = window.__bf.game; g.player.invulnerable = 1e9; });
  const r4 = await swimRun(ax4, 700);
  const mb = await mob(bug);
  check('axolotl: attacks a hostile creature in the water and finishes it', !mb || !mb.alive, { mb, r4 });
  check('axolotl: finishing it off gives you Mending (announced) and Fighting Fit', /Axolotl finished it off/.test(await chat()) && (await adv('axolotl_ally')), await chat());
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  // ---- squid: ink and flight, then an Ink Sac
  await shore();
  const sq2 = await spawn('squid', P.x + 0.5, P.y - 3, P.z - 5);
  await ev(() => { const g = window.__bf.game; if (!g.__fx) { g.__fx = []; const o = g.effect.bind(g); g.effect = (k, x, y, z, n) => { g.__fx.push([k, n]); return o(k, x, y, z, n); }; } g.__fx.length = 0; });
  const p0 = await mob(sq2);
  await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.hurt(2, g, 0, -1, true); }, [sq2]);
  const fx = await ev(() => window.__bf.game.__fx.filter((f) => f[0] === 'smoke').reduce((a, f) => a + f[1], 0));
  await fast(40);
  const p1 = await mob(sq2);
  check('squid: hurt, it blows an ink cloud and jets away', fx >= 10 && p1 && Math.hypot(p1.x - p0.x, p1.z - p0.z, p1.y - p0.y) > 2.5, { fx, p0, p1 });
  await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.invulnerable = 0; m.hurt(100, g, 0, 0, true); }, [sq2]);
  await fast(30);
  const drops = await itemsNear({ x: P.x + 0.5, z: P.z - 5 }, 14);
  check('squid: killed, it drops 1 to 3 Ink Sacs', drops.some((d) => /^ink_sacx[1-6]$/.test(d)), drops);
  await ev(() => window.__bf.game.giveItem({ id: 'ink_sac', count: 1 }));
  check('squid: picking up an Ink Sac earns Inky Fingers', await adv('ink'));
  // ---- squid stranded on land
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  const sq3 = await spawn('squid', P.x + 0.5, P.y + 0.1, P.z + 5);
  const r5 = await swimRun(sq3, 600);
  check('squid: stranded on dry land it flops about and does not survive', !r5.alive, r5);
  // ---- guardian
  await shore();
  await hurtPlayer();
  const gd = await spawn('guardian', P.x + 0.5, P.y - 6, P.z - 8);
  const seen = await ev(([id]) => {
    const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); let beam = false, maxCharge = 0, hp = g.player.health, hit = -1;
    for (let i = 0; i < 400; i++) { g.tick(); if (m.charge > 0) { m.render(1, g); if (m.beam.visible) beam = true; } maxCharge = Math.max(maxCharge, m.charge); if (g.player.health < hp) { hit = i; break; } }
    return { beam, maxCharge, hit, hp: g.player.health, charge: m.charge };
  }, [gd]);
  check('guardian: fixes its eye on you, grows a beam over about 3 seconds, then zaps you for 5', seen.beam && seen.maxCharge >= 60 && seen.hit > 40 && seen.hp === 15, seen);
  await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.tick(g); m.render(1, g); }, [gd]);
  const reset = await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return { charge: m.charge, vis: m.beam.visible }; }, [gd]);
  check('guardian: the beam resets after a shot', reset.charge <= 1, reset);
  await hurtPlayer();
  await ev(([id, P]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.tick = () => {}; m.setPos(P.x + 0.5, P.y - 1.4, P.z - 1.5); m.invulnerable = 0; m.hurt(2, g, 0, 1, true); }, [gd, P]);
  const thorn = await ev(() => window.__bf.game.player.health);
  check('guardian: hitting it up close pricks you for 2 (its spines)', thorn === 18, thorn);
  await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.invulnerable = 0; m.hurt(100, g, 0, 1, true); }, [gd]);
  check('guardian: defeating it earns Deep Sea Duty and counts', (await adv('guardian')) && (await stat('guardians_defeated')) === 1);
  // peaceful: no beam
  await hurtPlayer();
  const gd2 = await spawn('guardian', P.x + 0.5, P.y - 6, P.z - 8);
  await ev(() => { window.__bf.game.difficulty = 'peaceful'; });
  await fast(160);
  const pe = await ev(() => window.__bf.game.player.health);
  check('guardian: in Peaceful it is not there and you are not hurt', pe === 20 && !(await mobs('guardian')).length, pe);
  await ev(() => { window.__bf.game.difficulty = 'normal'; });
  void gd2;
  // ---- natural spawning rules (the search for water is pointed at the tank)
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  const spawnTry = async (rnd, cap, depth = 9) => {
    await withRandom(rnd);
    await ev(([P, cap, depth]) => { const g = window.__bf.game; g.entities.findWater = () => ({ x: P.x, z: P.z - 7, floor: P.y - 10, depth }); g.entities.trySpawnWater(g, cap); }, [P, cap, depth]);
    await realRandom();
  };
  await spawnTry(0.1, 8); await spawnTry(0.3, 8, 6); await spawnTry(0.38, 8);
  const sp = await ev(() => window.__bf.game.entities.list.filter((e) => e.mobType && ['squid', 'axolotl', 'guardian'].includes(e.mobType)).map((e) => ({ t: e.mobType, y: e.y, k: window.__bf.getBlock(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z)) })));
  check('spawning: a Squid, an Axolotl and a Guardian each appear in the water', ['squid', 'axolotl', 'guardian'].every((t) => sp.some((s) => s.t === t && /^water/.test(s.k))), sp);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  await spawnTry(0.38, 0);
  check('spawning: no Guardian appears when hostile creatures are off (Peaceful)', !(await mobs('guardian')).length);
  await ev(() => { delete window.__bf.game.entities.findWater; });
}

if (run('save')) {
  await newWorld('v213s', 'aqua-2', true);
  await ev(() => { const g = window.__bf.game; g.player.flying = false; });
  const P = await tank();
  const a = await spawn('axolotl', P.x + 0.5, P.y - 5, P.z - 6);
  await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setCoat('cyan'); m.persistent = true; }, [a]);
  const s = await spawn('squid', P.x + 0.5, P.y - 5, P.z - 8);
  await ev(([id]) => { window.__bf.game.entities.list.find((e) => e.id === id).persistent = true; }, [s]);
  const h = await spawn('hootlet', P.x + 4.5, P.y, P.z + 3.5);
  await ev(([id]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.tame(); }, [h]);
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  const st = await ev(() => { const l = window.__bf.game.entities.list; const ax = l.find((e) => e.mobType === 'axolotl'), sq = l.find((e) => e.mobType === 'squid'), ho = l.find((e) => e.mobType === 'hootlet'); return { coat: ax && ax.coat, sq: !!sq, tamed: ho && ho.tamed }; });
  check('save: an Axolotl keeps its colour and a Squid is kept when the world is saved', st.coat === 'cyan' && st.sq, st);
  check('save: a tamed Hootlet is still tamed after a save (this was broken before 2.13)', st.tamed === true, st);
}

if (run('shots')) {
  await newWorld('v213p', 'aqua-3', true);
  const P = await pad(10);
  await ev(() => { const g = window.__bf.game; g.player.flying = true; g.player.gameMode = 'creative'; g.dayNight.time = 5000; g.inventory.slots[8] = null; g.inventory.selected = 8; g.inventory.changed(); g.reach = () => 0.0001; window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: true }); });
  const YAW = Number(process.env.YAW ?? 0);
  const row = async (types, dz, lift = 0, scale = 1.6) => {
    for (let i = 0; i < types.length; i++) {
      await ev(([t, x, y, z, yaw]) => { const g = window.__bf.game; const m = g.entities.spawnMob(t[0], x, y, z, g); if (t[1]) m.setCoat(t[1]); m.tick = () => {}; m.yaw = m.prevYaw = yaw; return m.id; }, [types[i], P.x + 0.5 + (i - (types.length - 1) / 2) * scale, P.y + lift, P.z + dz, YAW]);
    }
  };
  const clear = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  const shot = async (name, pitch = -0.12, dist = 2.6, h = 1.2) => { await tp(P.x + 0.5, P.y + h, P.z + dist, 0, pitch); await wait(700); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
  await row([['axolotl', 'pink'], ['axolotl', 'brown'], ['axolotl', 'gold'], ['axolotl', 'cyan'], ['axolotl', 'blue']], -1, 0, 1.0);
  await shot('aq_axolotls', -0.3);
  await clear();
  await row([['squid'], ['squid']], -1, 0.3, 1.5);
  await shot('aq_squid', -0.3, 2.0, 0.3);
  await clear();
  await row([['guardian']], -1, 0.3, 1.8);
  await shot('aq_guardian', -0.34, 2.0, 0.3);
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
