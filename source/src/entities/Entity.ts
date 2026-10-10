import * as THREE from 'three';
import { AABB, boxTouches, moveBox } from '../player/PlayerPhysics';
import type { World } from '../world/World';
import { IS_LAVA, IS_WATER } from '../world/BlockRegistry';
import { waterFlow } from '../world/Fluids';
import type { Player, Difficulty } from '../player/Player';
import type { ItemStack } from '../inventory/ItemStack';
import type { ItemModels } from '../render/ItemModels';
import type { EffectKind } from '../render/Effects';
import type { Mob } from './Mob';
import type { VillagePlan } from '../world/Villages';

export interface Hurtable {
  hurt(amount: number, host: EntityHost, kx: number, kz: number, byPlayer: boolean): void;
}

export interface EntityQueries {
  itemsNear(x: number, y: number, z: number, r: number): Entity[];
  mobsNear(x: number, y: number, z: number, r: number): Mob[];
  rayHitMob(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { mob: Mob; t: number } | null;
}

/** What entities need from the running game. */
export interface EntityHost {
  entities: EntityQueries;
  world: World;
  player: Player;
  difficulty: Difficulty;
  models: ItemModels;
  tickCount: number;
  daylightFactor(): number;
  isDay(): boolean;
  /** Weather intensities 0..1 (rain includes storms). */
  weatherRain(): number;
  weatherThunder(): number;
  /** Is rain falling on this spot (open sky, raining, not a dry land)? */
  rainingOn(x: number, y: number, z: number): boolean;
  brightnessAt(x: number, y: number, z: number): number;
  damagePlayer(amount: number, source: { x: number; y: number; z: number; kind: string; mob?: Mob }): void;
  giveItem(stack: ItemStack): number;
  addXp(n: number): void;
  sound(name: string, x: number, y: number, z: number, volume?: number, pitch?: number): void;
  effect(kind: EffectKind, x: number, y: number, z: number, count: number): void;
  onArrowHit(): void;
  /** Plunder rune level of the player's held weapon (extra creature drops). */
  plunderLevel(): number;
  onMobKilled(type: string, byPlayer: boolean, mob?: Mob): void;
  spawnItem(stack: ItemStack, x: number, y: number, z: number, throwVel?: [number, number, number]): void;
  spawnXp(value: number, x: number, y: number, z: number): void;
  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromPlayer: boolean, damage: number, shooter?: Mob | null): void;
  /** 2.0: a Smoulderer's thrown ember. */
  spawnEmber(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: Mob): void;
  /** The player hit a creature (companions join in). */
  playerAttacked(mob: Mob): void;
  // ---- villages
  /** Time of day 0..23999 (0 = sunrise). */
  timeOfDay(): number;
  toggleDoor(x: number, y: number, z: number): void;
  villagePlan(id: string): VillagePlan | null;
  /** Is a night raid under way in this village? */
  raidActive(villageId: string | null): boolean;
  /** Is this bed or workstation already somebody's? */
  isClaimed(x: number, y: number, z: number, by: Entity): boolean;
  /** Villager hurt by the player: nearby Sentinels turn on the player. */
  alertSentinels(x: number, z: number): void;
  /** Price discount (-0.3..0.3) from the player's standing in a villager's village. */
  discount(villageId: string | null): number;
  // ---- village life (1.8)
  /** The player's standing in a village (-100..100). */
  villageStanding?(villageId: string | null): number;
  /** Where the village meets at midday (its bell, or its well). */
  meetingPoint?(villageId: string | null): { x: number; y: number; z: number } | null;
  /** The player hurt (or killed) a villager or a Sentinel. */
  folkHurt?(m: Mob, villageId: string | null, killed: boolean): void;
  /** A villager died (for the message saying who it was). */
  villagerDied?(v: Mob, byPlayer: boolean, killer: Mob | null): void;
  /** A harvest (or a gift) for the village food store. */
  addVillageFood?(villageId: string | null, n: number): void;
  /** A villager child has grown up. */
  villagerGrewUp?(v: Mob): void;
  // ---- companions
  /** What the player's companions should fight: whatever the player hit or was hit by lately. */
  ownerFightTarget(): Mob | null;
  /** A tamed companion has died. */
  petDied(pet: Mob): void;
  // ---- 2.1
  /** Spawns a creature (a newborn Ashboar piglet). */
  spawnMob?(type: import('./mobModels').MobType, x: number, y: number, z: number): Mob;
  /** Two animals had a young one. */
  animalBred?(type: string): void;
  // ---- 2.2
  /** A Hollowdrake's star bolt. */
  spawnStarBolt?(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: Mob, damage: number): void;
  /** A blow bounced off the Hollowdrake's shield. */
  drakeShieldHit?(): void;
}

let nextId = 1;

export abstract class Entity {
  readonly id = nextId++;
  abstract readonly type: string;
  x = 0; y = 0; z = 0;
  prevX = 0; prevY = 0; prevZ = 0;
  vx = 0; vy = 0; vz = 0;
  yaw = 0; prevYaw = 0;
  width = 0.6;
  height = 1.8;
  onGround = false;
  collidedH = false;
  inWater = false;
  /** Touching lava (it burns creatures, and destroys items and boats). */
  inLava = false;
  removed = false;
  /** Height this entity can walk up without jumping (slabs, stairs). */
  stepHeight = 0;
  age = 0;
  readonly box = new AABB();
  object: THREE.Object3D = new THREE.Group();

  setPos(x: number, y: number, z: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.z = this.prevZ = z;
    this.syncBox();
  }

  syncBox(): void {
    AABB.fromFeet(this.x, this.y, this.z, this.width, this.height, this.box);
  }

  beginTick(): void {
    this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z;
    this.prevYaw = this.yaw;
    this.age++;
  }

  /** Moves with collision; returns true if something blocked the movement. */
  protected physics(world: World, gravity: number, drag: number, groundFriction: number, airFriction = 0.91): void {
    this.syncBox();
    this.inWater = boxTouches(world, this.box, (b) => IS_WATER[b] === 1);
    this.inLava = boxTouches(world, this.box, (b) => IS_LAVA[b] === 1);
    const ovx = this.vx, ovy = this.vy, ovz = this.vz;
    const [mx, my, mz] = moveBox(world, this.box, ovx, ovy, ovz, this.onGround ? this.stepHeight : 0);
    this.x = (this.box.minX + this.box.maxX) / 2;
    this.y = this.box.minY;
    this.z = (this.box.minZ + this.box.maxZ) / 2;
    this.onGround = ovy < 0 && my !== ovy;
    this.collidedH = mx !== ovx || mz !== ovz;
    if (mx !== ovx) this.vx = 0;
    if (my !== ovy) this.vy = 0;
    if (mz !== ovz) this.vz = 0;
    if (this.inLava) {
      // thick and slow
      this.vx *= 0.5; this.vz *= 0.5; this.vy = this.vy * 0.5 - gravity * 0.25;
    } else if (this.inWater) {
      // currents carry creatures and items along
      const [fx, fz, falling] = waterFlow(world, Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
      this.vx += fx * 0.02; this.vz += fz * 0.02;
      if (falling) this.vy -= 0.03;
      this.vx *= 0.8; this.vz *= 0.8; this.vy = this.vy * 0.8 - gravity * 0.25;
    } else {
      this.vy = (this.vy - gravity) * drag;
      const f = this.onGround ? groundFriction : airFriction;
      this.vx *= f; this.vz *= f;
    }
  }

  abstract tick(host: EntityHost): void;

  /** Called every frame; alpha interpolates between the last two ticks. */
  render(alpha: number, host: EntityHost): void {
    this.object.position.set(
      this.prevX + (this.x - this.prevX) * alpha,
      this.prevY + (this.y - this.prevY) * alpha,
      this.prevZ + (this.z - this.prevZ) * alpha,
    );
    void host;
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.hypot(this.x - x, this.y - y, this.z - z);
  }

  dispose(): void {
    this.object.removeFromParent();
  }

  serialize(): Record<string, unknown> | null {
    return null;
  }
}

/** Brightness curve shared with the chunk shader (0..1). */
export function lightToBrightness(packed: number, daylight: number): number {
  const sky = ((packed >> 4) & 15) / 15 * daylight;
  const blk = (packed & 15) / 15;
  const curve = (l: number) => l / (3 - 2 * l);
  return Math.max(0.06, Math.max(curve(sky), curve(blk) * 0.95));
}
