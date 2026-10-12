// Screenshots and icons for the 2.4 guide pages: tracks and carts, Party Bags and party things.
// node tests/guide_shots16.mjs  (dev server)  PARTS=icons,track,ride,slope,bag,party,gift
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots16';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,track,ride,slope,bag,party,gift').split(',');
const SEED = process.env.SEED || 'partytrain24';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(250); } return false; };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 120000); await wait(800); };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const shot = async (name, hud = false) => { await ev((hud) => window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: !hud }), hud); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.mobType || e.type === 'item') e.removed = true;
});
/** No block outline and an empty hand in the pictures. */
const clean = () => ev(() => { const g = window.__bf.game; g.reach = () => 0.0001; g.inventory.slots[8] = null; g.inventory.selected = 8; g.inventory.changed(); });
/** Stand (flying) at a spot and look at a point. */
const view = async (from, at, fly = true) => {
  await ev(([f, a, fly]) => { const g = window.__bf.game, p = g.player; p.flying = fly; g.teleport(f[0], f[1], f[2]); p.vx = p.vy = p.vz = 0; window.__bf.aimAt(a[0], a[1], a[2]); }, [from, at, fly]);
  await settle(); await ticks(4);
};
/** Spawns a creature that holds still (and, by default, faces `yaw`). */
const still = (t, x, y, z, yaw, setup = '') => ev(([t, x, y, z, yaw, setup]) => {
  const g = window.__bf.game, m = g.entities.spawnMob(t, x, y, z, g);
  m.yaw = m.prevYaw = yaw;
  // eslint-disable-next-line no-new-func
  if (setup) new Function('m', 'g', setup)(m, g);
  m.tick = function () { this.beginTick(); this.prevLimbAmount = this.limbAmount = 0; };
  return m.id;
}, [t, x, y, z, yaw, setup]);
const ground = (x, z) => ev(([x, z]) => window.__bf.game.world.highestSolid(Math.floor(x), Math.floor(z)) + 1, [x, z]);

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['rail', 'boost_rail', 'station_rail', 'minecart', 'party_bag', 'party_hat', 'party_popper', 'bunting', 'balloons', 'cake', 'iron_ingot', 'stick', 'amber', 'red_dye', 'yellow_dye', 'blue_dye', 'string', 'wool', 'apple', 'bread', 'torch', 'wheat', 'leather'];
  const out = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const res = {};
    for (const id of ids) {
      const st = ic.style(id);
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      res[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return res;
  }, ids);
  for (const [id, url] of Object.entries(out)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(out).length);
}


// a creative world
await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Party Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();
await clean();
/** A flat grass pad (r each way) with air above, in the middle of the land near the start. */
const pad = (r = 12) => ev((r) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'grass'); bf.setBlock(x + dx, y - 2, z + dz, 'dirt'); for (let dy = 0; dy <= 9; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  return { x, y, z };
}, r);
const put = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const P = await pad(14);
await settle();

// a rail loop: out east, round two curves, past a boost run, a station and a hill
const track = [];
const L = async (dx, dz, k = 'rail', dy = 0) => { await put(P.x + dx, P.y + dy, P.z + dz, k); };
if (PARTS.some((p) => ['track', 'ride', 'slope'].includes(p))) {
  for (let i = -6; i <= 6; i++) await L(i, 0);
  for (let k = 1; k <= 5; k++) await L(6, k);
  for (let i = 6; i >= -6; i--) await L(i, 6);
  for (let k = 5; k >= 1; k--) await L(-6, k);
  // boost rails along the north run, a station at the corner
  for (let i = 0; i <= 4; i++) await L(i, 0, 'boost_rail');
  await L(-4, 6, 'station_rail');
  await settle();
}

if (PARTS.includes('track')) {
  await ev((P) => { const g = window.__bf.game; g.entities.list.filter((e) => e.type === 'minecart').forEach((e) => { e.removed = true; }); }, P);
  const cart = await ev(async (P) => {
    const M = await import('/src/entities/Minecart.ts');
    const g = window.__bf.game; const c = new M.Minecart();
    c.setPos(P.x + 6.5, P.y + 0.2, P.z + 3.5);
    c.placeOn(g.world, P.x + 6, P.y, P.z + 3, 0); g.entities.add(c); return c.id;
  }, P);
  void cart;
  await view([P.x + 6, P.y + 9, P.z + 14.5], [P.x, P.y, P.z + 3]);
  await shot('tc01_track');
  await view([P.x + 9, P.y + 2.4, P.z + 0.5], [P.x + 6.4, P.y + 0.2, P.z + 3.4]);
  await shot('tc02_cart');
}

if (PARTS.includes('ride')) {
  await ev((P) => {
    const g = window.__bf.game;
    for (const e of g.entities.list) if (e.type === 'minecart') e.removed = true;
  }, P);
  const r = await ev(async (P) => {
    const M = await import('/src/entities/Minecart.ts');
    const g = window.__bf.game, p = g.player;
    p.flying = false;
    const c = new M.Minecart();
    c.setPos(P.x - 3.5, P.y + 0.2, P.z + 0.5); c.placeOn(g.world, P.x - 3, P.y, P.z, -Math.PI / 2); g.entities.add(c);
    g.teleport(P.x - 3.5, P.y + 0.3, P.z + 0.5); g.mount(c, true);
    p.yaw = -Math.PI / 2; p.pitch = 0.05;
    g.autopilot = { forward: 1 };
    let i = 0; for (; i < 200; i++) { g.tick(); if (c.onBoostRail && Math.abs(c.v) > 0.3) break; }
    return { i, v: c.v, x: c.x - P.x };
  }, P);
  console.log('ride', r);
  await ev(() => { const g = window.__bf.game; const c = g.riding; window.__bf.game.player.yaw = -Math.PI / 2; window.__bf.game.player.pitch = -0.42; g.autopilot = null; c.tick = function () { this.beginTick(); }; });
  await wait(500);
  await shot('tc03_ride', true);
  await ev(() => { const g = window.__bf.game; g.dismount(); for (const e of g.entities.list) if (e.type === 'minecart') e.removed = true; });
}

if (PARTS.includes('slope')) {
  // a short hill: three rising rails then a level top, a cart part-way up
  const S = { x: P.x + 8, y: P.y, z: P.z - 8 };
  for (let k = 0; k <= 8; k++) for (let dz = 0; dz <= 0; dz++) for (let dy = 0; dy <= 6; dy++) await put(S.x + k, S.y + dy - 0, S.z, 'air');
  const rise = [0, 0, 1, 2, 3, 3, 3, 3];
  for (let k = 0; k < rise.length; k++) {
    for (let dy = -1; dy < rise[k]; dy++) await put(S.x + k, S.y + dy, S.z, dy === rise[k] - 1 ? 'grass' : 'dirt');
    await put(S.x + k, S.y + rise[k], S.z, 'rail');
  }
  await settle();
  await ev(async (S) => {
    const M = await import('/src/entities/Minecart.ts');
    const g = window.__bf.game; const c = new M.Minecart();
    c.setPos(S.x + 3.5, S.y + 2.2, S.z + 0.5); c.placeOn(g.world, S.x + 3, S.y + 2, S.z, Math.PI / 2); g.entities.add(c);
  }, S);
  await view([S.x + 3.5, S.y + 2.6, S.z + 6], [S.x + 3.5, S.y + 1.8, S.z + 0.5]);
  await shot('tc04_slope');
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'minecart') e.removed = true; });
}

if (PARTS.includes('bag')) {
  await ev(() => {
    const g = window.__bf.game;
    g.player.creative = false;
    g.inventory.slots[0] = { id: 'party_bag', count: 1, color: 0x5a8ee8, bag: [{ id: 'apple', count: 3 }, { id: 'cake', count: 1 }, { id: 'party_popper', count: 2 }, null, { id: 'bread', count: 2 }, null, null, null, null] };
    for (let i = 1; i < 9; i++) g.inventory.slots[i] = null;
    g.inventory.slots[1] = { id: 'party_hat', count: 1 }; g.inventory.slots[2] = { id: 'bunting', count: 3 }; g.inventory.slots[3] = { id: 'balloons', count: 2 };
    g.inventory.selected = 0; g.inventory.changed();
    window.__bf.look(0, 0.4);
  });
  await ticks(2);
  await ev(() => { const g = window.__bf.game; g.openBag(0); });
  await wait(700);
  await ev(() => window.__bf.ui.set({ toasts: [], chat: [] }));
  await page.screenshot({ path: `${OUT}/pt01_bag.png` });
  console.log('shot pt01_bag');
  await ev(() => window.__bf.engine.closeOverlay());
}

if (PARTS.includes('party')) {
  const Q = await pad(10);
  await settle();
  // cakes in four stages, balloons, bunting between two posts, a stand wearing a party hat, confetti
  const cakes = ['cake:0', 'cake:2', 'cake:4'];
  for (let i = 0; i < 3; i++) await put(Q.x - 3 + i * 2, Q.y, Q.z, cakes[i]);
  await put(Q.x + 3, Q.y, Q.z, 'balloons'); await put(Q.x + 4, Q.y, Q.z + 1, 'balloons');
  for (let k = 0; k <= 4; k++) { await put(Q.x - 4 + k * 2, Q.y + 3, Q.z - 4, 'oak_fence'); }
  for (const dx of [-4, 4]) for (let dy = 0; dy <= 2; dy++) await put(Q.x + dx, Q.y + dy, Q.z - 4, 'oak_fence');
  for (let k = -3; k <= 3; k++) await put(Q.x + k, Q.y + 3, Q.z - 4, 'planks');
  for (let k = -3; k <= 3; k++) await put(Q.x + k, Q.y + 2, Q.z - 4, k % 2 ? 'bunting:ew' : 'bunting:ew');
  await ev(async (Q) => {
    const A = await import('/src/entities/ArmourStand.ts');
    const g = window.__bf.game; const st = new A.ArmourStand();
    st.setPos(Q.x + 6.5, Q.y, Q.z + 1.5); st.yaw = st.prevYaw = Math.PI * 0.85;
    st.items[0] = { id: 'party_hat', count: 1, color: 0xe8b020 };
    g.entities.add(st);
  }, Q);
  await view([Q.x + 0.5, Q.y + 1.9, Q.z + 7], [Q.x + 0.5, Q.y + 0.9, Q.z - 1.5]);
  await ev((Q) => { const g = window.__bf.game; g.effect('confetti', Q.x + 1.5, Q.y + 2.2, Q.z + 2, 90); g.effect('confetti', Q.x - 2, Q.y + 1.8, Q.z + 2.5, 70); }, Q);
  await wait(450);
  await shot('pt02_party');
}

if (PARTS.includes('gift')) {
  const Q = await pad(8);
  await settle();
  const v = await still('villager', Q.x + 0.5, Q.y, Q.z - 1.5, Math.PI);
  void v;
  await ev(() => { const g = window.__bf.game; g.player.creative = false; });
  await view([Q.x + 0.5, Q.y, Q.z + 3.6], [Q.x + 0.5, Q.y + 1.25, Q.z - 1.5], false);
  await ev((Q) => { const g = window.__bf.game; g.effect('confetti', Q.x + 0.5, Q.y + 2.3, Q.z - 1.5, 80); g.effect('heart', Q.x + 0.5, Q.y + 2.4, Q.z - 1.5, 6); }, Q);
  await wait(450);
  await shot('pt03_gift');
}

if (PARTS.includes('corners')) {
  // debug: the four curve corners seen from straight above
  for (const [ox, oz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) { /* placeholder */ void dx; void dz; }
  }
  const base = { x: P.x - 10, z: P.z - 10 };
  const cells = [[0, 0, 'S+E'], [4, 0, 'S+W'], [0, 4, 'N+E'], [4, 4, 'N+W']];
  for (const [ox, oz] of cells) {
    // corner at (ox+1, oz+1) with arms
    const cx = base.x + ox, cz = base.z + oz;
    await put(cx + 1, P.y, cz + 1, 'rail');
    const arms = ox === 0 && oz === 0 ? [[2, 1], [1, 2]] : ox === 4 && oz === 0 ? [[0, 1], [1, 2]] : ox === 0 && oz === 4 ? [[2, 1], [1, 0]] : [[0, 1], [1, 0]];
    for (const [ax, az] of arms) await put(cx + ax, P.y, cz + az, 'rail');
  }
  await settle();
  await view([base.x + 4.5, P.y + 9, base.z + 4.6], [base.x + 4.5, P.y, base.z + 4.5]);
  await shot('corners');
}

await b.close();
