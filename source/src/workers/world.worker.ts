/// <reference lib="webworker" />
/**
 * World worker: terrain generation and chunk meshing run here so the main thread
 * (rendering, input, UI) never stalls on them. Results are returned as
 * transferable typed arrays (zero-copy).
 */
import { TerrainGenerator } from '../world/TerrainGenerator';
import { meshChunk } from '../meshing/ChunkMesher';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let gen: TerrainGenerator | null = null;
let genKey = '';

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'gen') {
      const key = msg.seed + ':' + msg.structures + ':' + msg.version;
      if (!gen || genKey !== key) {
        gen = new TerrainGenerator(msg.seed, { structures: msg.structures, version: msg.version });
        genKey = key;
      }
      const t0 = performance.now();
      const res = gen.generateChunk(msg.cx, msg.cz);
      const out: WorkerResponse = {
        type: 'gen', id: msg.id, cx: msg.cx, cz: msg.cz, blocks: res.blocks,
        containers: res.containers, spawners: res.spawners, ms: performance.now() - t0,
      };
      self.postMessage(out, [res.blocks.buffer]);
    } else if (msg.type === 'mesh') {
      const r = meshChunk(msg.chunks, msg.greedy, msg.prevLight);
      const transfer: Transferable[] = [r.light.buffer];
      for (const m of [r.opaque, r.water]) {
        if (m) transfer.push(m.position.buffer, m.uv.buffer, m.data.buffer, m.index.buffer);
      }
      const out: WorkerResponse = {
        type: 'mesh', id: msg.id, cx: msg.cx, cz: msg.cz, version: msg.version,
        opaque: r.opaque, water: r.water, light: r.light, minY: r.minY, maxY: r.maxY,
        stats: r.stats, lightChanged: r.lightChanged,
      };
      self.postMessage(out, transfer);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err as Error)?.stack ?? err) } satisfies WorkerResponse);
  }
};
