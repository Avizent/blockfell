import { COLLISION, CONNECT, CONNECT_COLLIDE, IS_SOLID, connectMask } from '../world/BlockRegistry';
import type { World } from '../world/World';

/** Axis-aligned box in world space. */
export class AABB {
  constructor(
    public minX = 0, public minY = 0, public minZ = 0,
    public maxX = 0, public maxY = 0, public maxZ = 0,
  ) {}

  set(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): this {
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
    return this;
  }

  static fromFeet(x: number, y: number, z: number, width: number, height: number, out = new AABB()): AABB {
    const h = width / 2;
    return out.set(x - h, y, z - h, x + h, y + height, z + h);
  }

  offset(dx: number, dy: number, dz: number): this {
    this.minX += dx; this.maxX += dx;
    this.minY += dy; this.maxY += dy;
    this.minZ += dz; this.maxZ += dz;
    return this;
  }

  clone(): AABB {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  intersects(o: AABB): boolean {
    return this.minX < o.maxX && this.maxX > o.minX && this.minY < o.maxY && this.maxY > o.minY && this.minZ < o.maxZ && this.maxZ > o.minZ;
  }

  intersectsBlock(x: number, y: number, z: number): boolean {
    return this.minX < x + 1 && this.maxX > x && this.minY < y + 1 && this.maxY > y && this.minZ < z + 1 && this.maxZ > z;
  }
}

const EPS = 1e-7;

/** Collision boxes of a solid block; fences and panes depend on their neighbours. */
function collisionOf(world: World, id: number, x: number, y: number, z: number): Float32Array | null {
  const k = CONNECT[id];
  if (!k) return COLLISION[id];
  return CONNECT_COLLIDE[k][connectMask(id, world.getBlock(x, y, z - 1), world.getBlock(x + 1, y, z), world.getBlock(x, y, z + 1), world.getBlock(x - 1, y, z))];
}

/** Collision boxes of solid blocks around a region, flattened [minX,minY,minZ,maxX,maxY,maxZ, ...]. */
const boxes: number[] = [];
function gather(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  boxes.length = 0;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.getBlock(x, y, z);
        if (!IS_SOLID[id]) continue;
        const c = collisionOf(world, id, x, y, z);
        if (!c) { boxes.push(x, y, z, x + 1, y + 1, z + 1); continue; }
        for (let i = 0; i < c.length; i += 6) boxes.push(x + c[i], y + c[i + 1], z + c[i + 2], x + c[i + 3], y + c[i + 4], z + c[i + 5]);
      }
    }
  }
  return boxes.length;
}

function clipY(b: AABB, dy: number, n: number): number {
  for (let i = 0; i < n && dy !== 0; i += 6) {
    if (b.maxX <= boxes[i] + EPS || b.minX >= boxes[i + 3] - EPS || b.maxZ <= boxes[i + 2] + EPS || b.minZ >= boxes[i + 5] - EPS) continue;
    if (dy > 0 && b.maxY <= boxes[i + 1] + EPS) dy = Math.min(dy, boxes[i + 1] - b.maxY);
    else if (dy < 0 && b.minY >= boxes[i + 4] - EPS) dy = Math.max(dy, boxes[i + 4] - b.minY);
  }
  return dy;
}
function clipX(b: AABB, dx: number, n: number): number {
  for (let i = 0; i < n && dx !== 0; i += 6) {
    if (b.maxY <= boxes[i + 1] + EPS || b.minY >= boxes[i + 4] - EPS || b.maxZ <= boxes[i + 2] + EPS || b.minZ >= boxes[i + 5] - EPS) continue;
    if (dx > 0 && b.maxX <= boxes[i] + EPS) dx = Math.min(dx, boxes[i] - b.maxX);
    else if (dx < 0 && b.minX >= boxes[i + 3] - EPS) dx = Math.max(dx, boxes[i + 3] - b.minX);
  }
  return dx;
}
function clipZ(b: AABB, dz: number, n: number): number {
  for (let i = 0; i < n && dz !== 0; i += 6) {
    if (b.maxY <= boxes[i + 1] + EPS || b.minY >= boxes[i + 4] - EPS || b.maxX <= boxes[i] + EPS || b.minX >= boxes[i + 3] - EPS) continue;
    if (dz > 0 && b.maxZ <= boxes[i + 2] + EPS) dz = Math.min(dz, boxes[i + 2] - b.maxZ);
    else if (dz < 0 && b.minZ >= boxes[i + 5] - EPS) dz = Math.max(dz, boxes[i + 5] - b.minZ);
  }
  return dz;
}

const stepBox = new AABB();

/**
 * COLLISION RESOLUTION
 * --------------------
 * Swept AABB against the collision boxes of nearby solid blocks, one axis at a
 * time (Y first, then X, then Z), like the reference game. Only blocks overlapping
 * the box expanded by the requested movement are considered (typically a few
 * dozen cells), never the whole world. Full cubes contribute one box; shaped
 * blocks (slabs, stairs, doors, beds...) contribute their own boxes. Unloaded
 * chunks count as solid so nothing can fall out of the loaded world.
 *
 * STEP-UP: when `step` > 0 (the mover is on the ground) and a horizontal move is
 * blocked, the move is retried raised by up to `step` blocks and then lowered
 * back onto whatever is there. If that gets further, it is used - this is how
 * players and creatures walk up slabs and stairs without jumping.
 *
 * Returns the movement actually applied; `box` is moved in place.
 */
export function moveBox(world: World, box: AABB, dx: number, dy: number, dz: number, step = 0): [number, number, number] {
  const x0 = Math.floor(Math.min(box.minX, box.minX + dx) - EPS);
  const x1 = Math.floor(Math.max(box.maxX, box.maxX + dx) + EPS);
  const y0 = Math.floor(Math.min(box.minY, box.minY + dy) - EPS) - 1;
  const y1 = Math.floor(Math.max(box.maxY, box.maxY + dy) + step + EPS);
  const z0 = Math.floor(Math.min(box.minZ, box.minZ + dz) - EPS);
  const z1 = Math.floor(Math.max(box.maxZ, box.maxZ + dz) + EPS);
  const n = gather(world, x0, y0, z0, x1, y1, z1);
  const start = step > 0 ? stepBox.set(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ) : null;

  const my = clipY(box, dy, n);
  box.offset(0, my, 0);
  const mx = clipX(box, dx, n);
  box.offset(mx, 0, 0);
  const mz = clipZ(box, dz, n);
  box.offset(0, 0, mz);

  if (start && (mx !== dx || mz !== dz) && (dx !== 0 || dz !== 0)) {
    const s = start.clone();
    const up = clipY(s, step, n);
    s.offset(0, up, 0);
    const sx = clipX(s, dx, n);
    s.offset(sx, 0, 0);
    const sz = clipZ(s, dz, n);
    s.offset(0, 0, sz);
    const down = clipY(s, -up + Math.min(0, dy), n);
    s.offset(0, down, 0);
    if (sx * sx + sz * sz > mx * mx + mz * mz + 1e-9 && s.minY - start.minY > -EPS) {
      box.set(s.minX, s.minY, s.minZ, s.maxX, s.maxY, s.maxZ);
      return [sx, s.minY - start.minY, sz];
    }
  }
  return [mx, my, mz];
}

/** True if the box overlaps any solid block's collision boxes. */
export function boxCollides(world: World, box: AABB): boolean {
  const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX - EPS);
  // one row lower too: fences and closed gates stand 1.5 blocks tall
  const y0 = Math.floor(box.minY) - 1, y1 = Math.floor(box.maxY - EPS);
  const z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const id = world.getBlock(x, y, z);
    if (!IS_SOLID[id]) continue;
    const c = collisionOf(world, id, x, y, z);
    if (!c) { if (y >= Math.floor(box.minY)) return true; continue; }
    for (let i = 0; i < c.length; i += 6) {
      if (box.minX < x + c[i + 3] && box.maxX > x + c[i] && box.minY < y + c[i + 4] && box.maxY > y + c[i + 1] && box.minZ < z + c[i + 5] && box.maxZ > z + c[i + 2]) return true;
    }
  }
  return false;
}

/** True if any cell overlapping the box satisfies `test(blockId)`. */
export function boxTouches(world: World, box: AABB, test: (id: number) => boolean): boolean {
  const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX - EPS);
  const y0 = Math.floor(box.minY), y1 = Math.floor(box.maxY - EPS);
  const z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (test(world.getBlock(x, y, z))) return true;
  }
  return false;
}
