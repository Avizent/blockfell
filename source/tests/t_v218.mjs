// Tests for 2.18.0: recent-world cards, world thumbnails, Switch World, On Start option.
// node tests/t_v218.mjs   (dev server)   ONLY=all
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


const title = async () => { if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); } await waitFor(async () => (await screen()) === 'title', 40000); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await wait(500); };

await page.goto(URL); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 90000 });
await waitFor(() => ev(() => !!window.__bf), 60000);
check('version is 2.18.x', /2\.18\.\d/.test(await ev(() => window.__bf.GAME_VERSION ?? document.querySelector('[data-testid=version-label]')?.textContent)), await ev(() => document.querySelector('[data-testid=version-label]')?.textContent));

const idA = await newWorld('Alpha World', 'aaa');
await title();
const recA = await ev((id) => window.__bf.engine.saves.getWorld(id), idA);
check('thumb: leaving a world saves a small JPEG snapshot', typeof recA?.thumb === 'string' && recA.thumb.startsWith('data:image/jpeg') && recA.thumb.length > 500 && recA.thumb.length < 40000, recA?.thumb?.slice(0, 40));

const idB = await newWorld('Beta World', 'bbb', true);
await title();
const idC = await newWorld('Gamma World', 'ccc');
await title();
const cards = await ev(() => [...document.querySelectorAll('[data-testid=recent-worlds] .recent-card')].map((c) => ({ name: c.querySelector('.nm').textContent, bg: c.querySelector('.pic').style.backgroundImage.slice(0, 30), t: c.dataset.testid })));
check('cards: the title screen shows the three newest worlds, newest first', cards.length === 3 && /Gamma/.test(cards[0].name) && /Beta/.test(cards[1].name) && /Alpha/.test(cards[2].name), cards);
check('cards: each card shows the world snapshot', cards.every((c) => /data:image\/jpeg/.test(c.bg)), cards);
check('cards: Continue is the first card and Singleplayer became All Worlds', cards[0].t === 'btn-continue' && /All Worlds/.test(await page.textContent('[data-testid=btn-singleplayer]')));
await page.screenshot({ path: SHOTS + '/title218.png' });
const fit = await ev(() => { const r = [...document.querySelectorAll('.screen button, .screen .btn')].map((e) => e.getBoundingClientRect()); const q = [...document.querySelectorAll('button')].find((b) => /Quit Game/.test(b.textContent)); const rr = q?.getBoundingClientRect(); return rr ? { bottom: rr.bottom, h: innerHeight } : null; });
check('cards: Options and Quit Game still fit on the title screen', !!fit && fit.bottom <= fit.h, fit);

await page.click('[data-testid=recent-world]:nth-of-type(2)');
await inGame();
const nm = await ev(() => window.__bf.game.record.name);
check('cards: tapping the second card opens that world', nm === 'Beta World', nm);

await ev(() => window.__bf.engine.openOverlay('pause')); await wait(400);
check('switch: the pause menu has Switch World', !!(await page.$('[data-testid=btn-switch-world]')));
await page.screenshot({ path: SHOTS + '/pause218.png' });
await page.click('[data-testid=btn-switch-world]');
await waitFor(async () => (await screen()) === 'worlds', 40000); await wait(600);
check('switch: it saves and shows the world list', (await screen()) === 'worlds' && !!(await page.$('[data-testid=world-select]')));
const entries = await ev(() => [...document.querySelectorAll('[data-testid=world-entry] .thumb')].map((t) => t.style.backgroundImage.slice(0, 22)));
check('list: world entries show their snapshots', entries.length >= 3 && entries.slice(0, 3).every((e) => /data:image\/jpeg/.test(e)), entries);
await page.screenshot({ path: SHOTS + '/worlds218.png' });
const recB = await ev((id) => window.__bf.engine.saves.getWorld(id), idB);
check('switch: Beta World moved to the top of the recent order', recB.lastPlayed >= (await ev((id) => window.__bf.engine.saves.getWorld(id), idC)).lastPlayed);
await page.click('[data-testid=world-entry]:nth-of-type(2)'); await page.click('[data-testid=btn-play-selected]');
await inGame();
check('switch: another world can be played from the list', !!(await ev(() => window.__bf.game.record.name)));

await title();
const l0 = await page.textContent('[data-testid=btn-reopen-toggle]');
await page.click('[data-testid=btn-reopen-toggle]'); await wait(300);
const l1 = await page.textContent('[data-testid=btn-reopen-toggle]');
const stored = await ev(() => JSON.parse(localStorage.getItem('blockfell.options.v1')).reopenLastWorld);
check('start: Resume toggles On and Off and is remembered', /Resume: On/.test(l0) && /Resume: Off/.test(l1) && stored === false, [l0, l1, stored]);
await page.click('[data-testid=btn-reopen-toggle]'); await wait(200);
check('start: it toggles back', /Resume: On/.test(await page.textContent('[data-testid=btn-reopen-toggle]')));

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
