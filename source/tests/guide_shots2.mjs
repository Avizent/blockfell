// Screenshots and item icons for the 1.1 pages of the How-to-Play guide.
// node tests/guide_shots2.mjs  (dev server or URL=file:///.../dist-single/index.html)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots2';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,home,biomes').split(',');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
const shot = async (name) => { await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const settle = () => waitFor(() => ev(() => window.__bf.state().chunks.meshQueue === 0), 60000);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.1');
await page.fill('[data-testid=world-seed]', 'guide-meadow');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await page.mouse.move(640, 360);
await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; for (const e of g.entities.list) if (e.constructor.name !== 'ItemEntity') e.removed = true; });
await wait(2500);

// ---------------------------------------------------------------- item icons
if (PARTS.includes('icons')) {
const ICON_IDS = ['oak_door', 'bed', 'bucket', 'water_bucket', 'rune_shard', 'rune_ore', 'rune_table', 'oak_slab', 'cobblestone_slab',
  'stone_slab', 'stone_brick_slab', 'sandstone_slab', 'brick_slab', 'oak_stairs', 'cobblestone_stairs', 'stone_brick_stairs',
  'sandstone_stairs', 'brick_stairs', 'birch_log', 'spruce_log', 'birch_leaves', 'spruce_leaves', 'cactus', 'dead_bush', 'red_sand',
  'terracotta', 'wool', 'bricks', 'iron_ingot', 'planks', 'stone_bricks', 'spawn_goat', 'spawn_rabbit', 'spawn_crawler', 'spawn_dustwalker',
  'raw_rabbit', 'cooked_rabbit', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta', 'white_terracotta', 'leather', 'torch', 'iron_pickaxe', 'iron_sword', 'bow', 'iron_chestplate', 'iron_boots', 'string'];
const icons = await ev(async (ids) => {
  const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
  ic.build(6);
  const img = new Image();
  img.src = ic.sheetUrl;
  await img.decode();
  const out = {};
  for (const id of ids) {
    const st = ic.style(id);
    if (!st) continue;
    const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
    out[id] = c.toDataURL('image/png');
  }
  ic.build(old);
  return out;
}, ICON_IDS.filter(Boolean));
for (const [id, url] of Object.entries(icons)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('icons', Object.keys(icons).length);
}

// ---------------------------------------------------------------- a cottage
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); inv.slots[0] = { id, count: 1 }; inv.selected = 0; inv.changed(); }, id);
const time = (t) => ev((t) => { window.__bf.game.dayNight.time = t; }, t);
if (PARTS.includes('home')) {
const site = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x0 = Math.floor(p.x) + 4, z0 = Math.floor(p.z) - 8;
  let y = 0;
  for (let dx = -2; dx <= 14; dx++) for (let dz = -3; dz <= 14; dz++) y = Math.max(y, g.world.highestSolid(x0 + dx, z0 + dz));
  // level the site: grass at y, air above
  for (let dx = -6; dx <= 18; dx++) for (let dz = -6; dz <= 18; dz++) {
    for (let k = y - 3; k < y; k++) bf.setBlock(x0 + dx, k, z0 + dz, 'dirt');
    bf.setBlock(x0 + dx, y, z0 + dz, 'grass');
    for (let k = 1; k <= 14; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
  }
  const S = (x, yy, z, k) => bf.setBlock(x0 + x, y + yy, z0 + z, k);
  // floor + walls (7 x 5 footprint)
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 4; z++) {
    S(x, 0, z, 'planks');
    const edge = x === 0 || x === 6 || z === 0 || z === 4;
    if (!edge) continue;
    const corner = (x === 0 || x === 6) && (z === 0 || z === 4);
    for (let k = 1; k <= 3; k++) S(x, k, z, corner ? 'log' : k === 1 ? 'stone_bricks' : 'planks');
  }
  // windows
  S(1, 2, 4, 'glass'); S(5, 2, 4, 'glass'); S(0, 2, 2, 'glass'); S(6, 2, 2, 'glass'); S(3, 2, 0, 'glass');
  // gable ends
  for (const x of [0, 6]) { for (let z = 0; z <= 4; z++) S(x, 4, z, 'planks'); for (let z = 1; z <= 3; z++) S(x, 5, z, 'planks'); S(x, 6, 2, 'planks'); }
  // roof: brick stairs on both slopes, a slab ridge
  for (let x = -1; x <= 7; x++) {
    S(x, 4, 5, 'brick_stairs:n:bottom'); S(x, 4, -1, 'brick_stairs:s:bottom');
    S(x, 5, 4, 'brick_stairs:n:bottom'); S(x, 5, 0, 'brick_stairs:s:bottom');
    S(x, 6, 3, 'brick_stairs:n:bottom'); S(x, 6, 1, 'brick_stairs:s:bottom');
    S(x, 7, 2, 'brick_slab:bottom');
  }
  // door, wall torches, a slab path
  S(3, 1, 4, 'oak_door:lower:n:c:l'); S(3, 2, 4, 'oak_door:upper:n:c:l');
  S(2, 2, 5, 'wall_torch:s'); S(4, 2, 5, 'wall_torch:s');
  for (let z = 5; z <= 9; z++) S(3, 1, z, 'stone_brick_slab:bottom');
  // inside: bed, rune table, crafting table, chest, a wall torch
  S(1, 1, 2, 'bed:foot:n'); S(1, 1, 1, 'bed:head:n');
  S(5, 1, 1, 'rune_table'); S(4, 1, 1, 'crafting_table'); S(5, 1, 3, 'chest');
  S(3, 3, 1, 'wall_torch:s'); S(1, 3, 3, 'wall_torch:e');
  // a spring on a rock, falling into a stream
  for (let x = 9; x <= 11; x++) for (let z = -2; z <= 1; z++) for (let k = 1; k <= 2; k++) S(x, k, z, (x + z + k) % 3 ? 'stone' : 'cobblestone');
  for (const [x, z] of [[9, -2], [10, -2], [11, -2], [9, -1], [11, -1], [9, 0], [11, 0], [9, 1], [11, 1]]) S(x, 3, z, 'mossy_cobblestone');
  for (let z = 2; z <= 12; z++) { S(10, 0, z, 'air'); S(10, -1, z, 'gravel'); }
  S(10, 3, -1, 'water');
  return { x0, y, z0 };
});
await waitFor(() => ev((s) => window.__bf.getBlock(s.x0 + 10, s.y, s.z0 + 8).startsWith('water'), site), 30000);
await wait(4000);
await settle();

const view = (x, y, z, ax, ay, az) => ev(([x, y, z, ax, ay, az]) => {
  const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; window.__bf.aimAt(ax, ay, az);
}, [x, y, z, ax, ay, az]);
const { x0, y, z0 } = site;

await hold('water_bucket');
await time(3000);
await view(x0 + 13.5, y + 3.2, z0 + 13.5, x0 + 5, y + 2.5, z0 + 2);
await wait(2500); await settle();
await shot('n01_cottage_day');
await time(12900);
await wait(2500);
await shot('n02_cottage_dusk');
// the waterfall close up
await time(4000);
await view(x0 + 14.5, y + 2.6, z0 + 7.5, x0 + 10, y + 1.2, z0 + 1.5);
await wait(2500);
await shot('n03_waterfall');
// interior at night
await hold('bed');
await time(17000);
await view(x0 + 4.2, y + 1.1, z0 + 3.6, x0 + 2, y + 1.1, z0 + 1.2);
await wait(2500); await settle();
await shot('n04_interior');

// sleeping
await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); g.player.flying = false; });
await ev((s) => { const g = window.__bf.game; g.teleport(s.x0 + 3.5, s.y + 1, s.z0 + 2.5); }, site);
await wait(800);
await ev((s) => window.__bf.aimAt(s.x0 + 1.5, s.y + 1.4, s.z0 + 2.5), site);
await wait(600);
await ev((s) => window.__bf.game.trySleep?.(s.x0 + 1, s.y + 1, s.z0 + 2), site);
await wait(1200);
await shot('n05_sleeping');
await waitFor(async () => (await ev(() => window.__bf.ui.get().overlay)) === null, 20000);
await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); });

// rune table screen
await ev(() => {
  const g = window.__bf.game, p = g.player;
  g.setGameMode('survival');
  p.xpLevel = 30;
  g.runeSlots.slots[0] = { id: 'iron_sword', count: 1 };
  g.runeSlots.slots[1] = { id: 'rune_shard', count: 12 };
  g.runeSlots.changed();
});
await ev((s) => { const g = window.__bf.game; g.teleport(s.x0 + 4.5, s.y + 1, s.z0 + 2.5); }, site);
await wait(500);
await ev((s) => { window.__bf.aimAt(s.x0 + 5.5, s.y + 1.6, s.z0 + 1.5); window.__bf.engine.openBlockScreen(s.x0 + 5, s.y + 1, s.z0 + 1, 'runes'); }, site);
await wait(900);
await page.mouse.move(700, 250);
await wait(400);
await shot('n06_runes');
await page.locator('[data-testid=rune-offer-3]').dispatchEvent('mousedown');
await wait(500);
await page.hover('[data-slot="rune_item:0"]');
await wait(500);
await shot('n07_runes_done');
await page.mouse.move(640, 360);
await page.keyboard.press('Escape'); await wait(400);
await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); });

// new creatures on a meadow by day
await time(3000);
await ev((s) => {
  const g = window.__bf.game;
  const kinds = ['goat', 'rabbit', 'crawler', 'dustwalker'];
  kinds.forEach((k, i) => {
    const m = g.entities.spawnMob(k, s.x0 + 1.5 + i * 2.2, s.y + 1, s.z0 + 11.5, g);
    m.yaw = Math.PI * 0.85; m.prevYaw = m.yaw; m.headYaw = 0; m.tick = function () { this.beginTick(); };
  });
}, site);
await hold('iron_sword');
await view(x0 + 5.0, y + 1.2, z0 + 16.5, x0 + 4.3, y + 1.3, z0 + 11.5);
await wait(2000);
await shot('n08_creatures');
}

// biomes: a ground-level view across each new landscape
if (PARTS.includes('biomes')) {
const found = await ev(() => {
  const gen = window.__bf.game.world.generator;
  const want = { 8: 'birch', 9: 'taiga', 10: 'badlands', 4: 'desert' };
  const where = {};
  for (let r = 64; r < 6000 && Object.keys(where).length < 4; r += 32) {
    for (let a = 0; a < 32; a++) {
      const x = Math.floor(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 32 * Math.PI * 2) * r);
      const bm = gen.column(x, z).biome;
      if (want[bm] && !where[want[bm]] && [[32, 0], [-32, 0], [0, 32], [0, -32], [48, 48]].every(([dx, dz]) => gen.column(x + dx, z + dz).biome === bm)) where[want[bm]] = [x, z];
    }
  }
  return where;
});
console.log('biomes', JSON.stringify(found));
await hold('iron_pickaxe');
await time(4500);
const ONLY_B = process.env.BIOMES ? process.env.BIOMES.split(',') : null;
for (const [name, [bx, bz]] of Object.entries(found)) {
  if (ONLY_B && !ONLY_B.includes(name)) continue;
  await ev(([x, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x + 0.5, 120, z + 0.5); }, [bx, bz]);
  await waitFor(() => ev(([x, z]) => !!window.__bf.game.world.getChunk(x >> 4, z >> 4), [bx, bz]), 60000);
  await wait(3000); await settle();
  // stand on open ground inside the biome, clear of trees, looking along a line that stays in the biome
  const spot = await ev(([x, z, name]) => {
    const bf = window.__bf, g = bf.game, gen = g.world.generator;
    const target = gen.column(x, z).biome;
    const forest = name === 'birch' || name === 'taiga';
    const R = forest ? 2 : 1;
    for (let r = 0; r < 90; r += 1) for (let a = 0; a < 24; a++) {
      const px = Math.round(x + Math.cos(a / 24 * Math.PI * 2) * r), pz = Math.round(z + Math.sin(a / 24 * Math.PI * 2) * r);
      if (gen.column(px, pz).biome !== target || !g.world.isLoaded(px, pz)) continue;
      const top = g.world.highestSolid(px, pz);
      if (top < 0 || (g.world.getLight(px, top + 2, pz) >> 4) !== 15) continue;   // open sky only
      if (top < gen.column(px, pz).height - 1) continue;                          // not down in a cave or ravine
      const k = bf.getBlock(px, top, pz);
      if (/leaves|log|water|cactus/.test(k)) continue;
      let clear = true;
      for (let dx = -R; dx <= R && clear; dx++) for (let dz = -R; dz <= R && clear; dz++) for (let dy = 1; dy <= 4; dy++) {
        const b = bf.getBlock(px + dx, top + dy, pz + dz);
        if (/leaves|log|cactus/.test(b)) { clear = false; break; }
      }
      if (!clear) continue;
      // a direction is usable when the first 10 blocks ahead are open (no cliff, overhang or trunk in the face)
      const openDir = (fx, fz) => {
        for (let t = 1; t <= 10; t++) for (let dy = 1; dy <= 4; dy++) {
          const b = bf.getBlock(Math.round(px + fx * t), top + dy, Math.round(pz + fz * t));
          if (b === 'air' || /grass|flower|bush|snow/.test(b)) continue;
          if (t > 3 && /leaves|log/.test(b)) continue;
          return false;
        }
        return true;
      };
      let yaw = null, best = 0;
      for (let d = 0; d < 16; d++) {
        const ang = d / 16 * Math.PI * 2, fx = -Math.sin(ang), fz = -Math.cos(ang);
        if (!openDir(fx, fz)) continue;
        let n = 0;
        for (let t = 8; t <= 120; t += 8) { if (gen.column(Math.round(px + fx * t), Math.round(pz + fz * t)).biome === target) n++; else if (t <= 24) { n = -1; break; } }
        if (name === 'badlands') {
          // stand in a valley facing a banded mesa 12-45 blocks away
          let hi = 0;
          for (let t = 12; t <= 45; t += 3) hi = Math.max(hi, gen.column(Math.round(px + fx * t), Math.round(pz + fz * t)).height);
          if (hi - top < 12) continue;
          n += (hi - top) / 4;
        }
        if (n > best) { best = n; yaw = ang; }
      }
      if (yaw === null || best < 6) continue;
      const lift = name === 'badlands' ? 1 : name === 'desert' ? 2 : 0;
      g.teleport(px + 0.5, top + 1 + lift, pz + 0.5);
      g.player.yaw = yaw;
      g.player.pitch = name === 'badlands' ? 0.14 : name === 'desert' ? -0.1 : 0.12;
      return [px, top, pz, k, r];
    }
    return null;
  }, [bx, bz, name]);
  console.log(name, JSON.stringify(spot));
  await wait(4000); await settle(); await wait(2500);
  await shot(`n09_biome_${name}`);
}
}
await b.close();
