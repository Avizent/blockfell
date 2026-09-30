// Captures clean 1280x720 screenshots for the How-to-Play guide from the single-file build.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.OUT || '/tmp/guide_shots';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const clean = () => ev(() => window.__bf.ui.set({ chat: [], toasts: [] }));

await page.goto('file:///home/claude/blockfell/dist-single/index.html');
await page.waitForSelector('[data-testid=btn-singleplayer]');
await wait(4000);
await shot('g01_title');
await page.click('[data-testid=btn-singleplayer]');
await wait(500);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'My First World');
await page.fill('[data-testid=world-seed]', 'guide-meadow');
await page.mouse.move(5, 5);
await wait(400);
await shot('g02_create');
await page.click('[data-testid=btn-create-world]');
for (let i = 0; i < 300; i++) { if ((await ev(() => window.__bf.state().screen)) === 'game') break; await wait(300); }
await ev(() => window.__bf.allowUnlocked(true));
await wait(3000);

// ---- a playing-state HUD
await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player, inv = g.inventory;
  const put = (i, id, n) => { inv.slots[i] = { id, count: n }; };
  put(0, 'stone_pickaxe', 1); put(1, 'stone_sword', 1); put(2, 'wooden_axe', 1); put(3, 'torch', 24);
  put(4, 'cobblestone', 48); put(5, 'planks', 32); put(6, 'cooked_porkchop', 6); put(7, 'bow', 1); put(8, 'crafting_table', 1);
  put(9, 'arrow', 16); put(10, 'log', 12); put(11, 'coal', 9); put(12, 'raw_iron', 5); put(13, 'stick', 8); put(14, 'apple', 3);
  put(20, 'sand', 20); put(27, 'iron_ingot', 3);
  inv.slots[36] = { id: 'iron_helmet', count: 1 }; inv.slots[37] = { id: 'iron_chestplate', count: 1 };
  inv.slots[39] = { id: 'leather_boots', count: 1 };
  inv.selected = 0; inv.changed();
  p.health = 17; p.food = 16; p.xpLevel = 4; p.xpProgress = 0.45;
  g.dayNight.time = 2500;
  p.pitch = -0.08;
});
await wait(2500);
await clean();
await wait(500);
await shot('g03_hud');

// ---- survival inventory
await ev(() => window.__bf.engine.openInventory());
await wait(700);
await shot('g04_inventory');
await page.keyboard.press('Escape');
await wait(400);

// ---- crafting table with a pickaxe recipe
await ev(() => {
  const g = window.__bf.game, p = g.player;
  g.engine.openBlockScreen(Math.floor(p.x) + 2, Math.floor(p.y), Math.floor(p.z), 'crafting');
  const c = g.craft3;
  c.slots[0] = { id: 'cobblestone', count: 1 }; c.slots[1] = { id: 'cobblestone', count: 1 }; c.slots[2] = { id: 'cobblestone', count: 1 };
  c.slots[4] = { id: 'stick', count: 1 }; c.slots[7] = { id: 'stick', count: 1 };
  c.changed(); g.screen.updateCraftResult();
});
await wait(700);
await shot('g05_crafting');
await ev(() => { const c = window.__bf.game.craft3; c.slots.fill(null); c.changed(); });
await page.keyboard.press('Escape');
await wait(400);

// ---- furnace smelting iron
const fpos = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 2, y = Math.floor(p.y), z = Math.floor(p.z);
  bf.setBlock(x, y, z, 'furnace:w');
  g.engine.openBlockScreen(x, y, z, 'furnace');
  const be = g.world.blockEntities.get(`${x},${y},${z}`) ?? [...g.world.blockEntities.values()].find((e) => e.type === 'furnace');
  be.items[0] = { id: 'raw_iron', count: 5 }; be.items[1] = { id: 'coal', count: 3 }; be.items[2] = { id: 'iron_ingot', count: 2 };
  return { x, y, z };
});
await wait(3500);
await shot('g06_furnace');
await page.keyboard.press('Escape');
await wait(400);
await ev((f) => window.__bf.setBlock(f.x, f.y, f.z, 'air'), fpos);

// ---- creative catalogue
await ev(() => { const g = window.__bf.game; g.setGameMode('creative'); });
await wait(300);
await ev(() => window.__bf.engine.openInventory());
await wait(900);
await shot('g07_creative');
await page.keyboard.press('Escape');
await wait(300);
await ev(() => { const g = window.__bf.game; g.setGameMode('survival'); });

// ---- dusk with torches and hostiles
await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  g.dayNight.time = 13200;
  const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
  for (const [dx, dz] of [[-3, -4], [3, -4], [0, -10]]) {
    const top = g.world.highestSolid(x + dx, z + dz);
    bf.setBlock(x + dx, top + 1, z + dz, 'torch');
  }
  const f = (dx, dz) => { const top = g.world.highestSolid(x + dx, z + dz); return top + 1; };
  const m1 = g.entities.spawnMob('shambler', x - 1.2, f(-2, -6), z - 5.5, g);
  const m2 = g.entities.spawnMob('skeleton', x + 2.2, f(2, -8), z - 7.5, g);
  for (const m of [m1, m2]) { m.tick = function () { this.beginTick(); }; m.yaw = Math.PI - 0.25; m.prevYaw = m.yaw; }
  p.yaw = 0; p.pitch = -0.12;
  g.inventory.selected = 1; g.inventory.changed();
});
await wait(3000);
await clean();
await shot('g08_night');
await b.close();
