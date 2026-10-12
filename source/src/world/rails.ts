import { IS_RAIL } from './BlockRegistry';

/**
 * RAIL SHAPES (2.4)
 * -----------------
 * A rail block has no stored orientation. Its shape - straight, curved or sloped - is
 * worked out from the rails in the four cells round it (level, one up or one down), by
 * this one function, which the chunk mesher and the minecart both use. Nothing extra
 * is saved with the world, and laying or breaking a rail re-shapes its neighbours.
 *
 * Directions: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x).
 */
export const DIR_X = [0, 1, 0, -1];
export const DIR_Z = [-1, 0, 1, 0];
export const opposite = (d: number): number => (d + 2) & 3;

/** A rail piece: the two directions it connects, and which way it climbs (-1 = flat). */
export interface RailShape {
  a: number;
  b: number;
  /** Direction the track rises towards (a slope); -1 for a flat piece. */
  rise: number;
}

/** Looks up a block relative to the rail's own cell: (dx, dy, dz) -> block id. */
export type RelBlock = (dx: number, dy: number, dz: number) => number;

const out: RailShape = { a: 0, b: 2, rise: -1 };

/**
 * The shape of a rail of `kind` (1 Rail, 2 Boost, 3 Station) given its surroundings.
 * Boost and Station rails are always straight. The returned object is reused.
 */
export function railShape(at: RelBlock, kind: number): RailShape {
  const link = [false, false, false, false];
  const up = [false, false, false, false];
  for (let d = 0; d < 4; d++) {
    const dx = DIR_X[d], dz = DIR_Z[d];
    if (IS_RAIL[at(dx, 0, dz)]) link[d] = true;
    else if (IS_RAIL[at(dx, 1, dz)]) { link[d] = true; up[d] = true; }
    else if (IS_RAIL[at(dx, -1, dz)]) link[d] = true;
  }
  let a = 0, b = 2;
  const ns = link[0] && link[2], ew = link[1] && link[3];
  if (kind !== 1) {
    // straight only: along the axis the neighbours lie on
    const anyNS = link[0] || link[2], anyEW = link[1] || link[3];
    if (ns || (anyNS && !anyEW)) { a = 0; b = 2; }
    else if (ew || (anyEW && !anyNS)) { a = 1; b = 3; }
    else if (anyNS) { a = 0; b = 2; }
  } else if (ns) { a = 0; b = 2; }
  else if (ew) { a = 1; b = 3; }
  else {
    const flat: number[] = [];
    let any = -1;
    for (let d = 0; d < 4; d++) if (link[d]) { if (any < 0) any = d; if (!up[d]) flat.push(d); }
    if (flat.length >= 2) { a = flat[0]; b = flat[1]; }                       // a curve (never on a slope)
    else if (flat.length === 1) { a = flat[0]; b = opposite(a); }
    else if (any >= 0) { a = any; b = opposite(any); }
  }
  let rise = -1;
  if (b === opposite(a)) {
    if (up[a] && !up[b]) rise = a;
    else if (up[b] && !up[a]) rise = b;
  }
  out.a = a; out.b = b; out.rise = rise;
  return out;
}

/** For rendering: shape kind 0 straight / 1 curve, and the quarter turns of the texture. */
export function railLook(s: RailShape): { curve: boolean; turns: number } {
  if (s.b === opposite(s.a)) return { curve: false, turns: s.a & 1 };
  // the curve texture joins south and east; each quarter turn (clockwise) moves both on one direction
  for (let r = 0; r < 4; r++) {
    const p = (1 + r) & 3, q = (2 + r) & 3;
    if ((s.a === p && s.b === q) || (s.a === q && s.b === p)) return { curve: true, turns: r };
  }
  return { curve: true, turns: 0 };
}
