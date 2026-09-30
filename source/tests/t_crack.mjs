import { createWorld, waitChunks } from './lib.mjs';
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
export default async (page, h) => {
  await createWorld(page, h, { name: 'Crack', seed: '12345' });
  await waitChunks(h, 60);
  await h.ev(() => {
    const bf = window.__bf, g = bf.game;
    const x = Math.floor(g.player.x), z = Math.floor(g.player.z), y = 100;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) bf.setBlock(x + dx, y, z + dz, 'stone');
    bf.setBlock(x, y + 1, z - 2, 'stone');
    g.teleport(x + 0.5, y + 1, z + 0.5);
    window.__pillar = [x, y + 1, z - 2];
    g.dayNight.time = 5000;
  });
  await page.mouse.move(vw / 2, vh / 2);
  await h.wait(1500);
  const st = await h.ev(() => { const [x, y, z] = window.__pillar; window.__bf.aimAt(x + 0.5, y + 0.5, z + 1); return window.__bf.state(); });
  console.log('target', JSON.stringify(st.target), JSON.stringify(st.player));
  await page.mouse.down();
  await h.wait(4000);
  await h.shot('crack');
  await page.mouse.up();
};
