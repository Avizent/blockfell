// Smoke test in a real WebKit engine (WebKitGTK MiniBrowser driven over WebDriver),
// posing as an iPhone so Blockfell switches to its touch controls. Checks that the
// single-file build parses and runs in WebKit (JavaScriptCore, WebKit's WebGL 2 and
// CSS), then plays a little with synthetic touch pointer events.
//
// Needs: apt install webkit2gtk-driver; Xvfb. Serve a build, e.g.
//   (cd dist-single && python3 -m http.server 8766) &
//   xvfb-run -a -s "-screen 0 1280x800x24" WebKitWebDriver --port=4444 &
//   URL=http://localhost:8766/ node tests/t_webkit.mjs
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:8766/';
const WD = process.env.WD || 'http://localhost:4444';
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 500)); };

async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
}
const session = await wd('POST', '/session', {
  capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', args: ['--automation', `--user-agent=${UA}`] } } },
});
const sid = session.sessionId;
const S = (p) => `/session/${sid}${p}`;
const js = (fn, ...args) => wd('POST', S('/execute/sync'), { script: `return (${fn}).apply(null, arguments)`, args });
const jsAsync = (fn, ...args) => wd('POST', S('/execute/async'), { script: `const done = arguments[arguments.length - 1]; Promise.resolve((${fn}).apply(null, Array.prototype.slice.call(arguments, 0, -1))).then(done, (e) => done({ error: String(e) }));`, args });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* page loading */ } await wait(300); } return false; };
const shot = async (n) => { const b64 = await wd('GET', S('/screenshot')); fs.writeFileSync(`${SHOTS}/${n}.png`, Buffer.from(b64, 'base64')); };

try {
  await wd('POST', S('/window/rect'), { width: 900, height: 480 });
  await wd('POST', S('/url'), { url: URL });
  const booted = await waitFor(() => js(() => !!(window.__bf && document.querySelector('[data-testid=btn-singleplayer]'))), 60000);
  await js(() => { window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason))); });
  const env = await js(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return { ua: navigator.userAgent.slice(0, 40), webgl2: !!gl, touch: window.__bf?.ui.get().touch, gui: window.__bf?.ui.get().gui, w: innerWidth, h: innerHeight, engine: /AppleWebKit/.test(navigator.userAgent) };
  });
  check('the single-file build loads and runs in WebKit (title screen shown)', booted, env);
  check('WebKit gives it WebGL 2', env.webgl2 === true, env);
  check('posing as an iPhone, it switches to touch controls', env.touch === true, env);
  await shot('webkit_title');

  // create a world with the page's own buttons
  await js(() => document.querySelector('[data-testid=btn-singleplayer]').click());
  await wait(400);
  await js(() => document.querySelector('[data-testid=btn-create-new]').click());
  await wait(400);
  await js(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('[data-testid=world-name]', 'WebKit'); set('[data-testid=world-seed]', 'webkit');
  });
  await wait(200);
  await js(() => document.querySelector('[data-testid=btn-create-world]').click());
  const inGame = await waitFor(() => js(() => window.__bf.state().screen === 'game'), 180000);
  check('a new world generates and loads (workers, IndexedDB, meshing)', inGame, await js(() => window.__bf.state().screen));
  await wait(3000);
  const f0 = await js(() => ({ fps: window.__bf.engine.loop.fps, ticks: window.__bf.game.tickCount, draws: window.__bf.state().drawCalls, chunks: window.__bf.state().chunks?.loaded ?? null, controls: !!document.querySelector('[data-testid=touch-controls]') }));
  await wait(2000);
  const f1 = await js(() => ({ ticks: window.__bf.game.tickCount, draws: window.__bf.state().drawCalls }));
  check('the game loop runs and draws the world', f1.ticks > f0.ticks && f0.draws > 0, { f0, f1 });
  check('the on-screen controls are shown', f0.controls, f0);
  await shot('webkit_game');

  // ---- synthetic touch pointer events (as WebKit would deliver them from a finger)
  const P = (type, el, x, y, id) => js((type, sel, x, y, id) => {
    const target = sel ? document.querySelector(sel) : document.elementFromPoint(x, y);
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
    return target.className || target.tagName;
  }, type, el, x, y, id);
  const size = await js(() => ({ w: innerWidth, h: innerHeight }));
  // flat ground, looking along -z
  await js(() => { const bf = window.__bf, g = bf.game, p = g.player; g.rules.doMobSpawning = false; for (const e of g.entities.list) if (e.type !== 'item') e.removed = true;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z), y = g.world.highestSolid(x0, z0) + 2;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -12; dz <= 8; dz++) { bf.setBlock(x0 + dx, y - 1, z0 + dz, 'stone'); bf.setBlock(x0 + dx, y, z0 + dz, 'grass'); for (let k = 1; k <= 6; k++) bf.setBlock(x0 + dx, y + k, z0 + dz, 'air'); }
    g.setGameMode('survival'); g.teleport(x0 + 0.5, y + 1, z0 + 0.5); p.yaw = 0; p.pitch = 0; });
  await wait(1500);
  const sx = 110, sy = size.h - 90;
  const a = await js(() => ({ z: window.__bf.game.player.z }));
  await P('pointerdown', '[data-testid=touch-controls]', sx, sy, 1);
  await P('pointermove', '[data-testid=touch-controls]', sx, sy - 45, 1);
  await wait(1500);
  const stick = await js(() => window.__bf.engine.input.stick);
  await P('pointerup', '[data-testid=touch-controls]', sx, sy - 45, 1);
  const b = await js(() => ({ z: window.__bf.game.player.z, stick: window.__bf.engine.input.stick }));
  check('the joystick walks the player forward', stick && stick.forward > 0.8 && a.z - b.z > 1 && b.stick === null, { stick, dz: a.z - b.z });
  // drag to look
  const lx = size.w * 0.7, ly = size.h * 0.35;
  const yaw0 = await js(() => window.__bf.game.player.yaw);
  await P('pointerdown', '[data-testid=touch-controls]', lx, ly, 2);
  for (let i = 1; i <= 5; i++) await P('pointermove', '[data-testid=touch-controls]', lx - i * 20, ly, 2);
  await P('pointerup', '[data-testid=touch-controls]', lx - 100, ly, 2);
  await wait(400);
  const yaw1 = await js(() => window.__bf.game.player.yaw);
  check('dragging a finger turns the view', yaw1 - yaw0 > 0.3, { yaw0, yaw1 });
  // tap to place a block
  await js(() => { const g = window.__bf.game; g.player.yaw = 0; g.player.pitch = -0.62; g.inventory.slots[0] = { id: 'planks', count: 5 }; g.inventory.selected = 0; g.inventory.changed(); });
  await wait(500);
  const tgt = await js(() => window.__bf.state().target);
  await P('pointerdown', '[data-testid=touch-controls]', lx, ly, 3);
  await P('pointerup', '[data-testid=touch-controls]', lx, ly, 3);
  await wait(600);
  const placed = tgt && await js((x, y, z) => window.__bf.getBlock(x, y, z), tgt.x, tgt.y + 1, tgt.z);
  check('a tap places the block in your hand', placed === 'planks', { tgt, placed });

  // ---- inventory through the mouse bridge: tap to pick up, drag to the crafting grid
  await js(() => { const g = window.__bf.game; g.inventory.slots.fill(null); g.inventory.slots[9] = { id: 'log', count: 1 }; g.inventory.changed(); });
  await js(() => document.querySelector('[data-testid=touch-inventory]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, pointerType: 'touch', isPrimary: true })));
  await wait(600);
  const centre = (sel) => js((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const from = await centre('[data-slot="main:9"]'), to = await centre('[data-slot^="craft:"]');
  await P('pointerdown', null, from[0], from[1], 5);
  for (let i = 1; i <= 6; i++) await P('pointermove', null, from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6, 5);
  await P('pointerup', null, to[0], to[1], 5);
  await wait(300);
  const grid = await js(() => window.__bf.game.craft2.slots.map((s) => s && `${s.id}x${s.count}`));
  check('drag a stack from the inventory onto the crafting grid (mouse bridge in WebKit)', grid[0] === 'logx1', grid);
  const out = await centre('[data-slot^="output:"]');
  await P('pointerdown', null, out[0], out[1], 6);
  await P('pointerup', null, out[0], out[1], 6);
  await wait(300);
  const cur = await js(() => window.__bf.game.cursor.stack);
  check('tap the result to craft (planks)', cur && cur.id === 'planks' && cur.count === 4, cur);
  await shot('webkit_inventory');
  await js(() => document.querySelector('[data-testid=touch-close]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })));
  await wait(400);
  check('the close button returns to the game', await js(() => window.__bf.state().overlay === null));

  // ---- save and reload in WebKit's IndexedDB
  await js(() => { window.__bf.game.player.pitch = 0; });
  const saved = await jsAsync(async () => { await window.__bf.engine.saveAndQuit(); return window.__bf.state().screen; });
  check('Save and Quit works (IndexedDB in WebKit)', saved === 'title' || saved === 'worlds', saved);
  const errs = await js(() => window.__errs);
  check('no script errors in WebKit', errs.length === 0, errs.slice(0, 5));
} catch (e) {
  check('webkit session', false, String(e));
} finally {
  await wd('DELETE', S('')).catch(() => {});
}
console.log('\n==== SUMMARY');
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(70)} ${i.slice(0, 200)}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
