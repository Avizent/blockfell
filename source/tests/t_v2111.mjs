// Tests for 2.11.1 (player name tags): Treasure Maps, weather upgrade, music blocks and discs, Wandering Trader.
// node tests/t_v211.mjs   (dev server)   ONLY=items,glider
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['name'];
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



if (run('name')) {
  await newWorld('v2111', 'nametag-self-1', true);
  await ev(() => { const g = window.__bf.game; g.player.flying = false; g.player.gameMode = 'survival'; });
  await tp(0.5, 120, 0.5); await settle();
  const P = await pad(6);
  await give({ id: 'name_tag', count: 2 });
  await ev(() => { window.__bf.aimAt(window.__bf.game.player.x, window.__bf.game.player.eyeY + 8, window.__bf.game.player.z - 3); });
  await rclick();
  check('name: a Name Tag used on nothing opens the naming screen for you', (await overlay()) === 'nametag' && /Write your name/.test(await page.textContent('[data-testid=nametag-screen]')), await overlay());
  await page.fill('[data-testid=nametag-input]', 'Grandad');
  await page.click('[data-testid=btn-nametag-done]'); await wait(300);
  const st = await ev(() => { const g = window.__bf.game; return { name: g.player.name, left: g.inventory.slots[0] && g.inventory.slots[0].count, view: g.viewMode, adv: g.progress.done.has('nametag') }; });
  check('name: you are named, one tag is used up, and the view switches to the front', st.name === 'Grandad' && st.left === 1 && st.view === 2 && st.adv, st);
  await ticks(4);
  const vis = await ev(() => { const g = window.__bf.game; g.viewMode = 2; const b = g.body; return { show: b.group.visible, plate: !!b.plate, hand: g.hand.root.visible }; });
  await wait(500);
  const vis2 = await ev(() => { const g = window.__bf.game; const b = g.body; return { show: b.group.visible, plate: !!b.plate && b.plate.name, hand: g.hand.root.visible }; });
  check('name: in the third-person views your body and floating name are drawn and the hand is hidden', vis2.show && vis2.plate === 'Grandad' && !vis2.hand, vis2);
  await page.keyboard.press('KeyV'); await ticks(3);
  const cyc = await ev(() => window.__bf.game.viewMode);
  check('name: V cycles the views (front, then first person)', cyc === 0, cyc);
  await page.screenshot({ path: SHOTS + '/name_first.png' });
  await ev(() => { const g = window.__bf.game; g.viewMode = 2; g.player.yaw = 0.3; g.player.pitch = 0.12; });
  await wait(600);
  await page.screenshot({ path: SHOTS + '/name_front.png' });
  await ev(() => { window.__bf.game.viewMode = 1; }); await wait(600);
  await page.screenshot({ path: SHOTS + '/name_behind.png' });
  await ev(() => { window.__bf.game.viewMode = 0; });
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  const kept = await ev(() => window.__bf.game.player.name);
  check('name: your name is saved with the world', kept === 'Grandad', kept);
}
await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
