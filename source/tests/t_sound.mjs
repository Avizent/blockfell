// Tests for the Sound and Music switches (1.7.1): Options, the pause menu, the M key,
// remembered across restarts, silence while off (no sounds made, audio engine asleep),
// and the pause-menu switch by touch on an emulated iPhone.
// node tests/t_sound.mjs          (dev server, or URL=http://localhost:8765/ for dist-single)
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { const s = typeof info === 'string' ? info : JSON.stringify(info); results.push([ok ? 'PASS' : 'FAIL', name, s]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : s.slice(0, 600)); };
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const errors = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* navigating */ } await wait(200); } return false; };
const audio = () => ev(() => window.__bf.engine.audio.status());
const label = (id) => ev((id) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null, id);
const chat = () => ev(() => window.__bf.ui.get().chat.map((c) => c.text));
const stored = () => ev(() => { try { return JSON.parse(localStorage.getItem('blockfell.options.v1') || '{}'); } catch { return {}; } });
// a burst of ordinary game sounds: returns how many actually started
const noises = () => ev(() => {
  const g = window.__bf.game, a = window.__bf.engine.audio, p = g.player, before = a.played;
  for (const n of ['place:stone', 'break:wood', 'step:grass', 'pop', 'click']) g.sound(n, p.x, p.y, p.z);
  a.play('click');
  return a.played - before;
});

// ================================================================== title screen, defaults
await page.goto(URL);
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await page.mouse.click(640, 700); await wait(300);                 // a first click: the browser lets sound start
await page.click('text=Options...'); await wait(300);
const d0 = { sound: await label('btn-sound'), music: await label('btn-music'), a: await audio() };
check('Options has Sound and Music switches, both ON to begin with', d0.sound === 'Sound: ON' && d0.music === 'Music: ON' && d0.a.enabled && d0.a.music, d0);
check('...and sound is running', d0.a.state === 'running' && d0.a.master > 0, d0.a);
await page.click('[data-testid=btn-options-done]'); await wait(300);

// ================================================================== in a world
await page.click('[data-testid=btn-singleplayer]'); await wait(300);
await page.click('[data-testid=btn-create-new]');
await page.fill('[data-testid=world-name]', 'Sound Test');
await page.fill('[data-testid=world-seed]', 'sound');
await page.click('[data-testid=btn-gamemode]');
await page.click('[data-testid=btn-create-world]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'game', 90000);
await ev(() => { window.__bf.allowUnlocked(true); window.__bf.ui.set({ chat: [] }); const g = window.__bf.game; g.rules.doWeatherCycle = false; g.weather.set('clear', 99999, true); });
await wait(1500);
const on1 = await noises();
check('with Sound on, game sounds play', on1 === 6, on1);

// M switches it off
await page.keyboard.press('KeyM'); await wait(400);
const off = { a: await audio(), chat: await chat(), opt: await ev(() => window.__bf.engine.options.sound), stored: (await stored()).sound };
check('M switches all sound off (silenced, audio engine asleep)', !off.a.enabled && off.a.master === 0 && off.a.state === 'suspended' && off.opt === false, off.a);
check('...says so, and how to turn it back on', off.chat.some((t) => /Sound off - press M/.test(t)), off.chat);
check('...and is remembered', off.stored === false, off.stored);
const off1 = await noises();
// thunder and rain are silent too
await ev(() => { const a = window.__bf.engine.audio; a.thunder(1); a.setWeather(1, false, false); a.updateMusic(999, false); });
const offA = await audio();
check('while off, nothing plays: no sound effects, thunder, rain or music', off1 === 0 && offA.state === 'suspended' && offA.played === off.a.played, { off1, offA });
// clicking and typing in the game don't wake it
await page.mouse.click(640, 360); await page.keyboard.press('KeyW'); await wait(300);
check('clicks and key presses leave it asleep', (await audio()).state === 'suspended');

// M again switches it back on
await ev(() => window.__bf.ui.set({ chat: [] }));
await page.keyboard.press('KeyM');
await waitFor(async () => (await audio()).state === 'running', 5000);
const back = { a: await audio(), chat: await chat(), n: await noises() };
check('M switches it back on, at the same volume as before', back.a.enabled && back.a.state === 'running' && Math.abs(back.a.master - (await ev(() => window.__bf.engine.options.masterVolume))) < 1e-6 && back.n === 6, back);
check('...and says so', back.chat.includes('Sound on'), back.chat);

// ================================================================== pause menu
await page.keyboard.press('Escape'); await wait(400);
if ((await ev(() => window.__bf.ui.get().overlay)) !== 'pause') { await ev(() => window.__bf.engine.openOverlay('pause')); await wait(300); }
const p0 = await label('btn-pause-sound');
await page.click('[data-testid=btn-pause-sound]'); await wait(400);
const p1 = { label: await label('btn-pause-sound'), a: await audio() };
check('the pause menu has a Sound switch next to Options', p0 === 'Sound: ON' && p1.label === 'Sound: OFF' && !p1.a.enabled && p1.a.state === 'suspended', { p0, p1 });
await page.click('[data-testid=btn-pause-sound]');
await waitFor(async () => (await audio()).state === 'running', 5000);
check('...and switches it back on', (await label('btn-pause-sound')) === 'Sound: ON' && (await audio()).state === 'running');

// ================================================================== Options: Music switch
await page.click('text=Options...'); await wait(400);
await page.click('[data-testid=btn-music]'); await wait(300);
const m0 = { label: await label('btn-music'), a: await audio(), stored: (await stored()).music };
const m0n = await noises();
check('Music OFF silences the music but not the sound effects', m0.label === 'Music: OFF' && m0.a.musicGain === 0 && m0.a.state === 'running' && m0n === 6 && m0.stored === false, { m0, m0n });
const vol = await ev(() => document.body.innerText.includes('Music Volume: Music OFF'));
check('...and the music slider says so', vol);
await page.click('[data-testid=btn-music]'); await wait(300);
const m1 = await audio();
check('Music ON brings it back', (await label('btn-music')) === 'Music: ON' && Math.abs(m1.musicGain - (await ev(() => window.__bf.engine.options.musicVolume)) * 0.35) < 1e-6, m1);
await page.click('[data-testid=btn-sound]'); await wait(300);
check('the Options Sound switch works too', (await label('btn-sound')) === 'Sound: OFF' && !(await audio()).enabled && (await ev(() => document.body.innerText.includes('Master Volume: Sound OFF'))));
await page.click('[data-testid=btn-options-done]'); await wait(300);
await page.click('[data-testid=btn-back-to-game]').catch(() => undefined); await wait(300);

// ================================================================== controls list
await page.keyboard.press('Escape'); await wait(300);
await page.click('text=Options...'); await wait(300);
await page.click('text=Controls...'); await wait(300);
check('the Controls list shows M: Sound on / off', await ev(() => document.body.innerText.includes('Sound on / off')));
await page.click('text=Done'); await wait(200);
await page.click('[data-testid=btn-options-done]'); await wait(300);

// ================================================================== remembered across a restart
await page.click('[data-testid=btn-save-quit]');
await waitFor(async () => (await ev(() => window.__bf?.state().screen)) === 'title', 30000);
await page.reload();
await page.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
await wait(800);
// (Reopen Last World may have taken us back into the world: either way, click and type)
await page.mouse.click(640, 700); await page.keyboard.press('KeyA'); await wait(400);
const r0 = await audio();
check('after a restart Sound is still OFF, and clicks and keys start no sound at all', !r0.enabled && r0.state === 'none', r0);
if ((await ev(() => window.__bf.state().screen)) === 'game') { await ev(() => window.__bf.engine.openOverlay('pause')); await wait(300); } else { await page.click('text=Options...'); await wait(300); }
const sid = (await ev(() => !!document.querySelector('[data-testid=btn-pause-sound]'))) ? 'btn-pause-sound' : 'btn-sound';
check('...the switch shows OFF', (await label(sid)) === 'Sound: OFF', await label(sid));
await page.click(`[data-testid=${sid}]`);
await waitFor(async () => (await audio()).state === 'running', 5000);
check('switching it on starts sound (the tap is the gesture the browser needs)', (await audio()).state === 'running' && (await label(sid)) === 'Sound: ON');

// ================================================================== by touch: the pause-menu switch on an iPhone
{
  const tctx = await b.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push('touch: ' + String(e)));
  const tev = (fn, a) => tp.evaluate(fn, a);
  await tp.goto(URL);
  await tp.waitForSelector('[data-testid=btn-singleplayer]', { timeout: 60000 });
  await tp.locator('[data-testid=btn-singleplayer]').tap(); await tp.waitForTimeout(300);
  await tp.locator('[data-testid=btn-create-new]').tap();
  await tp.fill('[data-testid=world-name]', 'Touch Sound');
  await tp.locator('[data-testid=btn-create-world]').tap();
  const t0 = Date.now(); while (Date.now() - t0 < 90000 && (await tev(() => window.__bf?.state().screen)) !== 'game') await tp.waitForTimeout(300);
  await tp.waitForTimeout(1500);
  await tp.locator('[data-testid=touch-pause]').tap().catch(async () => { await tev(() => window.__bf.engine.openOverlay('pause')); });
  await tp.waitForTimeout(400);
  const before = await tev(() => window.__bf.engine.audio.status());
  await tp.locator('[data-testid=btn-pause-sound]').tap(); await tp.waitForTimeout(400);
  const after = await tev(() => ({ a: window.__bf.engine.audio.status(), label: document.querySelector('[data-testid=btn-pause-sound]')?.textContent }));
  check('on a phone, one tap on the pause menu switches sound off', before.enabled && !after.a.enabled && after.label === 'Sound: OFF', { before, after });
  await tp.locator('[data-testid=btn-pause-sound]').tap(); await tp.waitForTimeout(600);
  const again = await tev(() => ({ a: window.__bf.engine.audio.status(), label: document.querySelector('[data-testid=btn-pause-sound]')?.textContent }));
  check('...and another tap switches it back on', again.a.enabled && again.a.state === 'running' && again.label === 'Sound: ON', again);
  await tctx.close();
}

check('no script errors', errors.length === 0, errors);
console.log('\n' + results.map((r) => `${r[0]}  ${r[1].padEnd(76)} ${r[0] === 'FAIL' ? r[2].slice(0, 300) : ''}`).join('\n'));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await b.close();
