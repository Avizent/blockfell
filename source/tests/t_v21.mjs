// Tests for 2.1: armour stands (placing, dressing, taking back, swapping a whole set,
// knocking down, falling, lava, saving), dyed leather armour (the crafting rule,
// icons, tooltips, held and dropped items, the stand and the inventory picture) and
// the Ashboar (calm until hurt, the herd's charge and toss, Ember Lamps, Peaceful,
// Glowcap breeding, piglets growing up, drops and food, herds in the Cinderdeep,
// saving), plus the same on a touch screen.
// node tests/t_v21.mjs   (dev server)   ONLY=items,dye,stand,standsave,boar,breed,herd,touch
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['items', 'dye', 'stand', 'standsave', 'boar', 'breed', 'herd', 'touch'];
const run = (n) => only.includes(n);
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720, CX = VW / 2, CY = VH / 2;
const errors = [];
let page = await b.newPage({ viewport: { width: VW, height: VH } });
const watch = (pg) => { pg.on('pageerror', (e) => errors.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
watch(page);
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const key = (x, y, z) => ev(([x, y, z]) => window.__bf.getBlock(x, y, z), [x, y, z]);
const set = (x, y, z, k) => ev(([x, y, z, k]) => window.__bf.setBlock(x, y, z, k), [x, y, z, k]);
const give = (stack, slot = 0) => ev(([stack, slot]) => { const g = window.__bf.game; g.inventory.slots[slot] = stack; g.inventory.selected = slot; g.inventory.changed(); }, [stack, slot]);
const aim = (x, y, z) => ev(([x, y, z]) => window.__bf.aimAt(x, y, z), [x, y, z]);
const screen = () => ev(() => window.__bf?.state().screen);
const centre = async () => {
  const look = await ev(() => { const p = window.__bf.game.player; return [p.yaw, p.pitch]; });
  await page.mouse.move(CX, CY); await ticks(1);
  await ev(([yaw, pitch]) => { const p = window.__bf.game.player; p.yaw = yaw; p.pitch = pitch; }, look);
  await ticks(2);
};
const rclick = async () => { await centre(); await page.mouse.click(CX, CY, { button: 'right' }); await ticks(3); await wait(100); };
const lclick = async () => { await centre(); await page.mouse.click(CX, CY); await ticks(3); await wait(60); };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(400); };
const inGame = async () => { await waitFor(async () => (await screen()) === 'game', 90000); await ev(() => window.__bf.allowUnlocked(true)); await settle(); };
const calm = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 5000;
  for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
});
const clearItems = () => ev(() => { for (const e of window.__bf.game.entities.list) if (e.type === 'item' || e.type === 'xp') e.removed = true; });
async function newWorld(name, seed, creative = false) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await page.click('[data-testid=btn-singleplayer]'); await wait(300);
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', seed);
  if (creative) await page.click('[data-testid=btn-gamemode]');
  await page.click('[data-testid=btn-create-world]');
  await inGame();
  await calm();
  await ev(() => window.__bf.ui.set({ chat: [] }));
  await wait(300);
  return ev(() => window.__bf.game.record.id);
}
/** A flat stone pad around the player, 5 blocks of air above it; the player stands 3 south of the middle, facing north. */
const pad = (r = 6, floor = 'stone') => ev(([r, floor]) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { bf.setBlock(x + dx, y - 1, z + dz, floor); for (let dy = 0; dy <= 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
  p.flying = false;
  g.teleport(x + 0.5, y, z + 3.5); p.yaw = 0; p.pitch = 0; p.vx = p.vz = 0;
  return { x, y, z };
}, [r, floor]);
const standAt = (P) => ev((P) => {
  const s = window.__bf.game.entities.list.find((e) => e.type === 'armour_stand' && !e.removed && Math.floor(e.x) === P.x && Math.floor(e.z) === P.z);
  return s ? { x: s.x, y: s.y, z: s.z, yaw: s.yaw, items: s.items.map((i) => (i ? i.id + (i.color !== undefined ? '#' + i.color.toString(16) : '') : null)) } : null;
}, P);
const sel = () => ev(() => { const g = window.__bf.game, s = g.inventory.slots[g.inventory.selected]; return s ? s.id + (s.color !== undefined ? '#' + s.color.toString(16) : '') + 'x' + s.count : null; });
const itemsNear = (P, r = 4) => ev(([P, r]) => window.__bf.game.entities.list.filter((e) => e.type === 'item' && !e.removed && Math.hypot(e.x - P.x - 0.5, e.z - P.z - 0.5) < r).map((e) => e.stack.id + (e.stack.color !== undefined ? '#' + e.stack.color.toString(16) : '')).sort(), [P, r]);

await page.goto(URL);
await page.mouse.move(CX, CY);

// ======================================================================= ITEMS
if (run('items')) {
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  const t = await ev(async () => {
    const I = await import('/src/inventory/ItemRegistry.ts');
    const M = await import('/src/entities/Mob.ts');
    const H = await import('/src/entities/Hound.ts');
    const P = await import('/src/systems/Progress.ts');
    const bf = window.__bf;
    return {
      items: ['armour_stand', 'raw_ashboar', 'roast_ashboar', 'spawn_ashboar'].map((i) => I.hasItem(i)),
      stand: { name: I.getItem('armour_stand').name, stack: I.getItem('armour_stand').maxStack },
      raw: I.getItem('raw_ashboar').food, roast: I.getItem('roast_ashboar').food, smelt: I.getItem('raw_ashboar').smelt?.result,
      spec: M.MOB_SPECS.ashboar,
      hound: [H.HOUND_TAMING_FOOD.includes('raw_ashboar'), H.HOUND_FOOD.roast_ashboar],
      adv: ['stand', 'dye_armour', 'ashboar_breed'].map((id) => P.ADVANCEMENTS.find((a) => a.id === id)?.title ?? null),
      oak: bf.craft(['stick', 'stick', 'stick', null, 'stick', null, 'stick', 'oak_slab', 'stick']),
      stone: bf.craft(['stick', 'stick', 'stick', null, 'stick', null, 'stick', 'stone_slab', 'stick']),
    };
  });
  check('items: Armour Stand (stacks of 16), Raw and Roast Ashboar, Ashboar Spawn Egg', t.items.every(Boolean) && t.stand.name === 'Armour Stand' && t.stand.stack === 16, t);
  check('food: Raw Ashboar (3) smelts into Roast Ashboar (8, as filling as steak); Fellhounds take it too',
    t.raw?.hunger === 3 && t.roast?.hunger === 8 && t.roast?.saturation === 12.8 && t.smelt === 'roast_ashboar' && t.hound[0] && t.hound[1] === 8, t);
  check('Ashboar: 20 health, fireproof, not hostile, drops Raw Ashboar and Leather', t.spec.health === 20 && t.spec.fireproof && !t.spec.hostile && t.spec.drops.some((d) => d[0] === 'raw_ashboar') && t.spec.drops.some((d) => d[0] === 'leather'), t.spec);
  check('recipe: six sticks and an oak or stone slab make an Armour Stand', t.oak?.id === 'armour_stand' && t.stone?.id === 'armour_stand', { oak: t.oak, stone: t.stone });
  check('advancements: On Display, Dressed to Impress, Ember Piglet', t.adv.every(Boolean), t.adv);
}

// ======================================================================= DYE
let W = null;
if (run('dye') || run('stand') || run('standsave')) W = await newWorld('Stand World', 'stands21');
if (run('dye')) {
  const r = await ev(async () => {
    const R = await import('/src/crafting/recipes.ts');
    const D = await import('/src/world/dyes.ts');
    const s = (id, extra = {}) => ({ id, count: 1, ...extra });
    const grid = (...cells) => [...cells, ...Array(9 - cells.length).fill(null)];
    const red = D.DYE_RGB.red, rgb = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
    return {
      red: R.specialCraft(grid(s('leather_chestplate'), s('red_dye'))), want: rgb(red),
      anyPlace: R.specialCraft([null, null, s('blue_dye'), null, null, null, s('leather_boots'), null, null]), blue: rgb(D.DYE_RGB.blue),
      mix: R.specialCraft(grid(s('leather_helmet'), s('red_dye'), s('yellow_dye'))),
      keeps: R.specialCraft(grid(s('leather_leggings', { damage: 20, ench: { warding: 2 } }), s('green_dye'))),
      wash: R.specialCraft(grid(s('leather_chestplate', { color: 0x123456 }))),
      plain: R.specialCraft(grid(s('leather_chestplate'))),
      iron: R.specialCraft(grid(s('iron_chestplate'), s('red_dye'))),
      two: R.specialCraft(grid(s('leather_boots'), s('leather_boots'), s('red_dye'))),
      other: R.specialCraft(grid(s('leather_boots'), s('red_dye'), s('stick'))),
      label: [D.dyedLabel(rgb(red)), D.dyedLabel(0x7f5a3c)],
    };
  });
  check('dye: a leather piece and a dye (anywhere in the grid) give the piece in that colour', r.red?.id === 'leather_chestplate' && r.red.color === r.want && r.anyPlace?.color === r.blue, r);
  const mixC = r.mix?.color ?? 0, mr = mixC >> 16, mg = (mixC >> 8) & 255, mb = mixC & 255;
  check('dye: two dyes mix (red + yellow: an orange, kept bright)', r.mix?.id === 'leather_helmet' && mr > 180 && mg > 90 && mg < 200 && mb < 80, { mix: mixC.toString(16) });
  check('dye: the piece keeps its wear and runes', r.keeps?.damage === 20 && r.keeps?.ench?.warding === 2 && typeof r.keeps?.color === 'number', r.keeps);
  check('dye: a dyed piece on its own washes back to plain leather (a plain one gives nothing)', r.wash?.id === 'leather_chestplate' && r.wash.color === undefined && r.plain === null, { wash: r.wash, plain: r.plain });
  check('dye: iron can\'t be dyed; two pieces or anything else in the grid gives nothing', r.iron === null && r.two === null && r.other === null, r);
  check('dye: the tooltip says "Dyed Red" (or which dye a mix is closest to)', r.label[0] === 'Dyed Red' && /close to/.test(r.label[1]), r.label);
  // the real crafting grid in the inventory, and taking the result
  const h = await ev(() => {
    const g = window.__bf.game;
    window.__bf.engine.openInventory();
    const hd = g.screen;
    g.inventory.slots.fill(null);
    g.craft2.slots[0] = { id: 'leather_chestplate', count: 1 };
    g.craft2.slots[3] = { id: 'red_dye', count: 3 };
    hd.updateCraftResult();
    const out = g.craftOut2.slots[0] ? { ...g.craftOut2.slots[0] } : null;
    hd.click(hd.group('output')[0], 0, false);
    const cur = hd.cursor.stack ? { ...hd.cursor.stack } : null;
    const left = g.craft2.slots.map((s) => (s ? s.id + 'x' + s.count : null));
    return { out, cur, left, adv: g.progress.done.has('dye_armour') };
  });
  check('dye: in the inventory crafting grid: the result shows, taking it uses one dye and the piece', h.out?.color === 0xa62a26 && h.cur?.color === 0xa62a26 && h.left[0] === null && h.left[3] === 'red_dyex2', h);
  check('dye: "Dressed to Impress" is granted', h.adv, h);
  // the tooltip, over the dyed piece (dropped from the cursor into the hotbar)
  await ev(() => { const g = window.__bf.game, hd = g.screen; hd.click(hd.group('hotbar')[0], 0, false); });
  await wait(300);
  const slots = await page.$$('[data-testid=inventory-screen] .slot');
  let tip = '';
  for (const s of slots) {
    await s.hover(); await wait(40);
    const t2 = await page.evaluate(() => document.querySelector('.tooltip')?.textContent ?? '');
    if (/Leather Tunic/.test(t2)) { tip = t2; break; }
  }
  check('dye: hovering it in the inventory: "Leather Tunic ... Dyed Red"', /Leather Tunic/.test(tip) && /Dyed Red/.test(tip), tip);
  await page.screenshot({ path: `${SHOTS}/v21_inventory.png` });
  await ev(() => window.__bf.engine.closeOverlay()); await wait(200);
  // the hotbar icon is the re-coloured drawing, and the held and dropped item are red too
  const icon = await ev(async () => {
    const g = window.__bf.game;
    g.inventory.selected = 0; g.inventory.changed();
    await new Promise((r) => setTimeout(r, 300));
    const el = document.querySelector('[data-testid=hotbar] .item');
    const bg = el ? getComputedStyle(el).backgroundImage : '';
    const sheet = window.__bf.engine.icons.sheetUrl;
    const S = await import('/src/render/itemSprites.ts');
    const px = S.dyedArmourPixels('leather_chestplate', 0xa62a26), plain = S.spritePixels('leather_chestplate');
    let reddish = 0, same = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { if (px[i] > px[i + 1] * 1.8 && px[i] > px[i + 2] * 1.8) reddish++; if (px[i] === plain[i] && px[i + 1] === plain[i + 1]) same++; }
    return { data: bg.startsWith('url("data:image/png'), notSheet: !bg.includes(sheet.slice(30, 90)), reddish, same, held: g.hand.currentId ?? null };
  });
  check('dye: the hotbar shows a red tunic (its own re-coloured drawing, same shape)', icon.data && icon.notSheet && icon.reddish > 40, icon);
  await ticks(12);
  const heldKey = await ev(() => window.__bf.game.hand.currentId);
  check('dye: the tunic held in the hand is drawn red too', heldKey === 'leather_chestplate#a62a26', heldKey);
  await page.screenshot({ path: `${SHOTS}/v21_held.png` });
}

// ======================================================================= STAND
let SP = null;
if (run('stand')) {
  if (run('dye')) await ev(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.changed(); });
  const P = await pad(6);
  await settle();
  // place it: right-click the floor with a stand
  await give({ id: 'armour_stand', count: 2 });
  await aim(P.x + 0.5, P.y - 0.02, P.z + 0.5);
  await rclick();
  let st = await standAt(P);
  check('stand: right-clicking the floor with an Armour Stand puts one there (one used up)', !!st && Math.abs(st.y - P.y) < 0.01 && (await sel()) === 'armour_standx1', { st, sel: await sel() });
  check('stand: it turns to face you', !!st && Math.abs(Math.cos(st.yaw) + 1) < 0.01, st);
  // a second one on the same spot (aiming at a corner of the floor beside it): no
  await aim(P.x + 0.06, P.y - 0.02, P.z + 0.95);
  const n0 = await ev(() => window.__bf.game.entities.stands().length);
  await rclick();
  check('stand: you can\'t put a second stand in the same place', (await ev(() => window.__bf.game.entities.stands().length)) === n0, n0);
  // dress it
  await give({ id: 'iron_helmet', count: 1 });
  await aim(P.x + 0.5, P.y + 1.75, P.z + 0.5);
  await rclick();
  st = await standAt(P);
  check('stand: right-click with a helmet: it goes on the stand\'s head (and leaves your hand)', st?.items[0] === 'iron_helmet' && (await sel()) === null, { st, sel: await sel() });
  await give({ id: 'leather_chestplate', count: 1, color: 0x3244a8 });
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await rclick();
  await give({ id: 'leather_leggings', count: 1 });
  await rclick();
  await give({ id: 'iron_boots', count: 1 });
  await rclick();
  await give({ id: 'iron_sword', count: 1 });
  await rclick();
  st = await standAt(P);
  check('stand: each piece goes to its own place, wherever you aim; a sword goes in its hand',
    JSON.stringify(st?.items) === JSON.stringify(['iron_helmet', 'leather_chestplate#3244a8', 'leather_leggings', 'iron_boots', 'iron_sword']), st);
  check('stand: "On Display" is granted', await ev(() => window.__bf.game.progress.done.has('stand')));
  await ev(() => { const p = window.__bf.game.player; p.pitch = -0.25; });
  await ticks(10);
  await page.screenshot({ path: `${SHOTS}/v21_stand.png` });
  // swap a piece: the old one comes back to your hand
  await give({ id: 'iron_chestplate', count: 1 });
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await rclick();
  st = await standAt(P);
  check('stand: putting on a piece where one already is swaps them (the blue tunic is back in your hand)', st?.items[1] === 'iron_chestplate' && (await sel()) === 'leather_chestplate#3244a8x1', { st, sel: await sel() });
  // empty hand: take back what you aim at
  await give(null);
  await aim(P.x + 0.5, P.y + 1.75, P.z + 0.5);
  await rclick();
  check('stand: empty hand on its head: you take the helmet back', (await sel()) === 'iron_helmetx1' && (await standAt(P))?.items[0] === null, { sel: await sel(), st: await standAt(P) });
  await give(null);
  await aim(P.x + 0.5, P.y + 0.02, P.z + 0.5);
  await rclick();
  check('stand: ...at its feet: the boots', (await sel()) === 'iron_bootsx1', await sel());
  // sneak + empty hand: swap the whole set with what you wear
  await ev(() => { const g = window.__bf.game; g.inventory.slots[36] = { id: 'leather_helmet', count: 1, color: 0xa62a26 }; g.inventory.slots[37] = null; g.inventory.slots[38] = null; g.inventory.slots[39] = { id: 'leather_boots', count: 1 }; g.inventory.changed(); });
  await give(null);
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await page.keyboard.down('ShiftLeft'); await ticks(3);
  await rclick();
  await page.keyboard.up('ShiftLeft'); await ticks(2);
  const sw = await ev(() => window.__bf.game.inventory.slots.slice(36, 40).map((s) => (s ? s.id : null)));
  st = await standAt(P);
  check('stand: sneak + right-click with an empty hand swaps your whole set with the stand\'s',
    JSON.stringify(sw) === JSON.stringify([null, 'iron_chestplate', 'leather_leggings', null]) && st?.items[0] === 'leather_helmet#a62a26' && st?.items[1] === null && st?.items[3] === 'leather_boots' && st?.items[4] === 'iron_sword', { sw, st });
  check('stand: ...and your armour points follow (Iron Tunic 6 + Leather Pants 2)', (await ev(() => window.__bf.game.inventory.armorPoints())) === 8);
  // a block can't be put where the stand is (aiming past it at the floor's corner)
  await give({ id: 'stone', count: 5 });
  await ev((P) => { const g = window.__bf.game; g.teleport(P.x - 1.5, P.y, P.z - 1.5); }, P);
  await ticks(2);
  await aim(P.x + 0.04, P.y - 0.01, P.z + 0.04);
  await rclick();
  check('stand: a block can\'t be placed into the stand', (await key(P.x, P.y, P.z)) === 'air' && (await sel()) === 'stonex5', { k: await key(P.x, P.y, P.z), sel: await sel() });
  // pick block (Creative)
  await ev((P) => { const g = window.__bf.game; g.teleport(P.x + 0.5, P.y, P.z + 3.5); g.player.yaw = 0; }, P);
  await ticks(2);
  // knock it down: two quick hits
  await clearItems();
  await give(null);
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await lclick();
  const after1 = await standAt(P);
  await lclick();
  const after2 = await standAt(P);
  await ticks(4);
  const drops = await itemsNear(P);
  check('stand: one hit wobbles it, a second knocks it down', !!after1 && !after2, { after1, after2 });
  check('stand: ...and it drops itself and everything on it', JSON.stringify(drops) === JSON.stringify(['armour_stand', 'iron_sword', 'leather_boots', 'leather_helmet#a62a26']), drops);
  await page.screenshot({ path: `${SHOTS}/v21_stand_down.png` });
  // it falls when the ground goes
  await clearItems();
  await give({ id: 'armour_stand', count: 1 });
  await set(P.x, P.y, P.z, 'stone');
  await aim(P.x + 0.5, P.y + 0.98, P.z + 0.5);
  await rclick();
  const up = await ev((P) => window.__bf.game.entities.stands().find((s) => Math.floor(s.x) === P.x && Math.floor(s.z) === P.z)?.y ?? null, P);
  await set(P.x, P.y, P.z, 'air');
  await ticks(25);
  const down = await ev((P) => window.__bf.game.entities.stands().find((s) => Math.floor(s.x) === P.x && Math.floor(s.z) === P.z)?.y ?? null, P);
  check('stand: it falls when the block under it goes', up !== null && Math.abs(up - (P.y + 1)) < 0.01 && down !== null && Math.abs(down - P.y) < 0.01, { up, down });
  // lava burns it (what it held is dropped)
  await ev((P) => { const s = window.__bf.game.entities.stands().find((s) => Math.floor(s.x) === P.x && Math.floor(s.z) === P.z); s.items[0] = { id: 'iron_helmet', count: 1 }; }, P);
  await set(P.x, P.y, P.z, 'lava');
  await ticks(6);
  const burnt = await standAt(P);
  check('stand: lava burns it', !burnt, burnt);
  await set(P.x, P.y, P.z, 'air');
  await ticks(3);
  // Creative: one hit, nothing dropped but what it held
  await clearItems();
  await ev(() => { window.__bf.game.setGameMode('creative'); });
  await give({ id: 'armour_stand', count: 1 });
  await aim(P.x + 0.5, P.y - 0.02, P.z + 0.5);
  await rclick();
  check('stand: in Creative, placing a stand doesn\'t use it up', (await sel()) === 'armour_standx1', await sel());
  await ev((P) => { const s = window.__bf.game.entities.stands().find((s) => Math.floor(s.x) === P.x && Math.floor(s.z) === P.z); s.items[2] = { id: 'iron_leggings', count: 1 }; }, P);
  await give({ id: 'stone', count: 1 });
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await centre();
  await page.mouse.click(CX, CY, { button: 'middle' }); await ticks(3);
  check('stand: middle-click picks an Armour Stand (Creative)', /^armour_stand/.test(await sel() ?? ''), await sel());
  await lclick();
  await ticks(3);
  check('stand: in Creative one hit takes it away, dropping only what it held', !(await standAt(P)) && JSON.stringify(await itemsNear(P)) === '["iron_leggings"]', { st: await standAt(P), drops: await itemsNear(P) });
  await ev(() => { window.__bf.game.setGameMode('survival'); window.__bf.game.player.flying = false; });
  await clearItems();
  SP = P;
}

// ======================================================================= STAND SAVE
if (run('standsave')) {
  const P = SP ?? await pad(6);
  if (!SP) await settle();
  await ev((P) => {
    const g = window.__bf.game;
    for (const s of g.entities.stands()) s.removed = true;
    window.__bf.setBlock(P.x + 3, P.y + 2, P.z, 'stone');   // a change, so the area is saved
  }, P);
  await ticks(2);
  await ev(async (P) => {
    const { ArmourStand } = await import('/src/entities/ArmourStand.ts');
    const g = window.__bf.game;
    const s = new ArmourStand(Math.PI / 4);
    s.setPos(P.x + 0.5, P.y, P.z + 0.5);
    s.items[0] = { id: 'leather_helmet', count: 1, color: 0x7ac432 };
    s.items[1] = { id: 'iron_chestplate', count: 1, damage: 12, ench: { warding: 1 } };
    s.items[4] = { id: 'bow', count: 1 };
    g.entities.add(s);
  }, P);
  await ticks(2);
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  await ev((id) => void window.__bf.engine.playWorld(id), W);
  await inGame();
  await ticks(5);
  const back = await ev((P) => {
    const s = window.__bf.game.entities.stands().find((s) => Math.floor(s.x) === P.x && Math.floor(s.z) === P.z);
    return s ? { yaw: s.yaw, items: s.items.map((i) => (i ? { ...i } : null)) } : null;
  }, P);
  check('save: stands are saved with the world: where they stand, which way they face, and what they hold (colour, wear and runes too)',
    !!back && Math.abs(back.yaw - Math.PI / 4) < 1e-6 && back.items[0]?.color === 0x7ac432 && back.items[1]?.damage === 12 && back.items[1]?.ench?.warding === 1 && back.items[4]?.id === 'bow' && back.items[2] === null, back);
}

// ======================================================================= ASHBOAR
let BW = null, BP = null;
async function boarWorld() {
  if (BW) return;
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
  BW = await newWorld('Boar World', 'boars21');
  await ev(() => void window.__bf.engine.changeDimension('cinderdeep', { kind: 'gate', x: Math.floor(window.__bf.game.player.x), z: Math.floor(window.__bf.game.player.z) }));
  await inGame();
  await calm();
  BP = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x = Math.floor(p.x), z = Math.floor(p.z) + 30, y = 70;
    for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) { bf.setBlock(x + dx, y - 1, z + dz, 'ashrock'); for (let dy = 0; dy <= 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air'); }
    p.flying = false;
    g.teleport(x + 0.5, y, z + 0.5);
    return { x, y, z };
  });
  await settle();
  await calm();
}
const boars = () => ev(() => window.__bf.game.entities.list.filter((e) => e.mobType === 'ashboar' && !e.removed).map((e) => ({ id: e.id, x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), baby: e.isBaby, anger: e.anger, love: e.love, cool: e.breedCooldown, hp: e.health, alive: e.alive })));
const resetBoars = () => ev(() => {
  const g = window.__bf.game;
  for (const e of g.entities.list) if (e.type === 'mob') e.removed = true;
  for (let i = g.entities.list.length - 1; i >= 0; i--) if (g.entities.list[i].removed) { g.entities.list[i].dispose(); g.entities.list.splice(i, 1); }
  g.player.health = 20; g.player.food = 20;
});

if (run('boar')) {
  await boarWorld();
  const P = BP;
  await ev(() => { window.__bf.game.difficulty = 'normal'; });
  // a spawn egg
  await give({ id: 'spawn_ashboar', count: 1 });
  await aim(P.x + 0.5, P.y - 0.02, P.z - 3.5);
  await rclick();
  let bs = await boars();
  check('Ashboar: a spawn egg makes one', bs.length === 1 && !bs[0].baby, bs);
  await resetBoars();
  // calm until hurt: a herd of three grown-ups and a piglet next to the player
  await ev((P) => {
    const g = window.__bf.game;
    const mk = (dx, dz, baby) => { const m = g.entities.spawnMob('ashboar', P.x + dx + 0.5, P.y, P.z + dz + 0.5, g); if (baby) m.makeBaby(); return m; };
    mk(0, -4); mk(2, -5); mk(-2, -5); mk(0, -7, true);
    g.player.yaw = 0; g.player.pitch = 0;
  }, P);
  const hp0 = await ev(() => window.__bf.game.player.health);
  await fast(200);
  bs = await boars();
  check('Ashboar: left alone, a herd stays calm (nobody charges, the player is unhurt)', bs.every((b) => b.anger === 0) && (await ev(() => window.__bf.game.player.health)) === hp0, bs);
  // lava doesn't hurt them
  const lava = await ev((P) => {
    const g = window.__bf.game, m = g.entities.spawnMob('ashboar', P.x + 8.5, P.y, P.z + 8.5, g);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) window.__bf.setBlock(P.x + 8 + dx, P.y, P.z + 8 + dz, 'lava');
    let inLava = 0;
    for (let i = 0; i < 60; i++) { g.tick(); if (m.inLava) inLava++; }
    const r = { hp: m.health, fire: m.fireTicks, inLava };
    m.removed = true;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) window.__bf.setBlock(P.x + 8 + dx, P.y, P.z + 8 + dz, 'air');
    return r;
  }, P);
  check('Ashboar: lava doesn\'t hurt it', lava.hp === 20 && lava.inLava > 30, lava);
  // hit one: the grown-ups charge, the piglet runs
  // (the herd holds still while you take aim)
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') e.tick = () => {}; });
  const target = (await boars()).filter((b) => !b.baby).sort((a, c) => a.z - c.z).pop();
  await ev(([P, t]) => { const g = window.__bf.game; g.teleport(t.x, P.y, t.z + 2.4); const p = g.player; p.vx = p.vz = 0; }, [P, target]);
  await ticks(2);
  await aim(target.x, P.y + 0.7, target.z);
  if (process.env.DBG) console.log('DBG', JSON.stringify(await ev(() => { const g = window.__bf.game, p = g.player; return { p: [p.x, p.y, p.z, p.yaw, p.pitch], tm: g.targetMob?.id ?? null, t: g.target, focus: window.__bf.engine.input.gameFocus, scr: window.__bf.state().screen, ov: window.__bf.ui.get().overlay, dead: p.dead }; })), JSON.stringify(target));
  await lclick();
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') delete e.tick; });
  bs = await boars();
  check('Ashboar: hit one and every grown-up nearby turns on you; the piglet doesn\'t', bs.filter((b) => !b.baby).every((b) => b.anger > 0) && bs.filter((b) => b.baby).every((b) => b.anger === 0), bs);
  // the charge: damage and a toss into the air
  const charge = await ev(() => {
    const g = window.__bf.game, p = g.player;
    p.health = 20;
    // watch for an Ashboar's hit (a fall off the pad hurts too, and isn't one)
    let hit = null;
    g.damagePlayer = (a, src) => { const h = p.health; Object.getPrototypeOf(g).damagePlayer.call(g, a, src); if (!hit && src.mob?.mobType === 'ashboar' && p.health < h) hit = { before: h, after: p.health }; };
    let t = 0;
    for (; t < 200 && !hit; t++) g.tick();
    delete g.damagePlayer;
    return { h0: hit?.before, h: hit?.after, t, maxVy: p.vy, sec: t / 20 };
  });
  check('Ashboar: the herd charges and its hit hurts and tosses you into the air', charge.h < charge.h0 && charge.maxVy > 0.6 && charge.sec < 8, charge);
  await page.screenshot({ path: `${SHOTS}/v21_charge.png` });
  // an Ember Lamp makes them give up and back away: you stand beside one, the angry herd is 10 blocks off
  const lamp = await ev((P) => {
    const g = window.__bf.game, p = g.player;
    p.health = 20;
    const L = { x: P.x, y: P.y + 2, z: P.z };
    window.__bf.setBlock(L.x, L.y, L.z, 'ember_lamp');
    const adults = g.entities.list.filter((e) => e.mobType === 'ashboar' && !e.isBaby && !e.removed && e.alive);
    adults.forEach((e, i) => { e.setPos(L.x + 0.5 + i * 2 - 2, P.y, L.z + 10.5); e.vx = e.vz = 0; e.anger = 400; e.panic = 0; e.lamp = null; });
    // the player stays by the lamp (a toss doesn't carry them out of its glow)
    const stay = () => { p.x = p.prevX = L.x + 0.5; p.z = p.prevZ = L.z + 0.5; p.vx = p.vz = 0; };
    const h = p.health;
    let closest = 99;
    for (let i = 0; i < 160; i++) { stay(); g.tick(); for (const e of adults) closest = Math.min(closest, Math.hypot(e.x - L.x - 0.5, e.z - L.z - 0.5)); }
    const angry = adults.filter((e) => e.anger > 0).length;
    const dist = adults.map((e) => +Math.hypot(e.x - L.x - 0.5, e.z - L.z - 0.5).toFixed(1));
    window.__bf.setBlock(L.x, L.y, L.z, 'air');
    return { n: adults.length, angry, dist, closest: +closest.toFixed(1), hurt: Math.max(0, h - p.health) };
  }, P);
  check('Ashboar: an Ember Lamp close by (6 blocks) makes them give up the charge', lamp.n >= 2 && lamp.angry === 0 && lamp.closest < 7, lamp);
  check('Ashboar: ...and they keep their distance from it (you are safe beside it)', lamp.dist.every((d) => d > 5) && lamp.hurt === 0, lamp);
  // Peaceful: they never charge
  await resetBoars();
  await ev((P) => { const g = window.__bf.game; g.difficulty = 'peaceful'; g.teleport(P.x + 0.5, P.y, P.z + 0.5); g.player.vx = g.player.vz = 0; const m = g.entities.spawnMob('ashboar', P.x + 0.5, P.y, P.z - 2.5, g); m.yaw = 0; }, P);
  await ticks(2);
  await aim(P.x + 0.5, P.y + 0.7, P.z - 2.5);
  await lclick();
  bs = await boars();
  check('Ashboar: on Peaceful a hurt Ashboar just runs off (no charge)', bs.length === 1 && bs[0].anger === 0, bs);
  await ev(() => { window.__bf.game.difficulty = 'normal'; });
  // drops: a grown-up gives meat (and maybe leather), a piglet nothing
  await resetBoars();
  await clearItems();
  const drops = await ev((P) => {
    const g = window.__bf.game;
    const a = g.entities.spawnMob('ashboar', P.x + 4.5, P.y, P.z + 0.5, g);
    const c = g.entities.spawnMob('ashboar', P.x - 4.5, P.y, P.z + 0.5, g); c.makeBaby();
    a.hurt(50, g, 0, 1, true); c.hurt(50, g, 0, 1, true);
    for (let i = 0; i < 25; i++) g.tick();
    const near = (x) => g.entities.list.filter((e) => e.type === 'item' && !e.removed && Math.abs(e.x - x) < 2).map((e) => e.stack.id);
    return { adult: near(P.x + 4.5), baby: near(P.x - 4.5) };
  }, P);
  check('Ashboar: a grown-up drops Raw Ashboar; a piglet drops nothing', drops.adult.includes('raw_ashboar') && drops.adult.every((d) => d === 'raw_ashboar' || d === 'leather') && drops.baby.length === 0, drops);
  await clearItems();
}

if (run('breed')) {
  await boarWorld();
  const P = BP;
  await resetBoars();
  await ev((P) => { const g = window.__bf.game; g.difficulty = 'normal'; g.teleport(P.x + 0.5, P.y, P.z + 0.5); g.player.yaw = 0; g.player.pitch = 0; for (const [dx, dz] of [[-1.5, -3], [1.5, -3]]) g.entities.spawnMob('ashboar', P.x + 0.5 + dx, P.y, P.z + 0.5 + dz, g); }, P);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') e.tick = () => {}; });   // hold still while being fed
  await give({ id: 'glowcap', count: 4 });
  let bs = await boars();
  for (const bb of bs) { await aim(bb.x, P.y + 0.7, bb.z); await rclick(); }
  bs = await boars();
  check('breed: a Glowcap fed to each of two grown-ups: they fall in love (Glowcaps used)', bs.length === 2 && bs.every((b) => b.love > 0) && (await sel()) === 'glowcapx2', { bs, sel: await sel() });
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') delete e.tick; });
  const xp0 = await ev(() => window.__bf.game.player.xpTotal);
  await fast(200);
  bs = await boars();
  const babies = bs.filter((b) => b.baby), adults = bs.filter((b) => !b.baby);
  check('breed: they meet and have a piglet', babies.length === 1 && adults.length === 2, bs);
  check('breed: the parents have to wait before they can again (and a Glowcap now does nothing)', adults.every((b) => b.cool > 5000 && b.love === 0), adults);
  const ach = await ev((xp0) => ({ adv: window.__bf.game.progress.done.has('ashboar_breed'), xp: window.__bf.game.entities.list.filter((e) => e.type === 'xp' && !e.removed).length + window.__bf.game.player.xpTotal - xp0 }), xp0);
  check('breed: "Ember Piglet" is granted, and there is experience to collect', ach.adv && ach.xp > 0, ach);
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') e.tick = () => {}; });
  const parent = adults[0];
  await aim(parent.x, P.y + 0.7, parent.z);
  await rclick();
  check('breed: ...the Glowcap stays in your hand', (await sel()) === 'glowcapx2', await sel());
  const piglet = (await boars()).find((b) => b.baby);
  const before = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).childAge, piglet.id);
  // stand where nothing is in the way (the parents are close by)
  await ev(([P, pl]) => {
    const g = window.__bf.game, others = g.entities.list.filter((e) => e.mobType === 'ashboar' && !e.isBaby);
    let best = null, bd = -1;
    for (let a = 0; a < 16; a++) {
      const x = pl.x + Math.sin(a / 16 * Math.PI * 2) * 2, z = pl.z + Math.cos(a / 16 * Math.PI * 2) * 2;
      const d = Math.min(...others.map((o) => { const t = Math.max(0, Math.min(1, ((o.x - x) * (pl.x - x) + (o.z - z) * (pl.z - z)) / 4)); return Math.hypot(x + (pl.x - x) * t - o.x, z + (pl.z - z) * t - o.z); }));
      if (d > bd) { bd = d; best = [x, z]; }
    }
    g.teleport(best[0], P.y, best[1]); g.player.vx = g.player.vz = 0;
  }, [P, piglet]);
  await ticks(2);
  await aim(piglet.x, P.y + 0.3, piglet.z);
  await rclick();
  const afterAge = await ev((id) => window.__bf.game.entities.list.find((e) => e.id === id).childAge, piglet.id);
  check('breed: a Glowcap makes a piglet grow up sooner (a tenth of the 10 minutes)', before - afterAge === 1200 && (await sel()) === 'glowcapx1', { before, afterAge });
  await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType === 'ashboar') delete e.tick; });
  await page.screenshot({ path: `${SHOTS}/v21_piglet.png` });
  // the piglet keeps its age through a save
  await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.childAge = 5000; m.persistent = true; window.__bf.setBlock(Math.floor(m.x) + 3, Math.floor(m.y) + 3, Math.floor(m.z), 'ashrock'); }, piglet.id);
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 40000);
  await ev((id) => void window.__bf.engine.playWorld(id), BW);
  await inGame();
  await calm2();
  bs = await boars();
  const pl = bs.filter((b) => b.baby);
  const ages = await ev(() => window.__bf.game.entities.list.filter((e) => e.mobType === 'ashboar').map((e) => ({ child: e.childAge, cool: e.breedCooldown })));
  check('save: Ashboars are saved: the piglet is still a piglet (same time left), parents still waiting', pl.length === 1 && ages.some((a) => a.child > 4900 && a.child <= 5000) && ages.filter((a) => a.cool > 4000).length === 2, ages);
  // growing up
  await ev(() => { const m = window.__bf.game.entities.list.find((e) => e.mobType === 'ashboar' && e.isBaby); m.childAge = 3; });
  await fast(5);
  bs = await boars();
  const grown = await ev(() => window.__bf.game.entities.list.filter((e) => e.mobType === 'ashboar').map((e) => +e.height.toFixed(2)));
  check('breed: when its time is up the piglet grows up (full size)', bs.every((b) => !b.baby) && grown.every((h) => h === 1.15), { bs, grown });
}
async function calm2() { await ev(() => { const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; }); }

if (run('herd')) {
  await boarWorld();
  await resetBoars();
  const h = await ev(async () => {
    const g = window.__bf.game, em = g.entities;
    const C = await import('/src/world/Cinderdeep.ts');
    const rnd = Math.random;
    let tries = 0;
    while (tries++ < 600 && !em.list.some((e) => e.mobType === 'ashboar')) em.spawnHerd(g);
    const herd = em.list.filter((e) => e.mobType === 'ashboar');
    const spot = herd.map((e) => ({ x: Math.floor(e.x), y: Math.floor(e.y), z: Math.floor(e.z), d: Math.hypot(e.x - g.player.x, e.z - g.player.z), floor: window.__bf.getBlock(Math.floor(e.x), Math.floor(e.y) - 1, Math.floor(e.z)) }));
    // an Ember Lamp next to the same spot keeps a herd from appearing there (same random numbers)
    for (const e of herd) e.removed = true;
    em.tick(g);
    let seq = [], k = 0;
    Math.random = () => { const v = rnd(); seq.push(v); return v; };
    let made = 0;
    for (let i = 0; i < 400 && !made; i++) { seq = []; em.spawnHerd(g); made = em.list.filter((e) => e.mobType === 'ashboar' && !e.removed).length; }
    const first = em.list.filter((e) => e.mobType === 'ashboar' && !e.removed);
    const at = first.length ? { x: Math.floor(first[0].x), y: Math.floor(first[0].y), z: Math.floor(first[0].z) } : null;
    for (const e of first) e.removed = true;
    em.tick(g);
    let again = -1;
    if (at) {
      window.__bf.setBlock(at.x + 2, at.y, at.z, 'ember_lamp');
      const replay = seq.slice();
      Math.random = () => (k < replay.length ? replay[k++] : rnd());
      em.spawnHerd(g);
      again = em.list.filter((e) => e.mobType === 'ashboar' && !e.removed).length;
      window.__bf.setBlock(at.x + 2, at.y, at.z, 'air');
    }
    Math.random = rnd;
    // the natural spawn cycle (every second, while the player is down there)
    for (const e of em.list) if (e.mobType === 'ashboar') e.removed = true;
    em.tick(g);
    g.rules.doMobSpawning = true; em.mobSpawning = true; g.difficulty = 'peaceful';
    for (let i = 0; i < 400; i++) em.trySpawnDeep(g);
    const natural = em.list.filter((e) => e.mobType === 'ashboar' && !e.removed).length;
    g.rules.doMobSpawning = false; em.mobSpawning = false; g.difficulty = 'normal';
    return { tries, n: herd.length, spot, lavaSea: C.LAVA_SEA, made, again, natural };
  });
  check('herds: Ashboars appear in herds (up to four) on cavern floors, 24-48 blocks from the player',
    h.n >= 1 && h.n <= 4 && h.spot.every((s) => s.y > h.lavaSea && s.d > 20 && s.d < 52 && s.floor !== 'air'), h);
  check('herds: an Ember Lamp keeps a herd from appearing near it', h.made > 0 && h.again === 0, h);
  check('herds: they appear on their own in the Cinderdeep (even on Peaceful: they are animals), at most 8 around you', h.natural >= 2 && h.natural <= 11, h);
  await resetBoars();
}

// ======================================================================= TOUCH (iPad)
if (run('touch')) {
  if ((await screen()) === 'game') { await ev(() => window.__bf.engine.saveAndQuit()); await waitFor(async () => (await screen()) === 'title', 40000); }
  await page.close();
  const TW = 1180, TH = 820;
  const ctx = await b.newContext({ viewport: { width: TW, height: TH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  watch(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const TX = TW * 0.62, TY = TH * 0.3;
  const tap = async () => {
    await wait(400);
    const t0 = await ev(() => performance.now());
    // a quick tap: both events sent together, 60 ms apart by their own timestamps (swiftshader frames are slow)
    const ts = Date.now() / 1000;
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: ts, touchPoints: [{ x: TX, y: TY, id: 0, radiusX: 4, radiusY: 4, force: 1 }] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: ts + 0.06, touchPoints: [] }),
    ]);
    const dt = await ev((t0) => performance.now() - t0, t0);
    await ticks(4); await wait(100);
    void dt;
  };
  const hold = async (ms) => { await touch('touchStart', [[TX, TY]]); await wait(ms); await lift(); await ticks(3); };
  await page.goto(URL);
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await ev(() => document.querySelector('[data-testid=btn-singleplayer]').click()); await wait(300);
  await ev(() => document.querySelector('[data-testid=btn-create-new]').click()); await wait(300);
  await page.fill('[data-testid=world-name]', 'iPad Stand'); await page.fill('[data-testid=world-seed]', 'ipad21');
  await ev(() => document.querySelector('[data-testid=btn-create-world]').click());
  await waitFor(async () => (await screen()) === 'game', 90000);
  await settle();
  await calm();
  const touchOn = await ev(() => window.__bf.ui.get().touch);
  const P = await pad(5);
  await settle();
  await give({ id: 'armour_stand', count: 1 });
  await aim(P.x + 0.5, P.y - 0.02, P.z + 0.5);
  await tap();
  let st = await standAt(P);
  check('touch: tapping the floor with an Armour Stand puts it there', touchOn && !!st, { touchOn, st });
  await give({ id: 'leather_chestplate', count: 1, color: 0x1e8e96 });
  await aim(P.x + 0.5, P.y + 1.2, P.z + 0.5);
  await tap();
  st = await standAt(P);
  check('touch: tapping the stand with armour puts it on', st?.items[1] === 'leather_chestplate#1e8e96', st);
  await give(null);
  await tap();
  check('touch: tapping it with an empty hand takes the piece back', (await sel()) === 'leather_chestplate#1e8e96x1' && (await standAt(P))?.items[1] === null, { sel: await sel(), st: await standAt(P) });
  await hold(900);
  check('touch: holding a finger on it knocks it down', !(await standAt(P)), await standAt(P));
  // an Ashboar: a tap with a Glowcap feeds it, a tap with anything else is a hit
  await ev((P) => { const g = window.__bf.game; const m = g.entities.spawnMob('ashboar', P.x + 0.5, P.y, P.z + 0.5, g); m.tick = () => {}; g.difficulty = 'normal'; }, P);
  await give({ id: 'glowcap', count: 2 });
  await aim(P.x + 0.5, P.y + 0.7, P.z + 0.5);
  await tap();
  const fed = (await boars())[0];
  check('touch: tapping an Ashboar while holding a Glowcap feeds it', fed?.love > 0 && fed?.hp === 20 && (await sel()) === 'glowcapx1', { fed, sel: await sel() });
  await give({ id: 'stick', count: 1 });
  await tap();
  const hit = (await boars())[0];
  check('touch: ...with anything else a tap is a hit', hit?.hp < 20, hit);
}

console.log('\nerrors:', JSON.stringify(errors.slice(0, 8)));
check('no page errors', errors.length === 0, errors.slice(0, 8));
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} passed`);
fs.writeFileSync('/tmp/t_v21.json', JSON.stringify(results, null, 1));
await b.close();
process.exit(fails.length ? 1 : 0);
