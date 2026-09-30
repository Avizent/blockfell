// Usage: node tests/shot.mjs <url> <out.png> [waitMs] [evalScript]
import { chromium } from 'playwright-core';
const [url, out, wait = '6000', script] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(wait));
if (script) {
  const r = await page.evaluate(script);
  console.log('EVAL:', JSON.stringify(r, null, 1));
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
