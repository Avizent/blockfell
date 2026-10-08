// Cinderdeep generation statistics and a picture of a slice through it.
//   npx tsx scripts/cinder-stats.ts [seed] [out.ppm]
import fs from 'node:fs';
import { CinderGenerator, LAVA_SEA } from '../src/world/Cinderdeep';
import * as B from '../src/world/BlockRegistry';
import { seedFromString } from '../src/core/rng';
import { localIndex, WORLD_HEIGHT } from '../src/world/constants';
import { meshChunk } from '../src/meshing/ChunkMesher';

const seedText = process.argv[2] ?? 'stats';
const out = process.argv[3];
const gen = new CinderGenerator(seedFromString(seedText), { structures: true });
const N = 16;
let air = 0, rock = 0, lava = 0, ember = 0, opal = 0, caps = 0, ash = 0, shrines = 0, chests = 0, falls = 0, ms = 0;
const data = new Map<string, Uint16Array>();
const mobs: Record<string, number> = {};
let openAbove = 0, cells = 0;
for (let cx = -N / 2; cx < N / 2; cx++) for (let cz = -N / 2; cz < N / 2; cz++) {
  const t0 = performance.now();
  const r = gen.generateChunk(cx, cz);
  ms += performance.now() - t0;
  data.set(cx + ',' + cz, r.blocks);
  shrines += r.spawners.length;
  chests += r.containers.length;
  for (const s of r.spawners) mobs[s.mob] = (mobs[s.mob] ?? 0) + 1;
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i], y = i >> 8;
    if (b === B.AIR) { air++; if (y > LAVA_SEA) openAbove++; }
    else if (b === B.LAVA) lava++;
    else if (b === B.LAVA_FALLING) falls++;
    else if (b === B.EMBER_ORE) ember++;
    else if (b === B.FIRE_OPAL_ORE) opal++;
    else if (b === B.GLOWCAP) caps++;
    else if (b === B.ASH) ash++;
    else rock++;
    if (y > LAVA_SEA && y < 120) cells++;
  }
}
const n = N * N;
// lighting and meshing cost on a few chunks near the middle
let meshMs = 0, lightMs = 0, quads = 0, m = 0;
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) {
  const cs: Uint16Array[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(data.get((cx + dx) + ',' + (cz + dz))!.slice());
  const r = meshChunk(cs, true, null);
  meshMs += r.stats.meshMs; lightMs += r.stats.lightMs; quads += r.stats.quads; m++;
}
console.log(JSON.stringify({ lightMs: +(lightMs / m).toFixed(1), meshMs: +(meshMs / m).toFixed(1), quadsPerChunk: Math.round(quads / m) }));
console.log(JSON.stringify({
  seed: seedText, chunks: n, genMsPerChunk: +(ms / n).toFixed(2), openAboveSea: +(openAbove / cells).toFixed(3),
  lavaPerChunk: Math.round(lava / n), emberOrePerChunk: +(ember / n).toFixed(1), firePerChunk: +(opal / n).toFixed(2),
  glowcapsPerChunk: +(caps / n).toFixed(1), ashPerChunk: Math.round(ash / n), shrinesPerChunk: +(shrines / n).toFixed(3), chests, mobs,
  lavafallCells: falls,
}));
if (out) {
  // a vertical slice along x at z = 8 across all chunks, and a horizontal slice at y = 60
  const W = N * 16, H = WORLD_HEIGHT;
  const col = (b: number): [number, number, number] => {
    if (b === B.AIR) return [24, 14, 12];
    if (b === B.LAVA || b === B.LAVA_FALLING) return [250, 120, 30];
    if (b === B.EMBER_ORE) return [255, 200, 80];
    if (b === B.FIRE_OPAL_ORE) return [120, 230, 160];
    if (b === B.GLOWCAP) return [255, 230, 150];
    if (b === B.ASH) return [120, 118, 120];
    if (b === B.BEDROCK) return [40, 40, 40];
    if (b === B.ASHROCK_BRICKS || b === B.CINDERSTONE || b === B.SPAWNER || b === B.EMBER_LAMP) return [80, 160, 255];
    return [96, 64, 58];
  };
  const img = Buffer.alloc(W * (H + 4 + W) * 3);
  const put = (x: number, y: number, c: number[]) => { const i = (y * W + x) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
  for (let x = 0; x < W; x++) {
    const cx = Math.floor(x / 16) - N / 2, lx = x & 15;
    const b = data.get(cx + ',0')!;
    for (let y = 0; y < H; y++) put(x, H - 1 - y, col(b[localIndex(lx, y, 8)]));
  }
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
    const cx = Math.floor(x / 16) - N / 2, cz = Math.floor(z / 16) - N / 2;
    put(x, H + 4 + z, col(data.get(cx + ',' + cz)![localIndex(x & 15, 60, z & 15)]));
  }
  fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${W} ${H + 4 + W} 255\n`), img]));
}
