// End-to-end test of world export / import / auto-backup, run against the single-file build.
// The backup folder picker is simulated with the browser's private file system (same API
// as a real folder), so every read and write goes through the real File System Access code.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import zlib from 'node:zlib';

const URL = process.env.URL || 'http://localhost:8765/index.html';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, typeof info === 'string' ? info : JSON.stringify(info)]); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

const MOCK = `window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('MineCraft', { create: true });`;
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
await ctx.addInitScript(MOCK);
let page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
const screen = () => ev(() => window.__bf.state().screen);
const toasts = () => ev(() => window.__bf.ui.get().toasts.map((t) => `${t.title}|${t.desc}`));
const clearToasts = () => ev(() => window.__bf.ui.set({ toasts: [] }));
const folderFiles = () => ev(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('MineCraft', { create: true });
  const out = [];
  for await (const h of d.values()) if (h.kind === 'file') { const f = await h.getFile(); out.push({ name: h.name, size: f.size, modified: f.lastModified }); }
  return out;
});
const readFolderFile = async (name) => {
  const b64 = await ev(async (name) => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('MineCraft');
    const buf = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, name);
  return Buffer.from(b64, 'base64');
};
const openTitle = async () => { await page.goto(URL); await page.waitForSelector('[data-testid=btn-singleplayer]'); await wait(800); };
const toWorlds = async () => { await page.click('[data-testid=btn-singleplayer]'); await page.waitForSelector('[data-testid=world-select]'); await wait(500); };
const selectWorld = async (name) => { await page.locator('[data-testid=world-entry]', { hasText: name }).first().click(); await wait(200); };
const playSelected = async () => { await page.click('[data-testid=btn-play-selected]'); await waitFor(async () => (await screen()) === 'game', 90000); await ev(() => window.__bf.allowUnlocked(true)); await wait(1500); };
const saveAndQuit = async () => { await page.keyboard.press('Escape'); await wait(400); await page.click('[data-testid=btn-save-quit]'); await waitFor(async () => (await screen()) === 'title', 20000); await wait(600); };

// ---------------------------------------------------------------- 1. make a world with changes
await openTitle();
await toWorlds();
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Backup Test');
await page.fill('[data-testid=world-seed]', 'backup-seed');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await screen()) === 'game', 90000);
await ev(() => window.__bf.allowUnlocked(true));
await wait(2000);
const mark = await ev(() => {
  const bf = window.__bf, g = bf.game, p = g.player;
  const x = Math.floor(p.x) + 3, z = Math.floor(p.z), y = g.world.highestSolid(x, z) + 1;
  bf.setBlock(x, y, z, 'bricks'); bf.setBlock(x, y + 1, z, 'glass');
  g.inventory.slots[0] = { id: 'iron_pickaxe', count: 1 }; g.inventory.slots[1] = { id: 'torch', count: 17 }; g.inventory.changed();
  return { x, y, z };
});
await wait(800);
await saveAndQuit();
check('no backup made before a folder is chosen', (await folderFiles()).length === 0);

// ---------------------------------------------------------------- 2. export into the folder
await toWorlds();
check('the world played last is already selected, so Export World is ready', !(await page.locator('[data-testid=btn-export-world]').isDisabled()) && (await page.locator('[data-testid=world-entry].selected', { hasText: 'Backup Test' }).count()) === 1);
await selectWorld('Backup Test');
await clearToasts();
await page.click('[data-testid=btn-export-world]');
await waitFor(async () => (await folderFiles()).length > 0, 10000);
await wait(300);
let files = await folderFiles();
check('export writes one .blockfell file to the chosen folder', files.length === 1 && files[0].name === 'Backup Test.blockfell', files);
const t1 = await toasts();
check('export shows a confirmation naming the folder', t1.some((t) => t.startsWith('World exported|MineCraft/Backup Test.blockfell')) && t1.some((t) => t.startsWith('Auto backup is on')), t1);
await page.screenshot({ path: `${SHOTS}/bk_exported.png` });
const raw1 = await readFolderFile('Backup Test.blockfell');
check('backup file is gzip-compressed', raw1[0] === 0x1f && raw1[1] === 0x8b, raw1.length + ' bytes');
const data1 = JSON.parse(zlib.gunzipSync(raw1).toString('utf8'));
/** The overworld part of a backup (format 2, 1.10) or the whole file (format 1). */
const land = (d) => d.dims?.overworld ?? { chunks: d.chunks, extra: d.extra };
check('backup contains world, player, chunk changes and extras',
  data1.format === 'blockfell-world' && data1.world.name === 'Backup Test' && data1.world.seedText === 'backup-seed' && data1.world.player?.inventory?.[0]?.id === 'iron_pickaxe'
  && data1.formatVersion === 2 && Object.keys(land(data1).chunks).length >= 1 && !!land(data1).extra,
  { chunks: Object.keys(land(data1).chunks).length, bytes: raw1.length, fv: data1.formatVersion });

// ---------------------------------------------------------------- 3. folder is remembered after a reload
await page.close();
page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await openTitle();
await toWorlds();
await page.click('[data-testid=btn-import-world]');
await page.waitForSelector('[data-testid=import-world]');
await waitFor(async () => (await page.locator('[data-testid=backup-entry]').count()) > 0, 10000);
check('Import World lists the backups in the remembered folder', (await page.locator('[data-testid=backup-entry]').count()) === 1
  && (await page.locator('[data-testid=import-world]').innerText()).includes('Backup folder: MineCraft'));
await page.mouse.move(5, 5);
await page.screenshot({ path: `${SHOTS}/bk_import_screen.png` });
await page.locator('text=Cancel').last().click();
await wait(400);

// ---------------------------------------------------------------- 4. delete locally, restore from the folder
await selectWorld('Backup Test');
await page.locator('.btn', { hasText: 'Delete' }).click();
await page.click('[data-testid=btn-confirm-delete]');
await wait(800);
check('world deleted from this browser', (await page.locator('[data-testid=world-entry]').count()) === 0);
check('Export World disabled with no world to export', await page.locator('[data-testid=btn-export-world]').isDisabled());
await page.click('[data-testid=btn-import-world]');
await waitFor(async () => (await page.locator('[data-testid=backup-entry]').count()) > 0, 10000);
await page.locator('[data-testid=backup-entry]').first().click();
await page.click('[data-testid=btn-import-selected]');
await waitFor(async () => (await screen()) === 'worlds', 10000);
await wait(600);
const listed = await page.locator('[data-testid=world-entry]').allInnerTexts();
check('imported world appears in the world list, selected', listed.length === 1 && listed[0].includes('Backup Test')
  && (await page.locator('.world-entry.selected').count()) === 1, listed);
await playSelected();
const restored = await ev((m) => ({ a: window.__bf.getBlock(m.x, m.y, m.z), b: window.__bf.getBlock(m.x, m.y + 1, m.z), inv: window.__bf.inventory() }), mark);
check('restored world keeps placed blocks and inventory', restored.a === 'bricks' && restored.b === 'glass'
  && restored.inv.includes('0:iron_pickaxex1') && restored.inv.includes('1:torchx17'), restored);

// ---------------------------------------------------------------- 5. auto backup on Save and Quit
await ev((m) => { window.__bf.setBlock(m.x, m.y + 2, m.z, 'lumen'); }, mark);
await wait(500);
const before = (await folderFiles())[0];
await clearToasts();
await saveAndQuit();
await wait(500);
const after = (await folderFiles())[0];
const data2 = JSON.parse(zlib.gunzipSync(await readFolderFile('Backup Test.blockfell')).toString('utf8'));
const t2 = await toasts();
check('Save and Quit updates the backup automatically', after.modified >= before.modified && data2.exported > data1.exported, { before: before.modified, after: after.modified });
check('auto backup includes the latest change', JSON.stringify(land(data2).chunks) !== JSON.stringify(land(data1).chunks));
check('auto backup confirmation shown', t2.some((t) => t.startsWith('World backed up|MineCraft/')), t2);

// ---------------------------------------------------------------- 6. importing an existing world: keep both, then replace
await toWorlds();
await page.click('[data-testid=btn-import-world]');
await waitFor(async () => (await page.locator('[data-testid=backup-entry]').count()) > 0, 10000);
await page.locator('[data-testid=backup-entry]').first().click();
await page.click('[data-testid=btn-import-selected]');
await page.waitForSelector('[data-testid=import-conflict]', { timeout: 10000 });
check('importing a world that exists asks what to do', true);
await page.mouse.move(5, 5);
await page.screenshot({ path: `${SHOTS}/bk_conflict.png` });
await page.click('[data-testid=btn-import-copy]');
await waitFor(async () => (await screen()) === 'worlds', 10000);
await wait(600);
let names = (await page.locator('[data-testid=world-entry]').allInnerTexts()).map((t) => t.split('\n')[0]);
check('Keep Both adds a second, renamed world', names.length === 2 && names.includes('Backup Test') && names.includes('Backup Test (imported)'), names);
await page.click('[data-testid=btn-import-world]');
await waitFor(async () => (await page.locator('[data-testid=backup-entry]').count()) > 0, 10000);
await page.locator('[data-testid=backup-entry]').first().click();
await page.click('[data-testid=btn-import-selected]');
await page.waitForSelector('[data-testid=import-conflict]');
await page.click('[data-testid=btn-import-replace]');
await waitFor(async () => (await screen()) === 'worlds', 10000);
await wait(600);
names = (await page.locator('[data-testid=world-entry]').allInnerTexts()).map((t) => t.split('\n')[0]);
check('Replace overwrites instead of adding', names.length === 2, names);

// ---------------------------------------------------------------- 7. auto backup can be switched off
await page.click('[data-testid=btn-import-world]');
await page.waitForSelector('[data-testid=btn-auto-backup]');
await page.click('[data-testid=btn-auto-backup]');
check('auto backup toggles off', (await page.locator('[data-testid=btn-auto-backup]').innerText()).includes('OFF'));
await page.locator('text=Cancel').last().click();
await wait(300);
await selectWorld('Backup Test (imported)');
await playSelected();
const count0 = (await folderFiles()).length;
await saveAndQuit();
check('no automatic backup when switched off', (await folderFiles()).length === count0);
// a second world with the same name gets its own file
await toWorlds();
await selectWorld('Backup Test (imported)');
await ev(async () => { const s = window.__bf.engine.saves; const w = (await s.listWorlds()).find((x) => x.name === 'Backup Test (imported)'); await s.putWorld({ ...w, name: 'Backup Test' }); window.__bf.ui.set((x) => ({ worldsVersion: x.worldsVersion + 1, selectedWorld: w.id })); });
await wait(600);
await page.click('[data-testid=btn-export-world]');
await waitFor(async () => (await folderFiles()).length === 2, 8000);
files = await folderFiles();
check('two worlds with the same name never overwrite each other\'s backup', files.length === 2, files.map((f) => f.name));
const backupBytes = await readFolderFile('Backup Test.blockfell');

// ---------------------------------------------------------------- 8. browsers without folder access (Firefox/Safari): download + file picker
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
await ctx2.addInitScript('delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker;');
page = await ctx2.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await openTitle();
await toWorlds();
await page.click('[data-testid=btn-import-world]');
await page.waitForSelector('[data-testid=import-world]');
await wait(500);
check('fallback: explains importing from a file', (await page.locator('[data-testid=import-world]').innerText()).includes('cannot open a folder directly'));
const tmp = '/tmp/bk_test_upload.blockfell';
fs.writeFileSync(tmp, backupBytes);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=btn-import-file]')]);
await chooser.setFiles(tmp);
await waitFor(async () => (await screen()) === 'worlds', 10000);
await wait(600);
check('fallback: Import From File restores the world', (await page.locator('[data-testid=world-entry]').allInnerTexts()).some((t) => t.includes('Backup Test')));
await selectWorld('Backup Test');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-testid=btn-export-world]')]);
const dlPath = '/tmp/bk_test_download.blockfell';
await dl.saveAs(dlPath);
const dlData = JSON.parse(zlib.gunzipSync(fs.readFileSync(dlPath)).toString('utf8'));
check('fallback: Export World downloads a valid backup', dl.suggestedFilename() === 'Backup Test.blockfell' && dlData.world.name === 'Backup Test', dl.suggestedFilename());
// damaged / wrong files are rejected cleanly
fs.writeFileSync('/tmp/bk_bad.blockfell', 'this is not a world');
await page.click('[data-testid=btn-import-world]');
await page.waitForSelector('[data-testid=import-world]');
const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=btn-import-file]')]);
await ch2.setFiles('/tmp/bk_bad.blockfell');
await page.waitForSelector('[data-testid=import-error]', { timeout: 5000 }).catch(() => null);
const err = await page.locator('[data-testid=import-error]').innerText().catch(() => '');
check('a file that is not a backup is rejected with a message', err.includes('Not a Blockfell world backup'), err);

await b.close();
console.log('\n===== BACKUP RESULTS =====');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(62)} ${i.slice(0, 150)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
