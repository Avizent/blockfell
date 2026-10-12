// Tests for 2.3: snow day (snowballs, the Snow Pal, the sledge), the Fox Cub pet, name
// tags, baby farm animals (tempting, breeding, growing up), dyed and sheared sheep,
// saving all of it, and the same on a touch screen (iPad).
// node tests/t_v23.mjs   (dev server)   ONLY=items,snowball,snowpal,sledge,fox,nametag,farm,sheep,save,touch
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'snowball', 'snowpal', 'sledge', 'fox', 'nametag', 'farm', 'sheep', 'save', 'touch'];
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
const invCount = (pre) => ev((pre) => window.__bf.game.inventory.slots.filter((x) => x && x.id.startsWith(pre)).reduce((n, x) => n + x.count, 0), pre);
const clearItems = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item' || e.type === 'xp') e.removed = true; });
async function newWorld(name, seed, creative = false) {
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
    const M = await import('/src/entities/Mob.ts');
    const P = await import('/src/systems/Progress.ts');
    const N = await import('/src/world/names.ts');
    const S = await import('/src/render/itemSprites.ts');
    const Bk = await import('/src/world/BlockRegistry.ts');
    const bf = window.__bf;
    const ids = ['snowball', 'shears', 'name_tag', 'sledge', 'spawn_fox', 'spawn_snowpal'];
    return {
      names: N.NAMES,
      items: ids.map((i) => (I.hasItem(i) ? I.getItem(i).name : null)),
      stacks: ids.map((i) => I.maxStackOf(i)),
      shearsDur: I.getItem('shears').durability, sledgeKind: I.getItem('sledge').kind,
      sprites: ids.map((i) => { const px = S.spritePixels(i); let n = 0; for (let k = 3; k < px.length; k += 4) if (px[k] > 0) n++; return n; }),
      snowDrops: Bk.getBlock(Bk.SNOW).drops,
      specs: { fox: M.MOB_SPECS.fox, snowpal: M.MOB_SPECS.snowpal },
      unnameable: [...M.UNNAMEABLE],
      adv: ['snowball', 'snowpal', 'sledge', 'fox', 'nametag', 'farm_baby', 'dye_sheep'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id) ?? null),
      advCount: P.ADVANCEMENTS.length,
      stats: ['snowballs_thrown', 'snowpals_built', 'sledge', 'foxes_tamed', 'sheep_sheared', 'names_given'].map((s) => P.STAT_LABELS.find((l) => l[0] === s)?.[1] ?? null),
      snow: bf.craft(['snowball', 'snowball', null, 'snowball', 'snowball', null, null, null, null]),
      shears: bf.craft([null, 'iron_ingot', null, 'iron_ingot', null, null, null, null, null]),
      shearsMirror: bf.craft(['iron_ingot', null, null, null, 'iron_ingot', null, null, null, null]),
      tag: bf.craft(['string', 'leather', null, null, null, null, null, null, null]),
      sledge: bf.craft(['stick', null, null, 'planks', 'planks', 'planks', 'stick', null, 'stick']),
      boat: bf.craft(['planks', null, 'planks', 'planks', 'planks', 'planks', null, null, null]),
    };
  });
  check('items: Snowball (stacks of 16), Shears (238 uses), Name Tag, Sledge, Fox Cub and Snow Pal spawn eggs',
    t.items.every(Boolean) && t.stacks[0] === 16 && t.stacks[1] === 1 && t.stacks[3] === 1 && t.shearsDur === 238 && t.sledgeKind === 'boat', t);
  check('names: the creature and item names all come from world/names.ts', t.items[3] === t.names.sledge && t.items[4] === `${t.names.fox} Spawn Egg` && t.items[5] === `${t.names.snowpal} Spawn Egg`
    && t.specs.fox.name === t.names.fox && t.specs.snowpal.name === t.names.snowpal && t.adv[1]?.description.includes(t.names.snowpal) && t.adv[3]?.description.includes(t.names.fox), { names: t.names, items: t.items });
  check('sprites: each new item has its own picture', t.sprites.every((n) => n > 40), t.sprites);
  check('Snow Block drops 4 Snowballs; 4 Snowballs craft a Snow Block', t.snowDrops.length === 1 && t.snowDrops[0].item === 'snowball' && t.snowDrops[0].min === 4 && t.snow?.id === 'snow', { drops: t.snowDrops, snow: t.snow });
  check('recipes: Shears (two iron ingots, either diagonal), Name Tag (string + leather), Sledge (sticks and planks); the Boat recipe is unchanged',
    t.shears?.id === 'shears' && t.shearsMirror?.id === 'shears' && t.tag?.id === 'name_tag' && t.sledge?.id === 'sledge' && t.boat?.id === 'boat', t);
  check('creatures: Fox Cub (10 health, tame) and Snow Pal (8 health, drops snowballs); villagers, Sentinels and the Hollowdrake can\'t be named',
    t.specs.fox.health === 10 && !t.specs.fox.hostile && t.specs.snowpal.health === 8 && t.specs.snowpal.drops[0][0] === 'snowball' && ['villager', 'sentinel', 'hollowdrake'].every((u) => t.unnameable.includes(u)), t.specs);
  check('advancements: 7 new (54 in all) and 6 new statistics', t.adv.every(Boolean) && t.advCount >= 54 && t.stats.every(Boolean), { adv: t.adv.map((a) => a?.title), n: t.advCount, stats: t.stats });
}

let W = null;
const world = async () => { if (!W) W = await newWorld('Snow Day', 'snowday23'); };

// ======================================================================= SNOWBALLS
if (run('snowball')) {
  await world();
  const P = await pad(8, 'grass');
  await settle();
  // break a snow block by hand: four snowballs
  await set(P.x, P.y, P.z, 'snow');
  await give(null);
  await aim(P.x + 0.5, P.y + 0.5, P.z + 0.5);
  await centre();
  await page.mouse.down();
  await waitFor(async () => (await key(P.x, P.y, P.z)) === 'air', 8000);
  await page.mouse.up();
  await ticks(3);
  const drops = await itemsNear({ x: P.x + 0.5, z: P.z + 0.5 }, 3);
  check('snow: breaking a Snow Block gives 4 Snowballs', drops.join() === 'snowballx4', drops);
  await clearItems();
  // throw: right-click in the air
  await give({ id: 'snowball', count: 16 });
  await ev(() => { const p = window.__bf.game.player; p.yaw = 0; p.pitch = 0.1; });
  await rclick();
  const thrown = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'snowball' && !e.removed).map((e) => ({ vz: e.vz, vy: e.vy })));
  check('snowball: right-click throws one (forwards), the stack goes down, "Snowball Fight!" and the statistic',
    thrown.length === 1 && thrown[0].vz < -1 && (await sel()) === 'snowballx15' && (await adv('snowball')) && (await stat('snowballs_thrown')) === 1, { thrown, sel: await sel() });
  await fast(80);
  const left = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'snowball' && !e.removed).length);
  check('snowball: it falls and bursts when it lands', left === 0, left);
  // a pig: knocked back, not hurt
  const pig = await spawn('pig', P.x + 0.5, P.y, P.z - 1.5);
  await freeze(pig);
  await tp(P.x + 0.5, P.y, P.z + 3.5, 0, 0);
  await aim(P.x + 0.5, P.y + 0.5, P.z - 1.5);
  await rclick();
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); delete m.tick; }, pig);
  await fast(10);
  let m = await mob(pig);
  check('snowball: a pig is knocked back but not hurt', m.h === 10 && m.z < P.z - 1.6, m);
  // a Cinderling (a creature of fire) takes 3; a burning creature is put out
  const cin = await spawn('cinderling', P.x + 0.5, P.y, P.z - 1.5);
  await freeze(cin);
  await ev(([pig]) => { const m = window.__bf.game.entities.list.find((e) => e.id === pig); m.removed = true; }, [pig]);
  await aim(P.x + 0.5, P.y + 0.5, P.z - 1.5);
  await rclick(); await fast(6);
  m = await mob(cin);
  check('snowball: a Cinderling (fire) takes 3 damage', m.h === 7, m);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, cin);
  const cow = await spawn('cow', P.x + 0.5, P.y, P.z - 1.5);
  await freeze(cow);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).fireTicks = 100; }, cow);
  await aim(P.x + 0.5, P.y + 0.8, P.z - 1.5);
  await rclick(); await fast(6);
  const fire = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).fireTicks, cow);
  check('snowball: it puts out a creature that is on fire', fire === 0, fire);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, cow);
  // a creature-thrown snowball never hurts the player
  const hp = await ev(() => window.__bf.game.player.health);
  await ev((P) => { const g = window.__bf.game, pal = g.entities.spawnMob('snowpal', P.x + 0.5, P.y, P.z - 3, g); g.entities.spawnSnowball(P.x + 0.5, P.y + 1.4, P.z - 1, 0, 0, 1.0, pal); }, P);
  await fast(10);
  check('snowball: a snowball flying at the player does no harm', (await ev(() => window.__bf.game.player.health)) === hp, hp);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
  await clearItems();
}

// ======================================================================= SNOW PAL
if (run('snowpal')) {
  await world();
  const P = await pad(9, 'grass');
  await settle();
  await ev(() => window.__bf.ui.set({ chat: [] }));
  // coal on a single snow block: a hint
  await set(P.x, P.y, P.z, 'snow');
  await give({ id: 'coal', count: 3 });
  await aim(P.x + 0.5, P.y + 0.6, P.z + 0.5);
  await rclick();
  check('Snow Pal: Coal on a single Snow Block just explains how (nothing used)', (await sel()) === 'coalx3' && (await mobs('snowpal')).length === 0 && /Stack two Snow Blocks/.test(await chat()), await chat());
  await set(P.x, P.y + 1, P.z, 'snow');
  await aim(P.x + 0.5, P.y + 1.6, P.z + 0.5);
  await rclick();
  let pals = await mobs('snowpal');
  const blocks = [await key(P.x, P.y, P.z), await key(P.x, P.y + 1, P.z)];
  let pal = pals.length ? await mob(pals[0]) : null;
  check('Snow Pal: Coal on two stacked Snow Blocks builds one (blocks gone, coal used, "A Frosty Friend")',
    pals.length === 1 && blocks.every((k) => k === 'air') && (await sel()) === 'coalx2' && (await adv('snowpal')) && (await stat('snowpals_built')) === 1 && pal.pet && pal.persistent, { pals, blocks, pal, sel: await sel() });
  await page.screenshot({ path: `${SHOTS}/v23_snowpal.png` });
  // it pelts a creature of the night
  await ev(() => { const g = window.__bf.game; g.difficulty = 'normal'; g.dayNight.time = 18000; });
  const sh = await spawn('shambler', P.x + 0.5, P.y, P.z - 8.5);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.tick = function (h) { this.tickCommon(h); }; }, sh);
  await ev(() => { const em = window.__bf.game.entities; const orig = em.spawnSnowball; window.__balls = 0; em.spawnSnowball = function (...a) { if (a[6]) window.__balls++; return orig.apply(this, a); }; });
  await fast(120);
  const balls = await ev(() => window.__balls);
  await ev(() => { const em = window.__bf.game.entities; delete em.spawnSnowball; });
  const shm = await mob(sh);
  check('Snow Pal: it throws snowballs at a Shambler 9 blocks away, about one a second, and they hit (1 each)', balls >= 4 && shm.h <= 16, { balls, h: shm.h });
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, sh);
  await ev(() => { window.__bf.game.dayNight.time = 5000; });
  // the player's blows pass it by... unless sneaking
  pal = await mob(pals[0]);
  await give(null);
  await tp(P.x + 0.5, P.y, P.z + 0.5, 0, 0);
  await freeze(pals[0]);
  await aim(pal.x, pal.y + 0.8, pal.z);
  await lclick();
  let h1 = (await mob(pals[0])).h;
  await ev(() => { window.__bf.game.player.sneaking = true; window.__bf.engine.input.virtualKey('ShiftLeft', true); });
  await ticks(12);
  await lclick();
  const h2 = (await mob(pals[0])).h;
  await ev(() => { window.__bf.engine.input.virtualKey('ShiftLeft', false); window.__bf.game.player.sneaking = false; });
  await ticks(3);
  check('Snow Pal: your blows pass it by; sneak and hit it to break it up', h1 === 8 && h2 < 8, { h1, h2 });
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.health = 8; }, pals[0]);
  // right-click: follow me / guard here
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await aim(pal.x, pal.y + 0.8, pal.z);
  await rclick();
  pal = await mob(pals[0]);
  check('Snow Pal: right-click makes it follow you', pal.following === true && /will follow you/.test(await chat()), { pal, chat: await chat() });
  await unfreeze(pals[0]);
  await tp(P.x + 0.5, P.y, P.z + 6.5, 0, 0);
  await fast(300);
  pal = await mob(pals[0]);
  const dFollow = Math.hypot(pal.x - P.x - 0.5, pal.z - P.z - 6.5);
  check('Snow Pal: ...and it shuffles after you', dFollow < 5, { dFollow, pal });
  await freeze(pals[0]);
  await aim(pal.x, pal.y + 0.8, pal.z);
  await rclick();
  pal = await mob(pals[0]);
  check('Snow Pal: right-click again: it guards that spot', pal.following === false && /guard this spot/.test(await chat()), await chat());
  await unfreeze(pals[0]);
  // melting in water
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); const bf = window.__bf; const x = Math.floor(m.x), y = Math.floor(m.y), z = Math.floor(m.z); bf.setBlock(x, y, z, 'water'); }, pals[0]);
  await fast(60);
  pal = await mob(pals[0]);
  check('Snow Pal: it melts in water', pal.h < 8, pal);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); window.__bf.setBlock(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z), 'air'); m.health = 8; }, pals[0]);
  await fast(5);
}

// ======================================================================= SLEDGE
if (run('sledge')) {
  await world();
  await calm();
  // a snowy hillside going down to the north: steps of 1 every 3 blocks, then a long flat run
  const P = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y) + 8;
    for (let dz = 4; dz >= -90; dz--) {
      const step = Math.min(8, Math.max(0, Math.floor(-dz / 3)));
      const top = y - step;
      for (let dx = -3; dx <= 3; dx++) {
        for (let yy = top - 4; yy < top; yy++) bf.setBlock(x + dx, yy, z + dz, 'stone');
        bf.setBlock(x + dx, top - 1, z + dz, 'snow');
        for (let yy = top; yy <= y + 6; yy++) bf.setBlock(x + dx, yy, z + dz, 'air');
      }
    }
    p.flying = false;
    g.teleport(x + 0.5, y, z + 1.5); p.yaw = 0; p.pitch = 0.6;
    return { x, y, z };
  });
  await settle();
  await give({ id: 'sledge', count: 1 });
  await aim(P.x + 0.5, P.y - 0.02, P.z + 0.5);
  await rclick();
  const sl = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'sledge' && !e.removed).map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z })));
  check('sledge: right-click on the ground puts a Sledge down (item used)', sl.length === 1 && Math.abs(sl[0].y - P.y) < 0.05 && (await sel()) === null, { sl, sel: await sel() });
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await aim(sl[0].x, sl[0].y + 0.2, sl[0].z);
  await rclick();
  const riding = await ev(() => { const g = window.__bf.game; return { riding: g.riding?.type ?? null, dy: g.player.y - (g.riding?.y ?? 0) }; });
  check('sledge: right-click it to sit on it (lower than in a boat: eyes about a metre up)', riding.riding === 'sledge' && Math.abs(riding.dy + 0.55) < 0.01 && /Snowy hills are fastest/.test(await chat()), { riding, chat: await chat() });
  await page.screenshot({ path: `${SHOTS}/v23_sledge_on.png` });
  // push off and go downhill
  await ev(() => { window.__bf.game.autopilot = { forward: 1 }; });
  let top = 0, flatSpeed = 0;
  for (let i = 0; i < 16; i++) {
    await fast(5);
    const s = await ev(() => { const b = window.__bf.game.riding; return b ? Math.hypot(b.vx, b.vz) : 0; });
    top = Math.max(top, s);
  }
  await ev(() => { window.__bf.game.autopilot = null; });
  const st = await ev(() => { const g = window.__bf.game, b = g.riding; return { z: b.z, y: b.y, onSnow: b.onSnow, sp: Math.hypot(b.vx, b.vz) }; });
  check('sledge: pushing off and down the snowy steps it picks up speed (over 6 blocks a second), "Downhill Dash"',
    top > 0.3 && st.z < P.z - 12 && (await adv('sledge')) && (await stat('sledge')) > 1000, { top, st, sledgeStat: await stat('sledge') });
  await page.screenshot({ path: `${SHOTS}/v23_sledge_ride.png` });
  // it glides on along the flat, then stops by itself
  await fast(400);
  const st2 = await ev(() => { const b = window.__bf.game.riding; return { z: b.z, sp: Math.hypot(b.vx, b.vz) }; });
  check('sledge: it glides on along the flat and slows to a stop', st2.z < st.z - 10 && st2.sp < 0.02, { st, st2 });
  // brake: S (the joystick pulled back)
  const brake = await ev((P) => {
    const g = window.__bf.game, b = g.riding;
    const run = (back) => { b.setPos(P.x + 0.5, b.y, P.z - 45); b.yaw = 0; b.vx = 0; b.vz = -0.4; g.autopilot = back ? { forward: -1 } : null; let n = 0; while (Math.hypot(b.vx, b.vz) > 0.05 && n < 400) { g.tick(); n++; } g.autopilot = null; return n; };
    const free = run(false), braked = run(true);
    return { free, braked };
  }, P);
  check('sledge: S brakes (it stops much sooner)', brake.braked * 3 < brake.free, brake);
  // on grass it only drags along
  const grass = await ev((P) => {
    const bf = window.__bf, g = bf.game, b = g.riding;
    for (let dz = -1; dz >= -12; dz--) for (let dx = -2; dx <= 2; dx++) bf.setBlock(Math.floor(b.x) + dx, Math.floor(b.y) - 1, Math.floor(b.z) + dz, 'grass');
    for (let dx = -2; dx <= 2; dx++) bf.setBlock(Math.floor(b.x) + dx, Math.floor(b.y) - 1, Math.floor(b.z), 'grass');
    b.yaw = 0; b.vx = b.vz = 0;
    g.autopilot = { forward: 1 };
    for (let i = 0; i < 60; i++) g.tick();
    g.autopilot = null;
    return { sp: Math.hypot(b.vx, b.vz), onSnow: b.onSnow };
  }, P);
  check('sledge: on grass you can only push it along slowly', grass.sp < 0.09 && grass.sp > 0.01 && !grass.onSnow, grass);
  // climb off with Sneak
  await ev(() => window.__bf.engine.input.virtualKey('ShiftLeft', true));
  await ticks(3);
  await ev(() => window.__bf.engine.input.virtualKey('ShiftLeft', false));
  await ticks(3);
  const off = await ev(() => ({ riding: !!window.__bf.game.riding }));
  check('sledge: Sneak climbs off', !off.riding, off);
  // hit it three times: back to a Sledge item
  const sid = await ev(() => window.__bf.game.entities.list.find((e) => e.type === 'sledge' && !e.removed).id);
  const sp = await ev((id) => { const s = window.__bf.game.entities.list.find((e) => e.id === id); return { x: s.x, y: s.y, z: s.z }; }, sid);
  await tp(sp.x, sp.y, sp.z + 2.5, 0, 0);
  const sledge0 = await invCount('sledge');
  for (let i = 0; i < 3; i++) { await aim(sp.x, sp.y + 0.2, sp.z); await lclick(); await ticks(6); }
  await fast(10);
  const dropped = await itemsNear({ x: sp.x, z: sp.z }, 3);
  if (await invCount('sledge') > sledge0) dropped.push('sledgex1');   // picked up at once (the player stands close)
  check('sledge: three hits break it back into a Sledge item', dropped.includes('sledgex1') && (await ev(() => !window.__bf.game.entities.list.some((e) => e.type === 'sledge' && !e.removed))), dropped);
  await clearItems();
}

// ======================================================================= FOX CUB
if (run('fox')) {
  await world();
  await calm();
  const P = await pad(10, 'grass');
  await settle();
  const fox = await spawn('fox', P.x + 0.5, P.y, P.z + 1.5);
  await ev(() => window.__bf.ui.set({ chat: [] }));
  // shy: it runs from a player who isn't creeping
  await fast(60);
  let f = await mob(fox);
  const fled = Math.hypot(f.x - P.x - 0.5, f.z - P.z - 3.5);
  check('Fox Cub: a wild one is shy and runs away from you', fled > 5 && f.tamed === false && !f.pet, { fled, f });
  // creep up (sneak) and feed it fish
  await ev(([id, P]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setPos(P.x + 0.5, P.y, P.z + 1.5); m.panic = 0; m.hasTarget = false; }, [fox, P]);
  await ev(() => { window.__bf.engine.input.virtualKey('ShiftLeft', true); });
  await ticks(5);
  // sample its fright every few ticks: a creeping player must never set it running
  let maxPanic = 0;
  for (let i = 0; i < 8; i++) { await fast(5); maxPanic = Math.max(maxPanic, (await mob(fox)).panic); }
  f = await mob(fox);
  check('Fox Cub: sneaking, you can creep up on it (it doesn\'t run)', maxPanic === 0 && f.panic === 0, { maxPanic, f });
  // it may have wandered a little: put it within arm's reach before feeding (and freeze it there)
  await freeze(fox);
  await ev(([id, P]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setPos(P.x + 0.5, P.y, P.z + 1.5); m.vx = m.vz = 0; }, [fox, P]);
  f = await mob(fox);
  await give({ id: 'raw_trout', count: 5 });
  await withRandom(0.9);
  await aim(f.x, f.y + 0.3, f.z);
  await rclick();
  f = await mob(fox);
  const failed = { tamed: f.tamed, sel: await sel() };
  await withRandom(0.1);
  await rclick();
  await realRandom();
  f = await mob(fox);
  await ev(() => { window.__bf.engine.input.virtualKey('ShiftLeft', false); });
  await ticks(3);
  check('Fox Cub: fish tames it, one try in three (a fish used each try)', !failed.tamed && failed.sel === 'raw_troutx4' && f.tamed && f.pet && f.persistent && (await sel()) === 'raw_troutx3', { failed, f, sel: await sel() });
  check('Fox Cub: "Best Friends", the statistic, and a message saying how to look after it', (await adv('fox')) && (await stat('foxes_tamed')) === 1 && /is your pet now/.test(await chat()), await chat());
  // sit / follow
  await give(null);
  await rclick();
  f = await mob(fox);
  const sat = f.sitting;
  await page.screenshot({ path: `${SHOTS}/v23_fox_sit.png` });
  await rclick();
  f = await mob(fox);
  check('Fox Cub: right-click: sit and stay, again: follow', sat === true && f.sitting === false, { sat, f });
  // your blows don't hurt it
  await lclick();
  check('Fox Cub: your own pet shrugs off a swipe', (await mob(fox)).h === 16, await mob(fox));
  // it follows, and catches up from far behind
  await unfreeze(fox);
  await tp(P.x + 0.5, P.y, P.z + 9.5, 0, 0);
  await fast(200);
  f = await mob(fox);
  const near = Math.hypot(f.x - P.x - 0.5, f.z - P.z - 9.5);
  await ev(() => { const bf = window.__bf, g = bf.game, p = g.player; for (let dz = 0; dz < 40; dz++) for (let dx = -2; dx <= 2; dx++) { bf.setBlock(Math.floor(p.x) + dx, Math.floor(p.y) - 1, Math.floor(p.z) + 10 + dz, 'grass'); for (let dy = 0; dy < 4; dy++) bf.setBlock(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + 10 + dz, 'air'); } });
  await tp(P.x + 0.5, P.y, P.z + 40.5, 0, 0);
  await fast(40);
  f = await mob(fox);
  const far = Math.hypot(f.x - P.x - 0.5, f.z - P.z - 40.5);
  check('Fox Cub: it follows you, and bounds to your side when it falls far behind', near < 4 && far < 4, { near, far });
  // a present
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await clearItems();
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.giftTimer = 1; }, fox);
  await fast(3);
  f = await mob(fox);
  const gifts = await itemsNear(f, 3);
  check('Fox Cub: now and then it brings you a little present', gifts.length === 1 && /brought you/.test(await chat()), { gifts, chat: await chat() });
  // healing
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).health = 6; }, fox);
  await freeze(fox);
  // it was just bounding after you: stand it within arm's reach in front of you before feeding
  await ev((id) => { const g = window.__bf.game, p = g.player, m = g.entities.list.find((e) => e.id === id); m.setPos(p.x, p.y, p.z - 2); m.vx = m.vz = 0; }, fox);
  f = await mob(fox);
  await give({ id: 'cooked_perch', count: 2 });
  await aim(f.x, f.y + 0.3, f.z);
  await rclick();
  check('Fox Cub: cooked fish heals it', (await mob(fox)).h === 12 && (await sel()) === 'cooked_perchx1', { f: await mob(fox), sel: await sel() });
  // a snowy coat
  const snowFox = await ev(([P]) => { const g = window.__bf.game; const m = g.entities.spawnMob('fox', P.x + 2.5, P.y, P.z + 38.5, g); m.setCoat('snow'); m.tick = () => {}; return m.id; }, [P]);
  await wait(500);
  await page.screenshot({ path: `${SHOTS}/v23_foxes.png` });
  check('Fox Cub: there is a snowy-white kind too', (await mob(snowFox)).coat === 'snow', await mob(snowFox));
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, snowFox);
  await unfreeze(fox);
  await clearItems();
}

// ======================================================================= NAME TAGS
if (run('nametag')) {
  await world();
  await calm();
  const P = await pad(8, 'grass');
  await settle();
  const pig = await spawn('pig', P.x + 0.5, P.y, P.z + 1.5);
  await freeze(pig);
  await give({ id: 'name_tag', count: 2 });
  await aim(P.x + 0.5, P.y + 0.5, P.z + 1.5);
  await rclick();
  const ov = await overlay();
  check('Name Tag: right-click a creature opens the name-tag screen', ov === 'nametag', ov);
  await page.screenshot({ path: `${SHOTS}/v23_nametag.png` });
  await page.fill('[data-testid=nametag-input]', '  Sir  Oinks-a-lot the Third Great  ');
  await page.click('[data-testid=btn-nametag-done]');
  await wait(300);
  let m = await mob(pig);
  check('Name Tag: Done names it (spaces tidied, at most 20 letters), uses the tag, "What\'s Your Name?"',
    m.name === 'Sir Oinks-a-lot the' && (await overlay()) === null && (await sel()) === 'name_tagx1' && (await adv('nametag')) && (await stat('names_given')) === 1, { m, sel: await sel() });
  await wait(400);
  m = await mob(pig);
  check('Name Tag: the name shows above the creature', m.plate === true, m);
  await page.screenshot({ path: `${SHOTS}/v23_named_pig.png` });
  // cancel: nothing happens
  await aim(P.x + 0.5, P.y + 0.5, P.z + 1.5);
  await rclick();
  await page.fill('[data-testid=nametag-input]', 'Bacon');
  await page.click('[data-testid=btn-nametag-cancel]');
  await wait(300);
  check('Name Tag: Cancel leaves the name (and the tag) as they were', (await mob(pig)).name === 'Sir Oinks-a-lot the' && (await sel()) === 'name_tagx1', { m: await mob(pig), sel: await sel() });
  // villagers already have names
  await ev(() => window.__bf.ui.set({ chat: [] }));
  const vil = await spawn('villager', P.x + 2.5, P.y, P.z + 1.5);
  await freeze(vil);
  await aim(P.x + 2.5, P.y + 1.5, P.z + 1.5);
  await rclick();
  check('Name Tag: villagers have names already (no screen, tag kept)', (await overlay()) === null && /have names already/.test(await chat()) && (await sel()) === 'name_tagx1', await chat());
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, vil);
  // a named creature of the night never wanders off
  const sk = await spawn('skeleton', P.x - 1.5, P.y, P.z + 1.5);
  await freeze(sk);
  await aim(P.x - 1.5, P.y + 1.5, P.z + 1.5);
  await rclick();
  await page.fill('[data-testid=nametag-input]', 'Rattles');
  await page.keyboard.press('Enter');
  await wait(300);
  m = await mob(sk);
  check('Name Tag: Enter works too; a named creature is kept (never despawns)', m.name === 'Rattles' && m.persistent === true && (await overlay()) === null, m);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, sk);
  // a named pet's death message uses its name
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await ev(([P]) => { const g = window.__bf.game; const h = g.entities.spawnMob('hound', P.x + 0.5, P.y, P.z + 6, g); h.tame(); h.nameTag = 'Biscuit'; h.hurt(100, g, 0, 0, false); }, [P]);
  check('Name Tag: a named pet\'s passing is told by its name', /Biscuit \(your Fellhound\) has died/.test(await chat()), await chat());
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'hound') e.removed = true; });
}

// ======================================================================= FARM ANIMALS
if (run('farm')) {
  await world();
  await calm();
  const P = await pad(10, 'grass');
  await settle();
  // holding its food, a pig comes over
  const pig = await spawn('pig', P.x + 0.5, P.y, P.z - 5.5);
  await give({ id: 'carrot', count: 4 });
  await fast(120);
  let m = await mob(pig);
  const dPig = Math.hypot(m.x - P.x - 0.5, m.z - P.z - 3.5);
  await give({ id: 'stick', count: 1 });
  check('farm: hold a carrot and a pig comes over (and stops a step away)', dPig < 3.2 && dPig > 1.2, { dPig, m });
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, pig);
  // two cows fed wheat: a calf
  const c1 = await spawn('cow', P.x - 0.5, P.y, P.z + 1.5), c2 = await spawn('cow', P.x + 1.5, P.y, P.z + 1.5);
  await freeze(c1); await freeze(c2);
  await give({ id: 'wheat', count: 5 });
  for (const [id, dx] of [[c1, -0.5], [c2, 1.5]]) { await aim(P.x + dx, P.y + 1, P.z + 1.5); await rclick(); void id; }
  const loves = [(await mob(c1)).love, (await mob(c2)).love];
  check('farm: wheat makes two cows fall in love (wheat used)', loves.every((l) => l > 0) && (await sel()) === 'wheatx3', { loves, sel: await sel() });
  await unfreeze(c1); await unfreeze(c2);
  await fast(200);
  let cows = await mobs('cow');
  const all = await Promise.all(cows.map(mob));
  const calf = all.find((c) => c.baby);
  check('farm: they meet and have a calf (small: half the size), "Little Ones"', cows.length === 3 && calf && calf.height < 0.8 && (await adv('farm_baby')), all);
  check('farm: the parents must wait 5 minutes before another', all.filter((c) => !c.baby).every((c) => c.cool > 5000), all);
  await page.screenshot({ path: `${SHOTS}/v23_calf.png` });
  // the calf follows a grown-up
  await ev(([id, P]) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.setPos(P.x + 7.5, P.y, P.z - 6.5); }, [calf.id, P]);
  await fast(200);
  m = await mob(calf.id);
  const adults = all.filter((c) => !c.baby);
  const dPar = Math.min(...(await Promise.all(adults.map((a) => mob(a.id)))).map((a) => Math.hypot(a.x - m.x, a.z - m.z)));
  check('farm: a young one keeps near a grown-up', dPar < 5, { dPar });
  // wheat makes it grow up sooner; then it grows up
  await ev((id) => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'cow' && e.id !== id) e.removed = true; }, calf.id);
  await freeze(calf.id);
  m = await mob(calf.id);
  await tp(m.x, P.y, m.z + 2.5, 0, 0);
  await aim(m.x, m.y + 0.4, m.z);
  await rclick();
  const m2 = await mob(calf.id);
  check('farm: wheat makes the calf grow up sooner (by a tenth)', m.child - m2.child === 1200, { before: m.child, after: m2.child });
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.childAge = 3; }, calf.id);
  await unfreeze(calf.id);
  await fast(6);
  m = await mob(calf.id);
  check('farm: it grows up', m.baby === false && m.height === 1.4, m);
  // young ones drop nothing
  const chick = await spawn('chicken', P.x + 0.5, P.y, P.z - 6.5);
  await ev((id) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.makeBaby(); m.hurt(100, g, 0, 0, true); }, chick);
  await fast(30);
  const chickDrops = await itemsNear({ x: P.x + 0.5, z: P.z - 6.5 }, 3);
  check('farm: a young one leaves nothing behind', chickDrops.length === 0, chickDrops);
  // chickens eat seeds; feeding never eats the apple you meant for the pig
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
  const hen1 = await spawn('chicken', P.x - 1.5, P.y, P.z + 1.5);
  await freeze(hen1);
  await ev(() => { window.__bf.game.player.food = 10; });
  await give({ id: 'apple', count: 1 });
  const pig2 = await spawn('pig', P.x + 0.5, P.y, P.z + 1.5);
  await freeze(pig2);
  await tp(P.x + 0.5, P.y, P.z + 3.5, 0, 0);
  await aim(P.x + 0.5, P.y + 0.5, P.z + 1.5);
  await rclick();
  check('farm: an apple fed to a hungry player\'s pig goes to the pig', (await mob(pig2)).love > 0 && (await sel()) === null && (await ev(() => window.__bf.game.player.food)) === 10, { pig: await mob(pig2), food: await ev(() => window.__bf.game.player.food) });
  await give({ id: 'wheat_seeds', count: 2 });
  await aim(P.x - 1.5, P.y + 0.4, P.z + 1.5);
  await rclick();
  check('farm: chickens take seeds', (await mob(hen1)).love > 0 && (await sel()) === 'wheat_seedsx1', await mob(hen1));
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
  // natural herds: sometimes a young one, sheep in natural colours
  const herd = await ev(async () => {
    const F = await import('/src/entities/FarmAnimal.ts');
    const seen = {};
    for (let i = 0; i < 4000; i++) { const c = F.naturalWool(); seen[c] = (seen[c] ?? 0) + 1; }
    return seen;
  });
  check('farm: sheep come in natural colours (mostly white; grey, black, brown; rarely pink)', herd.white > 3000 && herd.black > 100 && herd.brown > 60 && herd.gray > 100 && (herd.pink ?? 0) < 40 && !herd.red, herd);
  await clearItems();
}

// ======================================================================= SHEEP
if (run('sheep')) {
  await world();
  await calm();
  const P = await pad(9, 'grass');
  await settle();
  const sh = await spawn('sheep', P.x + 0.5, P.y, P.z + 1.5);
  await freeze(sh);
  await give({ id: 'red_dye', count: 2 });
  await aim(P.x + 0.5, P.y + 1, P.z + 1.5);
  await rclick();
  let m = await mob(sh);
  check('sheep: a dye turns its wool that colour (dye used), "Woolly Rainbow"', m.color === 'red' && (await sel()) === 'red_dyex1' && (await adv('dye_sheep')), { m, sel: await sel() });
  await rclick();
  check('sheep: the same colour again does nothing (the dye is kept)', (await sel()) === 'red_dyex1', await sel());
  await page.screenshot({ path: `${SHOTS}/v23_red_sheep.png` });
  await clearItems();
  await give({ id: 'shears', count: 1 });
  await rclick();
  await fast(15);
  m = await mob(sh);
  const wool = await itemsNear({ x: P.x + 0.5, z: P.z + 1.5 }, 4);
  const picked = await ev(() => window.__bf.game.inventory.countItem('red_wool'));
  const n = wool.filter((w) => w.startsWith('red_woolx')).reduce((a, w) => a + +w.split('x')[1], 0) + picked;
  check('sheep: shears clip 1-3 red wool and leave it bare (the shears wear), "Sheep Sheared"', m.sheared && n >= 1 && n <= 3 && (await sel()) === 'shearsx1d1' && (await stat('sheep_sheared')) === 1, { m, wool, picked, sel: await sel() });
  await clearItems();
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await rclick();
  check('sheep: a bare sheep has nothing more to give', (await itemsNear({ x: P.x + 0.5, z: P.z + 1.5 }, 3)).length === 0 && /no wool yet/.test(await chat()), await chat());
  await page.screenshot({ path: `${SHOTS}/v23_sheared.png` });
  // it eats grass (the grass turns to dirt) and the wool grows back
  await unfreeze(sh);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.grazing = 40; }, sh);
  await fast(40);
  m = await mob(sh);
  const dirtCount = () => ev(([P]) => { let n = 0; for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) if (window.__bf.getBlock(P.x + dx, P.y - 1, P.z + dz) === 'dirt') n++; return n; }, [P]);
  const under = await dirtCount();
  check('sheep: it eats some grass (the grass turns to dirt) and its red wool grows back', !m.sheared && m.color === 'red' && under === 1, { m, under });
  // a woolly sheep only nibbles
  const sh2 = await spawn('sheep', P.x - 3.5, P.y, P.z - 4.5);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); delete m.tick; m.grazing = 40; }, sh2);
  await fast(40);
  m = await mob(sh2);
  check('sheep: a woolly one only nibbles (the grass stays)', (await dirtCount()) === 1, m);
  // lambs: red and yellow parents: an orange lamb
  await ev(([a, b]) => { const g = window.__bf.game; const A = g.entities.list.find((e) => e.id === a), Bb = g.entities.list.find((e) => e.id === b); A.setWool('red', false); Bb.setWool('yellow', false); A.setPos(A.x, A.y, A.z); Bb.setPos(A.x + 2, A.y, A.z); A.love = 600; Bb.love = 600; }, [sh, sh2]);
  await fast(200);
  const lambs = (await Promise.all((await mobs('sheep')).map(mob))).filter((s) => s.baby);
  check('sheep: a red and a yellow sheep have an orange lamb', lambs.length === 1 && lambs[0].color === 'orange', lambs);
  // a dyed sheep's wool drop is its colour
  // (the drops can land at the player's feet and be picked up at once, so count the bag as well as the ground)
  const wool0 = await invCount('light_blue_wool'), mutton0 = await invCount('raw_mutton');
  const at2 = await mob(sh2);
  await ev(([id]) => { const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id); m.setWool('light_blue', false); m.hurt(100, g, 0, 0, true); }, [sh2]);
  await fast(30);
  const kill = await itemsNear(at2, 4);
  if (await invCount('light_blue_wool') > wool0) kill.push('light_blue_wool (picked up)');
  if (await invCount('raw_mutton') > mutton0) kill.push('raw_mutton (picked up)');
  check('sheep: a light blue sheep leaves light blue wool (and mutton)', kill.some((s) => s.startsWith('light_blue_wool')) && kill.some((s) => s.startsWith('raw_mutton')), kill);
  await clearItems();
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
}

// ======================================================================= SAVE
if (run('save')) {
  await world();
  await calm();
  const P = await pad(8, 'grass');
  await settle();
  await ev(([P]) => {
    const g = window.__bf.game, S = (t, dx, dz) => g.entities.spawnMob(t, P.x + 0.5 + dx, P.y, P.z + 0.5 + dz, g);
    const s = S('sheep', -3, -2); s.setWool('purple', true); s.makeBaby(4000); s.nameTag = 'Violet';
    const c = S('cow', 3, -2); c.breedCooldown = 3000;
    const f = S('fox', 0, -4); f.setCoat('snow'); f.tame(); f.sitting = true; f.nameTag = 'Snowflake'; f.giftTimer = 4321;
    const pal = S('snowpal', 2, -5); pal.setHome(P.x + 2.5, P.y, P.z - 4.5); pal.following = true;
    g.entities.spawnSledge(P.x - 2.5, P.y, P.z - 5.5, 0.4);
    for (const e of g.entities.list) if (e.mobType) e.persistent = true;
  }, [P]);
  await reopen(W);
  const r = await ev(() => {
    const g = window.__bf.game, L = g.entities.list.filter((e) => !e.removed);
    const s = L.find((e) => e.mobType === 'sheep'), c = L.find((e) => e.mobType === 'cow'), f = L.find((e) => e.mobType === 'fox'), pal = L.find((e) => e.mobType === 'snowpal');
    return {
      sheep: s && { color: s.color, sheared: s.sheared, child: s.childAge, name: s.nameTag, cls: s.constructor.name },
      cow: c && { cool: c.breedCooldown, cls: c.constructor.name },
      fox: f && { coat: f.coat, tamed: f.tamed, sitting: f.sitting, name: f.nameTag, gift: f.giftTimer, pet: f.petOfPlayer },
      pal: pal && { following: pal.following, home: [pal.homeX, pal.homeZ], pet: pal.petOfPlayer },
      sledges: L.filter((e) => e.type === 'sledge').length,
    };
  });
  check('save: a dyed, sheared, named lamb keeps all of it', r.sheep?.color === 'purple' && r.sheep.sheared && r.sheep.child > 3900 && r.sheep.child <= 4000 && r.sheep.name === 'Violet', r.sheep);
  check('save: a cow still waiting to breed keeps waiting', r.cow?.cool > 2900 && r.cow.cool <= 3000, r.cow);
  check('save: a tamed, sitting, snowy Fox Cub keeps its name and its coat', r.fox?.coat === 'snow' && r.fox.tamed && r.fox.sitting && r.fox.name === 'Snowflake' && r.fox.gift === 4321 && r.fox.pet, r.fox);
  check('save: a Snow Pal remembers its spot and that it follows you; the sledge is kept', r.pal?.following && Math.abs(r.pal.home[0] - P.x - 2.5) < 0.01 && r.pal.pet && r.sledges === 1, r);
  // riding a sledge when the world is saved: back on it
  await ev(() => { const g = window.__bf.game, s = g.entities.list.find((e) => e.type === 'sledge'); g.mount(s, true); });
  await reopen(W);
  check('save: sitting on a sledge when the world was saved, you are back on it', (await ev(() => window.__bf.game.riding?.type)) === 'sledge', await ev(() => window.__bf.game.riding?.type));
  await ev(() => window.__bf.game.dismount());
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType || e.type === 'sledge') e.removed = true; });
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
  await page.fill('[data-testid=world-name]', 'iPad Snow'); await page.fill('[data-testid=world-seed]', 'ipad23');
  await ev(() => document.querySelector('[data-testid=btn-create-world]').click());
  await waitFor(async () => (await screen()) === 'game', 90000);
  await settle();
  await calm();
  const touchOn = await ev(() => window.__bf.ui.get().touch);
  const P = await pad(8, 'grass');
  await settle();
  // a tap with a dye on a sheep dyes it (doesn't hit it)
  const sh = await spawn('sheep', P.x + 0.5, P.y, P.z + 1.5);
  await freeze(sh);
  await give({ id: 'lime_dye', count: 1 });
  await aim(P.x + 0.5, P.y + 1, P.z + 1.5);
  await tap();
  let m = await mob(sh);
  check('touch: a tap with a dye on a sheep dyes it (no hit)', touchOn && m.color === 'lime' && m.h === 8, { touchOn, m });
  // with nothing useful in hand, a tap is a hit
  await give({ id: 'stick', count: 1 });
  await tap();
  m = await mob(sh);
  check('touch: with nothing to use on it, a tap hits it', m.h < 8, m);
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, sh);
  // a tap throws a snowball
  await give({ id: 'snowball', count: 4 });
  await ev(() => { const p = window.__bf.game.player; p.yaw = 0; p.pitch = 0.2; });
  await tap();
  check('touch: a tap throws a snowball', (await sel()) === 'snowballx3' && (await stat('snowballs_thrown')) >= 1, await sel());
  // a tap on a tamed Fox Cub: sit
  const fox = await spawn('fox', P.x + 0.5, P.y, P.z + 1.5);
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.tame(); m.tick = () => {}; }, fox);
  await give(null);
  await aim(P.x + 0.5, P.y + 0.3, P.z + 1.5);
  await tap();
  check('touch: a tap on your Fox Cub makes it sit', (await mob(fox)).sitting === true && (await mob(fox)).h === 16, await mob(fox));
  // a tap with a Name Tag: the screen, and naming it from the on-screen keyboard
  await give({ id: 'name_tag', count: 1 });
  await tap();
  const ov = await overlay();
  await page.fill('[data-testid=nametag-input]', 'Pip');
  await ev(() => document.querySelector('[data-testid=btn-nametag-done]').click());
  await wait(300);
  check('touch: a tap with a Name Tag opens the screen; Name it names the fox', ov === 'nametag' && (await mob(fox)).name === 'Pip' && (await overlay()) === null, { ov, fox: await mob(fox) });
  await page.screenshot({ path: `${SHOTS}/v23_touch_pip.png` });
  // the sledge on a touch screen: tap to sit on it, joystick pushes
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
  await ev(([P]) => { const bf = window.__bf; for (let dx = -6; dx <= 6; dx++) for (let dz = -7; dz <= 7; dz++) bf.setBlock(P.x + dx, P.y - 1, P.z + dz, 'snow'); }, [P]);
  await give({ id: 'sledge', count: 1 });
  await tp(P.x + 0.5, P.y, P.z + 3.5, 0, 0.7);
  await aim(P.x + 0.5, P.y - 0.02, P.z + 1.5);
  await tap();
  const sl = await ev(() => window.__bf.game.entities.list.find((e) => e.type === 'sledge' && !e.removed)?.id ?? null);
  const sp = sl && await ev((id) => { const s = window.__bf.game.entities.list.find((e) => e.id === id); return { x: s.x, y: s.y, z: s.z }; }, sl);
  if (sp) await aim(sp.x, sp.y + 0.2, sp.z);
  await tap();
  const rideT = await ev(() => window.__bf.game.riding?.type ?? null);
  check('touch: tap the ground to put the sledge down, tap it to sit on it', !!sl && rideT === 'sledge', { sl, rideT });
  if (rideT) {
    const st = await ev(() => { const g = window.__bf.game, b = g.riding; return { x: b.x, z: b.z }; });
    // the joystick (bottom left): push forwards
    const JX = 160, JY = TH - 160;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: JX, y: JY, id: 5, radiusX: 4, radiusY: 4, force: 1 }] });
    await wait(80);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: JX, y: JY - 45, id: 5, radiusX: 4, radiusY: 4, force: 1 }] });
    await ticks(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const en = await ev(() => { const b = window.__bf.game.riding; return b ? { x: b.x, z: b.z } : null; });
    check('touch: the joystick pushes the sledge along the snow', en && Math.hypot(en.x - st.x, en.z - st.z) > 1, { st, en });
  }
}

// ======================================================================= SUMMARY
const bad = errors.filter((e) => !/favicon|ResizeObserver|net::ERR|Failed to load resource/.test(e));
check('no page errors', bad.length === 0, bad.slice(0, 5));
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} passed`);
fs.writeFileSync('/tmp/t_v23.json', JSON.stringify(results, null, 1));
await b.close();
process.exit(fails.length ? 1 : 0);
