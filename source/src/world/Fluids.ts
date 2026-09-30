import * as B from './BlockRegistry';
import { World, UNLOADED, posKey } from './World';

/**
 * FLOWING WATER
 * -------------
 * Water is stored as ordinary block ids: a source (level 0), flowing water that
 * gets weaker with distance (levels 1..7) and falling water (level 8). Changes are
 * event driven: whenever a block next to water changes, that water is scheduled
 * for an update 5 ticks later (a quarter of a second), like the reference game.
 *
 * An update:
 *  - recomputes a flowing cell's level from its neighbours (strongest neighbour + 1,
 *    falling if there is water above, gone if nothing feeds it), so removing a
 *    source makes the stream recede;
 *  - turns a flowing cell with two or more source neighbours into a new source
 *    (the classic "infinite water" trick);
 *  - spreads: straight down first, otherwise sideways one level weaker, preferring
 *    the directions that lead to the nearest drop within 4 blocks.
 * Plants and torches in the way are washed out and drop as items.
 */

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_UPDATES_PER_TICK = 400;
export const FLOW_DELAY = 5;

function washable(id: number): boolean {
  const r = B.RENDER[id];
  return r === B.RENDER_CROSS || r === B.RENDER_TORCH || r === B.RENDER_WALL_TORCH;
}

/** Strength used for spreading: sources and falling water feed at full strength. */
function strength(id: number): number {
  const l = B.FLUID_LEVEL[id];
  return l === 8 ? 0 : l;
}

export class FluidSystem {
  private due = new Map<number, string[]>();
  private pending = new Map<string, number>();
  updates = 0;

  constructor(
    private world: World,
    /** Called before a washable block is replaced by water (drop its item). */
    private wash: (x: number, y: number, z: number, id: number) => void,
  ) {}

  get queued(): number {
    return this.pending.size;
  }

  schedule(x: number, y: number, z: number, now: number, delay = FLOW_DELAY): void {
    const k = posKey(x, y, z);
    const t = now + delay;
    const cur = this.pending.get(k);
    if (cur !== undefined && cur <= t) return;
    this.pending.set(k, t);
    let list = this.due.get(t);
    if (!list) { list = []; this.due.set(t, list); }
    list.push(k);
  }

  /** Schedules the water at and around a changed position. */
  onBlockChanged(x: number, y: number, z: number, now: number): void {
    const w = this.world;
    if (B.IS_WATER[w.getBlock(x, y, z)]) this.schedule(x, y, z, now);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      if (B.IS_WATER[w.getBlock(x + dx, y + dy, z + dz)]) this.schedule(x + dx, y + dy, z + dz, now);
    }
  }

  tick(now: number): void {
    let budget = MAX_UPDATES_PER_TICK;
    for (const [t, list] of this.due) {
      if (t > now) continue;
      while (list.length && budget > 0) {
        const k = list.pop()!;
        if (this.pending.get(k) !== t) continue;
        this.pending.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        this.update(x, y, z, now);
        budget--;
        this.updates++;
      }
      if (list.length === 0) this.due.delete(t);
      else {
        // out of budget: carry the rest over to the next tick
        this.due.delete(t);
        for (const k of list) { this.pending.delete(k); const [x, y, z] = k.split(',').map(Number); this.schedule(x, y, z, now, 1); }
        return;
      }
    }
  }

  private get(x: number, y: number, z: number): number {
    return this.world.getBlock(x, y, z);
  }

  /** Can water of the given level move into this cell? */
  private canEnter(id: number, level: number): boolean {
    if (id === UNLOADED) return false;
    if (id === B.AIR || washable(id)) return true;
    if (B.IS_WATER[id]) {
      const l = B.FLUID_LEVEL[id];
      return l !== 0 && l !== 8 && l > level;
    }
    return B.getBlock(id).replaceable && !B.IS_SOLID[id];
  }

  private put(x: number, y: number, z: number, id: number): void {
    const old = this.get(x, y, z);
    if (washable(old)) this.wash(x, y, z, old);
    this.world.setBlock(x, y, z, id, 'fluid');
  }

  update(x: number, y: number, z: number, now: number): void {
    const id = this.get(x, y, z);
    if (id === UNLOADED || !B.IS_WATER[id]) return;
    const level = B.FLUID_LEVEL[id];

    if (level !== 0) {
      // ---- recompute a flowing / falling cell from what feeds it
      let next: number;
      if (B.IS_WATER[this.get(x, y + 1, z)]) next = 8;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of DIRS) {
          const n = this.get(x + dx, y, z + dz);
          if (!B.IS_WATER[n]) continue;
          if (B.FLUID_LEVEL[n] === 0) sources++;
          best = Math.min(best, strength(n));
        }
        next = best + 1;
        const below = this.get(x, y - 1, z);
        if (sources >= 2 && (B.IS_SOLID[below] || B.FLUID_LEVEL[below] === 0)) next = 0;
      }
      if (next > 7 && next !== 8 || (next === 8 && !B.IS_WATER[this.get(x, y + 1, z)])) {
        this.world.setBlock(x, y, z, B.AIR, 'fluid');
        return;
      }
      if (next !== level) {
        this.world.setBlock(x, y, z, next === 8 ? B.WATER_FALLING : B.WATER_FLOW[next], 'fluid');
        return; // the change schedules this cell again; it spreads on that update
      }
    }
    this.spread(x, y, z, level);
    void now;
  }

  private spread(x: number, y: number, z: number, level: number): void {
    const below = this.get(x, y - 1, z);
    if (y > 0 && this.canEnter(below, 7)) {
      this.put(x, y - 1, z, B.WATER_FALLING);
      if (level !== 0) return;
    } else if (B.IS_WATER[below] && level !== 0) {
      return; // resting on water: merges instead of spreading over it
    }
    const next = level === 0 || level === 8 ? 1 : level + 1;
    if (next > 7) return;
    for (const [dx, dz] of this.flowDirections(x, y, z, next)) {
      const n = this.get(x + dx, y, z + dz);
      if (this.canEnter(n, next)) this.put(x + dx, y, z + dz, B.WATER_FLOW[next]);
    }
  }

  /** Directions leading to the closest drop within 4 blocks (all open directions if none). */
  private flowDirections(x: number, y: number, z: number, level: number): [number, number][] {
    let best = 1000;
    const out: [number, number][] = [];
    for (const [dx, dz] of DIRS) {
      const n = this.get(x + dx, y, z + dz);
      if (!this.canEnter(n, level) && !(B.IS_WATER[n] && B.FLUID_LEVEL[n] !== 0)) continue;
      const d = this.holeDistance(x + dx, y, z + dz, -dx, -dz, 1);
      if (d < best) { best = d; out.length = 0; }
      if (d === best) out.push([dx, dz]);
    }
    return out;
  }

  private holeDistance(x: number, y: number, z: number, bx: number, bz: number, depth: number): number {
    const below = this.get(x, y - 1, z);
    if (this.canEnter(below, 7) || (B.IS_WATER[below] && B.FLUID_LEVEL[below] !== 0)) return depth;
    if (depth >= 4) return 1000;
    let best = 1000;
    for (const [dx, dz] of DIRS) {
      if (dx === bx && dz === bz) continue;
      const n = this.get(x + dx, y, z + dz);
      if (!this.canEnter(n, 7) && !B.IS_WATER[n]) continue;
      best = Math.min(best, this.holeDistance(x + dx, y, z + dz, -dx, -dz, depth + 1));
    }
    return best;
  }
}

/**
 * Horizontal direction of the current in a water cell (toward weaker water and
 * drops), plus whether it is falling. Used to push the player, creatures and items.
 */
export function waterFlow(world: World, x: number, y: number, z: number): [number, number, boolean] {
  const id = world.getBlock(x, y, z);
  if (!B.IS_WATER[id]) return [0, 0, false];
  const own = strength(id);
  let fx = 0, fz = 0;
  for (const [dx, dz] of DIRS) {
    const n = world.getBlock(x + dx, y, z + dz);
    let d = 0;
    if (B.IS_WATER[n]) d = strength(n) - own;
    else if (n !== UNLOADED && !B.IS_SOLID[n]) d = B.IS_WATER[world.getBlock(x + dx, y - 1, z + dz)] ? 8 - own : 0;
    fx += dx * d; fz += dz * d;
  }
  const l = Math.hypot(fx, fz);
  return l > 0 ? [fx / l, fz / l, B.FLUID_LEVEL[id] === 8] : [0, 0, B.FLUID_LEVEL[id] === 8];
}
