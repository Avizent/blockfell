import { hash4, mulberry32 } from '../core/rng';
import * as B from './BlockRegistry';
import type { Facing, Profession } from './BlockRegistry';
import { SEA_LEVEL, WORLD_HEIGHT, localIndex } from './constants';
import { BIOME_DESERT, BIOME_OCEAN, BIOME_PLAINS, BIOME_RIVER, BIOME_TAIGA } from './BiomeSystem';

/**
 * VILLAGES
 * --------
 * Villages are planned per 320x320 region from the world seed alone, so the
 * worker that generates a chunk and the main thread that populates the village
 * compute exactly the same plan. A plan is a list of buildings (with world
 * footprint, floor height, rotation and the positions of beds, workstations and
 * chests) and a set of path cells. Each chunk stamps only the parts of the plan
 * that fall inside it, so buildings that straddle chunk borders are always
 * complete.
 */
export const VILLAGE_REGION = 320;
const MAX_EXTENT = 72;

export type VillageStyle = 'timber' | 'sandstone' | 'spruce';
export type BuildingKind = 'house' | 'big_house' | 'farm' | 'well' | 'lamp';
export interface Pos { x: number; y: number; z: number }

export interface Building {
  kind: BuildingKind;
  x0: number; z0: number;   // world min corner of the footprint
  w: number; d: number;     // local width (along the front) and depth, before rotation
  rot: Facing;              // direction the front (door) faces
  y: number;                // floor level
  variant: number;
  job: Profession | null;
  bed?: Pos & { f: Facing };  // bed foot and the direction to its head
  work?: Pos;
  chest?: Pos;
  crop?: B.CropKind;
}

export interface VillagePlan {
  id: string;
  x: number; z: number; y: number;
  style: VillageStyle;
  radius: number;
  buildings: Building[];
  /** "x,z" -> y of the path block. */
  paths: Map<string, number>;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface ColumnInfoLike { height: number; biome: number; mountain: number; river: number }
interface ColumnSource { column(x: number, z: number, out?: ColumnInfoLike): ColumnInfoLike; readonly version?: number }

const FACINGS: Facing[] = ['n', 'e', 's', 'w'];

/** Rotates a facing given in building-local space (front = south) into the world. */
export function rotFacing(f: Facing, rot: Facing): Facing {
  const [fx, fz] = B.FACING_VEC[f];
  let x = fx, z = fz;
  if (rot === 'n') { x = -fx; z = -fz; } else if (rot === 'e') { x = fz; z = -fx; } else if (rot === 'w') { x = -fz; z = fx; }
  return x > 0 ? 'e' : x < 0 ? 'w' : z > 0 ? 's' : 'n';
}

/** World footprint size of a building. */
function worldSize(b: { w: number; d: number; rot: Facing }): [number, number] {
  return b.rot === 'e' || b.rot === 'w' ? [b.d, b.w] : [b.w, b.d];
}

/** Local (lx, lz) inside a building -> world (x, z). */
export function toWorld(b: Building, lx: number, lz: number): [number, number] {
  switch (b.rot) {
    case 'n': return [b.x0 + b.w - 1 - lx, b.z0 + b.d - 1 - lz];
    case 'e': return [b.x0 + lz, b.z0 + b.w - 1 - lx];
    case 'w': return [b.x0 + b.d - 1 - lz, b.z0 + lx];
    default: return [b.x0 + lx, b.z0 + lz];
  }
}

const keyCache = new Map<string, number>();
/** Block id for a registry key written in building-local orientation. */
function idFor(key: string, rot: Facing): number {
  const ck = key + '@' + rot;
  let id = keyCache.get(ck);
  if (id !== undefined) return id;
  const parts = key.split(':').map((p) => (p === 'n' || p === 'e' || p === 's' || p === 'w' ? rotFacing(p, rot) : p));
  const def = B.blockByKey(parts.join(':'));
  if (!def) throw new Error('Unknown village block ' + key);
  id = def.id;
  keyCache.set(ck, id);
  return id;
}

interface Palette {
  base: string; wall: string; corner: string; floor: string; filler: number; surface: number;
  roof: string | null; ridge: string; ridgeSlab: string; path: number; well: string; wellSlab: string; post: string;
}
function palette(style: VillageStyle, variant: number): Palette {
  if (style === 'sandstone') {
    return { base: 'sandstone', wall: 'sandstone', corner: 'sandstone', floor: 'planks', filler: B.SAND, surface: B.SAND,
      roof: null, ridge: 'sandstone', ridgeSlab: 'sandstone_slab:bottom', path: B.SANDSTONE, well: 'sandstone', wellSlab: 'sandstone_slab:bottom', post: 'sandstone' };
  }
  const roofs = style === 'spruce' ? ['cobblestone', 'stone_brick'] : ['oak', 'brick', 'oak'];
  const r = roofs[variant % roofs.length];
  const full = r === 'oak' ? 'planks' : r === 'brick' ? 'bricks' : r === 'stone_brick' ? 'stone_bricks' : 'cobblestone';
  return {
    base: 'cobblestone', wall: 'planks', corner: style === 'spruce' ? 'spruce_log' : 'log', floor: 'planks',
    filler: B.DIRT, surface: B.GRASS, roof: `${r}_stairs`, ridge: full, ridgeSlab: `${r}_slab:bottom`,
    path: B.PATH, well: 'cobblestone', wellSlab: 'cobblestone_slab:bottom', post: style === 'spruce' ? 'spruce_log' : 'log',
  };
}

/** Writes blocks of one chunk; everything outside the chunk is ignored. */
class ChunkWriter {
  readonly minX: number; readonly minZ: number;
  constructor(readonly blocks: Uint8Array, cx: number, cz: number) { this.minX = cx * 16; this.minZ = cz * 16; }
  inside(x: number, z: number): boolean { return x >= this.minX && x < this.minX + 16 && z >= this.minZ && z < this.minZ + 16; }
  set(x: number, y: number, z: number, id: number): void {
    if (y < 1 || y >= WORLD_HEIGHT || !this.inside(x, z)) return;
    this.blocks[localIndex(x - this.minX, y, z - this.minZ)] = id;
  }
  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT || !this.inside(x, z)) return B.AIR;
    return this.blocks[localIndex(x - this.minX, y, z - this.minZ)];
  }
}

export class VillagePlanner {
  private cache = new Map<string, VillagePlan | null>();
  private tmp: ColumnInfoLike = { height: 0, biome: 0, mountain: 0, river: 0 };

  constructor(private seed: number, private gen: ColumnSource) {}

  planForRegion(rx: number, rz: number): VillagePlan | null {
    const k = rx + ',' + rz;
    if (this.cache.has(k)) return this.cache.get(k)!;
    const p = this.makePlan(rx, rz);
    this.cache.set(k, p);
    return p;
  }

  /** Plans whose area (grown by `margin`) contains the point. */
  near(x: number, z: number, margin = 0): VillagePlan[] {
    const out: VillagePlan[] = [];
    const r0x = Math.floor((x - MAX_EXTENT) / VILLAGE_REGION), r1x = Math.floor((x + MAX_EXTENT) / VILLAGE_REGION);
    const r0z = Math.floor((z - MAX_EXTENT) / VILLAGE_REGION), r1z = Math.floor((z + MAX_EXTENT) / VILLAGE_REGION);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const p = this.planForRegion(rx, rz);
      if (p && x >= p.minX - margin && x <= p.maxX + margin && z >= p.minZ - margin && z <= p.maxZ + margin) out.push(p);
    }
    return out;
  }

  inVillage(x: number, z: number, margin = 0): boolean {
    return this.near(x, z, margin).length > 0;
  }

  /** The village whose centre lies in this chunk, if any. */
  centredInChunk(cx: number, cz: number): VillagePlan | null {
    const x = cx * 16 + 8, z = cz * 16 + 8;
    const p = this.planForRegion(Math.floor(x / VILLAGE_REGION), Math.floor(z / VILLAGE_REGION));
    return p && p.x >> 4 === cx && p.z >> 4 === cz ? p : null;
  }

  byId(id: string): VillagePlan | null {
    const m = /^v(-?\d+)_(-?\d+)$/.exec(id);
    return m ? this.planForRegion(Number(m[1]), Number(m[2])) : null;
  }

  private h(x: number, z: number): number {
    return this.gen.column(x, z, this.tmp).height;
  }

  // ------------------------------------------------------------------ planning
  private makePlan(rx: number, rz: number): VillagePlan | null {
    const rng = mulberry32(hash4(this.seed, rx, rz, 0x7a11a9e));
    if (rng() > 0.6) return null;
    const R = VILLAGE_REGION;
    const cx = rx * R + 80 + Math.floor(rng() * (R - 160));
    const cz = rz * R + 80 + Math.floor(rng() * (R - 160));
    const c = this.gen.column(cx, cz, this.tmp);
    const biome = c.biome, cy = c.height;
    if (biome !== BIOME_PLAINS && biome !== BIOME_DESERT && biome !== BIOME_TAIGA) return null;
    if (cy <= SEA_LEVEL + 1 || cy > WORLD_HEIGHT - 30) return null;
    let bad = 0, minH = 999, maxH = -1;
    for (let dz = -32; dz <= 32; dz += 8) for (let dx = -32; dx <= 32; dx += 8) {
      const col = this.gen.column(cx + dx, cz + dz, this.tmp);
      if (col.height <= SEA_LEVEL || col.biome === BIOME_RIVER || col.biome === BIOME_OCEAN) bad++;
      minH = Math.min(minH, col.height); maxH = Math.max(maxH, col.height);
    }
    if (bad > 8 || maxH - minH > 16) return null;

    const style: VillageStyle = biome === BIOME_DESERT ? 'sandstone' : biome === BIOME_TAIGA ? 'spruce' : 'timber';
    const plan: VillagePlan = {
      id: `v${rx}_${rz}`, x: cx, z: cz, y: cy, style, radius: 0, buildings: [], paths: new Map(),
      minX: cx, maxX: cx, minZ: cz, maxZ: cz,
    };
    const B_ = plan.buildings;
    B_.push({ kind: 'well', x0: cx - 2, z0: cz - 2, w: 5, d: 5, rot: 's', y: cy, variant: 0, job: null });

    const pathY = (x: number, z: number) => Math.max(SEA_LEVEL, this.h(x, z));
    const occupied = (x0: number, z0: number, w: number, d: number, pad: number) => {
      for (const b of B_) {
        const [bw, bd] = worldSize(b);
        if (x0 - pad < b.x0 + bw && x0 + w + pad > b.x0 && z0 - pad < b.z0 + bd && z0 + d + pad > b.z0) return true;
      }
      for (let z = z0 - 1; z < z0 + d + 1; z++) for (let x = x0 - 1; x < x0 + w + 1; x++) {
        const inside = x >= x0 && x < x0 + w && z >= z0 && z < z0 + d;
        if (inside && plan.paths.has(x + ',' + z)) return true;
      }
      return false;
    };

    // streets: 2-4 arms from the well, three blocks wide
    const dirs = [...FACINGS].sort(() => rng() - 0.5);
    const arms: { dir: Facing; len: number }[] = [];
    for (const dir of dirs) {
      if (arms.length >= 2 && rng() < 0.3) continue;
      arms.push({ dir, len: 20 + Math.floor(rng() * 16) });
    }
    for (const a of arms) {
      const [fx, fz] = B.FACING_VEC[a.dir];
      const px = -fz, pz = fx;
      for (let t = 3; t <= a.len; t++) for (let s = -1; s <= 1; s++) {
        const x = cx + fx * t + px * s, z = cz + fz * t + pz * s;
        plan.paths.set(x + ',' + z, pathY(x, z));
      }
    }
    // a ring of path around the well
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 3) plan.paths.set((cx + dx) + ',' + (cz + dz), pathY(cx + dx, cz + dz));
    }

    // plots along both sides of each street
    const jobs: Profession[] = ['farmer', 'smith', 'mason', 'scribe', 'fletcher', 'farmer'];
    // terrain version 6 (1.8): villages have a Mapmaker too
    if ((this.gen.version ?? 0) >= 6) jobs.push('mapmaker');
    jobs.sort(() => rng() - 0.5);
    let farms = 0, houses = 0;
    for (const a of arms) {
      const [fx, fz] = B.FACING_VEC[a.dir];
      const px = -fz, pz = fx;
      for (let t = 7; t + 3 <= a.len; t += 9 + Math.floor(rng() * 3)) {
        for (const side of [-1, 1]) {
          const r = rng();
          let kind: BuildingKind = r < 0.2 && farms < 3 ? 'farm' : r < 0.3 ? 'lamp' : r < 0.55 ? 'big_house' : 'house';
          if (rng() < 0.12) continue;
          const [w, d] = kind === 'farm' ? [9, 7] : kind === 'big_house' ? [7, 7] : kind === 'house' ? [5, 6] : [1, 1];
          // the front faces the street
          const vx = -side * px, vz = -side * pz;
          const rot: Facing = vx > 0 ? 'e' : vx < 0 ? 'w' : vz > 0 ? 's' : 'n';
          const [ww, wd] = worldSize({ w, d, rot });
          const off = kind === 'lamp' ? 2 : 3 + (d - 1) / 2;
          const mx = cx + fx * t + px * side * off, mz = cz + fz * t + pz * side * off;
          const x0 = Math.round(mx - (ww - 1) / 2), z0 = Math.round(mz - (wd - 1) / 2);
          if (occupied(x0, z0, ww, wd, kind === 'lamp' ? 0 : 1)) continue;
          let lo = 999, hi = -1, sum = 0;
          for (let z = z0; z < z0 + wd; z++) for (let x = x0; x < x0 + ww; x++) {
            const hh = this.h(x, z); lo = Math.min(lo, hh); hi = Math.max(hi, hh); sum += hh;
          }
          if (lo <= SEA_LEVEL || hi - lo > 4) {
            if (kind !== 'lamp') continue;
          }
          const y = kind === 'lamp' ? pathY(x0, z0) : Math.round(sum / (ww * wd));
          const b: Building = { kind, x0, z0, w, d, rot, y, variant: Math.floor(rng() * 6), job: null };
          if (kind === 'farm') { farms++; b.crop = rng() < 0.65 ? 'wheat' : 'carrots'; }
          if (kind === 'house' || kind === 'big_house') {
            b.job = houses < jobs.length && rng() < 0.85 ? jobs[houses] : null;
            houses++;
            const [bx, bz] = toWorld(b, 1, 2);
            b.bed = { x: bx, y: y + 1, z: bz, f: rotFacing('n', rot) };
            const [wx, wz] = toWorld(b, w - 2, 1);
            if (b.job) b.work = { x: wx, y: y + 1, z: wz };
            if (kind === 'big_house') { const [kx, kz] = toWorld(b, w - 2, 3); b.chest = { x: kx, y: y + 1, z: kz }; }
            // short path from the door to the street
            const doorX = (w - 1) >> 1;
            for (const lz of [d, d + 1]) {
              const [qx, qz] = toWorld(b, doorX, lz);
              if (!plan.paths.has(qx + ',' + qz)) plan.paths.set(qx + ',' + qz, y);
            }
          }
          B_.push(b);
        }
      }
    }
    if (houses < 2) return null;
    // make sure a village with farms has a farmer
    if (farms > 0 && !B_.some((b) => b.job === 'farmer')) {
      const h = B_.find((b) => (b.kind === 'house' || b.kind === 'big_house'));
      if (h) { h.job = 'farmer'; const [wx, wz] = toWorld(h, h.w - 2, 1); h.work = { x: wx, y: h.y + 1, z: wz }; }
    }
    for (const b of B_) {
      const [ww, wd] = worldSize(b);
      plan.minX = Math.min(plan.minX, b.x0 - 2); plan.maxX = Math.max(plan.maxX, b.x0 + ww + 1);
      plan.minZ = Math.min(plan.minZ, b.z0 - 2); plan.maxZ = Math.max(plan.maxZ, b.z0 + wd + 1);
    }
    for (const k of plan.paths.keys()) {
      const [x, z] = k.split(',').map(Number);
      plan.minX = Math.min(plan.minX, x - 1); plan.maxX = Math.max(plan.maxX, x + 1);
      plan.minZ = Math.min(plan.minZ, z - 1); plan.maxZ = Math.max(plan.maxZ, z + 1);
    }
    plan.radius = Math.ceil(Math.max(cx - plan.minX, plan.maxX - cx, cz - plan.minZ, plan.maxZ - cz));
    return plan;
  }

  // ------------------------------------------------------------------ stamping
  /** Builds every part of every nearby village that lies inside this chunk. */
  stampChunk(cx: number, cz: number, blocks: Uint8Array, containers: { x: number; y: number; z: number; loot: string }[]): void {
    const plans = new Set<VillagePlan>();
    for (const [x, z] of [[cx * 16, cz * 16], [cx * 16 + 15, cz * 16], [cx * 16, cz * 16 + 15], [cx * 16 + 15, cz * 16 + 15]]) {
      for (const p of this.near(x, z, 0)) plans.add(p);
    }
    if (!plans.size) return;
    const wr = new ChunkWriter(blocks, cx, cz);
    for (const p of plans) {
      const pal = palette(p.style, 0);
      // paths first: building pads then overwrite anything they touch
      for (const [k, y] of p.paths) {
        const [x, z] = k.split(',').map(Number);
        if (!wr.inside(x, z)) continue;
        const h = this.h(x, z);
        if (h < SEA_LEVEL && y <= SEA_LEVEL) { wr.set(x, SEA_LEVEL, z, B.PLANKS); continue; }
        for (let yy = y - 1; yy > y - 4 && yy > h; yy--) wr.set(x, yy, z, pal.filler);
        wr.set(x, y, z, pal.path);
        for (let yy = y + 1; yy <= Math.max(y + 3, h + 1); yy++) wr.set(x, yy, z, B.AIR);
      }
      // two passes: every building's ground pad first, then the buildings themselves,
      // so a pad can never cut into a neighbouring building or lamp
      const here = p.buildings.filter((b) => {
        const [ww, wd] = worldSize(b);
        return !(b.x0 - 2 > wr.minX + 15 || b.x0 + ww + 1 < wr.minX || b.z0 - 2 > wr.minZ + 15 || b.z0 + wd + 1 < wr.minZ);
      });
      for (const b of here) if (b.kind !== 'lamp') this.pad(wr, p, b, palette(p.style, b.variant));
      for (const b of here) this.stampBuilding(wr, p, b, containers);
    }
  }

  private pad(wr: ChunkWriter, p: VillagePlan, b: Building, pal: Palette): void {
    const clearH = b.kind === 'well' ? 5 : b.kind === 'farm' ? 3 : pal.roof === null ? 7 : 6 + Math.ceil(b.w / 2);
    const base = idFor(pal.base, 's');
    const [ww, wd] = worldSize(b);
    for (let z = b.z0 - 1; z <= b.z0 + wd; z++) for (let x = b.x0 - 1; x <= b.x0 + ww; x++) {
      if (!wr.inside(x, z)) continue;
      const inside = x >= b.x0 && x < b.x0 + ww && z >= b.z0 && z < b.z0 + wd;
      const h = this.h(x, z);
      const top = Math.max(h, b.y) + clearH;
      if (inside) {
        for (let yy = b.y - 1; yy > h && yy > b.y - 12; yy--) wr.set(x, yy, z, base);
        wr.set(x, b.y, z, base);
        for (let yy = b.y + 1; yy <= top; yy++) wr.set(x, yy, z, B.AIR);
      } else {
        if (p.paths.has(x + ',' + z)) continue;
        for (let yy = b.y - 1; yy > h && yy > b.y - 12; yy--) wr.set(x, yy, z, pal.filler);
        wr.set(x, b.y, z, pal.surface);
        for (let yy = b.y + 1; yy <= Math.max(h + 2, b.y + 4); yy++) wr.set(x, yy, z, B.AIR);
      }
    }
  }

  private stampBuilding(wr: ChunkWriter, p: VillagePlan, b: Building, containers: { x: number; y: number; z: number; loot: string }[]): void {
    const pal = palette(p.style, b.variant);
    const put = (lx: number, dy: number, lz: number, key: string | number) => {
      const [x, z] = toWorld(b, lx, lz);
      wr.set(x, b.y + dy, z, typeof key === 'number' ? key : idFor(key, b.rot));
    };
    const y0 = b.y;
    switch (b.kind) {
      case 'well': {
        for (let lz = 0; lz < 5; lz++) for (let lx = 0; lx < 5; lx++) {
          const ring = lx === 0 || lx === 4 || lz === 0 || lz === 4;
          if (ring) { put(lx, 0, lz, pal.well); continue; }
          put(lx, -3, lz, pal.well);
          put(lx, -2, lz, B.WATER); put(lx, -1, lz, B.WATER); put(lx, 0, lz, B.WATER);
        }
        for (const [lx, lz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) { put(lx, 1, lz, pal.post); put(lx, 2, lz, pal.post); }
        for (let lz = 0; lz < 5; lz++) for (let lx = 0; lx < 5; lx++) put(lx, 3, lz, pal.wellSlab);
        // terrain version 6 (1.8): the Village Bell, set in the middle of the well's roof
        if ((this.gen.version ?? 0) >= 6) put(2, 3, 2, B.BELL);
        break;
      }
      case 'lamp': {
        const [x, z] = toWorld(b, 0, 0);
        if (!wr.inside(x, z)) break;
        for (let yy = y0 + 1; yy <= y0 + 5; yy++) wr.set(x, yy, z, B.AIR);
        put(0, 0, 0, pal.base);
        if ((this.gen.version ?? 0) >= 4) {
          // terrain version 4: a fence-post lamp with a lantern on top
          put(0, 1, 0, B.OAK_FENCE); put(0, 2, 0, B.OAK_FENCE); put(0, 3, 0, B.OAK_FENCE);
          wr.set(x, y0 + 4, z, B.LANTERN_STANDING);
          break;
        }
        put(0, 1, 0, pal.post); put(0, 2, 0, pal.post); put(0, 3, 0, pal.post);
        wr.set(x, y0 + 4, z, B.TORCH);
        break;
      }
      case 'farm': {
        const stages = b.crop === 'carrots' ? B.CARROTS : B.WHEAT;
        for (let lz = 0; lz < b.d; lz++) for (let lx = 0; lx < b.w; lx++) {
          const border = lx === 0 || lx === b.w - 1 || lz === 0 || lz === b.d - 1;
          if (border) { put(lx, 0, lz, p.style === 'sandstone' ? 'sandstone' : pal.post); continue; }
          if (lz === (b.d >> 1)) { put(lx, 0, lz, B.WATER); put(lx, -1, lz, pal.filler); continue; }
          put(lx, 0, lz, B.FARMLAND_MOIST);
          const [x, z] = toWorld(b, lx, lz);
          const r = hash4(this.seed, x, z, 0xc409) % 100;
          const stage = r < 45 ? stages.length - 1 : Math.floor((r / 100) * stages.length);
          put(lx, 1, lz, stages[Math.min(stages.length - 1, stage)]);
        }
        // a hay bale on one corner post
        put(0, 1, 0, B.HAY_BALE);
        break;
      }
      case 'house':
      case 'big_house': {
        const W = b.w, D = b.d, big = b.kind === 'big_house';
        const flat = pal.roof === null;
        const doorX = (W - 1) >> 1;
        for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < W; lx++) {
          const edge = lx === 0 || lx === W - 1 || lz === 0 || lz === D - 1;
          put(lx, 0, lz, edge ? pal.base : pal.floor);
          if (!edge) continue;
          const corner = (lx === 0 || lx === W - 1) && (lz === 0 || lz === D - 1);
          for (let dy = 1; dy <= 3; dy++) put(lx, dy, lz, corner ? pal.corner : dy === 1 ? pal.base : pal.wall);
        }
        // windows
        const mid = D >> 1;
        put(0, 2, mid, 'glass'); put(W - 1, 2, mid, 'glass');
        if (big) { put(2, 2, 0, 'glass'); put(W - 3, 2, 0, 'glass'); } else put(doorX, 2, 0, 'glass');
        // door, with a torch beside it outside
        put(doorX, 1, D - 1, 'oak_door:lower:n:c:l');
        put(doorX, 2, D - 1, 'oak_door:upper:n:c:l');
        put(doorX + 1, 2, D, 'wall_torch:s');
        // roof
        if (flat) {
          for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < W; lx++) {
            put(lx, 4, lz, pal.ridge);
            const edge = lx === 0 || lx === W - 1 || lz === 0 || lz === D - 1;
            if (edge) put(lx, 5, lz, pal.ridgeSlab);
          }
        } else {
          const layers = (W + 1) >> 1;
          for (let k = 0; k < layers; k++) {
            const yy = 4 + k;
            const left = -1 + k, right = W - k;
            for (let lz = -1; lz <= D; lz++) {
              put(left, yy, lz, `${pal.roof}:e:bottom`);
              put(right, yy, lz, `${pal.roof}:w:bottom`);
              if (left + 1 === right - 1) { put(left + 1, yy, lz, pal.ridge); put(left + 1, yy + 1, lz, pal.ridgeSlab); }
            }
            // gable ends fill the triangle under the roof at the front and back
            for (let lx = left + 1; lx <= right - 1; lx++) { put(lx, yy, 0, pal.wall); put(lx, yy, D - 1, pal.wall); }
          }
        }
        // inside: bed, workstation, torch, chest
        put(1, 1, 1, 'bed:head:n'); put(1, 1, 2, 'bed:foot:n');
        if (b.job) put(W - 2, 1, 1, B.WORKSTATION[b.job]);
        put(doorX, 3, 1, 'wall_torch:s');
        if (big) {
          put(W - 2, 1, 3, 'chest:w');
          if (b.chest && wr.inside(b.chest.x, b.chest.z)) containers.push({ ...b.chest, loot: 'village' });
          put(1, 1, D - 2, 'crafting_table');
        }
        break;
      }
    }
  }
}
