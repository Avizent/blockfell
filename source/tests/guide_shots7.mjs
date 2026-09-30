// Screenshots and item icons for the 1.6 pages of the How-to-Play guide:
// boats and fishing, the Continue button and the backup reminder.
// node tests/guide_shots7.mjs  (dev server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp/guide_shots7';
const ICONS = process.env.ICONS || '/tmp/guide/icons';
const PARTS = (process.env.PARTS || 'icons,menus,boats').split(',');
const SEED = process.env.SEED || 'webkit';
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
const clean = async () => { await ev(() => window.__bf.ui.set({ chat: [], toasts: [], heldName: null })); await wait(300); };
const shot = async (name) => { await clean(); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const settle = async () => { await wait(1200); await waitFor(() => ev(() => { const c = window.__bf.state().chunks; return c.meshQueued === 0 && c.inflight === 0; }), 60000); await wait(1200); };
const ticks = async (n) => { const t0 = await ev(() => window.__bf.game.tickCount); await waitFor(() => ev((t) => window.__bf.game.tickCount >= t, t0 + n), 60000); };
const screen = () => ev(() => window.__bf?.state().screen);

async function newWorld(name, seed) {
  await page.click('[data-testid=btn-singleplayer]'); await wait(400);
  await page.click('[data-testid=btn-create-new]'); await wait(300);
  await page.fill('[data-testid=world-name]', name);
  if (seed) await page.fill('[data-testid=world-seed]', seed);
  await page.click('[data-testid=btn-create-world]');
  await waitFor(async () => (await screen()) === 'game', 90000);
  await page.mouse.move(640, 360);
  await ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; g.rules.doDaylightCycle = false; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); g.dayNight.time = 4200; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true; });
  await wait(1500);
}
async function saveAndQuit() {
  await ev(() => window.__bf.engine.saveAndQuit());
  await waitFor(async () => (await screen()) === 'title', 30000);
  await wait(800);
}

await page.goto(URL);
await page.mouse.move(640, 360);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });

// ------------------------------------------------------------------ menus
if (PARTS.includes('menus')) {
  await newWorld('Castle Build');
  await saveAndQuit();
  await newWorld('My First World');
  await saveAndQuit();
  await page.waitForSelector('[data-testid=btn-continue]', { timeout: 20000 });
  await wait(3000);
  await page.mouse.move(1270, 710);
  await shot('g01_title');
  await page.click('[data-testid=btn-singleplayer]'); await wait(800);
  await page.mouse.move(1270, 710);
  await shot('bk_worlds');
  await page.click('text=Cancel'); await wait(500);
}

// ------------------------------------------------------------------ boats and fishing
if (PARTS.includes('icons') || PARTS.includes('boats')) await newWorld('Guide 1.6', SEED);

if (PARTS.includes('icons')) {
  const ICON_IDS = ['boat', 'fishing_rod', 'raw_trout', 'cooked_trout', 'raw_perch', 'cooked_perch'];
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

if (PARTS.includes('boats')) {
  // open water near spawn, and the nearest low shore facing it
  const W = await ev(() => {
    const g = window.__bf.game, gen = g.world.generator, p = g.player;
    const h = (x, z) => gen.column(x, z).height;
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    const cand = [];
    for (let dx = -320; dx <= 320; dx += 8) for (let dz = -320; dz <= 320; dz += 8) cand.push([px + dx, pz + dz]);
    cand.sort((a, b) => Math.hypot(a[0] - px, a[1] - pz) - Math.hypot(b[0] - px, b[1] - pz));
    for (const [x, z] of cand) {
      if (h(x, z) > 57) continue;
      let ok = true;
      for (let i = -12; i <= 12 && ok; i += 3) for (let k = -12; k <= 12 && ok; k += 3) if (h(x + i, z + k) > 60) ok = false;
      if (!ok) continue;
      let shore = null;
      for (let d = 12; d <= 48 && !shore; d++) for (let a = 0; a < 32 && !shore; a++) {
        const ang = (a / 32) * Math.PI * 2;
        const sx = Math.round(x + Math.cos(ang) * d), sz = Math.round(z + Math.sin(ang) * d);
        const sh = h(sx, sz);
        if (sh < 63 || sh > 66) continue;
        // a few blocks of flat land behind it
        const bx = Math.round(sx + Math.cos(ang) * 3), bz = Math.round(sz + Math.sin(ang) * 3);
        if (Math.abs(h(bx, bz) - sh) > 2) continue;
        shore = { sx, sz, sh, ang };
      }
      if (shore) return { wx: x, wz: z, ...shore };
    }
    return null;
  });
  console.log('water', JSON.stringify(W));
  if (!W) throw new Error('no water found near spawn');
  // unit vector from the shore out to the water
  const len = Math.hypot(W.wx - W.sx, W.wz - W.sz);
  const ux = (W.wx - W.sx) / len, uz = (W.wz - W.sz) / len;
  const at = (d, side = 0) => [W.sx + 0.5 + ux * d - uz * side, W.sz + 0.5 + uz * d + ux * side];
  await ev((w) => { const g = window.__bf.game; g.player.flying = false; g.teleport(w.sx + 0.5, w.sh + 1, w.sz + 0.5); }, W);
  await waitFor(() => ev((w) => { const wo = window.__bf.game.world; return wo.isLoaded(w.wx, w.wz) && wo.isLoaded(w.sx + 40, w.sz + 40) && wo.isLoaded(w.sx - 40, w.sz - 40); }, W), 60000);
  await settle();
  // step forward to the first water so the boats are close
  const edge = await ev(([sx, sz, ux, uz]) => {
    const bf = window.__bf;
    for (let d = 0; d < 30; d++) {
      const x = Math.floor(sx + ux * d), z = Math.floor(sz + uz * d);
      for (let y = 66; y >= 55; y--) { const k = bf.getBlock(x, y, z); if (k === 'water') return d; if (k !== 'air' && k !== 'tall_grass') break; }
    }
    return 0;
  }, [W.sx + 0.5, W.sz + 0.5, ux, uz]);
  console.log('water edge at', edge);
  const surfAt = (x, z) => ev(([x, z]) => {
    const bf = window.__bf;
    for (let y = 70; y >= 50; y--) if (bf.getBlock(Math.floor(x), y, Math.floor(z)) === 'water') return bf.getBlock(Math.floor(x), y + 1, Math.floor(z)) === 'water' ? y + 1 : y + 14 / 16;
    return null;
  }, [x, z]);
  const stand = at(Math.max(0, edge - 2));
  const standY = await ev(([x, z]) => { const bf = window.__bf; for (let y = 80; y >= 55; y--) { const k = bf.getBlock(Math.floor(x), y, Math.floor(z)); if (k !== 'air' && k !== 'tall_grass' && k !== 'water') return y + 1; } return 64; }, stand);
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; }, [stand[0], standY, stand[1]]);
  const hot = (sel) => ev((sel) => {
    const g = window.__bf.game, inv = g.inventory;
    inv.slots.fill(null);
    ['boat', 'fishing_rod', 'raw_trout', 'cooked_perch', 'planks', 'torch', 'bread', 'stone_pickaxe', 'iron_sword'].forEach((id, i) => { inv.slots[i] = { id, count: ['boat', 'fishing_rod', 'stone_pickaxe', 'iron_sword'].includes(id) ? 1 : 3 + i * 2 }; });
    inv.selected = sel; inv.changed();
  }, sel);

  // 1. two boats on the water, the player on the shore with a boat in hand
  await hot(0);
  const bA = at(edge + 4, -1.5), bB = at(edge + 9, 3);
  const sA = await surfAt(...bA), sB = await surfAt(...bB);
  console.log('surfaces', sA, sB);
  const yawOut = Math.atan2(-ux, -uz);
  await ev(([a, b, sa, sb, yaw]) => {
    const g = window.__bf.game;
    g.entities.spawnBoat(a[0], sa - 0.3, a[1], yaw + 0.5);
    g.entities.spawnBoat(b[0], sb - 0.3, b[1], yaw - 0.9);
  }, [bA, bB, sA, sB, yawOut]);
  const look = at(edge + 7, 0.5);
  await ev(([x, y, z]) => { window.__bf.aimAt(x, y, z); window.__bf.game.player.pitch += 0.12; }, [look[0], sA + 0.3, look[1]]);
  await settle();
  await shot('b01_boats');

  // 2. rowing: in the far boat, turned to row along the shore
  await hot(2);
  await ev(() => {
    const g = window.__bf.game;
    const boats = g.entities.boats();
    const far = boats[boats.length - 1];
    g.mount(far, true);
  });
  await ev(([yaw]) => { const g = window.__bf.game, bt = g.riding; bt.yaw = bt.prevYaw = yaw; g.player.yaw = yaw; g.player.pitch = -0.12; }, [yawOut + Math.PI - 0.95]);
  await ev(() => { window.__bf.game.riding.control.forward = 1; });
  await ticks(14);
  await shot('b02_rowing');
  await ev(() => { const g = window.__bf.game; g.riding.control.forward = 0; g.dismount(); });
  await ev(() => { for (const bt of window.__bf.game.entities.boats()) bt.removed = true; });

  // 3. fishing from the shore: cast, the float settles, a fish swims up
  await ev(([x, y, z]) => { const g = window.__bf.game; g.teleport(x, y, z); g.player.vx = g.player.vy = g.player.vz = 0; }, [stand[0], standY, stand[1]]);
  await hot(1);
  await ticks(10);
  const aim = at(edge + 3, 0);
  await ev(([x, y, z]) => { window.__bf.aimAt(x, y, z); window.__bf.game.player.pitch += 0.12; }, [aim[0], standY + 1, aim[1]]);
  await ticks(2);
  await ev(() => { const g = window.__bf.game; g.useRod(g.inventory.selected); });
  await waitFor(() => ev(() => window.__bf.game.bobber?.state === 'floating'), 20000);
  await ticks(30);
  const fb = await ev(() => { const o = window.__bf.game.bobber; return o ? { x: o.x, y: o.y, z: o.z, state: o.state } : null; });
  console.log('float', JSON.stringify(fb));
  // zoom in a little (a narrower field of view) so the float and the ripples show
  await ev(([x, y, z]) => { window.__bf.engine.options.fov = 48; window.__bf.aimAt(x, y, z); window.__bf.game.player.pitch += 0.07; window.__bf.game.player.yaw += 0.12; }, [fb.x, fb.y, fb.z]);
  await settle();
  await shot('b03_float');
  await ev(() => window.__bf.hurryBite());
  await waitFor(() => ev(() => { const o = window.__bf.game.bobber; return o && o.approach > 0 && o.approach < o.approachTotal * 0.45; }), 20000);
  await page.screenshot({ path: `${OUT}/b04_ripples.png` }); console.log('shot b04_ripples');
  await waitFor(() => ev(() => (window.__bf.game.bobber?.bite ?? 0) > 0), 20000);
  await page.screenshot({ path: `${OUT}/b05_bite.png` }); console.log('shot b05_bite');
  await ev(() => { window.__bf.engine.options.fov = 70; });
}

await b.close();
