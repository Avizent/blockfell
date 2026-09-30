import * as THREE from 'three';
import { Entity, EntityHost, EntityQueries, Hurtable } from './Entity';
import { Mob, MOB_SPECS } from './Mob';
import { Arrow, ItemEntity, XpOrb } from './Drops';
import { Villager } from './Villager';
import { Sentinel } from './Sentinel';
import { Hound } from './Hound';
import { Painting } from './Painting';
import { Boat } from './Boat';
import { Bobber } from './Fishing';
import { motifById } from '../render/paintingArt';
import type { Facing } from '../world/BlockRegistry';
import type { MobType } from './mobModels';
import type { ItemStack } from '../inventory/ItemStack';
import { rayBox } from '../interaction/VoxelRaycaster';
import { GRASS, IS_FLUID, IS_SOLID, AIR, SNOWY_GRASS, SAND, RED_SAND, STONE, SNOW, SPAWN_FLOOR } from '../world/BlockRegistry';
import { BIOME_BADLANDS, BIOME_DESERT, BIOME_MOUNTAINS, BIOME_SNOWY, BIOME_TAIGA, BIOME_FOREST, BIOME_BIRCH } from '../world/BiomeSystem';
import { UNLOADED } from '../world/World';
import { WORLD_HEIGHT } from '../world/constants';

const PASSIVE: MobType[] = ['pig', 'cow', 'sheep', 'chicken'];

function pick<T>(table: [T, number][]): T {
  let r = Math.random() * table.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of table) { r -= w; if (r <= 0) return v; }
  return table[table.length - 1][0];
}

/** Which animal a biome favours (desert rabbits, mountain goats...). */
function passiveFor(biome: number, ground: number): MobType | null {
  if (biome === BIOME_DESERT || biome === BIOME_BADLANDS) return ground === SAND || ground === RED_SAND ? 'rabbit' : null;
  if (biome === BIOME_SNOWY) return pick<MobType>([['goat', 50], ['rabbit', 15], ['sheep', 15], ['hound', 20]]);
  if (biome === BIOME_MOUNTAINS) return pick<MobType>([['goat', 65], ['rabbit', 15], ['sheep', 20]]);
  if (ground === STONE || ground === SNOW) return null;
  if (biome === BIOME_TAIGA) return pick<MobType>([['rabbit', 27], ['sheep', 22], ['pig', 13], ['cow', 13], ['goat', 10], ['hound', 15]]);
  if (biome === BIOME_FOREST && Math.random() < 0.08) return 'hound';
  if (biome === BIOME_BIRCH && Math.random() < 0.05) return 'hound';
  return Math.random() < 0.1 ? 'rabbit' : PASSIVE[Math.floor(Math.random() * PASSIVE.length)];
}

/**
 * Owns every non-player entity: ticking within the simulation distance,
 * interpolated rendering, spawning/despawning rules and entity queries
 * (melee/arrow ray hits, item merging).
 */
export class EntityManager implements EntityQueries {
  readonly group = new THREE.Group();
  readonly list: Entity[] = [];
  simulationDistance = 96; // blocks
  mobSpawning = true;
  private spawnTimer = 0;

  constructor() {
    this.group.name = 'entities';
  }

  add<T extends Entity>(e: T): T {
    this.list.push(e);
    this.group.add(e.object);
    return e;
  }

  get mobCount(): number {
    let n = 0;
    for (const e of this.list) if (e instanceof Mob) n++;
    return n;
  }

  spawnMob(type: MobType, x: number, y: number, z: number, host: EntityHost): Mob {
    const m = type === 'villager' ? new Villager(host) : type === 'sentinel' ? new Sentinel(host) : type === 'hound' ? new Hound(host) : new Mob(type, host);
    m.setPos(x, y, z);
    return this.add(m);
  }

  spawnItem(stack: ItemStack, x: number, y: number, z: number, vel?: [number, number, number], delay = 10): ItemEntity {
    const e = new ItemEntity(stack, delay);
    e.setPos(x, y, z);
    if (vel) { e.vx = vel[0]; e.vy = vel[1]; e.vz = vel[2]; }
    else { e.vx = (Math.random() - 0.5) * 0.2; e.vy = 0.2; e.vz = (Math.random() - 0.5) * 0.2; }
    return this.add(e);
  }

  spawnXp(value: number, x: number, y: number, z: number): void {
    // split into a few orbs like the reference game
    while (value > 0) {
      const v = value >= 7 ? 7 : value >= 3 ? 3 : 1;
      value -= v;
      const o = new XpOrb(v);
      o.setPos(x, y, z);
      o.vx = (Math.random() - 0.5) * 0.2; o.vy = 0.2 + Math.random() * 0.1; o.vz = (Math.random() - 0.5) * 0.2;
      this.add(o);
    }
  }

  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromPlayer: boolean, damage: number, shooter: Mob | null = null): void {
    const a = new Arrow(fromPlayer, damage);
    a.shooter = shooter;
    a.setPos(x, y, z);
    a.vx = vx; a.vy = vy; a.vz = vz;
    this.add(a);
  }

  itemsNear(x: number, y: number, z: number, r: number): Entity[] {
    const out: Entity[] = [];
    for (const e of this.list) {
      if (e instanceof ItemEntity && Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r && Math.abs(e.z - z) <= r) out.push(e);
    }
    return out;
  }

  mobsNear(x: number, y: number, z: number, r: number): Mob[] {
    const out: Mob[] = [];
    for (const e of this.list) {
      if (e instanceof Mob && !e.removed && Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r && Math.abs(e.z - z) <= r) out.push(e);
    }
    return out;
  }

  boats(): Boat[] {
    const out: Boat[] = [];
    for (const e of this.list) if (e instanceof Boat && !e.removed) out.push(e);
    return out;
  }

  /** Nearest boat hit by a ray (`skip`: the boat the player sits in). */
  rayHitBoat(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, skip: Boat | null): { boat: Boat; t: number } | null {
    let best: { boat: Boat; t: number } | null = null;
    for (const e of this.list) {
      if (!(e instanceof Boat) || e.removed || e === skip) continue;
      if (Math.abs(e.x - ox) > max + 3 || Math.abs(e.z - oz) > max + 3 || Math.abs(e.y - oy) > max + 3) continue;
      const t = e.rayHit(ox, oy, oz, dx, dy, dz);
      if (t !== null && t <= max && (!best || t < best.t)) best = { boat: e, t };
    }
    return best;
  }

  spawnBoat(x: number, y: number, z: number, yaw: number): Boat {
    const b = new Boat();
    b.setPos(x, y, z);
    b.yaw = b.prevYaw = yaw;
    return this.add(b);
  }

  spawnBobber(x: number, y: number, z: number, vx: number, vy: number, vz: number): Bobber {
    const b = new Bobber();
    b.setPos(x, y, z);
    b.vx = vx; b.vy = vy; b.vz = vz;
    return this.add(b);
  }

  paintings(): Painting[] {
    const out: Painting[] = [];
    for (const e of this.list) if (e instanceof Painting && !e.removed) out.push(e);
    return out;
  }

  /** Nearest painting hit by a ray. */
  rayHitPainting(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { painting: Painting; t: number } | null {
    let best: { painting: Painting; t: number } | null = null;
    for (const e of this.list) {
      if (!(e instanceof Painting) || e.removed) continue;
      if (Math.abs(e.x - ox) > max + 4 || Math.abs(e.z - oz) > max + 4 || Math.abs(e.y - oy) > max + 4) continue;
      const t = e.rayHit(ox, oy, oz, dx, dy, dz);
      if (t !== null && t <= max && (!best || t < best.t)) best = { painting: e, t };
    }
    return best;
  }

  /** Nearest living mob hit by a ray (used for melee targeting and arrows). */
  rayHitMob(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { mob: Mob & Hurtable; t: number } | null {
    let best: { mob: Mob; t: number } | null = null;
    for (const e of this.list) {
      if (!(e instanceof Mob) || !e.alive) continue;
      if (Math.abs(e.x - ox) > max + 3 || Math.abs(e.z - oz) > max + 3) continue;
      const b = e.box;
      const r = rayBox(ox, oy, oz, dx, dy, dz, b.minX - 0.05, b.minY, b.minZ - 0.05, b.maxX + 0.05, b.maxY + 0.05, b.maxZ + 0.05);
      if (r && r.t <= max && (!best || r.t < best.t)) best = { mob: e, t: r.t };
    }
    return best;
  }

  tick(host: EntityHost): void {
    const p = host.player;
    const sd2 = this.simulationDistance * this.simulationDistance;
    for (const e of this.list) {
      if (e.removed) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d2 = dx * dx + dz * dz;
      // freeze entities outside the simulation distance or in unloaded chunks
      if (d2 > sd2 || !host.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) {
        e.prevX = e.x; e.prevY = e.y; e.prevZ = e.z;
        continue;
      }
      e.tick(host);
      if (e instanceof Mob && e.spec.hostile) {
        if (host.difficulty === 'peaceful') e.removed = true;
        else if (!e.persistent && d2 > 128 * 128) e.removed = true;
        else if (!e.persistent && d2 > 48 * 48 && Math.random() < 1 / 800) e.removed = true;
      }
      if (e.y < -32) e.removed = true;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].removed) {
        this.list[i].dispose();
        this.list.splice(i, 1);
      }
    }
    if (++this.spawnTimer >= 20) {
      this.spawnTimer = 0;
      if (this.mobSpawning) this.trySpawn(host);
    }
  }

  private trySpawn(host: EntityHost): void {
    const p = host.player;
    let passive = 0, hostile = 0;
    for (const e of this.list) {
      if (!(e instanceof Mob)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 80) continue;
      if (e.spec.hostile) hostile++; else passive++;
    }
    // passive animals: gentle cap around the player, on grass in the light
    if (passive < 12 && Math.random() < 0.35) {
      const spot = this.findSpawnSpot(host, 20, 56, false);
      const type = spot ? passiveFor(host.world.generator.column(Math.floor(spot.x), Math.floor(spot.z)).biome, spot.ground) : null;
      if (spot && type) {
        const herd = type === 'chicken' || type === 'rabbit' || type === 'goat' ? 1 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < herd; i++) {
          const ox = spot.x + (Math.random() - 0.5) * 3, oz = spot.z + (Math.random() - 0.5) * 3;
          const y = this.groundAt(host, Math.floor(ox), Math.floor(oz), spot.y + 3);
          if (y !== null && Math.abs(y - spot.y) <= 2) this.spawnMob(type, ox, y, oz, host);
        }
      }
    }
    // hostile creatures: only in darkness, never in peaceful
    const cap = host.difficulty === 'peaceful' ? 0 : host.difficulty === 'easy' ? 5 : host.difficulty === 'normal' ? 8 : 12;
    if (hostile < cap) {
      for (let tries = 0; tries < 3; tries++) {
        const spot = this.findSpawnSpot(host, 24, 44, true);
        if (!spot) continue;
        const biome = host.world.generator.column(Math.floor(spot.x), Math.floor(spot.z)).biome;
        const dry = biome === BIOME_DESERT || biome === BIOME_BADLANDS;
        const r = Math.random();
        const type: MobType = r < 0.2 ? 'crawler' : r < 0.62 ? (dry && Math.random() < 0.8 ? 'dustwalker' : 'shambler') : 'skeleton';
        this.spawnMob(type, spot.x, spot.y, spot.z, host);
        break;
      }
    }
  }

  private groundAt(host: EntityHost, x: number, z: number, fromY: number): number | null {
    for (let y = Math.min(WORLD_HEIGHT - 2, fromY); y > 1; y--) {
      const b = host.world.getBlock(x, y, z);
      if (b === UNLOADED) return null;
      if (IS_SOLID[b]) {
        if (!SPAWN_FLOOR[b]) return null;
        const a1 = host.world.getBlock(x, y + 1, z), a2 = host.world.getBlock(x, y + 2, z);
        if (!IS_SOLID[a1] && !IS_SOLID[a2] && !IS_FLUID[a1] && !IS_FLUID[a2]) return y + 1;
        return null;
      }
    }
    return null;
  }

  private findSpawnSpot(host: EntityHost, minR: number, maxR: number, dark: boolean): { x: number; y: number; z: number; ground: number } | null {
    const p = host.player;
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!host.world.isLoaded(x, z)) return null;
    if (dark) {
      // pick a random height column cell (caves too) with air above solid ground
      const top = host.world.highestSolid(x, z);
      if (top < 0) return null;
      const y0 = Math.random() < 0.5 ? top : 5 + Math.floor(Math.random() * Math.max(1, top - 5));
      for (let y = y0; y > 2; y--) {
        const b = host.world.getBlock(x, y, z);
        if (!SPAWN_FLOOR[b] || b === UNLOADED) continue;
        if (host.world.getBlock(x, y + 1, z) !== AIR || host.world.getBlock(x, y + 2, z) !== AIR) continue;
        const light = host.world.getLight(x, y + 1, z);
        // thunderstorms are dark enough for creatures to appear in the open by day
        const sky = ((light >> 4) & 15) * host.daylightFactor() * (1 - 0.4 * host.weatherThunder());
        const blk = light & 15;
        if (Math.max(sky, blk) >= 7) return null;
        if (Math.abs(y + 1 - p.y) < 3 && Math.hypot(x - p.x, z - p.z) < 24) return null;
        return { x: x + 0.5, y: y + 1, z: z + 0.5, ground: b };
      }
      return null;
    }
    const y = host.world.highestSolid(x, z);
    if (y < 0) return null;
    const ground = host.world.getBlock(x, y, z);
    if (ground !== GRASS && ground !== SNOWY_GRASS && ground !== SAND && ground !== RED_SAND && ground !== STONE && ground !== SNOW) return null;
    if ((ground === SAND || ground === RED_SAND) && Math.random() < 0.5) return null;
    const light = host.world.getLight(x, y + 1, z);
    if ((light >> 4) < 9) return null;
    return { x: x + 0.5, y: y + 1, z: z + 0.5, ground };
  }

  render(alpha: number, host: EntityHost): void {
    const p = host.player;
    for (const e of this.list) {
      const far = Math.abs(e.x - p.x) > this.simulationDistance + 32 || Math.abs(e.z - p.z) > this.simulationDistance + 32;
      e.object.visible = !far;
      if (!far) e.render(alpha, host);
    }
  }

  serialize(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const e of this.list) {
      const s = e.serialize();
      if (s) out.push(s);
    }
    return out;
  }

  load(data: Record<string, unknown>[] | undefined, host: EntityHost): void {
    if (!data) return;
    for (const d of data) {
      if (d.t === 'mob' && typeof d.m === 'string' && d.m in MOB_SPECS) {
        const m = this.spawnMob(d.m as MobType, d.x as number, d.y as number, d.z as number, host);
        m.persistent = d.p === true;
        m.yaw = (d.yaw as number) ?? 0;
        m.health = (d.h as number) ?? m.health;
        if (m instanceof Villager && d.v && typeof d.v === 'object') m.restore(d.v as Record<string, unknown>);
        if (m instanceof Sentinel && d.s && typeof d.s === 'object') m.restore(d.s as Record<string, unknown>);
        if (m instanceof Hound && d.d && typeof d.d === 'object') m.restore(d.d as Record<string, unknown>);
      } else if (d.t === 'painting' && typeof d.m === 'string') {
        const m = motifById(d.m);
        if (m && ['n', 'e', 's', 'w'].includes(d.f as string)) this.add(new Painting(m, d.f as Facing, d.x as number, d.y as number, d.z as number));
      } else if (d.t === 'boat') {
        this.spawnBoat(d.x as number, d.y as number, d.z as number, (d.yaw as number) ?? 0);
      } else if (d.t === 'item' && d.stack) {
        const e = this.spawnItem(d.stack as ItemStack, d.x as number, d.y as number, d.z as number, [0, 0, 0], 0);
        e.age = (d.age as number) ?? 0;
      }
    }
  }

  clear(): void {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
  }
}
