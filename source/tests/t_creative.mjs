import { createWorld, waitChunks } from './lib.mjs';
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
export default async (page, h) => {
  await createWorld(page, h, { name: 'Creative QA', seed: 'blockfell', creative: true });
  await waitChunks(h, 90);
  const L = (k, v) => console.log(k, JSON.stringify(v));
  // creative inventory
  await page.keyboard.press('KeyE');
  await h.wait(500);
  await h.shot('creative_building');
  await page.click('[data-testid=tab-natural]');
  await h.wait(200);
  await h.shot('creative_natural');
  await page.click('[data-testid=tab-search]');
  await page.keyboard.type('glass');
  await h.wait(300);
  await h.shot('creative_search');
  await page.click('[data-testid=cat-glass]');
  await page.click('[data-slot="hotbar:0"]');
  await page.click('[data-testid=tab-spawn]');
  await page.click('[data-testid=cat-spawn_cow]');
  await page.click('[data-slot="hotbar:1"]');
  await page.click('[data-testid=tab-inventory]');
  await h.wait(300);
  await h.shot('creative_inventory_tab');
  await page.click('[data-testid=tab-tools]');
  await page.click('[data-testid=cat-iron_pickaxe]', { modifiers: ['Shift'] });
  L('inventory after creative picks', await h.ev(() => window.__bf.inventory()));
  await page.keyboard.press('KeyE');
  await h.wait(300);
  // instant break
  await h.ev(() => window.__bf.look(window.__bf.game.player.yaw, -1.2));
  await h.wait(300);
  const t = (await h.state()).target;
  await h.ev(() => { window.__dbg = []; const g = window.__bf.game; const orig = g.breakBlockAt.bind(g); g.breakBlockAt = (...a) => { window.__dbg.push('break ' + a.join(',')); return orig(...a); }; window.addEventListener('mousedown', (e) => window.__dbg.push('md ' + e.target.tagName + ' focus=' + window.__bf.engine.input.gameFocus + ' ov=' + window.__bf.ui.get().overlay)); });
  await page.mouse.click(vw / 2, vh / 2);
  await h.wait(300);
  L('dbg', await h.ev(() => window.__dbg));
  await h.wait(400);
  L('instant break', { t, after: t ? await h.ev((t) => window.__bf.getBlock(t.x, t.y, t.z), t) : null });
  // place unlimited glass
  await h.ev(() => { const g = window.__bf.game; g.inventory.selected = 0; g.inventory.changed(); });
  for (let i = 0; i < 3; i++) { await page.mouse.click(vw / 2, vh / 2, { button: 'right' }); await h.wait(250); }
  L('glass stack after placing', await h.ev(() => window.__bf.game.inventory.get(0)));
  // flight: double tap space
  const y0 = (await h.state()).player.y;
  await page.keyboard.press('Space'); await h.wait(60); await page.keyboard.press('Space'); await h.wait(300);
  L('flying after double-tap', (await h.state()).player.flying);
  await page.keyboard.down('Space'); await h.wait(1500); await page.keyboard.up('Space');
  const y1 = (await h.state()).player.y;
  await page.keyboard.down('ShiftLeft'); await h.wait(800); await page.keyboard.up('ShiftLeft');
  const y2 = (await h.state()).player.y;
  L('fly up/down', { y0, y1, y2 });
  await h.shot('flying_view');
  // sprint in the air, horizontal flight speed
  const a = (await h.state()).player;
  await page.keyboard.down('KeyW'); await h.wait(2000); await page.keyboard.up('KeyW');
  const b = (await h.state()).player;
  L('fly speed m/s (approx)', (Math.hypot(b.x - a.x, b.z - a.z) / 2).toFixed(2));
  // spawn egg
  await h.ev(() => { const g = window.__bf.game; g.player.flying = false; g.inventory.selected = 1; g.inventory.changed(); window.__bf.look(g.player.yaw, -0.6); });
  await h.wait(2500);
  await page.mouse.click(vw / 2, vh / 2, { button: 'right' });
  await h.wait(1500);
  L('mobs', await h.ev(() => window.__bf.game.entities.list.filter((e) => e.type === 'mob').map((m) => m.mobType)));
  await h.shot('spawned_cow');
  // day/night
  await h.ev(() => { window.__bf.game.dayNight.time = 13500; });
  await h.wait(1500);
  await h.shot('sunset');
  await h.ev(() => { window.__bf.game.dayNight.time = 18000; });
  await h.wait(1500);
  await h.shot('night');
  // pick-block with middle click
  await page.keyboard.press('F3');
  await h.wait(1200);
  await h.shot('debug_overlay');
};
