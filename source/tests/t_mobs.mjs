import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Mobs', seed: 'blockfell', creative: true });
  await waitChunks(h, 90);
  await h.ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    g.entities.clear();
    g.entities.mobSpawning = false;
    g.rules.doMobSpawning = false;
    const types = ['pig', 'cow', 'sheep', 'chicken', 'shambler', 'skeleton'];
    // flat platform in front of the player
    const y = Math.floor(p.y) - 1;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -9; dz <= -2; dz++) { bf.setBlock(Math.floor(p.x) + dx, y, Math.floor(p.z) + dz, 'grass'); for (let k = 1; k < 4; k++) bf.setBlock(Math.floor(p.x) + dx, y + k, Math.floor(p.z) + dz, 'air'); }
    types.forEach((t, i) => { const m = g.entities.spawnMob(t, p.x - 5 + i * 2, y + 1, p.z - 5, g); m.persistent = true; m.yaw = 0.4; });
    p.yaw = 0; p.pitch = -0.25;
    g.dayNight.time = 5000;
  });
  await h.wait(3500);
  await h.shot('mobs_lineup');
  await h.ev(() => { window.__bf.game.dayNight.time = 18000; });
  await h.wait(1500);
  await h.shot('mobs_night');
};
