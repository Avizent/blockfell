import { createWorld } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { creative: true });
  await h.wait(1500);
  const poses = JSON.parse(process.env.POSES || '[{}]');
  const items = ['', 'iron_pickaxe', 'cobblestone', 'torch'];
  let n = 0;
  for (const p of poses) {
    await h.ev((p) => Object.assign(window.__bf.game.hand.pose, p), p);
    for (const it of items) {
      await h.ev((it) => { const g = window.__bf.game; g.inventory.slots[0] = it ? { id: it, count: 1 } : null; g.inventory.selected = 0; g.inventory.changed(); }, it);
      await h.wait(900);
      await h.shot('arm' + n++);
    }
  }
};
