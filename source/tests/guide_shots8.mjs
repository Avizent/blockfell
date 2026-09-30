// Screenshots and item icons for the 1.7 guide pages: lava and dungeons.
// node tests/guide_shots8.mjs  (dev server)     PARTS=icons,cavern,meet,dungeon  SEED=lava
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots8';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,cavern,meet,dungeon').split(',');
const SEED = process.env.SEED || 'lava';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
const shot = async (name) => { await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const settle = async () => { await wait(1200); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(1200); };
const fast = (n) => ev((n) => { const g = window.__bf.game; for (let i = 0; i < n; i++) g.tick(); }, n);
const hold = (id) => ev((id) => { const g = window.__bf.game, inv = g.inventory; inv.slots.fill(null); const hot = [id, 'iron_pickaxe', 'torch', 'water_bucket', 'bread', 'cobblestone', 'lava_bucket', 'bucket', 'iron_sword']; hot.forEach((h, i) => { if (h) inv.slots[i] = { id: h, count: ['torch', 'bread', 'cobblestone'].includes(h) ? 24 : 1 }; }); inv.selected = 0; inv.changed(); }, id);
const go = async (x, y, z, ax, ay, az) => {
  await ev(([x, y, z]) => { const g = window.__bf.game; g.player.flying = true; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; }, [x, y, z]);
  await waitFor(() => ev(([x, z]) => { const w = window.__bf.game.world; return w.isLoaded(x + 24, z + 24) && w.isLoaded(x - 24, z - 24) && w.isLoaded(x + 24, z - 24) && w.isLoaded(x - 24, z + 24); }, [x, z]), 60000);
  await ev(([ax, ay, az]) => window.__bf.aimAt(ax, ay, az), [ax, ay, az]);
};

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Guide 1.7');
await page.fill('[data-testid=world-seed]', SEED);
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await page.mouse.move(640, 360);
await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.reach = () => 0.01; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); g.dayNight.time = 4500; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
await wait(2500);

if (PARTS.includes('icons')) {
  const ICON_IDS = ['lava_bucket', 'cinderstone', 'spawner', 'mossy_cobblestone', 'bucket'];
  const icons = await ev(async (ids) => {
    const bf = window.__bf, ic = bf.engine.icons, old = ic.scale;
    ic.build(6);
    const img = new Image();
    img.src = ic.sheetUrl;
    await img.decode();
    const out = {};
    for (const id of ids) {
      const st = ic.style(id);
      const [px, py] = String(st.backgroundPosition).split(' ').map((v) => -parseFloat(v));
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      c.getContext('2d').drawImage(img, px * 6, py * 6, 96, 96, 0, 0, 96, 96);
      out[id] = c.toDataURL('image/png');
    }
    ic.build(old);
    return out;
  }, ICON_IDS);
  for (const [id, url] of Object.entries(icons)) fs.writeFileSync(`${ICONS}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons', Object.keys(icons).length);
}

// ---- 1. a great lava lake at the bottom of a cavern
if (PARTS.includes('cavern')) {
  const C = await ev(() => {
    const g = window.__bf.game, B = window.__bf.B, gen = g.world.generator;
    const pcx = Math.floor(g.player.x / 16), pcz = Math.floor(g.player.z / 16);
    let best = null;
    for (let cx = pcx - 6; cx <= pcx + 6; cx++) for (let cz = pcz - 6; cz <= pcz + 6; cz++) {
      const b = gen.generateChunk(cx, cz).blocks;
      let n = 0, sx = 0, sz = 0;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const i = (10 << 8) | (z << 4) | x;
        if (!B.IS_LAVA[b[i]]) continue;
        let open = 0;
        for (let y = 11; y <= 17; y++) if (b[(y << 8) | (z << 4) | x] === B.AIR) open++;
        if (open >= 6) { n++; sx += x; sz += z; }
      }
      if (n > (best?.n ?? 20)) best = { n, x: cx * 16 + Math.round(sx / n), z: cz * 16 + Math.round(sz / n) };
    }
    return best;
  });
  console.log('cavern', JSON.stringify(C));
  if (C) {
    // stand back from the middle of the lake, in open air, looking across it
    const spot = await ev((C) => {
      const g = window.__bf.game, B = window.__bf.B, gen = g.world.generator;
      for (let r = 6; r >= 2; r--) for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(C.x + Math.cos(ang) * r), z = Math.round(C.z + Math.sin(ang) * r);
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
        const b = gen.generateChunk(cx, cz).blocks;
        const lx = x - cx * 16, lz = z - cz * 16;
        let ok = true;
        for (let y = 12; y <= 16; y++) if (b[(y << 8) | (lz << 4) | lx] !== B.AIR) ok = false;
        if (ok) return { x, z };
      }
      return { x: C.x, z: C.z };
    }, C);
    await go(spot.x + 0.5, 13.4, spot.z + 0.5, C.x + 0.5, 10.6, C.z + 0.5);
    await hold('water_bucket');
    await settle();
    await ev(() => { window.__bf.game.player.pitch = Math.max(window.__bf.game.player.pitch, -0.42); });
    await wait(1500);
    await shot('l01_cavern');
  }
}

// ---- 2. water meets lava: Cinderstone and cobblestone, with steam
if (PARTS.includes('meet')) {
  const S = await ev(() => {
    const bf = window.__bf, g = bf.game, p = g.player;
    const x0 = Math.floor(p.x) + 6, z0 = Math.floor(p.z), y = g.world.generator.column(x0, z0).height + 1;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      for (let k = -3; k < 0; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'stone');
      bf.setBlock(x0 + dx, y - 1, z0 + dz, 'grass');
      for (let k = 0; k <= 8; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air');
    }
    // a stone basin 9 x 5, one deep, sunk into the grass
    for (let dx = -5; dx <= 5; dx++) for (let dz = -3; dz <= 3; dz++) {
      const edge = Math.abs(dx) === 5 || Math.abs(dz) === 3;
      bf.setBlock(x0 + dx, y - 2, z0 + dz, 'stone');
      bf.setBlock(x0 + dx, y - 1, z0 + dz, edge ? 'stone' : 'air');
    }
    // lava fills the left part; a water source waits at the right end
    for (let dx = -4; dx <= -1; dx++) for (let dz = -2; dz <= 2; dz++) bf.setBlock(x0 + dx, y - 1, z0 + dz, 'lava');
    return { x: x0, y: y - 1, z: z0 };
  }, null);
  await go(S.x + 0.5, S.y + 5.2, S.z + 7.5, S.x + 0.5, S.y, S.z);
  await hold('water_bucket');
  await settle();
  // water poured against the pool: a ragged front, so the lava it touches sets into a jagged line of Cinderstone.
  // Everything is placed in one go (no tick in between), so the lava has no time to flow first.
  await ev((S) => {
    const bf = window.__bf;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -2; dz <= 2; dz++) bf.setBlock(S.x + dx, S.y, S.z + dz, 'air');
    const front = { '-2': -1, '-1': 0, '0': 0, '1': -1, '2': 0 };
    for (let dz = -2; dz <= 2; dz++) for (let dx = -4; dx <= 4; dx++) bf.setBlock(S.x + dx, S.y, S.z + dz, dx >= front[dz] ? 'water' : 'lava');
  }, S);
  for (let i = 0; i < 4; i++) { await fast(5); await wait(120); }
  await settle();
  await fast(2);
  const got = await ev((S) => { const bf = window.__bf; const o = {}; for (let dx = -4; dx <= 4; dx++) for (let dz = -2; dz <= 2; dz++) { const k = bf.getBlock(S.x + dx, S.y, S.z + dz); o[k] = (o[k] || 0) + 1; } return o; }, S);
  console.log('meet', JSON.stringify(got));
  await shot('l02_meet');
}

// ---- 3. a dungeon: lit with two lanterns, the cage, a chest; then the cage up close
if (PARTS.includes('dungeon')) {
  const list = await ev(() => {
    const bf = window.__bf, g = bf.game, B = bf.B;
    // measure each room in the generated chunk (interior width along x and z)
    return bf.dungeons(7).map((d) => {
      const cx = Math.floor(d.x / 16), cz = Math.floor(d.z / 16), b = g.world.generator.generateChunk(cx, cz).blocks;
      const at = (x, z) => b[((d.y) << 8) | ((z - cz * 16) << 4) | (x - cx * 16)];
      const ext = (dx, dz) => { let n = 0; while (n < 4) { const x = d.x + dx * (n + 1), z = d.z + dz * (n + 1); if (x < cx * 16 || x > cx * 16 + 15 || z < cz * 16 || z > cz * 16 + 15) break; const id = at(x, z); if (id === B.COBBLESTONE || id === B.MOSSY_COBBLESTONE) break; n++; } return n; };
      const e = ext(1, 0), w = ext(-1, 0), so = ext(0, 1), no = ext(0, -1);
      // wall cells open into the cave (at feet or head height)
      let open = 0;
      for (let x = d.x - w - 1; x <= d.x + e + 1; x++) for (let z = d.z - no - 1; z <= d.z + so + 1; z++) {
        if (x !== d.x - w - 1 && x !== d.x + e + 1 && z !== d.z - no - 1 && z !== d.z + so + 1) continue;
        if (x < cx * 16 || x > cx * 16 + 15 || z < cz * 16 || z > cz * 16 + 15) { open += 9; continue; }
        const f = b[(d.y << 8) | ((z - cz * 16) << 4) | (x - cx * 16)], h = b[((d.y + 1) << 8) | ((z - cz * 16) << 4) | (x - cx * 16)];
        if (f === B.AIR || h === B.AIR) open++;
      }
      return { ...d, size: e + w + so + no, open };
    });
  });
  // prefer a roomy, closed-in one with two chests and a creature that shows up well in the cage
  const score = (d) => d.size * 2 - d.open * 1.5 + (d.chests.length === 2 ? 6 : 0) + (d.mob === 'crawler' ? -8 : 0);
  const D = [...list].sort((a, b) => score(b) - score(a))[0];
  console.log('dungeon', JSON.stringify(D));
  await go(D.x + 0.5, D.y + 8, D.z + 0.5, D.x + 0.5, D.y, D.z + 0.5);
  await settle();
  const R = await ev((D) => {
    const bf = window.__bf, g = bf.game;
    // measure the room from the cage outwards
    const ext = (dx, dz) => { let n = 0; while (n < 3 && bf.getBlock(D.x + dx * (n + 1), D.y + 1, D.z + dz * (n + 1)) !== 'cobblestone' && bf.getBlock(D.x + dx * (n + 1), D.y + 1, D.z + dz * (n + 1)) !== 'mossy_cobblestone') n++; return n; };
    const r = { e: ext(1, 0), w: ext(-1, 0), s: ext(0, 1), n: ext(0, -1) };
    // two hanging lanterns under the ceiling, in opposite corners
    const lan = [[r.e, r.s], [-r.w, -r.n]];
    for (const [dx, dz] of lan) if (bf.getBlock(D.x + dx, D.y + 2, D.z + dz) === 'air') bf.setBlock(D.x + dx, D.y + 2, D.z + dz, 'lantern:hanging');
    g.difficulty = 'peaceful';
    return r;
  }, D);
  console.log('room', JSON.stringify(R));
  // stand near the corner furthest from the chests (one step off the diagonal, so the cage's corner post
  // doesn't hide the little creature inside), looking at the cage
  let best = null;
  for (const [ux, uz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = ux > 0 ? D.x + R.e : D.x - R.w, z0 = uz > 0 ? D.z + R.s : D.z - R.n;
    const far = Math.min(...D.chests.map((c) => Math.hypot(c.x - x, c.z - z0)));
    if (!best || far > best.far) best = { x, z0, far };
  }
  const sx = best.x, sz0 = best.z0;
  const sz = sz0 + (sz0 > D.z ? -1 : 1);
  await go(sx + 0.5, D.y, sz + 0.5, D.x + 0.5, D.y + 0.3, D.z + 0.5);
  await hold('torch');
  await settle();
  await ev(() => { window.__bf.game.player.flying = true; });
  await wait(1500);
  await shot('d01_room');
  // close-up of the cage: a narrower view
  await ev(() => { window.__bf.engine.options.fov = 50; });
  const cdx = sx > D.x ? 1 : -1, cdz = sz0 > D.z ? 1 : -1;
  // face-on through one side of the cage, slightly off-centre
  await go(D.x + 0.5 + cdx * 2.0, D.y - 0.35, D.z + 0.5 + cdz * 0.08, D.x + 0.5, D.y + 0.4, D.z + 0.5);
  await hold('iron_pickaxe');
  await wait(2500);
  await shot('d02_cage');
  // the figure turns: a few more frames to pick one where it faces the camera
  for (let i = 1; i <= 7; i++) { await wait(170); await page.screenshot({ path: `${OUT}/d02_cage_${i}.png` }); }
  await ev(() => { window.__bf.engine.options.fov = 70; });
}

await b.close();
