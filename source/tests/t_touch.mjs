// Tests for the touch controls (phones and tablets), on an emulated iPhone in landscape.
// Fingers are simulated with real touch events (Chrome DevTools protocol), which the
// browser turns into pointer events exactly as on a phone.
// Run against the dev server: node tests/t_touch.mjs   (URL=... for another build)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const W = 844, H = 390;
const ctx = await b.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 5000); };
// fingers: each call sends every finger that is on the screen
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await lift(); await wait(150); };
const centreOf = async (sel) => { const r = await page.locator(sel).first().boundingBox(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; };
const tapSel = async (sel) => { const c = await centreOf(sel); await tapAt(c[0], c[1]); };
const state = () => ev(() => window.__bf.state());
const pos = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, sprint: p.sprinting, sneak: p.sneaking, fly: p.flying, food: p.food }; });
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const give = (id, slot = 0, count = 64) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const look = (yaw, pitch) => ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, [yaw, pitch]);
const LX = 600, LY = 150;   // a spot on the right half of the screen, away from the buttons
// one finger along a path (optionally held still first), then lifted
const dragPath = async (pts, holdMs = 0) => {
  await touch('touchStart', [pts[0]]);
  if (holdMs) await wait(holdMs);
  else {
    // a real finger starts moving at once: get past the slop in the very next event,
    // so the (slow) automation can't make it look like a long press
    const [ax, ay] = pts[0], [bx, by] = pts[1], d = Math.hypot(bx - ax, by - ay) || 1;
    await touch('touchMove', [[ax + ((bx - ax) * 14) / d, ay + ((by - ay) * 14) / d]]);
  }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    for (let k = 1; k <= 4; k++) { await touch('touchMove', [[ax + ((bx - ax) * k) / 4, ay + ((by - ay) * k) / 4]]); await wait(20); }
  }
  await lift(); await wait(250);
};

// ================================================================== MENUS
await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(600);
const boot = await ev(() => ({ touch: window.__bf.ui.get().touch, gui: window.__bf.ui.get().gui, rd: window.__bf.engine.options.renderDistance, lock: window.__bf.engine.input.allowUnlocked }));
check('a phone gets touch controls, a readable GUI scale and lighter graphics', boot.touch === true && boot.gui === 2 && boot.rd === 5 && boot.lock === true, boot);
await shot('touch_title');
await tapSel('[data-testid=btn-singleplayer]');
await tapSel('[data-testid=btn-create-new]');
check('menu buttons respond to taps', (await state()).screen === 'create');
await page.fill('[data-testid=world-name]', 'Touch Test');
await page.fill('[data-testid=world-seed]', 'touch');
await tapSel('[data-testid=btn-create-world]');
await waitFor(async () => (await state()).screen === 'game', 90000);
await wait(2500);
const inGame = await ev(() => ({ controls: !!document.querySelector('[data-testid=touch-controls]'), prompt: !!document.querySelector('.click-to-play'), focus: window.__bf.engine.input.gameFocus }));
check('in the world: on-screen controls, no "click to play", input live', inGame.controls && !inGame.prompt && inGame.focus, inGame);

// a flat, quiet test field at noon
const base = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true);
  for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 3;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -16; dz <= 12; dz++) {
    bf.setBlock(x0 + dx, y - 1, z0 + dz, 'stone'); bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
    for (let k = 1; k <= 8; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  g.setGameMode('survival'); p.flying = false;
  g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  g.dayNight.time = 6000;
  return { x: x0, y, z: z0 };
});
const X = base.x, Y = base.y + 1, Z = base.z;
await wait(1500);
await shot('touch_hud');

// ================================================================== JOYSTICK
await look(0, 0);
const p0 = await pos();
await touch('touchStart', [[110, 300]]);
await touch('touchMove', [[110, 256]]);
await fast(30);
const p1 = await pos();
check('the joystick walks you forward', p0.z - p1.z > 2.5 && Math.abs(p1.x - p0.x) < 0.4, { dz: p0.z - p1.z, dx: p1.x - p0.x });
await touch('touchMove', [[160, 300]]);
const q0 = await pos(); await fast(20); const q1 = await pos();
check('push it sideways and you strafe', q1.x - q0.x > 1.5 && Math.abs(q1.z - q0.z) < 0.4, { dx: q1.x - q0.x, dz: q1.z - q0.z });
await touch('touchMove', [[110, 220]]);
await fast(10);
const sp = await pos();
check('push past the rim to sprint', sp.sprint === true, sp);
await lift();
await fast(12);
const r0 = await pos(); await fast(20); const r1 = await pos();
check('let go and you stop', Math.hypot(r1.x - r0.x, r1.z - r0.z) < 0.05 && (await ev(() => window.__bf.engine.input.stick)) === null, { moved: Math.hypot(r1.x - r0.x, r1.z - r0.z) });

// a thumb that lands right at the corner of the screen does not start walking by itself
await ev(([x, y, z]) => window.__bf.game.teleport(x, y, z), [X + 0.5, Y, Z + 0.5]);
await look(0, 0);
const e0 = await pos();
await touch('touchStart', [[14, H - 12]]);
await fast(10);
const e1 = await pos();
const eStick = await ev(() => window.__bf.engine.input.stick);
await touch('touchMove', [[14, H - 56]]);
await fast(10);
const e2 = await pos();
await lift(); await fast(12);
check('a thumb at the very edge does not walk until it pushes', Math.hypot(e1.x - e0.x, e1.z - e0.z) < 0.05 && eStick && eStick.forward === 0 && eStick.strafe === 0 && e1.z - e2.z > 0.8,
  { still: Math.hypot(e1.x - e0.x, e1.z - e0.z), eStick, pushed: e1.z - e2.z });

// ================================================================== LOOK
await ev(([x, y, z]) => window.__bf.game.teleport(x, y, z), [X + 0.5, Y, Z + 0.5]);
await look(0, 0);
const y0 = (await pos()).yaw;
await touch('touchStart', [[LX, LY]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[LX - i * 15, LY + i * 4]]); await wait(30); }
await lift(); await wait(300);
const lk = await pos();
check('dragging turns the view (left and down)', lk.yaw - y0 > 0.3 && lk.pitch < -0.05, { dyaw: lk.yaw - y0, pitch: lk.pitch });
check('a drag is not a tap (nothing placed or used)', (await ev(() => window.__bf.game.inventory.version)) >= 0 && (await key(X, Y, Z - 2)) === 'air');
// both thumbs at once: walk and look
await look(0, 0);
const m0 = await pos();
await touch('touchStart', [[110, 300, 1]]);
await touch('touchMove', [[110, 256, 1]]);
await touch('touchStart', [[110, 256, 1], [LX, LY, 2]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[110, 256, 1], [LX + i * 12, LY, 2]]); await fast(2); await wait(30); }
await lift(); await wait(200);
const m1 = await pos();
check('walk with one thumb while looking with the other', Math.hypot(m1.x - m0.x, m1.z - m0.z) > 0.8 && m1.yaw < m0.yaw - 0.1, { moved: Math.hypot(m1.x - m0.x, m1.z - m0.z), dyaw: m1.yaw - m0.yaw });

// ================================================================== TAP AND HOLD
await ev(([x, y, z]) => window.__bf.game.teleport(x, y, z), [X + 0.5, Y, Z + 0.5]);
await look(0, -0.62);    // looking at the grass two blocks ahead
// (a wandering animal in the line of sight would take the tap as a hit: clear them away)
await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type === 'mob') e.removed = true; });
await give('dirt', 0, 10);
await wait(300);
const tgt = (await state()).target;
const tgtMob = await ev(() => window.__bf.game.targetMob?.mobType ?? null);
await tapAt(LX, LY);
await ticks(3);
const placed = tgt ? await key(tgt.x, tgt.y + 1, tgt.z) : null;
const dirtLeft = await ev(() => window.__bf.game.inventory.countItem('dirt'));
check('tap places the block in your hand', placed === 'dirt' && dirtLeft === 9, { tgt, placed, dirtLeft, tgtMob });
// hold to mine it
await give(null, 0, 0);
await wait(200);
const t2 = (await state()).target;
await touch('touchStart', [[LX, LY]]);
await wait(2200);
await lift(); await ticks(3);
check('touch and hold mines the block', t2 && t2.block === 'dirt' && (await key(t2.x, t2.y, t2.z)) === 'air', { t2, now: t2 && await key(t2.x, t2.y, t2.z) });
// a quick tap only uses: it doesn't mine
await ev(([x, y, z]) => window.__bf.setBlock(x, y, z, 'dirt'), [t2.x, t2.y, t2.z]);
await wait(200);
await tapAt(LX, LY); await ticks(3);
check('a quick tap does not dig', (await key(t2.x, t2.y, t2.z)) === 'dirt');
// a hold press the game hasn't acted on yet can be taken back (a late hold timer racing a quick lift)
const retract = await ev(() => {
  const g = window.__bf.game, i = window.__bf.engine.input, p = g.player, pitch = p.pitch;
  p.pitch = 1.5;   // at the sky: nothing to hit
  i.virtualMouse(0, true);
  const before = i.retractMouse(0), down = i.mouseIsDown(0);
  i.virtualMouse(0, true); g.tick();
  const after = i.retractMouse(0);
  i.virtualMouse(0, false); g.tick();
  p.pitch = pitch;
  return { before, down, after };
});
check('an unseen hold is taken back when the touch was really a tap', retract.before === true && retract.down === false && retract.after === false, retract);
// a slow frame lets the hold timer start digging before the lift is seen: the touch's own
// timestamps still make it a tap, so the block is placed and the digging stops
const FACE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const lateSetup = await ev(([x, y, z]) => {
  const bf = window.__bf, g = bf.game;
  for (let dz = -4; dz <= 0; dz++) for (let dy = 0; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
  const was = bf.getBlock(x, y - 1, z - 2);
  bf.setBlock(x, y - 1, z - 2, 'dirt');
  g.teleport(x + 0.5, y, z + 0.5); g.player.yaw = 0; g.player.pitch = -0.62;
  for (const e of g.entities.list) if (e.type === 'item') e.removed = true;
  return was;
}, [X, Y, Z]);
await give('dirt', 0, 10);
await ticks(3);
const lt = (await state()).target;
const lp = lt && [lt.x + FACE[lt.face][0], lt.y + FACE[lt.face][1], lt.z + FACE[lt.face][2]];
const late0 = Date.now() / 1000;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: LX, y: LY, id: 0 }], timestamp: late0 });
const lateDug = await waitFor(() => ev(() => !!window.__bf.game.breaking), 4000);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: late0 + 0.08 });
await ticks(3);
const late = { lt, dug: lateDug, placed: lp && await key(...lp), block: lt && await key(lt.x, lt.y, lt.z), breaking: await ev(() => !!window.__bf.game.breaking), dirt: await ev(() => window.__bf.game.inventory.countItem('dirt')) };
check('a tap held up by a slow frame still places, and the digging it started stops', !!lt && late.dug && late.placed === 'dirt' && late.block === 'dirt' && !late.breaking && late.dirt === 9, late);
await ev(([x, y, z, was, lp]) => { const bf = window.__bf; if (lp) bf.setBlock(lp[0], lp[1], lp[2], 'air'); bf.setBlock(x, y - 1, z - 2, was); }, [X, Y, Z, lateSetup, lp]);
await ev(([x, y, z]) => window.__bf.setBlock(x, y, z, 'air'), [t2.x, t2.y, t2.z]);
// (the mined dirt was picked up, so the quick tap may have placed it: clear the way)
await ev(([x, y, z]) => { const g = window.__bf.game; for (let dz = -3; dz <= 0; dz++) window.__bf.setBlock(x, y, z + dz, 'air'); g.inventory.slots.fill(null); g.inventory.changed(); for (const e of g.entities.list) if (e.type === 'item') e.removed = true; }, [X, Y, Z]);
// tap a creature to hit it
const pig = await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.entities.spawnMob('pig', x + 0.5, y, z - 1.6, g); m.tick = function () { this.beginTick(); }; return { id: m.id, h: m.health }; }, [X, Y, Z]);
await look(0, -0.6); await wait(300);
const onPig = await ev(() => !!window.__bf.game.targetMob);
const aimInfo = await ev((id) => { const g = window.__bf.game, p = g.player, m = g.entities.list.find((e) => e.id === id); return { p: [p.x, p.y, p.z, p.yaw, p.pitch], m: m && [m.x, m.y, m.z, m.removed], t: g.target && [g.target.x, g.target.y, g.target.z, g.target.block] }; }, pig.id);
await tapAt(LX, LY); await ticks(3);
const pigH = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id)?.health, pig.id);
check('tapping a creature attacks it', onPig && pigH < pig.h, { onPig, before: pig.h, after: pigH, aimInfo });
await ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); if (e) e.removed = true; }, pig.id);
// hold with food: eat
await ev(() => { window.__bf.game.player.food = 10; });
await give('bread', 0, 3);
await look(0, 0.4); await wait(200);
await touch('touchStart', [[LX, LY]]);
await wait(2400);
await lift(); await ticks(2);
const fed = await pos();
check('holding with food in hand eats it', fed.food > 10 && (await ev(() => window.__bf.game.inventory.countItem('bread'))) === 2, { food: fed.food });

// ================================================================== BUTTONS
await look(0, 0);
const jb = await centreOf('[data-testid=touch-jump]');
const j0 = (await pos()).y;
await touch('touchStart', [jb]);
await fast(4);
const j1 = (await pos()).y;
await lift(); await fast(12);
check('the Jump button jumps', j1 > j0 + 0.3, { j0, j1 });
const sb = await centreOf('[data-testid=touch-sneak]');
await tapAt(...sb); await fast(2);
const sn1 = await pos();
const snOn = await ev(() => document.querySelector('[data-testid=touch-sneak]').classList.contains('on'));
await tapAt(...sb); await fast(2);
const sn2 = await pos();
check('Sneak switches on and off (and lights up while on)', sn1.sneak === true && snOn && sn2.sneak === false, { sn1: sn1.sneak, snOn, sn2: sn2.sneak });
await tapAt(...sb); await fast(2);
await ev(() => window.__bf.engine.setOption('touchControls', 'off'));
await fast(2);
const offSneak = await ev(() => ({ latch: window.__bf.engine.input.sneakLatch, sneak: window.__bf.game.player.sneaking, touch: window.__bf.ui.get().touch }));
await ev(() => { window.__bf.engine.setOption('touchControls', 'auto'); });
await wait(300);
check('switching touch controls off also lets go of Sneak', offSneak.latch === false && offSneak.sneak === false && offSneak.touch === false && (await ev(() => window.__bf.ui.get().touch)) === true, offSneak);
// Creative: a double tap on Jump takes off
await ev(() => window.__bf.game.setGameMode('creative'));
await fast(2);
// two quick taps (the second finger still down when the game next looks)
const dt0 = await ev(() => { const g = window.__bf.game; window.__fl = []; const orig = g.tick; g.tick = function (...a) { const f0 = this.player.flying; const r = orig.apply(this, a); if (this.player.flying !== f0 || this.jumpTap >= 6) window.__fl.push([Math.round(performance.now()), f0, this.player.flying, this.jumpTap, +this.player.y.toFixed(2)]); return r; }; return { fly: g.player.flying, y: g.player.y, ground: g.player.onGround }; });
await touch('touchStart', [jb]); await lift();
await touch('touchStart', [jb]); await fast(3); await lift(); await fast(2);
const dt2 = await ev(() => ({ tap: window.__bf.game.jumpTap, fly: window.__bf.game.player.flying, y: window.__bf.game.player.y }));
check('double-tap Jump to fly in Creative', dt2.fly === true, { dt0, dt2, log: await ev(() => window.__fl) });
await ev(() => { delete window.__bf.game.tick; });
await ev(() => { const g = window.__bf.game; g.player.flying = false; g.setGameMode('survival'); });
await fast(20);

// ================================================================== HOTBAR
await ev(() => { const g = window.__bf.game; g.inventory.slots[4] = { id: 'torch', count: 5 }; g.inventory.selected = 0; g.inventory.changed(); });
const hb = await page.locator('[data-testid=touch-hotbar]').boundingBox();
await tapAt(hb.x + hb.width * (4.5 / 9), hb.y + hb.height / 2);
check('tap a hotbar slot to select it', (await ev(() => window.__bf.game.inventory.selected)) === 4);
await touch('touchStart', [[hb.x + hb.width * (4.5 / 9), hb.y + hb.height / 2]]);
await wait(700); await lift(); await fast(2);
const dropped = await ev(() => ({ left: window.__bf.game.inventory.countItem('torch'), items: window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'torch').length }));
check('hold a hotbar slot to drop one', dropped.left === 4 && dropped.items === 1, dropped);
// a slow frame lets the drop timer run before a quick tap's lift is seen: the item comes back
await ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item') e.removed = true; });
const hb0 = Date.now() / 1000;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hb.x + hb.width * (4.5 / 9), y: hb.y + hb.height / 2, id: 0 }], timestamp: hb0 });
const hbDropped = await waitFor(() => ev(() => window.__bf.game.inventory.countItem('torch') === 3), 4000);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: hb0 + 0.1 });
await fast(2);
const back = await ev(() => ({ left: window.__bf.game.inventory.countItem('torch'), inSlot: window.__bf.game.inventory.slots[4]?.count, items: window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed).length }));
check('a quick tap held up by a slow frame does not drop anything', hbDropped && back.left === 4 && back.inSlot === 4 && back.items === 0, { hbDropped, back });
await touch('touchStart', [[hb.x + hb.width * (1.5 / 9), hb.y + hb.height / 2]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[hb.x + hb.width * ((1.5 + i * 0.4) / 9), hb.y + hb.height / 2]]); await wait(40); }
await wait(700); await lift(); await fast(2);
const slid = await ev(() => ({ sel: window.__bf.game.inventory.selected, left: window.__bf.game.inventory.countItem('torch'), items: window.__bf.game.entities.list.filter((e) => e.type === 'item' && e.stack.id === 'torch').length }));
check('slide along the hotbar to choose a slot (nothing dropped)', slid.sel === 4 && slid.left === 4 && slid.items === 0, slid);

// ================================================================== INVENTORY
await tapSel('[data-testid=touch-inventory]');
await wait(400);
const inv = await ev(() => ({ overlay: window.__bf.state().overlay, close: !!document.querySelector('[data-testid=touch-close]') }));
check('the Inventory button opens the inventory, with a close button', inv.overlay === 'inventory' && inv.close, inv);
await ev(() => { const g = window.__bf.game; g.inventory.slots[9] = { id: 'cobblestone', count: 20 }; g.inventory.slots[10] = null; g.inventory.changed(); });
await wait(300);
await tapSel('[data-slot="main:9"]');
const cur = await ev(() => window.__bf.game.cursor.stack);
await tapSel('[data-slot="main:10"]');
const moved = await ev(() => { const g = window.__bf.game; return { a: g.inventory.slots[9], b: g.inventory.slots[10], cur: g.cursor.stack }; });
check('tap a stack to pick it up, tap a slot to put it down', cur?.id === 'cobblestone' && !moved.a && moved.b?.count === 20 && !moved.cur, { cur, moved });
check('lifting the finger clears the hover highlight and tooltip', !(await ev(() => document.querySelector('.tooltip') || document.querySelector('.slot .hover'))));
await shot('touch_inventory');
// ---- crafting by touch: no right button and no shift key on a phone
await ev(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.slots[9] = { id: 'log', count: 1 }; g.inventory.slots[12] = { id: 'cobblestone', count: 20 }; g.inventory.changed(); });
await wait(300);
const grid = [];
for (let i = 0; i < 4; i++) grid.push(await centreOf(`[data-slot^="craft:"] >> nth=${i}`));
const craftState = () => ev(() => { const g = window.__bf.game; return { grid: g.craft2.slots.map((s) => (s ? `${s.id}x${s.count}` : null)), cur: g.cursor.stack ? `${g.cursor.stack.id}x${g.cursor.stack.count}` : null, out: document.querySelector('[data-slot^="output:"] [style*=background]') ? 'yes' : 'no' }; });
await dragPath([await centreOf('[data-slot="main:9"]'), grid[0]]);
const cs1 = await craftState();
check('drag a stack onto another slot to move it there', cs1.grid[0] === 'logx1' && cs1.cur === null && !(await ev(() => window.__bf.game.inventory.slots[9])), cs1);
await tapSel('[data-slot^="output:"]');
const cs2 = await craftState();
check('tap the crafting result to take it', cs2.cur === 'planksx4' && cs2.grid.every((g) => g === null), cs2);
await touch('touchStart', [grid[0]]); await wait(750); await lift(); await wait(250);
const cs3 = await craftState();
check('touch and hold a slot to put down just one', cs3.grid[0] === 'planksx1' && cs3.cur === 'planksx3', cs3);
await dragPath([grid[1], grid[3], grid[2]], 750);
const cs4 = await craftState();
check('hold, then slide: one in each slot the finger crosses', cs4.grid.every((g) => g === 'planksx1') && cs4.cur === null, cs4);
await tapSel('[data-slot^="output:"]');
const cs5 = await craftState();
check('...which crafts a crafting table by touch alone', cs5.cur === 'crafting_tablex1', cs5);
await tapSel('[data-slot="main:10"]');
await ev(() => { const g = window.__bf.game; g.cursor.stack = { id: 'planks', count: 8 }; window.__bf.ui.set((s) => ({ invVersion: s.invVersion + 1 })); });
await wait(200);
await dragPath([grid[0], grid[1], grid[3], grid[2]]);
const cs6 = await craftState();
check('drag a carried stack across slots to share it out evenly', cs6.grid.every((g) => g === 'planksx2') && cs6.cur === null, cs6);
await ev(() => { const g = window.__bf.game; g.craft2.slots.fill(null); g.craft2.changed?.(); g.cursor.stack = null; window.__bf.ui.set((s) => ({ invVersion: s.invVersion + 1 })); });
await wait(200);
await touch('touchStart', [await centreOf('[data-slot="main:12"]')]); await wait(750); await lift(); await wait(250);
const half = await ev(() => { const g = window.__bf.game; return { slot: g.inventory.slots[12]?.count, cur: g.cursor.stack?.count }; });
check('touch and hold a stack to pick up half of it', half.slot === 10 && half.cur === 10, half);
await tapSel('[data-slot="main:12"]');
await tapSel('[data-testid=touch-close]');
await wait(300);
check('the close button returns to the game', (await state()).overlay === null && !!(await ev(() => document.querySelector('[data-testid=touch-controls]'))));
// a thumb left resting on the joystick doesn't stop the inventory working
await ev(() => { const g = window.__bf.game; g.inventory.slots[13] = { id: 'torch', count: 3 }; g.inventory.changed(); });
const invBtn = await centreOf('[data-testid=touch-inventory]');
await touch('touchStart', [[110, 300, 1]]);
await touch('touchStart', [[110, 300, 1], [invBtn[0], invBtn[1], 2]]);
await touch('touchEnd', [[invBtn[0], invBtn[1], 2]]);     // (CDP: touchEnd lists the fingers that lift) finger 2 lifts, the thumb stays
await wait(400);
const s13 = await centreOf('[data-slot="main:13"]');
await touch('touchStart', [[110, 300, 1], [s13[0], s13[1], 3]]);
await touch('touchEnd', [[s13[0], s13[1], 3]]);           // finger 3 taps and lifts
await wait(250);
const mf = await ev(() => ({ overlay: window.__bf.state().overlay, cur: window.__bf.game.cursor.stack }));
await lift(); await wait(200);
check('with a thumb still on the screen, a second finger works the inventory', mf.overlay === 'inventory' && mf.cur?.id === 'torch', mf);
await tapSel('[data-slot="main:13"]');
await tapSel('[data-testid=touch-close]'); await wait(300);
// Creative catalogue: swipe to scroll, tap to take
await ev(() => window.__bf.game.setGameMode('creative'));
await tapSel('[data-testid=touch-inventory]'); await wait(400);
await tapSel('[data-testid=tab-search]'); await wait(300);
const firstBefore = await ev(() => document.querySelector('[data-testid=creative-grid] [data-testid^=cat-]')?.getAttribute('data-testid'));
const gb = await page.locator('[data-testid=creative-grid] .slot').nth(22).boundingBox();
await touch('touchStart', [[gb.x + 10, gb.y + 10]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[gb.x + 10, gb.y + 10 - i * 14]]); await wait(30); }
await lift(); await wait(300);
const firstAfter = await ev(() => document.querySelector('[data-testid=creative-grid] [data-testid^=cat-]')?.getAttribute('data-testid'));
check('swipe the Creative catalogue to scroll it', firstBefore && firstAfter && firstBefore !== firstAfter, { firstBefore, firstAfter });
check('a swipe does not pick anything up', !(await ev(() => window.__bf.game.cursor.stack)));
await tapSel('[data-testid=creative-grid] [data-testid^=cat-]');
const took = await ev(() => window.__bf.game.cursor.stack);
check('tap an item to take a stack', !!took && took.count > 1, took);
// Safari with its address bar showing: the GUI shrinks in quarter steps so every screen still fits
const fits = async (h) => { await page.setViewportSize({ width: h[0], height: h[1] }); await wait(600);
  return ev(() => { const r = [...document.querySelectorAll('[data-testid=creative-screen] .tab, [data-testid=creative-screen] .panel')].map((e) => e.getBoundingClientRect()); return { gui: window.__bf.ui.get().gui, top: Math.min(...r.map((q) => q.top)), bottom: Math.max(...r.map((q) => q.bottom)), h: innerHeight }; }); };
const f1 = await fits([844, 340]), f2 = await fits([667, 320]);
await shot('touch_creative_small');
const f3 = await fits([W, H]);
check('in a browser tab (less height) the GUI shrinks so the catalogue still fits', f1.gui === 1.75 && f2.gui === 1.5 && f3.gui === 2 && f1.top >= -6 && f1.bottom <= 346 && f2.top >= -6 && f2.bottom <= 326 && f3.top >= -6 && f3.bottom <= H + 6, { f1, f2, f3 });
await tapSel('[data-testid=touch-close]'); await wait(300);
await ev(() => window.__bf.game.setGameMode('survival'));

// ================================================================== TRADING BY TOUCH
const vid = await ev(([x, y, z]) => {
  const g = window.__bf.game;
  const v = g.entities.spawnMob('villager', x + 0.5, y, z - 2, g);
  v.tick = function () { this.beginTick(); };
  v.job = 'smith'; v.level = 4; v.tradeXp = 999;
  v.trades = Array.from({ length: 8 }, (_, i) => ({ cost: ['dirt', 1], result: ['stick', i + 1], uses: 0, maxUses: 12, xp: 0, tier: 1 + (i >> 1) }));
  g.inventory.slots.fill(null); g.inventory.slots[20] = { id: 'dirt', count: 64 }; g.inventory.changed();
  window.__bf.engine.openTrade(v);
  return v.id;
}, [X, Y, Z]);
await wait(400);
const tl = await page.locator('[data-testid=trade-offer-3]').boundingBox();
const hadLast = await ev(() => !!document.querySelector('[data-testid=trade-offer-7]'));
await dragPath([[tl.x + tl.width / 2, tl.y + tl.height / 2], [tl.x + tl.width / 2, tl.y + tl.height / 2 - 60]]);
const swiped = await ev(() => ({ last: !!document.querySelector('[data-testid=trade-offer-7]'), dirt: window.__bf.game.inventory.countItem('dirt') }));
check('swipe the trade list to reach the last offers (a swipe does not trade)', !hadLast && swiped.last && swiped.dirt === 64, { hadLast, swiped });
await tapSel('[data-testid=trade-offer-7]');
const traded = await ev(() => ({ dirt: window.__bf.game.inventory.countItem('dirt'), sticks: window.__bf.game.inventory.countItem('stick') }));
check('tap an offer to trade', traded.dirt === 63 && traded.sticks === 8, traded);
await tapSel('[data-testid=touch-close]'); await wait(300);
await ev((id) => { const e = window.__bf.game.entities.list.find((q) => q.id === id); if (e) e.removed = true; }, vid);

// ================================================================== PAUSE AND OPTIONS
await tapSel('[data-testid=touch-pause]'); await wait(300);
check('the Pause button opens the game menu', (await state()).overlay === 'pause');
await page.getByText('Options...').first().tap(); await wait(400);
const sl = page.locator('.slider').first();
const sb2 = await sl.boundingBox();
const fov0 = await ev(() => window.__bf.engine.options.fov);
await touch('touchStart', [[sb2.x + sb2.width * 0.3, sb2.y + sb2.height / 2]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[sb2.x + sb2.width * (0.3 + i * 0.1), sb2.y + sb2.height / 2]]); await wait(30); }
await lift(); await wait(200);
const fov1 = await ev(() => window.__bf.engine.options.fov);
check('sliders follow a finger', fov1 > fov0 + 15, { fov0, fov1 });
await ev(() => window.__bf.engine.setOption('fov', 70));
const tcLabel = await page.locator('[data-testid=btn-touch-controls]').textContent();
check('Options has a Touch Controls setting (Auto, currently on)', /Auto \(On\)/.test(tcLabel || ''), tcLabel);
// the options list scrolls with a finger
const osb = await page.locator('.options-scroll').boundingBox();
const optBefore = await ev(() => ({ top: document.querySelector('.options-scroll').scrollTop, max: document.querySelector('.options-scroll').scrollHeight - document.querySelector('.options-scroll').clientHeight, overlay: window.__bf.state().overlay }));
await dragPath([[osb.x + 24, osb.y + osb.height * 0.8], [osb.x + 24, osb.y + osb.height * 0.2]]);
await wait(400);
const optAfter = await ev(() => ({ top: document.querySelector('.options-scroll').scrollTop, overlay: window.__bf.state().overlay, fov: window.__bf.engine.options.fov }));
check('swipe the Options list to scroll it', optBefore.max <= 0 || (optAfter.top > optBefore.top + 20 && optAfter.overlay === 'options'), { optBefore, optAfter });
await ev(() => { document.querySelector('.options-scroll').scrollTop = 0; });
await shot('touch_options');
await tapSel('[data-testid=btn-options-done]'); await wait(300);
await tapSel('[data-testid=btn-back-to-game]'); await wait(300);
check('Back to Game resumes play', (await state()).overlay === null && (await ev(() => window.__bf.engine.input.gameFocus)));

// ================================================================== SIGNS BY TOUCH
await ev(([x, y, z]) => window.__bf.game.teleport(x, y, z), [X + 0.5, Y, Z + 0.5]);
await look(0, -0.62); await give('sign', 0, 2); await wait(300);
await tapAt(LX, LY); await wait(400);
check('tap to place a sign opens the editor', (await state()).overlay === 'sign');
await shot('touch_sign');
const doneBox = await page.locator('[data-testid=btn-sign-done]').boundingBox();
check('the whole sign editor (and its Done button) fits on the phone screen', !!doneBox && doneBox.y + doneBox.height <= H && !!(await ev(() => document.querySelector('[data-testid=sign-touch-hint]'))), doneBox);
await page.locator('[data-testid=sign-line-1]').tap();
await page.keyboard.type('Hello phone');
await tapSel('[data-testid=btn-sign-done]'); await wait(300);
const signText = await ev(() => { const g = window.__bf.game; for (const [k, v] of g.world.blockEntities) if (v.type === 'sign') return v.lines[1]; return null; });
check('type on the phone keyboard and tap Done', signText === 'Hello phone' && (await state()).overlay === null, signText);

// ================================================================== BOATS AND FISHING BY TOUCH
await ev(([x, y, z]) => {
  const bf = window.__bf, g = bf.game;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -13; dz <= -6; dz++) { bf.setBlock(x + dx, y, z + dz, 'water'); bf.setBlock(x + dx, y - 1, z + dz, 'water'); }
  g.teleport(x + 0.5, y + 1, z - 4.5);
  g.player.yaw = 0; g.player.pitch = 0;
}, [X, Y - 1, Z]);
await give('boat', 0, 1);
await ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [X + 0.5, Y - 0.2, Z - 6.8]);
await wait(300);
await tapAt(LX, LY); await ticks(3);
const tb = await ev(() => window.__bf.game.entities.boats().map((q) => ({ x: q.x, y: q.y, z: q.z })));
check('tap with a boat in hand puts it on the water', tb.length === 1);
await fast(40);
await ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [tb[0].x, tb[0].y + 0.3, tb[0].z]);
await wait(300);
await tapAt(LX, LY); await ticks(3);
check('tap the boat to climb in', await ev(() => !!window.__bf.game.riding));
await ev(() => { const g = window.__bf.game; g.riding.yaw = 0; });
const bz0 = await ev(() => window.__bf.game.riding.z);
await touch('touchStart', [[110, 300]]);
await touch('touchMove', [[110, 256]]);
await fast(20);
await lift(); await fast(2);
const bz1 = await ev(() => window.__bf.game.riding?.z);
check('push the joystick forward to row', bz0 - bz1 > 2, { rowed: bz0 - bz1 });
await tapSel('[data-testid=touch-sneak]'); await fast(2);
const outOf = await ev(() => ({ riding: !!window.__bf.game.riding, latch: window.__bf.engine.input.sneakLatch, lit: document.querySelector('[data-testid=touch-sneak]').classList.contains('on') }));
check('in a boat the Sneak button climbs out (and does not stay switched on)', !outOf.riding && !outOf.latch && !outOf.lit, outOf);
await ev(([x, y, z]) => { const g = window.__bf.game; for (const q of g.entities.boats()) q.removed = true; g.teleport(x + 0.5, y + 1, z - 4.5); g.player.yaw = 0; g.player.pitch = 0; }, [X, Y - 1, Z]);
await ticks(3);
// fishing: tap to cast, tap again when a fish bites
await give('fishing_rod', 0, 1);
await ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [X + 0.5, Y - 0.2, Z - 10]);
await wait(300);
await tapAt(LX, LY); await ticks(2); await fast(50);
const tbob = await ev(() => window.__bf.game.bobber?.state ?? null);
check('tap with a fishing rod casts the line', tbob === 'floating', tbob);
await ev(() => window.__bf.hurryBite());
for (let i = 0; i < 120; i++) { await fast(1); if (await ev(() => (window.__bf.game.bobber?.bite ?? 0) > 0)) break; }
const fishBefore = await ev(() => { const inv = window.__bf.game.inventory; return inv.slots.filter(Boolean).reduce((a, q) => a + q.count, 0); });
await ev(() => { window.__realRandom = Math.random; Math.random = () => 0.1; });
await tapAt(LX, LY); await ticks(2);
await ev(() => { Math.random = window.__realRandom; });
await fast(60);
const fishAfter = await ev(() => window.__bf.game.inventory.countItem('raw_trout'));
check('tap again when the float dips to land the fish', fishAfter === 1, { fishAfter, fishBefore });
await shot('touch_fishing');

// ================================================================== PORTRAIT
await page.setViewportSize({ width: 390, height: 844 }); await wait(500);
check('held upright, a hint suggests turning the phone', !!(await ev(() => document.querySelector('[data-testid=rotate-hint]'))));
await page.setViewportSize({ width: W, height: H }); await wait(500);
check('turned sideways, the hint goes', !(await ev(() => document.querySelector('[data-testid=rotate-hint]'))));

// ================================================================== DESKTOP UNCHANGED
const desk = await b.newPage({ viewport: { width: 1280, height: 720 } });
await desk.goto(URL);
await desk.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
const dk = await desk.evaluate(() => ({ touch: window.__bf.ui.get().touch, gui: window.__bf.ui.get().gui, allow: window.__bf.engine.input.allowUnlocked }));
check('a computer keeps mouse and keyboard (no touch controls)', dk.touch === false && dk.gui === 3 && dk.allow === false, dk);
await desk.close();

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n==== SUMMARY');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(66)} ${i.slice(0, 220)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
