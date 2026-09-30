import { createWorld, waitChunks } from './lib.mjs';
// CHUNK ENGINE ACCEPTANCE TEST (spec section 38)
export default async (page, h) => {
  await createWorld(page, h, { name: 'Engine Test', seed: '424242', creative: true });
  const s0 = await waitChunks(h, 120);
  const out = {};
  out.afterLoad = { loaded: s0.chunks.loaded, meshed: s0.chunks.meshed, visible: s0.chunks.visible, drawCalls: s0.drawCalls, triangles: s0.triangles, genMs: s0.chunks.genMs, meshMs: s0.chunks.meshMs, lightMs: s0.chunks.lightMs };
  out.audit = await h.ev(() => window.__bf.sceneAudit());
  const pc = await h.ev(() => { const p = window.__bf.game.player; return [Math.floor(p.x) >> 4, Math.floor(p.z) >> 4]; });
  out.meshCompare = await h.ev(([cx, cz]) => window.__bf.meshCompare(cx, cz), pc);
  // hidden-face elimination correctness incl. chunk borders: mesher count == brute force
  const faceChecks = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, -1], [2, -1]]) {
    const r = await h.ev(([cx, cz]) => ({ brute: window.__bf.bruteForceFaces(cx, cz), mesher: window.__bf.meshStatsFor(cx, cz)?.visibleFaces }), [pc[0] + dx, pc[1] + dz]);
    faceChecks.push(r);
  }
  out.faceChecks = faceChecks;
  // frustum culling: look straight up vs horizontal
  await h.ev(() => window.__bf.look(0, 0)); await h.wait(1500);
  const horiz = await h.state();
  await h.ev(() => window.__bf.look(0, 1.5)); await h.wait(1500);
  const up = await h.state();
  out.frustum = { horizontalVisible: horiz.chunks.visible, horizontalDraws: horiz.drawCalls, upVisible: up.chunks.visible, upDraws: up.drawCalls, meshed: up.chunks.meshed };
  await h.ev(() => window.__bf.look(0, -0.3));
  // single interior edit: only the owning chunk remeshes, nothing regenerates
  const edit = await h.ev(async ([cx, cz]) => {
    const bf = window.__bf, g = bf.game;
    const x = cx * 16 + 8, z = cz * 16 + 8;
    const y = g.world.highestSolid(x, z);
    const before = { gen: g.chunks.stats.totalGenerated, meshed: g.chunks.stats.totalMeshed, c: bf.chunkInfo(cx, cz), n: bf.chunkInfo(cx + 1, cz) };
    bf.setBlock(x, y + 1, z, 'stone');
    await new Promise((r) => setTimeout(r, 1500));
    const after = { gen: g.chunks.stats.totalGenerated, meshed: g.chunks.stats.totalMeshed, c: bf.chunkInfo(cx, cz), n: bf.chunkInfo(cx + 1, cz), block: bf.getBlock(x, y + 1, z) };
    return { before, after };
  }, pc);
  out.interiorEdit = edit;
  // boundary edit (lx = 0): both chunks must remesh
  out.boundaryEdit = await h.ev(async ([cx, cz]) => {
    const bf = window.__bf, g = bf.game;
    const x = cx * 16, z = cz * 16 + 5;
    const y = g.world.highestSolid(x, z);
    const b = { own: bf.chunkInfo(cx, cz), west: bf.chunkInfo(cx - 1, cz), meshed: g.chunks.stats.totalMeshed };
    bf.setBlock(x, y + 1, z, 'planks');
    await new Promise((r) => setTimeout(r, 1500));
    const a = { own: bf.chunkInfo(cx, cz), west: bf.chunkInfo(cx - 1, cz), meshed: g.chunks.stats.totalMeshed };
    const faces = { brute: bf.bruteForceFaces(cx - 1, cz), mesher: bf.meshStatsFor(cx - 1, cz).visibleFaces };
    return { before: b, after: a, westFaces: faces };
  }, pc);
  // exploration: fly in a straight line, sample memory
  const samples = [];
  for (let step = 0; step < 8; step++) {
    await h.ev((d) => { const g = window.__bf.game; g.player.flying = true; g.teleport(g.player.x + 64, 110, g.player.z); }, step);
    await h.wait(6000);
    const st = await h.state();
    const a = await h.ev(() => window.__bf.sceneAudit());
    samples.push({ x: Math.round(st.player.x), loaded: st.chunks.loaded, meshed: st.chunks.meshed, unloaded: st.chunks.totalUnloaded, geometries: a.geometries, chunkMeshes: a.chunkMeshes, genQ: st.chunks.genQueued });
  }
  out.exploration = samples;
  // return to origin: modifications still there
  out.persistAfterReturn = await h.ev(async ([cx, cz]) => {
    const g = window.__bf.game;
    g.teleport(cx * 16 + 8, 110, cz * 16 + 8);
    await new Promise((r) => setTimeout(r, 8000));
    const x = cx * 16 + 8, z = cx * 16 + 8;
    return { chunkLoaded: !!window.__bf.chunkInfo(cx, cz), deltaChunks: g.world.deltas.size };
  }, pc);
  const x = pc[0] * 16 + 8, z = pc[1] * 16 + 8;
  out.editedBlock = await h.ev(([x, z]) => { const g = window.__bf.game; const y = g.world.highestSolid(x, z); return window.__bf.getBlock(x, y, z); }, [x, z]);
  console.log(JSON.stringify(out, null, 1));
  await h.shot('engine_end');
};
