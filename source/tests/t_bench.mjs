export default async (page, h) => {
  for (let i = 0; i < 150; i++) {
    const r = await page.evaluate(() => window.__benchResult);
    if (r) break;
    await h.wait(2000);
  }
  await h.shot('bench');
  console.log(await page.evaluate(() => document.getElementById('bench-panel')?.textContent));
};
