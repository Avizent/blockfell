// Tests for 2.17.0: Capture Orbs, Wildlings, companions and the Creature Ledger.
// node tests/t_v217.mjs   (dev server)   ONLY=items,catch,companion,ledger,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items','catch','companion','ledger','save'];
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

const pad = (r = 7, floor = 'grass') => ev(([r, floor]) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  if (!window.__base || window.__baseWorld !== g.record.id) { window.__base = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }; window.__baseWorld = g.record.id; }
  const { x, y, z } = window.__base;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { for (let dy = -8; dy <= -1; dy++) bf.setBlock(x + dx, y + dy, z + dz, dy === -1 ? floor : 'stone'); for (let dy = 0; dy <= 8; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  p.flying = false;
  g.teleport(x + 0.5, y, z + 0.5); p.yaw = 0; p.pitch = 0; p.vx = p.vz = 0;
  return { x, y, z };
}, [r, floor]);
const tp = (x, y, z, yaw = 0, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.yaw = yaw; g.player.pitch = pitch; g.player.vx = g.player.vy = g.player.vz = 0; }, [x, y, z, yaw, pitch]);
const adv = (id) => ev((id) => window.__bf.game.progress.done.has(id), id);
const stat = (id) => ev((id) => window.__bf.game.progress.stats[id] ?? 0, id);
const setSlot = (slot, stack, select = true) => ev(([slot, stack, select]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; if (select) g.inventory.selected = slot; g.inventory.changed(); }, [slot, stack, select]);
const clearInv = () => ev(() => { const g = window.__bf.game; for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = null; g.inventory.changed(); });
const wear = (slot, id) => ev(([slot, id]) => { const g = window.__bf.game; g.inventory.slots[36 + slot] = id ? { id, count: 1 } : null; g.inventory.changed(); }, [slot, id]);
const pl = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z, vy: p.vy, hp: p.health, freeze: p.freeze, inP: p.inPowder, eyeP: p.eyeInPowder, ground: p.onGround, walker: p.powderWalker }; });
const mortal = () => ev(() => { const g = window.__bf.game; g.player.invulnerable = 0; g.player.health = 20; g.player.gameMode = 'survival'; g.player.freeze = 0; g.difficulty = 'normal'; });

await page.goto(URL);

if (run('items') || run('catch') || run('companion') || run('ledger') || run('save')) await newWorld('WildTest', 'wild217', true);
const spawn = (type, dx, dz, dy = 0) => ev(([type, dx, dz, dy]) => { const g = window.__bf.game; const b = window.__base; const m = g.entities.spawnMob(type, b.x + 0.5 + dx, b.y + dy, b.z + 0.5 + dz, g); m.persistent = true; return true; }, [type, dx, dz, dy]);
const wild = (type) => ev((type) => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === type); return m ? { caught: m.caught, pet: m.petOfPlayer, hp: m.health, panic: m.panic, sitting: m.sitting, x: m.x, z: m.z, fire: m.fireTicks, removed: m.removed } : null; }, type);
const orbAt = (type, hurt) => ev(([type, hurt]) => {
  const g = window.__bf.game; const p = g.player;
  const m = g.entities.list.find((e) => e.mobType === type);
  if (hurt) m.health = hurt;
  const ex = p.x, ey = p.y + 1.5, ez = p.z;
  const dx = m.x - ex, dy = (m.y + 0.3) - ey, dz = m.z - ez; const d = Math.hypot(dx, dy, dz);
  g.entities.spawnOrb(ex + dx / d * 0.4, ey + dy / d * 0.4, ez + dz / d * 0.4, dx / d * 1.2, dy / d * 1.2, dz / d * 1.2, false);
  return true;
}, [type, hurt]);
const orbItems = () => ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack?.id === 'capture_orb').length);

if (run('items')) {
  const info = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const C = await import('/src/world/constants.ts');
    const M = await import('/src/entities/Mob.ts');
    const W = await import('/src/entities/Wildling.ts');
    return {
      ver: C.GAME_VERSION,
      items: I.hasItem('capture_orb') && I.hasItem('creature_ledger') && I.hasItem('spawn_emberling') && I.hasItem('spawn_mossback') && I.hasItem('spawn_stormkit'),
      specs: W.WILD_KINDS.map((k) => M.MOB_SPECS[k] && !M.MOB_SPECS[k].hostile),
      orb: window.__bf.craft([null, 'amber', null, 'amber', 'tide_shard', 'amber', null, 'amber', null]),
      led: window.__bf.craft(['leather', 'feather', 'amber', null, null, null, null, null, null]),
      bad: window.__bf.craft([null, 'amber', null, 'amber', 'stick', 'amber', null, 'amber', null]),
    };
  });
  check('items: version 2.17.0', info.ver === '2.17.0', info);
  check('items: Capture Orb, Creature Ledger and three spawn eggs exist; the Wildlings are peaceful', info.items && info.specs.length === 3 && info.specs.every(Boolean), info);
  check('items: four Amber round a Tide Shard make three Capture Orbs; a stick will not do', info.orb?.id === 'capture_orb' && info.orb?.count === 3 && !info.bad, info);
  check('items: leather, feather and Amber make a Creature Ledger', info.led?.id === 'creature_ledger', info);
}

if (run('catch')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; g.player.invulnerable = 0; g.player.health = 20; });
  await pad(10); await settle();
  await ev(() => { window.__realRandom = Math.random; });
  // chance rises as the creature is hurt
  await spawn('emberling', 5, 0); await fast(2);
  const ch = await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'emberling'); const full = m.catchChance(); m.health = 2; const hurt = m.catchChance(); return { full, hurt }; });
  check('catch: a hurt Wildling is easier to catch than a healthy one', ch.hurt > ch.full && ch.full >= 0.3 && ch.hurt <= 0.95, ch);
  // success
  await ev(() => { window.__bf.game.entities.list.find((e) => e.mobType === 'emberling').hasTarget = false; Math.random = () => 0.01; });
  await orbAt('emberling', 0);
  await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'emberling'); m.health = 2; });
  await fast(12);
  await ev(() => { Math.random = window.__realRandom; });
  const w1 = await wild('emberling');
  check('catch: an orb that holds makes the Wildling your companion', w1?.caught === true && w1.pet === true, w1);
  check('catch: the catch is counted, the advancement is granted and chat says so', (await stat('caught_emberling')) === 1 && (await adv('catch')) && /Caught!/.test(await chat()), await chat());
  // failure
  await spawn('mossback', 5, 3); await fast(2);
  await ev(() => { Math.random = () => 0.99; window.__bf.ui.set({ chat: [] }); });
  await orbAt('mossback', 0); await fast(12);
  await ev(() => { Math.random = window.__realRandom; });
  const w2 = await wild('mossback');
  check('catch: an orb that does not hold lets the Wildling bolt, and the orb is used up', w2?.caught === false && w2.panic > 0 && /wriggled free/.test(await chat()) && (await orbItems()) === 0, { w2, chat: await chat() });
  // a miss and a wrong target give the orb back
  await ev(() => { const g = window.__bf.game; const p = g.player; g.entities.spawnOrb(p.x + 7, p.y + 1.5, p.z + 7, 0, -0.5, 0, false); });
  await fast(15);
  check('catch: an orb that lands on the ground can be picked up again', (await orbItems()) === 1, await orbItems());
  await clearItems();
  await spawn('cow', -5, 0); await fast(2);
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'cow'); m.hasTarget = false; });
  await orbAt('cow', 0); await fast(12);
  check('catch: an orb that hits an ordinary creature changes nothing and drops back', (await orbItems()) === 1 && !(await ev(() => window.__bf.game.entities.list.find((e) => e.mobType === 'cow').petOfPlayer)), await orbItems());
  // the real right-click throws one
  await clearItems();
  await setSlot(0, { id: 'capture_orb', count: 3 });
  await ev(() => { const p = window.__bf.game.player; p.vx = p.vz = 0; });
  await rclick();
  const th = await ev(() => ({ orbs: window.__bf.game.entities.list.filter((e) => e.type === 'orbshot').length, inv: window.__bf.game.inventory.slots[0]?.count, thrown: window.__bf.game.progress.stats.orbs_thrown }));
  check('catch: right-click with an orb throws it and uses one up', th.inv === 2 && th.thrown === 1, th);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'orbshot' || e.type === 'item') e.removed = true; });
}

if (run('companion')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; g.player.invulnerable = 0; g.player.health = 20; Math.random = window.__realRandom ?? Math.random; });
  await pad(14); await settle();
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  const mk = (type) => ev((type) => { const g = window.__bf.game; const b = window.__base; const m = g.entities.spawnMob(type, b.x + 0.5 + 2, b.y, b.z + 0.5, g); m.catchNow(g); return true; }, type);
  await mk('stormkit'); await fast(2);
  // follows you
  await ev(() => { const g = window.__bf.game; const b = window.__base; g.teleport(b.x + 11.5, b.y, b.z + 0.5); });
  await fast(240);
  const f = await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'stormkit'); return { d: Math.hypot(m.x - g.player.x, m.z - g.player.z) }; });
  check('companion: a caught Wildling follows you across the pad', f.d < 6, f);
  // sit and stay
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'stormkit'); m.toggleSit(g); window.__sx = [m.x, m.z]; const b = window.__base; g.teleport(b.x - 10.5, b.y, b.z + 0.5); });
  await fast(160);
  const s = await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'stormkit'); return { moved: Math.hypot(m.x - window.__sx[0], m.z - window.__sx[1]), sitting: m.sitting }; });
  check('companion: a Wildling told to stay stays put', s.sitting && s.moved < 1, s);
  await ev(() => { const g = window.__bf.game; g.entities.list.find((e) => e.mobType === 'stormkit').toggleSit(g); });
  // Stormkit zaps a hostile creature
  await ev(() => { const g = window.__bf.game; const b = window.__base; g.teleport(b.x + 0.5, b.y, b.z + 0.5); const m = g.entities.list.find((e) => e.mobType === 'stormkit'); m.setPos(b.x + 1.5, b.y, b.z + 0.5); m.power = 0; const c = g.entities.spawnMob('crawler', b.x + 6.5, b.y, b.z + 0.5, g); c.persistent = true; c.health = 16; c.attackCooldown = 999; window.__crawler = c; });
  await fast(6);
  const z = await ev(() => window.__crawler.health);
  check('companion: a Stormkit zaps a hostile creature nearby for three damage', z <= 13, z);
  await ev(() => { window.__crawler.removed = true; });
  // Emberling sets one alight
  await mk('emberling'); await fast(2);
  await ev(() => { const g = window.__bf.game; const b = window.__base; const m = g.entities.list.find((e) => e.mobType === 'emberling'); m.power = 0; const c = g.entities.spawnMob('crawler', b.x + 5.5, b.y, b.z + 2.5, g); c.persistent = true; c.attackCooldown = 999; window.__crawler = c; });
  await fast(6);
  const fire = await ev(() => window.__crawler.fireTicks);
  check('companion: an Emberling sets a hostile creature alight', fire > 0, fire);
  await ev(() => { window.__crawler.removed = true; });
  // Mossback mends you
  await mk('mossback'); await fast(2);
  await ev(() => { const g = window.__bf.game; g.player.health = 10; const m = g.entities.list.find((e) => e.mobType === 'mossback'); const b = window.__base; m.setPos(b.x + 1.5, b.y, b.z + 0.5); m.power = 0; });
  await fast(6);
  const hp = await ev(() => window.__bf.game.player.health);
  check('companion: a Mossback mends you while you are close', hp >= 12, hp);
  // feeding mends a hurt companion
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'mossback'); m.health = 5; window.__hp0 = 5; });
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'mossback'); const r = m.feed(g, 'apple'); window.__feed = [r, m.health]; });
  const fd = await ev(() => window.__feed);
  check('companion: an apple mends a caught Wildling', fd[0] === 'healed' && fd[1] === 9, fd);
}

if (run('ledger')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'survival'; g.player.creative = false; Math.random = window.__realRandom ?? Math.random; });
  await pad(10); await settle();
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; const s = window.__bf.game.progress.stats; for (const k of Object.keys(s)) if (/^(seen|caught)_/.test(k)) delete s[k]; window.__bf.ui.set({ chat: [] }); });
  await spawn('mossback', 6, 0); await spawn('emberling', -6, 0); await spawn('stormkit', 0, 6);
  await ev(() => { for (const m of window.__bf.game.entities.list) if (m.mobType) { m.hasTarget = false; m.attackCooldown = 99; } });
  await fast(60);
  check('ledger: Wildlings you see nearby are noted in the Creature Ledger', (await stat('seen_mossback')) > 0 && (await stat('seen_emberling')) > 0 && (await stat('seen_stormkit')) > 0 && /spotted a/.test(await chat()), { c: await chat() });
  check('ledger: seeing all three earns Field Naturalist', await adv('ledger_seen'), 0);
  await setSlot(0, { id: 'creature_ledger', count: 1 });
  await rclick();
  const ov = await overlay();
  check('ledger: right-click with the Creature Ledger opens it', ov === 'ledger', ov);
  await wait(300);
  const dom = await page.evaluate(() => ({ t: document.querySelector('[data-testid=ledger-count]')?.textContent, m: document.querySelector('[data-testid=ledger-mossback]')?.textContent, e: document.querySelector('[data-testid=ledger-emberling]')?.textContent }));
  check('ledger: it lists each Wildling with its status', /Seen 3 of 3/.test(dom.t ?? '') && /Mossback/.test(dom.m ?? '') && /Emberling/.test(dom.e ?? '') && /seen/.test(dom.m ?? ''), dom);
  await page.screenshot({ path: `${SHOTS}/ledger217.png` });
  await ev(() => window.__bf.engine.closeOverlay());
  await ev(() => { const g = window.__bf.game; g.progress.add('caught_stormkit'); });
  await ev(() => window.__bf.ui.set({ overlay: 'ledger' }));
  await wait(300);
  const dom2 = await page.evaluate(() => document.querySelector('[data-testid=ledger-stormkit]')?.textContent);
  check('ledger: a caught Wildling shows its companion power', /caught ×1/.test(dom2 ?? '') && /zaps/i.test(dom2 ?? ''), dom2);
  await ev(() => window.__bf.engine.closeOverlay());
}

if (run('save')) {
  await ev(() => { const g = window.__bf.game; g.player.gameMode = 'creative'; g.player.creative = true; Math.random = window.__realRandom ?? Math.random; });
  const P = await pad(5); await settle();
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type !== 'item') e.removed = true; });
  await spawn('emberling', 2, 0); await fast(2);
  await ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.mobType === 'emberling'); m.catchNow(g); m.toggleSit(g); });
  await fast(4);
  const id = await ev(() => window.__bf.game.record.id);
  await reopen(id);
  await fast(5);
  const back = await wild('emberling');
  check('save: a caught, sitting Wildling is still yours after save and reload', back?.caught === true && back.pet === true && back.sitting === true, back);
}

await b.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join('\n') : 'no console errors');
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
