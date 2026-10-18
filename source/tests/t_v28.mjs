// Tests for 2.8: Spore Isle (terrain, mushrooms, Sporecap, Spore Stew) and the Trident.
// node tests/t_v28.mjs   (dev server)   ONLY=items,isle,sporecap,trident,stew,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','isle','sporecap','trident','stew','save'];
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



const mobProp = (id, k) => ev(([id, k]) => window.__bf.game.entities.list.find((e) => e.id === id)?.[k], [id, k]);
const hold = async (ms) => { await centre(); await page.mouse.down({ button: 'right' }); await wait(ms); await page.mouse.up({ button: 'right' }); await ticks(3); };
const ISLE = { x: -565, z: 211 };   // seed 'ridepics27' (game hash): a Spore Isle of radius 40 here
const tridents = () => ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'arrow' && e.trident && !e.removed).map((e) => ({ stuck: e.stuck, x: e.x, y: e.y, z: e.z })));

if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const P = await import('/src/systems/Progress.ts');
    const B = await import('/src/world/BlockRegistry.ts');
    const T = await import('/src/meshing/textureNames.ts');
    const ids = ['sporeloam', 'spore_stem', 'cap_violet', 'cap_crimson', 'cap_gills', 'spore_tuft', 'spore_lamp', 'sporecap', 'spore_stew', 'trident', 'spawn_sporecap'];
    const tex = ['sporeloam_top', 'sporeloam_side', 'spore_stem', 'spore_stem_top', 'cap_violet', 'cap_crimson', 'cap_gills', 'spore_tuft', 'spore_lamp'];
    const lastBlocks = ['sporeloam', 'spore_stem', 'cap_violet', 'cap_crimson', 'cap_gills', 'spore_tuft', 'spore_lamp'].map((k) => B.blockByKey(k)?.id);
    return {
      exist: ids.map((id) => I.hasItem(id)), sprites: ['sporecap', 'spore_stew', 'trident'].map((id) => !!S.SPRITES[id]),
      tex: tex.map((n) => { try { return T.textureLayer(n) >= 0; } catch { return false; } }),
      consecutive: lastBlocks.every((v, i) => i === 0 || v === lastBlocks[i - 1] + 1), light: [B.getBlock(B.CAP_GILLS).lightEmission, B.getBlock(B.SPORE_LAMP).lightEmission],
      count: P.ADVANCEMENTS.length, adv: ['spore_isle', 'spore_shear', 'spore_stew', 'trident_hit'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.parent),
      dur: I.getItem('trident').durability, stack: I.getItem('trident').maxStack,
    };
  });
  const c = await ev(() => {
    const bf = window.__bf, n = null;
    const r = (g) => { const x = bf.craft(g); return x ? x.id + 'x' + x.count : null; };
    return {
      stew: r(['sporecap', 'sporecap', 'sporecap', 'carrot', n, n, n, n, n]), lamp: r([n, 'sporecap', n, 'sporecap', 'glass', 'sporecap', n, 'sporecap', n]),
      trident: r(['iron_ingot', n, 'iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', n, 'stick', n]), planks: r(['spore_stem', 'spore_stem', n, 'spore_stem', 'spore_stem', n, n, n, n]),
    };
  });
  check('items: the Spore Isle blocks, Sporecap, Spore Stew, Trident and the Sporecap egg exist; sprites and all nine textures are there', t.exist.every(Boolean) && t.sprites.every(Boolean) && t.tex.every(Boolean), t);
  check('items: the seven new blocks are the last ones registered (ids follow on); Glowgills and the Spore Lamp give light', t.consecutive && t.light[0] > 8 && t.light[1] === 15, t);
  check('crafting: Spore Stew, Spore Lamp, Trident (five iron and a stick) and planks from stems', c.stew === 'spore_stewx1' && c.lamp === 'spore_lampx1' && c.trident === 'tridentx1' && c.planks === 'plankx4' || c.planks === 'planksx4', c);
  check('items: four new advancements (72 in all) in the right places; the Trident wears out (300) and stacks to 1', t.count === 72 && t.adv.join() === 'boat,spore_isle,spore_shear,long_reach' && t.dur === 300 && t.stack === 1, t);
}

let P0;
if (run('isle') || run('sporecap') || run('trident') || run('stew') || run('save')) {
  await newWorld('Spore Tests', 'ridepics27', true);
  await ev(([x, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, 85, z + 0.5); }, [ISLE.x, ISLE.z - 30]);
  await settle(); await ticks(4);
}
if (run('isle')) {
  const gen = await ev(async ([x, z]) => {
    const T = await import('/src/world/TerrainGenerator.ts');
    const g = window.__bf.game;
    const ring = g.world.generator.column(x, z - 14);
    const old = new T.TerrainGenerator(g.world.seed, { structures: false, version: 6 });
    let oldSpore = 0, newSpore = 0;
    for (let dz = -50; dz <= 50; dz += 2) for (let dx = -50; dx <= 50; dx += 2) {
      if (old.column(x + dx, z + dz).biome === T.BIOME_SPORE) oldSpore++;
      if (g.world.generator.column(x + dx, z + dz).biome === T.BIOME_SPORE) newSpore++;
    }
    return { ring: ring.biome, spore: T.BIOME_SPORE, ver: g.world.genVersion, newSpore, oldSpore, name: T.biomeName(T.BIOME_SPORE), gv: T.GEN_VERSION };
  }, [ISLE.x, ISLE.z]);
  check('isle: a new world has a Spore Isle (generator 7) where the seed puts one; old (version 6) worlds have none, so no saved world changes', gen.ver === gen.gv && gen.ring === gen.spore && gen.newSpore > 300 && gen.oldSpore === 0 && gen.name === 'Spore Isle', gen);
  // scan what was actually built
  const scan = await ev(([x, z]) => {
    const bf = window.__bf, tally = {};
    let doorways = 0, surface = {};
    for (let dz = -48; dz <= 48; dz++) for (let dx = -48; dx <= 48; dx++) {
      const wx = x + dx, wz = z + dz;
      for (let y = 100; y >= 40; y--) {
        const b = bf.getBlock(wx, y, wz);
        if (b === 'air') continue;
        if (['sporeloam', 'sand', 'water'].includes(b)) surface[b] = (surface[b] || 0) + 1;
        break;
      }
      for (let y = 50; y < 90; y++) { const b = bf.getBlock(wx, y, wz); if (['spore_stem', 'cap_violet', 'cap_crimson', 'cap_gills', 'spore_tuft'].includes(b)) tally[b] = (tally[b] || 0) + 1; }
    }
    return { tally, surface };
  }, [ISLE.x, ISLE.z]);
  check('isle: the island is sporeloam over sand-edged shores, with stems, both cap colours, glowing gills and tufts', (scan.surface.sporeloam || 0) > 300 && (scan.surface.sand || 0) > 20 && scan.tally.spore_stem > 20 && scan.tally.cap_violet > 20 && scan.tally.cap_crimson > 20 && scan.tally.cap_gills > 20 && scan.tally.spore_tuft > 10, scan);
  const hollow = await ev(([x, z]) => {
    // a giant mushroom has a hollow stem: a stem block ring around an air cell with gills overhead
    const bf = window.__bf;
    for (let dz = -48; dz <= 48; dz++) for (let dx = -48; dx <= 48; dx++) {
      const wx = x + dx, wz = z + dz;
      for (let y = 50; y < 85; y++) {
        if (bf.getBlock(wx, y, wz) !== 'air' || bf.getBlock(wx + 1, y, wz) !== 'spore_stem' || bf.getBlock(wx - 1, y, wz) !== 'spore_stem' || bf.getBlock(wx, y, wz - 1) !== 'spore_stem') continue;
        if (bf.getBlock(wx, y + 1, wz) === 'air' && bf.getBlock(wx, y + 2, wz) === 'air' && bf.getBlock(wx, y, wz + 1) === 'air') return { wx, y, wz, door: true };
      }
    }
    return null;
  }, [ISLE.x, ISLE.z]);
  check('isle: a giant mushroom has a hollow stem with a doorway on its south side', !!hollow, hollow);
  // the world is unchanged outside: ordinary biomes still make grass
  const far = await ev(() => { const g = window.__bf.game; const T = g.world.generator; const b = T.column(Math.floor(g.player.x) - 300, Math.floor(g.player.z) + 100); return b.biome; });
  check('isle: (info) a column far from the island is not Spore Isle', far !== 13, far);
}

if (run('sporecap')) {
  await ev(([x, z]) => { const g = window.__bf.game, y = g.world.highestSolid(x, z) + 1; g.player.flying = false; g.teleport(x + 0.5, y, z + 2.5); g.player.yaw = 0; g.player.pitch = 0; g.player.gameMode = 'survival'; g.player.invulnerable = 1e9; g.rules.doMobSpawning = false; for (const e of g.entities.list) if (e.mobType) e.removed = true; }, [ISLE.x + 2, ISLE.z - 14]);
  await settle(); await ticks(3);
  await clearInv();
  const pos = await ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z }; });
  const sc = await spawn('sporecap', pos.x, pos.y, pos.z - 2.5);
  await freeze(sc);
  const spec = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return { type: m.mobType, sheared: m.sheared, farm: m.love !== undefined, cap: !!m.parts.get('cap'), name: m.spec.name }; }, sc);
  check('sporecap: it is a farm animal (breeds) with a cap; not yet sheared', spec.type === 'sporecap' && spec.farm && spec.cap && spec.sheared === false, spec);
  await setSlot(0, { id: 'shears', count: 1 });
  await aimMob(sc); await rclick();
  await ticks(2);
  const items1 = await ev(() => window.__bf.inventory());
  const dropped = await itemsNear({ x: pos.x, z: pos.z - 2.5 }, 3);
  const caps = [...dropped.filter((s) => s.startsWith('sporecap')), ...items1.filter((s) => String(s).includes('sporecap'))];
  check('sporecap: shears take its cap and give 1 to 3 Sporecaps; Cap in Hand earned', (await mobProp(sc, 'sheared')) === true && caps.length >= 1 && (await adv('spore_shear')), { caps, dropped, items1 });
  await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).render(1, window.__bf.game); }, sc);
  const capVis = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return [m.parts.get('cap').visible, m.parts.get('capTop').visible]; }, sc);
  check('sporecap: a sheared Sporecap shows no cap', capVis.join() === 'false,false', capVis);
  await setSlot(0, { id: 'shears', count: 1, damage: 0 });
  await aimMob(sc); await rclick();
  check('sporecap: shearing it again does nothing yet, and says why', (await chat()).toLowerCase().includes('grows back') && (await inv(0)) === 'shearsx1', await chat());
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.regrow = 1; delete m.tick; }, sc);
  await ticks(4);
  await freeze(sc);
  check('sporecap: the cap grows back', (await mobProp(sc, 'sheared')) === false);
  // food and breeding
  const foodOK = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).foods.includes('sporecap'), sc).catch(() => null);
  await setSlot(0, { id: 'sporecap', count: 2 });
  await aimMob(sc); await rclick();
  check('sporecap: fed a Sporecap it goes into love (so they can breed)', (await mobProp(sc, 'love')) > 0, await mobProp(sc, 'love'));
  // dies: drops
  // natural spawning on the island
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.mobType) e.removed = true; g.rules.doMobSpawning = true; g.entities.mobSpawning = true; g.difficulty = 'normal'; g.player.invulnerable = 1e9; });
  let natural = null;
  for (let i = 0; i < 90 && !(natural && natural.types.includes('sporecap')); i++) {
    await wait(1000);
    natural = await ev(() => { const g = window.__bf.game; const l = g.entities.list.filter((e) => e.mobType && !e.removed); return l.length ? { types: [...new Set(l.map((e) => e.mobType))], n: l.length } : null; });
    if (natural && natural.types.includes('sporecap')) break;
  }
  await ev(() => { window.__bf.game.rules.doMobSpawning = false; });
  check('sporecap: natural spawning on the island brings Sporecaps', natural && natural.types.includes('sporecap'), natural);
  const hostiles = await ev(() => window.__bf.game.entities.list.filter((e) => e.mobType && e.spec.hostile && window.__bf.game.world.generator.column(Math.floor(e.x), Math.floor(e.z)).biome === 13).length);
  check('sporecap: no hostile creature on Spore Isle', hostiles === 0, hostiles);
}

if (run('trident')) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.rules.doMobSpawning = false; for (const e of g.entities.list) if (e.mobType) e.removed = true; }, [0, 0, 0]);
  P0 = await ev(() => { const bf = window.__bf, g = bf.game, p = g.player; return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }; });
  // a flat stone pad high in the air so nothing else is in the way
  await ev(([x, y, z]) => { const bf = window.__bf; for (let dx = -12; dx <= 12; dx++) for (let dz = -22; dz <= 6; dz++) { bf.setBlock(x + dx, 120, z + dz, 'stone'); for (let dy = 1; dy <= 6; dy++) bf.setBlock(x + dx, 120 + dy, z + dz, 'air'); } }, [P0.x, P0.y, P0.z]);
  await settle();
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; g.player.invulnerable = 1e9; g.teleport(x + 0.5, 121, z + 3.5); g.player.yaw = 0; g.player.pitch = 0; }, [P0.x, P0.y, P0.z]);
  await ticks(10);
  await clearInv(); await clearItems();
  await setSlot(0, { id: 'trident', count: 1 });
  const cow = await spawn('cow', P0.x + 0.5, 121, P0.z - 10.5);
  await freeze(cow);
  const hp0 = await mobProp(cow, 'health');
  await aimMob(cow);
  // a quick click is not a throw
  await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(4);
  check('trident: a quick right-click is not a throw (nothing flies, you keep it)', (await tridents()).length === 0 && (await inv(0)) === 'tridentx1', await tridents());
  // hold to draw: the charge bar fills
  await aimMob(cow); await centre();
  await page.mouse.down({ button: 'right' }); await wait(900);
  const ch = await ev(() => window.__bf.ui.get().charge);
  await page.mouse.up({ button: 'right' });
  await ticks(2);
  check('trident: holding right-click draws it back (the charge bar fills) and letting go throws it; it leaves your hand', ch > 0.3 && (await inv(0)) === null, { ch, slot: await inv(0), tr: await tridents() });
  await wait(900); await ticks(6);
  const hp1 = await mobProp(cow, 'health');
  const itemsAt = await itemsNear({ x: P0.x + 0.5, z: P0.z - 10.5 }, 4);
  check('trident: a thrown Trident hits hard (7 or more) and drops where it hit, worn by one', hp0 - hp1 >= 7 && itemsAt.some((s) => s.startsWith('tridentx1')) , { hp0, hp1, itemsAt });
  check('trident: Three Prongs earned', await adv('trident_hit'));
  // pick up again
  await ev(([x, z]) => { const g = window.__bf.game, m = g.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'trident')[0]; if (m) g.teleport(m.x, 121, m.z); }, [P0.x, P0.z]);
  await ticks(12);
  const back = await ev(() => window.__bf.game.inventory.slots.find((s) => s && s.id === 'trident') || null);
  check('trident: walk over it to pick it up again, with the wear kept', back && back.damage === 1, back);
  // throw into the stone wall: it sticks, and can be picked up
  await ev(() => { const g = window.__bf.game; g.difficulty = 'peaceful'; for (const e of g.entities.list) if (e.mobType) e.removed = true; });
  await ev(([x, y, z]) => { const bf = window.__bf; for (let dy = 1; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) bf.setBlock(x + dx, 120 + dy, z - 18, 'stone'); const g = window.__bf.game; g.teleport(x + 0.5, 121, z + 3.5); g.player.yaw = 0; g.player.pitch = 0; window.__bf.aimAt(x + 0.5, 122.5, z - 18); }, [P0.x, P0.y, P0.z]);
  await ticks(3);
  const sl = await ev(() => window.__bf.game.inventory.slots.findIndex((s) => s && s.id === 'trident'));
  await ev((i) => { const g = window.__bf.game; g.inventory.selected = i; g.inventory.changed(); }, sl);
  await ticks(2);
  await page.mouse.move(CX, CY); await page.mouse.down({ button: 'right' }); await wait(1100); await page.mouse.up({ button: 'right' });
  await wait(1200); await ticks(4);
  const st = await tridents();
  if (false) console.log('DEBUG', JSON.stringify(await ev(() => ({ inv: window.__bf.game.inventory.slots.slice(0,9).map((s) => s && s.id), sel: window.__bf.game.inventory.selected, ents: window.__bf.game.entities.list.filter((e) => e.type !== 'mob').map((e) => e.type + ':' + (e.stack?.id || '') + ':' + Math.round(e.x) + ',' + Math.round(e.y) + ',' + Math.round(e.z)), pl: [window.__bf.game.player.x, window.__bf.game.player.y, window.__bf.game.player.z] }))));
  check('trident: thrown at a wall it sticks in it', st.length === 1 && st[0].stuck === true, st);
  await ev(([x, z]) => { const g = window.__bf.game, a = g.entities.list.find((e) => e.type === 'arrow' && e.trident); if (a) g.teleport(a.x, 121, a.z + 0.8); }, [P0.x, P0.z]);
  await ticks(14);
  const got = await ev(() => window.__bf.game.inventory.slots.some((s) => s && s.id === 'trident'));
  check('trident: a Trident stuck in a wall can be picked up', got && (await tridents()).length === 0, { got });
  // melee: it is a spear
  const melee = await ev(async () => { const I = await import('/src/inventory/ItemRegistry.ts'); const d = I.getItem('trident'); return { type: d.tool.type, atk: d.attack }; });
  check('trident: in the hand it is a spear (long reach) with attack 6.5', melee.type === 'spear' && melee.atk === 6.5, melee);
  // creative: throwing does not use it up
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; });
  await setSlot(0, { id: 'trident', count: 1 }); await ev(() => { window.__bf.game.inventory.selected = 0; window.__bf.game.inventory.changed(); });
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = false; g.teleport(x + 0.5, 121, z + 3.5); window.__bf.aimAt(x + 0.5, 122.5, z - 18); }, [P0.x, P0.y, P0.z]);
  await ticks(3);
  await page.mouse.move(CX, CY); await page.mouse.down({ button: 'right' }); await wait(1000); await page.mouse.up({ button: 'right' }); await ticks(3);
  check('trident: in creative a throw does not use it up', (await inv(0)) === 'tridentx1', await inv(0));
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; for (const e of g.entities.list) if (e.type === 'arrow') e.removed = true; });
}

if (run('stew')) {
  await clearInv();
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.invulnerable = 1e9; g.player.food = 6; g.potions.clear(); });
  await setSlot(0, { id: 'spore_stew', count: 2 });
  await ev(() => { window.__bf.game.inventory.selected = 0; window.__bf.game.inventory.changed(); });
  await ev(() => window.__bf.aimAt(0, 200, 0));
  await ticks(3);
  await centre(); await page.mouse.down({ button: 'right' }); await wait(2600); await page.mouse.up({ button: 'right' });
  await ticks(3);
  const f = await ev(() => { const g = window.__bf.game; return { food: g.player.food, ne: g.potions.has('night_eyes') }; });
  check('stew: Spore Stew fills you up (8 hunger) and gives Night Eyes; Glow Soup earned', f.food >= 14 && f.ne && (await adv('spore_stew')) && (await inv(0)) === 'spore_stewx1', f);
  await ev(() => { const g = window.__bf.game; g.player.food = 6; });
  await setSlot(0, { id: 'sporecap', count: 3 });
  await ticks(2);
  await centre(); await page.mouse.down({ button: 'right' }); await wait(2600); await page.mouse.up({ button: 'right' }); await ticks(3);
  check('stew: a raw Sporecap is a snack (2 hunger)', (await ev(() => window.__bf.game.player.food)) >= 7 && (await inv(0)) === 'sporecapx2', await inv(0));
}

if (run('save')) {
  await ev(([x, z]) => { const g = window.__bf.game, y = g.world.highestSolid(x, z) + 1; g.player.flying = false; g.teleport(x + 0.5, y, z + 0.5); for (const e of g.entities.list) if (e.mobType) e.removed = true; }, [ISLE.x + 2, ISLE.z - 14]);
  await ticks(3);
  const id0 = await ev(() => { const g = window.__bf.game, p = g.player; const m = g.entities.spawnMob('sporecap', p.x + 2, p.y, p.z, g); m.persistent = true; m.shear(g); m.regrow = 2000; return m.id; });
  const rid = await ev(() => window.__bf.game.record.id);
  await reopen(rid);
  const after = await ev(() => { const l = window.__bf.game.entities.list.filter((e) => e.mobType === 'sporecap'); return l.map((m) => ({ sheared: m.sheared, regrow: m.regrow })); });
  const biomeKept = await ev(([x, z]) => window.__bf.game.world.generator.column(x, z - 14).biome, [ISLE.x, ISLE.z]);
  check('save: a sheared Sporecap is still bare after Save and Quit, and the island is still the island', after.length >= 1 && after[0].sheared === true && after[0].regrow > 1000 && biomeKept === 13, { after, biomeKept });
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
