import { createWorld, waitChunks } from './lib.mjs';
const vw = 854, vh = 480;
export default async (page, h) => {
  await createWorld(page, h, { name: 'Dbg', seed: 'creative-run', creative: true });
  await h.wait(3000);
  await page.mouse.move(vw / 2, vh / 2); await h.wait(300);
  await h.ev(() => { const g = window.__bf.game, p = g.player; const m = g.entities.spawnMob('pig', p.x, p.y, p.z - 2, g); m.tick = function () { this.beginTick(); }; window.__pig = m; window.__bf.aimAt(m.x, m.y + 0.5, m.z); });
  await h.wait(800);
  console.log(JSON.stringify(await h.ev(() => { const g = window.__bf.game; return { tm: !!g.targetMob, t: g.target && g.target.block, pig: [window.__pig.x, window.__pig.y, window.__pig.z], box: window.__pig.box, p: [g.player.x, g.player.eyeY, g.player.z], yaw: g.player.yaw, pitch: g.player.pitch, overlay: window.__bf.ui.get().overlay, focus: window.__bf.engine.input.gameFocus }; })));
  await page.mouse.click(vw / 2, vh / 2);
  await h.wait(800);
  console.log('hp', await h.ev(() => window.__pig.health));
};
