// Screenshots and icons for the 2.1 guide pages: armour stands, dyed leather armour, Ashboars.
// node tests/guide_shots13.mjs  (dev server)  PARTS=icons,stands,dye,invpic,herd,piglet
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots13';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,stands,dye,invpic,herd,piglet').split(',');
const SEED = process.env.SEED || 'armoury';
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
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 90000); await wait(800); };
const shot = async (name, hud = false) => { await ev((hud) => window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: !hud }), hud); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.type === 'mob' || e.mobType) e.removed = true;
});
const C = { red: 0xa62a26, blue: 0x3244a8, yellow: 0xf4ce34, green: 0x4c6a1e, lime: 0x7ac432, magenta: 0xc046ba, light_blue: 0x5ca8de, white: 0xeaeae6, black: 0x1a1a20, orange: 0xe87c22, cyan: 0x1e8e96, purple: 0x7a32ae };

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['armour_stand', 'raw_ashboar', 'roast_ashboar', 'spawn_ashboar', 'oak_slab', 'stone_slab', 'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots',
    'iron_helmet', 'iron_chestplate', 'glowcap', 'leather', 'red_dye', 'blue_dye', 'yellow_dye', 'ember_lamp', 'furnace'];
  const dyed = [['leather_chestplate', C.red, 'leather_chestplate_red'], ['leather_chestplate', C.blue, 'leather_chestplate_blue'], ['leather_helmet', C.yellow, 'leather_helmet_yellow'],
    ['leather_leggings', C.green, 'leather_leggings_green'], ['leather_boots', C.cyan, 'leather_boots_cyan'], ['leather_chestplate', C.orange, 'leather_chestplate_orange']];
  const out = await ev(async ([ids, dyed]) => {
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
    const S = await import('/src/render/itemSprites.ts');
    for (const [id, color, name] of dyed) {
      const small = document.createElement('canvas');
      small.width = small.height = 16;
      small.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.dyedArmourPixels(id, color)), 16, 16), 0, 0);
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, 96, 96);
      res[name] = c.toDataURL('image/png');
    }
    ic.build(old);
    return res;
  }, [ids, dyed]);
  for (const [id, url] of Object.entries(out)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(out).length);
}

// a creative world
await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Armour Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();

if (PARTS.includes('stands')) {
  // a little armoury: a plank floor, a stone-brick back wall with lanterns, four dressed stands
  await ev(async (C) => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const { ArmourStand } = await import('/src/entities/ArmourStand.ts');
    const x = Math.floor(p.x), z = Math.floor(p.z) - 6;
    const y = g.world.highestSolid(x, z) + 1;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -3; dz <= 6; dz++) {
      for (let dy = -3; dy < 0; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'dirt');
      bf.setBlock(x + dx, y - 1, z + dz, dz <= 1 && Math.abs(dx) <= 5 ? 'planks' : 'grass');
      for (let dy = 0; dy <= 6; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    for (let dx = -5; dx <= 5; dx++) for (let dy = 0; dy <= 3; dy++) bf.setBlock(x + dx, y + dy, z - 2, dy === 3 ? 'stone_brick_slab:bottom' : 'stone_bricks');
    for (const dx of [-5, 5]) bf.setBlock(x + dx, y, z - 1, 'oak_fence');
    for (const dx of [-5, 5]) bf.setBlock(x + dx, y + 1, z - 1, 'lantern');
    const sets = [
      [{ id: 'iron_helmet' }, { id: 'iron_chestplate' }, { id: 'iron_leggings' }, { id: 'iron_boots' }, { id: 'iron_sword' }],
      [{ id: 'leather_helmet', color: C.yellow }, { id: 'leather_chestplate', color: C.red }, { id: 'leather_leggings', color: C.blue }, { id: 'leather_boots', color: C.black }, { id: 'bow' }],
      [{ id: 'leather_helmet' }, { id: 'leather_chestplate' }, { id: 'leather_leggings' }, { id: 'leather_boots' }, { id: 'fishing_rod' }],
      [{ id: 'leather_helmet', color: C.magenta }, { id: 'leather_chestplate', color: C.light_blue }, { id: 'leather_leggings', color: C.white }, { id: 'leather_boots', color: C.purple }, { id: 'torch' }],
    ];
    sets.forEach((set, i) => {
      const s = new ArmourStand(Math.PI);
      s.setPos(x - 3 + i * 2 + 0.5, y, z + 0.5);
      set.forEach((it, k) => { s.items[k] = { ...it, count: 1 }; });
      g.entities.add(s);
    });
    p.flying = true;
    g.teleport(x + 0.5, y + 1.15, z + 5.2);
    bf.aimAt(x + 0.5, y + 1.0, z + 0.5);
  }, C);
  await settle();
  await wait(1500);
  await shot('a01_stands');
}

if (PARTS.includes('dye')) {
  // dyeing a tunic at a crafting table: red and yellow mix to orange
  await ev(() => {
    const g = window.__bf.game, p = g.player;
    g.setGameMode('survival');
    g.openBlockUI(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), 'crafting');
    g.craft3.slots.fill(null);
    g.craft3.slots[3] = { id: 'leather_chestplate', count: 1 };
    g.craft3.slots[4] = { id: 'red_dye', count: 3 };
    g.craft3.slots[5] = { id: 'yellow_dye', count: 3 };
    g.craft3.changed();
    g.screen.updateCraftResult();
    g.inventory.slots.fill(null);
    const hot = [['leather_helmet'], ['leather_chestplate', 0xa62a26], ['leather_leggings', 0x3244a8], ['leather_boots', 0x1a1a20], ['red_dye', , 6], ['yellow_dye', , 5], ['blue_dye', , 7], ['green_dye', , 4], ['white_dye', , 9]];
    hot.forEach(([id, color, n], i) => { g.inventory.slots[i] = { id, count: n ?? 1, ...(color !== undefined ? { color } : {}) }; });
    const more = ['orange_dye', 'magenta_dye', 'light_blue_dye', 'lime_dye', 'pink_dye', 'gray_dye', 'cyan_dye', 'purple_dye', 'brown_dye', 'black_dye', 'leather', 'leather'];
    more.forEach((id, i) => { g.inventory.slots[9 + i] = { id, count: 3 + (i % 5) }; });
    g.inventory.changed();
    window.__bf.engine.input.exitLock();
  });
  await wait(900);
  await shot('a02_dyeing', true);
  await ev(() => window.__bf.engine.closeOverlay()); await wait(300);
}

if (PARTS.includes('invpic')) {
  // the inventory: your own armour on the picture of you
  await ev((C) => {
    const g = window.__bf.game;
    g.setGameMode('survival');
    g.inventory.slots.fill(null);
    g.inventory.slots[36] = { id: 'leather_helmet', count: 1, color: C.cyan };
    g.inventory.slots[37] = { id: 'iron_chestplate', count: 1 };
    g.inventory.slots[38] = { id: 'leather_leggings', count: 1, color: C.orange };
    g.inventory.slots[39] = { id: 'leather_boots', count: 1, color: C.black };
    g.inventory.slots[0] = { id: 'iron_sword', count: 1 };
    g.inventory.slots[1] = { id: 'armour_stand', count: 3 };
    g.inventory.slots[2] = { id: 'leather_chestplate', count: 1, color: C.red };
    g.inventory.slots[3] = { id: 'roast_ashboar', count: 12 };
    g.inventory.changed();
    window.__bf.engine.openInventory();
    window.__bf.engine.input.exitLock();
  }, C);
  await wait(500);
  await page.mouse.move(470, 200);
  await wait(800);
  await shot('a03_inventory', true);
  await ev(() => { window.__bf.engine.closeOverlay(); window.__bf.game.setGameMode('creative'); }); await wait(300);
}

if (PARTS.includes('herd') || PARTS.includes('piglet')) {
  await ev((v) => { window.__bf.engine.options.brightness = v; }, Number(process.env.BRIGHT ?? 1));
  await ev(() => void window.__bf.engine.changeDimension('cinderdeep', { kind: 'gate', x: Math.floor(window.__bf.game.player.x), z: Math.floor(window.__bf.game.player.z) }));
  await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
  await ev(() => window.__bf.allowUnlocked(true));
  await settle();
  await quiet();
  // an ash-strewn shelf with Glowcaps, open above
  await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z) + 40, y = 66;
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
      bf.setBlock(x + dx, y - 1, z + dz, (dx * 7 + dz * 3) % 5 === 0 || Math.abs(dx) + Math.abs(dz) < 7 ? 'ash' : 'ashrock');
      for (let dy = 0; dy <= 7; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    for (const [dx, dz] of [[-4, 3], [-5, 1], [4, 4], [5, -2], [-3, -4], [2, 6], [-6, 5], [-2, 4], [4, 1], [0, 5], [-4, -1]]) bf.setBlock(x + dx, y, z + dz, 'glowcap');
    window.__shelf = { x, y, z };
  });
  await settle();
}

if (PARTS.includes('herd')) {
  await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player, S = window.__shelf;
    const place = [[-2.2, 1.0, -0.6], [1.0, 2.4, 0.35], [2.6, -0.4, 0.9], [-0.4, -1.4, -0.3, true]];
    for (const [dx, dz, yaw, baby] of place) {
      const m = g.entities.spawnMob('ashboar', S.x + 0.5 + dx, S.y, S.z + 0.5 + dz, g);
      if (baby) m.makeBaby();
      m.yaw = m.prevYaw = yaw;
      m.persistent = true;
      m.tick = function () { this.beginTick(); };
    }
    p.flying = true;
    g.teleport(S.x + 0.5, S.y + 1.1, S.z - 5.4);
    bf.aimAt(S.x + 0.5, S.y + 0.5, S.z + 0.8);
  });
  await settle();
  await wait(1500);
  await shot('a04_herd');
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
}

if (PARTS.includes('piglet')) {
  await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player, S = window.__shelf;
    const a = g.entities.spawnMob('ashboar', S.x - 0.9, S.y, S.z + 1.0, g);
    const c = g.entities.spawnMob('ashboar', S.x + 2.1, S.y, S.z + 1.6, g);
    const k = g.entities.spawnMob('ashboar', S.x + 0.6, S.y, S.z - 0.6, g);
    k.makeBaby();
    a.yaw = a.prevYaw = -1.15;
    c.yaw = c.prevYaw = 1.2;
    k.yaw = k.prevYaw = 0.35;
    for (const m of [a, c, k]) { m.persistent = true; m.tick = function () { this.beginTick(); }; }
    p.flying = true;
    g.teleport(S.x + 0.6, S.y + 1.3, S.z - 4.6);
    bf.aimAt(S.x + 0.6, S.y + 0.4, S.z + 0.8);
    window.__love = [a, c];
  });
  await settle();
  await wait(800);
  // hearts: feed both a Glowcap
  await ev(() => { const g = window.__bf.game; for (const m of window.__love) { m.feed(g); g.effect('heart', m.x, m.y + 1.3, m.z, 4); } });
  await wait(450);
  await shot('a05_piglet');
}
await b.close();
