import * as THREE from 'three';
import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { foxModel, type FoxCoat } from './mobModels';
import { findPath, canStand, Step } from './Pathfinder';
import { IS_WATER, SNOW, SNOWY_GRASS } from '../world/BlockRegistry';

/** What a wild Fox Cub can be won over with (one try in three)... */
export const FOX_TAMING_FOOD = ['raw_trout', 'raw_perch', 'raw_chicken', 'raw_rabbit'];
/** ...and what heals a tamed one (hearts x2). */
export const FOX_FOOD: Record<string, number> = {
  raw_trout: 3, raw_perch: 3, raw_chicken: 3, raw_rabbit: 3,
  cooked_trout: 6, cooked_perch: 6, cooked_chicken: 6, cooked_rabbit: 6,
};
/** Little presents a tamed Fox Cub finds and brings now and then. */
const GIFTS: [string, number][] = [
  ['feather', 5], ['stick', 4], ['flower_red', 3], ['flower_yellow', 3], ['flower_blue', 2], ['wheat_seeds', 4],
  ['apple', 3], ['bone', 3], ['string', 2], ['carrot', 2], ['snowball', 3], ['amber', 1],
];
const TAMED_HEALTH = 16;
const CATCH_UP_OFFSETS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];

export type FoxFeed = 'tamed' | 'failed' | 'healed' | 'full' | 'no';

/**
 * FOX CUB (2.3) - the name is in world/names.ts
 * -------------------------------------------
 * A small original fox. Red-coated ones live in the taiga, snowy-white ones in the
 * snowy lands. Wild cubs are shy: they run from you unless you creep up (sneak).
 * Feed one fish (or raw chicken or rabbit) and it may become your pet (one try in
 * three). A tamed Fox Cub:
 *  - wears a red collar, follows you (finding its way around things) and catches
 *    up when it falls far behind;
 *  - sits and stays when you right-click it (right-click again to call it);
 *  - pounces about in the snow, and now and then brings you a little present;
 *  - is healed by fish, chicken or rabbit; can't be hurt by you; never wanders off.
 * It is a cub, not a fighter: it keeps out of fights.
 */
export class Fox extends Mob {
  coat: FoxCoat = 'red';
  tamed = false;
  sitting = false;
  /** Ticks until a tamed cub next brings a present. */
  giftTimer = 6000 + Math.floor(Math.random() * 3000);
  private pounce = 0;
  private path: Step[] | null = null;
  private pathIdx = 0;
  private repath = 0;
  private idleTimer = 0;
  private idleX = 0;
  private idleZ = 0;
  private yip = 200 + Math.floor(Math.random() * 400);
  private base = new Map<string, THREE.Vector3>();

  constructor(host?: EntityHost) {
    super('fox', host);
    this.knockbackTaken = 0.7;
  }

  get maxHealth(): number { return this.tamed ? TAMED_HEALTH : this.spec.health; }

  setCoat(coat: FoxCoat): void {
    if (coat === this.coat) return;
    this.coat = coat;
    this.setModel(foxModel(coat, this.tamed));
    this.base.clear();
  }

  /** Becomes the player's pet. */
  tame(): void {
    this.tamed = true;
    this.petOfPlayer = true;
    this.persistent = true;
    this.panic = 0;
    this.health = TAMED_HEALTH;
    this.sitting = false;
    this.setModel(foxModel(this.coat, true));
    this.base.clear();
  }

  /** Right-click with food in hand. */
  feed(host: EntityHost, item: string): FoxFeed {
    const value = FOX_FOOD[item];
    if (value === undefined || !this.alive) return 'no';
    if (!this.tamed) {
      if (!FOX_TAMING_FOOD.includes(item)) return 'no';
      this.panic = 0;
      host.sound('eat', this.x, this.y + 0.4, this.z, 0.5, 1.4);
      if (Math.random() < 1 / 3) {
        this.tame();
        host.effect('heart', this.x, this.y + 0.8, this.z, 7);
        host.sound('fox', this.x, this.y + 0.5, this.z, 0.8, 1.25);
        return 'tamed';
      }
      host.effect('smoke', this.x, this.y + 0.7, this.z, 4);
      return 'failed';
    }
    if (this.health >= this.maxHealth) return 'full';
    this.health = Math.min(this.maxHealth, this.health + value);
    host.effect('heart', this.x, this.y + 0.8, this.z, 3);
    host.sound('eat', this.x, this.y + 0.4, this.z, 0.5, 1.4);
    return 'healed';
  }

  /** Right-click without food: sit and stay / get up and follow. */
  toggleSit(host: EntityHost): void {
    this.sitting = !this.sitting;
    this.path = null;
    this.vx = this.vz = 0;
    host.sound('fox', this.x, this.y + 0.5, this.z, 0.5, this.sitting ? 0.95 : 1.25);
  }

  /** A wild cub on the run heads away from the player. */
  protected pickWanderTarget(host: EntityHost): void {
    const p = host.player;
    if (!this.tamed && this.panic > 0 && !p.dead && this.distanceTo(p.x, p.y, p.z) < 10) {
      const a = Math.atan2(this.x - p.x, this.z - p.z) + (Math.random() - 0.5) * 0.8;
      const tx = this.x + Math.sin(a) * 8, tz = this.z + Math.cos(a) * 8;
      if (host.world.isLoaded(Math.floor(tx), Math.floor(tz))) {
        this.targetX = tx; this.targetZ = tz; this.hasTarget = true; this.stuckTicks = 0;
        return;
      }
    }
    super.pickWanderTarget(host);
  }

  protected onHurt(): void {
    if (this.tamed) { this.sitting = false; this.panic = 40; }
  }

  // ------------------------------------------------------------------ moving
  private moveTo(host: EntityHost, tx: number, tz: number, speedMul: number, stopAt = 0.4): number {
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > stopAt) {
      this.turnTowards(Math.atan2(-dx, -dz), 0.4);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (this.collidedH && this.onGround) {
        const ax = this.x + fx * (this.width / 2 + 0.3), az = this.z + fz * (this.width / 2 + 0.3);
        if (this.solidAt(host, ax, this.y + 0.5, az) && !this.solidAt(host, ax, this.y + 1.5, az)) this.vy = 0.42;
      }
      const accel = (this.onGround ? this.spec.speed * 0.22 : this.spec.speed * 0.05) * speedMul;
      this.vx += fx * accel;
      this.vz += fz * accel;
    }
    return dist;
  }

  private pathTo(host: EntityHost, tx: number, ty: number, tz: number, speedMul: number): void {
    if (--this.repath <= 0 || !this.path) {
      this.repath = 20;
      const path = findPath(host.world, Math.floor(this.x), Math.floor(this.y + 0.01), Math.floor(this.z),
        Math.floor(tx), Math.floor(ty), Math.floor(tz), { partial: true, maxNodes: 900, range: 40, closedDoors: true });
      this.path = path && path.length ? path : null;
      this.pathIdx = 0;
    }
    const path = this.path;
    if (path) {
      while (this.pathIdx < path.length) {
        const s = path[this.pathIdx];
        if (Math.hypot(s.x + 0.5 - this.x, s.z + 0.5 - this.z) < 0.5 && Math.abs(s.y - this.y) < 1.2) this.pathIdx++;
        else break;
      }
      if (this.pathIdx < path.length) {
        const s = path[this.pathIdx];
        this.moveTo(host, s.x + 0.5, s.z + 0.5, speedMul, 0);
        return;
      }
      this.path = null;
    }
    this.moveTo(host, tx, tz, speedMul);
  }

  /** Too far behind: bound to a free spot next to the owner. */
  private catchUp(host: EntityHost): void {
    const p = host.player;
    const px = Math.floor(p.x), py = Math.floor(p.y + 0.01), pz = Math.floor(p.z);
    let s: Step | null = null;
    for (const [dx, dz] of CATCH_UP_OFFSETS) {
      for (const dy of [0, 1, -1, 2, -2]) {
        if (canStand(host.world, px + dx, py + dy, pz + dz)) { s = { x: px + dx, y: py + dy, z: pz + dz }; break; }
      }
      if (s) break;
    }
    if (!s) { this.pathTo(host, p.x, p.y, p.z, 1.5); return; }
    host.effect('poof', this.x, this.y + 0.3, this.z, 4);
    this.setPos(s.x + 0.5, s.y, s.z + 0.5);
    this.vx = this.vy = this.vz = 0;
    this.path = null;
  }

  private onSnow(host: EntityHost): boolean {
    const b = host.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.01), Math.floor(this.z));
    return b === SNOW || b === SNOWY_GRASS;
  }

  /** A playful leap (into the snow, mostly). */
  private leap(host: EntityHost): void {
    this.pounce = 14;
    this.vy = 0.5;
    this.vx += -Math.sin(this.yaw) * 0.18;
    this.vz += -Math.cos(this.yaw) * 0.18;
    host.sound('fox', this.x, this.y + 0.5, this.z, 0.35, 1.5);
  }

  // ------------------------------------------------------------------ tick
  tick(host: EntityHost): void {
    if (this.deathTime > 0) { super.tick(host); return; }
    const p = host.player;
    const wasAir = !this.onGround;
    if (!this.tamed) {
      // shy: runs from a player who isn't creeping (and from one who hit it)
      if (this.age % 10 === 0 && !p.dead && !p.creative && !p.sneaking && this.distanceTo(p.x, p.y, p.z) < 6 && this.panic < 10) {
        this.panic = 40;
        this.pickWanderTarget(host);
      }
      if (this.pounce === 0 && this.onGround && this.panic === 0 && this.onSnow(host) && Math.random() < 1 / 500) this.leap(host);
      super.tick(host);
    } else {
      if (!this.tickCommon(host)) return;
      const dOwner = this.distanceTo(p.x, p.y, p.z);
      if (this.sitting) {
        this.vx *= 0.5; this.vz *= 0.5;
        if (--this.lookTimer <= 0) {
          this.lookTimer = 30 + Math.floor(Math.random() * 40);
          const want = Math.atan2(-(p.x - this.x), -(p.z - this.z)) - this.yaw;
          this.headYaw = Math.max(-0.9, Math.min(0.9, wrapAngle(want)));
        }
      } else if (this.panic > 0) {
        // hurt: dash to the owner's side
        this.panic--;
        if (!p.dead) this.pathTo(host, p.x, p.y, p.z, 1.6);
      } else {
        if (!p.dead && dOwner > 14 && !p.flying) this.catchUp(host);
        else if (!p.dead && dOwner > 3) { this.pathTo(host, p.x, p.y, p.z, dOwner > 8 ? 1.5 : 1.15); this.idleTimer = 0; }
        else this.idle(host);
        this.headYaw *= 0.8;
        if (this.pounce === 0 && this.onGround && dOwner < 6 && Math.random() < (this.onSnow(host) ? 1 / 220 : 1 / 900)) this.leap(host);
        // now and then: a little present
        if (!p.dead && dOwner < 6 && --this.giftTimer <= 0) {
          this.giftTimer = 6000 + Math.floor(Math.random() * 3000);
          this.bringGift(host);
        }
      }
      if (this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.6), Math.floor(this.z))] === 1) this.vy += 0.045;
      this.physics(host.world, 0.08, 0.98, 0.546);
      this.animateLimbs();
    }
    if (this.pounce > 0) this.pounce--;
    // landing in snow: a puff of powder
    if (wasAir && this.onGround && this.pounce > 0 && this.onSnow(host)) host.effect('snow', this.x, this.y + 0.1, this.z, 6);
    if (--this.yip <= 0) {
      this.yip = 400 + Math.floor(Math.random() * 700);
      if (this.distanceTo(p.x, p.y, p.z) < 16) host.sound('fox', this.x, this.y + 0.5, this.z, 0.4, 1 + Math.random() * 0.3);
    }
  }

  private idle(host: EntityHost): void {
    const p = host.player;
    if (--this.idleTimer <= 0) {
      this.idleTimer = 60 + Math.floor(Math.random() * 120);
      const a = Math.random() * Math.PI * 2;
      this.idleX = p.x + Math.cos(a) * 2;
      this.idleZ = p.z + Math.sin(a) * 2;
    }
    if (this.idleTimer > 40) this.moveTo(host, this.idleX, this.idleZ, 0.6, 0.5);
    else this.turnTowards(Math.atan2(-(p.x - this.x), -(p.z - this.z)), 0.15);
  }

  private bringGift(host: EntityHost): void {
    let r = Math.random() * GIFTS.reduce((a, [, w]) => a + w, 0);
    let id = GIFTS[0][0];
    for (const [g, w] of GIFTS) { r -= w; if (r <= 0) { id = g; break; } }
    host.spawnItem({ id, count: 1 }, this.x, this.y + 0.4, this.z, [0, 0.15, 0]);
    host.effect('heart', this.x, this.y + 0.8, this.z, 4);
    host.sound('fox', this.x, this.y + 0.5, this.z, 0.6, 1.35);
    host.foxGift?.(this, id);
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    super.die(host, byPlayer);
    if (this.tamed) host.petDied(this);
  }

  // ------------------------------------------------------------------ looks
  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const P = this.parts;
    const root = this.object.children[0];
    const remember = (n: string) => {
      const o = P.get(n);
      if (o && !this.base.has(n)) this.base.set(n, o.position.clone());
      return o;
    };
    const body = remember('body'), head = remember('head'), tail = remember('tail');
    const legBL = remember('legBL'), legBR = remember('legBR'), legFL = remember('legFL'), legFR = remember('legFR');
    const sit = this.sitting && this.deathTime === 0;
    if (root && this.deathTime === 0) root.position.y = sit ? -0.12 : 0;
    if (body) body.rotation.x = sit ? 0.5 : this.pounce > 0 ? (this.vy > 0 ? 0.35 : -0.35) : 0;
    if (head) {
      const b = this.base.get('head')!;
      head.position.y = b.y + (sit ? 0.12 : 0);
      head.position.z = b.z - (sit ? 0.05 : 0);
    }
    for (const [l, n] of [[legBL, 'legBL'], [legBR, 'legBR']] as const) {
      if (!l) continue;
      const b = this.base.get(n)!;
      l.position.y = b.y - (sit ? 0.08 : 0);
      if (sit) l.rotation.x = -1.4;
    }
    for (const [l, n] of [[legFL, 'legFL'], [legFR, 'legFR']] as const) {
      if (!l) continue;
      const b = this.base.get(n)!;
      l.position.y = b.y + (sit ? 0.1 : 0);
      l.scale.y = sit ? 0.93 : 1;
      if (sit) l.rotation.x = -0.1;
      else if (this.pounce > 0) l.rotation.x = 0.9;
    }
    if (tail) {
      const tb = this.base.get('tail')!;
      // sitting: the brush lies flat on the ground, curled round to one side
      tail.position.y = tb.y - (sit ? 0.05 : 0);
      tail.rotation.x = sit ? 0.05 : -0.35;
      tail.rotation.y = sit ? 0.7 : this.tamed ? Math.sin((this.age + alpha) * 0.45) * 0.4 : 0;
    }
  }

  // ------------------------------------------------------------------ saving
  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, p: this.persistent, d: { tamed: this.tamed, sitting: this.sitting, coat: this.coat, gift: this.giftTimer } };
  }

  restore(d: Record<string, unknown>): void {
    if (d.coat === 'snow' || d.coat === 'red') this.setCoat(d.coat);
    if (d.tamed === true) {
      const h = this.health;
      this.tame();
      this.health = Math.max(1, Math.min(TAMED_HEALTH, h));
    }
    this.sitting = d.sitting === true && this.tamed;
    if (typeof d.gift === 'number' && d.gift > 0) this.giftTimer = Math.min(9000, d.gift);
  }
}
