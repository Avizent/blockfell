import { LIGHT_EMISSION, LIGHT_OPACITY } from '../world/BlockRegistry';
import { WORLD_HEIGHT } from '../world/constants';

/**
 * PADDED NEIGHBOURHOOD
 * --------------------
 * Meshing and lighting a chunk needs data beyond its own borders (face culling,
 * ambient occlusion, and light arriving from up to 14 blocks away). The worker
 * therefore receives the 3x3 block of chunks around the target and copies them
 * into one contiguous "padded" volume:
 *
 *   x, z : 48 cells  (local -16 .. 31; the target chunk is 16..31)
 *   y    : 130 cells (world -1 .. 128; row -1 is solid, row 128 is open sky)
 *
 *   paddedIndex(x, y, z) = (x + 16) + (z + 16) * 48 + (y + 1) * 2304
 *
 * The extra rows remove all bounds checks for the top and bottom faces.
 */
export const PAD = 16;
export const PW = 48;             // padded width (x and z)
export const PY = WORLD_HEIGHT + 2;
export const PLANE = PW * PW;     // 2304
export const PVOL = PLANE * PY;

export function pIndex(x: number, y: number, z: number): number {
  return (x + PAD) + (z + PAD) * PW + (y + 1) * PLANE;
}

const QUEUE_SIZE = 1 << 20;
const QUEUE_MASK = QUEUE_SIZE - 1;
let queue: Int32Array | null = null;

/**
 * Computes sky light and block light (0..15 each) for every cell of the padded volume.
 *  - Sky light: straight down from the sky at full strength (attenuated only by
 *    translucent blocks such as leaves/water), then flood-filled sideways and
 *    downward losing 1 per step (so caves and overhangs darken naturally).
 *  - Block light: flood fill from emitting blocks (torches, lumen, lit furnaces).
 */
export function computeLight(blocks: Uint16Array, sky: Uint8Array, blk: Uint8Array): void {
  if (!queue) queue = new Int32Array(QUEUE_SIZE);
  const q = queue;
  sky.fill(0);
  blk.fill(0);

  // --- sky columns
  const topRow = (PY - 1) * PLANE;
  let highest = 1; // highest row containing anything that blocks/dims light
  for (let c = 0; c < PLANE; c++) {
    let light = 15;
    sky[topRow + c] = 15;
    for (let i = topRow - PLANE + c; i >= 0; i -= PLANE) {
      const op = LIGHT_OPACITY[blocks[i]];
      if (op > 0) {
        const row = (i / PLANE) | 0;
        if (row > highest) highest = row;
        if (op >= 15) break;
        light -= op;
        if (light <= 0) break;
      }
      sky[i] = light;
    }
  }

  // --- seed sky BFS with lit cells that border darker transparent cells.
  // Above the highest light-blocking cell every cell is 15, so nothing there can seed.
  let head = 0, tail = 0;
  for (let y = Math.min(PY - 2, highest + 1); y >= 1; y--) {
    const row = y * PLANE;
    for (let z = 0; z < PW; z++) {
      for (let x = 0; x < PW; x++) {
        const i = row + z * PW + x;
        const L = sky[i];
        if (L < 2) continue;
        const t = L - 1;
        if ((x > 0 && sky[i - 1] < t && LIGHT_OPACITY[blocks[i - 1]] < 15) ||
            (x < PW - 1 && sky[i + 1] < t && LIGHT_OPACITY[blocks[i + 1]] < 15) ||
            (z > 0 && sky[i - PW] < t && LIGHT_OPACITY[blocks[i - PW]] < 15) ||
            (z < PW - 1 && sky[i + PW] < t && LIGHT_OPACITY[blocks[i + PW]] < 15) ||
            (sky[i - PLANE] < t && LIGHT_OPACITY[blocks[i - PLANE]] < 15)) {
          q[tail] = i; tail = (tail + 1) & QUEUE_MASK;
        }
      }
    }
  }
  flood(blocks, sky, q, head, tail);

  // --- block light
  head = 0; tail = 0;
  for (let i = PLANE; i < PVOL - PLANE; i++) {
    const e = LIGHT_EMISSION[blocks[i]];
    if (e > 0) {
      blk[i] = e;
      q[tail] = i; tail = (tail + 1) & QUEUE_MASK;
    }
  }
  if (tail > 0) flood(blocks, blk, q, head, tail);
}

function flood(blocks: Uint16Array, light: Uint8Array, q: Int32Array, head: number, tail: number): void {
  while (head !== tail) {
    const i = q[head]; head = (head + 1) & QUEUE_MASK;
    const L = light[i];
    if (L <= 1) continue;
    const y = (i / PLANE) | 0;
    const r = i - y * PLANE;
    const z = (r / PW) | 0;
    const x = r - z * PW;
    // 6 neighbours; the padded border rows are never entered (y 0 and PY-1)
    if (x > 0) tail = spread(blocks, light, q, i - 1, L, tail);
    if (x < PW - 1) tail = spread(blocks, light, q, i + 1, L, tail);
    if (z > 0) tail = spread(blocks, light, q, i - PW, L, tail);
    if (z < PW - 1) tail = spread(blocks, light, q, i + PW, L, tail);
    if (y > 1) tail = spread(blocks, light, q, i - PLANE, L, tail);
    if (y < PY - 2) tail = spread(blocks, light, q, i + PLANE, L, tail);
  }
}

function spread(blocks: Uint16Array, light: Uint8Array, q: Int32Array, n: number, L: number, tail: number): number {
  const op = LIGHT_OPACITY[blocks[n]];
  if (op >= 15) return tail;
  const nl = L - (op > 1 ? op : 1);
  if (nl > light[n]) {
    light[n] = nl;
    q[tail] = n;
    return (tail + 1) & QUEUE_MASK;
  }
  return tail;
}
