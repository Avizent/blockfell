import { createWorld, waitChunks } from './lib.mjs';
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
export default async (page, h) => {
  await createWorld(page, h, { name: 'Systems QA', seed: '777' });
  await waitChunks(h, 90);
  const L = (k, v) => console.log(k, JSON.stringify(v));
  // flat test arena high in the sky (avoids terrain interference)
  await h.ev(() => {
    const bf = window.__bf, g = bf.game;
    const cx = Math.floor(g.player.x), cz = Math.floor(g.player.z), y = 100;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) bf.setBlock(cx + dx, y, cz + dz, 'stone');
    g.teleport(cx + 0.5, y + 1, cz + 0.5);
    g.player.yaw = 0; g.player.pitch = 0;
    g.rules.doMobSpawning = false; g.entities.clear();
    window.__arena = { cx, cz, y };
  });
  await h.wait(3000);
  // --- sprint on flat ground
  await page.keyboard.down('ControlLeft'); await page.keyboard.down('KeyW'); await h.wait(1200);
  L('sprinting (flat)', (await h.state()).player.sprinting);
  await page.keyboard.up('KeyW'); await page.keyboard.up('ControlLeft');
  await h.wait(500);
  // --- sneak edge protection: walk off the arena edge while sneaking
  const edge = await h.ev(async () => {
    const g = window.__bf.game, a = window.__arena;
    g.teleport(a.cx + 0.5, a.y + 1, a.cz + 11.5);
    g.player.yaw = Math.PI; // facing +Z (south) towards the edge
    await new Promise((r) => setTimeout(r, 300));
    g.autopilot = { forward: 1, strafe: 0, jump: false, sneak: true, sprint: false };
    await new Promise((r) => setTimeout(r, 2500));
    g.autopilot = null;
    return { z: g.player.z, y: g.player.y, edgeZ: a.cz + 13 };
  });
  L('sneak edge (should stay on arena, y=101)', edge);
  // --- fall damage
  const fall = await h.ev(async () => {
    const g = window.__bf.game, a = window.__arena;
    g.teleport(a.cx + 0.5, a.y + 11, a.cz + 0.5);
    await new Promise((r) => setTimeout(r, 2500));
    return { health: g.player.health };
  });
  L('health after 10-block fall (expect 13)', fall);
  // --- eating: set food low, eat an apple by holding right click
  await h.ev(() => { const g = window.__bf.game; g.player.food = 10; g.inventory.slots[0] = { id: 'apple', count: 2 }; g.inventory.selected = 0; g.inventory.changed(); });
  await page.mouse.move(vw / 2, vh / 2);
  await page.mouse.down({ button: 'right' }); await h.wait(2400); await page.mouse.up({ button: 'right' });
  L('food after eating apple (expect 14)', await h.ev(() => ({ food: window.__bf.game.player.food, apples: window.__bf.game.inventory.get(0) })));
  // --- furnace: place, load raw iron + coal, wait for smelting
  const fur = await h.ev(async () => {
    const bf = window.__bf, g = bf.game, a = window.__arena;
    const x = a.cx + 2, y = a.y + 1, z = a.cz - 2;
    bf.setBlock(x, y, z, 'furnace');
    const key = `${x},${y},${z}`;
    g.openBlockUI(x, y, z, 'furnace');
    const be = g.world.blockEntities.get(key);
    be.items[0] = { id: 'raw_iron', count: 2 };
    be.items[1] = { id: 'coal', count: 1 };
    window.__bf.engine.closeOverlay();
    await new Promise((r) => setTimeout(r, 22000));
    return { items: be.items, block: bf.getBlock(x, y, z), burn: be.burnTime };
  });
  L('furnace after 22 s (2 raw iron -> 2 ingots, lit)', fur);
  // --- chest: store items, save & reload later
  await h.ev(() => {
    const bf = window.__bf, g = bf.game, a = window.__arena;
    bf.setBlock(a.cx - 2, a.y + 1, a.cz - 2, 'chest');
    g.openBlockUI(a.cx - 2, a.y + 1, a.cz - 2, 'chest');
    g.world.blockEntities.get(`${a.cx - 2},${a.y + 1},${a.cz - 2}`).items[4] = { id: 'diamond_none', count: 0 };
    g.world.blockEntities.get(`${a.cx - 2},${a.y + 1},${a.cz - 2}`).items[4] = { id: 'iron_ingot', count: 7 };
  });
  await h.wait(500);
  await h.shot('chest_ui');
  await h.ev(() => window.__bf.engine.closeOverlay());
  // --- hostile AI: spawn a shambler 6 blocks away at night; it should approach and hit
  const ai = await h.ev(async () => {
    const bf = window.__bf, g = bf.game, a = window.__arena;
    g.dayNight.time = 18000;
    g.teleport(a.cx + 0.5, a.y + 1, a.cz + 0.5);
    g.player.health = 20;
    const m = g.entities.spawnMob('shambler', a.cx + 0.5, a.y + 1, a.cz - 7.5, g);
    const d0 = Math.hypot(m.x - g.player.x, m.z - g.player.z);
    await new Promise((r) => setTimeout(r, 6000));
    return { d0, d1: Math.hypot(m.x - g.player.x, m.z - g.player.z), health: g.player.health };
  });
  L('shambler chase (d1 small, health < 20)', ai);
  await h.shot('shambler_attack');
  // --- melee the shambler until it dies
  await h.ev(() => { const g = window.__bf.game; g.inventory.slots[1] = { id: 'iron_sword', count: 1 }; g.inventory.selected = 1; g.inventory.changed(); });
  for (let i = 0; i < 12; i++) {
    await h.ev(() => { const g = window.__bf.game; const m = g.entities.list.find((e) => e.type === 'mob' && e.alive); if (m) window.__bf.aimAt(m.x, m.y + 1.2, m.z); });
    await page.mouse.click(vw / 2, vh / 2);
    await h.wait(600);
  }
  L('after combat', await h.ev(() => ({ mobs: window.__bf.game.entities.list.filter((e) => e.type === 'mob').length, kills: window.__bf.game.progress.stats.mobs_killed, items: window.__bf.game.entities.list.filter((e) => e.type === 'item').map((e) => e.stack.id) })));
  // --- death & respawn
  await h.ev(() => { const g = window.__bf.game; g.dayNight.time = 6000; g.player.invulnerable = 0; g.damagePlayer(40, { x: g.player.x, y: g.player.y, z: g.player.z, kind: 'void' }); });
  await h.wait(800);
  L('overlay after lethal damage', (await h.state()).overlay);
  await h.shot('death_screen');
  await page.click('[data-testid=btn-respawn]');
  await h.wait(1500);
  L('after respawn', (await h.state()).player);
  // --- save & reload: chest contents, furnace output, modified blocks persist
  await h.ev(() => window.__bf.allowUnlocked(true));
  await page.keyboard.press('Escape'); await h.wait(400);
  await page.click('[data-testid=btn-save-quit]');
  for (let i = 0; i < 30; i++) { if ((await h.state()).screen === 'title') break; await h.wait(500); }
  await page.click('[data-testid=btn-singleplayer]');
  await h.wait(600);
  await page.click('[data-testid=world-entry]');
  await page.click('[data-testid=btn-play-selected]');
  for (let i = 0; i < 60; i++) { if ((await h.state()).screen === 'game') break; await h.wait(1000); }
  await h.wait(3000);
  L('after reload', await h.ev(() => {
    const bf = window.__bf, g = bf.game;
    const ents = [...g.world.blockEntities.entries()].map(([k, v]) => [k, v.type, v.items.filter(Boolean).map((s) => s.id + 'x' + s.count)]);
    return { ents, deltas: g.world.deltas.size };
  }));
};
