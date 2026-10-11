// Screenshots and icons for the 2.3 guide pages: snowballs, the Snow Pal, the sledge, Fox Cubs,
// name tags, young farm animals and dyed sheep.
// node tests/guide_shots15.mjs  (dev server)  PARTS=icons,snowpal,sledge,foxes,named,tag,babies,sheep
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots15';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,snowpal,sledge,foxes,named,tag,babies,sheep').split(',');
const SEED = process.env.SEED || 'snowday23';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(250); } return false; };
const settle = async () => { await wait(600); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 120000); await wait(800); };
const ticks = async (n = 3) => { const t0 = await ev(() => window.__bf.game?.tickCount ?? 0); await waitFor(async () => (await ev(() => window.__bf.game?.tickCount ?? 0)) >= t0 + n, 8000); };
const shot = async (name, hud = false) => { await ev((hud) => window.__bf.ui.set({ toasts: [], chat: [], heldName: null, hideHud: !hud }), hud); await wait(500); await page.screenshot({ path: `${OUT}/${name}.png` }); await ev(() => window.__bf.ui.set({ hideHud: false })); console.log('shot', name); };
const quiet = () => ev(() => {
  const g = window.__bf.game;
  g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false;
  g.weather.set('clear', 99999, true); g.dayNight.time = 4500;
  for (const e of g.entities.list) if (e.mobType || e.type === 'item') e.removed = true;
});
/** No block outline and an empty hand in the pictures. */
const clean = () => ev(() => { const g = window.__bf.game; g.reach = () => 0.0001; g.inventory.slots[8] = null; g.inventory.selected = 8; g.inventory.changed(); });
/** Stand (flying) at a spot and look at a point. */
const view = async (from, at, fly = true) => {
  await ev(([f, a, fly]) => { const g = window.__bf.game, p = g.player; p.flying = fly; g.teleport(f[0], f[1], f[2]); p.vx = p.vy = p.vz = 0; window.__bf.aimAt(a[0], a[1], a[2]); }, [from, at, fly]);
  await settle(); await ticks(4);
};
/** Spawns a creature that holds still (and, by default, faces `yaw`). */
const still = (t, x, y, z, yaw, setup = '') => ev(([t, x, y, z, yaw, setup]) => {
  const g = window.__bf.game, m = g.entities.spawnMob(t, x, y, z, g);
  m.yaw = m.prevYaw = yaw;
  // eslint-disable-next-line no-new-func
  if (setup) new Function('m', 'g', setup)(m, g);
  m.tick = function () { this.beginTick(); this.prevLimbAmount = this.limbAmount = 0; };
  return m.id;
}, [t, x, y, z, yaw, setup]);
const ground = (x, z) => ev(([x, z]) => window.__bf.game.world.highestSolid(Math.floor(x), Math.floor(z)) + 1, [x, z]);

await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(1200);

if (PARTS.includes('icons')) {
  const ids = ['snowball', 'shears', 'name_tag', 'sledge', 'spawn_fox', 'spawn_snowpal', 'snow', 'coal', 'carrot', 'apple', 'wheat', 'wheat_seeds',
    'raw_trout', 'string', 'leather', 'iron_ingot', 'pink_dye', 'planks', 'stick', 'snowy_grass'];
  const out = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const res = {};
    for (const id of ids) {
      const st = ic.style(id);
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      res[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return res;
  }, ids);
  for (const [id, url] of Object.entries(out)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(out).length);
}

// a creative world
await page.click('[data-testid=btn-singleplayer]');
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Snow Pictures');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await settle();
await quiet();
await clean();
const HOME = await ev(() => { const p = window.__bf.game.player; return { x: Math.floor(p.x), z: Math.floor(p.z) }; });

// the nearest snowy lands, on a gentle bit of ground
let SNOW = null;
if (PARTS.some((p) => ['snowpal', 'sledge', 'foxes', 'named', 'tag'].includes(p))) {
  SNOW = await ev(async (H) => {
    const g = window.__bf.game;
    for (let r = 64; r < 4000; r += 48) {
      for (let a = 0; a < 48; a++) {
        const x = Math.floor(H.x + Math.cos(a / 48 * Math.PI * 2) * r), z = Math.floor(H.z + Math.sin(a / 48 * Math.PI * 2) * r);
        const c = g.world.generator.column(x, z);
        if (c.biome !== 6) continue;
        let ok = true;
        for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, -6]]) {
          const cc = g.world.generator.column(x + dx, z + dz);
          if (cc.biome !== 6 || Math.abs(cc.height - c.height) > 3) ok = false;
        }
        if (ok) return { x, z, h: c.height };
      }
    }
    return null;
  }, HOME);
  console.log('snowy lands at', SNOW);
  await ev((S) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(S.x + 0.5, S.h + 6, S.z + 0.5); }, SNOW);
  await settle();
  await quiet();
}

if (PARTS.includes('snowpal')) {
  // a cleared patch of snowy grass with a Snow Pal on the right and a Shambler coming from the left
  const P = await ev((S) => {
    const bf = window.__bf, g = bf.game;
    const x = S.x, z = S.z, y = g.world.highestSolid(x, z) + 1;
    for (let dx = -9; dx <= 9; dx++) for (let dz = -6; dz <= 6; dz++) {
      bf.setBlock(x + dx, y - 1, z + dz, 'snowy_grass'); bf.setBlock(x + dx, y - 2, z + dz, 'dirt');
      for (let dy = 0; dy <= 8; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    return { x, y, z };
  }, SNOW);
  const pal = await ev((P) => { const g = window.__bf.game, m = g.entities.spawnMob('snowpal', P.x + 2.5, P.y, P.z + 0.5, g); m.yaw = m.prevYaw = Math.PI / 2; return m.id; }, P);
  const sh = await still('shambler', P.x - 3.5, P.y, P.z + 0.5, -Math.PI / 2, 'm.chasing = true;');
  await ev(([sh]) => { const m = window.__bf.game.entities.list.find((e) => e.id === sh); m.tick = function (h) { this.tickCommon(h); this.prevLimbAmount = this.limbAmount = 0.6; this.limbPhase += 0.2; }; }, [sh]);
  await view([P.x - 0.3, P.y + 0.75, P.z + 3.7], [P.x - 0.5, P.y + 1.15, P.z + 0.5]);
  const got = await ev(([P]) => {
    const g = window.__bf.game;
    for (let i = 0; i < 400; i++) {
      g.tick();
      const ball = g.entities.list.find((e) => e.type === 'snowball' && !e.removed);
      if (ball && ball.x < P.x - 0.2) {
        for (const e of g.entities.list) if (e.mobType || e.type === 'snowball') e.tick = function () { this.beginTick(); };
        return true;
      }
    }
    return false;
  }, [P]);
  console.log('snowball in flight', got);
  await wait(400);
  await shot('sd01_snowpal');
  await ev(() => { const g = window.__bf.game; for (const e of g.entities.list) if (e.mobType || e.type === 'snowball') e.removed = true; });
  void pal;
}

if (PARTS.includes('sledge')) {
  // a natural snowy hillside: 28 blocks in a straight line, always going down (never more than 2 at a step), 6-16 blocks in all, no trees
  const R = await ev((S) => {
    const bf = window.__bf, g = bf.game;
    const dirs = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
    let best = null;
    for (let ox = -96; ox <= 96; ox += 4) for (let oz = -96; oz <= 96; oz += 4) for (const [dx, dz, yaw] of dirs) {
      const x0 = S.x + ox, z0 = S.z + oz;
      if (g.world.generator.column(x0, z0).biome !== 6) continue;
      let prev = g.world.generator.column(x0, z0).height, ok = true, drop = 0;
      for (let i = 1; i <= 28 && ok; i++) {
        const c = g.world.generator.column(x0 + dx * i, z0 + dz * i);
        const d = prev - c.height;
        if (d < 0 || d > 2 || c.biome !== 6) ok = false;
        drop += d; prev = c.height;
      }
      if (ok && drop >= 6 && drop <= 16 && (!best || drop > best.drop)) best = { x: x0, z: z0, dx, dz, yaw, drop };
    }
    return best;
  }, SNOW);
  console.log('slope', R);
  await ev((R) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(R.x + 0.5, g.world.generator.column(R.x, R.z).height + 4, R.z + 0.5); }, R);
  await settle();
  // clear the run (trees, tall grass) and snow it over, 5 wide
  const P = await ev((R) => {
    const bf = window.__bf, g = bf.game;
    for (let i = -2; i <= 30; i++) for (let w = -2; w <= 2; w++) {
      const x = R.x + R.dx * i + (R.dz ? w : 0), z = R.z + R.dz * i + (R.dx ? w : 0);
      const h = g.world.generator.column(x, z).height;
      for (let y = h + 1; y <= h + 12; y++) bf.setBlock(x, y, z, 'air');
      bf.setBlock(x, h, z, 'snowy_grass');
    }
    const y = g.world.generator.column(R.x, R.z).height + 1;
    return { x: R.x, y, z: R.z };
  }, R);
  await settle();
  await ev(([P, R]) => { const g = window.__bf.game, p = g.player; p.flying = false; g.teleport(P.x + 0.5 - R.dx * 2, P.y, P.z + 0.5 - R.dz * 2); const s = g.entities.spawnSledge(P.x + 0.5, P.y, P.z + 0.5, R.yaw); g.mount(s, true); g.autopilot = { forward: 1 }; }, [P, R]);
  // ride down until it is going fast
  const sp = await ev(() => { const g = window.__bf.game; let i = 0; for (; i < 600; i++) { g.tick(); const b = g.riding; if (b && Math.hypot(b.vx, b.vz) > 0.4 && b.onSnow && i > 40) break; } const b = g.riding; return { i, sp: b ? Math.hypot(b.vx, b.vz) : -1 }; });
  console.log('sledge', sp);
  await ev(() => { const g = window.__bf.game, b = g.riding, f = [-Math.sin(b.yaw), -Math.cos(b.yaw)]; window.__bf.aimAt(b.x + f[0] * 5, b.y - 0.6, b.z + f[1] * 5); });
  await ticks(4);
  await ev(() => { const g = window.__bf.game; g.autopilot = null; const s = g.riding; s.tick = function (h) { this.beginTick(); if (this.age % 2 === 0) h.effect('snow', this.x + Math.sin(this.yaw) * 0.8, this.y + 0.1, this.z + Math.cos(this.yaw) * 0.8, 3); }; });
  await wait(600);
  await shot('sd02_sledge');
  await ev(() => { const g = window.__bf.game; g.dismount(); for (const e of g.entities.list) if (e.type === 'sledge') e.removed = true; });
}

if (PARTS.includes('foxes') || PARTS.includes('named') || PARTS.includes('tag')) {
  const P = await ev((S) => {
    const bf = window.__bf, g = bf.game;
    const x = S.x - 4, z = S.z + 18, y = g.world.highestSolid(x, z) + 1;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      bf.setBlock(x + dx, y - 1, z + dz, 'snowy_grass');
      for (let dy = 0; dy <= 6; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    return { x, y, z };
  }, SNOW);
  if (PARTS.includes('foxes')) {
    const a = await still('fox', P.x - 0.3, P.y, P.z + 0.6, Math.PI / 2 + 0.45, "m.setCoat('red');");
    const bb = await still('fox', P.x + 1.4, P.y, P.z - 0.1, Math.PI + 0.75, "m.setCoat('snow');");
    await view([P.x + 0.6, P.y + 0.7, P.z + 2.6], [P.x + 0.6, P.y + 0.35, P.z + 0.2], false);
    await shot('fx01_foxes');
    await ev(([a, b]) => { for (const e of window.__bf.game.entities.list) if (e.id === a || e.id === b) e.removed = true; }, [a, bb]);
  }
  if (PARTS.includes('named')) {
    const f = await still('fox', P.x + 0.5, P.y, P.z + 0.5, Math.PI - 1.0, "m.setCoat('red'); m.tame(); m.sitting = true; m.nameTag = 'Pip';");
    await view([P.x + 0.5, P.y + 0.6, P.z + 2.4], [P.x + 0.5, P.y + 0.55, P.z + 0.5], false);
    await shot('fx02_named');
    if (!PARTS.includes('tag')) await ev((id) => { window.__bf.game.entities.list.find((e) => e.id === id).removed = true; }, f);
  }
  if (PARTS.includes('tag')) {
    let f = await ev(() => window.__bf.game.entities.list.find((e) => e.mobType === 'fox')?.id ?? null);
    if (!f) f = await still('fox', P.x + 0.5, P.y, P.z + 0.5, 0.5, 'm.tame();');
    await ev((id) => { const m = window.__bf.game.entities.list.find((e) => e.id === id); m.nameTag = null; m.sitting = true; }, f);
    await view([P.x + 0.5, P.y, P.z + 3.0], [P.x + 0.5, P.y + 0.3, P.z + 0.5], false);
    await ev(() => { const g = window.__bf.game; delete g.reach; g.inventory.slots[0] = { id: 'name_tag', count: 1 }; g.inventory.selected = 0; g.inventory.changed(); });
    await page.mouse.move(640, 360); await ticks(2);
    await ev(([P]) => window.__bf.aimAt(P.x + 0.5, P.y + 0.3, P.z + 0.5), [P]);
    await ticks(2);
    await page.mouse.click(640, 360, { button: 'right' });
    await waitFor(() => ev(() => window.__bf.ui.get().overlay === 'nametag'), 5000);
    await page.fill('[data-testid=nametag-input]', 'Pip');
    await wait(400);
    await page.screenshot({ path: `${OUT}/fx03_tag.png` });
    console.log('shot fx03_tag');
    await ev(() => window.__bf.engine.closeOverlay());
    await ev(() => { for (const e of window.__bf.game.entities.list) if (e.mobType) e.removed = true; });
    await clean();
  }
}

// back to the green meadows round the spawn point
if (PARTS.includes('babies') || PARTS.includes('sheep')) {
  await ev((H) => { const g = window.__bf.game, p = g.player; p.flying = true; g.teleport(H.x + 0.5, g.world.highestSolid(H.x, H.z) + 4, H.z + 0.5); }, HOME);
  await settle();
  await quiet();
  const P = await ev((H) => {
    // the nearest flat grassy spot (13 x 13)
    const bf = window.__bf, g = bf.game;
    let best = null;
    for (let r = 0; r < 64 && !best; r += 3) for (let a = 0; a < 24 && !best; a++) {
      const cx = Math.floor(H.x + Math.cos(a / 24 * Math.PI * 2) * r), cz = Math.floor(H.z + Math.sin(a / 24 * Math.PI * 2) * r);
      const h = g.world.highestSolid(cx, cz);
      let ok = h > 60;
      for (let dx = -6; dx <= 6 && ok; dx += 2) for (let dz = -6; dz <= 6 && ok; dz += 2) {
        const hh = g.world.highestSolid(cx + dx, cz + dz);
        if (Math.abs(hh - h) > 1 || bf.getBlock(cx + dx, hh, cz + dz) !== 'grass') ok = false;
      }
      if (ok) best = { x: cx, z: cz, h };
    }
    if (!best) best = { x: H.x, z: H.z, h: g.world.highestSolid(H.x, H.z) };
    const x = best.x, z = best.z, y = best.h + 1;
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
      bf.setBlock(x + dx, y - 1, z + dz, 'grass');
      for (let dy = 0; dy <= 5; dy++) bf.setBlock(x + dx, y + dy, z + dz, 'air');
    }
    return { x, y, z };
  }, HOME);
  if (PARTS.includes('babies')) {
    const ids = [];
    ids.push(await still('sheep', P.x - 3.2, P.y, P.z - 0.8, -0.6));
    ids.push(await still('sheep', P.x - 2.1, P.y, P.z + 1.1, -0.9, 'm.makeBaby();'));
    ids.push(await still('pig', P.x - 0.2, P.y, P.z - 1.6, 0.3));
    ids.push(await still('pig', P.x + 0.4, P.y, P.z + 0.5, 0.1, 'm.makeBaby();'));
    ids.push(await still('cow', P.x + 2.6, P.y, P.z - 1.3, 0.7));
    ids.push(await still('cow', P.x + 2.4, P.y, P.z + 1.0, 0.9, 'm.makeBaby();'));
    ids.push(await still('chicken', P.x + 4.6, P.y, P.z + 0.6, 1.2));
    ids.push(await still('chicken', P.x + 4.0, P.y, P.z + 1.8, 1.0, 'm.makeBaby();'));
    await view([P.x + 0.7, P.y + 0.75, P.z + 4.9], [P.x + 0.6, P.y + 0.55, P.z - 0.2], false);
    await shot('fa01_babies');
    await ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.removed = true; }, ids);
  }
  if (PARTS.includes('sheep')) {
    const cols = ['red', 'orange', 'yellow', 'lime', 'light_blue', 'blue', 'purple', 'pink', 'white', 'black', 'cyan', 'magenta'];
    const ids = [];
    for (let i = 0; i < cols.length; i++) {
      const row = i < 6 ? 0 : 1;
      const x = P.x - 4.6 + (i % 6) * 1.75 + (row ? 0.8 : 0), z = P.z - 1.8 + row * 1.9;
      ids.push(await still('sheep', x, P.y, z, 0.25 - (i % 6) * 0.08, `m.setWool('${cols[i]}', false);`));
    }
    ids.push(await still('sheep', P.x + 3.2, P.y, P.z + 2.2, 0.6, "m.setWool('light_blue', true);"));
    await view([P.x + 0.4, P.y + 1.35, P.z + 5.6], [P.x + 0.2, P.y + 0.6, P.z + 0.2], false);
    await ev(() => { const g = window.__bf.game; g.inventory.slots[0] = { id: 'shears', count: 1 }; g.inventory.selected = 0; g.inventory.changed(); });
    await shot('fa02_sheep');
    await ev((ids) => { for (const e of window.__bf.game.entities.list) if (ids.includes(e.id)) e.removed = true; }, ids);
  }
}

await b.close();
