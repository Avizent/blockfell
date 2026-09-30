import { createWorld, waitChunks } from './lib.mjs';
// visual tour: biomes, caves, torches, held items
export default async (page, h) => {
  await h.wait(4000);
  await h.shot('v_title');
  await page.click('text=Options...');
  await h.wait(500);
  await h.shot('v_options');
  await page.click('[data-testid=btn-options-done]');
  await createWorld(page, h, { name: 'Tour', seed: '2024', creative: true });
  await waitChunks(h, 90);
  const find = async (biome) => h.ev((biome) => {
    const g = window.__bf.game, gen = g.world.generator;
    for (let r = 0; r < 3000; r += 24) for (let a = 0; a < 16; a++) {
      const x = Math.floor(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.floor(Math.sin(a / 16 * Math.PI * 2) * r);
      const c = gen.column(x, z);
      if (['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Mountains', 'Snowy Peaks', 'River'][c.biome] === biome) return { x, z, h: c.height };
    }
    return null;
  }, biome);
  for (const b of ['Mountains', 'Desert', 'Snowy Peaks', 'Plains']) {
    const p = await find(b);
    console.log(b, JSON.stringify(p));
    if (!p) continue;
    await h.ev((p) => { const g = window.__bf.game; g.player.flying = true; g.teleport(p.x + 0.5, p.h + 12, p.z + 0.5); g.player.pitch = -0.3; g.dayNight.time = 4000; }, p);
    await h.wait(1000);
    await waitChunks(h, 60);
    await h.wait(1500);
    await h.shot('v_' + b.replace(' ', '_'));
  }
  // cave with torches
  await h.ev(() => {
    const bf = window.__bf, g = bf.game;
    const x = Math.floor(g.player.x), z = Math.floor(g.player.z);
    const y = 30;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = 0; dy < 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, dy === 0 ? 'stone' : 'air');
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) bf.setBlock(x + dx, y + 5, z + dz, 'stone');
    bf.setBlock(x + 3, y + 1, z - 4, 'torch');
    bf.setBlock(x - 4, y + 1, z - 3, 'coal_ore'); bf.setBlock(x - 4, y + 2, z - 4, 'iron_ore');
    g.player.flying = false; g.teleport(x + 0.5, y + 1, z + 3.5); g.player.yaw = 0; g.player.pitch = -0.2;
    g.inventory.slots[0] = { id: 'torch', count: 64 }; g.inventory.selected = 0; g.inventory.changed();
  });
  await h.wait(3000);
  await h.shot('v_cave');
  await h.ev(() => { const g = window.__bf.game; g.inventory.slots[0] = { id: 'iron_sword', count: 1 }; g.inventory.changed(); });
  await h.wait(1200);
  await h.shot('v_sword');
  await h.ev(() => { const g = window.__bf.game; g.inventory.slots[0] = { id: 'apple', count: 1 }; g.inventory.changed(); });
  await h.wait(1200);
  await h.shot('v_apple');
};
