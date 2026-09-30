import { createWorld, waitChunks } from './lib.mjs';
export default async (page, h) => {
  await createWorld(page, h, { name: 'Clouds', seed: '2024', creative: true });
  await waitChunks(h, 60);
  await h.ev(() => { const g = window.__bf.game; g.player.flying = true; g.teleport(g.player.x, 120, g.player.z); g.player.pitch = 1.5; g.dayNight.time = 6000; });
  await h.wait(1500);
  await h.shot('clouds_up');
  const info = await h.ev(() => { const s = window.__bf.engine.renderer.sky; const c = s.clouds; return { vis: c.visible, pos: c.position.toArray(), far: s.cloudMat.uniforms.uFar.value, color: s.cloudMat.uniforms.uColor.value.toArray(), off: s.cloudMat.uniforms.uOffset.value.toArray() }; });
  console.log(JSON.stringify(info));
};
