import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Greedy', seed: '424242', creative: true });
  await waitChunks(h, 90);
  const pc = await h.ev(() => { const p = window.__bf.game.player; return [Math.floor(p.x) >> 4, Math.floor(p.z) >> 4]; });
  const res = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, -1], [2, -1], [-2, 2]]) {
    res.push(await h.ev(([cx, cz]) => ({ ...window.__bf.meshCompare(cx, cz), brute: window.__bf.bruteForceFaces(cx, cz), mesherFaces: window.__bf.meshStatsFor(cx, cz)?.visibleFaces }), [pc[0] + dx, pc[1] + dz]));
  }
  console.log(JSON.stringify(res));
  await h.ev(() => window.__bf.look(0.8, -0.35));
  await h.wait(1500);
  await h.shot('greedy_view');
};
