import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Sand', seed: '5', creative: true });
  await waitChunks(h, 60);
  const r = await h.ev(async () => {
    const bf = window.__bf, g = bf.game;
    const x = Math.floor(g.player.x) + 3, z = Math.floor(g.player.z) + 3, y = 100;
    bf.setBlock(x, y - 5, z, 'stone');
    bf.setBlock(x, y, z, 'sand');
    bf.setBlock(x + 1, y - 5, z, 'stone');
    bf.setBlock(x + 1, y - 4, z, 'torch');
    await new Promise((r) => setTimeout(r, 2500));
    const col = [];
    for (let k = -5; k <= 0; k++) col.push(bf.getBlock(x, y + k, z));
    // remove the torch's support: it should pop off as an item
    bf.setBlock(x + 1, y - 5, z, 'air');
    await new Promise((r) => setTimeout(r, 1500));
    return { column: col, torchAfterSupportRemoved: bf.getBlock(x + 1, y - 4, z), items: g.entities.list.filter((e) => e.type === 'item').map((e) => e.stack.id) };
  });
  console.log(JSON.stringify(r));
};
