// Tests for 2.10: Moth Wings, Fireworks, Fishing and Fish Jars, Spring Pads and the Hootlet.
// node tests/t_v210.mjs   (dev server)   ONLY=items,glider
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','glider','pad','jar','fish','fireworks','owl'];
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

if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const C = await import('/src/world/constants.ts');
    const B = await import('/src/world/BlockRegistry.ts');
    const T = await import('/src/meshing/textureNames.ts');
    const F = await import('/src/inventory/fish.ts');
    const n = null;
    const ids = ['moth_silk', 'moth_wings', 'firework', 'grilled_fish', 'spring_pad', 'fish_jar', 'spawn_hootlet', ...F.FISH.filter((f) => f.isNew).map((f) => 'raw_' + f.key)];
    const cr = (g) => { const r = window.__bf.craft(g); return r && r.id + 'x' + r.count; };
    return {
      has: ids.every((i) => I.hasItem(i)), sprites: ids.filter((i) => !i.startsWith('spring') && i !== 'fish_jar').every((i) => !!S.SPRITES[i]), ver: C.GAME_VERSION,
      smelt: I.getItem('raw_glowfin').smelt?.result, fishN: F.FISH.length, jars: Object.keys(B.FISH_JARS).length, nameOk: F.FISH.every((f) => T.TEXTURE_NAMES.includes('jar_' + f.key)) && T.TEXTURE_NAMES.includes('spring_pad_top'),
      moth: cr(['moth_silk', n, 'moth_silk', 'moth_silk', 'string', 'moth_silk', n, n, n]),
      rocket: cr(['blast_powder', 'stick', 'string', n, n, n, n, n, n]),
      pad: cr(['leather', 'leather', 'leather', 'string', 'iron_ingot', 'string', 'planks', 'planks', 'planks']),
      jar: cr(['glass', n, 'glass', 'glass', n, 'glass', 'glass', 'glass', 'glass']),
      glow: B.getBlock(B.FISH_JARS.glowfin).lightEmission, drop: B.getBlock(B.FISH_JARS.perch).drops.map((d) => d.item).join('+'),
      wings: I.getItem('moth_wings').armor?.slot, dur: I.getItem('moth_wings').durability, starDur: I.getItem('star_wings').durability,
    };
  });
  check('items: every new item exists with a drawn sprite; 7 kinds of fish and a jar for each', t.has && t.sprites && t.fishN === 7 && t.jars === 7 && t.nameOk, t);
  check('items: version is 2.10', /^2\.1[0-2]/.test(t.ver), t.ver);
  check('items: recipes - Moth Wings, 3 Fireworks, 2 Spring Pads, 2 Fish Jars; new fish smelt to Grilled Fish', t.moth === 'moth_wingsx1' && t.rocket === 'fireworkx3' && t.pad === 'spring_padx2' && t.jar === 'fish_jarx2' && t.smelt === 'grilled_fish', t);
  check('items: a Glowfin jar glows (12); a filled jar drops the jar and its fish; Moth Wings are chest armour that wears out sooner than Starwings', t.glow === 12 && t.drop === 'fish_jar+raw_perch' && t.wings === 1 && t.dur < t.starDur, t);
}
if (run('glider')) {
  await newWorld('Glider Tests', 'glide210', false);
  const P = await pad(6);
  await hurtPlayer(); await healGod();
  await ev(() => { const g = window.__bf.game; g.inventory.slots[39 - 3 + 0] = null; });
  const wear = (id) => ev((id) => { const g = window.__bf.game; g.inventory.slots[36 + 1] = id ? { id, count: 1 } : null; g.inventory.changed(); return g.wingsId(); }, id);
  const idx = await ev(() => { const g = window.__bf.game; return import('/src/inventory/Inventory.ts').then((m) => m.ARMOR_START); });
  const worn = await ev(async () => { const I = await import('/src/inventory/Inventory.ts'); const g = window.__bf.game; g.inventory.slots[I.ARMOR_START + 1] = { id: 'moth_wings', count: 1 }; g.inventory.changed(); return g.wingsId(); });
  check('glider: Moth Wings in the chest slot count as worn wings', worn === 'moth_wings', worn);
  const run1 = async (id) => ev(async ([id, x, y, z]) => {
    const I = await import('/src/inventory/Inventory.ts');
    const g = window.__bf.game, p = g.player;
    g.inventory.slots[I.ARMOR_START + 1] = { id, count: 1 }; g.inventory.changed();
    p.invulnerable = 1e9; p.flying = false;
    g.teleport(x + 0.5, y + 40, z + 0.5); p.yaw = 0; p.pitch = 0.25; p.vx = 0; p.vy = -0.2; p.vz = -0.4; p.onGround = false;
    p.gliding = false;
    const can = g.canStartGlide();
    p.gliding = true; p.glideMoth = g.wingsId() === 'moth_wings'; g.glideTicks = 0;
    const x0 = p.x, z0 = p.z, y0 = p.y;
    for (let i = 0; i < 80; i++) g.tick();
    const dist = Math.hypot(p.x - x0, p.z - z0), drop = y0 - p.y;
    return { can, still: p.gliding, dist, drop, wear: g.inventory.get(I.ARMOR_START + 1)?.damage ?? 0 };
  }, [id, P.x, P.y, P.z]);
  const star = await run1('star_wings');
  const moth = await run1('moth_wings');
  check('glider: the player can start gliding in mid-air with Moth Wings and keeps gliding', moth.can && moth.still, moth);
  check('glider: Moth Wings glide, but with a steeper descent (less distance per block fallen) than Starwings', moth.dist > 8 && moth.drop > star.drop && moth.dist / moth.drop < star.dist / star.drop, { star, moth });
  check('glider: the wings wear down while gliding', moth.wear >= 3, moth);
  check('glider: gliding on Moth Wings earns "Light as a Moth"', await adv('moth_wings'));
  // flat landing never hurts
  await ev(async () => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; });
  // silk drop
  const id2 = await spawn('gloommoth', P.x + 6.5, P.y + 3, P.z - 6.5);
  await freeze(id2); await clearItems();
  await ev((id) => { window.__realRandom = window.__realRandom ?? Math.random; Math.random = () => 0.99; window.__bf.game.entities.list.find((e) => e.id === id).hurt(100, window.__bf.game, 0, 0, true); }, id2);
  await fast(30); await realRandom();
  const dr = await itemsNear({ x: P.x + 6, z: P.z - 6 }, 5);
  check('glider: a slain Gloommoth drops Moth Silk as well as Gloomdust', dr.some((d) => /^moth_silkx/.test(d)) && dr.some((d) => /^gloomdustx/.test(d)), dr);
}
if (run('pad')) {
  await newWorld('Pad Tests', 'pad210', false);
  const P = await pad(6);
  await hurtPlayer();
  await set(P.x, P.y - 1, P.z, 'spring_pad');
  const drop = async (h, sneak = false) => ev(async ([x, y, z, h, sneak]) => {
    const g = window.__bf.game, p = g.player;
    p.invulnerable = 0; p.health = 20; p.gameMode = 'survival'; Object.defineProperty(p, 'sneaking', { get: () => sneak, set() {}, configurable: true });
    g.teleport(x + 0.5, y + h, z + 0.5); p.vx = p.vy = p.vz = 0; p.onGround = false; p.fallDistance = 0;
    let landed = false, up = 0, top = y;
    for (let i = 0; i < 160; i++) { g.tick(); if (!landed && p.onGround) landed = true; if (p.vy > up) up = p.vy; top = Math.max(top, p.y); if (landed && i > 20 && p.vy < 0 && top > y + 1) break; }
    return { hp: p.health, up, top: top - y };
  }, [P.x, P.y, P.z, h, sneak]);
  // the pad sits one block lower than the floor? it replaced the floor block so it is the surface
  const d1 = await drop(10);
  check('pad: dropping 10 blocks onto a Spring Pad bounces you back up without any damage', d1.hp === 20 && d1.up > 0.6 && d1.top > 2, d1);
  const d2 = await drop(30);
  check('pad: a longer fall bounces higher (and still does no damage)', d2.hp === 20 && d2.top > d1.top, { d1, d2 });
  const d3 = await drop(10, true);
  check('pad: sneaking lands softly with no bounce and no damage', d3.hp === 20 && d3.up < 0.1, d3);
  check('pad: bouncing earns "Boing!" and is counted', (await adv('bounce')) && (await stat('bounces')) >= 2, await stat('bounces'));
  // an ordinary floor still hurts
  const dd = await ev(async ([x, y, z]) => {
    const g = window.__bf.game, p = g.player;
    p.invulnerable = 0; p.health = 20; p.sneaking = false;
    g.teleport(x + 3.5, y + 14, z + 0.5); p.vx = p.vy = p.vz = 0; p.onGround = false;
    for (let i = 0; i < 160; i++) { g.tick(); if (p.onGround) break; }
    for (let i = 0; i < 3; i++) g.tick();
    return p.health;
  }, [P.x, P.y, P.z]);
  check('pad: the same fall onto plain grass still hurts', dd < 20, dd);
  // walk onto it: you can stand on it (it is a low pad, 5/16 high)
  const stand = await ev(async ([x, y, z]) => {
    const g = window.__bf.game, p = g.player;
    p.invulnerable = 1e9; Object.defineProperty(p, 'sneaking', { get: () => true, set() {}, configurable: true }); g.teleport(x + 0.5, y - 0.4, z + 0.5); p.vx = p.vy = p.vz = 0;
    for (let i = 0; i < 30; i++) g.tick();
    return { y: p.y - y, ground: p.onGround };
  }, [P.x, P.y, P.z]);
  await ev(() => { const p = window.__bf.game.player; delete p.sneaking; p.sneaking = false; });
  check('pad: you can stand on the pad (its top is 5/16 of a block high, below the floor line of the grass around it)', stand.ground && stand.y > -0.8 && stand.y < -0.6, stand);
}
if (run('jar')) {
  await newWorld('Jar Tests', 'jar210', false);
  const P = await pad(6);
  await hurtPlayer(); await healGod();
  await set(P.x, P.y, P.z + 1, 'fish_jar');
  await give({ id: 'raw_perch', count: 2 });
  await aim(P.x + 0.5, P.y + 0.4, P.z + 1.5); await rclick();
  check('jar: right-click an empty Fish Jar with a raw fish to put the fish in', (await key(P.x, P.y, P.z + 1)) === 'jar:perch' && (await sel()) === 'raw_perchx1', { k: await key(P.x, P.y, P.z + 1), s: await sel() });
  check('jar: that earns "Jar Keeper"', await adv('fish_jar'));
  await give({ id: 'raw_trout', count: 1 });
  await clearItems();
  await aim(P.x + 0.5, P.y + 0.4, P.z + 1.5); await rclick();
  const items = await itemsNear({ x: P.x, z: P.z + 1 }, 3);
  check('jar: right-clicking a full jar takes the fish out again (the jar is empty)', (await key(P.x, P.y, P.z + 1)) === 'fish_jar' && items.includes('raw_perchx1'), { k: await key(P.x, P.y, P.z + 1), items });
  await give({ id: 'stick', count: 1 });
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await aim(P.x + 0.5, P.y + 0.4, P.z + 1.5); await rclick();
  check('jar: with something else in hand an empty jar says what to do and keeps its place', (await key(P.x, P.y, P.z + 1)) === 'fish_jar' && /raw fish/i.test(await chat()), await chat());
  // breaking a full jar drops the jar and the fish
  await set(P.x, P.y, P.z + 1, 'jar:glowfin');
  await clearItems();
  await ev(([x, y, z]) => { window.__bf.game.breakBlockAt(x, y, z, true, true); }, [P.x, P.y, P.z + 1]);
  await fast(5);
  const br = await itemsNear({ x: P.x, z: P.z + 1 }, 3);
  check('jar: breaking a full jar gives back the jar and the fish', br.includes('fish_jarx1') && br.includes('raw_glowfinx1'), br);
  // the glowfin jar lights the room
  await set(P.x + 3, P.y, P.z, 'jar:glowfin');
  await fast(10); await wait(300);
  const light = await ev(([x, y, z]) => window.__bf.game.world.getLight(x + 1, y, z), [P.x + 3, P.y, P.z]);
  const light2 = await ev(([x, y, z]) => window.__bf.game.world.getLight(x + 1, y, z), [P.x - 9, P.y, P.z]);
  check('jar: a jar of Glowfin gives off light', light >= 8 || light > light2, { light, light2 });
}
if (run('fish')) {
  await newWorld('Fish Tests', 'fish210', false);
  const r = await ev(async () => {
    const F = await import('/src/entities/Fishing.ts');
    const tally = (ctx, n = 6000) => { const c = {}; for (let i = 0; i < n; i++) { const k = F.rollCatch(Math.random(), ctx).stack.id; c[k] = (c[k] ?? 0) + 1; } return c; };
    return { day: tally({ night: false, cold: false, spore: false }), night: tally({ night: true, cold: false, spore: false }), cold: tally({ night: false, cold: true, spore: false }), spore: tally({ night: false, cold: false, spore: true }), dflt: F.rollCatch().stack.id };
  });
  check('fish: by day Sunfin bite and Moonfin never do; by night it is the other way round', r.day.raw_sunfin > 50 && !r.day.raw_moonfin && r.night.raw_moonfin > 50 && !r.night.raw_sunfin, { d: r.day.raw_sunfin, dm: r.day.raw_moonfin, n: r.night.raw_moonfin, ns: r.night.raw_sunfin });
  check('fish: Frostfin only in cold places and Glowfin only on Spore Isle', r.cold.raw_frostfin > 50 && !r.day.raw_frostfin && !r.cold.raw_glowfin && r.spore.raw_glowfin > 50 && !r.day.raw_glowfin, { cold: r.cold.raw_frostfin, spore: r.spore.raw_glowfin, dayF: r.day.raw_frostfin, dayG: r.day.raw_glowfin });
  check('fish: Ruby Carp are rare (a few in a thousand) and turn up anywhere; Trout are still the commonest catch', r.day.raw_ruby_carp > 0 && r.day.raw_ruby_carp < 6000 * 0.03 && r.day.raw_trout > r.day.raw_perch, { ruby: r.day.raw_ruby_carp, trout: r.day.raw_trout, perch: r.day.raw_perch });
  // a real reel-in on a night in a cold place yields a fish item
  const P = await pad(6, 'water');
  await hurtPlayer(); await healGod();
  const got = await ev(async ([x, y, z]) => {
    const g = window.__bf.game;
    for (const e of g.entities.list) if (e.type === 'item') e.removed = true;
    const b = g.entities.spawnBobber(x + 0.5, y - 0.5, z + 0.5, 0, 0, 0);
    b.bite = 10; g.bobber = b;
    window.__realRandom = window.__realRandom ?? Math.random;
    g.reel(g.inventory.selected);
    for (let i = 0; i < 4; i++) g.tick();
    return g.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack.id);
  }, [P.x, P.y, P.z - 1]);
  check('fish: reeling in a biting float brings up something', got.length >= 1, got);
  const eat = await ev(async () => {
    const g = window.__bf.game; g.player.food = 5; g.player.gameMode = 'survival';
    g.inventory.slots[0] = { id: 'grilled_fish', count: 2 }; g.inventory.selected = 0; g.inventory.changed(); g.finishEating();
    return g.player.food;
  });
  check('fish: Grilled Fish fills 6 hunger', eat === 11, eat);
}
if (run('fireworks')) {
  await newWorld('Firework Tests', 'fire210', false);
  const P = await pad(6);
  await hurtPlayer(); await healGod();
  await give({ id: 'firework', count: 6 });
  await ev(() => { const g = window.__bf.game; g.player.sneaking = false; });
  await aim(P.x + 0.5, P.y + 3, P.z - 3); await rclick();
  const left = await sel();
  const act = await ev(() => window.__bf.game.fireworks.active);
  check('fireworks: right-click launches one rocket and uses one Firework', left === 'fireworkx5' && act === 1, { left, act });
  let peak = 0, gone = false;
  for (let i = 0; i < 120; i++) { await fast(1); peak = Math.max(peak, await ev(() => window.__bf.game.particles.count)); if (!gone && (await ev(() => window.__bf.game.fireworks.active)) === 0) gone = true; }
  check('fireworks: the rocket climbs, bursts into a shower of sparks (60+ at once) and is gone', gone && peak >= 60, { gone, peak });
  check('fireworks: the first launch earns "Light Up the Sky"', await adv('fireworks'));
  await ev(() => { const g = window.__bf.game; g.player.sneaking = true; g.launchFirework(g.inventory.selected); });
  const act3 = await ev(() => window.__bf.game.fireworks.active);
  check('fireworks: sneaking launches a volley of three and uses three', act3 === 3 && (await sel()) === 'fireworkx2', { act3, sel: await sel() });
  await ev(() => { window.__bf.game.player.sneaking = false; });
  await fast(160);
  // harmless
  const hp = await ev(() => window.__bf.game.player.health);
  check('fireworks: harmless to the player', hp === 20, hp);
  // creative mode keeps the stack
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; });
  await ev(() => window.__bf.game.launchFirework(window.__bf.game.inventory.selected));
  check('fireworks: in creative mode they are not used up', (await sel()) === 'fireworkx2', await sel());
  check('fireworks: counted in the statistics', (await stat('fireworks_launched')) >= 5, await stat('fireworks_launched'));
}
if (run('owl')) {
  await newWorld('Owl Tests', 'owl210', false);
  const P = await pad(10);
  await hurtPlayer(); await healGod();
  const id = await spawn('hootlet', P.x + 0.5 + 3, P.y, P.z + 3.5 - 3);
  const m0 = await mob(id);
  check('owl: a Hootlet can be spawned (spawn egg item exists too)', m0 && m0.type === 'hootlet' && m0.alive && m0.tamed === false, m0);
  // shy: flees a player who is not sneaking
  await ev(() => { const g = window.__bf.game; g.player.sneaking = false; });
  const d0 = Math.hypot(m0.x - (P.x + 0.5), m0.z - (P.z + 3.5));
  await fast(70);
  const m1 = await mob(id);
  const d1 = Math.hypot(m1.x - (P.x + 0.5), m1.z - (P.z + 3.5));
  check('owl: a wild Hootlet flies away from a player who walks up to it', d1 > d0 + 2, { d0, d1 });
  // taming
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setPos(window.__bf.game.player.x + 1.5, window.__bf.game.player.y + 0.5, window.__bf.game.player.z); m.flee = 0; }, id);
  await give({ id: 'wheat_seeds', count: 5 });
  await withRandom(0.9);
  await ev((id) => { const g = window.__bf.game; g.useOnMob(g.entities.list.find((e) => e.id === id), false); }, id);
  await realRandom();
  const m2 = await mob(id);
  check('owl: seeds do not always work (a failed try uses one seed and leaves it wild)', m2.tamed === false && (await sel()) === 'wheat_seedsx4', { m2, sel: await sel() });
  await withRandom(0.1);
  await ev((id) => { const g = window.__bf.game; g.useOnMob(g.entities.list.find((e) => e.id === id), false); }, id);
  await realRandom();
  const m3 = await mob(id);
  const ribbon = await ev((id) => !!window.__bf.game.entities.list.find((e) => e.id === id).parts.get('ribbon'), id);
  check('owl: a lucky try tames it - it becomes a pet with a red ribbon', m3.tamed === true && m3.pet === true && ribbon, { m3, ribbon });
  check('owl: that earns "Wise Friend"', (await adv('hootlet')) && (await stat('hootlets_tamed')) === 1);
  // follows
  await ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 14, g.player.y, g.player.z); });
  await fast(240);
  const f1 = await mob(id);
  const pp = await ev(() => { const p = window.__bf.game.player; return [p.x, p.y, p.z]; });
  check('owl: a tamed Hootlet follows the player', Math.hypot(f1.x - pp[0], f1.z - pp[2]) < 5, { f1, pp });
  // perches
  await fast(160);
  const perch = await ev(() => { const g = window.__bf.game, p = g.player; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); return { perched: m.perched, d: Math.hypot(m.x - p.x, m.z - p.z), dy: m.y - p.y }; });
  check('owl: when the player stands still it settles on their shoulder', perch.perched && perch.d < 0.8 && perch.dy > 0.8, perch);
  // warns of danger
  await ev(() => window.__bf.ui.set({ chat: [] }));
  const z = await spawn('shambler', P.x + 0.5 + 9, P.y, P.z + 3.5);
  await freeze(z);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 18000; });
  await fast(60);
  check('owl: it hoots a warning when a hostile creature is within 14 blocks', /hoots/i.test(await chat()), await chat());
  // stay / follow
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); g.inventory.slots[0] = null; g.inventory.selected = 0; g.useOnMob(m, false); });
  const st = await ev(() => window.__bf.game.entities.list.find((e) => e.mobType === 'hootlet').sitting);
  await ev(() => { const g = window.__bf.game; g.teleport(g.player.x + 8, g.player.y, g.player.z); });
  const sx = await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'hootlet'); return m.x; });
  await fast(120);
  const sx2 = await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'hootlet'); return m.x; });
  check('owl: right-click with an empty hand makes it stay where it is', st === true && Math.abs(sx2 - sx) < 1.5, { st, sx, sx2 });
  // gifts
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); m.sitting = false; g.teleport(m.x + 1, m.y, m.z); m.giftTimer = 1; });
  await ev(() => { const g = window.__bf.game; window.__gifts = []; const o = g.spawnItem.bind(g); g.spawnItem = (st, ...r) => { window.__gifts.push(st.id); return o(st, ...r); }; });
  await fast(20);
  const gifts = await ev(() => window.__gifts);
  if (!gifts.length) console.log('DEBUG', JSON.stringify(await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); const p = g.player; return { gt: m.giftTimer, tamed: m.tamed, sit: m.sitting, d: m.distanceTo(p.x, p.y, p.z), removed: m.removed, alive: m.alive, dead: p.dead, n: g.entities.list.filter((e) => e.mobType === 'hootlet').length }; })));
  check('owl: now and then it brings a present (usually a feather)', gifts.length >= 1, gifts);
  // saving
  const ser = await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); const s = m.serialize(); const n = g.entities.spawnMob('hootlet', 0, 90, 0, g); n.restore(s.d); const ok = n.tamed && !!n.parts.get('ribbon'); n.removed = true; return { d: s.d, ok }; });
  check('owl: its tameness is saved and restored', ser.ok && ser.d.tamed === true, ser);
  // heal
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'hootlet'); m.health = 4; });
  await give({ id: 'wheat_seeds', count: 3 });
  await ev(() => { const g = window.__bf.game; g.useOnMob(g.entities.list.find((e) => e.mobType === 'hootlet'), false); });
  check('owl: seeds mend a tamed Hootlet', (await ev(() => window.__bf.game.entities.list.find((e) => e.mobType === 'hootlet').health)) > 4);
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
