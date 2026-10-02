// Tests for the 1.1 features: shaped blocks, step-up, doors, beds, wall torches,
// flowing water and buckets, runes, new creatures, new biomes, saving.
// Run against the dev server: node tests/t_features.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, typeof info === 'string' ? info : JSON.stringify(info)]); };
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
// wait until the game has simulated a few ticks (headless rendering can be slow)
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 5000); };
// Moving the pointer to the centre can turn the camera (pointer lock), so keep the
// intended view direction and restore it after the move, before clicking.
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
// park the mouse where every click happens, so clicking never turns the camera
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Feature Test');
await page.fill('[data-testid=world-seed]', 'features');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); });
await wait(2500);

// A flat stone test area 3 blocks above the ground, open to the sky.
const base = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.rules.doMobSpawning = false;               // no wandering animals in the way of clicks
  g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true);   // keep the sky clear for these tests
  for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 3;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
    bf.setBlock(x0 + dx, y, z0 + dz, 'stone');
    for (let k = 1; k <= 8; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  g.player.flying = false;
  g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  g.dayNight.time = 1000;
  return { x: x0, y, z: z0 };
});
await wait(1500);
const give = (id, slot = 0, count = 64) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = { id, count }; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const blockAt = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const tp = (x, y, z, yaw = 0, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.yaw = yaw; g.player.pitch = pitch; g.player.vx = g.player.vy = g.player.vz = 0; }, [x, y, z, yaw, pitch]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const clear = () => ev((b) => { const bf = window.__bf; for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) { bf.setBlock(b.x + dx, b.y, b.z + dz, 'stone'); for (let k = 1; k <= 8; k++) bf.setBlock(b.x + dx, b.y + k, b.z + dz, 'air'); } }, base);
const Y = base.y + 1; // standing height
const pl = () => ev(() => { const p = window.__bf.game.player; return { x: p.x, y: p.y, z: p.z, onGround: p.onGround }; });

// ------------------------------------------------------------------ slabs & stairs
if (run('shapes')) {
  await tp(base.x + 0.5, Y, base.z + 3.5, 0, 0);
  await give('oak_slab');
  await aim(base.x + 0.5, base.y + 1, base.z + 0.5);  // top face of the floor, 3 blocks ahead
  await wait(300); await rclick();
  const s1 = await blockAt(base.x, Y, base.z);
  check('slab placed on a floor is a bottom slab', s1 === 'oak_slab:bottom', s1 === 'oak_slab:bottom' ? s1 : { s1, st: await ev(() => { const s = window.__bf.state(); return { t: s.target, o: s.overlay, sel: window.__bf.game.inventory.selectedStack, tick: window.__bf.game.tickCount, focus: window.__bf.engine?.input?.gameFocus }; }) });
  await aim(base.x + 0.5, Y + 0.5, base.z + 0.5); await wait(300); await rclick();
  const s2 = await blockAt(base.x, Y, base.z);
  check('a second slab on top joins into a full block', s2 === 'planks', s2);
  // top slab: click the upper half of a block's side
  await ev((b) => window.__bf.setBlock(b.x + 2, b.y + 1, b.z, 'stone'), base);
  await tp(base.x + 2.5, Y, base.z + 3.5, 0, 0);
  await give('stone_brick_slab');
  await aim(base.x + 2.5, Y + 0.8, base.z + 1.0);
  await waitFor(async () => { const t = await ev(() => window.__bf.state().target); return t && t.x === base.x + 2 && t.y === Y && t.z === base.z; }, 4000);
  await wait(300); await rclick();
  const s3 = await blockAt(base.x + 2, Y, base.z + 1);
  check('slab on the upper half of a side is a top slab', s3 === 'stone_brick_slab:top', s3);
  // stairs face the way the player looks
  await give('cobblestone_stairs');
  await tp(base.x - 3.5, Y, base.z + 3.5, 0, 0);
  await aim(base.x - 3.5, base.y + 1, base.z + 0.5); await wait(300); await rclick();
  const st1 = await blockAt(base.x - 4, Y, base.z);
  check('stairs placed facing away from the player (north)', st1 === 'cobblestone_stairs:n:bottom', st1);
  await shot('ft_shapes');
  // step-up: walk north onto a bottom slab then up a staircase
  await clear();
  // a wall stops the player on the slab first; it is then removed to reveal the stairs
  await ev((b) => { const bf = window.__bf; bf.setBlock(b.x, b.y + 1, b.z - 2, 'oak_slab:bottom'); for (let k = 1; k <= 3; k++) bf.setBlock(b.x, b.y + k, b.z - 3, 'stone'); }, base);
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await wait(500);
  await ev(() => { window.__bf.game.autopilot = { forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }; });
  await waitFor(async () => (await pl()).z < base.z - 1.6, 8000);
  await wait(600);
  const onSlab = await pl();
  await ev((b) => { const bf = window.__bf; for (let k = 1; k <= 3; k++) bf.setBlock(b.x, b.y + k, b.z - 3, 'air'); bf.setBlock(b.x, b.y + 1, b.z - 3, 'oak_stairs:n:bottom'); bf.setBlock(b.x, b.y + 1, b.z - 4, 'planks'); bf.setBlock(b.x, b.y + 1, b.z - 5, 'planks'); bf.setBlock(b.x, b.y + 2, b.z - 5, 'oak_stairs:n:bottom'); for (let k = 1; k <= 2; k++) bf.setBlock(b.x, b.y + k, b.z - 6, 'planks'); for (let k = 1; k <= 2; k++) bf.setBlock(b.x, b.y + k, b.z - 7, 'planks'); for (let k = 3; k <= 5; k++) bf.setBlock(b.x, b.y + k, b.z - 8, 'stone'); }, base);
  await waitFor(async () => (await pl()).z < base.z - 6.6, 10000);
  await wait(600);
  const onStair = await pl();
  await ev(() => { window.__bf.game.autopilot = null; });
  check('walks up onto a slab without jumping', Math.abs(onSlab.y - (Y + 0.5)) < 0.05, onSlab);
  check('walks up two flights of stairs without jumping', Math.abs(onStair.y - (Y + 2)) < 0.05 && onStair.z < base.z - 6.3, onStair);
}

// ------------------------------------------------------------------ doors
if (run('doors')) {
  await clear();
  await ev((b) => { const bf = window.__bf; for (let dx = -3; dx <= 3; dx++) if (dx !== 0) for (let k = 1; k <= 3; k++) bf.setBlock(b.x + dx, b.y + k, b.z, 'stone_bricks'); }, base);
  await tp(base.x + 0.5, Y, base.z + 3.5, 0, 0);
  await give('oak_door', 0, 16);
  await aim(base.x + 0.5, base.y + 1, base.z + 0.5); await wait(300); await rclick();
  const lower = await blockAt(base.x, Y, base.z), upper = await blockAt(base.x, Y + 1, base.z);
  check('door places a lower and an upper half', lower.startsWith('oak_door:lower:n:c') && upper.startsWith('oak_door:upper:n:c'), [lower, upper]);
  // walking into a closed door is blocked
  await ev(() => { window.__bf.game.autopilot = { forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }; });
  await wait(1500);
  const blockedAt = await pl();
  check('a closed door blocks the way', blockedAt.z > base.z + 0.5, blockedAt);
  await ev(() => { window.__bf.game.autopilot = null; });
  await aim(base.x + 0.5, Y + 0.5, base.z + 0.9); await wait(300); await rclick();
  const opened = await blockAt(base.x, Y, base.z), openedUp = await blockAt(base.x, Y + 1, base.z);
  check('right-click opens both halves', opened.includes(':o:') && openedUp.includes(':o:'), [opened, openedUp]);
  await ev(() => { window.__bf.game.player.yaw = 0; window.__bf.game.player.pitch = 0; window.__bf.game.autopilot = { forward: 1, strafe: 0, jump: false, sneak: false, sprint: false }; });
  await waitFor(async () => (await pl()).z < base.z - 0.6, 6000);
  const through = await pl();
  await ev(() => { window.__bf.game.autopilot = null; });
  check('an open door lets you through', through.z < base.z - 0.5, through);
  await shot('ft_door');
  // breaking the upper half removes the whole door and drops one item
  await ev((b) => { const g = window.__bf.game; g.breakBlockAt(b.x, b.y + 2, b.z, true, false); }, base);
  await wait(300);
  const gone = [await blockAt(base.x, Y, base.z), await blockAt(base.x, Y + 1, base.z)];
  const doorItems = await ev(() => window.__bf.game.entities.list.filter((e) => e.stack?.id === 'oak_door').reduce((a, e) => a + e.stack.count, 0));
  check('breaking one half removes the door and drops 1 door', gone[0] === 'air' && gone[1] === 'air' && doorItems === 1, { gone, doorItems });
}

// ------------------------------------------------------------------ wall torches
if (run('torches')) {
  await clear();
  await ev((b) => { const bf = window.__bf; for (let k = 1; k <= 3; k++) bf.setBlock(b.x, b.y + k, b.z - 2, 'cobblestone'); }, base);
  await tp(base.x + 0.5, Y, base.z + 1.5, 0, 0);
  await give('torch');
  await aim(base.x + 0.5, Y + 1.5, base.z - 1); await wait(300); await rclick();
  const wt = await blockAt(base.x, Y + 1, base.z - 1);
  check('torch on the side of a block becomes a wall torch facing out', wt === 'wall_torch:s', wt);
  await shot('ft_walltorch');
  await ev((b) => window.__bf.game.breakBlockAt(b.x, b.y + 2, b.z - 2, false, false), base);
  await waitFor(async () => (await blockAt(base.x, Y + 1, base.z - 1)) === 'air', 3000);
  check('a wall torch drops when its wall is removed', (await blockAt(base.x, Y + 1, base.z - 1)) === 'air');
}

// ------------------------------------------------------------------ beds and sleeping
if (run('beds')) {
  await clear();
  await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); });
  await tp(base.x + 0.5, Y, base.z + 3.5, 0, 0);
  await give('bed', 0, 1);
  await aim(base.x + 0.5, base.y + 1, base.z + 1.5); await wait(300); await rclick();
  const foot = await blockAt(base.x, Y, base.z + 1), head = await blockAt(base.x, Y, base.z);
  check('bed places a foot and a head half', foot === 'bed:foot:n' && head === 'bed:head:n', [foot, head]);
  await ev(() => { window.__bf.ui.set({ chat: [] }); });
  await aim(base.x + 0.5, Y + 0.4, base.z + 1.5); await wait(300); await rclick();
  const dayMsg = await ev(() => window.__bf.ui.get().chat.map((c) => c.text));
  check('by day the bed only sets the respawn point', dayMsg.includes('Respawn point set') && dayMsg.some((m) => m.startsWith('You can only sleep at night')) && (await ev(() => window.__bf.ui.get().overlay)) === null, dayMsg);
  await ev(() => { window.__bf.game.dayNight.time = 14000; });
  await wait(300);
  const day0 = await ev(() => window.__bf.game.dayNight.day);
  await aim(base.x + 0.5, Y + 0.4, base.z + 1.5); await wait(300); await rclick();
  check('at night right-clicking the bed starts sleeping', (await ev(() => window.__bf.ui.get().overlay)) === 'sleep');
  await wait(1500);
  await shot('ft_sleeping');
  await waitFor(async () => (await ev(() => window.__bf.ui.get().overlay)) === null, 20000);
  const after = await ev(() => { const d = window.__bf.game.dayNight; return { tod: d.timeOfDay, day: d.day }; });
  check('sleeping skips to the next morning', after.tod < 1000 && after.day === day0 + 1, after);
  // monsters nearby prevent sleep
  await ev(() => { window.__bf.game.dayNight.time += 14000; });
  await ev((b) => { const g = window.__bf.game; const m = g.entities.spawnMob('shambler', b.x + 3.5, b.y + 1, b.z + 3.5, g); m.tick = function () { this.beginTick(); }; window.__testMob = m; }, base);
  await aim(base.x + 0.5, Y + 0.4, base.z + 1.5); await wait(300); await rclick();
  const msgs = await ev(() => window.__bf.ui.get().chat.map((c) => c.text));
  check('cannot sleep with monsters nearby', msgs.some((t) => t.includes('monsters nearby')) && (await ev(() => window.__bf.ui.get().overlay)) !== 'sleep', msgs.slice(-2));
  await ev(() => { window.__testMob.removed = true; });
  // respawn at the bed
  await tp(base.x + 10.5, Y, base.z + 10.5);
  await ev(() => { const g = window.__bf.game; g.damagePlayer(100, { x: g.player.x, y: g.player.y, z: g.player.z, kind: 'void' }); });
  await wait(300);
  await ev(() => { window.__bf.game.respawn(); window.__bf.engine.closeOverlay(); });
  await wait(300);
  const rp = await pl();
  await wait(700);
  await ev(() => { if (window.__bf.ui.get().overlay) window.__bf.engine.closeOverlay(); });
  check('respawns next to the bed', Math.hypot(rp.x - (base.x + 0.5), rp.z - (base.z + 1)) < 3, rp);
  await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); g.dayNight.time = g.dayNight.time - g.dayNight.timeOfDay + 24000 + 1000; });
}

// ------------------------------------------------------------------ flowing water & buckets
if (run('water')) {
  await clear();
  const waterCount = () => ev((b) => {
    const bf = window.__bf; let src = 0, flow = 0, maxLevel = 0, far = 0;
    for (let dx = -11; dx <= 11; dx++) for (let dz = -11; dz <= 11; dz++) {
      const k = bf.getBlock(b.x + dx, b.y + 1, b.z + dz);
      if (k === 'water') src++;
      else if (k.startsWith('water_flow_')) { flow++; maxLevel = Math.max(maxLevel, Number(k.slice(11))); far = Math.max(far, Math.abs(dx) + Math.abs(dz)); }
    }
    return { src, flow, maxLevel, far };
  }, base);
  await tp(base.x + 0.5, Y, base.z + 4.5, 0, 0.0);
  await give('water_bucket', 0, 1);
  await ev(() => window.__bf.game.setGameMode('survival'));
  await aim(base.x + 0.5, base.y + 1, base.z + 0.5); await wait(300); await rclick();
  const bucketAfter = await ev(() => window.__bf.game.inventory.get(0)?.id);
  const diag = await ev(() => { const s = window.__bf.state(); const g = window.__bf.game, p = g.player; return { t: s.target, o: s.overlay, focus: window.__bf.engine.input.gameFocus, locked: window.__bf.engine.input.locked, p: [p.x, p.y, p.z, p.eyeY, p.yaw, p.pitch, p.sneaking, p.sleeping], reach: g.reach(), eye: g.eye(), dir: g.lookDir(), mode: p.creative }; });
  check('pouring a water bucket places a source and leaves an empty bucket', (await blockAt(base.x, Y, base.z)) === 'water' && bucketAfter === 'bucket', { bucketAfter, diag });
  await waitFor(async () => (await waterCount()).maxLevel >= 7, 25000);
  const spread = await waterCount();
  check('water spreads up to 7 blocks, getting weaker', spread.src === 1 && spread.maxLevel === 7 && spread.far === 7, spread);
  await tp(base.x + 0.5, Y, base.z + 2.5, 0, -0.9);
  await wait(600);
  await shot('ft_water_flow');
  // currents push the player
  await tp(base.x + 0.5, Y, base.z + 4.5, 0, 0);
  const before = await pl();
  await wait(1500);
  const pushed = await pl();
  check('flowing water pushes the player away from the source', pushed.z - before.z > 0.1, { before: before.z, after: pushed.z });
  // pick the source back up: the stream recedes
  // stand on a block so the current does not drift the aim while clicking
  await ev((b) => window.__bf.setBlock(b.x, b.y + 1, b.z + 3, 'stone'), base);
  await tp(base.x + 0.5, Y + 1, base.z + 3.5, 0, 0);
  await aim(base.x + 0.5, Y + 0.8, base.z + 0.5); await wait(300); await rclick();
  const picked = { held: await ev(() => window.__bf.game.inventory.get(0)?.id), block: await blockAt(base.x, Y, base.z) };
  // (the neighbouring stream may briefly trickle back into the hole before it recedes)
  check('an empty bucket picks up the source', picked.held === 'water_bucket' && picked.block !== 'water', picked);
  await ev((b) => window.__bf.setBlock(b.x, b.y + 1, b.z + 3, 'air'), base);
  await waitFor(async () => (await waterCount()).flow === 0, 30000);
  check('flowing water recedes when its source is removed', (await waterCount()).flow === 0, await waterCount());
  // waterfall into a hole
  await ev((b) => { const bf = window.__bf; for (let k = 0; k >= -3; k--) bf.setBlock(b.x + 2, b.y + k, b.z, 'air'); bf.setBlock(b.x + 2, b.y - 4, b.z, 'stone'); bf.setBlock(b.x, b.y + 1, b.z, 'water'); }, base);
  await waitFor(async () => (await blockAt(base.x + 2, base.y - 3, base.z)).startsWith('water'), 20000);
  const fall = [await blockAt(base.x + 2, base.y, base.z), await blockAt(base.x + 2, base.y - 3, base.z)];
  check('water pours down into a hole', fall[0] === 'water_falling' && fall[1].startsWith('water'), fall);
  await tp(base.x + 0.5, Y + 2, base.z + 3.5, 0, -0.6);
  await wait(500);
  await shot('ft_waterfall');
  // infinite water: two sources with a gap make a third
  await clear();
  await ev((b) => { const bf = window.__bf; for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) bf.setBlock(b.x + 5 + dx, b.y + 1, b.z + 5 + dz, 'stone'); bf.setBlock(b.x + 4, b.y + 1, b.z + 5, 'water'); bf.setBlock(b.x + 6, b.y + 1, b.z + 5, 'water'); bf.setBlock(b.x + 5, b.y + 1, b.z + 5, 'air'); }, base);
  await waitFor(async () => (await blockAt(base.x + 5, Y, base.z + 5)) === 'water', 15000);
  check('two sources side by side create a new source', (await blockAt(base.x + 5, Y, base.z + 5)) === 'water');
  await ev(() => window.__bf.game.setGameMode('creative'));
}

// ------------------------------------------------------------------ runes
if (run('runes')) {
  await clear();
  const r = await ev((b) => {
    const bf = window.__bf, g = bf.game, p = g.player;
    g.setGameMode('survival');
    bf.setBlock(b.x, b.y + 1, b.z - 2, 'rune_table');
    p.xpLevel = 25;
    g.runeSlots.slots[0] = { id: 'iron_pickaxe', count: 1 };
    g.runeSlots.slots[1] = { id: 'rune_shard', count: 10 };
    return true;
  }, base);
  void r;
  await tp(base.x + 0.5, Y, base.z + 0.5, 0, 0);
  await aim(base.x + 0.5, Y + 0.6, base.z - 1.5); await wait(300); await rclick();
  await waitFor(async () => (await ev(() => window.__bf.ui.get().overlay)) === 'runes', 3000);
  check('right-clicking a Rune Table opens it', (await ev(() => window.__bf.ui.get().overlay)) === 'runes');
  await wait(500);
  const offers = await page.locator('[data-testid^=rune-offer-]').allInnerTexts();
  check('three rune offers are shown for a pickaxe', offers.length === 3 && offers.every((t) => t.length > 0), offers);
  await shot('ft_runes_offers');
  await page.locator('[data-testid=rune-offer-3]').dispatchEvent('mousedown');
  await wait(400);
  const res = await ev(() => { const g = window.__bf.game; return { item: g.runeSlots.get(0), shards: g.runeSlots.get(1)?.count, level: g.player.xpLevel }; });
  check('inscribing spends levels and shards and adds runes', res.item?.ench && Object.keys(res.item.ench).length >= 1 && res.shards === 7 && res.level === 22, res);
  // tooltip + glint
  await page.hover('[data-slot="rune_item:0"]');
  await wait(300);
  const tip = await page.locator('.tooltip').innerText().catch(() => '');
  check('the tooltip lists the runes', /Swift|Sturdy|Bounty/.test(tip), tip);
  check('inscribed items shimmer', (await page.locator('[data-slot="rune_item:0"] .glint').count()) === 1);
  await shot('ft_runes_done');
  await page.keyboard.press('Escape'); await wait(400);
  // effects: Swift mines faster
  const speed = await ev(async () => {
    const m = await import('/src/interaction/BlockBreaking.ts');
    const B = window.__bf.B;
    const plain = m.breakProgressPerTick(B.STONE, { id: 'iron_pickaxe', count: 1 }, false, true);
    const swift = m.breakProgressPerTick(B.STONE, { id: 'iron_pickaxe', count: 1, ench: { swift: 2 } }, false, true);
    return { plain, swift };
  });
  check('Swift II mines stone faster', speed.swift > speed.plain * 1.5, speed);
  const prot = await ev(() => {
    const g = window.__bf.game, p = g.player;
    p.health = 20; p.invulnerable = 0;
    g.damagePlayer(10, { x: p.x, y: p.y, z: p.z - 1, kind: 'mob' });
    const plain = 20 - p.health;
    p.health = 20; p.invulnerable = 0;
    g.inventory.slots[36] = { id: 'leather_helmet', count: 1, ench: { warding: 3 } };
    g.inventory.slots[37] = { id: 'leather_chestplate', count: 1, ench: { warding: 3 } };
    g.inventory.slots[38] = { id: 'leather_leggings', count: 1 };
    g.inventory.slots[39] = { id: 'leather_boots', count: 1 };
    g.damagePlayer(10, { x: p.x, y: p.y, z: p.z - 1, kind: 'mob' });
    const warded = 20 - p.health;
    for (let i = 36; i < 40; i++) g.inventory.slots[i] = null;
    p.health = 20;
    return { plain, warded };
  });
  check('Warding reduces damage', prot.warded < prot.plain * 0.9, prot);
  await ev(() => { window.__bf.game.setGameMode('creative'); window.__bf.game.player.health = 20; });
}

// ------------------------------------------------------------------ creatures
if (run('mobs')) {
  await clear();
  const kinds = ['goat', 'rabbit', 'crawler', 'dustwalker'];
  await ev(([b, kinds]) => {
    const g = window.__bf.game;
    kinds.forEach((k, i) => { const m = g.entities.spawnMob(k, b.x - 3 + i * 2 + 0.5, b.y + 1, b.z - 3.5, g); m.yaw = Math.PI; window['__' + k] = m; m.persistent = true; });
    g.dayNight.time = 1000;
  }, [base, kinds]);
  await tp(base.x + 0.5, Y, base.z + 1.5, 0, -0.1);
  await wait(3000);
  const alive = await ev((kinds) => kinds.map((k) => window['__' + k].alive && !window['__' + k].removed), kinds);
  check('goat, rabbit, crawler and dustwalker spawn and live', alive.every(Boolean), alive);
  await ev((kinds) => { for (const k of kinds) { const m = window['__' + k]; m.tick = function () { this.beginTick(); }; m.yaw = Math.PI; m.prevYaw = Math.PI; } }, kinds);
  await wait(500);
  await shot('ft_mobs');
  // crawler climbs a wall; dustwalker does not burn by day
  await ev(([b, kinds]) => {
    const bf = window.__bf, g = window.__bf.game;
    for (const k of kinds) window['__' + k].removed = true;
    g.setGameMode('survival'); g.player.health = 20;
    for (let dx = -3; dx <= 3; dx++) for (let k = 1; k <= 4; k++) bf.setBlock(b.x + dx, b.y + k, b.z - 6, 'stone');
    for (let dx = -3; dx <= 3; dx++) for (let dz = -7; dz >= -10; dz--) bf.setBlock(b.x + dx, b.y + 4, b.z + dz, 'stone');
    g.dayNight.time = 18000;
    const c = g.entities.spawnMob('crawler', b.x + 0.5, b.y + 1, b.z - 2.0, g);
    const d = g.entities.spawnMob('dustwalker', b.x - 2.5, b.y + 1, b.z + 3.5, g);
    window.__crawler = c; window.__dust = d;
  }, [base, kinds]);
  // stand at the top edge of the wall so the crawler can see you from below
  await tp(base.x + 0.5, Y + 4, base.z - 5.6, Math.PI, 0);
  await waitFor(() => ev(() => window.__crawler.y > window.__bf.game.player.y - 1.5), 20000);
  const cy = await ev(() => ({ c: window.__crawler.y, p: window.__bf.game.player.y }));
  check('a crawler climbs up a wall to reach you', cy.c > cy.p - 1.5, cy);
  const dh0 = await ev(() => { window.__bf.game.dayNight.time = 6000; return window.__dust.health; });
  await wait(4000);
  const dh1 = await ev(() => window.__dust.health);
  check('a dustwalker does not burn in daylight', dh1 === dh0 && (await ev(() => window.__dust.alive)), { dh0, dh1 });
  await ev(() => { window.__crawler.removed = true; window.__dust.removed = true; const g = window.__bf.game; g.setGameMode('creative'); g.player.health = 20; });
}

// ------------------------------------------------------------------ biomes
if (run('biomes')) {
  const found = await ev(() => {
    const gen = window.__bf.game.world.generator;
    const names = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Mountains', 'Snowy Peaks', 'River', 'Birch Forest', 'Taiga', 'Badlands'];
    const where = {};
    for (let r = 0; r < 4000 && Object.keys(where).length < names.length; r += 16) {
      for (let a = 0; a < 24; a++) {
        const x = Math.floor(Math.cos(a / 24 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 24 * Math.PI * 2) * r);
        const n = names[gen.column(x, z).biome];
        if (!where[n]) where[n] = [x, z];
      }
    }
    return where;
  });
  check('Birch Forest, Taiga and Badlands generate', !!found['Birch Forest'] && !!found['Taiga'] && !!found['Badlands'], found);
  for (const [biome, want] of [['Taiga', 'spruce_log'], ['Badlands', 'terracotta'], ['Birch Forest', 'birch_log']]) {
    const at = found[biome];
    if (!at) continue;
    await ev(([x, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, 110, z + 0.5); }, at);
    await waitFor(() => ev(([x, z]) => !!window.__bf.game.world.getChunk(x >> 4, z >> 4) && window.__bf.state().chunks.meshQueue === 0, at), 60000);
    await wait(1500);
    const has = await ev(([x, z, want]) => {
      const bf = window.__bf, g = bf.game;
      let n = 0;
      for (let dx = -24; dx <= 24; dx += 1) for (let dz = -24; dz <= 24; dz += 1) {
        const top = g.world.highestSolid(x + dx, z + dz);
        for (let y = top; y > top - 12 && y > 0; y--) if (bf.getBlock(x + dx, y, z + dz).includes(want)) { n++; break; }
      }
      return n;
    }, [...at, want]);
    check(`${biome} contains ${want}`, has > 0, has);
    await ev(() => { const g = window.__bf.game, p = g.player; p.pitch = -0.35; window.__bf.ui.set({ chat: [] }); });
    await wait(1200);
    await shot(`ft_biome_${biome.replace(' ', '_')}`);
  }
}

// ------------------------------------------------------------------ save & reload
if (run('save')) {
  await tp(base.x + 0.5, Y, base.z + 4.5, 0, 0);
  await wait(3000);
  await clear();
  await ev((b) => {
    const bf = window.__bf, g = bf.game;
    bf.setBlock(b.x, b.y + 1, b.z, 'oak_door:lower:n:o:l'); bf.setBlock(b.x, b.y + 2, b.z, 'oak_door:upper:n:o:l');
    bf.setBlock(b.x + 2, b.y + 1, b.z, 'bed:foot:e'); bf.setBlock(b.x + 3, b.y + 1, b.z, 'bed:head:e');
    bf.setBlock(b.x - 2, b.y + 1, b.z, 'brick_stairs:w:top');
    bf.setBlock(b.x - 3, b.y + 1, b.z, 'sandstone_slab:top');
    bf.setBlock(b.x + 5, b.y + 1, b.z + 3, 'water_flow_3');
    g.inventory.slots[5] = { id: 'iron_sword', count: 1, ench: { keen: 2, plunder: 1 } };
    g.inventory.changed();
  }, base);
  await wait(500);
  await page.keyboard.press('Escape'); await wait(400);
  await page.click('[data-testid=btn-save-quit]');
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 20000);
  await page.click('[data-testid=btn-singleplayer]'); await wait(500);
  await page.locator('[data-testid=world-entry]', { hasText: 'Feature Test' }).first().click();
  await page.click('[data-testid=btn-play-selected]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await wait(2500);
  const kept = await ev((b) => { const bf = window.__bf; return [bf.getBlock(b.x, b.y + 1, b.z), bf.getBlock(b.x + 3, b.y + 1, b.z), bf.getBlock(b.x - 2, b.y + 1, b.z), bf.getBlock(b.x - 3, b.y + 1, b.z)]; }, base);
  check('doors, beds, stairs and slabs are saved', kept[0] === 'oak_door:lower:n:o:l' && kept[1] === 'bed:head:e' && kept[2] === 'brick_stairs:w:top' && kept[3] === 'sandstone_slab:top', kept);
  const sword = await ev(() => window.__bf.game.inventory.get(5));
  check('runes on items are saved', sword?.ench?.keen === 2 && sword?.ench?.plunder === 1, sword);
  const gv = await ev(() => window.__bf.game.world.genVersion);
  check('new worlds use the newest terrain version', gv === 6, gv);
}

// old worlds keep their terrain version
if (run('compat')) {
  const v = await ev(async () => {
    const s = window.__bf.engine.saves;
    const w = (await s.listWorlds())[0];
    const old = { ...w, id: 'wcompat', name: 'Old World', genVersion: undefined };
    delete old.genVersion;
    await s.putWorld(old);
    const { World } = await import('/src/world/World.ts');
    const rec = await s.getWorld('wcompat');
    const world = new World(rec.seed, rec.structures, rec.genVersion ?? 1);
    await s.deleteWorld('wcompat');
    return { version: world.genVersion, gen: world.generator.version };
  });
  check('worlds saved before 1.1 keep the original terrain generator', v.version === 1 && v.gen === 1, v);
}

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n===== FEATURE RESULTS =====');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(64)} ${i.slice(0, 160)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
