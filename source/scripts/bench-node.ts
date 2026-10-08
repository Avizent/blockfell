import { TerrainGenerator } from '../src/world/TerrainGenerator';
import { meshChunk } from '../src/meshing/ChunkMesher';
const gen = new TerrainGenerator(12345, { structures: true });
const N = 7;
const chunks = new Map<string, Uint16Array>();
let t = performance.now();
for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) chunks.set(x + ',' + z, gen.generateChunk(x, z).blocks);
const genMs = (performance.now() - t) / (N * N);
let light = 0, mesh = 0, quads = 0, faces = 0, verts = 0, n = 0;
for (let rep = 0; rep < 4; rep++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { if (rep === 2 && x === -2 && z === -2) { light = 0; mesh = 0; quads = 0; faces = 0; verts = 0; n = 0; }
  const arr: Uint16Array[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) arr.push(chunks.get((x + dx) + ',' + (z + dz))!.slice());
  const r = meshChunk(arr, true, null);
  light += r.stats.lightMs; mesh += r.stats.meshMs; quads += r.stats.quads; faces += r.stats.visibleFaces; verts += r.stats.vertices; n++;
}
console.log({ genMs: genMs.toFixed(2), lightMs: (light / n).toFixed(2), meshMs: (mesh / n).toFixed(2), facesPerChunk: faces / n, quadsPerChunk: quads / n, vertsPerChunk: verts / n });
