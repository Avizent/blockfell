import { engine, BENCH_WORLD } from './engine/Engine';
import { ui } from './ui/uiStore';
import { DEFAULT_RULES } from './systems/SaveManager';

/**
 * Built-in benchmark (open the game with #bench). Creates a temporary creative
 * world, waits for the spawn area, then measures a stationary view, a long
 * high-speed flight that forces continuous chunk generation/meshing/unloading,
 * and block-edit remesh latency. Results are shown on screen and kept on
 * window.__benchResult. The temporary world is deleted afterwards.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function panel(): HTMLPreElement {
  let el = document.getElementById('bench-panel') as HTMLPreElement | null;
  if (!el) {
    el = document.createElement('pre');
    el.id = 'bench-panel';
    Object.assign(el.style, {
      position: 'fixed', left: '8px', top: '8px', zIndex: '10000', margin: '0', padding: '10px 12px',
      background: 'rgba(0,0,0,0.78)', color: '#e8ffe0', font: '13px/1.35 ui-monospace, Menlo, monospace',
      whiteSpace: 'pre', pointerEvents: 'none', maxWidth: '96vw', overflow: 'hidden',
    });
    document.body.appendChild(el);
  }
  return el;
}

function stats(frames: number[]) {
  const s = [...frames].sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  const p99 = s[Math.floor(s.length * 0.99)] ?? 0;
  return { fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2), p99Ms: +p99.toFixed(1), maxMs: +(s[s.length - 1] ?? 0).toFixed(1), low1: +(1000 / (p99 || 1)).toFixed(1), n: frames.length };
}

async function measure(seconds: number, onSecond?: () => void): Promise<number[]> {
  const frames: number[] = [];
  let last = performance.now();
  const end = last + seconds * 1000;
  let nextSec = last + 1000;
  await new Promise<void>((resolve) => {
    const f = (t: number) => {
      frames.push(t - last);
      last = t;
      if (t >= nextSec) { nextSec += 1000; onSecond?.(); }
      if (t < end) requestAnimationFrame(f); else resolve();
    };
    requestAnimationFrame(f);
  });
  return frames.slice(1);
}

export async function runBenchmark(): Promise<void> {
  const out = panel();
  const log: string[] = [];
  const show = (extra = '') => { out.textContent = ['BLOCKFELL BENCHMARK', ...log, extra].join('\n'); };
  show('starting...');
  engine.input.allowUnlocked = true;
  for (const w of await engine.listWorlds()) if (w.name === BENCH_WORLD) await engine.deleteWorld(w.id);
  engine.options.renderDistance = engine.options.renderDistance || 8;
  const t0 = performance.now();
  await engine.createWorld({
    name: BENCH_WORLD, seedText: 'benchmark', gameMode: 'creative', difficulty: 'peaceful',
    structures: true, bonusChest: false, rules: { ...DEFAULT_RULES, doMobSpawning: false },
  });
  while (ui.get().screen !== 'game') { await sleep(100); show(`loading spawn area... ${Math.round(ui.get().loading.progress * 100)}%`); }
  const tSpawn = performance.now() - t0;
  const g = engine.game!;
  engine.updateFocus();
  // wait until the whole render distance is generated and meshed
  let settle = 0;
  while (settle < 90) {
    const c = g.chunks.stats;
    if (c.genQueued === 0 && c.meshQueued === 0 && c.inflight === 0) break;
    await sleep(250); settle += 0.25;
    show(`streaming initial chunks... loaded ${c.loaded} meshed ${c.meshed}`);
  }
  const tFull = performance.now() - t0;
  const cs = g.chunks.stats;
  log.push(`page visible: ${document.visibilityState}, focused: ${document.hasFocus()}`);
  log.push(`GPU: ${gpuName()}  |  ${window.innerWidth}x${window.innerHeight} @ ${engine.renderer.gl.getPixelRatio()}x  |  workers ${engine.pool.size}`);
  log.push(`render distance ${g.chunks.renderDistance} chunks`);
  log.push(`spawn ready ${(tSpawn / 1000).toFixed(1)} s, full view ${(tFull / 1000).toFixed(1)} s (${cs.loaded} loaded / ${cs.meshed} meshed)`);
  log.push(`avg worker time per chunk: gen ${cs.genMs.toFixed(1)} ms, light ${cs.lightMs.toFixed(1)} ms, mesh ${cs.meshMs.toFixed(1)} ms`);

  // stationary
  g.player.pitch = -0.15;
  show('measuring stationary view (6 s)...');
  const st = stats(await measure(6));
  log.push(`STATIONARY: ${st.fps} fps avg, 1% low ${st.low1} fps, worst frame ${st.maxMs} ms | draw calls ${engine.renderer.lastDrawCalls}, triangles ${engine.renderer.lastTriangles.toLocaleString()}, visible chunks ${g.chunks.stats.visible}`);
  show();

  // high-speed flight
  g.player.flying = true;
  g.player.setPosition(g.player.x, 100, g.player.z);
  g.player.pitch = -0.25;
  g.autopilot = { forward: 1, strafe: 0, jump: false, sneak: false, sprint: true };
  const geo0 = engine.renderer.gl.info.memory.geometries;
  const heap = () => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
  const heap0 = heap();
  const x0 = g.player.x, z0 = g.player.z;
  let maxLoaded = 0, maxGeo = 0;
  const fl = stats(await measure(25, () => {
    maxLoaded = Math.max(maxLoaded, g.chunks.stats.loaded);
    maxGeo = Math.max(maxGeo, engine.renderer.gl.info.memory.geometries);
    show(`flying... ${Math.round(Math.hypot(g.player.x - x0, g.player.z - z0))} blocks, loaded ${g.chunks.stats.loaded}, gen queue ${g.chunks.stats.genQueued}`);
  }));
  g.autopilot = null;
  const dist = Math.hypot(g.player.x - x0, g.player.z - z0);
  log.push(`FLIGHT (${dist.toFixed(0)} blocks in 25 s): ${fl.fps} fps avg, 1% low ${fl.low1} fps, worst ${fl.maxMs} ms`);
  log.push(`  chunks generated ${g.chunks.stats.totalGenerated}, unloaded ${g.chunks.stats.totalUnloaded}, peak loaded ${maxLoaded}`);
  log.push(`  GPU geometries ${geo0} -> ${engine.renderer.gl.info.memory.geometries} (peak ${maxGeo}); JS heap ${heap0.toFixed(0)} -> ${heap().toFixed(0)} MB`);
  show();

  // edit latency: place blocks and time until the chunk mesh reflects them
  await sleep(1500);
  const lat: number[] = [];
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(g.player.x) + (i % 5) * 3 - 6, z = Math.floor(g.player.z) - 4 - Math.floor(i / 5) * 3;
    const y = Math.max(1, g.world.highestSolid(x, z)) + 1;
    const c = g.world.getChunk(x >> 4, z >> 4);
    if (!c) continue;
    const start = performance.now();
    g.world.setBlock(x, y, z, 3, 'player');
    const v = c.version;
    while (c.meshedVersion < v && performance.now() - start < 2000) await new Promise((r) => requestAnimationFrame(r));
    lat.push(performance.now() - start);
  }
  lat.sort((a, b) => a - b);
  log.push(`BLOCK EDIT -> REMESH visible: median ${lat[Math.floor(lat.length / 2)]?.toFixed(1)} ms, max ${lat[lat.length - 1]?.toFixed(1)} ms (${lat.length} edits)`);
  const result = { log };
  (window as unknown as Record<string, unknown>).__benchResult = result;
  show('done - temporary world deleted');
  const id = g.record.id;
  await engine.saveAndQuit();
  await engine.deleteWorld(id);
  show('done - temporary world deleted. Reload the page (without #bench) to play.');
}

function gpuName(): string {
  try {
    const gl = engine.renderer.gl.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  } catch { return 'unknown'; }
}
