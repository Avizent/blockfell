// Screenshots and item icons for the 1.4 (decoration) pages of the How-to-Play guide.
// node tests/guide_shots5.mjs  (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots5';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,garden,interior,night,gallery,ui').split(',');
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
const settle = async () => { await wait(1200); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(1200); };
const time = (t) => ev((t) => { window.__bf.game.dayNight.time = t; }, t);
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); if (id) inv.slots[0] = { id, count: 1 }; inv.selected = 0; inv.changed(); }, id);
const view = (x, y, z, ax, ay, az) => ev(([x, y, z, ax, ay, az]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; window.__bf.aimAt(ax, ay, az); }, [x, y, z, ax, ay, az]);

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.4');
await page.fill('[data-testid=world-seed]', 'decor');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await page.mouse.move(640, 360);
await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.reach = () => 0.01; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
await wait(2500);

if (PARTS.includes('icons')) {
  const ICON_IDS = ['oak_fence', 'oak_fence_gate', 'ladder', 'oak_trapdoor', 'glass_pane', 'glass', 'sign', 'lantern', 'flower_pot', 'painting',
    'flower_red', 'flower_yellow', 'flower_blue', 'flower_white', 'dead_bush', 'cactus', 'bone_meal', 'coal', 'torch', 'iron_ingot', 'bricks', 'terracotta',
    'planks', 'stick', 'wool', 'lime_wool',
    ...['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'].flatMap((c) => [`${c}_dye`, c === 'white' ? 'wool' : `${c}_wool`])];
  const icons = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const out = {};
    for (const id of ids) {
      const st = ic.style(id);
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      out[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return out;
  }, ICON_IDS);
  for (const [id, url] of Object.entries(icons)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(icons).length);
}

// ---- the show cottage: a meadow cleared near spawn, a house with a fenced garden
const S = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x0 = Math.floor(p.x) + 20, z0 = Math.floor(p.z);
  const y = g.world.generator.column(x0, z0).height;
  return { x: x0, z: z0, y };
});
await ev((s) => { const g = window.__bf.game; g.player.flying = true; g.teleport(s.x + 0.5, s.y + 12, s.z + 0.5); }, S);
await waitFor(() => ev((s) => { const w = window.__bf.game.world; return w.isLoaded(s.x + 20, s.z + 20) && w.isLoaded(s.x - 20, s.z - 20) && w.isLoaded(s.x + 20, s.z - 20) && w.isLoaded(s.x - 20, s.z + 20); }, S), 60000);
await settle();
const H = await ev(async (s) => {
  const bf = window.__bf, g = bf.game;
  const set = (x, y, z, k) => bf.setBlock(x, y, z, k);
  const { x: X, z: Z, y: Y } = s;
  // meadow
  for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) {
    for (let k = Y - 3; k < Y; k++) set(X + dx, k, Z + dz, 'dirt');
    set(X + dx, Y, Z + dz, 'grass');
    for (let k = 1; k <= 16; k++) set(X + dx, Y + k, Z + dz, 'air');
    if ((dx * 7 + dz * 13) % 6 === 0 && (Math.abs(dx) > 9 || dz > 9 || dz < -12)) set(X + dx, Y + 1, Z + dz, 'tall_grass');
  }
  // house: x -4..4, z -11..-4, walls 4 high, a planks floor
  const x0 = X - 4, x1 = X + 4, z0 = Z - 11, z1 = Z - 4, f = Y;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    set(x, f, z, 'planks');
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    for (let h = 1; h <= 4; h++) {
      if (!edge) continue;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      set(x, f + h, z, corner ? 'log' : h === 1 ? 'cobblestone' : 'planks');
    }
  }
  // roof: an overhanging layer of stairs with a planks ridge
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    for (let z = z0 - 1; z <= z1 + 1; z++) set(x, f + 5, z, 'oak_slab:bottom');
    for (let z = z0; z <= z1; z++) set(x, f + 5, z, 'planks');
    set(x, f + 5, z1 + 1, 'brick_stairs:n:bottom'); set(x, f + 5, z0 - 1, 'brick_stairs:s:bottom');
  }
  for (let z = z0; z <= z1; z++) { set(x0 - 1, f + 5, z, 'brick_stairs:e:bottom'); set(x1 + 1, f + 5, z, 'brick_stairs:w:bottom'); }
  for (let x = x0; x <= x1; x++) for (let z = z0 + 1; z <= z1 - 1; z++) set(x, f + 6, z, 'brick_slab:bottom');
  // front: door in the middle, glass pane windows with trapdoor shutters
  set(X, f + 1, z1, 'oak_door:lower:n:c:l'); set(X, f + 2, z1, 'oak_door:upper:n:c:l');
  for (const wx of [X - 3, X - 2, X + 2, X + 3]) for (const h of [2, 3]) set(wx, f + h, z1, 'glass_pane');
  set(X - 3, f + 1, z1 + 1, 'flower_pot:flower_red'); set(X - 2, f + 1, z1 + 1, 'flower_pot:flower_white');
  set(X + 2, f + 1, z1 + 1, 'flower_pot:flower_blue'); set(X + 3, f + 1, z1 + 1, 'flower_pot:flower_yellow');
  set(X - 1, f + 3, z1 + 1, 'lantern:hanging'); set(X + 1, f + 3, z1 + 1, 'lantern:hanging');
  set(X - 1, f + 4, z1 + 1, 'oak_slab:top'); set(X + 1, f + 4, z1 + 1, 'oak_slab:top'); set(X, f + 4, z1 + 1, 'oak_slab:top');
  // side window (east)
  for (const h of [2, 3]) { set(x1, f + h, Z - 8, 'glass_pane'); set(x1, f + h, Z - 7, 'glass_pane'); }
  // garden fence with a gate, lantern posts and a path
  const gx0 = X - 7, gx1 = X + 7, gz1 = Z + 4;
  for (let x = gx0; x <= gx1; x++) if (x !== X) set(x, f + 1, gz1, 'oak_fence');
  for (let z = z1 + 1; z <= gz1; z++) { set(gx0, f + 1, z, 'oak_fence'); set(gx1, f + 1, z, 'oak_fence'); }
  for (let z = z1; z >= z1 - 3; z--) { set(gx0, f + 1, z, 'oak_fence'); set(gx1, f + 1, z, 'oak_fence'); }
  for (let x = gx0 + 1; x < x0; x++) { set(x, f + 1, z1 - 3, 'oak_fence'); }
  for (let x = x1 + 1; x < gx1; x++) { set(x, f + 1, z1 - 3, 'oak_fence'); }
  set(X, f + 1, gz1, 'oak_fence_gate:n:c');
  for (const px of [X - 2, X + 2]) { set(px, f + 1, gz1, 'oak_fence'); set(px, f + 2, gz1, 'oak_fence'); set(px, f + 3, gz1, 'lantern'); }
  for (let z = z1 + 1; z <= gz1 + 3; z++) set(X, f, z, 'path');
  // flower beds along the fence and a sign at the gate
  const fl = ['flower_red', 'flower_yellow', 'flower_blue', 'flower_white'];
  for (let x = gx0 + 1; x < gx1; x++) if (Math.abs(x - X) > 2) { set(x, f + 1, gz1 - 1, fl[(x + 40) % 4]); }
  for (let z = z1 + 2; z < gz1 - 1; z++) { set(gx0 + 1, f + 1, z, fl[(z + 41) % 4]); set(gx1 - 1, f + 1, z, fl[(z + 42) % 4]); }
  set(X + 1, f + 1, gz1 + 2, 'sign');
  g.world.blockEntities.set(`${X + 1},${f + 1},${gz1 + 2}`, { type: 'sign', lines: ['Welcome to', 'Rose Cottage', '', 'Mind the gate!'], rot: 0 });
  // a little market stall by the road, with a striped wool awning
  const sx = X + 15, sz = Z + 6;
  for (const [dx, dz] of [[0, 0], [3, 0], [0, 2], [3, 2]]) { set(sx + dx, f + 1, sz + dz, 'oak_fence'); set(sx + dx, f + 2, sz + dz, 'oak_fence'); }
  const stripes = ['red_wool', 'wool', 'yellow_wool', 'wool'];
  for (let dx = -1; dx <= 4; dx++) for (let dz = -1; dz <= 3; dz++) set(sx + dx, f + 3, sz + dz, stripes[(dx + 1) % 4]);
  for (let dx = 0; dx <= 3; dx++) set(sx + dx, f + 1, sz + 3, 'oak_slab:bottom');
  set(sx + 1, f + 1, sz + 3, 'flower_pot:flower_red'); set(sx + 2, f + 1, sz + 3, 'flower_pot:flower_blue');
  set(sx + 3, f + 1, sz + 1, 'lantern');
  // ---- interior: rug, paintings, lanterns, shelves, a ladder to a roof hatch
  const rug = ['yellow_wool', 'orange_wool', 'red_wool', 'orange_wool', 'yellow_wool'];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -9; dz <= -6; dz++) set(X + dx, f, Z + dz, dz === -9 || dz === -6 || Math.abs(dx) === 2 ? 'red_wool' : rug[(dx + dz + 20) % 5]);
  set(X - 3, f + 3, Z - 10, 'lantern'); set(X - 3, f + 2, Z - 10, 'oak_fence'); set(X - 3, f + 1, Z - 10, 'oak_fence');
  set(X, f + 4, Z - 8, 'lantern:hanging');
  for (let h = 1; h <= 4; h++) set(X + 3, f + h, Z - 10, 'ladder:s');
  set(X + 3, f + 5, Z - 10, 'oak_trapdoor:s:bottom:o');
  set(X - 3, f + 1, Z - 5, 'flower_pot:cactus');
  set(X + 3, f + 1, Z - 5, 'flower_pot:flower_blue');
  // paintings on the back wall (inside faces south)
  const P = await import('/src/entities/Painting.ts');
  const A = await import('/src/render/paintingArt.ts');
  const hang = (id, f2, x, y, z) => g.entities.add(new P.Painting(A.motifById(id), f2, x, y, z));
  hang('harvest', 's', X - 2, f + 2, Z - 10);
  hang('owl', 's', X + 2, f + 3, Z - 10);
  hang('vase', 'w', X + 3, f + 3, Z - 9);          // east inner wall, faces west
  hang('lake', 'e', X - 3, f + 2, Z - 7);         // west inner wall, faces east (right is north, so the anchor is the southern cell)
  g.signs.refresh();
  return { X, Z, f, z1, gz1 };
}, S);
console.log('house', JSON.stringify(H));

if (PARTS.includes('garden')) {
  await time(2500);
  await hold(null);
  await view(H.X + 2.5, H.f + 2.2, H.gz1 + 8.5, H.X + 0.5, H.f + 2.4, H.Z - 4);
  await settle();
  await shot('d01_garden');
  await hold('sign');
  await view(H.X + 1.5, H.f + 0.4, H.gz1 + 3.9, H.X + 1.5, H.f + 1.8, H.gz1 + 2.5);
  await settle();
  await shot('d02_sign');
}

if (PARTS.includes('interior')) {
  await time(5000);
  await hold(null);
  await view(H.X + 0.5, H.f + 2.5, H.z1 - 1.2, H.X + 0.5, H.f + 2.1, H.Z - 11);
  await settle();
  await shot('d03_interior');
}

if (PARTS.includes('night')) {
  await time(17000);
  await hold(null);
  await view(H.X + 4.5, H.f + 2.6, H.gz1 + 7.5, H.X, H.f + 2, H.Z - 3);
  await settle();
  await shot('d04_night');
}

if (PARTS.includes('gallery')) {
  await time(4000);
  // a gallery wall of all eighteen paintings, west of the cottage, facing east
  const G = await ev(async (s) => {
    const bf = window.__bf, g = bf.game;
    const P = await import('/src/entities/Painting.ts');
    const A = await import('/src/render/paintingArt.ts');
    const XW = s.x - 19, ZC = s.z - 4, Y = s.y + 1;
    for (let dz = -11; dz <= 11; dz++) {
      for (let dy = 0; dy < 7; dy++) bf.setBlock(XW, Y + dy, ZC + dz, 'stone_bricks');
      bf.setBlock(XW, Y + 7, ZC + dz, 'stone_brick_slab:bottom');
      for (let dx = 1; dx <= 3; dx++) bf.setBlock(XW + dx, Y, ZC + dz, 'air');
    }
    // [motif, column from the viewer's left, row from the floor]
    const L = [['aurora', 0, 3], ['storm', 0, 0], ['village', 5, 4], ['lighthouse', 5, 1], ['pine', 6, 1],
      ['harvest', 8, 4], ['sail', 8, 2], ['hills', 10, 2], ['hearth', 8, 0], ['owl', 10, 0], ['apple', 11, 0],
      ['scribe', 13, 4], ['lake', 13, 1], ['valley', 16, 3], ['meadow', 16, 0], ['falls', 18, 0], ['toadstool', 19, 0], ['vase', 19, 1]];
    // facing east the viewer looks west, so "right" is north (-z): anchors are the southern-most cell
    for (const [id, i, j] of L) g.entities.add(new P.Painting(A.motifById(id), 'e', XW + 1, Y + j, ZC + 10 - i));
    return { XW, ZC, Y };
  }, S);
  await hold(null);
  await view(G.XW + 12.5, G.Y + 3.1, G.ZC + 0.5, G.XW, G.Y + 2.8, G.ZC + 0.5);
  await settle();
  await shot('d05_gallery');
}

if (PARTS.includes('ui')) {
  await time(5000);
  await view(H.X + 1.5, H.f + 2.0, H.gz1 + 4.5, H.X + 1.5, H.f + 1.6, H.gz1 + 2.5);
  await settle();
  await ev((h) => { window.__bf.engine.openSignEditor(h.X + 1, h.f + 1, h.gz1 + 2); }, H);
  await wait(500);
  await page.click('[data-testid=sign-line-2]');
  await page.keyboard.type('Est. Year One');
  await wait(400);
  await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300);
  await page.screenshot({ path: `${OUT}/d06_editor.png` }); console.log('shot d06_editor');
  await ev(() => window.__bf.engine.closeOverlay()); await wait(300);
  // dyeing wool in a crafting table
  await ev(() => {
    const g = window.__bf.game;
    const p = g.player;
    g.openBlockUI(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), 'crafting');
    g.craft3.slots.fill(null);
    const w = { id: 'wool', count: 1 };
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) g.craft3.slots[i] = { ...w };
    g.craft3.slots[4] = { id: 'light_blue_dye', count: 1 };
    g.craft3.changed();
    g.screen.updateCraftResult();
    g.inventory.slots.fill(null);
    const hot = ['flower_red', 'flower_yellow', 'flower_blue', 'flower_white', 'red_dye', 'yellow_dye', 'blue_dye', 'white_dye', 'lime_wool'];
    hot.forEach((id, i) => { g.inventory.slots[i] = { id, count: 8 + i }; });
    const more = ['orange_dye', 'magenta_dye', 'light_blue_dye', 'lime_dye', 'pink_dye', 'gray_dye', 'light_gray_dye', 'cyan_dye', 'purple_dye', 'brown_dye', 'green_dye', 'black_dye',
      'orange_wool', 'magenta_wool', 'yellow_wool', 'pink_wool', 'cyan_wool', 'purple_wool', 'blue_wool', 'green_wool', 'red_wool', 'black_wool', 'gray_wool'];
    more.forEach((id, i) => { g.inventory.slots[9 + i] = { id, count: 4 + (i % 5) }; });
    g.inventory.changed();
    window.__bf.engine.input.exitLock();
  });
  await wait(800);
  await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300);
  await page.screenshot({ path: `${OUT}/d07_dyeing.png` }); console.log('shot d07_dyeing');
  await ev(() => window.__bf.engine.closeOverlay()); await wait(300);
}

await b.close();
