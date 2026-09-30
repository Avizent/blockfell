import * as B from '../world/BlockRegistry';
import type { World } from '../world/World';
import { UNLOADED } from '../world/World';

/**
 * Grid A* for villagers (and the Sentinel). A node is a cell a creature can stand
 * in: two passable cells above something solid. Moves go to the 8 neighbours,
 * one block up (a jump) or up to three blocks down. Doors count as passable
 * because villagers open them. Searches are bounded (nodes and distance) so a
 * path request never costs more than a fraction of a millisecond or two.
 */
export interface Step { x: number; y: number; z: number }

/** Set for the duration of a search by creatures that can't open doors. */
let closedDoorsBlock = false;

function passable(id: number): boolean {
  if (id === UNLOADED || B.IS_LAVA[id]) return false;
  if (B.IS_WATER[id]) return true;
  const d = B.getBlock(id);
  if (d.shape === 'door') return !closedDoorsBlock || !!d.open;
  return !B.IS_SOLID[id];
}

function standable(id: number): boolean {
  if (id === UNLOADED || !B.IS_SOLID[id]) return false;
  const d = B.getBlock(id);
  // nobody walks along the top of a fence, gate, ladder or lantern
  return d.shape !== 'bed' && d.shape !== 'door' && id !== B.CACTUS && !B.CONNECT[id] && d.shape !== 'gate'
    && d.shape !== 'ladder' && d.shape !== 'lantern' && d.shape !== 'pot';
}

export function canStand(w: World, x: number, y: number, z: number): boolean {
  return passable(w.getBlock(x, y, z)) && passable(w.getBlock(x, y + 1, z)) && standable(w.getBlock(x, y - 1, z));
}

/** Nearest standable cell to (x, y, z) within `r` blocks (searching a few levels up and down). */
export function nearestStandable(w: World, x: number, y: number, z: number, r = 2): Step | null {
  let best: Step | null = null, bd = 1e9;
  for (let dy = -2; dy <= 2; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (!canStand(w, x + dx, y + dy, z + dz)) continue;
    const d = dx * dx + dz * dz + dy * dy * 2;
    if (d < bd) { bd = d; best = { x: x + dx, y: y + dy, z: z + dz }; }
  }
  return best;
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number { return this.k.length; }
  push(key: number, val: number): void {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i, mk = lk;
        if (a < n && k[a] < mk) { m = a; mk = k[a]; }
        if (b < n && k[b] < mk) { m = b; mk = k[b]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Finds a walkable route from a standing cell to a target cell. Returns the
 * steps after the start (the last one is the target), or null. With `partial`,
 * an unreachable target yields a route to the closest reachable cell instead.
 */
export function findPath(w: World, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number,
  opts: { maxNodes?: number; range?: number; partial?: boolean; closedDoors?: boolean } = {}): Step[] | null {
  closedDoorsBlock = !!opts.closedDoors;
  try {
    return search(w, sx, sy, sz, tx, ty, tz, opts);
  } finally {
    closedDoorsBlock = false;
  }
}

function search(w: World, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number,
  opts: { maxNodes?: number; range?: number; partial?: boolean }): Step[] | null {
  const maxNodes = opts.maxNodes ?? 2500;
  const range = opts.range ?? 48;
  if (Math.abs(tx - sx) > range || Math.abs(tz - sz) > range) return null;
  const R = 64;   // key space: +-64 blocks around the start
  const key = (x: number, y: number, z: number) => (((x - sx + R) * 130 + (z - sz + R)) << 7) | (y & 127);
  const h = (x: number, y: number, z: number) => {
    const dx = Math.abs(x - tx), dz = Math.abs(z - tz);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) + Math.abs(y - ty) * 0.5;
  };
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const pos = new Map<number, Step>();
  const open = new Heap();
  const start = key(sx, sy, sz);
  g.set(start, 0);
  pos.set(start, { x: sx, y: sy, z: sz });
  open.push(h(sx, sy, sz), start);
  const closed = new Set<number>();
  let best = start, bestH = h(sx, sy, sz);
  let expanded = 0;
  const goal = key(tx, ty, tz);
  while (open.size && expanded < maxNodes) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    expanded++;
    if (cur === goal) { best = cur; bestH = 0; break; }
    const c = pos.get(cur)!;
    const hc = h(c.x, c.y, c.z);
    if (hc < bestH) { bestH = hc; best = cur; }
    const gc = g.get(cur)!;
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = DIRS[i];
      const nx = c.x + dx, nz = c.z + dz;
      if (Math.abs(nx - sx) >= R - 1 || Math.abs(nz - sz) >= R - 1) continue;
      const diag = i >= 4;
      if (diag) {
        // no corner cutting
        if (!passable(w.getBlock(c.x + dx, c.y, c.z)) || !passable(w.getBlock(c.x + dx, c.y + 1, c.z))) continue;
        if (!passable(w.getBlock(c.x, c.y, c.z + dz)) || !passable(w.getBlock(c.x, c.y + 1, c.z + dz))) continue;
      }
      let ny = -1;
      if (canStand(w, nx, c.y, nz)) ny = c.y;
      else if (!diag && passable(w.getBlock(c.x, c.y + 2, c.z)) && canStand(w, nx, c.y + 1, nz)) ny = c.y + 1;
      else if (!diag && passable(w.getBlock(nx, c.y, nz)) && passable(w.getBlock(nx, c.y + 1, nz))) {
        for (let d = 1; d <= 3; d++) {
          if (canStand(w, nx, c.y - d, nz)) { ny = c.y - d; break; }
          if (!passable(w.getBlock(nx, c.y - d, nz))) break;
        }
      }
      if (ny < 1) continue;
      const nk = key(nx, ny, nz);
      if (closed.has(nk)) continue;
      let cost = diag ? 1.414 : 1;
      if (ny > c.y) cost += 0.5;
      else if (ny < c.y) cost += 0.3 * (c.y - ny);
      const here = w.getBlock(nx, ny, nz);
      if (B.IS_WATER[here]) cost += 3;
      else if (B.getBlock(here).shape === 'door') cost += 0.5;
      if (B.CROP_STAGE[here] >= 0 || B.IS_FARMLAND(w.getBlock(nx, ny - 1, nz))) cost += 2;   // keep off the crops
      const ng = gc + cost;
      const og = g.get(nk);
      if (og !== undefined && og <= ng) continue;
      g.set(nk, ng);
      parent.set(nk, cur);
      pos.set(nk, { x: nx, y: ny, z: nz });
      open.push(ng + h(nx, ny, nz), nk);
    }
  }
  if (best !== goal && !opts.partial) return null;
  if (best === start) return best === goal ? [] : null;
  const out: Step[] = [];
  for (let k: number | undefined = best; k !== undefined && k !== start; k = parent.get(k)) out.push(pos.get(k)!);
  return out.reverse();
}
