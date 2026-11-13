import * as B from './BlockRegistry';
import { hash4, mulberry32, randInt } from '../core/rng';
import { WORLD_HEIGHT, localIndex } from './constants';
import type { GeneratedContainer, GeneratedSpawner } from './TerrainGenerator';

/**
 * MINESHAFTS (terrain version 10, game 2.15)
 * ==========================================
 * Old workings under the hills. The world is cut into regions of 4 by 4 chunks;
 * about one region in four hides a mine at one depth (a pure function of the seed
 * and the region). A mine is a plus sign 64 blocks across: a long gallery runs
 * east-west through the second row of chunks, and a cross-gallery runs north-south
 * through the third column. Galleries are 3 wide and 3 high with a Rail down the
 * middle, oak posts and beams every 4 blocks, torches, cobwebs, a chest here and
 * there and, where the galleries cross, a Monster Cage with a Crawler in it.
 *
 * Every chunk is still stamped on its own from (seed, chunk), so nothing depends
 * on load order. Because the lane positions are fixed, neighbouring chunks meet
 * exactly. A chunk's piece is skipped if it would touch water or lava, or if the
 * ground above is too thin; the mine then simply has a gap there.
 */

const get = (b: Uint16Array, x: number, y: number, z: number) => b[localIndex(x, y, z)];
const put = (b: Uint16Array, x: number, y: number, z: number, id: number) => { b[localIndex(x, y, z)] = id; };

/** Floor level of the mine in this chunk's region, or -1 if the region has no mine. */
export function mineFloor(seed: number, cx: number, cz: number): number {
  const rr = mulberry32(hash4(seed, cx >> 2, cz >> 2, 0x31ae));
  if (rr() >= 0.25) return -1;
  return randInt(rr, 16, 34);
}

/** Does this chunk carry a gallery east-west (row) and/or north-south (column)? */
export function mineArms(cx: number, cz: number): { ew: boolean; ns: boolean } {
  return { ew: (cz & 3) === 1, ns: (cx & 3) === 2 };
}

export function placeMine(seed: number, cx: number, cz: number, blocks: Uint16Array, minSurface: number,
  containers: GeneratedContainer[], spawners: GeneratedSpawner[]): boolean {
  const fy = mineFloor(seed, cx, cz);
  if (fy < 0) return false;
  const { ew, ns } = mineArms(cx, cz);
  if (!ew && !ns) return false;
  if (fy + 7 >= minSurface || fy + 5 >= WORLD_HEIGHT) return false;
  const rng = mulberry32(hash4(seed, cx, cz, 0x31af));

  // cells of the galleries: x/z in 7..9 across, whole chunk along
  const inGallery = (x: number, z: number) => (ew && z >= 7 && z <= 9) || (ns && x >= 7 && x <= 9);
  // never touch fluid (a one-block shell around the whole piece)
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const gx = x + dx, gz = z + dz;
      if (gx >= 0 && gx < 16 && gz >= 0 && gz < 16 && inGallery(gx, gz)) near = true;
    }
    if (!near) continue;
    for (let y = fy - 1; y <= fy + 4; y++) if (B.IS_FLUID[get(blocks, x, y, z)]) return false;
  }

  const X = cx * 16, Z = cz * 16;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    if (!inGallery(x, z)) continue;
    // floor: keep solid ground, bridge over holes with planks
    if (!B.IS_SOLID[get(blocks, x, fy, z)]) put(blocks, x, fy, z, B.PLANKS);
    for (let y = fy + 1; y <= fy + 3; y++) put(blocks, x, y, z, B.AIR);
    // a roof where a cave opens straight above
    if (!B.IS_SOLID[get(blocks, x, fy + 4, z)]) put(blocks, x, fy + 4, z, B.COBBLESTONE);
  }

  // supports every fourth block along each gallery, torches between, rails down the middle
  const lane = (along: number, across: number, isEW: boolean) => isEW ? [along, across] : [across, along];
  for (const isEW of [true, false]) {
    if (isEW ? !ew : !ns) continue;
    for (let t = 0; t < 16; t++) {
      // the junction square is left open (no posts) so carts can turn
      const junction = ew && ns && t >= 7 && t <= 9;
      const [rx, rz] = lane(t, 8, isEW);
      put(blocks, rx, fy + 1, rz, (t % 8 === 5 && !junction) ? B.BOOST_RAIL : B.RAIL);
      if (junction) continue;
      if (t % 4 === 1) {
        for (const c of [7, 9]) {
          const [x, z] = lane(t, c, isEW);
          put(blocks, x, fy + 1, z, B.OAK_FENCE);
          put(blocks, x, fy + 2, z, B.OAK_FENCE);
        }
        for (let c = 7; c <= 9; c++) { const [x, z] = lane(t, c, isEW); put(blocks, x, fy + 3, z, B.PLANKS); }
      } else if (t % 8 === 3) {
        const [x, z] = lane(t, 7, isEW);
        if (get(blocks, x, fy + 1, z) === B.AIR) put(blocks, x, fy + 1, z, B.TORCH);
      }
    }
  }

  // cobwebs in the dark corners
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    if (!inGallery(x, z)) continue;
    for (let y = fy + 2; y <= fy + 3; y++) {
      if (get(blocks, x, y, z) === B.AIR && rng() < 0.035) put(blocks, x, y, z, B.COBWEB);
    }
  }

  // the cage at the crossing, a chest at the foot of a post here and there
  if (ew && ns) {
    if (rng() < 0.7) {
      put(blocks, 7, fy + 1, 7, B.SPAWNER);
      spawners.push({ x: X + 7, y: fy + 1, z: Z + 7, mob: 'crawler' });
    }
    // two cobwebs over the cage corner
    if (get(blocks, 7, fy + 2, 7) === B.AIR) put(blocks, 7, fy + 2, 7, B.COBWEB);
  }
  const chestCount = ew && ns ? 2 : (rng() < 0.35 ? 1 : 0);
  for (let n = 0; n < chestCount; n++) {
    for (let tries = 0; tries < 12; tries++) {
      const isEW = ew && (!ns || rng() < 0.5);
      const t = randInt(rng, 1, 14);
      if (ew && ns && t >= 6 && t <= 10) continue;
      const side = rng() < 0.5 ? 9 : 7;
      const [x, z] = lane(t, side, isEW);
      if (get(blocks, x, fy + 1, z) !== B.AIR) continue;
      const facing: 'n' | 'e' | 's' | 'w' = isEW ? (side === 7 ? 's' : 'n') : (side === 7 ? 'e' : 'w');
      put(blocks, x, fy + 1, z, B.facingVariant('chest', facing));
      containers.push({ x: X + x, y: fy + 1, z: Z + z, loot: 'mine' });
      break;
    }
  }
  return true;
}

/**
 * 2.16 (terrain version 11): a way in. Each mine has one pit-head on its long gallery: a
 * ladder shaft from the gallery floor up to the surface, under a little timber headframe.
 * The shaft stands in the chunk's cell column x=12, z=6 (just north of the gallery), the
 * ladder against the north wall, so you climb in from the gallery's north lane. The chunk
 * that gets the pit-head is a pure function of (seed, region); it is skipped on steep,
 * wet or thin ground, and the mine is then reached by digging as before.
 */
export function entranceChunkX(seed: number, cx: number, cz: number): number {
  const rr = mulberry32(hash4(seed, cx >> 2, cz >> 2, 0x31b0));
  return [0, 1, 3][Math.floor(rr() * 3)];
}

export function placeMineEntrance(seed: number, cx: number, cz: number, blocks: Uint16Array,
  heightAt: (lx: number, lz: number) => number, seaLevel: number): boolean {
  const fy = mineFloor(seed, cx, cz);
  if (fy < 0) return false;
  if (!mineArms(cx, cz).ew || (cx & 3) !== entranceChunkX(seed, cx, cz)) return false;
  // the gallery must really have been cut in this chunk
  if (get(blocks, 12, fy + 1, 8) !== B.RAIL && get(blocks, 12, fy + 1, 8) !== B.BOOST_RAIL) return false;
  const h = heightAt(12, 6);
  if (h <= seaLevel + 1 || h + 5 >= WORLD_HEIGHT) return false;
  // flat ground only under the headframe, and no water
  for (let z = 5; z <= 7; z++) for (let x = 11; x <= 13; x++) {
    const hh = heightAt(x, z);
    if (Math.abs(hh - h) > 1 || hh <= seaLevel) return false;
  }
  for (let y = fy + 1; y <= h + 1; y++) if (B.IS_FLUID[get(blocks, 12, y, 6)] || B.IS_FLUID[get(blocks, 12, y, 5)]) return false;

  // clear the air above the headframe (trees, plants), then dig the shaft
  for (let z = 5; z <= 7; z++) for (let x = 11; x <= 13; x++) for (let y = h + 1; y <= h + 4; y++) put(blocks, x, y, z, B.AIR);
  for (let y = fy + 1; y <= h; y++) {
    put(blocks, 12, y, 6, B.AIR);
    if (!B.IS_SOLID[get(blocks, 12, y, 5)]) put(blocks, 12, y, 5, B.COBBLESTONE);
  }
  // the ladder: climb side faces the gallery (south), wall to the north
  for (let y = fy + 1; y <= h + 2; y++) put(blocks, 12, y, 6, B.LADDERS.s);
  // the wall behind the ladder above ground, fences all round, a plank roof
  put(blocks, 12, h + 1, 5, B.PLANKS); put(blocks, 12, h + 2, 5, B.PLANKS);
  for (const [x, z] of [[11, 5], [13, 5], [11, 6], [13, 6], [11, 7], [13, 7]]) {
    for (let y = heightAt(x, z) + 1; y <= h + 2; y++) put(blocks, x, y, z, B.OAK_FENCE);
  }
  for (let z = 5; z <= 7; z++) for (let x = 11; x <= 13; x++) put(blocks, x, h + 3, z, B.PLANKS);
  // a torch on the porch post
  put(blocks, 11, h + 3, 7, B.TORCH);
  return true;
}
