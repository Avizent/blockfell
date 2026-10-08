import * as B from '../world/BlockRegistry';
import { posKey, type SpawnerEntity, type World } from '../world/World';
import type { Chunk } from '../world/Chunk';
import type { EntityHost } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Mob, MOB_SPECS } from '../entities/Mob';
import type { MobType } from '../entities/mobModels';
import { hash4 } from '../core/rng';

/**
 * MONSTER CAGES (spawners)
 * ------------------------
 * The cage at the heart of a dungeon keeps making the creature it holds while the
 * player is within 16 blocks: every 10 to 40 seconds it tries up to four times to
 * place one within 4 blocks of itself (one block up or down), on solid ground, in
 * the dark (light 9 or less - so torches around a cage switch it off), and only
 * while fewer than six of its creatures are already close by. It works whether or
 * not creatures spawn naturally, but never on Peaceful. (2.0: cages of the
 * Cinderdeep's fire creatures, in Ember Shrines, work in any light.)
 *
 * Cages are found by scanning each chunk as it loads (and tracking block changes),
 * so the system only ever looks at the handful of cages near the player.
 */
export const SPAWNER_MOBS: MobType[] = ['shambler', 'skeleton', 'crawler'];
export const SPAWNER_RANGE = 16;
export const SPAWN_RADIUS = 4;
export const MAX_NEARBY = 6;
export const MAX_SPAWN_LIGHT = 9;
const MIN_DELAY = 200;
const MAX_DELAY = 800;

/** The creature a cage holds unless something else was set (same for every copy of a world). */
export function defaultSpawnerMob(seed: number, x: number, y: number, z: number): MobType {
  const h = (hash4(seed, x, y, z) >>> 3) % 4;
  return h < 2 ? 'shambler' : h === 2 ? 'skeleton' : 'crawler';
}

export class SpawnerSystem {
  /** Cages in loaded chunks, by position key. */
  readonly known = new Map<string, { x: number; y: number; z: number }>();
  /** Creatures made so far (statistics / tests). */
  spawned = 0;

  constructor(private world: World, private entities: EntityManager, private host: EntityHost) {}

  scanChunk(c: Chunk): void {
    const b = c.blocks;
    let i = b.indexOf(B.SPAWNER);
    while (i >= 0) {
      const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8;
      this.known.set(posKey(x, y, z), { x, y, z });
      i = b.indexOf(B.SPAWNER, i + 1);
    }
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number, cause: string): void {
    const k = posKey(x, y, z);
    if (id === B.SPAWNER) {
      this.known.set(k, { x, y, z });
      // a cage placed by hand starts with a Shambler (a spawn egg changes it)
      if (cause === 'player' && !this.world.blockEntities.has(k)) this.world.blockEntities.set(k, { type: 'spawner', mob: 'shambler', delay: 40 });
    } else if (old === B.SPAWNER) {
      this.known.delete(k);
      this.world.blockEntities.delete(k);
    }
  }

  /** The cage's data (created on first use). */
  entity(x: number, y: number, z: number): SpawnerEntity {
    const k = posKey(x, y, z);
    let be = this.world.blockEntities.get(k);
    if (!be || be.type !== 'spawner') {
      be = { type: 'spawner', mob: defaultSpawnerMob(this.world.seed, x, y, z), delay: 20 + Math.floor(Math.random() * 60) };
      this.world.blockEntities.set(k, be);
    }
    return be;
  }

  /** Is the player close enough for this cage to be working? */
  active(x: number, y: number, z: number): boolean {
    const p = this.host.player;
    return Math.hypot(p.x - (x + 0.5), p.y + 1 - (y + 0.5), p.z - (z + 0.5)) <= SPAWNER_RANGE;
  }

  tick(): void {
    const host = this.host;
    for (const [k, s] of this.known) {
      if (!this.world.isLoaded(s.x, s.z) || this.world.getBlock(s.x, s.y, s.z) !== B.SPAWNER) { this.known.delete(k); continue; }
      if (!this.active(s.x, s.y, s.z)) continue;
      const be = this.entity(s.x, s.y, s.z);
      if (host.tickCount % 4 === 0) {
        host.effect('flame', s.x + 0.2 + Math.random() * 0.6, s.y + 0.2 + Math.random() * 0.6, s.z + 0.2 + Math.random() * 0.6, 1);
        if (Math.random() < 0.3) host.effect('smoke', s.x + 0.5, s.y + 0.8, s.z + 0.5, 1);
      }
      if (host.difficulty === 'peaceful') continue;
      if (--be.delay > 0) continue;
      be.delay = MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));
      this.trySpawn(s.x, s.y, s.z, be.mob as MobType);
    }
  }

  /** One round of spawning around a cage. Returns how many creatures appeared. */
  trySpawn(x: number, y: number, z: number, mob: MobType): number {
    const host = this.host;
    let near = 0;
    for (const e of this.entities.list) {
      if (!(e instanceof Mob) || e.mobType !== mob || !e.alive || e.removed) continue;
      if (Math.abs(e.x - x - 0.5) <= 8 && Math.abs(e.y - y) <= 4 && Math.abs(e.z - z - 0.5) <= 8) near++;
    }
    if (near >= MAX_NEARBY) return 0;
    let made = 0;
    for (let attempt = 0; attempt < 4 && near + made < MAX_NEARBY; attempt++) {
      const sx = x + Math.round((Math.random() - Math.random()) * SPAWN_RADIUS);
      const sz = z + Math.round((Math.random() - Math.random()) * SPAWN_RADIUS);
      const sy = y + Math.floor(Math.random() * 3) - 1;
      if (!this.canSpawnAt(sx, sy, sz, MOB_SPECS[mob]?.fireproof ? 15 : MAX_SPAWN_LIGHT)) continue;
      const m = this.entities.spawnMob(mob, sx + 0.5, sy, sz + 0.5, host);
      m.yaw = Math.random() * Math.PI * 2;
      host.effect('poof', sx + 0.5, sy + 0.8, sz + 0.5, 8);
      host.effect('flame', sx + 0.5, sy + 0.5, sz + 0.5, 4);
      made++;
    }
    if (made) {
      this.spawned += made;
      host.sound('fizz', x + 0.5, y + 0.5, z + 0.5, 0.35, 0.7);
    }
    return made;
  }

  /** Room for a creature (two open cells over solid ground) in the dark. */
  canSpawnAt(x: number, y: number, z: number, maxLight = MAX_SPAWN_LIGHT): boolean {
    const w = this.world;
    const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z), g = w.getBlock(x, y - 1, z);
    if (B.IS_SOLID[a] || B.IS_SOLID[b] || B.IS_FLUID[a] || B.IS_FLUID[b] || !B.SPAWN_FLOOR[g]) return false;
    const light = w.getLight(x, y, z);
    const sky = ((light >> 4) & 15) * this.host.daylightFactor();
    return Math.max(sky, light & 15) <= maxLight;
  }
}
