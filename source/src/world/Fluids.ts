import * as B from './BlockRegistry';
import { World, UNLOADED, posKey } from './World';

/**
 * FLOWING WATER AND LAVA
 * ----------------------
 * Fluids are stored as ordinary block ids: a source (level 0), flowing fluid that
 * gets weaker with distance and falling fluid (level 8). Changes are event driven:
 * whenever a block next to a fluid changes, that fluid is scheduled for an update
 * a little later (water 5 ticks, lava 30 ticks: lava is slow).
 *
 * An update:
 *  - recomputes a flowing cell's level from its neighbours (strongest neighbour +
 *    one step, falling if the same fluid is above, gone if nothing feeds it), so
 *    removing a source makes the stream recede;
 *  - turns a flowing water cell with two or more source neighbours into a new
 *    source (the classic "infinite water" trick; lava never does this);
 *  - spreads: straight down first, otherwise sideways one step weaker, preferring
 *    the directions that lead to the nearest drop (within 4 blocks for water, 2
 *    for lava). Water steps 1 level per block (7 blocks), lava 2 (3 blocks).
 * Plants and torches in the way are washed out (water: they drop) or burnt (lava).
 *
 * Lava meeting water cools: a lava SOURCE touched by water on a side or from above
 * becomes Cinderstone, flowing or falling lava becomes cobblestone, and lava
 * flowing down onto water turns that water into stone.
 */

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_UPDATES_PER_TICK = 400;
export const FLOW_DELAY = 5;
export const LAVA_DELAY = 30;
/** Delay before lava reacts to water that has just reached it. */
const REACT_DELAY = 2;

interface FluidKind {
  is: Uint8Array;
  source: number;
  flow: number[];
  falling: number;
  step: number;
  delay: number;
  infinite: boolean;
  reach: number;
}
const WATER_KIND: FluidKind = { is: B.IS_WATER, source: B.WATER, flow: B.WATER_FLOW, falling: B.WATER_FALLING, step: 1, delay: FLOW_DELAY, infinite: true, reach: 4 };
const LAVA_KIND: FluidKind = { is: B.IS_LAVA, source: B.LAVA, flow: B.LAVA_FLOW, falling: B.LAVA_FALLING, step: 2, delay: LAVA_DELAY, infinite: false, reach: 2 };

function kindOf(id: number): FluidKind | null {
  return B.IS_WATER[id] ? WATER_KIND : B.IS_LAVA[id] ? LAVA_KIND : null;
}

function washable(id: number): boolean {
  const r = B.RENDER[id];
  return r === B.RENDER_CROSS || r === B.RENDER_TORCH || r === B.RENDER_WALL_TORCH;
}

/** Strength used for spreading: sources and falling fluid feed at full strength. */
function strength(id: number): number {
  const l = B.FLUID_LEVEL[id];
  return l === 8 ? 0 : l;
}

const SIDES_AND_TOP: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const ALL6: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

export class FluidSystem {
  private due = new Map<number, string[]>();
  private pending = new Map<string, number>();
  updates = 0;
  /** Called when lava and water meet and a block forms (sound, smoke, advancement). */
  onReact?: (x: number, y: number, z: number, formed: number) => void;

  constructor(
    private world: World,
    /** Called before a washable block is replaced by a fluid (water: drop its item; lava: burn it). */
    private wash: (x: number, y: number, z: number, id: number, lava: boolean) => void,
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

  /** Schedules the fluids at and around a changed position. */
  onBlockChanged(x: number, y: number, z: number, now: number): void {
    const w = this.world;
    const here = w.getBlock(x, y, z);
    const hk = kindOf(here);
    if (hk) {
      // new lava next to water reacts at once
      let d = hk.delay;
      if (hk === LAVA_KIND) for (const [dx, dy, dz] of ALL6) if (B.IS_WATER[w.getBlock(x + dx, y + dy, z + dz)]) { d = REACT_DELAY; break; }
      this.schedule(x, y, z, now, d);
    }
    for (const [dx, dy, dz] of ALL6) {
      const n = w.getBlock(x + dx, y + dy, z + dz);
      const k = kindOf(n);
      if (!k) continue;
      this.schedule(x + dx, y + dy, z + dz, now, k === LAVA_KIND && B.IS_WATER[here] ? REACT_DELAY : k.delay);
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

  /** Can fluid of a kind and level move into this cell? (Never into the other fluid.) */
  private canEnter(id: number, level: number, kind: FluidKind): boolean {
    if (id === UNLOADED) return false;
    if (id === B.AIR || washable(id)) return true;
    if (B.IS_FLUID[id]) {
      if (!kind.is[id]) return false;
      const l = B.FLUID_LEVEL[id];
      return l !== 0 && l !== 8 && l > level;
    }
    return B.getBlock(id).replaceable && !B.IS_SOLID[id];
  }

  private put(x: number, y: number, z: number, id: number, kind: FluidKind): void {
    const old = this.get(x, y, z);
    if (washable(old)) this.wash(x, y, z, old, kind === LAVA_KIND);
    this.world.setBlock(x, y, z, id, 'fluid');
  }

  update(x: number, y: number, z: number, now: number): void {
    const id = this.get(x, y, z);
    if (id === UNLOADED) return;
    const kind = kindOf(id);
    if (!kind) return;
    if (kind === LAVA_KIND && this.react(x, y, z, id)) return;
    const level = B.FLUID_LEVEL[id];

    if (level !== 0) {
      // ---- recompute a flowing / falling cell from what feeds it
      let next: number;
      if (kind.is[this.get(x, y + 1, z)]) next = 8;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of DIRS) {
          const n = this.get(x + dx, y, z + dz);
          if (!kind.is[n]) continue;
          if (B.FLUID_LEVEL[n] === 0) sources++;
          best = Math.min(best, strength(n));
        }
        next = best + kind.step;
        const below = this.get(x, y - 1, z);
        if (kind.infinite && sources >= 2 && (B.IS_SOLID[below] || (kind.is[below] && B.FLUID_LEVEL[below] === 0))) next = 0;
        if (next > 7) {
          this.world.setBlock(x, y, z, B.AIR, 'fluid');
          return;
        }
      }
      if (next !== level) {
        this.world.setBlock(x, y, z, next === 8 ? kind.falling : kind.flow[next], 'fluid');
        return; // the change schedules this cell again; it spreads on that update
      }
    }
    this.spread(x, y, z, level, kind);
    void now;
  }

  /** Lava touching water cools into Cinderstone / cobblestone, or turns the water below to stone. */
  private react(x: number, y: number, z: number, id: number): boolean {
    for (const [dx, dy, dz] of SIDES_AND_TOP) {
      if (!B.IS_WATER[this.get(x + dx, y + dy, z + dz)]) continue;
      const formed = B.FLUID_LEVEL[id] === 0 ? B.CINDERSTONE : B.COBBLESTONE;
      this.world.setBlock(x, y, z, formed, 'fluid');
      this.onReact?.(x, y, z, formed);
      return true;
    }
    if (y > 0 && B.IS_WATER[this.get(x, y - 1, z)]) {
      this.world.setBlock(x, y - 1, z, B.STONE, 'fluid');
      this.onReact?.(x, y - 1, z, B.STONE);
    }
    return false;
  }

  private spread(x: number, y: number, z: number, level: number, kind: FluidKind): void {
    const below = this.get(x, y - 1, z);
    if (y > 0 && this.canEnter(below, 7, kind)) {
      this.put(x, y - 1, z, kind.falling, kind);
      if (level !== 0) return;
    } else if (kind.is[below] && level !== 0) {
      return; // resting on the same fluid: merges instead of spreading over it
    }
    const next = level === 0 || level === 8 ? kind.step : level + kind.step;
    if (next > 7) return;
    for (const [dx, dz] of this.flowDirections(x, y, z, next, kind)) {
      const n = this.get(x + dx, y, z + dz);
      if (this.canEnter(n, next, kind)) this.put(x + dx, y, z + dz, kind.flow[next], kind);
    }
  }

  /** Directions leading to the closest drop within reach (all open directions if none). */
  private flowDirections(x: number, y: number, z: number, level: number, kind: FluidKind): [number, number][] {
    let best = 1000;
    const out: [number, number][] = [];
    for (const [dx, dz] of DIRS) {
      const n = this.get(x + dx, y, z + dz);
      if (!this.canEnter(n, level, kind) && !(kind.is[n] && B.FLUID_LEVEL[n] !== 0)) continue;
      const d = this.holeDistance(x + dx, y, z + dz, -dx, -dz, 1, kind);
      if (d < best) { best = d; out.length = 0; }
      if (d === best) out.push([dx, dz]);
    }
    return out;
  }

  private holeDistance(x: number, y: number, z: number, bx: number, bz: number, depth: number, kind: FluidKind): number {
    const below = this.get(x, y - 1, z);
    if (this.canEnter(below, 7, kind) || (kind.is[below] && B.FLUID_LEVEL[below] !== 0)) return depth;
    if (depth >= kind.reach) return 1000;
    let best = 1000;
    for (const [dx, dz] of DIRS) {
      if (dx === bx && dz === bz) continue;
      const n = this.get(x + dx, y, z + dz);
      if (!this.canEnter(n, 7, kind) && !kind.is[n]) continue;
      best = Math.min(best, this.holeDistance(x + dx, y, z + dz, -dx, -dz, depth + 1, kind));
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
