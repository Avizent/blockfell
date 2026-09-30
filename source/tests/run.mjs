// Generic scripted browser session. Usage: node tests/run.mjs <script.mjs>
// The script module default-exports async (page, helpers) => {...}
import { chromium } from 'playwright-core';
import path from 'node:path';
const scriptPath = path.resolve(process.argv[2]);
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 720);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const helpers = {
  shot: async (name) => { await page.screenshot({ path: `/tmp/shots/${name}.png` }); console.log('shot', name); },
  wait: (ms) => page.waitForTimeout(ms),
  state: () => page.evaluate(() => window.__bf.state()),
  ev: (fn, arg) => page.evaluate(fn, arg),
  logs,
};
await import('node:fs').then((fs) => fs.mkdirSync('/tmp/shots', { recursive: true }));
await page.goto(url);
try {
  const mod = await import(scriptPath + '?t=' + Date.now());
  await mod.default(page, helpers);
} catch (e) {
  console.log('SCRIPT ERROR', e);
}
console.log('--- console ---');
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
