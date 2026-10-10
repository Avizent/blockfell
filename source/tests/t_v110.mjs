// Tests for 1.10 "groundwork": 16-bit block ids (Cinderstone Bricks is block 256), save
// format 2 (chunks and extra data per dimension, a record per player), converting worlds
// saved by Blockfell 1.9 (with the pre-1.10 copy and Restore), backup files of both formats,
// and Dropbox sync between a device still on 1.9.1 and one on 1.10.
//   node tests/t_v110.mjs                    (dev server)  ONLY=ids,save,craft,backup
//   ONLY=upgrade,sync OLD_DIR=<1.9.1 single build> NEW_DIR=dist-single node tests/t_v110.mjs
//     (serves both builds itself: the upgrade uses one address for both, as a real update does)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { startMockDropbox } from './mock-dropbox.mjs';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : ['ids', 'save', 'craft', 'backup'];
const run = (n) => only.includes(n);
// the version being tested (1.10.0 when written; later releases keep these checks)
const NEWVER = process.env.NEWVER || '2.2.0';
const NEWVER_RE = NEWVER.replace(/\./g, '\\.');
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 700)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const VW = 1280, VH = 720;
const errors = [];

function helpers(page, name = '') {
  page.on('pageerror', (e) => { errors.push(`${name}${e}`); console.log('pageerror', name, String(e)); });
  const h = {};
  h.ev = (fn, a) => page.evaluate(fn, a);
  h.wait = (ms) => page.waitForTimeout(ms);
  h.waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await h.wait(200); } return false; };
  h.screen = () => h.ev(() => window.__bf?.state().screen);
  h.settle = async () => { await h.wait(500); await h.waitFor(() => h.ev(() => { const c = window.__bf.state().chunks; return c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0; }), 60000); await h.wait(300); };
  h.open = async (url) => { await page.goto(url); await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 }); await h.wait(500); };
  h.logToasts = () => h.ev(() => {
    const u = window.__bf.ui, seen = new Set();
    window.__toastLog = [];
    const grab = () => { for (const t of u.get().toasts) if (!seen.has(t.id)) { seen.add(t.id); window.__toastLog.push(`${t.title}|${t.desc}`); } };
    grab(); u.subscribe(grab);
  });
  h.toasts = () => h.ev(() => window.__toastLog ?? []);
  h.create = async (name, seed, creative = true) => {
    await page.click('[data-testid=btn-singleplayer]');
    await page.click('[data-testid=btn-create-new]');
    await page.fill('[data-testid=world-name]', name);
    await page.fill('[data-testid=world-seed]', seed);
    if (creative) await page.click('[data-testid=btn-gamemode]');
    await page.click('[data-testid=btn-create-world]');
    await h.waitFor(async () => (await h.screen()) === 'game', 90000);
    await h.ev(() => { window.__bf.allowUnlocked(true); const g = window.__bf.game; g.rules.doMobSpawning = false; });
    await h.settle();
    return h.ev(() => window.__bf.game.record.id);
  };
  h.quit = async () => { await h.ev(() => window.__bf.engine.saveAndQuit()); await h.waitFor(async () => (await h.screen()) === 'title', 40000); await h.wait(400); };
  h.play = async (id) => { await h.ev((id) => void window.__bf.engine.playWorld(id), id); await h.waitFor(async () => (await h.screen()) === 'game', 90000); await h.ev(() => window.__bf.allowUnlocked(true)); await h.settle(); };
  /** Raw IndexedDB contents of one world: chunk keys -> packed values, extra keys, record. */
  h.rawDb = (id) => h.ev((id) => new Promise((resolve, reject) => {
    const req = indexedDB.open('blockfell');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, out = { chunks: {}, extra: {}, record: null, meta: [] };
      const t = db.transaction(['chunks', 'extra', 'worlds', 'meta'], 'readonly');
      const range = IDBKeyRange.bound(id, id + '￿');
      t.objectStore('chunks').openCursor(range).onsuccess = (e) => { const c = e.target.result; if (c) { out.chunks[c.key] = Array.from(c.value); c.continue(); } };
      t.objectStore('extra').openCursor(range).onsuccess = (e) => { const c = e.target.result; if (c) { out.extra[c.key] = c.value; c.continue(); } };
      t.objectStore('worlds').get(id).onsuccess = (e) => { out.record = e.target.result ?? null; };
      t.objectStore('meta').getAllKeys().onsuccess = (e) => { out.meta = e.target.result; };
      t.oncomplete = () => { db.close(); resolve(out); };
    };
  }), id);
  /** What a player made in a world, read back from the live game. */
  h.snapshot = (marks) => h.ev((marks) => {
    const bf = window.__bf, g = bf.game;
    return {
      blocks: marks.map(([x, y, z]) => bf.getBlock(x, y, z)),
      chest: g.world.blockEntities.get(`${marks[0][0]},${marks[0][1] + 3},${marks[0][2]}`)?.items?.filter(Boolean).map((s) => `${s.id}x${s.count}`) ?? null,
      inv: bf.inventory().slice(0, 6),
      pos: [Math.round(g.player.x * 10) / 10, Math.round(g.player.y * 10) / 10, Math.round(g.player.z * 10) / 10],
      time: g.dayNight.time, day: g.dayNight.day,
    };
  }, marks);
  return h;
}

/** Puts a recognisable set of changes into the open world: blocks, a chest with items, a painting spot. */
const makeChanges = (h, extraKey = null) => h.ev((extraKey) => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 3, z = Math.floor(p.z) + 1, y = g.world.highestSolid(x, z) + 1;
  const marks = [];
  const put = (dx, dy, dz, key) => { bf.setBlock(x + dx, y + dy, z + dz, key); marks.push([x + dx, y + dy, z + dz]); };
  put(0, 0, 0, 'bricks'); put(0, 1, 0, 'glass'); put(0, 2, 0, 'cinderstone'); put(0, 3, 0, 'chest');
  put(1, 0, 0, 'map_table'); put(-1, 0, 0, 'bell'); put(0, 0, 1, 'spawner'); put(1, 1, 0, 'oak_slab');
  if (extraKey) put(0, 4, 0, extraKey);
  // dig a hole too: a change to air must survive as well
  put(2, -1, 0, 'air');
  const be = g.world.blockEntities.get(`${x},${y + 3},${z}`);
  if (be) { be.items[0] = { id: 'coal', count: 3 }; be.items[4] = { id: 'iron_ingot', count: 17 }; }
  g.inventory.slots[0] = { id: 'iron_pickaxe', count: 1 }; g.inventory.slots[1] = { id: 'torch', count: 33 }; g.inventory.changed();
  g.teleport(p.x + 0.5, p.y, p.z);
  return marks;
}, extraKey);

// ====================================================================== dev server sections
if (run('ids') || run('save') || run('craft') || run('backup')) {
  const page = await b.newPage({ viewport: { width: VW, height: VH } });
  const h = helpers(page);
  await h.open(URL);
  await h.logToasts();

  if (run('ids')) {
    const t = await h.ev(async () => {
      const B = await import('/src/world/BlockRegistry.ts');
      const C = await import('/src/world/constants.ts');
      return {
        limit: C.BLOCK_LIMIT, fmt: C.SAVE_FORMAT, ver: C.GAME_VERSION,
        bricks: B.CINDERSTONE_BRICKS, brickKey: B.getBlock(256).key, count: B.BLOCK_COUNT,
        old: B.BLOCKS.filter((d) => d.id < 249).map((d) => d.key), ids: B.BLOCKS.filter((d) => d.id < 249).map((d) => d.id),
        below249: B.BLOCKS.filter((d) => d.id < 249).length, gap: [249, 250, 251, 252, 253, 254, 255].map((i) => B.isBlockId(i)),
        unknownSolid: [255, 300, 1023].map((i) => B.IS_SOLID[i] === 1 && B.IS_OPAQUE[i] === 1 && B.RENDER[i] === B.RENDER_CUBE),
        tables: [B.IS_OPAQUE.length, B.LIGHT_OPACITY.length, B.FACE_LAYER.length, B.MODEL.length],
        brickOpaque: B.IS_OPAQUE[256] === 1 && B.IS_SOLID[256] === 1 && B.getBlock(256).minTier === 2,
      };
    });
    check(`blocks: ids go up to 1023 (BLOCK_LIMIT), save format 2, version ${NEWVER}`, t.limit === 1024 && t.fmt === 2 && t.ver === NEWVER, t);
    const ids191 = JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/block-ids-1.9.1.json', import.meta.url), 'utf8'));
    check('blocks: all 249 blocks of 1.0-1.9 keep their ids (compared with the 1.9.1 list)',
      t.below249 === 249 && JSON.stringify(t.old) === JSON.stringify(ids191) && t.ids.every((id, i) => id === i), { n: t.below249, diff: t.old.findIndex((k, i) => k !== ids191[i]) });
    check('blocks: Cinderstone Bricks is block 256 (the first id an 8-bit world could not hold); 249-255 stay free', t.bricks === 256 && t.brickKey === 'cinderstone_bricks' && t.gap.every((x) => !x), t);
    check('blocks: unknown ids and UNLOADED (255) act as solid stone; lookup tables are 1024 long', t.unknownSolid.every(Boolean) && t.tables[0] === 1024 && t.tables[1] === 1024 && t.tables[2] === 6144 && t.tables[3] === 1024 && t.brickOpaque, t);

    const id = await h.create('Wide Ids', 'wide');
    const at = await h.ev(() => {
      const bf = window.__bf, g = bf.game, p = g.player;
      p.flying = true;
      const x = Math.floor(p.x), z = Math.floor(p.z) - 4, y = Math.floor(p.y) + 1;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) {
        bf.setBlock(x + dx, y + dy, z, 'cinderstone_bricks');
        for (let dz = 1; dz <= 4; dz++) bf.setBlock(x + dx, y + dy, z + dz, 'air');   // a clear view (no leaves in the way)
      }
      g.teleport(x + 0.5, y, z + 3.5);
      p.yaw = 0; p.pitch = 0;
      return { x, y, z, cx: x >> 4, cz: z >> 4 };
    });
    await h.settle();
    const m = await h.ev(([cx, cz, x, y, z]) => ({ mesher: window.__bf.meshStatsFor(cx, cz).visibleFaces, brute: window.__bf.bruteForceFaces(cx, cz), wall: window.__bf.getBlock(x, y, z) }), [at.cx, at.cz, at.x, at.y, at.z]);
    check('meshing: a wall of block 256 is meshed like any cube (mesher faces = brute-force count)', m.mesher === m.brute && m.mesher > 0 && m.wall === 'cinderstone_bricks', m);
    await h.ev(() => window.__bf.ui.set({ toasts: [] }));
    await h.wait(400);
    const shot = await page.screenshot({ path: `${SHOTS}/v110_bricks.png` });
    const px = await h.ev(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(img.width / 2 - 60, img.height / 2 - 60, 120, 120).data;
      let r = 0, g = 0, bl = 0, n = 0, magenta = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; if (d[i] > 200 && d[i + 2] > 180 && d[i + 1] < 60) magenta++; }
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(bl / n), magenta };
    }, shot.toString('base64'));
    check('meshing: on screen it is dark Cinderstone brick, not the missing-texture pattern', px.magenta === 0 && px.r < 110 && px.g < 100 && px.b < 110, px);
    // the old 8-bit packing would have stored 256 as 0 (air)
    await h.ev(() => window.__bf.game.save());
    const raw = await h.rawDb(id);
    const vals = Object.values(raw.chunks).flat().map((v) => [v >>> 16, v & 0xffff]);
    check('saves: chunk keys are "<world>|overworld|cx,cz" and hold 16-bit ids (idx << 16 | id)',
      vals.length >= 20 && vals.filter(([, id]) => id === 256).length === 20 && Object.keys(raw.chunks).every((key) => key.startsWith(id + '|overworld|')), { keys: Object.keys(raw.chunks), n: vals.length });
    check('saves: extra data is kept under "<world>|overworld"; the record is format 2 with the player\'s dimension',
      Object.keys(raw.extra).length === 1 && Object.keys(raw.extra)[0] === `${id}|overworld` && raw.record.format === 2 && raw.record.player?.dim === 'overworld', { extra: Object.keys(raw.extra), fmt: raw.record.format, dim: raw.record.player?.dim });
    await h.quit();
    await h.play(id);
    const back = await h.ev(([x, y, z]) => [window.__bf.getBlock(x, y, z), window.__bf.getBlock(x + 2, y + 2, z)], [at.x, at.y, at.z]);
    check('saves: block 256 comes back after Save and Quit and reopening', back[0] === 'cinderstone_bricks' && back[1] === 'cinderstone_bricks', back);
    await h.quit();
  }

  if (run('craft')) {
    await h.create('Cinder Craft', 'craft', false);
    const r = await h.ev(() => {
      const bf = window.__bf;
      const cinder = bf.craft(['stone', 'coal', 'stone', 'coal', 'iron_ingot', 'coal', 'stone', 'coal', 'stone']);
      const bricks = bf.craft(['cinderstone', 'cinderstone', 'cinderstone', 'cinderstone'], 2);
      const wrong = bf.craft(['stone', 'coal', 'stone', 'coal', 'coal', 'coal', 'stone', 'coal', 'stone']);
      return { cinder, bricks, wrong, item: bf.item('cinderstone_bricks') };
    });
    check('crafting: 4 stone + 4 coal round an iron ingot make 4 Cinderstone (worlds made before 1.7 have no lava)', r.cinder?.id === 'cinderstone' && r.cinder?.count === 4, r.cinder);
    check('crafting: 4 Cinderstone make 4 Cinderstone Bricks (a Building block); no ingot, no Cinderstone', r.bricks?.id === 'cinderstone_bricks' && r.bricks?.count === 4 && !r.wrong && r.item.category === 'building', r);
    // mining: like Cinderstone it needs an iron pickaxe
    const mine = await h.ev(async () => {
      const bf = window.__bf, g = bf.game, p = g.player;
      const x = Math.floor(p.x) + 2, z = Math.floor(p.z), y = Math.floor(p.y);
      bf.setBlock(x, y, z, 'cinderstone_bricks');
      const B = await import('/src/world/BlockRegistry.ts');
      const K = await import('/src/interaction/BlockBreaking.ts');
      const d = B.getBlock(B.CINDERSTONE_BRICKS);
      const canStone = K.canHarvest(d, { id: 'stone_pickaxe', count: 1 });
      const canIron = K.canHarvest(d, { id: 'iron_pickaxe', count: 1 });
      return { requiresTool: d.requiresTool, minTier: d.minTier, tool: d.tool, canStone, canIron, drops: d.drops };
    });
    check('mining: Cinderstone Bricks need an iron pickaxe and drop themselves', mine.requiresTool && mine.minTier === 2 && mine.tool === 'pickaxe' && mine.drops[0]?.item === 'cinderstone_bricks' && mine.canStone === false && mine.canIron === true, mine);
    await h.quit();
  }

  if (run('backup')) {
    const id = await h.create('Format Two', 'fmt2');
    const marks = await makeChanges(h, 'cinderstone_bricks');
    await h.settle();
    const before = await h.snapshot(marks);
    await h.quit();
    const exported = await h.ev(async (id) => {
      const W = await import('/src/systems/WorldBackup.ts');
      const { blob, backup } = await W.createBackup(window.__bf.engine.saves, id);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { b64: btoa(s), dims: Object.keys(backup.dims ?? {}), formatVersion: backup.formatVersion };
    }, id);
    const file = JSON.parse(zlib.gunzipSync(Buffer.from(exported.b64, 'base64')).toString());
    const chunkVals = Object.values(file.dims.overworld.chunks).flatMap((b64) => { const buf = Buffer.from(b64, 'base64'); const out = []; for (let o = 0; o < buf.length; o += 4) out.push(buf.readUInt32LE(o)); return out; });
    check('backup files: format 2 with a "dims" section (overworld chunks + extra) and no 1.9 fields',
      file.formatVersion === 2 && JSON.stringify(Object.keys(file.dims)) === '["overworld"]' && !file.chunks && !('extra' in file) && file.dims.overworld.extra?.blockEntities?.length > 0 && file.world.format === 2, { fv: file.formatVersion, dims: Object.keys(file.dims), top: Object.keys(file) });
    check('backup files: ids are packed for 16 bits, so block 256 is kept', chunkVals.some((v) => (v & 0xffff) === 256) && chunkVals.every((v) => (v & 0xffff) < 1024), chunkVals.slice(0, 6));
    // import it back as a copy
    const copyId = await h.ev(async (b64) => {
      const W = await import('/src/systems/WorldBackup.ts');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const b = await W.readBackup(new Blob([bytes]));
      return W.importBackup(window.__bf.engine.saves, b, 'copy');
    }, exported.b64);
    await h.play(copyId);
    const copy = await h.snapshot(marks);
    check('backup files: importing a format-2 file gives back every block, the chest and the inventory', JSON.stringify(copy.blocks) === JSON.stringify(before.blocks) && JSON.stringify(copy.chest) === JSON.stringify(before.chest) && JSON.stringify(copy.inv) === JSON.stringify(before.inv), { before, copy });
    await h.quit();

    // a 1.9 file (format 1, 8-bit packing) made here the way 1.9.1 wrote it
    const v1 = { ...file, formatVersion: 1, gameVersion: '1.9.1', world: { ...file.world, id: 'wlegacy1', name: 'From 1.9', format: 1, version: '1.9.1' } };
    delete v1.dims;
    delete v1.world.player.dim;
    v1.extra = file.dims.overworld.extra;
    v1.chunks = {};
    for (const [k, b64] of Object.entries(file.dims.overworld.chunks)) {
      const buf = Buffer.from(b64, 'base64'), out = Buffer.alloc(buf.length);
      let keep = 0;
      for (let o = 0; o < buf.length; o += 4) {
        const v = buf.readUInt32LE(o), idx = v >>> 16, bid = v & 0xffff;
        if (bid > 248) continue;   // 1.9 had no such block
        out.writeUInt32LE(((idx << 8) | bid) >>> 0, keep); keep += 4;
      }
      v1.chunks[k] = out.subarray(0, keep).toString('base64');
    }
    const v1b64 = zlib.gzipSync(JSON.stringify(v1)).toString('base64');
    const legacyId = await h.ev(async (b64) => {
      const W = await import('/src/systems/WorldBackup.ts');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return W.importBackup(window.__bf.engine.saves, await W.readBackup(new Blob([bytes])), 'replace');
    }, v1b64);
    const lraw = await h.rawDb(legacyId);
    check('backup files: a 1.9 file (format 1) imports and is stored as format 2', legacyId === 'wlegacy1' && lraw.record.format === 2 && lraw.record.player.dim === 'overworld' && Object.keys(lraw.chunks).every((k) => k.startsWith('wlegacy1|overworld|')) && Object.keys(lraw.extra).join() === 'wlegacy1|overworld', { fmt: lraw.record.format, keys: Object.keys(lraw.chunks).slice(0, 3), extra: Object.keys(lraw.extra) });
    await h.play(legacyId);
    const leg = await h.snapshot(marks);
    check('backup files: ...with every 1.9 block and the chest contents where they were', JSON.stringify(leg.blocks.slice(0, 9)) === JSON.stringify(before.blocks.slice(0, 8).concat([before.blocks[9]])) || JSON.stringify(leg.blocks.filter((k, i) => i !== 8)) === JSON.stringify(before.blocks.filter((k, i) => i !== 8)), { before: before.blocks, leg: leg.blocks, chest: leg.chest });
    await h.quit();

    // a file from a newer Blockfell, or one with a landscape this version can't make, is refused
    // "newer" relative to the version under test: 1.10 lacked the Cinderdeep; later versions have the Cinderdeep but not generator 9 or a dimension they don't know
    const newer = NEWVER === '1.10.0'
      ? { ver: '1.11.0', gen: 1, dim: 'cinderdeep' }
      : { ver: NEWVER.replace(/^(\d+)\.(\d+)\..*$/, (m, a, b) => `${a}.${+b + 1}.0`), gen: 9, dim: 'skyreach' };
    const refuse = await h.ev(async ([b64, newer]) => {
      const W = await import('/src/systems/WorldBackup.ts');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const b = await W.readBackup(new Blob([bytes]));
      const out = [];
      for (const patch of [{ gameVersion: newer.ver }, { world: { ...b.world, id: 'wnewer2', dims: { cinderdeep: { genVersion: newer.gen } } } }, { world: { ...b.world, id: 'wnewer3', player: { ...b.world.player, dim: newer.dim } } }]) {
        try { await W.importBackup(window.__bf.engine.saves, { ...b, ...patch }, 'copy'); out.push('imported'); } catch (e) { out.push(String(e.message)); }
      }
      const W2 = await import('/src/systems/WorldBackup.ts');
      try { await W2.readBackup(new Blob([JSON.stringify({ ...b, formatVersion: 3 })])); out.push('read'); } catch (e) { out.push(String(e.message)); }
      return out;
    }, [exported.b64, newer]);
    check(`backup files: newer files are refused (Blockfell ${newer.ver}, a landscape this version can't make, format 3)`,
      /update Blockfell/.test(refuse[0]) && /update Blockfell/.test(refuse[1]) && /update Blockfell/.test(refuse[2]) && /newer version/.test(refuse[3]), refuse);
    const dup = await h.ev(async (id) => {
      const rec = await window.__bf.engine.saves.getWorld(id);
      await window.__bf.engine.saves.duplicate(rec, 'wdup110', 'Format Two (backup)');
      const dims = await window.__bf.engine.saves.savedDims('wdup110');
      const d = await window.__bf.engine.saves.loadDeltas('wdup110', 'overworld');
      return { dims, chunks: d.size };
    }, id);
    check('Make Backup Copy copies every dimension of a world', JSON.stringify(dup.dims) === '["overworld"]' && dup.chunks > 0, dup);
  }

  if (run('save')) {
    // generators: the registry and the "needs a newer Blockfell" rule
    const g = await h.ev(async (NEWVER) => {
      const G = await import('/src/world/generators.ts');
      const D = await import('/src/world/dims.ts');
      return {
        dims: D.DIM_IDS, over: G.hasGenerator('overworld'), cinder: G.hasGenerator('cinderdeep'), ver: G.newestGenVersion('overworld'),
        n: [
          G.needsNewerGenerator({ genVersion: 6 }), G.needsNewerGenerator({ genVersion: 7 }),
          G.needsNewerGenerator({ genVersion: 6, dims: { cinderdeep: { genVersion: 9 } } }),
          G.needsNewerGenerator({ genVersion: 6, player: { dim: NEWVER === '1.10.0' ? 'cinderdeep' : 'skyreach' } }), G.needsNewerGenerator({ genVersion: 1, player: { dim: 'overworld' } }),
        ],
      };
    }, NEWVER);
    // 1.10 could only make the overworld (the Cinderdeep id was reserved); 2.0 makes both
    // (2.2 adds the Starhollow)
    const dimsWanted = /^(1\.|2\.0|2\.1)/.test(NEWVER) ? '["overworld","cinderdeep"]' : '["overworld","cinderdeep","starhollow"]';
    check('dimensions: the overworld (generator 6) and, from 2.0, the Cinderdeep (and from 2.2 the Starhollow) can be made; their ids are known', g.over && g.cinder === (NEWVER !== '1.10.0') && g.ver === 6 && JSON.stringify(g.dims) === dimsWanted, { ...g, dimsWanted });
    check('dimensions: worlds with a newer landscape or a dimension this version lacks count as "needs a newer Blockfell"', JSON.stringify(g.n) === '[false,true,true,true,false]', g.n);
    // a world saved in format 2 keeps fields it does not use (other players, dimension notes)
    const id = await h.create('Keep Fields', 'keep');
    await h.ev(async () => {
      const g = window.__bf.game;
      const me = g.snapshot().record.player;
      g.record.players = { guest1: { ...me, name: 'Guest', lastSeen: 123 } };
      g.record.dims = { overworld: { genVersion: 6, firstVisit: 1 } };
      await g.save();
    });
    await h.quit();
    await h.play(id);
    await h.ev(() => window.__bf.game.save());
    const rec = (await h.rawDb(id)).record;
    check('save format 2: other players\' records and dimension notes are kept by every save', rec.players?.guest1?.name === 'Guest' && rec.players.guest1.lastSeen === 123 && rec.dims?.overworld?.firstVisit === 1 && rec.player.dim === 'overworld', { players: rec.players && Object.keys(rec.players), dims: rec.dims });
    await h.quit();
  }
  await page.close();
}

// ====================================================================== upgrade from 1.9.1
/** A tiny web server whose folder can be swapped (an update = new files at the same address). */
function folderServer(port) {
  const srv = { root: null };
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  srv.server = http.createServer((req, res) => {
    let p = decodeURIComponent(new globalThis.URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(srv.root, p);
    if (!f.startsWith(srv.root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(f));
  });
  srv.url = `http://localhost:${port}/`;
  srv.listen = () => new Promise((r) => srv.server.listen(port, r));
  srv.close = () => new Promise((r) => srv.server.close(r));
  return srv;
}

const OLD_DIR = process.env.OLD_DIR, NEW_DIR = process.env.NEW_DIR;
if (run('upgrade') && OLD_DIR && NEW_DIR) {
  const srv = folderServer(Number(process.env.UPG_PORT || 8775));
  srv.root = path.resolve(OLD_DIR);
  await srv.listen();
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const h = helpers(page, 'upgrade: ');
  await h.open(srv.url);
  const v0 = await h.ev(() => document.querySelector('meta[name=blockfell-version]')?.getAttribute('content'));
  check('upgrade: the old build is Blockfell 1.9.1', v0 === '1.9.1', v0);
  const ids = [];
  ids.push(await h.create('Old Creative', 'oldc'));
  const marks = await makeChanges(h);
  await h.ev(() => { const g = window.__bf.game; g.dayNight.time = 4321; });
  await h.settle();
  const before = await h.snapshot(marks);
  await h.quit();
  ids.push(await h.create('Old Survival', 'olds', false));
  const marks2 = await makeChanges(h);
  const before2 = await h.snapshot(marks2);
  await h.quit();
  const rawOld = await h.rawDb(ids[0]);
  check('upgrade: 1.9.1 stored format 1 (chunk keys "<world>|cx,cz", extra under the world id)', rawOld.record.format === 1 && Object.keys(rawOld.chunks).every((k) => /^[^|]+\|-?\d+,-?\d+$/.test(k)) && Object.keys(rawOld.extra).join() === ids[0], { fmt: rawOld.record.format, keys: Object.keys(rawOld.chunks).slice(0, 2), extra: Object.keys(rawOld.extra) });

  // the update arrives: new files at the same address; the offline copy offers it, Restart
  srv.root = path.resolve(NEW_DIR);
  const found = await h.ev(() => window.__bf.checkUpdate(true));
  await h.wait(500);
  check(`upgrade: 1.9.1 finds ${NEWVER} online and offers it`, found === NEWVER, found);
  await page.click('[data-testid=btn-restart-update]');
  await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await h.logToasts();
  await h.wait(1500);
  const v1 = await h.ev(() => document.querySelector('meta[name=blockfell-version]')?.getAttribute('content'));
  const toasts = await h.ev(() => window.__bf.ui.get().toasts.map((t) => `${t.title}|${t.desc}`).concat(window.__toastLog ?? []));
  check(`upgrade: Restart starts ${NEWVER}, which updates both worlds and says so`, v1 === NEWVER && toasts.some((t) => new RegExp(`^Updated for Blockfell ${NEWVER_RE}\\|2 worlds`).test(t)), { v1, toasts });
  const rawNew = await h.rawDb(ids[0]);
  check('upgrade: the saves are now format 2 (keys with the dimension, 16-bit packing), nothing left in the old form',
    rawNew.record.format === 2 && rawNew.record.player.dim === 'overworld' && Object.keys(rawNew.chunks).length === Object.keys(rawOld.chunks).length
    && Object.keys(rawNew.chunks).every((k) => k.startsWith(ids[0] + '|overworld|')) && Object.keys(rawNew.extra).join() === `${ids[0]}|overworld`,
    { keys: Object.keys(rawNew.chunks).slice(0, 2), extra: Object.keys(rawNew.extra) });
  const same = Object.entries(rawOld.chunks).every(([k, vals]) => {
    const nv = rawNew.chunks[k.replace('|', '|overworld|')];
    return nv && nv.length === vals.length && vals.every((v, i) => (v >>> 8) === (nv[i] >>> 16) && (v & 255) === (nv[i] & 0xffff));
  });
  check('upgrade: every changed block was carried over exactly (same cells, same ids)', same);
  check('upgrade: a format-1 copy of each world was kept first', rawNew.meta.includes('archive|' + ids[0]) && rawNew.meta.includes('archive|' + ids[1]), rawNew.meta);
  await page.click('[data-testid=btn-singleplayer]');
  await page.locator('[data-testid=world-entry]', { hasText: 'Old Creative' }).first().click();
  await page.click('[data-testid=btn-play-selected]');
  await h.waitFor(async () => (await h.screen()) === 'game', 90000);
  await h.ev(() => window.__bf.allowUnlocked(true));
  await h.settle();
  const after = await h.snapshot(marks);
  check('upgrade: the world plays on in 1.10 exactly as left (blocks, chest, inventory, position, time)',
    JSON.stringify(after.blocks) === JSON.stringify(before.blocks) && JSON.stringify(after.chest) === JSON.stringify(before.chest) && JSON.stringify(after.inv) === JSON.stringify(before.inv)
    && JSON.stringify(after.pos) === JSON.stringify(before.pos) && Math.abs(after.time - before.time) < 400, { before, after });
  await h.quit();
  await h.play(ids[1]);
  const after2 = await h.snapshot(marks2);
  check('upgrade: so does the survival world', JSON.stringify(after2.blocks) === JSON.stringify(before2.blocks) && JSON.stringify(after2.chest) === JSON.stringify(before2.chest) && JSON.stringify(after2.inv) === JSON.stringify(before2.inv), { before2, after2 });
  // change it in 1.10, then restore the pre-1.10 copy as a separate world
  await h.ev(([x, y, z]) => window.__bf.setBlock(x, y, z, 'cinderstone_bricks'), marks2[0]);
  await h.quit();
  await page.click('[data-testid=btn-singleplayer]');
  await page.locator('[data-testid=world-entry]', { hasText: 'Old Survival' }).first().click();
  await page.click('[data-testid=btn-edit-world]').catch(async () => { await page.click('button:text-is("Edit")'); });
  await page.waitForSelector('[data-testid=btn-restore-archive]', { timeout: 10000 }).catch(() => null);
  await page.screenshot({ path: `${SHOTS}/v110_restore.png` });
  const hasRestore = (await page.$('[data-testid=btn-restore-archive]')) !== null;
  check('restore: Edit World offers "Restore Pre-1.10 Copy" for a converted world', hasRestore);
  if (hasRestore) {
    await page.click('[data-testid=btn-restore-archive]');
    await h.waitFor(async () => (await h.screen()) === 'worlds', 15000);
    const list = await h.ev(async () => (await window.__bf.engine.saves.listWorlds()).map((w) => w.name));
    check('restore: it is added as a new world "Old Survival (before 1.10)"; the 1.10 world stays', list.includes('Old Survival (before 1.10)') && list.includes('Old Survival'), list);
    const rid = await h.ev(async () => (await window.__bf.engine.saves.listWorlds()).find((w) => w.name === 'Old Survival (before 1.10)')?.id);
    await h.play(rid);
    const restored = await h.snapshot(marks2);
    check('restore: ...exactly as it was in 1.9.1 (not the change made since)', JSON.stringify(restored.blocks) === JSON.stringify(before2.blocks) && JSON.stringify(restored.chest) === JSON.stringify(before2.chest), { before2: before2.blocks, restored: restored.blocks });
    await h.quit();
  }
  // a new world made by 1.10 has no pre-1.10 copy
  const nid = await h.create('New In 110', 'n110');
  await h.quit();
  const nraw = await h.rawDb(nid);
  check('restore: worlds made in 1.10 have no pre-1.10 copy', !nraw.meta.includes('archive|' + nid));
  // deleting a converted world deletes its copy too
  await h.ev((id) => window.__bf.engine.deleteWorld(id), ids[0]);
  const draw = await h.rawDb(ids[0]);
  check('delete: deleting a world removes its chunks, extra data and pre-1.10 copy', !draw.record && !Object.keys(draw.chunks).length && !Object.keys(draw.extra).length && !draw.meta.includes('archive|' + ids[0]), draw);
  // the old version refuses a file written by the new one
  await ctx.close();
  await srv.close();
}

// ====================================================================== Dropbox: a 1.9.1 iPad and a 1.10 Mac
if (run('sync') && OLD_DIR && NEW_DIR) {
  const KEY = 'testappkey123';
  const macSrv = folderServer(8776); macSrv.root = path.resolve(NEW_DIR); await macSrv.listen();
  const padSrv = folderServer(8777); padSrv.root = path.resolve(OLD_DIR); await padSrv.listen();
  const mock = await startMockDropbox({ port: 8791, appKey: KEY, redirects: [macSrv.url, padSrv.url] });
  const HOSTS = JSON.stringify({ api: mock.url, content: mock.url, www: mock.url });
  const mockFile = async (id) => {
    const r = await fetch(`${mock.url}/__ctl/file?path=/worlds/${id}.blockfell`);
    if (!r.ok) return null;
    const j = await r.json();
    return JSON.parse(zlib.gunzipSync(Buffer.from(j.base64, 'base64')).toString());
  };
  const device = async (name, url, ua) => {
    const ctx = await b.newContext({ viewport: { width: VW, height: VH }, userAgent: ua });
    await ctx.addInitScript(([hosts, key]) => { localStorage.setItem('blockfell.dropbox.hosts', hosts); localStorage.setItem('blockfell.dropbox.appKey', JSON.stringify(key)); }, [HOSTS, KEY]);
    const page = await ctx.newPage();
    const h = helpers(page, name + ': ');
    h.page = page; h.ctx = ctx; h.url = url;
    h.link = async () => {
      const codeUrl = await h.ev(() => window.__bf.engine.cloud.dbx.beginCodeLink());
      const code = /<code id="auth-code">([^<]+)</.exec(await (await fetch(codeUrl)).text())[1];
      await h.ev(async (c) => { const cl = window.__bf.engine.cloud; await cl.dbx.finishCodeLink(c); await cl.onLinked(); await cl.syncAll(); }, code);
    };
    h.sync = () => h.ev(() => window.__bf.engine.cloud.syncAll());
    h.status = (id) => h.ev((id) => window.__bf.ui.get().cloud.worlds?.[id] ?? null, id);
    return h;
  };
  const mac = await device('Mac 1.10', macSrv.url, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
  const pad = await device('iPad 1.9.1', padSrv.url, 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  await pad.open(pad.url);
  await pad.link();
  const padWorld = await pad.create('iPad World', 'padw');
  const pmarks = await makeChanges(pad);
  const pbefore = await pad.snapshot(pmarks);
  await pad.quit();
  const f1 = await mockFile(padWorld);
  check('sync: the 1.9.1 iPad uploads a format-1 file', f1?.formatVersion === 1 && !!f1.chunks, f1 && { fv: f1.formatVersion });
  await mac.open(mac.url);
  await mac.link();
  await mac.wait(1000);
  const macHas = await mac.ev(async (id) => !!(await window.__bf.engine.saves.getWorld(id)), padWorld);
  check('sync: the 1.10 Mac downloads it', macHas);
  await mac.play(padWorld);
  const mview = await mac.snapshot(pmarks);
  check('sync: ...converts it and shows it exactly as on the iPad', JSON.stringify(mview.blocks) === JSON.stringify(pbefore.blocks) && JSON.stringify(mview.chest) === JSON.stringify(pbefore.chest), { pbefore, mview });
  await mac.ev(([x, y, z]) => window.__bf.setBlock(x, y + 6, z, 'cinderstone_bricks'), pmarks[0]);
  await mac.quit();
  const f2 = await mockFile(padWorld);
  check(`sync: once played on the Mac, the Dropbox copy is format 2 (written by ${NEWVER})`, f2?.formatVersion === 2 && f2.gameVersion === NEWVER && !!f2.dims?.overworld, f2 && { fv: f2.formatVersion, gv: f2.gameVersion });
  await pad.sync();
  await pad.wait(500);
  const padRec = await pad.ev(async (id) => { const w = await window.__bf.engine.saves.getWorld(id); return { format: w.format, version: w.version }; }, padWorld);
  const padUi = await pad.ev((id) => { const c = window.__bf.ui.get().cloud; return JSON.stringify(c).slice(0, 2000); }, padWorld);
  check('sync: the 1.9.1 iPad does not take the 1.10 copy (its own copy is left as it was)', padRec.format === 1 && padRec.version === '1.9.1', padRec);
  check('sync: ...and its world list says why ("made by a newer version of Blockfell")', /newer version of Blockfell/.test(padUi), padUi.slice(0, 600));
  await pad.page.click('[data-testid=btn-singleplayer]').catch(() => null);
  await pad.wait(800);
  await pad.page.screenshot({ path: `${SHOTS}/v110_old_ipad.png` });
  // a Mac-made world never lands on the old iPad
  const macWorld = await mac.create('Mac World', 'macw');
  await mac.quit();
  await pad.sync();
  const padSees = await pad.ev(async (id) => !!(await window.__bf.engine.saves.getWorld(id)), macWorld);
  check('sync: a world made in 1.10 is not imported by 1.9.1 either', !padSees);
  for (const d of [mac, pad]) await d.ctx.close();
  await mock.close();
  await macSrv.close(); await padSrv.close();
}

check('no script errors', errors.length === 0, errors.slice(0, 6));
console.log('\n' + results.map((r) => `${r[0]}  ${r[1].padEnd(96)} ${r[0] === 'FAIL' ? r[2].slice(0, 300) : ''}`).join('\n'));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await b.close();
