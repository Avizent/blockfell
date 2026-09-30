import { createWorld, waitChunks } from './lib.mjs';
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
export default async (page, h) => {
  await createWorld(page, h, { name: 'Misc', seed: '12345' });
  await waitChunks(h, 90);
  const L = (k, v) => console.log(k, JSON.stringify(v));
  // crack overlay while mining stone with bare hands
  await h.ev(() => {
    const bf = window.__bf, g = bf.game;
    const x = Math.floor(g.player.x), z = Math.floor(g.player.z), y = 100;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) bf.setBlock(x + dx, y, z + dz, 'stone');
    bf.setBlock(x, y + 1, z - 2, 'stone');
    g.teleport(x + 0.5, y + 1, z + 0.5);
    window.__bf.aimAt(x + 0.5, y + 1.5, z - 1.5);
    g.dayNight.time = 5000;
  });
  await h.wait(1500);
  await page.mouse.move(vw / 2, vh / 2);
  await page.mouse.down();
  await h.wait(3500);
  await h.shot('crack');
  await page.mouse.up();
  // bow: give bow + arrows, spawn a pig 8 blocks away, draw and release
  await h.ev(() => {
    const g = window.__bf.game;
    g.inventory.slots[0] = { id: 'bow', count: 1 }; g.inventory.slots[1] = { id: 'arrow', count: 8 }; g.inventory.selected = 0; g.inventory.changed();
    g.entities.clear(); g.rules.doMobSpawning = false;
    const m = g.entities.spawnMob('pig', g.player.x, g.player.y, g.player.z - 2.5, g);
    m.tick = function () { this.beginTick(); if (this.deathTime > 0) { this.deathTime++; if (this.deathTime > 20) this.removed = true; } };
    window.__bf.aimAt(m.x, m.y + 0.8, m.z);
  });
  await h.wait(500);
  await page.mouse.down({ button: 'right' }); await h.wait(1300); await h.shot('bow_draw'); await page.mouse.up({ button: 'right' });
  await h.wait(1500);
  L('bow', await h.ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.type === 'mob'); return { arrows: g.inventory.countItem('arrow'), pigHealth: m ? m.health : 'dead', adv: [...g.progress.done] }; }));
  // swimming: go to water
  const w = await h.ev(() => {
    const g = window.__bf.game;
    for (let r = 0; r < 200; r += 4) for (let a = 0; a < 12; a++) {
      const x = Math.floor(g.player.x + Math.cos(a) * r), z = Math.floor(g.player.z + Math.sin(a) * r);
      if (!g.world.isLoaded(x, z)) continue;
      if (g.world.getBlock(x, 60, z) === 6 && g.world.getBlock(x, 58, z) === 6) return { x, z };
    }
    return null;
  });
  L('water spot', w);
  if (w) {
    await h.ev((w) => { const g = window.__bf.game; g.inventory.selected = 2; g.inventory.changed(); g.teleport(w.x + 0.5, 60, w.z + 0.5); g.player.pitch = 0; }, w);
    await h.wait(1500);
    await h.shot('underwater');
    const y0 = (await h.state()).player.y;
    await page.keyboard.down('Space'); await h.wait(2000); await page.keyboard.up('Space');
    const y1 = (await h.state()).player.y;
    L('swim up', { y0, y1, air: await h.ev(() => window.__bf.game.player.air) });
    await h.ev(() => { window.__bf.game.player.pitch = -0.4; });
    await h.wait(800);
    await h.shot('water_surface');
  }
};
