import * as B from './BlockRegistry';
import { hash4, mulberry32, randInt } from '../core/rng';
import { BLOCK_LIMIT, WORLD_HEIGHT, localIndex } from './constants';
import type { GeneratedContainer, GeneratedSpawner } from './TerrainGenerator';

/**
 * UNDERGROUND LAVA LAKES AND DUNGEONS (terrain version 5)
 * =======================================================
 * Both are stamped into one chunk's block array after caves and ores, entirely
 * inside the chunk, from a random stream seeded by (world seed, chunk), so every
 * chunk is still a pure function of the seed and loads identically every time.
 *
 * Lava lakes: about one chunk in 14 gets a buried pool 12-40 blocks deep, a
 * squashed ellipsoid half filled with lava under a pocket of air. Its lava is
 * sealed in: any open space or water next to the molten half is turned to stone,
 * so it never leaks into caves by itself - until someone digs into it.
 * (Caves are also filled with lava below height 11, which is where the big lava
 * lakes lie: see TerrainGenerator.)
 *
 * Dungeons: one chunk in five tries up to ten spots for a room (interior 5-7 by
 * 5-7, 3 high) at height 12-54. A spot is only used if it is buried in rock but a
 * cave runs past it (1 to 10 wall cells open into the cave) - so a dungeon is
 * hidden, but can be found by exploring caves. About one chunk in eight ends up
 * with one. The room gets cobblestone walls, a mossy floor, a Monster Cage in the
 * middle and one or two chests against the walls.
 */

const ROCK = new Uint8Array(BLOCK_LIMIT);
for (const id of [B.STONE, B.DIRT, B.GRAVEL, B.COAL_ORE, B.IRON_ORE, B.RUNE_ORE, B.SANDSTONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE]) ROCK[id] = 1;

const get = (b: Uint16Array, x: number, y: number, z: number) => b[localIndex(x, y, z)];

/** A buried pool of lava (maybe). Returns true if one was placed. */
export function placeLavaLake(seed: number, cx: number, cz: number, blocks: Uint16Array, minSurface: number): boolean {
  const rng = mulberry32(hash4(seed, cx, cz, 0x1a7a));
  if (rng() >= 1 / 14) return false;
  const rx = 3 + rng() * 3, rz = 3 + rng() * 3, ry = 2.2 + rng() * 1.3;
  const cxl = 7.5 + (rng() - 0.5) * 2, czl = 7.5 + (rng() - 0.5) * 2;
  const cy = randInt(rng, 14, 40);
  if (cy + ry + 4 > minSurface) return false;          // keep well under the ground
  const x0 = Math.max(1, Math.floor(cxl - rx)), x1 = Math.min(14, Math.ceil(cxl + rx));
  const z0 = Math.max(1, Math.floor(czl - rz)), z1 = Math.min(14, Math.ceil(czl + rz));
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  const inside = (x: number, y: number, z: number) => {
    const dx = (x + 0.5 - cxl) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - czl) / rz;
    return dx * dx + dy * dy + dz * dz < 1;
  };
  // never next to water (lakes must not steam away the moment they load)
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (B.IS_WATER[get(blocks, x, y, z)]) return false;
  }
  const level = Math.floor(cy);                          // lava up to here, air above
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y, z)) continue;
    const i = localIndex(x, y, z);
    if (blocks[i] === B.BEDROCK) continue;
    blocks[i] = y <= level ? B.LAVA : B.AIR;
  }
  // seal the molten half: open space or plants beside or below the lava become stone
  for (let y = y0 - 1; y <= level; y++) for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const i = localIndex(x, y, z);
    if (B.IS_LAVA[blocks[i]]) continue;
    let touches = false;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
      if (B.IS_LAVA[get(blocks, nx, y + dy, nz)]) { touches = true; break; }
    }
    if (touches && !B.IS_SOLID[blocks[i]]) blocks[i] = B.STONE;
  }
  return true;
}

/** Can this chunk hold a dungeon at all? (The cheap first test of placeDungeon: 1 chunk in 5.) */
export function dungeonCandidate(seed: number, cx: number, cz: number): boolean {
  return mulberry32(hash4(seed, cx, cz, 0xd0d6e))() < 0.2;
}

/** A dungeon room (maybe). Returns the room's centre if one was placed. */
export function placeDungeon(seed: number, cx: number, cz: number, blocks: Uint16Array, minSurface: number,
  containers: GeneratedContainer[], spawners: GeneratedSpawner[]): { x: number; y: number; z: number } | null {
  const rng = mulberry32(hash4(seed, cx, cz, 0xd0d6e));
  if (rng() >= 0.2) return null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const hx = rng() < 0.5 ? 2 : 3, hz = rng() < 0.5 ? 2 : 3;      // interior half size (5 or 7 wide)
    const lx = randInt(rng, hx + 1, 14 - hx), lz = randInt(rng, hz + 1, 14 - hz);
    const fy = randInt(rng, 12, 54);                                  // floor level
    if (fy + 6 > minSurface - 2) continue;
    if (!fits(blocks, lx, fy, lz, hx, hz)) continue;
    stamp(blocks, rng, lx, fy, lz, hx, hz);
    const X = cx * 16, Z = cz * 16;
    // the cage and its creature
    const r = rng();
    const mob = r < 0.5 ? 'shambler' : r < 0.75 ? 'skeleton' : 'crawler';
    spawners.push({ x: X + lx, y: fy + 1, z: Z + lz, mob });
    // one or two chests against the walls, facing into the room
    const chests = rng() < 0.4 ? 2 : 1;
    let placed = 0;
    for (let t = 0; t < 20 && placed < chests; t++) {
      const side = Math.floor(rng() * 4);
      let x = lx, z = lz;
      let facing: 'n' | 'e' | 's' | 'w';
      if (side === 0) { z = lz - hz; x = lx + randInt(rng, -hx + 1, hx - 1); facing = 's'; }
      else if (side === 1) { z = lz + hz; x = lx + randInt(rng, -hx + 1, hx - 1); facing = 'n'; }
      else if (side === 2) { x = lx - hx; z = lz + randInt(rng, -hz + 1, hz - 1); facing = 'e'; }
      else { x = lx + hx; z = lz + randInt(rng, -hz + 1, hz - 1); facing = 'w'; }
      if (x === lx && z === lz) continue;
      const i = localIndex(x, fy + 1, z);
      if (blocks[i] !== B.AIR) continue;
      // the wall behind must be solid (not an opening)
      const bx = side === 2 ? x - 1 : side === 3 ? x + 1 : x, bz = side === 0 ? z - 1 : side === 1 ? z + 1 : z;
      if (!B.IS_SOLID[get(blocks, bx, fy + 1, bz)]) continue;
      blocks[i] = B.facingVariant('chest', facing);
      containers.push({ x: X + x, y: fy + 1, z: Z + z, loot: 'dungeon' });
      placed++;
    }
    return { x: X + lx, y: fy + 1, z: Z + lz };
  }
  return null;
}

/**
 * Mostly solid rock for the floor and ceiling (at least 3/4 - the gaps are plugged
 * with cobblestone), no fluids anywhere in the room, and 1-10 cells of the walls
 * open into caves: the room is buried in rock, but a cave runs past it.
 */
function fits(b: Uint16Array, lx: number, fy: number, lz: number, hx: number, hz: number): boolean {
  if (fy < 6 || fy + 5 >= WORLD_HEIGHT) return false;
  let rock = 0, cells = 0;
  for (let x = lx - hx - 1; x <= lx + hx + 1; x++) for (let z = lz - hz - 1; z <= lz + hz + 1; z++) {
    cells += 2;
    rock += ROCK[get(b, x, fy, z)] + ROCK[get(b, x, fy + 4, z)];
    for (let y = fy; y <= fy + 4; y++) if (B.IS_FLUID[get(b, x, y, z)]) return false;
  }
  if (rock < cells * 0.75) return false;
  let openings = 0;
  for (let x = lx - hx - 1; x <= lx + hx + 1; x++) for (let z = lz - hz - 1; z <= lz + hz + 1; z++) {
    const wall = x === lx - hx - 1 || x === lx + hx + 1 || z === lz - hz - 1 || z === lz + hz + 1;
    if (!wall) continue;
    if (get(b, x, fy + 1, z) === B.AIR || get(b, x, fy + 2, z) === B.AIR) openings++;
  }
  return openings >= 1 && openings <= 10;
}

function stamp(b: Uint16Array, rng: () => number, lx: number, fy: number, lz: number, hx: number, hz: number): void {
  for (let x = lx - hx - 1; x <= lx + hx + 1; x++) for (let z = lz - hz - 1; z <= lz + hz + 1; z++) {
    const wall = x === lx - hx - 1 || x === lx + hx + 1 || z === lz - hz - 1 || z === lz + hz + 1;
    for (let y = fy; y <= fy + 4; y++) {
      const i = localIndex(x, y, z);
      if (y === fy) b[i] = rng() < 0.3 ? B.COBBLESTONE : B.MOSSY_COBBLESTONE;   // mossy floor
      else if (y === fy + 4) b[i] = B.COBBLESTONE;                             // ceiling
      else if (wall) { if (B.IS_SOLID[b[i]]) b[i] = rng() < 0.25 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE; } // openings stay open
      else b[i] = B.AIR;
    }
  }
  b[localIndex(lx, fy + 1, lz)] = B.SPAWNER;
}
