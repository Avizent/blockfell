// 2.5.1: the title screen shows the version and the build code.  node tests/t_v251.mjs [url]
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL);
await page.waitForSelector('[data-testid=version-label]', { timeout: 60000 });
const t = await page.textContent('[data-testid=version-label]');
const meta = await page.evaluate(() => document.querySelector('meta[name=blockfell-version]')?.content);
const ok = /^Blockfell \d+\.\d+\.\d+ \(build \S+\)$/.test(t) && (!meta || t.includes(meta));
console.log(ok ? 'PASS' : 'FAIL', 'title shows version and build', t, meta);
await b.close();
process.exit(ok ? 0 : 1);
