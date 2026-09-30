// Terrain version statistics: dungeons, lava lakes, lava in caves, generation and meshing cost.
// npx tsx scripts/gen-stats.ts [seed] [radius] [version]
import { TerrainGenerator } from '../src/world/TerrainGenerator';
import { meshChunk } from '../src/meshing/ChunkMesher';
import * as B from '../src/world/BlockRegistry';

const seedArg = process.argv[2] ?? 'stats';
let seed = 0; for (const c of seedArg) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) | 0;
const R = Number(process.argv[3] ?? 8);
const version = Number(process.argv[4] ?? 5);
const gen = new TerrainGenerator(seed, { structures: true, version });
let chunks = 0, dungeons = 0, chests = 0, lavaCells = 0, lakes = 0, genMs = 0;
const mobs: Record<string, number> = {};
const dungeonYs: number[] = [];
const data = new Map<string, Uint8Array>();
for (let cx = -R; cx < R; cx++) for (let cz = -R; cz < R; cz++) {
  const t0 = performance.now();
  const g = gen.generateChunk(cx, cz);
  genMs += performance.now() - t0;
  data.set(cx + ',' + cz, g.blocks);
  chunks++;
  dungeons += g.spawners.length;
  for (const s of g.spawners) { mobs[s.mob] = (mobs[s.mob] ?? 0) + 1; dungeonYs.push(s.y); }
  chests += g.containers.filter((c) => c.loot === 'dungeon').length;
  let lava = 0, high = 0;
  for (let i = 0; i < g.blocks.length; i++) if (B.IS_LAVA[g.blocks[i]]) { lava++; if ((i >> 8) > 11) high++; }
  lavaCells += lava;
  if (high > 0) lakes++;
}
// meshing cost on a 3x3 block near the origin
let meshMs = 0, lightMs = 0, n = 0;
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) {
  const cs: Uint8Array[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(data.get((cx + dx) + ',' + (cz + dz))!);
  const r = meshChunk(cs, true, null);
  meshMs += r.stats.meshMs; lightMs += r.stats.lightMs; n++;
}
console.log(JSON.stringify({ seed: seedArg, version, chunks, dungeons, perChunk: +(dungeons / chunks).toFixed(3), chests, mobs, dungeonYs: dungeonYs.sort((a, b) => a - b), lakesChunks: lakes, lavaCellsPerChunk: Math.round(lavaCells / chunks), genMsPerChunk: +(genMs / chunks).toFixed(2), lightMs: +(lightMs / n).toFixed(1), meshMs: +(meshMs / n).toFixed(1) }));
