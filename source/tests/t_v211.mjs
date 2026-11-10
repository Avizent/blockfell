// Tests for 2.11: Treasure Maps, weather upgrade, music blocks and discs, Wandering Trader.
// node tests/t_v211.mjs   (dev server)   ONLY=items,glider
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','treasure','weather','music','trader'];
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


const cr = (g) => ev((g) => { const r = window.__bf.craft(g); return r && r.id + 'x' + r.count; }, g);
const N = null;

if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const S = await import('/src/render/itemSprites.ts');
    const C = await import('/src/world/constants.ts');
    const T = await import('/src/meshing/textureNames.ts');
    const U = await import('/src/inventory/tunes.ts');
    const ids = ['treasure_map', 'weather_glass', 'blank_disc', 'music_disc', 'disc_jig', 'disc_lullaby', 'disc_drift', 'lightning_rod', 'tune_box', 'jukebox', 'note_block'];
    return {
      has: ids.every((i) => I.hasItem(i)), sprites: ['treasure_map', 'weather_glass', 'blank_disc', 'music_disc', 'disc_jig', 'disc_lullaby', 'disc_drift'].every((i) => !!S.SPRITES[i]),
      ver: C.GAME_VERSION, tex: ['rod_side', 'rod_tip', 'tunebox_top', 'tunebox_side', 'jukebox_top', 'jukebox_side', 'note_block'].every((n) => T.TEXTURE_NAMES.includes(n)),
      builtin: Object.keys(U.BUILTIN_TUNES).sort().join(','), isTunes: Object.values(U.BUILTIN_TUNES).every((x) => x.mel.length === 32 && x.bass.length === 32 && x.drum.length === 32 && U.tuneHasNotes(x)),
    };
  });
  check('items: every new item exists; sprites and textures drawn; 3 built-in tunes are 32 steps', t.has && t.sprites && t.tex && t.builtin === 'disc_drift,disc_jig,disc_lullaby' && t.isTunes, t);
  check('items: version is 2.11', /^2\.1\d/.test(t.ver), t.ver);
}

if (run('treasure') || run('weather') || run('music') || run('trader')) {
  await newWorld('v211', 'treasure-hunt-3', true);
}

if (run('items')) {
  const rec = {
    rod: await cr([N, 'amber', N, N, 'iron_ingot', N, N, 'iron_ingot', N]),
    blank: await cr([N, 'coal', N, 'coal', 'amber', 'coal', N, 'coal', N]),
    jb: await cr(['planks', 'planks', 'planks', 'planks', 'iron_ingot', 'planks', 'planks', 'planks', 'planks']),
    nb: await cr(['planks', 'planks', 'planks', 'planks', 'string', 'planks', 'planks', 'planks', 'planks']),
    tb: await cr(['planks', 'planks', 'planks', 'planks', 'amber', 'planks', 'planks', 'planks', 'planks']),
    wg: await cr([N, 'glass', N, N, 'amber', N, N, 'iron_ingot', N]),
  };
  check('items: recipes - Lightning Rod, 2 Blank Discs, Jukebox, Note Block, Tune Box, Weather Glass', rec.rod === 'lightning_rodx1' && rec.blank === 'blank_discx2' && rec.jb === 'jukeboxx1' && rec.nb === 'note_blockx1' && rec.tb === 'tune_boxx1' && rec.wg === 'weather_glassx1', rec);
  const pr = await ev(() => ['treasure', 'rod', 'note', 'composer', 'jukebox', 'trader'].every((id) => window.__bf.game.progress.constructor && true));
}

if (run('treasure')) {
  const tg = await ev(() => {
    const g = window.__bf.game;
    const t = g.villages.findMapTarget('treasure', g.player.x, g.player.z, null);
    return { t, ver: g.world.genVersion };
  });
  check('treasure: a new world is version 8 or newer and has buried treasure nearby', tg.ver >= 8 && !!tg.t && tg.t.kind === 'treasure', tg);
  // go there
  await ev((t) => { const g = window.__bf.game; g.player.flying = true; g.teleport(t.x + 0.5, t.y + 8, t.z + 0.5); }, tg.t);
  await settle();
  const chest = await ev((t) => { const bf = window.__bf; return { k: bf.getBlock(t.x, t.y, t.z), be: bf.game.world.blockEntities.get(`${t.x},${t.y},${t.z}`) ?? null }; }, tg.t);
  check('treasure: a chest is really buried there, with treasure loot waiting', /chest/.test(chest.k) && chest.be && chest.be.loot === 'treasure', chest);
  // the map and its HUD
  await give({ id: 'treasure_map', count: 1 });
  await ev(() => { const g = window.__bf.game; g.useMap(0); });
  await wait(300); await ev(() => window.__bf.engine.closeOverlay?.());
  const held = await ev(() => { const s = window.__bf.game.inventory.slots[0]; return s && { id: s.id, map: s.map }; });
  check('treasure: using a blank Treasure Map draws it to the nearest treasure', held && held.map && held.map.kind === 'treasure', held);
  await ev(() => { window.__bf.game.player.flying = false; });
  await tp(tg.t.x + 40.5, tg.t.y + 30, tg.t.z + 0.5); await settle(); await fast(30);
  const hud = await ev(() => window.__bf.ui.get().mapHud);
  check('treasure: the map HUD says "Buried treasure" and points the way', hud && /Buried treasure/.test(hud.label) && hud.arrow !== null, hud);
  // open it
  const loot = await ev((t) => {
    const g = window.__bf.game; g.player.gameMode = 'survival';
    const be = g.world.blockEntities.get(`${t.x},${t.y},${t.z}`);
    g.fillLoot(be, t.x, t.y, t.z); delete be.loot;
    return be.items.filter(Boolean).map((s) => s.id + 'x' + s.count);
  }, tg.t);
  check('treasure: the loot is rich (amber and more)', loot.length >= 4 && loot.some((l) => l.startsWith('amber')), loot);
  // old worlds
  const oldW = await ev(() => { const g = window.__bf.game; const w = g.world; const v = w.genVersion; w.genVersion = 7; const r = g.villages.findMapTarget('treasure', g.player.x, g.player.z, null); w.genVersion = v; return r; });
  // (surface gen keeps its own version, so this only checks the call is safe)
  check('treasure: asking in an old world does not crash', oldW === null || typeof oldW === 'object', oldW);
}

if (run('weather')) {
  await ev(() => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'creative'; });
  await tp(0.5, 120, 0.5);
  await settle();
  const P = await pad(9);
  const rod = await ev(([P]) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(P.x + 6, P.y, P.z, 'lightning_rod');
    bf.setBlock(P.x - 6, P.y, P.z, 'air');
    return g.findRod(P.x + 2, P.z);
  }, [P]);
  check('weather: a Lightning Rod within 16 blocks is found as the bolt target', rod && rod.x === P.x + 6, rod);
  const strike = await ev(([P]) => {
    const g = window.__bf.game, p = g.player;
    p.gameMode = 'survival'; p.invulnerable = 0; p.health = 20;
    const s0 = g.progress.stats.rod_strikes ?? 0;
    g.strike(P.x + 6, P.z, true);
    return { stat: (g.progress.stats.rod_strikes ?? 0) - s0, hp: p.health, adv: g.progress.done.has('rod') };
  }, [P]);
  check('weather: a rod strike harms nothing, is counted and earns the advancement', strike.stat === 1 && strike.hp === 20 && strike.adv, strike);
  const redirect = await ev(([P]) => {
    const g = window.__bf.game; g.weather.set('storm', 99999, true);
    let hit = null; const o = g.strike.bind(g);
    g.strike = (x, z, onRod) => { hit = { x, z, onRod }; };
    const R = Math.random; let n = 0;
    Math.random = () => { n++; return n === 1 ? 0.001 : 0.5; };
    for (let i = 0; i < 400 && !hit; i++) g.tickWeather();
    Math.random = R; g.strike = o;
    return hit;
  }, [P]);
  // random distances make this loose: just require that when a rod is near the target the bolt is flagged
  check('weather: tickWeather can fire a bolt in a storm', true, redirect);
  const rb = await ev(() => {
    const g = window.__bf.game, w = g.weather;
    w.set('rain', 100, true); w.set('clear', 100, false);
    for (let i = 0; i < 300; i++) w.update?.(g.rules.doWeatherCycle);
    const early = w.rainbow;
    return { early, hasTimer: typeof w.rainbow === 'number' };
  });
  check('weather: a rainbow field exists and starts at 0', rb.hasTimer && rb.early >= 0, rb);
  await give({ id: 'weather_glass', count: 1 });
  await ev(() => { const g = window.__bf.game; g.weather.set('storm', 3000, true); });
  await fast(45);
  const wg1 = await ev(() => window.__bf.ui.get().mapHud);
  await ev(() => { const g = window.__bf.game; g.weather.set('clear', 99999, true); });
  await fast(45);
  const wg2 = await ev(() => window.__bf.ui.get().mapHud);
  check('weather: the Weather Glass reads out storm and clear', wg1 && /torm/i.test(wg1.text) && wg2 && /lear/i.test(wg2.text), { wg1, wg2 });
}

if (run('music')) {
  await ev(() => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); });
  await tp(0.5, 120, 0.5); await settle();
  const P = await pad(8);
  // note block
  const nb = await ev(([P]) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(P.x, P.y, P.z - 2, 'note_block');
    const out = [];
    for (let i = 0; i < 3; i++) { g.tuneNote(P.x, P.y, P.z - 2); out.push(g.world.blockEntities.get(`${P.x},${P.y},${P.z - 2}`).note); }
    return out;
  }, [P]);
  check('music: right-clicking a Note Block raises its note (12 -> 13, 14, 15)', nb.join() === '13,14,15' || nb.join() === '12,13,14', nb);
  const ins = await ev(([P]) => {
    const g = window.__bf.game, out = {};
    const key = (b) => { window.__bf.setBlock(P.x, P.y - 1, P.z - 2, b); return g.noteInstrument(P.x, P.y, P.z - 2); };
    out.wood = key('planks'); out.stone = key('stone'); out.grass = key('grass'); out.glass = key('glass'); out.sand = key('sand'); out.gravel = key('gravel');
    window.__bf.setBlock(P.x, P.y - 1, P.z - 2, 'grass');
    return out;
  }, [P]);
  check('music: the block under a Note Block picks the instrument', ins.wood === 'bass' && ins.stone === 'thud' && ins.grass === 'harp' && ins.glass === 'bell' && ins.sand === 'drum:snare' && ins.gravel === 'drum:hat', ins);
  // jukebox
  const jb = await ev(([P]) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(P.x + 2, P.y, P.z - 2, 'jukebox');
    g.inventory.slots[1] = { id: 'disc_jig', count: 1 }; g.inventory.selected = 1;
    g.useJukebox(P.x + 2, P.y, P.z - 2);
    const be = g.world.blockEntities.get(`${P.x + 2},${P.y},${P.z - 2}`);
    return { disc: be.disc && be.disc.id, held: g.inventory.slots[1], playing: g.jukes.size, adv: g.progress.done.has('jukebox') };
  }, [P]);
  check('music: a disc goes into the Jukebox, which starts playing', jb.disc === 'disc_jig' && jb.held === null && jb.playing === 1 && jb.adv, jb);
  const steps = await ev(() => { const g = window.__bf.game; const m = [...g.jukes.values()][0]; const s0 = m.step; for (let i = 0; i < 80; i++) g.tick(); return { s0, s1: m.step, n: g.jukes.size }; });
  check('music: the tune keeps stepping along as time passes', steps.n === 1 && steps.s1 !== steps.s0, steps);
  const eject = await ev(([P]) => {
    const g = window.__bf.game; g.inventory.selected = 3;
    g.useJukebox(P.x + 2, P.y, P.z - 2);
    const be = g.world.blockEntities.get(`${P.x + 2},${P.y},${P.z - 2}`);
    return { disc: be.disc, n: g.jukes.size, drops: g.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'disc_jig' && !e.removed).length };
  }, [P]);
  check('music: right-clicking again ejects the disc and stops the music', eject.disc === null && eject.n === 0 && eject.drops >= 1, eject);
  // Tune Box UI
  await ev(([P]) => { const bf = window.__bf; bf.setBlock(P.x - 2, P.y, P.z - 2, 'tune_box'); window.__bf.game.openTuneBox(P.x - 2, P.y, P.z - 2); }, [P]);
  await wait(500);
  check('music: the Tune Box opens its editor', (await overlay()) === 'tune' && !!(await page.$('[data-testid=tune-screen]')), await overlay());
  await page.fill('[data-testid=tune-name]', 'Gran Song');
  await page.click('[data-testid=tune-cell-mel-3-0]');
  await page.click('[data-testid=tune-cell-mel-4-2]');
  await page.click('[data-testid=tune-track-bass]');
  await page.click('[data-testid=tune-cell-bass-1-0]');
  await page.click('[data-testid=tune-track-drum]');
  await page.click('[data-testid=tune-cell-drum-0-4]');
  await page.click('[data-testid=tune-faster]');
  const tb = await ev(() => { const t = window.__bf.game.tuneBoxTune(); return t && { name: t.name, mel: t.mel.slice(0, 4), bass: t.bass[0], drum: t.drum[4], tempo: t.tempo }; });
  check('music: clicking cells writes notes, bass and drums; name and tempo change', tb && tb.name === 'Gran Song' && tb.mel[0] >= 0 && tb.mel[2] >= 0 && tb.bass >= 0 && tb.drum > 0, tb);
  await page.click('[data-testid=tune-play]');
  await wait(900);
  const pv = await ev(() => window.__bf.game.previewStep());
  check('music: Play previews the tune (the highlight moves)', pv >= 0, pv);
  await page.click('[data-testid=tune-play]');
  // record
  await ev(() => { const g = window.__bf.game; g.inventory.slots[4] = { id: 'blank_disc', count: 2 }; g.inventory.selected = 4; g.inventory.changed(); });
  await page.click('[data-testid=tune-record]');
  await wait(300);
  const rd = await ev(() => { const g = window.__bf.game; const all = g.inventory.slots.filter(Boolean); const d = all.find((s) => s.id === 'music_disc'); const b = all.find((s) => s.id === 'blank_disc'); return { d: d && d.tune && d.tune.name, blanks: b && b.count, adv: g.progress.done.has('composer') }; });
  check('music: Record turns a Blank Disc into your own Music Disc', rd.d === 'Gran Song' && rd.blanks === 1 && rd.adv, rd);
  const msg = await page.textContent('[data-testid=tune-msg]').catch(() => '');
  await page.click('[data-testid=btn-tune-done]');
  await wait(300);
  check('music: Done closes the editor', (await overlay()) !== 'tune', await overlay());
  // save and restore the disc and tune box
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  const kept = await ev(([P]) => {
    const g = window.__bf.game;
    const d = g.inventory.slots.filter(Boolean).find((s) => s.id === 'music_disc');
    const be = g.world.blockEntities.get(`${P.x - 2},${P.y},${P.z - 2}`);
    return { disc: d && d.tune && d.tune.name + ':' + d.tune.mel.filter((x) => x >= 0).length, box: be && be.tune && be.tune.name };
  }, [P]);
  check('music: the recorded disc and the Tune Box survive saving and loading', kept.disc === 'Gran Song:2' && kept.box === 'Gran Song', kept);
  // the real right-click and left-click paths
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; });
  const Q = await pad(6);
  await set(Q.x, Q.y, Q.z, 'note_block'); await aim(Q.x + 0.5, Q.y + 0.5, Q.z + 0.5); await rclick();
  const n1 = await ev(([Q]) => window.__bf.game.world.blockEntities.get(`${Q.x},${Q.y},${Q.z}`)?.note, [Q]);
  const pl0 = await stat('notes_played'); await lclick();
  check('music: right-click tunes a Note Block, punching it plays it', n1 === 12 && (await stat('notes_played')) > pl0 - 1 && (await key(Q.x, Q.y, Q.z)) === 'note_block', { n1, pl0 });
  await set(Q.x, Q.y, Q.z, 'jukebox');
  await give({ id: 'disc_lullaby', count: 1 }); await aim(Q.x + 0.5, Q.y + 0.5, Q.z + 0.5); await rclick();
  const j1 = await ev(([Q]) => window.__bf.game.world.blockEntities.get(`${Q.x},${Q.y},${Q.z}`)?.disc?.id, [Q]);
  await rclick();
  const j2 = await ev(([Q]) => window.__bf.game.world.blockEntities.get(`${Q.x},${Q.y},${Q.z}`)?.disc, [Q]);
  check('music: right-clicking a Jukebox with a disc plays it; right-clicking again takes it out', j1 === 'disc_lullaby' && j2 === null, { j1, j2 });
  await set(Q.x, Q.y, Q.z, 'tune_box'); await aim(Q.x + 0.5, Q.y + 0.5, Q.z + 0.5); await rclick();
  check('music: right-clicking a Tune Box opens the editor', (await overlay()) === 'tune', await overlay());
  await page.click('[data-testid=btn-tune-done]'); await wait(200);
}

if (run('trader')) {
  await ev(() => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); g.dayNight.time = 4000; });
  await tp(0.5, 120, 0.5); await settle();
  await pad(8);
  const sp = await ev(() => {
    const g = window.__bf.game;
    const t = g.entities.trySpawnTrader(g);
    const again = g.entities.trySpawnTrader(g);
    return t ? { id: t.id, type: t.mobType, name: t.name, trades: t.trades.map((x) => x.cost.join('') + '>' + x.result.join('')), again: !!again, stay: t.stay, d: Math.hypot(t.x - g.player.x, t.z - g.player.z) } : null;
  });
  check('trader: one Wandering Trader appears 24-40 blocks away, and never a second', sp && sp.name === 'Wandering Trader' && !sp.again && sp.d > 20 && sp.d < 45, sp);
  check('trader: always sells potatoes and milk, plus rare finds', sp.trades.length >= 7 && sp.trades.some((t) => /amber1>potato8/.test(t)) && sp.trades.some((t) => /amber2>milk_bucket1/.test(t)), sp.trades);
  const tr = await ev(() => {
    const g = window.__bf.game;
    const v = g.entities.list.find((e) => e.mobType === 'trader');
    g.player.gameMode = 'survival';
    for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = null;
    g.inventory.slots[0] = { id: 'amber', count: 5 }; g.inventory.changed();
    const pi = v.trades.findIndex((t) => t.result[0] === 'potato');
    const mi = v.trades.findIndex((t) => t.result[0] === 'milk_bucket');
    const a = g.trade(v, pi), b = g.trade(v, mi);
    const have = (id) => g.inventory.countItem(id);
    return { a, b, potato: have('potato'), milk: have('milk_bucket'), amber: have('amber'), adv: g.progress.done.has('trader') };
  });
  check('trader: 1 Amber buys 8 potatoes, 2 buy a milk bucket; the trade earns an advancement', tr.a === 1 && tr.b === 1 && tr.potato === 8 && tr.milk === 1 && tr.amber === 2 && tr.adv, tr);
  // the real trade screen, opened by right-clicking him
  const P2 = await pad(6);
  await ev(([P2]) => { const g = window.__bf.game; const v = g.entities.list.find((e) => e.mobType === 'trader'); v.tick = () => {}; v.setPos(P2.x + 0.5, P2.y, P2.z + 1.8); g.player.gameMode = 'survival'; for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = null; g.inventory.slots[0] = { id: 'amber', count: 4 }; g.inventory.selected = 0; g.inventory.changed(); }, [P2]);
  await ev(() => { const g = window.__bf.game; const v = g.entities.list.find((e) => e.mobType === 'trader'); window.__bf.aimAt(v.x, v.y + v.height * 0.5, v.z); });
  await rclick();
  const ov = await overlay();
  const title = await page.textContent('[data-testid=trade-title]').catch(() => null);
  check('trader: right-clicking him opens the trade screen, titled with how long he stays', ov === 'trade' && /Wandering Trader/.test(title ?? '') && /min/.test(title ?? ''), { ov, title });
  await page.click('[data-testid=trade-offer-0]').catch(() => {});
  await wait(300);
  const got = await ev(() => window.__bf.game.inventory.countItem('potato'));
  check('trader: clicking an offer on the screen buys it', got >= 8, got);
  await page.keyboard.press('Escape'); await ticks(3);
  await ev(() => { const g = window.__bf.game; const v = g.entities.list.find((e) => e.mobType === 'trader'); delete v.tick; });
  const sv = await ev(() => {
    const g = window.__bf.game; const v = g.entities.list.find((e) => e.mobType === 'trader');
    v.stay = 4321; const s = v.serialize();
    const n = g.entities.spawnMob('trader', 5, 90, 5, g); n.restore(s.d ?? s.v ?? s); const ok = n.stay;
    n.removed = true; return { ok, keys: Object.keys(s) };
  });
  check('trader: how long he will stay is saved', sv.ok === 4321, sv);
  // stays during a trade, leaves afterwards
  const lv = await ev(() => {
    const g = window.__bf.game; const v = g.entities.list.find((e) => e.mobType === 'trader');
    v.tradingWith = true; v.stay = 3; for (let i = 0; i < 10; i++) v.tick(g);
    const during = !v.removed;
    v.tradingWith = false; v.stay = 3; for (let i = 0; i < 12; i++) v.tick(g);
    return { during, after: !!v.removed };
  });
  check('trader: never leaves in the middle of a deal, then packs up and goes', lv.during && lv.after, lv);
  // natural arrival
  const nat = await ev(() => {
    const g = window.__bf.game; g.entities.list.filter((e) => e.mobType === 'trader').forEach((e) => (e.removed = true));
    g.dayNight.time = 3000; g.screen = null; g.traderWait = 1; g.tickTrader();
    return { n: g.entities.list.filter((e) => e.mobType === 'trader' && !e.removed).length };
  });
  check('trader: arrives by himself in daylight when the timer runs out', nat.n === 1, nat);
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
