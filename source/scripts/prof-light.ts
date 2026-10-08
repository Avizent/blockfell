import { TerrainGenerator } from '../src/world/TerrainGenerator';
import * as L from '../src/meshing/Lighting';
import { LIGHT_OPACITY } from '../src/world/BlockRegistry';
const gen = new TerrainGenerator(12345, { structures: true });
const chunks: Uint16Array[] = [];
for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(gen.generateChunk(dx, dz).blocks);
const { PVOL, PLANE, PW, PY } = L;
const padded = new Uint16Array(PVOL);
padded.fill(13, 0, PLANE);
for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
  const src = chunks[dz * 3 + dx];
  for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) {
    const s = (y << 8) | (z << 4);
    padded.set(src.subarray(s, s + 16), (y + 1) * PLANE + (dz * 16 + z) * PW + dx * 16);
  }
}
const sky = new Uint8Array(PVOL), blk = new Uint8Array(PVOL);
for (let i = 0; i < 5; i++) L.computeLight(padded, sky, blk);
let t = performance.now();
for (let i = 0; i < 50; i++) L.computeLight(padded, sky, blk);
console.log('computeLight avg ms', ((performance.now() - t) / 50).toFixed(2));
// sky pass only
t = performance.now();
for (let k = 0; k < 50; k++) {
  sky.fill(0);
  const topRow = (PY - 1) * PLANE;
  for (let c = 0; c < PLANE; c++) {
    let light = 15; sky[topRow + c] = 15;
    for (let i = topRow - PLANE + c; i >= 0; i -= PLANE) { const op = LIGHT_OPACITY[padded[i]]; if (op >= 15) break; if (op > 0) { light -= op; if (light <= 0) break; } sky[i] = light; }
  }
}
console.log('sky column pass ms', ((performance.now() - t) / 50).toFixed(2));
t = performance.now();
let seeds = 0;
for (let k = 0; k < 50; k++) {
  seeds = 0;
  for (let y = PY - 2; y >= 1; y--) {
    const row = y * PLANE;
    for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
      const i = row + z * PW + x; const Lv = sky[i]; if (Lv < 2) continue; const tt = Lv - 1;
      if ((x > 0 && sky[i - 1] < tt && LIGHT_OPACITY[padded[i - 1]] < 15) || (x < PW - 1 && sky[i + 1] < tt && LIGHT_OPACITY[padded[i + 1]] < 15) || (z > 0 && sky[i - PW] < tt && LIGHT_OPACITY[padded[i - PW]] < 15) || (z < PW - 1 && sky[i + PW] < tt && LIGHT_OPACITY[padded[i + PW]] < 15) || (sky[i - PLANE] < tt && LIGHT_OPACITY[padded[i - PLANE]] < 15)) seeds++;
    }
  }
}
console.log('seed scan ms', ((performance.now() - t) / 50).toFixed(2), 'seeds', seeds);
