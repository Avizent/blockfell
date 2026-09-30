// Tests for 1.3: weather (rain, snow, thunderstorms, lightning) and the Fellhound
// companion. Run against the dev server: node tests/t_weather.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 5000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(640, 360); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(640, 360, { button: 'right' }); await ticks(3); await wait(100); };
const lclick = async () => { await centre(); await page.mouse.click(640, 360); await ticks(3); await wait(100); };
const run = (name) => !only || only.includes(name);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Weather Test');
await page.fill('[data-testid=world-seed]', 'villages');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
await wait(2500);

const give = (id, slot = 0, count = 64) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const count = (id) => ev((id) => window.__bf.game.inventory.countItem(id), id);
const setMode = (m) => ev((m) => { const g = window.__bf.game; g.setGameMode(m); g.player.flying = false; }, m);

// A flat grass test area 3 blocks above the ground at spawn, open to the sky, around noon.
const base = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.rules.doMobSpawning = false;
  g.rules.doDaylightCycle = false;
  g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true);
  for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 3;
  for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
    bf.setBlock(x0 + dx, y - 1, z0 + dz, 'stone');
    bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
    for (let k = 1; k <= 10; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  g.setGameMode('survival'); g.player.flying = false;
  g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  g.dayNight.time = 6000;
  return { x: x0, y, z: z0 };
});
await wait(1500);
const Y = base.y + 1;
const hounds = () => ev(() => window.__bf.game.entities.list.filter((e) => e.mobType === 'hound' && e.alive && !e.removed).map((e) => ({ id: e.id, tamed: e.tamed, sitting: e.sitting, x: e.x, y: e.y, z: e.z, h: e.health, anger: e.anger })));
const hound = (id) => ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); return e ? { id: e.id, tamed: e.tamed, sitting: e.sitting, x: e.x, y: e.y, z: e.z, h: e.health, alive: e.alive && !e.removed, anger: e.anger } : null; }, id);

// ================================================================== WEATHER
if (run('weather')) {
  const w0 = await ev(() => window.__bf.game.weather.save());
  check('worlds have weather', w0 && typeof w0.kind === 'string' && w0.timer > 0, w0);
  // clear -> rain fades in
  await ev(() => window.__bf.game.setWeather('rain'));
  const r1 = await ev(() => window.__bf.game.weather.rain);
  await fast(120);
  const r2 = await ev(() => window.__bf.game.weather.rain);
  check('rain fades in over a few seconds', r1 < 0.1 && r2 > 0.99, { r1, r2 });
  await wait(1500);
  const vis = await ev(() => window.__bf.game.precip.stats);
  check('rain falls around the player', vis.rain > 150, vis);
  await shot('w_rain');
  // darker sky
  const lightRain = await ev(() => window.__bf.game.dayNight.light.daylight);
  await ev(() => window.__bf.game.weather.set('clear', 99999, true)); await wait(800);
  const lightClear = await ev(() => window.__bf.game.dayNight.light.daylight);
  await ev(() => window.__bf.game.weather.set('thunder', 99999, true)); await wait(800);
  const lightStorm = await ev(() => window.__bf.game.dayNight.light.daylight);
  check('rain darkens the day, storms more so', lightClear > lightRain + 0.1 && lightRain > lightStorm + 0.1, { lightClear, lightRain, lightStorm });
  const skyClear = await ev(() => window.__bf.game.dayNight.sky.clear);
  check('the sun is hidden behind the clouds in a storm', skyClear < 0.05, skyClear);
  // a roof keeps the rain off
  await ev((b) => { const bf = window.__bf; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) bf.setBlock(b.x + 6 + dx, b.y + 4, b.z + dz, 'planks'); }, base);
  const roof = await ev((b) => { const g = window.__bf.game; return { under: g.rainingOn(b.x + 6, b.y + 1, b.z), open: g.rainingOn(b.x - 6, b.y + 1, b.z) }; }, base);
  check('a roof keeps the rain off; open ground gets wet', roof.under === false && roof.open === true, roof);
  // dry and cold places
  const places = await ev(() => {
    const g = window.__bf.game, gen = g.world.generator;
    const found = {};
    for (let r = 32; r < 2400 && (!found.desert || !found.snow); r += 24) for (let a = 0; a < 32; a++) {
      const x = Math.floor(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 32 * Math.PI * 2) * r);
      const c = gen.column(x, z);
      if (!found.desert && c.biome === 4) found.desert = { x, z, p: g.precipAt(x, z) };
      if (!found.snow && c.biome === 6) found.snow = { x, z, p: g.precipAt(x, z) };
    }
    const here = g.precipAt(Math.floor(g.player.x), Math.floor(g.player.z));
    return { ...found, here };
  });
  check('no rain falls in deserts', places.desert && places.desert.p === 0, places.desert);
  check('snow falls in snowy lands', places.snow && places.snow.p === 2, places.snow);
  // weather cycle
  const cyc = await ev(() => {
    const g = window.__bf.game;
    g.rules.doWeatherCycle = true;
    g.weather.set('rain', 2, true);
    for (let i = 0; i < 5; i++) g.tick();
    const after = g.weather.kind;
    g.rules.doWeatherCycle = false;
    g.weather.set('rain', 2, true);
    for (let i = 0; i < 5; i++) g.tick();
    return { after, off: g.weather.kind };
  });
  check('the weather changes by itself when the spell ends', cyc.after === 'clear', cyc);
  check('with Weather Cycle off it stays as it is', cyc.off === 'rain', cyc);
}

if (run('lightning')) {
  await ev(() => window.__bf.game.weather.set('thunder', 99999, true));
  const hit = await ev((b) => {
    const g = window.__bf.game;
    const pig = g.entities.spawnMob('pig', b.x - 6.5, b.y + 1, b.z + 6.5, g);
    const h0 = pig.health;
    g.strike(b.x - 7, b.z + 6);
    return { h0, h: pig.health, strike: g.lastStrike, adv: g.progress.done.has('storm') };
  }, base);
  check('lightning hurts creatures it strikes', hit.h < hit.h0, hit);
  check('lightning strikes the top of the ground', hit.strike && hit.strike.y === base.y + 1, hit.strike);
  check('seeing a strike close by earns "Storm Watcher"', hit.adv, hit);
  await wait(60);
  await aim(base.x - 7, base.y + 8, base.z + 6);
  await ev((b) => window.__bf.game.strike(b.x - 7, b.z + 6), base);
  await wait(90);
  const bolt = await ev(() => window.__bf.game.precip.boltCount);
  check('a bolt of lightning is drawn', bolt > 0, bolt);
  await shot('w_lightning');
  // storms bring lightning on their own
  const natural = await ev(() => {
    const g = window.__bf.game;
    let strikes = 0, last = g.lastStrike;
    for (let i = 0; i < 3000; i++) { g.tick(); if (g.lastStrike !== last) { strikes++; last = g.lastStrike; } }
    return strikes;
  });
  check('thunderstorms bring lightning', natural >= 3, natural);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'pig') e.removed = true; });
}

if (run('gameplay')) {
  await setMode('creative');   // creatures in these tests leave a Creative tester alone
  // undead don't burn in the rain
  const burn = await ev((b) => {
    const g = window.__bf.game;
    g.dayNight.time = 6000;
    g.weather.set('rain', 99999, true);
    const s = g.entities.spawnMob('shambler', b.x + 8.5, b.y + 1, b.z - 8.5, g);
    s.persistent = true;
    for (let i = 0; i < 120; i++) g.tick();
    const wet = s.health;
    g.weather.set('clear', 99999, true);
    for (let i = 0; i < 120; i++) g.tick();
    const dry = s.health;
    s.removed = true;
    return { wet, dry };
  }, base);
  check('Shamblers don\'t burn in the rain, but do in the sun', burn.wet === 20 && burn.dry < 20, burn);
  // rain waters farmland and speeds up crops
  const farm = await ev((b) => {
    const bf = window.__bf, g = bf.game;
    g.weather.set('rain', 99999, true);
    bf.setBlock(b.x - 10, b.y, b.z - 10, 'farmland');
    const id = bf.B.blockByKey('farmland').id;
    g.randomTick(b.x - 10, b.y, b.z - 10, id);
    const moist = bf.getBlock(b.x - 10, b.y, b.z - 10);
    const cropWet = g.rainingOn(b.x - 10, b.y + 1, b.z - 10);
    g.weather.set('clear', 99999, true);
    return { moist, cropWet };
  }, base);
  check('rain waters farmland', farm.moist === 'farmland_moist', farm);
  check('crops in the rain count as watered', farm.cropWet === true, farm);
  // thunderstorms let creatures appear in the open by day
  const spawns = await ev(async (b) => {
    const g = window.__bf.game;
    const surface = () => g.entities.list.filter((e) => e.spec?.hostile && e.alive && e.y >= g.rainTop(Math.floor(e.x), Math.floor(e.z))).length;
    for (const e of g.entities.list) if (e.spec?.hostile) e.removed = true;
    g.setGameMode('creative'); g.player.flying = false;   // so the creatures that appear leave the tester alone
    g.dayNight.time = 6000;
    g.weather.set('clear', 99999, true);
    await new Promise((r) => setTimeout(r, 600));
    g.rules.doMobSpawning = true;
    for (let i = 0; i < 1500; i++) g.tick();
    const clear = surface();
    for (const e of g.entities.list) if (e.spec?.hostile) e.removed = true;
    g.weather.set('thunder', 99999, true);
    await new Promise((r) => setTimeout(r, 600));
    for (let i = 0; i < 1500; i++) g.tick();
    const storm = surface();
    g.rules.doMobSpawning = false;
    for (const e of g.entities.list) if (e.mobType) e.removed = true;
    g.setGameMode('survival'); g.player.flying = false; g.player.health = 20;
    return { clear, storm };
  }, base);
  check('in a thunderstorm hostile creatures can appear in the open by day', spawns.clear === 0 && spawns.storm > 0, spawns);
  // sleeping through a storm
  const sleep = await ev((b) => {
    const bf = window.__bf, g = bf.game;
    g.dayNight.time = 6000;
    g.weather.set('thunder', 99999, true);
    bf.setBlock(b.x + 2, b.y + 1, b.z + 2, 'bed:foot:e'); bf.setBlock(b.x + 3, b.y + 1, b.z + 2, 'bed:head:e');
    g.teleport(b.x + 1.5, b.y + 1, b.z + 2.5);
    g.trySleep(b.x + 2, b.y + 1, b.z + 2);
    const slept = g.sleepTicks > 0;
    for (let i = 0; i < 110; i++) g.tick();
    return { slept, weather: g.weather.kind, tod: g.dayNight.timeOfDay };
  }, base);
  check('you can sleep during a daytime thunderstorm', sleep.slept, sleep);
  check('sleeping clears the storm and brings the next morning', sleep.weather === 'clear' && sleep.tod < 1000, sleep);
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 6000; if (window.__bf.state().overlay) window.__bf.engine.closeOverlay(); });
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); }, base);
  // weather in the Options screen (Creative only)
  await setMode('creative');
  await page.keyboard.press('Escape'); await wait(300);
  await page.click('text=Options...'); await wait(400);
  const before = await ev(() => window.__bf.game.weather.kind);
  await page.click('[data-testid=btn-weather]'); await wait(200);
  const after = await ev(() => window.__bf.game.weather.kind);
  check('Creative players can change the weather in Options', before !== after, { before, after });
  await shot('w_options');
  await page.click('[data-testid=btn-options-done]'); await wait(300);
  await page.keyboard.press('Escape'); await wait(300);
  await ev(() => { if (window.__bf.state().overlay) window.__bf.engine.closeOverlay(); });
  await wait(200);
  await setMode('survival');
  await ev(() => { const g = window.__bf.game; g.weather.set('clear', 99999, true); g.player.health = 20; });
}

// ================================================================== FELLHOUND
let tamedId = null;
if (run('hound')) {
  await ev(() => { const g = window.__bf.game; g.dayNight.time = 6000; g.weather.set('clear', 99999, true); for (const e of g.entities.list) if (e.mobType) e.removed = true; g.player.health = 20; g.player.food = 20; });
  await ev((b) => { const bf = window.__bf; for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) { bf.setBlock(b.x + dx, b.y, b.z + dz, 'grass'); for (let k = 1; k <= 10; k++) bf.setBlock(b.x + dx, b.y + k, b.z + dz, 'air'); } }, base);
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); g.player.yaw = 0; g.player.pitch = 0; }, base);
  await wait(500);
  // spawn egg
  await setMode('creative');
  await give('spawn_hound', 0, 1);
  await aim(base.x + 0.5, base.y + 1, base.z - 3 + 0.5);
  await rclick();
  const hs = await hounds();
  const st = await ev(() => { const g = window.__bf.game; return { ov: window.__bf.state().overlay, t: window.__bf.state().target, mode: g.player.gameMode, sel: g.inventory.selectedStack, sleep: g.sleepTicks, dead: g.player.dead, p: [g.player.x, g.player.y, g.player.z], use: g.useDelay, locked: window.__bf.state().locked }; });
  check('a Fellhound spawn egg makes a wild Fellhound', hs.length === 1 && !hs[0].tamed, { hs, st });
  await setMode('survival');
  const hid = hs[0]?.id;
  // wild hounds look like hounds
  await ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); e.tick = function () { this.beginTick(); }; e.yaw = Math.PI; }, hid);
  await wait(800);
  await shot('h_wild');
  await ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); delete e.tick; }, hid);
  // taming with raw meat (one chance in three per piece)
  await give('raw_beef', 0, 40);
  let tries = 0, tamed = false;
  while (tries < 25 && !tamed) {
    await ev(([id, b]) => {
      const g = window.__bf.game; const e = g.entities.list.find((q) => q.id === id);
      g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); g.player.vx = g.player.vz = 0;
      e.setPos(b.x + 0.5, b.y + 1, b.z - 1.5); e.vx = e.vz = 0; e.tick = function () { this.beginTick(); };
    }, [hid, base]);
    await aim(base.x + 0.5, base.y + 1.45, base.z - 1.5);
    await ticks(2);
    const onTarget = await ev((id) => window.__bf.game.targetMob?.id === id, hid);
    if (onTarget) {
      await rclick();
      tries++;
    }
    await ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); delete e.tick; }, hid);
    tamed = (await hound(hid)).tamed;
  }
  const used = 40 - (await count('raw_beef'));
  check('feeding raw meat tames a Fellhound (after a few tries)', tamed, { tries });
  check('each try uses up a piece of meat', used === tries, { used, tries });
  const adv = await ev(() => ({ tame: window.__bf.game.progress.done.has('tame'), n: window.__bf.game.progress.stats.hounds_tamed }));
  check('taming earns "Loyal Companion"', adv.tame && adv.n === 1, adv);
  const hp = (await hound(hid)).h;
  check('a tamed Fellhound is tougher (10 hearts)', hp === 20, hp);
  tamedId = hid;
  // follows
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 9.5, b.y + 1, b.z + 9.5); }, base);
  await fast(200);
  let p = await ev(() => { const q = window.__bf.game.player; return { x: q.x, z: q.z }; });
  let h1 = await hound(hid);
  check('a tamed Fellhound follows you', Math.hypot(h1.x - p.x, h1.z - p.z) < 4.5, { d: Math.hypot(h1.x - p.x, h1.z - p.z) });
  // catches up from far away
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x - 12.5, b.y + 1, b.z - 12.5); }, base);
  await fast(8);
  const far = await hound(hid);
  await ev((b) => { const bf = window.__bf, g = bf.game; for (let x = -40; x <= -26; x++) for (let z = -6; z <= 6; z++) { bf.setBlock(b.x + x, b.y, b.z + z, 'grass'); for (let k = 1; k <= 4; k++) bf.setBlock(b.x + x, b.y + k, b.z + z, 'air'); } g.teleport(b.x - 32.5, b.y + 1, b.z + 0.5); }, base);
  await wait(300);
  await fast(30);
  p = await ev(() => { const q = window.__bf.game.player; return { x: q.x, z: q.z }; });
  h1 = await hound(hid);
  check('it bounds to your side when left far behind', Math.hypot(h1.x - p.x, h1.z - p.z) < 4.5, { d: Math.hypot(h1.x - p.x, h1.z - p.z), far });
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); }, base);
  await fast(40);
  // helpers: put the hound 2 blocks in front of the player (frozen), aim at it, check the aim
  const present = async (id) => {
    await ev(([id, b]) => {
      const g = window.__bf.game;
      g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); g.player.vx = g.player.vz = 0;
      const e = g.entities.list.find((q) => q.id === id);
      e.setPos(b.x + 0.5, b.y + 1, b.z - 1.5); e.prevX = e.x; e.prevZ = e.z; e.vx = e.vz = 0;
      e.tick = function () { this.beginTick(); };
    }, [id, base]);
    await aim(base.x + 0.5, base.y + 1.45, base.z - 1.5);
    await ticks(2);
    return ev((id) => window.__bf.game.targetMob?.id === id, id);
  };
  const release = (id) => ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); delete e.tick; }, id);
  // sit and stay
  await give('stick', 0, 1);
  const aimed = await present(hid);
  await rclick();
  await release(hid);
  const sat = await hound(hid);
  check('right-click makes a tamed Fellhound sit', aimed && sat.sitting === true, { aimed, sat });
  await wait(500);
  await shot('h_sitting');
  await ev((b) => { const g = window.__bf.game; g.teleport(b.x + 10.5, b.y + 1, b.z + 10.5); }, base);
  await fast(200);
  const stay = await hound(hid);
  check('a sitting Fellhound stays put', Math.hypot(stay.x - sat.x, stay.z - sat.z) < 0.5, { moved: Math.hypot(stay.x - sat.x, stay.z - sat.z) });
  await present(hid);
  await rclick();
  await release(hid);
  const up = await hound(hid);
  check('right-click again and it gets up to follow', up.sitting === false, up);
  // your blows don't hurt it
  await give('iron_sword', 0, 1);
  const h0 = (await hound(hid)).h;
  const aimed2 = await present(hid);
  await lclick();
  await release(hid);
  const h0b = (await hound(hid)).h;
  check('your own attacks don\'t hurt your Fellhound', aimed2 && h0b === h0, { aimed2, before: h0, after: h0b });
  // healing with meat; the tail shows its health
  await ev((id) => { const g = window.__bf.game; const e = g.entities.list.find((q) => q.id === id); e.health = 10; e.render(1, g); }, hid);
  const tailHurt = await ev((id) => window.__bf.game.entities.list.find((q) => q.id === id).parts.get('tail').rotation.x, hid);
  await give('cooked_porkchop', 0, 3);
  await present(hid);
  await rclick();
  await release(hid);
  const healed = await hound(hid);
  check('feeding meat heals it', healed.h > 10 && !healed.sitting, healed);
  check('feeding uses up the meat', (await count('cooked_porkchop')) === 2, await count('cooked_porkchop'));
  await ev((id) => { const g = window.__bf.game; const e = g.entities.list.find((q) => q.id === id); e.health = 20; e.render(1, g); }, hid);
  const tailWell = await ev((id) => window.__bf.game.entities.list.find((q) => q.id === id).parts.get('tail').rotation.x, hid);
  check('its tail droops when it is hurt', tailWell > tailHurt + 0.3, { tailHurt, tailWell });
  // fights what you attack
  const fight = await ev(([id, b]) => {
    const g = window.__bf.game;
    g.dayNight.time = 18000;
    g.player.health = 20;
    const hd = g.entities.list.find((q) => q.id === id);
    hd.sitting = false;
    hd.setPos(b.x + 0.5, b.y + 1, b.z + 1.5);
    g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5);
    const s = g.entities.spawnMob('skeleton', b.x + 0.5, b.y + 1, b.z - 7.5, g);
    s.persistent = true;
    g.playerAttacked(s);            // as if the player had just hit it
    const h0 = s.health;
    let bitten = false;
    for (let i = 0; i < 300 && s.alive; i++) { g.tick(); g.player.health = 20; if (s.revengeOn === hd) bitten = true; }
    const out = { bitten, h0, h: s.health, dead: !s.alive };
    s.removed = true;
    return out;
  }, [hid, base]);
  check('it attacks what you attack', fight.bitten && (fight.dead || fight.h < fight.h0), fight);
  // defends you
  const defend = await ev(([id, b]) => {
    const g = window.__bf.game;
    g.dayNight.time = 18000;
    const hd = g.entities.list.find((q) => q.id === id);
    hd.sitting = false;
    hd.setPos(b.x + 3.5, b.y + 1, b.z + 3.5);
    g.player.health = 20;
    g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5);
    for (let i = 0; i < 400; i++) g.tick();           // let the last fight settle
    g.player.health = 20;
    const s = g.entities.spawnMob('shambler', b.x + 0.5, b.y + 1, b.z - 3.5, g);
    s.persistent = true;
    let hurtMe = false, bitten = false;
    for (let i = 0; i < 400 && s.alive; i++) { g.tick(); if (g.player.health < 20) hurtMe = true; g.player.health = Math.max(g.player.health, 10); if (s.revengeOn === hd) bitten = true; }
    const out = { hurtMe, bitten, dead: !s.alive, h: s.health };
    s.removed = true;
    g.player.health = 20;
    g.dayNight.time = 6000;
    return out;
  }, [hid, base]);
  check('it defends you from creatures that attack you', defend.hurtMe && defend.bitten, defend);
  // kills by your hound count as yours
  const credit = await ev(([id, b]) => {
    const g = window.__bf.game;
    const hd = g.entities.list.find((q) => q.id === id);
    const s = g.entities.spawnMob('shambler', hd.x + 1, hd.y, hd.z, g);
    const before = g.entities.list.filter((e) => e.type === 'xp').length;
    s.health = 1;
    s.hurt(4, g, 1, 0, false, hd);
    return { orbs: g.entities.list.filter((e) => e.type === 'xp').length - before };
  }, [hid, base]);
  check('creatures your Fellhound defeats drop experience for you', credit.orbs > 0, credit);
}

if (run('wild')) {
  // an angered pack turns on you
  await setMode('survival');
  await ev(() => { const g = window.__bf.game; g.player.health = 20; g.dayNight.time = 6000; });
  const pack = await ev((b) => {
    const g = window.__bf.game;
    g.player.health = 20;
    g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5);
    const a = g.entities.spawnMob('hound', b.x + 2.5, b.y + 1, b.z + 3.5, g);
    const c = g.entities.spawnMob('hound', b.x - 2.5, b.y + 1, b.z + 4.5, g);
    a.hurt(1, g, 0, 1, true);
    const angry = { a: a.anger, c: c.anger };
    let hurt = 0;
    for (let i = 0; i < 200; i++) { g.tick(); hurt = Math.max(hurt, 20 - g.player.health); g.player.health = Math.max(g.player.health, 12); }
    const out = { ...angry, hurt };
    a.removed = true; c.removed = true;
    g.player.health = 20;
    return out;
  }, base);
  check('hitting a wild Fellhound angers its whole pack', pack.a > 0 && pack.c > 0, pack);
  check('an angry pack attacks you', pack.hurt > 0, pack);
  // wild hounds hunt rabbits
  const hunt = await ev((b) => {
    const g = window.__bf.game;
    g.teleport(b.x + 12.5, b.y + 1, b.z + 12.5);
    const h = g.entities.spawnMob('hound', b.x - 6.5, b.y + 1, b.z - 6.5, g);
    const r = g.entities.spawnMob('rabbit', b.x - 2.5, b.y + 1, b.z - 6.5, g);
    h.huntTimer = 1;
    let chased = false;
    for (let i = 0; i < 300 && r.alive; i++) { g.tick(); if (h.prey === r) chased = true; }
    const out = { chased, hurt: r.health < 3 || !r.alive };
    h.removed = true; r.removed = true;
    return out;
  }, base);
  check('wild Fellhounds hunt rabbits', hunt.chased && hunt.hurt, hunt);
  // they live in forests, taiga and snowy lands
  const nat = await ev(async () => {
    const g = window.__bf.game, gen = g.world.generator;
    let spot = null;
    for (let r = 48; r < 1600 && !spot; r += 16) for (let a = 0; a < 32 && !spot; a++) {
      const x = Math.floor(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 32 * Math.PI * 2) * r);
      const c = gen.column(x, z);
      if (c.biome === 9 && c.height > 64) {
        let ok = true;
        for (const [dx, dz] of [[40, 0], [-40, 0], [0, 40], [0, -40], [28, 28], [-28, -28]]) if (gen.column(x + dx, z + dz).biome !== 9) ok = false;
        if (ok) spot = { x, z, h: c.height };
      }
    }
    if (!spot) return { spot: null, n: 0 };
    g.player.flying = true;
    g.teleport(spot.x + 0.5, spot.h + 2, spot.z + 0.5);
    for (let i = 0; i < 60 && !(g.world.isLoaded(spot.x + 48, spot.z) && g.world.isLoaded(spot.x - 48, spot.z) && g.world.isLoaded(spot.x, spot.z + 48) && g.world.isLoaded(spot.x, spot.z - 48)); i++) await new Promise((r) => setTimeout(r, 500));
    for (const e of g.entities.list) if (e.mobType && e.mobType !== 'hound') e.removed = true;
    g.rules.doMobSpawning = true;
    let n = 0;
    for (let round = 0; round < 12 && n === 0; round++) {
      for (let i = 0; i < 600; i++) g.tick();
      n = g.entities.list.filter((e) => e.mobType === 'hound' && !e.tamed && e.alive).length;
      if (n === 0) for (const e of g.entities.list) if (e.mobType && e.mobType !== 'hound') e.removed = true;   // make room for new herds
    }
    g.rules.doMobSpawning = false;
    return { spot, n };
  });
  check('wild Fellhounds roam the taiga', nat.n > 0, nat);
  await ev((b) => { const g = window.__bf.game; g.player.flying = false; g.teleport(b.x + 0.5, b.y + 1, b.z + 0.5); }, base);
  await wait(1500);
  await fast(40);
}

// ================================================================== SAVE
if (run('save') && tamedId) {
  await ev(([id, b]) => {
    const g = window.__bf.game;
    for (const e of g.entities.list) if (e.mobType === 'hound' && e.id !== id) e.removed = true;
    const hd = g.entities.list.find((q) => q.id === id);
    hd.setPos(b.x + 2.5, b.y + 1, b.z + 2.5);
    hd.sitting = true;
    hd.health = 17;
    g.weather.set('thunder', 4321, true);
  }, [tamedId, base]);
  await fast(2);
  await page.keyboard.press('Escape'); await wait(400);
  await page.click('[data-testid=btn-save-quit]');
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 20000);
  await page.click('[data-testid=btn-singleplayer]'); await wait(500);
  await page.locator('[data-testid=world-entry]', { hasText: 'Weather Test' }).first().click();
  await page.click('[data-testid=btn-play-selected]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await wait(3000);
  const again = await ev(() => {
    const g = window.__bf.game;
    const h = g.entities.list.filter((e) => e.mobType === 'hound');
    return { hounds: h.map((e) => ({ tamed: e.tamed, sitting: e.sitting, h: e.health, collar: !!e.parts.get('collar') })), weather: g.weather.kind, timer: g.weather.timer, rule: g.rules.doWeatherCycle };
  });
  check('your Fellhound is saved with the world (tamed, sitting, health)', again.hounds.length === 1 && again.hounds[0].tamed && again.hounds[0].sitting && again.hounds[0].h === 17 && again.hounds[0].collar, again);
  check('the weather is saved with the world', again.weather === 'thunder' && again.timer > 4000 && again.timer <= 4321, again);
  check('the Weather Cycle rule is saved', again.rule === false, again);
  // old saves without weather or the new rule load fine
  const old = await ev(async () => {
    const { WeatherSystem } = await import('/src/systems/WeatherSystem.ts');
    const w = new WeatherSystem();
    w.load(undefined);
    const { DEFAULT_RULES } = await import('/src/systems/SaveManager.ts');
    return { kind: w.kind, timer: w.timer, rule: { ...DEFAULT_RULES, ...{ keepInventory: false } }.doWeatherCycle };
  });
  check('worlds from earlier versions start with clear skies and changing weather', old.kind === 'clear' && old.timer > 0 && old.rule === true, old);
}

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n===== WEATHER & HOUND RESULTS =====');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(66)} ${i.slice(0, 220)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
