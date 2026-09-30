export async function createWorld(page, h, { name = 'Test', seed = '12345', creative = false, bonus = false } = {}) {
  await page.waitForSelector('[data-testid=btn-singleplayer]');
  await page.click('[data-testid=btn-singleplayer]');
  await page.click('[data-testid=btn-create-new]');
  await page.fill('[data-testid=world-name]', name);
  await page.fill('[data-testid=world-seed]', seed);
  if (creative) await page.click('[data-testid=btn-gamemode]');
  if (bonus) await page.click('text=Bonus Chest: OFF');
  await page.click('[data-testid=btn-create-world]');
  for (let i = 0; i < 90; i++) {
    const s = await h.state();
    if (s.screen === 'game') break;
    await h.wait(1000);
  }
  await h.ev(() => window.__bf.allowUnlocked(true));
  await h.wait(500);
}
export async function waitChunks(h, maxSec = 60) {
  for (let i = 0; i < maxSec; i++) {
    const s = await h.state();
    if (s.chunks && s.chunks.genQueued === 0 && s.chunks.meshQueued === 0 && s.chunks.inflight === 0) return s;
    await h.wait(1000);
  }
  return h.state();
}
