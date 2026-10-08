/**
 * World-wide constants and voxel coordinate conversion.
 *
 * COORDINATE SYSTEMS
 * ------------------
 *  world  (wx, wy, wz)  integer block coordinates; +Y is up, +X east, +Z south.
 *  chunk  (cx, cz)      a chunk is a 16 x 128 x 16 column: cx = floor(wx / 16).
 *  local  (lx, ly, lz)  position inside a chunk: lx = wx - cx*16 (0..15), ly = wy.
 *
 * Voxels in a chunk are stored in a flat Uint16Array (one block id per voxel; 8-bit
 * until 1.10, see BLOCK_LIMIT) indexed
 *   index = lx | (lz << 4) | (ly << 8)
 * i.e. X varies fastest, then Z, then Y.  A vertical step is +256, which makes
 * column scans (heightmaps, sky light) cache friendly.
 *
 * Bit tricks: because CHUNK_SIZE is a power of two, floor-division and modulo
 * for negative numbers are done with arithmetic shift and mask:
 *   cx = wx >> 4          (floor division, correct for negatives)
 *   lx = wx & 15          (always 0..15, correct for negatives)
 */
export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = 15;
export const WORLD_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT; // 32768
export const SEA_LEVEL = 62;
export const MAX_LIGHT = 15;
/**
 * Block ids run from 0 to BLOCK_LIMIT - 1 (1.10: chunks went from 8-bit to 16-bit ids;
 * the lookup tables in BlockRegistry are this long). Ids 0-248 are the blocks of
 * Blockfell 1.0-1.9, 249-254 are unused, 255 is UNLOADED and new blocks start at 256.
 */
export const BLOCK_LIMIT = 1024;
/** Chunk voxel data: one block id per voxel. */
export type BlockArray = Uint16Array;

export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
export const DAY_LENGTH_TICKS = 24000; // a full day is 20 real minutes, as the reference game

export const GAME_VERSION = '2.0.1';
/** 1 = Blockfell 1.0-1.9; 2 = 1.10 (16-bit ids, dimensions; see SaveManager). */
export const SAVE_FORMAT = 2;

/** Index of a voxel inside a chunk's block array. Caller guarantees 0<=lx,lz<16, 0<=ly<128. */
export function localIndex(lx: number, ly: number, lz: number): number {
  return lx | (lz << 4) | (ly << 8);
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

/** Numeric key for hot paths (supports |cx|,|cz| < 32768). */
export function chunkKeyNum(cx: number, cz: number): number {
  return ((cx + 32768) << 16) | (cz + 32768);
}

export function worldToChunk(w: number): number {
  return w >> CHUNK_SHIFT;
}

export function worldToLocal(w: number): number {
  return w & CHUNK_MASK;
}

/** Face directions. Index order is used everywhere (meshing, textures, raycasting). */
export const FACE_EAST = 0;  // +X
export const FACE_WEST = 1;  // -X
export const FACE_UP = 2;    // +Y
export const FACE_DOWN = 3;  // -Y
export const FACE_SOUTH = 4; // +Z
export const FACE_NORTH = 5; // -Z

export const FACE_NORMALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
