import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Mobs', seed: 'blockfell', creative: true });
  await waitChunks(h, 90);
  const types = ['pig', 'cow', 'sheep', 'chicken', 'shambler', 'skeleton'];
  await h.ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    g.entities.clear(); g.rules.doMobSpawning = false; g.dayNight.time = 5000;
    const y = Math.floor(p.y) - 1;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -6; dz <= -1; dz++) { bf.setBlock(Math.floor(p.x) + dx, y, Math.floor(p.z) + dz, 'grass'); for (let k = 1; k < 5; k++) bf.setBlock(Math.floor(p.x) + dx, y + k, Math.floor(p.z) + dz, 'air'); }
    p.yaw = 0; p.pitch = -0.2;
  });
  for (let i = 0; i < types.length; i++) {
    await h.ev((t) => {
      const g = window.__bf.game, p = g.player;
      g.entities.clear();
      const m = g.entities.spawnMob(t, p.x, Math.floor(p.y), p.z - 3.2, g);
      m.persistent = true; m.yaw = Math.PI * 0.85; m.prevYaw = m.yaw;
      m.tick = function () { this.beginTick(); };
    }, types[i]);
    await h.wait(1200);
    await h.shot('mob_' + types[i]);
  }
};
