// Where are the Spore Isles? npx tsx scripts/isle-find.ts [seed] [radius-in-blocks]
import { TerrainGenerator, BIOME_SPORE } from '../src/world/TerrainGenerator';
const seedArg = process.argv[2] ?? 'stats';
let seed = 0; for (const c of seedArg) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) | 0;
const R = Number(process.argv[3] ?? 6000);
const gen = new TerrainGenerator(seed, { structures: false, version: 7 });
const sp = gen.findSpawn();
const found: { x: number; z: number; d: number; n: number }[] = [];
const seen = new Set<string>();
for (let z = -R; z <= R; z += 16) for (let x = -R; x <= R; x += 16) {
  if (gen.column(x, z).biome !== BIOME_SPORE) continue;
  const k = Math.floor(x / 448) + "," + Math.floor(z / 448);
  if (seen.has(k)) continue;
  seen.add(k);
  found.push({ x, z, d: Math.round(Math.hypot(x - sp.x, z - sp.z)), n: 0 });
}
found.sort((a, b) => a.d - b.d);
console.log('spawn', sp.x, sp.z, 'isles in', R, ':', found.length, 'nearest', found.slice(0, 4));
