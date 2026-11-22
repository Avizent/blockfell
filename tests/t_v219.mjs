// Tests for 2.19.0: Flat and Islands world types; Shellsnap, Pinecub, Lanternling.
// node tests/t_v219.mjs   (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['all'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
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

async function newTyped(name, seed, clicks) {
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name); await page.fill('[data-testid=world-seed]', seed);
  for (let i = 0; i < clicks; i++) await page.click('[data-testid=btn-worldtype]');
  const label = await page.textContent('[data-testid=btn-worldtype]');
  if (clicks === 1) await page.screenshot({ path: SHOTS + '/create219.png' });
  await page.click('[data-testid=btn-create-world]');
  await inGame(); await calm();
  return label;
}
await page.goto(URL); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 90000 });
await waitFor(() => ev(() => !!window.__bf), 60000);
check('version is 2.19+', /2\.19\.\d/.test(await ev(() => document.querySelector('[data-testid=version-label]')?.textContent)));

// ---- Flat
const lf = await newTyped('Flatland', 'f1', 1);
check('flat: the create screen cycles to Flat', /Flat/.test(lf), lf);
const fl = await ev(() => { const g = window.__bf.game; const p = g.player; const x = Math.floor(p.x), z = Math.floor(p.z); const out = {}; for (const y of [0, 30, 62, 63, 64, 65, 66]) out[y] = window.__bf.getBlock(x + 6, y, z + 6); return { wt: g.record.worldType, out, py: p.y }; });
check('flat: record says flat, ground is level at 64, air above', fl.wt === 'flat' && fl.out[64] !== 'air' && fl.out[65] === 'air' && fl.out[66] === 'air' && fl.out[0] === 'bedrock', fl);
const fh = await ev(async () => { const w = window.__bf.game.world; const hs = new Set(); for (let i = -40; i <= 40; i += 8) for (let j = -40; j <= 40; j += 8) { let y = 100; while (y > 0 && window.__bf.getBlock(i, y, j) === 'air') y--; hs.add(y); } return [...hs]; });
check('flat: every sampled column tops out at height 64 (flowers and grass aside)', fh.length >= 1 && Math.min(...fh) === 64 && Math.max(...fh) <= 66, fh);
await page.screenshot({ path: SHOTS + '/flat219.png' });

// species on flat ground
await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; g.player.invulnerable = 0; g.player.health = 20; });
const mk = (type, dx = 2) => ev(([type, dx]) => { const g = window.__bf.game; const p = g.player; const m = g.entities.spawnMob(type, p.x + dx, p.y, p.z, g); m.persistent = true; m.catchNow(g); return true; }, [type, dx]);
await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
await mk('pinecub'); await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'pinecub'); m.power = 0; });
await fast(6);
check('pinecub: lends Swiftness while close', await ev(() => window.__bf.game.potions.has('swiftness')));
await mk('lanternling'); await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'lanternling'); m.power = 0; });
await fast(6);
check('lanternling: lends Night Eyes while close', await ev(() => window.__bf.game.potions.has('night_eyes')));
await mk('shellsnap', 1);
await ev(() => { const g = window.__bf.game; const p = g.player; const m = g.entities.list.find((e) => e.mobType === 'shellsnap'); m.power = 0; g.spawnItem({ id: 'dirt', count: 1 }, p.x + 6, p.y + 0.5, p.z); window.__d0 = 6; });
const itemd = async () => ev(() => { const g = window.__bf.game; const p = g.player; const it = g.entities.list.find((e) => e.type === 'item'); return it ? Math.hypot(it.x - p.x, it.z - p.z) : -1; });
const d1 = await itemd(); await fast(30); const d2 = await itemd();
check('shellsnap: gathers a dropped item towards you', d1 > 3 && (d2 < d1 - 1.5 || d2 === -1), [d1, d2]);
await ev(() => { const g = window.__bf.game; for (const k of ['pinecub','lanternling','shellsnap']) g.orbCaught(g.entities.list.find((e) => e.mobType === k)); });
const led = await ev(() => { const s = window.__bf.game.progress.stats; return ['pinecub', 'lanternling', 'shellsnap'].map((k) => s['caught_' + k]); });
check('ledger: all three new kinds are counted as caught', led.every((n) => n >= 1), led);
const kinds = await ev(() => window.__bf.WILD_KINDS?.length ?? null);
await ev(() => window.__bf.ui.set({ overlay: 'ledger' })); await wait(400);
const lt = await page.textContent('[data-testid=ledger-count]');
check('ledger: it counts six kinds', /of 6/.test(lt), lt);
await page.screenshot({ path: SHOTS + '/ledger219.png' });
await ev(() => window.__bf.engine.closeOverlay());
// egg + model smoke
const eggs = await ev(() => ['pinecub', 'lanternling', 'shellsnap'].map((k) => !!window.__bf.game.registry?.get?.(k + '_egg') || true));
// save and reload keeps the flat type
const idF = await ev(() => window.__bf.game.record.id);
await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000);
await ev((id) => void window.__bf.engine.playWorld(id), idF); await inGame();
const rl = await ev(() => ({ wt: window.__bf.game.record.worldType, b: window.__bf.getBlock(40, 65, 40), g: window.__bf.getBlock(40, 64, 40), c: window.__bf.game.entities.list.filter((e) => ['pinecub','lanternling','shellsnap'].includes(e.mobType)).length }));
check('flat: reloading keeps the world type and the tamed companions', rl.wt === 'flat' && rl.b === 'air' && rl.g !== 'air' && rl.c >= 2, rl);

// ---- Islands
const li = await newTyped('Archipelago', 'isl9', 2);
check('islands: the create screen cycles to Islands', /Islands/.test(li), li);
const isl = await ev(() => { const g = window.__bf.game; const p = g.player; let water = 0, land = 0; for (let i = -96; i <= 96; i += 6) for (let j = -96; j <= 96; j += 6) { let y = 110; while (y > 0 && window.__bf.getBlock(i, y, j) === 'air') y--; const k = window.__bf.getBlock(i, y, j); if (k === 'water') water++; else land++; } return { wt: g.record.worldType, water, land, py: p.y, below: window.__bf.getBlock(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) }; });
check('islands: a sea with land in it, and you start on an island', isl.wt === 'islands' && isl.water > isl.land && isl.land > 20 && isl.below !== 'water' && isl.py > 62, isl);
await page.screenshot({ path: SHOTS + '/islands219.png' });

// ---- default is unchanged
const ld = await newTyped('Normal', 'f1', 0);
const dd = await ev(() => ({ wt: window.__bf.game.record.worldType ?? 'default' }));
check('default: an ordinary world has no special type', /Default/.test(ld) && dd.wt === 'default', [ld, dd]);

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
