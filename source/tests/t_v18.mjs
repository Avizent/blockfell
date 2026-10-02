// Tests for 1.8 "Village life": villager names and the info card, standing in a village,
// children and the village food store, the Village Bell (midday gathering, the alarm,
// glowing monsters), the Mapmaker and explorer maps, catching up while away, and
// villagers' habits in the rain and at night.
// node tests/t_v18.mjs          (dev server)   ONLY=items,names,rep,children,bell,maps,catchup,habits,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'names', 'rep', 'children', 'bell', 'maps', 'catchup', 'habits', 'save'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720, CX = VW / 2, CY = VH / 2;
const errors = [];
const page = await b.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const give = (id, slot = 0, count = 1) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const chat = () => ev(() => window.__bf.ui.get().chat.map((c) => c.text));
const clearChat = () => ev(() => window.__bf.ui.set({ chat: [] }));
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(300); };
/** Brings a villager to the street by the well and puts the player 2.8 blocks away, looking at its face. */
const faceMob = (id, dist = 2.8) => ev(([id, vid, dist]) => {
  const g = window.__bf.game, m = g.entities.list.find((e) => e.id === id), plan = g.villages.plan(vid);
  const y = (plan.paths.get(`${plan.x + 3},${plan.z}`) ?? plan.y) + 1;
  m.setPos ? m.setPos(plan.x + 3.5, y, plan.z + 0.5) : (m.x = plan.x + 3.5, m.y = y, m.z = plan.z + 0.5);
  m.vx = m.vy = m.vz = 0; m.yaw = Math.PI; m.path = null;
  const p = g.player;
  p.flying = true;
  g.teleport(plan.x + 3.5, y, plan.z + 0.5 + dist);
  p.vx = p.vy = p.vz = 0;
  window.__bf.aimAt(m.x, m.y + m.height * 0.7, m.z);
  return true;
}, [id, V.id, dist]);
/** A villager frozen in place (tick does nothing but count), so the test can aim at it. */
const freeze = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m._tick = m.tick; m.tick = function () { this.beginTick(); }; }, id);
const unfreeze = (id) => ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m && m._tick) { m.tick = m._tick; delete m._tick; } }, id);

await page.goto(URL);
await page.mouse.move(CX, CY);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Village Life');
await page.fill('[data-testid=world-seed]', 'villages');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => {
  window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] });
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 3000;
});
await wait(1500);

// the nearest village (seed "villages" has one close to spawn), and get it populated
const V = await ev(() => {
  const vp = window.__bf.game.world.generator.villages;
  for (let r = 0; r <= 4; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
    const p = vp.planForRegion(rx, rz);
    if (p) return { id: p.id, x: p.x, z: p.z, y: p.y, radius: p.radius, beds: p.buildings.filter((b) => b.bed).length, jobs: p.buildings.filter((b) => b.job).map((b) => b.job) };
  }
  return null;
});
await ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; g.teleport(x + 0.5, y + 10, z + 0.5); }, [V.x, V.y, V.z]);
await waitFor(async () => (await ev((id) => !!window.__bf.game.villages.states.get(id)?.populated, V.id)), 60000);
await settle();
const folk = () => ev((id) => window.__bf.game.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed)
  .map((e) => ({ id: e.id, name: e.name, full: e.fullName, job: e.job, child: e.isChild, x: e.x, y: e.y, z: e.z, home: e.home, work: e.work, sleep: e.sleeping, mode: e.mode, alarm: e.alarm, level: e.level })), V.id);
const state = () => ev((id) => ({ ...(window.__bf.game.villages.states.get(id) ?? {}) }), V.id);
const setState = (patch) => ev(([id, patch]) => Object.assign(window.__bf.game.villages.states.get(id), patch), [V.id, patch]);
console.log('village', JSON.stringify(V));
// (the Sentinel patrols round the well, where the tests stand: park it out of the way, standing still)
await ev((id) => {
  const g = window.__bf.game, plan = g.villages.plan(id);
  for (const e of g.entities.list) {
    if (e.mobType !== 'sentinel' || e.villageId !== id) continue;
    e.tick = function () { this.beginTick(); if (this.angry > 0) this.angry--; };
    e.setPos(plan.x + 0.5, plan.y + 1, plan.z - 14.5);
  }
}, V.id);

// ================================================================== items
if (run('items')) {
  const it = await ev(() => ['bell', 'map_table', 'dungeon_map', 'ruin_map', 'village_map'].map((id) => window.__bf.item(id)));
  check('new items: Village Bell and Map Table (Functional), Dungeon/Ruin/Village Maps (Tools)',
    it[0].name === 'Village Bell' && it[0].category === 'functional' && it[1].name === 'Map Table' && it[1].category === 'functional'
    && it.slice(2).every((i) => i.category === 'tools'), it);
  const rec = await ev(() => ({
    bell: window.__bf.craft(['stick', 'planks', 'stick', 'stick', 'iron_ingot', 'stick', null, 'iron_ingot', null], 3),
    table: window.__bf.craft(['coal', 'coal', 'planks', 'planks', 'planks', 'planks'], 2),
  }));
  check('a bell is crafted from sticks, planks and iron; a map table from coal and planks', rec.bell?.id === 'bell' && rec.table?.id === 'map_table', rec);
  const icons = await ev(() => ['bell', 'map_table', 'dungeon_map', 'ruin_map', 'village_map'].map((id) => window.__bf.engine.icons.style(id).backgroundPosition));
  check('each has an icon', new Set(icons).size === 5 && icons.every(Boolean), icons);
  const prof = await ev(() => window.__bf.B.professionOfBlock(window.__bf.B.MAP_TABLE));
  check('a Map Table gives a villager the Mapmaker job', prof === 'mapmaker', prof);
}

// ================================================================== names and the info card
if (run('names')) {
  const f = await folk();
  const names = f.map((v) => v.name);
  check('every villager has a name (and they are not all the same)', names.length >= 3 && names.every((n) => /^[A-Z][a-z]{2,}$/.test(n)) && new Set(names).size >= Math.min(3, names.length - 1), names);
  const again = await ev((id) => { const v = window.__bf.game.entities.list.find((e) => e.id === id); return v.name === v.name && v.fullName; }, f[0].id);
  check('a name comes with the job: "Name the Smith"', f.filter((v) => v.job).every((v) => v.full.startsWith(v.name + ' the ')) && !!again, f.map((v) => v.full));
  // look at a villager with a job: the card
  const worker = f.find((v) => v.job) ?? f[0];
  await freeze(worker.id);
  await ev(() => { window.__bf.game.dayNight.time = 3000; });
  await faceMob(worker.id);
  await ticks(10); await wait(300);
  const card = await ev(() => ({ el: !!document.querySelector('[data-testid=villager-card]'), name: document.querySelector('[data-testid=vc-name]')?.textContent, title: document.querySelector('[data-testid=vc-title]')?.textContent, standing: document.querySelector('[data-testid=vc-standing]')?.textContent }));
  check('looking at a villager shows a card: name, level and job, village and standing', card.el && card.name === worker.name && /Novice|Apprentice|Journeyman|Expert/.test(card.title ?? '') && /: Neutral \(0\)$/.test(card.standing ?? ''), card);
  await page.screenshot({ path: `${SHOTS}/v18_card.png` });
  // the trade screen title
  await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); g.player.flying = true; });
  await rclick();
  const title = await ev(() => document.querySelector('[data-testid=trade-title]')?.textContent);
  check('the trade screen is headed with the villager\'s name', !!title && title.startsWith(worker.name + ','), title);
  await page.keyboard.press('Escape'); await wait(200);
  await ev(() => window.__bf.engine.closeOverlay());
  await unfreeze(worker.id);
  await ev(() => { window.__bf.game.setGameMode('creative'); });
  // a death is reported by name
  await clearChat();
  const victim = (await folk()).find((v) => !v.job) ?? (await folk())[1];
  await ev((id) => { const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id); const s = g.entities.spawnMob('shambler', v.x + 1, v.y, v.z, g); v.hurt(100, g, 1, 0, false, s); s.removed = true; }, victim.id);
  const said = await chat();
  check('when a villager dies, you are told who it was', said.some((t) => t.startsWith(victim.full) && /killed by a Shambler/.test(t)), said);
}

// ================================================================== standing
if (run('rep')) {
  await setState({ rep: 0, gains: undefined });
  const f = await folk();
  const smith = f.find((v) => v.job && !v.child);
  // trading raises standing, one point a trade, at most 12 a day
  const t = await ev((id) => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id);
    g.setGameMode('creative');
    const before = g.villages.rep(v.villageId);
    let n = 0;
    for (let k = 0; k < 20; k++) { v.trades.forEach((tr) => { tr.uses = 0; }); n += g.trade(v, 0); }
    return { before, after: g.villages.rep(v.villageId), n };
  }, smith.id);
  check('trading raises your standing (a point a trade, at most 12 a day)', t.before === 0 && t.after === 12 && t.n === 20, t);
  // a gift: food goes to the village store, +3 standing
  await setState({ rep: 0, gains: undefined, food: 0 });
  await freeze(smith.id);
  await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); g.player.flying = true; });
  await give('bread', 0, 5);
  await faceMob(smith.id);
  await page.keyboard.down('ShiftLeft'); await ticks(2);
  await rclick();
  await page.keyboard.up('ShiftLeft');
  const gift = { st: await state(), bread: await ev(() => window.__bf.game.inventory.countItem('bread')), chat: await chat() };
  check('sneak and right-click with food: a gift (+3 standing, food for the village)', gift.st.rep === 3 && gift.st.food === 3 && gift.bread === 4 && gift.chat.some((c) => /thanks you for the bread/.test(c)), gift);
  // standing changes prices
  const prices = await ev((id) => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id), st = g.villages.states.get(v.villageId);
    const tr = { cost: ['amber', 10], result: ['bread', 1], uses: 0, maxUses: 9, xp: 1, tier: 1 };
    const tr2 = { cost: ['wheat', 20], result: ['amber', 1], uses: 0, maxUses: 9, xp: 1, tier: 1 };
    const at = (r) => { st.rep = r; return [g.tradeCost(v, tr).cost[1], g.tradeCost(v, tr2).cost[1]]; };
    const out = { neutral: at(0), honoured: at(100), friendly: at(40), hostile: at(-100) };
    st.rep = 0;
    return out;
  }, smith.id);
  check('a good standing lowers prices (30% at best), a bad one raises them (30% at worst)',
    prices.neutral[0] === 10 && prices.honoured[0] === 7 && prices.friendly[0] === 9 && prices.hostile[0] === 13 && prices.honoured[1] === 14 && prices.hostile[1] === 26, prices);
  // Friendly: a wave
  await setState({ rep: 40 });
  const waved = await ev((id) => { const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id); v.greetCooldown = 0; v.greet(g); return v.waveAnim > 0; }, smith.id);
  check('villagers wave at a player their village likes', waved);
  // hurting a villager: -8, the Sentinel hears
  await setState({ rep: 0 });
  await ev(() => { window.__bf.game.setGameMode('survival'); });
  await ev((id) => { const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id); v.invulnerable = 0; v.hurt(1, g, 0, 1, true); v.health = 20; }, smith.id);
  const hurt = await state();
  const alerted = await ev((id) => window.__bf.game.entities.list.some((e) => e.mobType === 'sentinel' && e.villageId === id && e.angry > 0), V.id);
  check('hurting a villager costs 8 standing (and the Sentinel hears of it)', hurt.rep === -8 && alerted, { rep: hurt.rep, alerted });
  // (calm the Sentinel down again, and heal up)
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.mobType === 'sentinel') e.angry = 0; g.player.health = 20; });
  // Distrustful: no trading, and villagers keep away
  await setState({ rep: -40 });
  await clearChat();
  await faceMob(smith.id);
  await rclick();
  const refused = { overlay: await ev(() => window.__bf.ui.get().overlay), chat: await chat() };
  check('a Distrustful village won\'t trade with you', refused.overlay === null && refused.chat.some((c) => /won't trade with you/.test(c) && /Distrustful/.test(c)), refused);
  await unfreeze(smith.id);
  const avoid = await ev((id) => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id), p = g.player;
    g.dayNight.time = 3000;
    v.fear = 0; v.sleeping = false;
    p.flying = false;
    g.teleport(v.x + 2, v.y, v.z);
    const d0 = Math.hypot(v.x - p.x, v.z - p.z);
    for (let i = 0; i < 80; i++) { g.tick(); p.x = v.x + 0 + (p.x - v.x); }
    return { d0, d1: Math.hypot(v.x - p.x, v.z - p.z), mode: v.mode };
  }, smith.id);
  check('...and its villagers keep away from you', avoid.d1 > avoid.d0 + 1.5, avoid);
  // Hostile: the Sentinel comes for you
  await setState({ rep: -80 });
  const sent = await ev((id) => {
    const g = window.__bf.game, s = g.entities.list.find((e) => e.mobType === 'sentinel' && e.villageId === id && e.alive);
    if (!s) return null;
    s.angry = 0;
    g.player.health = 20;
    g.teleport(s.x + 4, s.y, s.z);
    for (let i = 0; i < 90; i++) g.tick();
    return { angry: s.angry };
  }, V.id);
  check('a Hostile village sets its Sentinel on you', !!sent && sent.angry > 0, sent);
  // standing drifts back towards neutral each morning
  const drift = await ev((id) => {
    const g = window.__bf.game, st = g.villages.states.get(id);
    st.rep = -80;
    g.dayNight.time = 24000 * 5 + 900; g.tick(); g.dayNight.time = 24000 * 5 + 1001; g.tick();
    const a = st.rep;
    st.rep = 50;
    g.dayNight.time = 24000 * 6 + 900; g.tick(); g.dayNight.time = 24000 * 6 + 1001; g.tick();
    return { fromBad: a, fromGood: st.rep };
  }, V.id);
  check('standing drifts back towards neutral at dawn (grudges faster than goodwill)', drift.fromBad === -76 && drift.fromGood === 48, drift);
  await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); g.dayNight.time = 3000; for (const e of g.entities.list) if (e.mobType === 'sentinel') e.angry = 0; });
  await setState({ rep: 0, gains: undefined });
}

// ================================================================== children
if (run('children')) {
  await ev(() => { window.__bf.game.dayNight.time = 3000; });
  // the harvest fills the food store
  const harvest = await ev((id) => {
    const g = window.__bf.game, B = window.__bf.B, plan = g.villages.plan(id);
    const farmer = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.job === 'farmer' && e.alive);
    const st = g.villages.states.get(id); st.food = 0;
    const farm = plan.buildings.find((b) => b.kind === 'farm');
    if (!farmer || !farm) return null;
    // a ripe crop next to the farmer, and tend it
    const x = Math.floor(farmer.x), z = Math.floor(farmer.z), y = Math.floor(farmer.y);
    g.world.setBlock(x + 1, y - 1, z, B.FARMLAND_MOIST); g.world.setBlock(x + 1, y, z, B.WHEAT[7]);
    farmer.tendCrop(g, { x: x + 1, y, z });
    return { food: st.food, block: window.__bf.getBlock(x + 1, y, z) };
  }, V.id);
  check('a farmer\'s harvest goes into the village food store', !!harvest && harvest.food === 1 && /wheat_0|wheat:0|^wheat/.test(harvest.block), harvest);
  // no food, no child
  const none = await ev((id) => { const g = window.__bf.game, st = g.villages.states.get(id); st.food = 5; return !!g.villages.birth(g.villages.plan(id)); }, V.id);
  check('with too little food in store no child is born', none === false);
  // a free bed and food: a child
  await clearChat();
  const kid = await ev((id) => {
    const g = window.__bf.game, st = g.villages.states.get(id), plan = g.villages.plan(id);
    // free a bed: the newcomers check finds one if a villager has none
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed);
    const beds = plan.buildings.filter((b) => b.bed).length;
    if (vs.length >= beds) { const extra = vs[vs.length - 1]; extra.removed = true; }
    st.food = 20;
    for (const v of vs) { v.sleeping = false; }
    const c = g.villages.birth(plan);
    if (!c) return null;
    return { id: c.id, name: c.name, child: c.isChild, job: c.job, home: !!c.home, h: c.height, w: c.width, food: st.food, born: st.born };
  }, V.id);
  const kc = await chat();
  check('with 12 food in store, a free bed and two grown-ups, a child is born', !!kid && kid.child && kid.job === null && kid.home && kid.food === 8, kid);
  check('...small (half height), with its own bed, and the birth is announced', !!kid && kid.h < 1.1 && kc.some((c) => c.startsWith('A child was born in ') && c.endsWith(`: ${kid.name}.`)), { kid, kc });
  const adv = await ev(() => window.__bf.game.progress.done.has('born'));
  check('...earning A Growing Village', adv);
  // children don't trade; they take gifts
  await freeze(kid.id);
  await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); g.player.flying = true; });
  await clearChat();
  await give('apple', 0, 2);
  await faceMob(kid.id, 1.8);
  await rclick();
  const kg = { chat: await chat(), apples: await ev(() => window.__bf.game.inventory.countItem('apple')) };
  check('a child takes a gift without sneaking (and can\'t trade)', kg.apples === 1 && kg.chat.some((c) => /thanks you for the apple/.test(c)), kg);
  await give(null, 0, 0);
  await clearChat();
  await rclick();
  check('...an empty hand: too young to trade', (await chat()).some((c) => /too young to trade/.test(c)));
  await unfreeze(kid.id);
  await ev(() => { window.__bf.game.setGameMode('creative'); });
  // the card shows a child
  const kidTitle = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).title, kid.id);
  check('a child\'s card says when it grows up', /^Child \(grows up in \d+ min\)$/.test(kidTitle), kidTitle);
  // growing up: full size, then a job at a free workstation
  const grown = await ev((id) => {
    const g = window.__bf.game, c = g.entities.list.find((e) => e.id === id), B = window.__bf.B;
    c.childAge = 2;
    // a free map table next to it
    const x = Math.floor(c.x) + 2, y = Math.floor(c.y), z = Math.floor(c.z);
    g.world.setBlock(x, y, z, B.MAP_TABLE);
    for (let i = 0; i < 260; i++) g.tick();
    return { child: c.isChild, h: c.height, job: c.job, chat: window.__bf.ui.get().chat.map((l) => l.text) };
  }, kid.id);
  check('after a day the child grows up, says so, and takes a job at a free workstation', !grown.child && grown.h > 1.9 && grown.job === 'mapmaker' && grown.chat.some((c) => /has grown up/.test(c)), grown);
  await page.screenshot({ path: `${SHOTS}/v18_child.png` });
}

// ================================================================== the bell
if (run('bell')) {
  const vb = await ev((id) => { const v = window.__bf.villages().find((q) => q.id === id); return { bell: v.bell, meeting: v.meeting, x: v.x, y: v.y, z: v.z }; }, V.id);
  check('new villages (terrain version 6) have a Village Bell in the well\'s roof', !!vb.bell && vb.bell.x === vb.x && vb.bell.z === vb.z && vb.bell.y === vb.y + 3, vb);
  check('...and the bell is where the village meets', !!vb.meeting && vb.meeting.x === vb.bell?.x && vb.meeting.z === vb.bell?.z, vb.meeting);
  // midday: the village gathers
  const gather = await ev((id) => {
    const g = window.__bf.game, mp = g.villages.meetingPoint(id);
    g.dayNight.time = 5700;
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed);
    for (const v of vs) { v.modeTimer = 1; v.path = null; v.fear = 0; v.alarm = 0; v.sleeping = false; }
    for (let i = 0; i < 700; i++) g.tick();
    const near = vs.filter((v) => Math.hypot(v.x - mp.x - 0.5, v.z - mp.z - 0.5) < 6.5).length;
    // where they meet: on the ground round the well, never up on its roof by the bell
    const spots = vs.filter((v) => v.mode === 'gather' || v.mode === 'gathered').map((v) => ({ goal: v.goal, y: v.y, mpY: mp.y }));
    // (the well's roof is a block above the bell's level: the old meeting spots were up there)
    const onGround = spots.every((s) => (!s.goal || (s.goal.y <= mp.y && Math.max(Math.abs(s.goal.x - mp.x), Math.abs(s.goal.z - mp.z)) >= 3)) && s.y <= mp.y);
    return { near, total: vs.length, modes: vs.map((v) => v.mode), onGround, spots: spots.slice(0, 4) };
  }, V.id);
  check('at midday villagers gather round the bell (or the well)', gather.near >= Math.max(2, Math.floor(gather.total / 2)), gather);
  check('...standing on the ground round the well, not aiming for its roof', gather.onGround && gather.modes.some((m) => m === 'gather' || m === 'gathered'), gather);
  await page.screenshot({ path: `${SHOTS}/v18_gather.png` });
  // ringing the bell
  const ring = await ev((id) => {
    const g = window.__bf.game, v = window.__bf.villages().find((q) => q.id === id), b = v.bell;
    const m = g.entities.spawnMob('shambler', b.x + 6.5, b.y - 2, b.z + 0.5, g);
    m.persistent = true;
    window.__bf.ui.set({ chat: [] });
    const r = g.villages.ring(b.x, b.y, b.z);
    return { r, glow: m.glowTicks, mob: m.id, chat: window.__bf.ui.get().chat.map((c) => c.text), stat: g.progress.stats.bells_rung };
  }, V.id);
  check('ringing the bell sends the villagers indoors and shows up monsters nearby', ring.r.villagers >= 2 && ring.r.monsters >= 1 && ring.glow === 600 && ring.chat.some((c) => /everyone indoors/.test(c)) && ring.stat === 1, ring);
  await ticks(3); await wait(200);
  const glowMat = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return m ? { depthTest: m.material.depthTest, glow: m.glowTicks } : null; }, ring.mob);
  check('...a glowing monster is drawn through walls for half a minute', !!glowMat && glowMat.depthTest === false && glowMat.glow > 0, glowMat);
  await page.screenshot({ path: `${SHOTS}/v18_glow.png` });
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); if (m) m.removed = true; }, ring.mob);
  const indoors = await ev((id) => {
    const g = window.__bf.game;
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed && e.home);
    for (let i = 0; i < 500; i++) g.tick();
    const home = vs.filter((v) => Math.hypot(v.x - v.home.x - 0.5, v.z - v.home.z - 0.5) < 3).length;
    return { home, total: vs.length, alarm: vs.map((v) => v.alarm) };
  }, V.id);
  check('...the villagers run home and stay there', indoors.home >= Math.ceil(indoors.total * 0.6), indoors);
  // ringing by right-click, on a bell the player placed
  const placed = await ev(() => {
    const g = window.__bf.game, p = g.player, B = window.__bf.B;
    const x = Math.floor(p.x) + 3, z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
    g.world.setBlock(x, y, z, B.BELL);
    return { x, y, z, known: g.villages.bells.has(`${x},${y},${z}`) };
  });
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x - 2 + 0.5, y, z + 0.5); window.__bf.aimAt(x + 0.5, y + 0.5, z + 0.5); }, [placed.x, placed.y, placed.z]);
  await clearChat();
  await rclick();
  const rung = await ev(() => window.__bf.game.progress.stats.bells_rung);
  check('a placed bell is found, and right-clicking rings it', placed.known && rung === 2, { placed, rung });
  await ev(([x, y, z]) => window.__bf.setBlock(x, y, z, 'air'), [placed.x, placed.y, placed.z]);
  await ev((id) => { for (const e of window.__bf.game.entities.list) if (e.villageId === id && e.alarm) e.alarm = 0; window.__bf.game.dayNight.time = 3000; }, V.id);
}

// ================================================================== maps
if (run('maps')) {
  // a Mapmaker with all four levels of offers
  const mm = await ev((id) => {
    const g = window.__bf.game, B = window.__bf.B, plan = g.villages.plan(id);
    let v = g.entities.list.find((e) => e.mobType === 'villager' && e.villageId === id && e.job === 'mapmaker' && e.alive && !e.isChild);
    if (!v) { v = g.entities.spawnMob('villager', plan.x + 3.5, plan.y + 1, plan.z + 3.5, g); v.villageId = id; v.setJob('mapmaker'); }
    v.gainXp(200);
    return { id: v.id, trades: v.trades.map((t) => t.result[0]), name: v.name };
  }, V.id);
  check('a Mapmaker always sells a Ruin Map, then a Dungeon Map and a Village Map as it levels up',
    mm.trades.includes('ruin_map') && mm.trades.includes('dungeon_map') && mm.trades.includes('village_map'), mm.trades);
  const buy = (item) => ev(([id, item]) => {
    const g = window.__bf.game, v = g.entities.list.find((e) => e.id === id);
    g.setGameMode('creative');
    const i = v.trades.findIndex((t) => t.result[0] === item);
    v.trades[i].uses = 0;
    const slot = g.inventory.slots.findIndex((s) => !s);
    const n = g.trade(v, i);
    const stack = g.inventory.slots.find((s) => s && s.id === item && s.map && !s._seen);
    if (stack) stack._seen = true;
    return { n, map: stack?.map ?? null, slot };
  }, [mm.id, item]);
  await ev(() => window.__bf.game.inventory.slots.fill(null));
  const d1 = await buy('dungeon_map');
  const real = d1.map && await ev((t) => window.__bf.dungeons(16).some((d) => d.x === t.x && d.y === t.y && d.z === t.z), d1.map);
  check('a Dungeon Map leads to a real dungeon (one the world generator made)', d1.n === 1 && !!d1.map && d1.map.kind === 'dungeon' && real, d1);
  const d2 = await buy('dungeon_map');
  check('...and the next one to a different dungeon', !!d2.map && (d2.map.x !== d1.map.x || d2.map.z !== d1.map.z), { a: d1.map, b: d2.map });
  const vm = await buy('village_map');
  check('a Village Map leads to another village, by name', !!vm.map && vm.map.kind === 'village' && /^[A-Z][a-z]+$/.test(vm.map.name ?? '') && (vm.map.x !== V.x || vm.map.z !== V.z), vm.map);
  const rm = await buy('ruin_map');
  check('a Ruin Map leads to a ruin', !!rm.map && rm.map.kind === 'ruin', rm.map);
  // holding a map: the compass
  const t = d1.map;
  await ev(([t]) => {
    const g = window.__bf.game, p = g.player;
    const slot = g.inventory.slots.findIndex((s) => s && s.map && s.map.x === t.x && s.map.z === t.z);
    g.inventory.selected = slot; g.inventory.changed();
    p.flying = true;
    g.teleport(t.x + 0.5 - 60, t.y + 30, t.z + 0.5);   // 60 blocks west of it
    p.yaw = 0; p.pitch = 0;                               // facing north
  }, [t]);
  await ticks(8); await wait(300);
  const hud = await ev(() => ({ el: !!document.querySelector('[data-testid=map-compass]'), text: document.querySelector('[data-testid=map-text]')?.textContent, arrow: window.__bf.ui.get().mapHud?.arrow }));
  check('holding a map shows how far and which way (facing north, a target due east points right)', hud.el && /^60 blocks east/.test(hud.text ?? '') && hud.arrow === 90, hud);
  await page.screenshot({ path: `${SHOTS}/v18_compass.png` });
  // right-click: the map screen
  await rclick();
  await wait(600);
  const ms = await ev(() => ({ open: window.__bf.ui.get().overlay, canvas: !!document.querySelector('[data-testid=map-canvas]'), text: document.querySelector('[data-testid=map-screen-text]')?.textContent }));
  check('right-clicking opens the map: the land round a red cross, and where you are', ms.open === 'map' && ms.canvas && /60 blocks east of you/.test(ms.text ?? ''), ms);
  const pix = await ev(() => {
    const c = document.querySelector('[data-testid=map-canvas]');
    const d = c.getContext('2d').getImageData(64, 64, 1, 1).data;
    const e = c.getContext('2d').getImageData(20, 20, 1, 1).data;
    return { centre: [...d.slice(0, 3)], land: [...e.slice(0, 3)] };
  });
  check('...a red cross in the middle of the drawn land', pix.centre[0] > 150 && pix.centre[1] < 70 && pix.land[0] > 60, pix);
  await page.screenshot({ path: `${SHOTS}/v18_map.png` });
  await ev(() => window.__bf.engine.closeOverlay());
  // reaching the spot
  await clearChat();
  await ev(([t]) => { const g = window.__bf.game; g.teleport(t.x + 0.5, t.y, t.z + 1.5); }, [t]);
  await ticks(8);
  const found = { chat: await chat(), adv: await ev(() => window.__bf.game.progress.done.has('map')), stack: await ev(() => window.__bf.game.inventory.selectedStack?.map) };
  check('reaching the place marks the map found (X Marks the Spot)', found.stack?.found === true && found.adv && found.chat.some((c) => /You found the dungeon/.test(c)), found);
  // a map from the catalogue is drawn on first use
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x + 0.5, y + 10, z + 0.5); }, [V.x, V.y, V.z]);
  await give('village_map', 0, 1);
  await rclick();
  const blank = await ev(() => ({ map: window.__bf.game.inventory.selectedStack?.map, overlay: window.__bf.ui.get().overlay }));
  check('a map from the Creative catalogue is drawn when first used', !!blank.map && blank.map.kind === 'village' && blank.overlay === 'map', blank);
  await ev(() => window.__bf.engine.closeOverlay());
  // an old world has no dungeons to map
  const old = await ev(async () => {
    const { VillageManager } = await import('/src/game/VillageManager.ts');
    const { World } = await import('/src/world/World.ts');
    const g = window.__bf.game;
    const w = new World('villages', true, 4);
    const fake = { world: w, dayNight: g.dayNight, entities: g.entities, player: g.player };
    const vm = new VillageManager(fake);
    return { dungeon: vm.findMapTarget('dungeon', 0, 0, null), ruin: !!vm.findMapTarget('ruin', 0, 0, null) };
  });
  check('in a world made before 1.7 there are no dungeons to map (ruins still are)', old.dungeon === null && old.ruin, old);
}

// ================================================================== catching up
if (run('catchup')) {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; g.teleport(x + 0.5, y + 10, z + 0.5); g.dayNight.time = 24000 * 10 + 3000; }, [V.x, V.y, V.z]);
  await settle();
  await clearChat();
  const cu = await ev((id) => {
    const g = window.__bf.game, B = window.__bf.B, plan = g.villages.plan(id), st = g.villages.states.get(id);
    // every field cell freshly sown, everyone's trades used, a child nearly grown
    let cells = 0;
    for (const b of plan.buildings) {
      if (b.kind !== 'farm') continue;
      for (const [x, y, z] of window.__bf.farmCells(id)) { g.world.setBlock(x, y, z, B.WHEAT[0]); cells++; }
    }
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed);
    for (const v of vs) for (const t of v.trades) t.uses = t.maxUses;
    const kid = vs.find((v) => v.isChild) ?? null;
    if (kid) kid.childAge = 3000;
    st.food = 0;
    // away for two and a half days
    st.lastSeen = g.dayNight.time - 60000;
    const n0 = vs.length;
    const out = g.villages.catchUp(plan, 60000);
    st.lastSeen = g.dayNight.time;
    let ripe = 0, stages = 0;
    for (const [x, y, z] of window.__bf.farmCells(id)) { const s = B.CROP_STAGE[g.world.getBlock(x, y, z)]; stages += Math.max(0, s); if (s === 7) ripe++; }
    const after = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed);
    return { out, cells, food: st.food, restocked: after.every((v) => v.trades.every((t) => t.uses === 0)), kidGrown: kid ? !kid.isChild : null, n0, n1: after.length, chat: window.__bf.ui.get().chat.map((c) => c.text) };
  }, V.id);
  check('coming back after 2.5 days: the crops grew and the farmers harvested them into the store', cu.cells > 10 && cu.out.harvested >= cu.cells && cu.food >= Math.min(64, cu.cells), cu);
  check('...the villagers restocked, and the child grew up', cu.restocked && cu.kidGrown !== false, cu);
  check('...and you are told what happened while you were away', cu.chat.some((c) => /^While you were away from [A-Z][a-z]+: .*harvested/.test(c)), cu.chat);
  // it happens by itself when you return
  const auto = await ev((id) => {
    const g = window.__bf.game, st = g.villages.states.get(id);
    st.lastSeen = g.dayNight.time - 30000;
    g.villages.nearTick.delete(id);       // (as if the player had been far away)
    window.__bf.ui.set({ chat: [] });
    for (let i = 0; i < 60; i++) g.tick();
    return { lastSeen: st.lastSeen, now: g.dayNight.time, chat: window.__bf.ui.get().chat.map((c) => c.text) };
  }, V.id);
  check('...which happens by itself when you come back near the village', auto.now - auto.lastSeen < 100 && auto.chat.some((c) => /^While you were away/.test(c)), auto);
  // sleeping through the night in the village moves it on too
  const night = await ev((id) => {
    const g = window.__bf.game, B = window.__bf.B, st = g.villages.states.get(id);
    for (const [x, y, z] of window.__bf.farmCells(id)) g.world.setBlock(x, y, z, B.WHEAT[0]);
    for (let i = 0; i < 45; i++) g.tick();
    window.__bf.ui.set({ chat: [] });
    g.dayNight.time += 11000;            // a night's sleep
    for (let i = 0; i < 45; i++) g.tick();
    let grown = 0;
    for (const [x, y, z] of window.__bf.farmCells(id)) if (B.CROP_STAGE[g.world.getBlock(x, y, z)] > 0) grown++;
    return { grown, chat: window.__bf.ui.get().chat.map((c) => c.text) };
  }, V.id);
  check('...and so does sleeping through the night there ("Overnight in ...")', night.grown > 5 && night.chat.some((c) => /^Overnight in [A-Z][a-z]+: /.test(c)), night);
}

// ================================================================== habits
if (run('habits')) {
  // rain: everyone goes indoors
  const rain = await ev((id) => {
    const g = window.__bf.game;
    g.dayNight.time = 24000 * 12 + 3000;
    g.weather.set('rain', 99999, true);
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed && e.home);
    for (const v of vs) { v.alarm = 0; v.fear = 0; v.sleeping = false; }
    for (let i = 0; i < 700; i++) g.tick();
    const dry = vs.filter((v) => !g.rainingOn(v.x, v.y + v.height + 0.2, v.z)).length;
    g.weather.set('clear', 99999, true);
    for (let i = 0; i < 40; i++) g.tick();
    return { dry, total: vs.length };
  }, V.id);
  check('in the rain villagers go indoors', rain.dry >= Math.ceil(rain.total * 0.7), rain);
  // night: doors get shut
  const doors = await ev((id) => {
    const g = window.__bf.game, B = window.__bf.B, plan = g.villages.plan(id);
    const vs = g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive && !e.removed && e.home && !e.isChild);
    const v = vs[0];
    // the door of its house: open it
    let door = null;
    for (let dz = -5; dz <= 5 && !door; dz++) for (let dx = -5; dx <= 5 && !door; dx++) for (let dy = -1; dy <= 1; dy++) {
      const d = B.getBlock(g.world.getBlock(v.home.x + dx, v.home.y + dy, v.home.z + dz));
      if (d.shape === 'door' && d.half === 'lower') { door = { x: v.home.x + dx, y: v.home.y + dy, z: v.home.z + dz }; break; }
    }
    if (!door) return null;
    if (!B.getBlock(g.world.getBlock(door.x, door.y, door.z)).open) g.toggleDoor(door.x, door.y, door.z);
    const opened = B.getBlock(g.world.getBlock(door.x, door.y, door.z)).open;
    g.teleport(plan.x + 0.5, plan.y + 12, plan.z + 0.5);
    g.dayNight.time = 24000 * 13 + 13000;
    v.sleeping = false; v.fear = 0;
    for (let i = 0; i < 800; i++) g.tick();
    return { opened, closed: !B.getBlock(g.world.getBlock(door.x, door.y, door.z)).open };
  }, V.id);
  check('at night villagers shut the doors of their houses', !!doors && doors.opened && doors.closed, doors);
  await ev(() => { window.__bf.game.dayNight.time = 24000 * 14 + 3000; });
}

// ================================================================== saving
if (run('save')) {
  const before = await ev((id) => {
    const g = window.__bf.game, st = g.villages.states.get(id);
    for (let i = 0; i < 45; i++) g.tick();     // (the village has been seen just now: nothing to catch up on)
    st.rep = 33; st.food = 9;     // (below a child's 12, so no birth while the world reloads; a harvest may add a little)
    const plan = g.villages.plan(id);
    const c = g.entities.spawnMob('villager', plan.x + 2.5, plan.y + 1, plan.z + 2.5, g);
    c.villageId = id; c.makeChild(12345);
    g.inventory.slots[5] = { id: 'dungeon_map', count: 1, map: { kind: 'dungeon', x: 11, y: 22, z: 33, name: 'Test' } };
    return { child: c.name, seed: c.seed, names: g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive).map((e) => e.name).sort() };
  }, V.id);
  await ev(() => window.__bf.game.save());
  await wait(800);
  await page.click('[data-testid=btn-back-to-game]').catch(() => undefined);
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 30000);
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-play-selected]').catch(async () => { await page.click('text=Village Life'); await page.click('[data-testid=btn-play-selected]'); });
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await settle();
  await waitFor(() => ev((id) => window.__bf.game.entities.list.some((e) => e.mobType === 'villager' && e.villageId === id), V.id), 30000);
  const after = await ev(([id, seed]) => {
    const g = window.__bf.game, st = g.villages.states.get(id);
    const c = g.entities.list.find((e) => e.mobType === 'villager' && e.seed === seed);
    return {
      rep: st?.rep, food: st?.food, child: c ? { name: c.name, age: c.childAge, child: c.isChild } : null,
      names: g.entities.list.filter((e) => e.mobType === 'villager' && e.villageId === id && e.alive).map((e) => e.name).sort(),
      map: g.inventory.slots[5]?.map ?? null,
    };
  }, [V.id, before.seed]);
  check('standing, food, names, children and maps are saved', after.rep === 33 && after.food >= 9 && after.food <= 11 && after.child?.child && after.child.name === before.child
    && after.child.age > 10000 && after.child.age <= 12345 && after.map?.x === 11 && after.map?.name === 'Test' && JSON.stringify(after.names) === JSON.stringify(before.names), { before, after });
}

check('no script errors', errors.length === 0, errors);
console.log('\n' + results.map((r) => `${r[0]}  ${r[1].padEnd(80)} ${r[0] === 'FAIL' ? r[2].slice(0, 300) : ''}`).join('\n'));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await b.close();
