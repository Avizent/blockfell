import * as B from '../world/BlockRegistry';
import type { World } from '../world/World';
import { AABB } from '../player/PlayerPhysics';
import type { RayHit } from './VoxelRaycaster';

export interface PlacedBlock { x: number; y: number; z: number; block: number }

export interface PlacementResult extends PlacedBlock {
  /** Every block written, the main one first (doors and beds place two). */
  all: PlacedBlock[];
}

/** Cardinal direction the player is looking (from yaw). */
export function lookFacing(yaw: number): B.Facing {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'e' : 'w') : (fz > 0 ? 's' : 'n');
}

/** A block whose top surface is a full solid face (things can stand on it). */
export function solidTop(id: number): boolean {
  if (B.IS_OPAQUE[id]) return true;
  const d = B.getBlock(id);
  return (d.shape === 'slab' || d.shape === 'stairs') && d.half === 'top';
}

const SAND_LIKE = new Set<number>([B.SAND, B.RED_SAND]);

/** Blocks that break when the block holding them up disappears. */
export function needsSupport(id: number): boolean {
  const r = B.RENDER[id];
  if (r === B.RENDER_CROSS || r === B.RENDER_TORCH || r === B.RENDER_WALL_TORCH) return true;
  if (id === B.CACTUS) return true;
  const d = B.getBlock(id);
  return d.shape === 'door' || d.shape === 'bed' || d.shape === 'ladder' || d.shape === 'sign' || d.shape === 'wall_sign' || d.shape === 'lantern';
}

/** Facing that points out of a clicked side face (east, west, south, north), or null for top/bottom. */
export function faceFacing(face: number): B.Facing | null {
  return face === 0 ? 'e' : face === 1 ? 'w' : face === 4 ? 's' : face === 5 ? 'n' : null;
}

/** Position of the other half of a two-block structure (door, bed), or null. */
export function partnerOf(id: number, x: number, y: number, z: number): [number, number, number] | null {
  const d = B.getBlock(id);
  if (d.shape === 'door') return d.half === 'lower' ? [x, y + 1, z] : [x, y - 1, z];
  if (d.shape === 'bed' && d.facing) {
    const [fx, fz] = B.FACING_VEC[d.facing];
    return d.half === 'foot' ? [x + fx, y, z + fz] : [x - fx, y, z - fz];
  }
  return null;
}

export function supportOk(world: World, id: number, x: number, y: number, z: number): boolean {
  const below = world.getBlock(x, y - 1, z);
  const d = B.getBlock(id);
  if (id === B.DEAD_BUSH) return SAND_LIKE.has(below) || B.TERRACOTTA.includes(below);
  if (B.CROP_STAGE[id] >= 0) return B.IS_FARMLAND(below);
  if (B.RENDER[id] === B.RENDER_CROSS) return below === B.GRASS || below === B.DIRT || below === B.SNOWY_GRASS;
  if (id === B.CACTUS) return below === B.CACTUS || SAND_LIKE.has(below);
  if ((d.shape === 'wall_torch' || d.shape === 'ladder') && d.facing) {
    const [fx, fz] = B.FACING_VEC[d.facing];
    return B.IS_OPAQUE[world.getBlock(x - fx, y, z - fz)] === 1;
  }
  if (d.shape === 'wall_sign' && d.facing) {
    const [fx, fz] = B.FACING_VEC[d.facing];
    return B.IS_SOLID[world.getBlock(x - fx, y, z - fz)] === 1;
  }
  if (d.shape === 'sign') return B.IS_SOLID[below] === 1;
  if (d.shape === 'lantern') return d.half === 'top' ? B.IS_SOLID[world.getBlock(x, y + 1, z)] === 1 : B.IS_SOLID[below] === 1;
  if (d.shape === 'door' || d.shape === 'bed') {
    // the other half must still be there (and a door must stand on something)
    const p = partnerOf(id, x, y, z)!;
    const other = B.getBlock(world.getBlock(p[0], p[1], p[2]));
    if (other.variantOf !== d.variantOf || other.half === d.half) return false;
    return d.shape !== 'door' || d.half !== 'lower' || solidTop(below);
  }
  return solidTop(below);
}

function blocked(world: World, cellBlock: number, x: number, y: number, z: number, playerBox: AABB, entityBoxes: AABB[]): boolean {
  if (!B.IS_SOLID[cellBlock]) return false;
  const c = B.collisionAt((a, b, e) => world.getBlock(a, b, e), cellBlock, x, y, z);
  const parts = c ? Array.from({ length: c.length / 6 }, (_, i) => new AABB(x + c[i * 6], y + c[i * 6 + 1], z + c[i * 6 + 2], x + c[i * 6 + 3], y + c[i * 6 + 4], z + c[i * 6 + 5]))
    : [new AABB(x, y, z, x + 1, y + 1, z + 1)];
  for (const p of parts) {
    if (p.intersects(playerBox)) return true;
    for (const e of entityBoxes) if (p.intersects(e)) return true;
  }
  return false;
}

/**
 * Decides where (and which variant of) a block is placed when the player uses a
 * block item on a targeted face. Returns null if placement is not allowed:
 * cell occupied, would intersect the player or a creature, missing support, or
 * outside the world. Handles orientation (furnaces, stairs, doors, beds, wall
 * torches), slab halves and joining two slabs into a full block.
 */
export function resolvePlacement(world: World, hit: RayHit, itemBlock: number, playerBox: AABB, yaw: number, entityBoxes: AABB[]): PlacementResult | null {
  const itemDef = B.getBlock(itemBlock);
  const look = lookFacing(yaw);
  const hitFrac = hit.hy - Math.floor(hit.hy);
  const upperHalf = hit.face === 3 || (hit.face !== 2 && hitFrac > 0.5);

  // ---- slab onto a matching slab: the two halves become one full block
  if (itemDef.shape === 'slab') {
    const t = B.getBlock(hit.block);
    if (t.shape === 'slab' && t.variantOf === itemDef.variantOf && ((t.half === 'bottom' && hit.face === 2) || (t.half === 'top' && hit.face === 3))) {
      const full = B.blockByKey(t.fullBlock!)!.id;
      if (blocked(world, full, hit.x, hit.y, hit.z, playerBox, entityBoxes)) return null;
      return one(hit.x, hit.y, hit.z, full);
    }
  }

  let x = hit.px, y = hit.py, z = hit.pz;
  // clicking a replaceable block (tall grass) places into that cell instead
  if (B.getBlock(hit.block).replaceable) { x = hit.x; y = hit.y; z = hit.z; }
  if (y < 0 || y >= 128) return null;
  const existing = world.getBlock(x, y, z);
  const exDef = B.getBlock(existing);

  if (itemDef.shape === 'slab' && exDef.shape === 'slab' && exDef.variantOf === itemDef.variantOf) {
    const full = B.blockByKey(exDef.fullBlock!)!.id;
    if (blocked(world, full, x, y, z, playerBox, entityBoxes)) return null;
    return one(x, y, z, full);
  }
  if (!exDef.replaceable) return null;
  if (existing === itemBlock) return null;

  let block = itemBlock;
  switch (itemDef.shape) {
    case 'slab':
      block = B.SLABS[itemDef.variantOf!][upperHalf ? 'top' : 'bottom'];
      break;
    case 'stairs':
      block = B.STAIRS[itemDef.variantOf!][`${look}:${upperHalf ? 'top' : 'bottom'}`];
      break;
    case 'door': {
      const above = world.getBlock(x, y + 1, z);
      if (!B.getBlock(above).replaceable || y + 1 >= 128) return null;
      if (!solidTop(world.getBlock(x, y - 1, z))) return null;
      const L = B.LEFT_OF[look], R = B.RIGHT_OF[look];
      const [lx, lz] = B.FACING_VEC[L], [rx, rz] = B.FACING_VEC[R];
      const ld = B.getBlock(world.getBlock(x + lx, y, z + lz)), rd = B.getBlock(world.getBlock(x + rx, y, z + rz));
      let hinge: 'l' | 'r';
      if (ld.shape === 'door' && ld.facing === look && ld.hinge === 'l') hinge = 'r';        // make a double door
      else if (rd.shape === 'door' && rd.facing === look && rd.hinge === 'r') hinge = 'l';
      else hinge = (hit.hx - (x + 0.5)) * lx + (hit.hz - (z + 0.5)) * lz > 0 ? 'l' : 'r';
      const lower = B.doorId('lower', look, false, hinge), upper = B.doorId('upper', look, false, hinge);
      if (blocked(world, lower, x, y, z, playerBox, entityBoxes) || blocked(world, upper, x, y + 1, z, playerBox, entityBoxes)) return null;
      return { x, y, z, block: lower, all: [{ x, y, z, block: lower }, { x, y: y + 1, z, block: upper }] };
    }
    case 'bed': {
      const [fx, fz] = B.FACING_VEC[look];
      const hx = x + fx, hz = z + fz;
      if (!B.getBlock(world.getBlock(hx, y, hz)).replaceable) return null;
      if (!solidTop(world.getBlock(x, y - 1, z)) || !solidTop(world.getBlock(hx, y - 1, hz))) return null;
      const foot = B.bedId('foot', look), head = B.bedId('head', look);
      if (blocked(world, foot, x, y, z, playerBox, entityBoxes) || blocked(world, head, hx, y, hz, playerBox, entityBoxes)) return null;
      return { x, y, z, block: foot, all: [{ x, y, z, block: foot }, { x: hx, y, z: hz, block: head }] };
    }
    case 'ladder': {
      const f = faceFacing(hit.face) ?? B.OPPOSITE[look];
      block = B.LADDERS[f];
      break;
    }
    case 'sign':
    case 'wall_sign': {
      if (hit.face === 3) return null;
      const f = faceFacing(hit.face);
      block = f ? B.WALL_SIGNS[f] : B.SIGN_STANDING;
      break;
    }
    case 'gate':
      block = B.gateId(look, false);
      break;
    case 'trapdoor': {
      const f = faceFacing(hit.face);
      block = B.trapdoorId(f ? B.OPPOSITE[f] : look, upperHalf ? 'top' : 'bottom', false);
      break;
    }
    case 'lantern': {
      const hang = hit.face === 3 || (!B.IS_SOLID[world.getBlock(x, y - 1, z)] && B.IS_SOLID[world.getBlock(x, y + 1, z)] === 1);
      block = hang ? B.LANTERN_HANGING : B.LANTERN_STANDING;
      break;
    }
    default:
      if (itemBlock === B.TORCH && hit.face !== 2 && hit.face !== 3) {
        const f: B.Facing = hit.face === 0 ? 'e' : hit.face === 1 ? 'w' : hit.face === 4 ? 's' : 'n';
        block = B.WALL_TORCH[f];
      } else if (itemDef.variantOf && itemDef.facing) {
        // furnaces, chests: the front faces the player
        block = B.facingVariant(itemDef.variantOf, B.OPPOSITE[look]);
      }
  }
  if (needsSupport(block) && !supportOk(world, block, x, y, z)) return null;
  if (blocked(world, block, x, y, z, playerBox, entityBoxes)) return null;
  return one(x, y, z, block);
}

function one(x: number, y: number, z: number, block: number): PlacementResult {
  return { x, y, z, block, all: [{ x, y, z, block }] };
}
