export default async (page, h) => {
  await h.wait(3000);
  await page.click('[data-testid=btn-singleplayer]');
  await h.wait(500);
  await h.shot('worlds_empty');
  await page.click('[data-testid=btn-create-new]');
  await h.wait(300);
  await page.fill('[data-testid=world-name]', 'Test Survival');
  await page.fill('[data-testid=world-seed]', '12345');
  await h.shot('create');
  await page.click('[data-testid=btn-create-world]');
  await h.wait(1500);
  await h.shot('loading');
  for (let i = 0; i < 60; i++) {
    const s = await h.state();
    if (s.screen === 'game') break;
    await h.wait(1000);
  }
  await h.ev(() => window.__bf.allowUnlocked(true));
  await h.wait(3000);
  await h.shot('ingame');
  console.log(JSON.stringify(await h.state(), null, 1));
};
