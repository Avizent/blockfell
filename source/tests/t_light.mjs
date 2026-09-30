import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Light', seed: '2024', creative: true });
  await waitChunks(h, 90);
  const r = await h.ev(async () => {
    const bf = window.__bf, g = bf.game;
    const x = Math.floor(g.player.x), z = Math.floor(g.player.z), y = 30;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = 0; dy < 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, dy === 0 ? 'stone' : 'air');
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) bf.setBlock(x + dx, y + 5, z + dz, 'stone');
    bf.setBlock(x + 3, y + 1, z - 4, 'torch');
    g.player.flying = false; g.teleport(x + 0.5, y + 1, z + 3.5);
    await new Promise((r) => setTimeout(r, 4000));
    const out = [];
    for (let d = 0; d <= 8; d++) out.push(g.world.getLight(x + 3, y + 1, z - 4 + d) & 15);
    const c = g.world.getChunk((x + 3) >> 4, (z - 4) >> 4);
    return { blockLightAlongZ: out, chunk: { v: c.version, mv: c.meshedVersion }, torchBlock: bf.getBlock(x + 3, y + 1, z - 4) };
  });
  console.log(JSON.stringify(r));
};
