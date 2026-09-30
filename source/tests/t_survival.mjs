import { createWorld, waitChunks } from './lib.mjs';
// Survival workflow: mine, collect, craft, place, open table, save/quit, reload
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
export default async (page, h) => {
  await createWorld(page, h, { name: 'Survival QA', seed: '12345', bonus: true });
  await waitChunks(h, 90);
  const log = [];
  const L = (k, v) => { log.push([k, v]); console.log(k, JSON.stringify(v)); };
  // --- movement: walk forward with W, jump, sneak
  const p0 = (await h.state()).player;
  await page.keyboard.down('KeyW'); await h.wait(1500); await page.keyboard.up('KeyW');
  const p1 = (await h.state()).player;
  L('walk distance (1.5s)', Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2));
  await page.keyboard.down('Space'); await h.wait(200);
  const pj = (await h.state()).player; await page.keyboard.up('Space');
  L('jump height gain', (pj.y - p1.y).toFixed(2));
  await h.wait(800);
  await page.keyboard.down('ControlLeft'); await page.keyboard.down('KeyW'); await h.wait(1500);
  const ps = (await h.state()).player; await page.keyboard.up('KeyW'); await page.keyboard.up('ControlLeft');
  L('sprinting', ps.sprinting);
  await page.keyboard.down('ShiftLeft'); await h.wait(300);
  L('sneaking', (await h.state()).player.sneaking); await page.keyboard.up('ShiftLeft');
  // --- mine logs
  let logs = 0;
  for (let n = 0; n < 4; n++) {
    const b = await h.ev(() => window.__bf.findBlock('log', 10));
    if (!b) { L('no log found', n); break; }
    if (b.d > 4) {
      await h.ev((b) => { const g = window.__bf.game; g.teleport(b.x + 0.5, b.y, b.z + 2.5); }, b);
      await h.wait(600);
    }
    await h.ev((b) => window.__bf.aimAt(b.x + 0.5, b.y + 0.5, b.z + 0.5), b);
    await h.wait(300);
    const tgt = (await h.state()).target;
    await page.mouse.move(vw/2, vh/2);
    await page.mouse.down({ button: 'left' });
    await h.wait(4200);
    await page.mouse.up({ button: 'left' });
    await h.wait(1200);
    const gone = await h.ev((b) => window.__bf.getBlock(b.x, b.y, b.z), b);
    const inv = await h.ev(() => window.__bf.inventory());
    L('mined log', { target: tgt, after: gone, inv });
    if (n === 0) await h.shot('mining_done');
  }
  // --- inventory: craft planks via real clicks
  await page.keyboard.press('KeyE');
  await h.wait(600);
  await h.shot('inventory_open');
  const invSlots = await h.ev(() => window.__bf.inventory());
  L('inv before craft', invSlots);
  // pick up logs from hotbar slot 0, put 1 in crafting grid slot (right click), then take output
  await page.click('[data-slot="hotbar:0"]');
  await page.click('[data-slot="craft:0"]', { button: 'right' });
  await page.click('[data-slot="hotbar:0"]');
  await h.wait(200);
  await h.shot('craft_grid');
  await page.click('[data-slot="output:0"]');
  await h.wait(200);
  L('cursor after output', await h.ev(() => window.__bf.game.cursor.stack));
  // put planks into main slot 9
  await page.click('[data-slot="main:9"]');
  // a second log -> planks via shift-click crafting
  await page.click('[data-slot="hotbar:0"]');
  await page.click('[data-slot="craft:0"]', { button: 'right' });
  await page.click('[data-slot="hotbar:0"]');
  await page.click('[data-slot="output:0"]', { modifiers: ['Shift'] });
  L('after shift-craft', await h.ev(() => window.__bf.inventory()));
  // drag-split test: pick planks, right-drag across 4 craft slots for table
  await page.click('[data-slot="main:9"]');
  const box = async (sel) => { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const cs = [await box('[data-slot="craft:0"]'), await box('[data-slot="craft:1"]'), await box('[data-slot="craft:2"]'), await box('[data-slot="craft:3"]')];
  await page.mouse.move(...cs[0]); await page.mouse.down({ button: 'right' });
  for (const c of cs.slice(1)) await page.mouse.move(...c, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await h.wait(200);
  await h.shot('craft_table_recipe');
  await page.click('[data-slot="main:10"]');
  await page.click('[data-slot="output:0"]');
  await page.click('[data-slot="hotbar:1"]');
  await h.wait(200);
  L('inv after crafting table', await h.ev(() => window.__bf.inventory()));
  await page.keyboard.press('KeyE');
  await h.wait(500);
  // --- place crafting table on the ground in front
  await h.ev(() => { const g = window.__bf.game; g.inventory.selected = 1; g.inventory.changed(); window.__bf.look(g.player.yaw, -0.9); });
  await h.wait(400);
  const t2 = (await h.state()).target;
  await page.mouse.click(vw/2, vh/2, { button: 'right' });
  await h.wait(500);
  const placed = t2 ? await h.ev((t) => window.__bf.getBlock(t.x, t.y + 1, t.z), t2) : null;
  L('placed table', { target: t2, placed });
  await h.shot('table_placed');
  // --- use table
  if (t2) {
    await h.ev((t) => window.__bf.aimAt(t.x + 0.5, t.y + 1.5, t.z + 0.5), t2);
    await h.wait(300);
    await page.mouse.click(vw/2, vh/2, { button: 'right' });
    await h.wait(600);
    L('overlay after use', (await h.state()).overlay);
    // sticks: 2 planks vertical
    await page.click('[data-slot="main:10"]');
    await page.click('[data-slot="craft:1"]', { button: 'right' });
    await page.click('[data-slot="craft:4"]', { button: 'right' });
    await page.click('[data-slot="main:10"]');
    await page.click('[data-slot="output:0"]');
    await page.click('[data-slot="main:11"]');
    L('after sticks', await h.ev(() => window.__bf.inventory()));
    // pickaxe: PPP / .S. / .S.
    await page.click('[data-slot="main:10"]');
    for (const i of [0, 1, 2]) await page.click(`[data-slot="craft:${i}"]`, { button: 'right' });
    await page.click('[data-slot="main:10"]');
    await page.click('[data-slot="main:11"]');
    for (const i of [4, 7]) await page.click(`[data-slot="craft:${i}"]`, { button: 'right' });
    await page.click('[data-slot="main:11"]');
    await h.shot('crafting_table_ui');
    await page.click('[data-slot="output:0"]');
    await page.click('[data-slot="hotbar:2"]');
    L('after pickaxe', await h.ev(() => window.__bf.inventory()));
    if ((await h.state()).overlay) { await page.keyboard.press('Escape'); await h.wait(300); }
  }
  // --- pause, save and quit, reload
  const before = await h.state();
  await page.keyboard.press('Escape');
  await h.wait(500);
  await h.shot('pause');
  await page.click('[data-testid=btn-save-quit]');
  for (let i = 0; i < 30; i++) { if ((await h.state()).screen === 'title') break; await h.wait(500); }
  await page.click('[data-testid=btn-singleplayer]');
  await h.wait(800);
  await h.shot('worlds_list');
  await page.click('[data-testid=world-entry]');
  await page.click('[data-testid=btn-play-selected]');
  for (let i = 0; i < 60; i++) { if ((await h.state()).screen === 'game') break; await h.wait(1000); }
  await h.ev(() => window.__bf.allowUnlocked(true));
  await h.wait(1500);
  const after = await h.state();
  L('reload position', { before: before.player, after: after.player });
  L('reload inventory', await h.ev(() => window.__bf.inventory()));
  if (t2) L('table persisted', await h.ev((t) => window.__bf.getBlock(t.x, t.y + 1, t.z), t2));
  await h.shot('after_reload');
};
