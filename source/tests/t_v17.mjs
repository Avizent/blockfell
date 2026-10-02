// Tests for 1.7: lava (flowing, glowing, burning), Cinderstone, lava buckets, buried lava
// lakes and lava caves (terrain version 5), dungeons with Monster Cages and loot.
// node tests/t_v17.mjs          (dev server)       ONLY=items,lava,player,gen,dungeon,save
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'lava', 'player', 'gen', 'dungeon', 'save'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
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
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const give = (id, slot = 0, count = 1) => ev(([id, slot, count]) => { const g = window.__bf.game; g.inventory.slots[slot] = count ? { id, count } : null; g.inventory.selected = slot; g.inventory.changed(); }, [id, slot, count]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(400); };

async function newWorld(name, seed, creative = false) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', seed);
  if (creative) await page.click('[data-testid=btn-gamemode]');
  await page.click('[data-testid=btn-create-world]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => {
    window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] });
    const g = window.__bf.game;
    g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
    g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
    for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
  });
  await wait(1500);
}

await page.goto(URL);
await page.mouse.move(CX, CY);
await newWorld('Lava Test', 'lava');

// A test floor high above the terrain: 30 x 30 of stone at y = 100, open sky above.
const P = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = 100;
  for (let dx = -15; dx <= 15; dx++) for (let dz = -15; dz <= 15; dz++) {
    bf.setBlock(x0 + dx, y, z0 + dz, 'stone');
    for (let k = 1; k <= 8; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  p.flying = true; g.teleport(x0 + 0.5, y + 1, z0 + 0.5);
  return { x: x0, y: y + 1, z: z0 };
});
const clear = () => ev((P) => {
  const bf = window.__bf, g = bf.game;
  for (let dx = -15; dx <= 15; dx++) for (let dz = -15; dz <= 15; dz++) {
    bf.setBlock(P.x + dx, P.y - 1, P.z + dz, 'stone');
    for (let k = 0; k <= 7; k++) bf.setBlock(P.x + dx, P.y + k, P.z + dz, 'air');
  }
  for (const e of g.entities.list) if (e.type !== 'player') e.removed = true;
  g.fluids.tick(g.tickCount + 1000);
}, P);

// ======================================================================= ITEMS
if (run('items')) {
  const info = await ev(() => ['lava_bucket', 'cinderstone', 'spawner'].map((id) => { const i = window.__bf.item(id); return { id, name: i.name, category: i.category, block: i.block ?? null }; }));
  check('new items: Lava Bucket (Tools), Cinderstone (Building), Monster Cage (Functional)',
    info[0].name === 'Lava Bucket' && info[0].category === 'tools' && info[1].name === 'Cinderstone' && info[1].category === 'building' && info[2].name === 'Monster Cage' && info[2].category === 'functional', info);
  const fuel = await ev(async () => { const m = await import('/src/inventory/ItemRegistry.ts'); return m.getItem('lava_bucket').fuel; });
  check('a lava bucket is furnace fuel for 100 items', fuel === 20000, fuel);
  const icons = await ev(() => {
    const ic = window.__bf.engine.icons;
    return ['lava_bucket', 'cinderstone', 'spawner'].map((id) => ic.style(id).backgroundPosition);
  });
  check('each has an icon', new Set(icons).size === 3 && icons.every(Boolean), icons);
  const mining = await ev(async () => {
    const { breakProgressPerTick, canHarvest } = await import('/src/interaction/BlockBreaking.ts');
    const B = window.__bf.B;
    const iron = { id: 'iron_pickaxe', count: 1 }, stone = { id: 'stone_pickaxe', count: 1 };
    return {
      ironTicks: Math.ceil(1 / breakProgressPerTick(B.CINDERSTONE, iron, false, true)),
      stoneHarvest: canHarvest(B.getBlock(B.CINDERSTONE), stone), ironHarvest: canHarvest(B.getBlock(B.CINDERSTONE), iron),
      stoneTicks: Math.ceil(1 / breakProgressPerTick(B.CINDERSTONE, stone, false, true)),
    };
  });
  check('Cinderstone takes about 9 seconds with an iron pickaxe; a stone pickaxe gets nothing', mining.ironTicks >= 170 && mining.ironTicks <= 190 && mining.ironHarvest && !mining.stoneHarvest && mining.stoneTicks > 800, mining);
}

// ======================================================================= LAVA
if (run('lava')) {
  await clear();
  // watch from a safe distance (Creative, hovering)
  const x = P.x, y = P.y, z = P.z;
  const away = () => ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; g.teleport(x + 0.5, y + 3, z + 9.5); }, [x, y, z]);
  await away();
  // a lava source in the middle of the floor spreads 3 blocks, slowly
  await set(x, y, z, 'lava');
  await fast(35);
  const early = [await key(x + 1, y, z), await key(x + 2, y, z)];
  await fast(200);
  const ring = [await key(x + 1, y, z), await key(x + 2, y, z), await key(x + 3, y, z), await key(x + 4, y, z), await key(x - 3, y, z), await key(x, y, z + 3)];
  check('lava spreads slowly: one block after 1.5 seconds', early[0] === 'lava_flow_2' && early[1] === 'air', early);
  check('...and no further than 3 blocks, getting shallower', ring[0] === 'lava_flow_2' && ring[1] === 'lava_flow_4' && ring[2] === 'lava_flow_6' && ring[3] === 'air' && ring[4] === 'lava_flow_6' && ring[5] === 'lava_flow_6', ring);
  // light
  await settle();
  const light = await ev(([x, y, z]) => window.__bf.game.world.getLight(x + 5, y, z) & 15, [x, y, z]);
  check('lava glows (block light 15 at the source, 13 two blocks past its edge)', light >= 12, light);
  // it is drawn: look straight down at the pool from above
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, y + 4, z + 0.5); g.player.yaw = 0; g.player.pitch = -Math.PI / 2 + 0.01; window.__bf.ui.set({ hideHud: true }); }, [x, y, z]);
  await settle(); await wait(500);
  const shot = await page.screenshot();
  const px = await ev(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(Math.floor(img.width / 2) - 20, Math.floor(img.height / 2) - 20, 40, 40).data;
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  }, shot.toString('base64'));
  await page.screenshot({ path: `${SHOTS}/v17_lava_pool.png` });
  await ev(() => window.__bf.ui.set({ hideHud: false }));
  await away();
  check('lava is drawn glowing orange', px[0] > 170 && px[1] > 50 && px[1] < 190 && px[2] < 90, px);
  // removing the source: the flow recedes
  await set(x, y, z, 'air');
  await fast(260);
  const gone = [await key(x + 1, y, z), await key(x + 2, y, z), await key(x + 3, y, z)];
  check('take the source away and the flowing lava drains away', gone.every((k) => k === 'air'), gone);

  // falling lava over an edge
  await clear();
  await set(x, y - 1, z, 'air'); await set(x, y - 2, z, 'air'); await set(x, y - 3, z, 'stone');
  await set(x - 1, y, z, 'lava');
  await fast(100);
  const fall = [await key(x, y, z), await key(x, y - 1, z)];
  check('lava pours down over an edge', fall[0] === 'lava_flow_2' && (fall[1] === 'lava_falling' || fall[1].startsWith('lava')), fall);

  // lava + water
  await clear();
  await ev(() => window.__bf.game.progress.done.delete('cinder'));
  await set(x, y, z, 'lava');
  await fast(5);
  await set(x + 1, y, z, 'water');
  await fast(10);
  const cinder = await key(x, y, z);
  check('water touching a lava source turns it into Cinderstone', cinder === 'cinderstone', cinder);
  check('...with a hiss and steam, and the Cooling Off advancement', await ev(() => window.__bf.game.progress.done.has('cinder')), await ev(() => { const p = window.__bf.game.player; return { p: [p.x, p.y, p.z], dead: p.dead, mode: p.gameMode }; }));
  // flowing lava + water -> cobblestone
  await clear();
  await set(x - 3, y, z, 'lava');
  await fast(200);          // flows to x-2, x-1, x
  const flowAt = await key(x - 1, y, z);
  await set(x + 1, y, z, 'water');
  await fast(40);
  const cobble = [await key(x, y, z), await key(x - 1, y, z), await key(x - 3, y, z)];
  check('water meeting flowing lava makes cobblestone (the source stays lava)', flowAt === 'lava_flow_4' && (cobble[0] === 'cobblestone' || cobble[1] === 'cobblestone') && cobble[2] === 'lava', { flowAt, cobble });
  // lava flowing down onto water -> stone
  await clear();
  await set(x, y, z, 'water');
  await set(x, y + 1, z, 'lava');
  await fast(40);
  const onWater = [await key(x, y, z), await key(x, y + 1, z)];
  check('lava poured on top of water turns the water to stone', onWater[0] === 'stone', onWater);
  // lava burns plants and torches in its way
  await clear();
  await set(x + 1, y, z, 'torch');
  await set(x, y, z, 'lava');
  await fast(40);
  const torch = [await key(x + 1, y, z), await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item').length)];
  check('lava burns a torch in its way (no drop)', torch[0].startsWith('lava') && torch[1] === 0, torch);
  // items dropped into lava burn
  await clear();
  await set(x, y, z, 'lava');
  await ev(([x, y, z]) => { window.__bf.game.entities.spawnItem({ id: 'planks', count: 5 }, x + 0.5, y + 1.2, z + 0.5, [0, 0, 0], 0); }, [x, y, z]);
  await fast(40);
  const items = await ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed).length);
  check('items thrown into lava burn up', items === 0, items);
  // a pig in lava burns and dies
  const pig = await ev(([x, y, z]) => { const g = window.__bf.game; const m = g.entities.spawnMob('pig', x + 0.5, y, z + 0.5, g); return m.id; }, [x, y, z]);
  await fast(20);
  const pigState = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return m ? { h: m.health, fire: m.fireTicks, removed: m.removed } : null; }, pig);
  await fast(120);
  const pigGone = await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); return !m || m.removed || m.health <= 0; }, pig);
  check('a creature in lava burns (on fire, losing health) and dies', !!pigState && pigState.h < 10 && pigState.fire > 0 && pigGone, pigState);
  // boats burn
  await ev(([x, y, z]) => { window.__bf.game.entities.spawnBoat(x + 0.5, y, z + 0.5, 0); }, [x, y, z]);
  await fast(5);
  const boats = await ev(() => window.__bf.game.entities.boats().length);
  check('a boat pushed into lava burns up', boats === 0, boats);

  // buckets
  await clear();
  await set(x + 2, y, z, 'lava');
  await ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('survival'); g.player.flying = false; g.teleport(x + 0.5, y, z + 0.5); }, [x, y, z]);
  await give('bucket', 0, 1);
  await aim(x + 2.5, y + 0.4, z + 0.5);
  await rclick();
  const scoop = { held: await ev(() => window.__bf.game.inventory.get(0)?.id), cell: await key(x + 2, y, z) };
  check('an empty bucket scoops up a lava source', scoop.held === 'lava_bucket' && scoop.cell === 'air', scoop);
  await aim(x + 3.5, y - 0.02, z + 0.5);
  await rclick();
  const poured = { held: await ev(() => window.__bf.game.inventory.get(0)?.id), cell: await key(x + 3, y, z) };
  check('a lava bucket pours a lava source where you point', poured.held === 'bucket' && poured.cell === 'lava', poured);
  // furnace: a lava bucket burns for 100 items and leaves the bucket
  const furnace = await ev(([x, y, z]) => {
    const g = window.__bf.game, bf = window.__bf;
    bf.setBlock(x - 4, y, z, 'furnace:n');
    const k = `${x - 4},${y},${z}`;
    g.world.blockEntities.set(k, { type: 'furnace', items: [{ id: 'cobblestone', count: 64 }, { id: 'lava_bucket', count: 1 }, null], burnTime: 0, burnTotal: 0, cookTime: 0, xp: 0 });
    g.furnaces.add(k);
    for (let i = 0; i < 5; i++) g.tick();
    const be = g.world.blockEntities.get(k);
    return { fuel: be.items[1], burn: be.burnTotal };
  }, [x, y, z]);
  check('a lava bucket in a furnace burns for 100 items and gives the bucket back', furnace.fuel?.id === 'bucket' && furnace.burn === 20000, furnace);
}

// ======================================================================= PLAYER IN LAVA
if (run('player')) {
  await clear();
  await ev(() => { const g = window.__bf.game; if (g.player.dead) g.respawn(); });
  const x = P.x, y = P.y, z = P.z;
  // a pool two deep
  await ev(([x, y, z]) => {
    const bf = window.__bf;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'lava'); bf.setBlock(x + dx, y - 2, z + dz, 'lava'); bf.setBlock(x + dx, y - 3, z + dz, 'stone'); }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) === 3 || Math.abs(dz) === 3) { bf.setBlock(x + dx, y - 1, z + dz, 'stone'); bf.setBlock(x + dx, y - 2, z + dz, 'stone'); }
  }, [x, y, z]);
  // creative players don't burn
  await ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = false; g.teleport(x + 0.5, y - 1.5, z + 0.5); }, [x, y, z]);
  await fast(40);
  const cr = await ev(() => { const p = window.__bf.game.player; return { h: p.health, fire: p.fireTicks }; });
  check('in Creative, lava does no harm', cr.h === 20 && cr.fire === 0, cr);
  // survival
  await ev(([x, y, z]) => { const g = window.__bf.game; g.setGameMode('survival'); const p = g.player; p.health = 20; p.flying = false; g.teleport(x + 0.5, y - 1.2, z + 0.5); p.vx = p.vy = p.vz = 0; }, [x, y, z]);
  await fast(1);
  const t0 = await ev(() => { const p = window.__bf.game.player; return { h: p.health, y: p.y, inLava: p.inLava }; });
  await fast(21);
  const t1 = await ev(() => { const p = window.__bf.game.player; return { h: p.health, y: p.y, fire: p.fireTicks, inLava: p.inLava }; });
  check('in lava you lose about 2 hearts every half second', t0.inLava && t1.h <= 20 - 6 && t1.h >= 20 - 13, { t0, t1 });
  check('...and you are set on fire', t1.fire > 200, t1);
  await ticks(2);
  const hud = await ev(() => ({ inLava: !!document.querySelector('[data-testid=in-lava]'), fire: !!document.querySelector('[data-testid=on-fire]') }));
  check('the screen glows orange and flames lick up from below', hud.inLava && hud.fire, hud);
  // moving: slow, you sink
  const sink = await ev(() => {
    const g = window.__bf.game, p = g.player;
    const y0 = p.y;
    for (let i = 0; i < 5; i++) g.tick();
    return { dy: p.y - y0, vy: p.vy };
  });
  check('lava is thick: you sink slowly', sink.dy <= 0.05, sink);
  // climb out: still burning; water puts it out
  await ev(([x, y, z]) => { const g = window.__bf.game, p = g.player; p.health = 20; g.teleport(x + 5.5, y, z + 0.5); p.vx = p.vy = p.vz = 0; }, [x, y, z]);
  await fast(45);
  const burn = await ev(() => { const p = window.__bf.game.player; return { h: p.health, fire: p.fireTicks }; });
  check('out of the lava you keep burning (half a heart a second)', burn.fire > 0 && burn.h < 20 && burn.h >= 17, burn);
  await ev(([x, y, z]) => { window.__bf.setBlock(x + 5, y, z, 'water'); }, [x, y, z]);
  await fast(3);
  const out = await ev(() => { const p = window.__bf.game.player; return { h: p.health, fire: p.fireTicks }; });
  check('stepping into water puts the fire out', out.fire === 0, out);
  await ticks(3);
  check('...and the flames leave the screen', !(await ev(() => !!document.querySelector('[data-testid=on-fire]'))));
  await ev(([x, y, z]) => window.__bf.setBlock(x + 5, y, z, 'air'), [x, y, z]);
  // dying in lava
  await ev(([x, y, z]) => { const g = window.__bf.game, p = g.player; p.health = 4; g.teleport(x + 0.5, y - 1.2, z + 0.5); p.vx = p.vy = p.vz = 0; }, [x, y, z]);
  await fast(30);
  await ticks(3);
  const death = await ev(() => ({ dead: window.__bf.game.player.dead, msg: window.__bf.ui.get().deathMessage }));
  check('dying in lava: "You sank into the lava"', death.dead && death.msg === 'You sank into the lava', death);
  await ev(() => window.__bf.game.respawn());
  await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; });
}

// ======================================================================= GENERATION
let dungeon = null;
if (run('gen') || run('dungeon') || run('save')) {
  const gen = await ev(() => {
    const g = window.__bf.game, w = g.world, B = window.__bf.B;
    let caveLava = 0, lowAir = 0;
    const pcx = Math.floor(g.player.x / 16), pcz = Math.floor(g.player.z / 16);
    for (let cx = pcx - 3; cx <= pcx + 3; cx++) for (let cz = pcz - 3; cz <= pcz + 3; cz++) {
      const b = w.generator.generateChunk(cx, cz).blocks;
      for (let i = 0; i < b.length; i++) {
        const y = i >> 8;
        if (y > 10 || y < 5) continue;
        if (B.IS_LAVA[b[i]]) caveLava++;
        else if (b[i] === B.AIR) lowAir++;
      }
    }
    return { version: w.genVersion, caveLava, lowAir };
  });
  check('new worlds use terrain version 5 or later', gen.version >= 5, gen);
  check('caves fill with lava below height 11 (lava lakes, no open air down there)', gen.caveLava > 500 && gen.lowAir === 0, gen);
  const lakes = await ev(() => window.__bf.lavaLakes(7));
  check('buried lava lakes lie higher up (about one chunk in 14)', lakes.length >= 2, { n: lakes.length, first: lakes[0] });
  const sealed = await ev((L) => {
    const g = window.__bf.game, B = window.__bf.B;
    const cx = Math.floor(L.x / 16), cz = Math.floor(L.z / 16);
    const b = g.world.generator.generateChunk(cx, cz).blocks;
    let leaks = 0, lava = 0;
    for (let i = 0; i < b.length; i++) {
      if (!B.IS_LAVA[b[i]] || (i >> 8) <= 11) continue;
      lava++;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
        const n = b[(y << 8) | (nz << 4) | nx];
        if (n === B.AIR || B.IS_WATER[n]) leaks++;
      }
      if (b[((y - 1) << 8) | (z << 4) | x] === B.AIR) leaks++;
    }
    return { lava, leaks };
  }, lakes[0]);
  check('a buried lake is sealed in rock (no lava spilling into caves until you dig)', sealed.lava > 20 && sealed.leaks === 0, sealed);
  const dungeons = await ev(() => window.__bf.dungeons(6));
  dungeon = dungeons[0] ?? null;
  const mobs = [...new Set(dungeons.map((d) => d.mob))];
  check('dungeons are hidden underground (about one chunk in 8-10)', dungeons.length >= 5 && dungeons.every((d) => d.y >= 12 && d.y <= 56), { n: dungeons.length, ys: dungeons.map((d) => d.y) });
  check('cages make Shamblers, Bone Archers or Crawlers', mobs.every((m) => ['shambler', 'skeleton', 'crawler'].includes(m)) && mobs.length >= 2, mobs);
  const compat = await ev(async () => {
    const { World } = await import('/src/world/World.ts');
    const B = window.__bf.B;
    const count = (w) => {
      let lava = 0, sp = 0;
      for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) {
        const r = w.generator.generateChunk(cx, cz);
        sp += r.spawners.length;
        for (const id of r.blocks) if (B.IS_LAVA[id]) lava++;
      }
      return { lava, sp };
    };
    return { v4: count(new World(777, true, 4)), noStructures: count(new World(777, false, 5)) };
  });
  check('worlds made before 1.7 (terrain version 4) get no lava or dungeons', compat.v4.lava === 0 && compat.v4.sp === 0, compat);
  check('with Structures off there are lava lakes but no dungeons', compat.noStructures.lava > 0 && compat.noStructures.sp === 0, compat);
}

// ======================================================================= DUNGEON
if (run('dungeon') && dungeon) {
  const D = dungeon;
  await ev((D) => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; g.teleport(D.x + 1.5, D.y, D.z + 0.5); }, D);
  await waitFor(() => ev((D) => window.__bf.game.world.isLoaded(D.x, D.z) && window.__bf.getBlock(D.x, D.y, D.z) !== 'air', D), 60000);
  await settle();
  const room = await ev((D) => {
    const bf = window.__bf;
    const floor = [bf.getBlock(D.x + 1, D.y - 1, D.z), bf.getBlock(D.x - 1, D.y - 1, D.z + 1)];
    const ceiling = bf.getBlock(D.x, D.y + 3, D.z);
    const chests = D.chests.map((c) => bf.getBlock(c.x, c.y, c.z));
    return { cage: bf.getBlock(D.x, D.y, D.z), floor, ceiling, chests, inside: [bf.getBlock(D.x + 1, D.y, D.z), bf.getBlock(D.x + 1, D.y + 1, D.z)] };
  }, D);
  check('a dungeon: Monster Cage in the middle, cobblestone and mossy floor and ceiling, chests by the walls',
    room.cage === 'spawner' && room.floor.every((f) => f === 'cobblestone' || f === 'mossy_cobblestone') && room.ceiling === 'cobblestone'
    && room.chests.length >= 1 && room.chests.every((c) => c.startsWith('chest')) && room.inside.every((k) => k === 'air' || k.startsWith('chest')), room);
  const info = await ev((D) => { const g = window.__bf.game; return { be: g.world.blockEntities.get(`${D.x},${D.y},${D.z}`), known: g.spawners.known.has(`${D.x},${D.y},${D.z}`) }; }, D);
  check('the cage knows its creature (the one the generator chose)', info.known && info.be?.type === 'spawner' && info.be.mob === D.mob, { info, mob: D.mob });
  await ticks(3);
  const fig = await ev(() => window.__bf.spawnerInfo().figures);
  check('a little copy of the creature turns inside the cage', fig >= 1, fig);
  await page.screenshot({ path: `${SHOTS}/v17_dungeon.png` });

  // spawning: survival, Normal, in the dark
  const spawnRound = (ticksN) => ev(([D, n]) => {
    const g = window.__bf.game;
    const before = g.spawners.spawned;
    for (let i = 0; i < n; i++) g.tick();
    const near = g.entities.list.filter((e) => e.type === 'mob' && e.mobType === D.mob && !e.removed && Math.abs(e.x - D.x) < 9 && Math.abs(e.z - D.z) < 9 && Math.abs(e.y - D.y) < 5).length;
    return { made: g.spawners.spawned - before, near };
  }, [D, ticksN]);
  await ev((D) => { const g = window.__bf.game; g.difficulty = 'normal'; g.setGameMode('creative'); for (const e of g.entities.list) if (e.type === 'mob') e.removed = true; g.spawners.entity(D.x, D.y, D.z).delay = 5; }, D);
  const s1 = await spawnRound(900);
  check('while you are within 16 blocks, the cage makes its creature every 10-40 seconds', s1.made >= 2 && s1.near >= 1, s1);
  const cap = await ev((D) => {
    const g = window.__bf.game;
    for (let n = 0; n < 12; n++) g.spawners.trySpawn(D.x, D.y, D.z, D.mob);
    // counted over the same box the cage uses (8 blocks out from its centre, 4 up or down)
    return g.entities.list.filter((e) => e.type === 'mob' && e.mobType === D.mob && !e.removed && e.alive && Math.abs(e.x - D.x - 0.5) <= 8 && Math.abs(e.z - D.z - 0.5) <= 8 && Math.abs(e.y - D.y) <= 4).length;
  }, D);
  check('...but never more than 6 of them close by', cap <= 6 && cap >= 3, cap);
  // far away: nothing
  await ev((D) => { const g = window.__bf.game; for (const e of g.entities.list) if (e.type === 'mob') e.removed = true; g.teleport(D.x + 30.5, D.y + 40, D.z + 0.5); g.spawners.entity(D.x, D.y, D.z).delay = 5; }, D);
  const far = await spawnRound(600);
  check('more than 16 blocks away it sleeps', far.made === 0, far);
  // peaceful: nothing
  await ev((D) => { const g = window.__bf.game; g.teleport(D.x + 1.5, D.y, D.z + 0.5); g.difficulty = 'peaceful'; g.spawners.entity(D.x, D.y, D.z).delay = 5; }, D);
  const calm = await spawnRound(600);
  check('on Peaceful it makes nothing', calm.made === 0, calm);
  // light stops it
  await ev((D) => {
    const g = window.__bf.game, bf = window.__bf;
    g.difficulty = 'normal';
    for (let dx = -5; dx <= 5; dx += 2) for (let dz = -5; dz <= 5; dz += 2) for (let dy = -1; dy <= 1; dy++) {
      const x = D.x + dx, y = D.y + dy, z = D.z + dz;
      if (bf.getBlock(x, y, z) === 'air' && window.__bf.B.SPAWN_FLOOR[g.world.getBlock(x, y - 1, z)]) bf.setBlock(x, y, z, 'torch');
    }
    g.spawners.entity(D.x, D.y, D.z).delay = 5;
  }, D);
  await settle();
  const lit = await spawnRound(900);
  check('light it up with torches and it stops', lit.made === 0, lit);
  await ev((D) => { const g = window.__bf.game, bf = window.__bf; for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -1; dy <= 2; dy++) if (bf.getBlock(D.x + dx, D.y + dy, D.z + dz) === 'torch') bf.setBlock(D.x + dx, D.y + dy, D.z + dz, 'air'); }, D);
  await settle();
  // a spawn egg changes the creature
  await ev((D) => { const g = window.__bf.game; g.setGameMode('creative'); g.teleport(D.x + 2.5, D.y, D.z + 0.5); g.player.flying = true; }, D);
  await give('spawn_pig', 0, 1);
  await aim(D.x + 0.5, D.y + 0.5, D.z + 0.5);
  await rclick();
  const egg = await ev((D) => window.__bf.game.world.blockEntities.get(`${D.x},${D.y},${D.z}`)?.mob, D);
  await ticks(3);
  check('a spawn egg used on a cage changes the creature it makes', egg === 'pig', egg);
  // loot
  const loot = await ev((D) => {
    const g = window.__bf.game;
    g.progress.done.delete('dungeon');
    const c = D.chests[0];
    g.openBlockUI(c.x, c.y, c.z, 'chest');
    const be = g.world.blockEntities.get(`${c.x},${c.y},${c.z}`);
    const items = be.items.filter(Boolean).map((s) => s.id + (s.ench ? '*' : ''));
    g.closeScreen();
    window.__bf.engine.closeOverlay?.();
    return { items, adv: g.progress.done.has('dungeon') };
  }, D);
  check('dungeon chests hold loot (bones, string, iron, food, treasure) and earn Dungeon Delver', loot.items.length >= 2 && loot.adv, loot);
  // breaking the cage (with a pickaxe)
  await give('iron_pickaxe', 0, 1);
  await ev((D) => { const g = window.__bf.game; g.setGameMode('survival'); g.progress.done.delete('spawner'); for (const e of g.entities.list) if (e.type !== 'player') e.removed = true; g.breakBlockAt(D.x, D.y, D.z, true, true); }, D);
  await fast(2);
  const broke = await ev((D) => {
    const g = window.__bf.game;
    const orbs = g.entities.list.filter((e) => e.type === 'xp' || e.constructor.name === 'XpOrb').length;
    const drops = g.entities.list.filter((e) => e.type === 'item').length;
    return { block: window.__bf.getBlock(D.x, D.y, D.z), orbs, drops, adv: g.progress.done.has('spawner'), known: g.spawners.known.has(`${D.x},${D.y},${D.z}`), be: g.world.blockEntities.has(`${D.x},${D.y},${D.z}`) };
  }, D);
  check('breaking a cage drops experience (not the cage) and earns Cage Breaker', broke.block === 'air' && broke.orbs > 0 && broke.drops === 0 && broke.adv && !broke.known && !broke.be, broke);
  await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); g.player.flying = true; });
}

// ======================================================================= SAVE
if (run('save')) {
  await clear();
  const x = P.x, y = P.y, z = P.z;
  await ev(([x, y, z]) => {
    const g = window.__bf.game, bf = window.__bf;
    bf.setBlock(x + 4, y, z, 'lava');
    bf.setBlock(x + 6, y, z, 'cinderstone');
    bf.setBlock(x, y, z + 4, 'spawner');
    g.spawners.entity(x, y, z + 4).mob = 'crawler';
    g.player.fireTicks = 0;
  }, [x, y, z]);
  await fast(40);
  await ev(() => window.__bf.game.save());
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await ev(() => window.__bf.state().screen)) === 'title', 30000);
  await page.click('[data-testid=btn-continue]');
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await waitFor(() => ev(([x, z]) => window.__bf.game.world.isLoaded(x, z), [x, z]), 30000);
  await wait(800);
  const back = await ev(([x, y, z]) => {
    const g = window.__bf.game, bf = window.__bf;
    return { lava: bf.getBlock(x + 4, y, z), flow: bf.getBlock(x + 5, y, z), cinder: bf.getBlock(x + 6, y, z), cage: bf.getBlock(x, y, z + 4), mob: g.world.blockEntities.get(`${x},${y},${z + 4}`)?.mob, known: g.spawners.known.has(`${x},${y},${z + 4}`) };
  }, [x, y, z]);
  check('lava, Cinderstone and a cage (with its creature) are saved', back.lava === 'lava' && back.flow.startsWith('lava') && back.cinder === 'cinderstone' && back.cage === 'spawner' && back.mob === 'crawler' && back.known, back);
  // flowing lava saved in the world keeps flowing after loading
  await ev(([x, y, z]) => window.__bf.setBlock(x + 4, y, z, 'air'), [x, y, z]);
  await fast(200);
  check('lava loaded from a save still flows (and drains when its source goes)', (await key(x + 5, y, z)) === 'air', await key(x + 5, y, z));
}

check('no script errors', errors.length === 0, errors.slice(0, 5));
await b.close();
console.log('\n==== SUMMARY');
for (const [s, n, info] of results) console.log(s.padEnd(5), n.padEnd(72), s === 'FAIL' ? info.slice(0, 300) : info.slice(0, 200));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
