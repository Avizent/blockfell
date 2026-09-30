import { AIR, CONNECT, IS_WATER, getBlock, selectionAt } from '../world/BlockRegistry';
import { World, UNLOADED } from '../world/World';

export interface RayHit {
  x: number; y: number; z: number;   // targeted block
  face: number;                      // 0..5 (E, W, U, D, S, N) or -1 if started inside
  nx: number; ny: number; nz: number; // face normal
  px: number; py: number; pz: number; // adjacent placement cell
  dist: number;
  block: number;
  hx: number; hy: number; hz: number; // point where the ray met the block
}

/**
 * 3D DDA VOXEL TRAVERSAL (Amanatides & Woo)
 * -----------------------------------------
 * Walks the ray cell by cell through the voxel grid. For each axis we keep
 * tMax (ray distance to the next cell boundary on that axis) and tDelta (distance
 * between boundaries). Each step advances along the axis with the smallest tMax,
 * so every cell the ray passes through is visited exactly once, in order, and the
 * axis stepped tells us which face was entered. Cost is O(cells crossed) - about
 * 10 cell lookups for a 5-block reach - with no geometry intersection at all.
 * Non-full blocks (plants, torches) additionally test their selection box.
 */
export function raycast(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, fluids = false): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
  let face = -1;
  let t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const b = world.getBlock(x, y, z);
    const fluidHit = fluids && IS_WATER[b] === 1 && getBlock(b).fluidLevel === 0;
    if (b !== AIR && (!IS_WATER[b] || fluidHit) && b !== UNLOADED) {
      const def = getBlock(b);
      const s = CONNECT[b] ? selectionAt((a, c, d) => world.getBlock(a, c, d), b, x, y, z) : def.selection;
      const full = fluidHit || (s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 1 && s[4] === 1 && s[5] === 1);
      let hitT = t;
      let ok = full;
      if (!full) {
        const r = rayBox(ox, oy, oz, dx, dy, dz, x + s[0], y + s[1], z + s[2], x + s[3], y + s[4], z + s[5]);
        if (r !== null && r.t <= maxDist) { ok = true; hitT = r.t; face = r.face; }
      }
      if (ok) {
        const n = FACE_N[face < 0 ? 2 : face];
        return {
          x, y, z, face, nx: n[0], ny: n[1], nz: n[2],
          px: x + n[0], py: y + n[1], pz: z + n[2], dist: hitT, block: b,
          hx: ox + dx * hitT, hy: oy + dy * hitT, hz: oz + dz * hitT,
        };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4;
    }
  }
  return null;
}

const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Slab test; returns entry distance and entered face (allocation-free apart from the result). */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { t: number; face: number } | null {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  // X
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; }
  else {
    let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx, f1 = 1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; f1 = 0; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Y
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; }
  else {
    let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy, f1 = 3;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; f1 = 2; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Z
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return null; }
  else {
    let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz, f1 = 5;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; f1 = 4; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), face };
}
