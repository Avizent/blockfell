// Tests for 2.9: potatoes, milk, the Powderbug, the Gloommoth and Sporecap colours.
// node tests/t_v281.mjs   (dev server)   ONLY=items,compass
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','potato','milk','bug','moth','caps','fall'];
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
    const P = await import('/src/inventory/potions.ts');
    const B = await import('/src/world/BlockRegistry.ts');
    const M = await import('/src/entities/Mob.ts');
    const n = null;
    const ids = ['potato', 'baked_potato', 'milk_bucket', 'blast_powder', 'gloomdust', 'spawn_powderbug', 'spawn_gloommoth'];
    return {
      has: ids.every((i) => I.hasItem(i)), sprites: ids.every((i) => !!S.SPRITES[i]), ver: C.GAME_VERSION,
      smelt: I.getItem('potato').smelt?.result, plant: I.getItem('potato').block === B.POTATOES[0], stages: B.POTATOES.length, milkStack: I.getItem('milk_bucket').maxStack,
      brew: P.brewResult('water_bottle', 'gloomdust') + '/' + P.brewResult('water_bottle', 'glowcap') + '/' + P.isIngredient('gloomdust'),
      popper: (() => { const r = window.__bf.craft(['string', 'blast_powder', n, n, n, n, n, n, n]); return r && r.id + 'x' + r.count; })(),
      cs: B.cropStages(B.POTATOES[2])?.length, specs: !!M.MOB_SPECS.powderbug && !!M.MOB_SPECS.gloommoth,
    };
  });
  check('items: potato, baked potato, milk bucket, Blast Powder, Gloomdust and both spawn eggs exist with drawn sprites', t.has && t.sprites && t.milkStack === 1, t);
  check('items: version is 2.9.0; a potato plants a 4-stage crop and smelts to a baked potato', /^2\.(9|1[0-2])/.test(t.ver) && t.smelt === 'baked_potato' && t.plant && t.stages === 4 && t.cs === 4, t);
  check('items: Gloomdust brews Featherfall and Glowcap still brews Night Eyes; Blast Powder and string make Party Poppers', t.brew === 'potion_featherfall/potion_night_eyes/true' && t.popper === 'party_popperx2', t);
}
if (run('potato')) {
  await newWorld('Spud Tests', 'spuds29', false);
  const P = await pad(6);
  await hurtPlayer(); await healGod();
  await ev(([x, y, z]) => { const bf = window.__bf; bf.setBlock(x, y - 1, z, 'farmland_moist'); }, [P.x, P.y, P.z + 1]);
  await give({ id: 'potato', count: 3 });
  await aim(P.x + 0.5, P.y - 0.5, P.z + 1 + 0.5);
  await rclick();
  const planted = await key(P.x, P.y, P.z + 1);
  check('potato: right-clicking farmland with a potato plants stage 0 and uses one up', /^potatoes/.test(String(planted)) && (await sel()) === 'potatox2', { planted, sel: await sel() });
  await set(P.x, P.y, P.z + 1, 'potatoes:3');
  const stage3 = await key(P.x, P.y, P.z + 1);
  await clearItems();
  await ev(([x, y, z]) => { window.__bf.game.breakBlockAt(x, y, z, true, true); }, [P.x, P.y, P.z + 1]);
  await fast(5);
  const left = await key(P.x, P.y, P.z + 1);
  const drops = await itemsNear({ x: P.x, z: P.z + 1 }, 3);
  check('potato: a grown crop is breakable and yields 2-4 potatoes', stage3 !== left && drops.some((d) => /^potatox[2-4]$/.test(d)), { stage3, left, drops });
  // grows by random ticks
  await set(P.x, P.y, P.z + 1, 'potatoes:0');
  let grown = false;
  for (let i = 0; i < 400 && !grown; i++) {
    await ev(([x, y, z]) => { const g = window.__bf.game; for (let k = 0; k < 50; k++) { const id = g.world.getBlock(x, y, z); g.randomTick(x, y, z, id); } }, [P.x, P.y, P.z + 1]);
    grown = String(await key(P.x, P.y, P.z + 1)) !== 'potatoes:0';
  }
  check('potato: a seedling grows through random ticks', grown, { now: await key(P.x, P.y, P.z + 1) });
  // eating
  await ev(() => { const g = window.__bf.game; g.player.food = 5; g.player.gameMode = 'survival'; });
  await give({ id: 'baked_potato', count: 2 });
  await ev(() => window.__bf.game.finishEating());
  const food = await ev(() => window.__bf.game.player.food);
  check('potato: eating a baked potato fills 5 hunger and uses it up', food === 10 && (await sel()) === 'baked_potatox1', { food, sel: await sel() });
}
if (run('milk')) {
  await newWorld('Milk Tests', 'milk29', false);
  const P = await pad(6);
  await hurtPlayer(); await healGod();
  const cow = await cowAt(P, -2);
  await give({ id: 'bucket', count: 2 });
  await aimMob(cow); await rclick();
  const got = await ev(() => { const g = window.__bf.game; return g.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join(','); });
  check('milk: a bucket on a cow gives a Milk Bucket (one bucket of two used)', /milk_bucketx1/.test(got) && /bucketx1/.test(got), got);
  const calf = await cowAt(P, 0);
  await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).makeBaby(), calf);
  await give({ id: 'bucket', count: 1 }, 2);
  await aimMob(calf); await rclick();
  check('milk: a calf cannot be milked', (await inv(2)) === 'bucketx1', await inv(2));
  await give({ id: 'milk_bucket', count: 1 }, 3);
  await ev(() => { const g = window.__bf.game; g.potions.add('might', 3000); g.potions.add('swiftness', 3000); });
  const before = await ev(() => window.__bf.game.potions.any);
  await ev(() => window.__bf.game.finishDrinking());
  const after = await ev(() => window.__bf.game.potions.any);
  check('milk: drinking a Milk Bucket clears every potion effect and gives the empty bucket back', before && !after && (await inv(3)) === 'bucketx1', { before, after, slot: await inv(3) });
  await give({ id: 'milk_bucket', count: 1 }, 3);
  await aim(P.x + 0.5, P.y - 0.5, P.z + 0.5); await rclick();
  check('milk: a Milk Bucket cannot be poured out', (await inv(3)) === 'milk_bucketx1', await inv(3));
}
if (run('bug')) {
  await newWorld('Bug Tests', 'bug29', false);
  const P = await pad(8);
  await hurtPlayer(); await healGod();
  // a little hut of planks and stone, a chest, soft dirt and a cow nearby
  await ev(([x, y, z]) => {
    const bf = window.__bf;
    for (const [dx, dy, dz, k] of [[3, 0, 0, 'planks'], [3, 1, 0, 'planks'], [4, 0, 0, 'stone'], [3, 0, 1, 'chest'], [2, 0, 2, 'dirt'], [1, 0, 2, 'dirt'], [2, 0, -2, 'sand'], [2, 0, 3, 'gravel']]) bf.setBlock(x + dx, y + dy, z + dz, k);
  }, [P.x, P.y, P.z + 3]);
  const cow = await cowAt(P, 1);
  const hp0 = await ev(() => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; return g.player.health; });
  const id = await spawn('powderbug', P.x + 0.5, P.y, P.z + 3.5 - 4);
  await ev(() => { const g = window.__bf.game; g.rules.doMobSpawning = false; });
  let fused = false, gone = false;
  for (let i = 0; i < 400 && !gone; i++) {
    await fast(1);
    const m = await mob(id);
    if (!m || !m.alive) gone = true;
    if (!fused) fused = await ev((id) => (window.__bf.game.entities.list.find((e) => e.id === id)?.fuse ?? 0) > 0, id);
  }
  const hp1 = await ev(() => window.__bf.game.player.health);
  check('bug: a Powderbug closes in, hisses (fuse), then pops and is gone', fused && gone, { fused, gone });
  check('bug: the blast hurts the player', hp1 < hp0, { hp0, hp1 });
  const cw = await mob(cow);
  check('bug: the blast hurts nearby creatures', !cw || !cw.alive || cw.h < 10, cw);
  const kept = await ev(([x, y, z]) => { const bf = window.__bf; return [[3, 0, 0], [3, 1, 0], [4, 0, 0], [3, 0, 1]].map(([dx, dy, dz]) => bf.getBlock(x + dx, y + dy, z + dz)); }, [P.x, P.y, P.z + 3]);
  check('bug: planks, stone and a chest beside the blast are untouched', kept.every((k) => k && k !== 'air') && kept[0] === 'planks' && kept[2] === 'stone', kept);
  // soft blocks: blast directly at a patch
  await ev(([x, y, z]) => { const bf = window.__bf; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) bf.setBlock(x + dx, y, z + dz, 'dirt'); bf.setBlock(x, y, z, 'planks'); bf.setBlock(x + 1, y, z, 'stone_bricks'); }, [P.x - 5, P.y, P.z - 5]);
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.invulnerable = 1e9; window.__realRandom = window.__realRandom ?? Math.random; Math.random = () => 0.1; g.powderBlast(x + 0.5, y + 0.5, z + 0.5, 3, { id: -1 }); }, [P.x - 5, P.y, P.z - 5]);
  await realRandom();
  const after = await ev(([x, y, z]) => { const bf = window.__bf; return { dirtGone: [bf.getBlock(x - 1, y, z), bf.getBlock(x, y, z - 1), bf.getBlock(x, y, z + 1), bf.getBlock(x - 2, y, z)], planks: bf.getBlock(x, y, z), brick: bf.getBlock(x + 1, y, z) }; }, [P.x - 5, P.y, P.z - 5]);
  check('bug: soft blocks (dirt) inside the blast are broken but planks and stone bricks in the middle of it are not', after.dirtGone.every((k) => k === 'air') && after.planks === 'planks' && after.brick === 'stone_bricks', after);
  // defuse: kill it before the fuse runs out
  await hurtPlayer(); await healGod();
  const id2 = await spawn('powderbug', P.x + 0.5, P.y, P.z + 3.5 - 1.5);
  await fast(2);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.hurt(100, window.__bf.game, 0, 1, true); }, id2);
  await fast(40);
  const hp2 = await ev(() => window.__bf.game.player.health);
  const d2 = await mob(id2);
  check('bug: a Powderbug killed before it pops does no damage (it can be defused)', hp2 === 20 && (!d2 || !d2.alive), { hp2, d2 });
  // never bites
  const id3 = await spawn('powderbug', P.x + 0.5, P.y, P.z + 3.5 - 1);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.fuse = 0; }, id3);
  await ev(() => { window.__bf.game.player.creative = false; });
  // peaceful removes it
  await ev(() => { const g = window.__bf.game; g.difficulty = 'peaceful'; });
  await fast(3);
  const d3 = await mob(id3);
  check('bug: peaceful difficulty removes Powderbugs', !d3 || d3.removed, d3);
  await ev(() => { window.__bf.game.difficulty = 'normal'; });
  // drops
  const id4 = await spawn('powderbug', P.x + 6.5, P.y, P.z - 6.5);
  await freeze(id4);
  await clearItems();
  await ev((id) => { window.__realRandom = window.__realRandom ?? Math.random; Math.random = () => 0.99; const m = window.__bf.game.entities.list.find((e) => e.id === id); delete m.tick; m.hurt(100, window.__bf.game, 0, 0, true); }, id4);
  await fast(30); await realRandom();
  const dr = await itemsNear({ x: P.x + 6, z: P.z - 6 }, 4);
  check('bug: a slain Powderbug drops Blast Powder', dr.some((d) => /^blast_powder/.test(d)), dr);
}
if (run('moth')) {
  await newWorld('Moth Tests', 'moth29', false);
  const P = await pad(10);
  await hurtPlayer(); await healGod();
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 18000; g.player.invulnerable = 0; g.player.health = 20; });
  const id = await spawn('gloommoth', P.x + 0.5, P.y + 6, P.z + 3.5 - 7);
  let hit = false, minDist = 99, maxY = -99, minY = 99;
  for (let i = 0; i < 700; i++) {
    await fast(1);
    const m = await mob(id);
    if (!m) break;
    const hp = await ev(() => window.__bf.game.player.health);
    if (hp < 20) { hit = true; break; }
    const pp = await ev(() => { const p = window.__bf.game.player; return [p.x, p.y, p.z]; });
    minDist = Math.min(minDist, Math.hypot(m.x - pp[0], m.z - pp[2])); maxY = Math.max(maxY, m.y - pp[1]); minY = Math.min(minY, m.y - pp[1]);
    await ev(() => { window.__bf.game.player.invulnerable = 0; });
  }
  check('moth: a Gloommoth circles above the player, swoops down and bites', hit, { hit, minDist, maxY, minY });
  check('moth: it flew (circled high above, then dipped to the player)', maxY > 3 && minY < 3, { maxY, minY });
  // drops
  const id2 = await spawn('gloommoth', P.x + 6.5, P.y + 3, P.z - 6.5);
  await freeze(id2); await clearItems();
  await ev((id) => { window.__realRandom = window.__realRandom ?? Math.random; Math.random = () => 0.99; window.__bf.game.entities.list.find((e) => e.id === id).hurt(100, window.__bf.game, 0, 0, true); }, id2);
  await fast(30); await realRandom();
  const dr = await itemsNear({ x: P.x + 6, z: P.z - 6 }, 5);
  check('moth: a slain Gloommoth drops Gloomdust', dr.some((d) => /^gloomdust/.test(d)), dr);
  // daylight: it flutters off
  const id3 = await spawn('gloommoth', P.x + 0.5, P.y + 8, P.z + 3.5 - 8);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 5000; g.player.gameMode = 'creative'; });
  await fast(220);
  const d3 = await mob(id3);
  check('moth: at sunrise it flutters away', !d3 || d3.removed, d3);
  // spawning: at night the manager brings moths, never in the day
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.rules.doMobSpawning = true; g.mobSpawning = true; g.entities.mobSpawning = true; g.dayNight.time = 18000; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  let spawned = 0;
  for (let i = 0; i < 400 && !spawned; i++) { await fast(5); spawned = (await mobs('gloommoth')).length; }
  check('moth: (natural) at night Gloommoths spawn in the open sky', spawned > 0, { spawned });
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 5000; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  await fast(1500);
  check('moth: (natural) none appear by day', (await mobs('gloommoth')).length === 0, await mobs('gloommoth'));
}
if (run('caps')) {
  await newWorld('Cap Tests', 'caps29', false);
  const P = await pad(8);
  await hurtPlayer(); await healGod();
  const stats = await ev(async () => {
    const F = await import('/src/entities/FarmAnimal.ts');
    const c = [0, 0, 0];
    for (let i = 0; i < 6000; i++) c[F.rollSporecapVariant()]++;
    return c.map((n) => Math.round(n / 60));
  });
  check('caps: wild colours roll Violet most (about 70%), Crimson about 22%, Pale about 8%', Math.abs(stats[0] - 70) < 5 && Math.abs(stats[1] - 22) < 5 && Math.abs(stats[2] - 8) < 4, stats);
  const mk = async (v, dx) => { const id = await spawn('sporecap', P.x + 0.5 + dx, P.y, P.z + 3.5 - 3); await ev(([id, v]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setVariant(v); m.tick = () => {}; }, [id, v]); return id; };
  const ids = [await mk(0, -3), await mk(1, 0), await mk(2, 3)];
  await ticks(4);
  const looks = await ev((ids) => ids.map((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); const cap = m.parts.get('cap'); return { v: m.variant, key: m.shownKey, glow: m.material.emissive.r * m.material.emissiveIntensity, rgb: cap ? cap.children?.[0]?.material?.color?.getHexString?.() ?? null : null }; }), ids);
  check('caps: each colour uses its own model; only Pale glows', looks[0].key === 'sporecap:0' && looks[1].key === 'sporecap:1' && looks[2].key === 'sporecap:2' && looks[2].glow > 0 && !looks[0].glow && !looks[1].glow, looks);
  // shear traits
  const shearN = async (v) => {
    const out = { counts: [], regrow: 0, glow: 0 };
    for (let i = 0; i < 60; i++) {
      const r = await ev(([v]) => { const g = window.__bf.game; const id = g.entities.spawnMob('sporecap', g.player.x, g.player.y, g.player.z - 3, g).id; const m = g.entities.list.find((e) => e.id === id); m.setVariant(v); for (const e of g.entities.list) if (e.type === 'item') e.removed = true; m.shear(g); const items = g.entities.list.filter((e) => e.type === 'item' && !e.removed).map((e) => e.stack); m.removed = true; return { n: items.filter((s) => s.id === 'sporecap').reduce((a, s) => a + s.count, 0), glow: items.filter((s) => s.id === 'glowcap').length, regrow: m.regrow }; }, [v]);
      out.counts.push(r.n); out.regrow = r.regrow; out.glow += r.glow;
    }
    return out;
  };
  const vi = await shearN(0), cr = await shearN(1), pa = await shearN(2);
  check('caps: Violet gives 1-3 and regrows in 3 minutes (3600); Crimson gives 2-4 and regrows in 2 minutes (2400)', Math.min(...vi.counts) === 1 && Math.max(...vi.counts) <= 3 && vi.regrow === 3600 && Math.min(...cr.counts) >= 2 && Math.max(...cr.counts) === 4 && cr.regrow === 2400, { vi: [Math.min(...vi.counts), Math.max(...vi.counts), vi.regrow], cr: [Math.min(...cr.counts), Math.max(...cr.counts), cr.regrow] });
  check('caps: Pale gives 1-2 caps and sometimes a Glowcap', Math.max(...pa.counts) <= 2 && pa.glow > 5 && pa.glow < 55, { max: Math.max(...pa.counts), glow: pa.glow });
  // sheared cap hidden
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.shear(window.__bf.game); }, ids[1]);
  await ticks(3);
  const hid = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return [m.parts.get('cap').visible, m.parts.get('capTop').visible]; }, ids[1]);
  check('caps: a sheared Sporecap shows no cap', hid[0] === false && hid[1] === false, hid);
  // inheritance
  const inh = await ev(() => {
    const g = window.__bf.game;
    const mk2 = (v) => { const m = g.entities.spawnMob('sporecap', g.player.x, g.player.y, g.player.z - 5, g); m.setVariant(v); return m; };
    const a = mk2(1), b2 = mk2(2), baby = mk2(0);
    const real = Math.random;
    const out = {};
    Math.random = () => 0.5; (a).inherit(baby, b2); out.pick1 = baby.variant;           // 0.5 is not < 0.08 (no mutation); 0.5 is not < 0.5 so the other parent
    Math.random = () => 0.2; (a).inherit(baby, b2); out.pick2 = baby.variant;            // below 0.5: this parent
    Math.random = () => 0.05; (a).inherit(baby, b2); out.mut = baby.variant;             // mutation, 0.05*3 = 0
    Math.random = real;
    for (const m of [a, b2, baby]) m.removed = true;
    return out;
  });
  check('caps: a young one takes after one of its parents, with a small chance of a new colour', inh.pick1 === 2 && inh.pick2 === 1 && inh.mut === 0, inh);
  // save and restore
  const sr = await ev(() => {
    const g = window.__bf.game;
    const a = g.entities.spawnMob('sporecap', g.player.x, g.player.y, g.player.z - 5, g);
    a.setVariant(2); a.shear(g);
    const s = a.serialize();
    const b2 = g.entities.spawnMob('sporecap', g.player.x, g.player.y, g.player.z - 5, g);
    b2.setVariant(0);
    b2.restore(s.f);
    const old = g.entities.spawnMob('sporecap', g.player.x, g.player.y, g.player.z - 5, g);
    old.setVariant(2); old.restore({});
    const out = { v: b2.variant, sheared: b2.sheared, regrow: b2.regrow, old: old.variant };
    for (const m of [a, b2, old]) m.removed = true;
    return out;
  });
  check('caps: colour, shorn state and regrow time survive saving; a Sporecap saved before 2.9 comes back Violet', sr.v === 2 && sr.sheared === true && sr.regrow > 3000 && sr.old === 0, sr);
}

if (run('fall')) {
  await newWorld('Fall Tests', 'fall29', false);
  const P = await pad(6);
  await hurtPlayer();
  const drop = async () => {
    await ev(([x, y, z]) => { const g = window.__bf.game, p = g.player; p.invulnerable = 0; p.health = 20; g.teleport(x + 0.5, y + 14, z + 0.5); p.vx = p.vy = p.vz = 0; }, [P.x, P.y, P.z]);
    for (let i = 0; i < 120; i++) { await fast(1); if (await ev(() => window.__bf.game.player.onGround)) break; }
    await fast(3);
    return ev(() => window.__bf.game.player.health);
  };
  const plain = await drop();
  await ev(() => window.__bf.game.potions.add('featherfall', 3000));
  const feather = await drop();
  check('fall: a 14-block drop hurts normally but does no damage under Featherfall', plain < 20 && feather === 20, { plain, feather });
  await ev(() => window.__bf.game.potions.clear());
  await give({ id: 'potion_featherfall', count: 1 });
  await ev(() => window.__bf.game.finishDrinking());
  check('fall: drinking a Potion of Featherfall starts the effect and returns the bottle', (await ev(() => window.__bf.game.potions.has('featherfall'))) && (await inv(0)) === 'glass_bottlex1', await inv(0));
  await ev(() => { const g = window.__bf.game; g.potions.clear(); g.shatterPotion(g.player.x, g.player.y, g.player.z, 'featherfall'); });
  check('fall: a splash Featherfall potion gives the effect', await ev(() => window.__bf.game.potions.has('featherfall')));
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
