import * as THREE from 'three';
import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { houndModel } from './mobModels';
import { findPath, canStand, Step } from './Pathfinder';

const CATCH_UP_OFFSETS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]];
import { IS_WATER } from '../world/BlockRegistry';

/** Meat a Fellhound will take from your hand. Raw meat tames; any meat heals. */
export const HOUND_TAMING_FOOD = ['raw_porkchop', 'raw_beef', 'raw_mutton', 'raw_chicken', 'raw_rabbit'];
export const HOUND_FOOD: Record<string, number> = {
  raw_porkchop: 3, raw_beef: 3, raw_mutton: 2, raw_chicken: 2, raw_rabbit: 3,
  cooked_porkchop: 8, steak: 8, cooked_mutton: 6, cooked_chicken: 6, cooked_rabbit: 5, spoiled_flesh: 4,
};

export type FeedResult = 'tamed' | 'failed' | 'healed' | 'full' | 'angry' | 'no';

/**
 * FELLHOUND
 * ---------
 * An original wolf-like creature. Wild ones roam forests, taiga and snowy lands
 * in small packs, hunt rabbits, and defend each other: hit one and the whole pack
 * turns on you. Feed one raw meat and it may become your companion (one in three
 * tries). A tamed Fellhound:
 *  - follows you, finding its way with A* paths, and catches up by bounding to
 *    your side when it falls far behind;
 *  - sits and stays when you right-click it (right-click again to call it);
 *  - fights whatever you attack and whatever attacks you (never villagers or the
 *    Sentinel), and its kills count as yours;
 *  - is healed by feeding it meat; its tail droops as it gets hurt;
 *  - can't be hurt by your own blows or arrows, and never despawns.
 */
export class Hound extends Mob {
  tamed = false;
  sitting = false;
  /** Wild hound: ticks left angry at the player. */
  anger = 0;
  private fightTarget: Mob | null = null;
  private prey: Mob | null = null;
  private huntTimer = 400 + Math.floor(Math.random() * 1200);
  private chaseTicks = 0;
  private path: Step[] | null = null;
  private pathIdx = 0;
  private repath = 0;
  private scan = Math.floor(Math.random() * 10);
  private idleTimer = 0;
  private idleX = 0;
  private idleZ = 0;
  private base = new Map<string, THREE.Vector3>();

  constructor(host?: EntityHost) {
    super('hound', host);
  }

  get maxHealth(): number { return this.tamed ? 20 : this.spec.health; }

  /** Becomes the player's companion. */
  tame(): void {
    this.tamed = true;
    this.petOfPlayer = true;
    this.persistent = true;
    this.anger = 0;
    this.fightTarget = null;
    this.prey = null;
    this.chasing = false;
    this.panic = 0;
    this.health = 20;
    this.sitting = false;
    this.setModel(houndModel(true));
    this.base.clear();
  }

  /** Right-click with food in hand. */
  feed(host: EntityHost, item: string): FeedResult {
    const value = HOUND_FOOD[item];
    if (value === undefined) return 'no';
    if (!this.tamed) {
      if (!HOUND_TAMING_FOOD.includes(item)) return 'no';
      if (this.anger > 0) return 'angry';
      if (Math.random() < 1 / 3) {
        this.tame();
        host.effect('heart', this.x, this.y + 1.1, this.z, 7);
        host.sound('hound', this.x, this.y + 0.6, this.z, 0.8, 1.2);
        return 'tamed';
      }
      host.effect('smoke', this.x, this.y + 1, this.z, 5);
      return 'failed';
    }
    if (this.health >= this.maxHealth) return 'full';
    this.health = Math.min(this.maxHealth, this.health + value);
    host.effect('heart', this.x, this.y + 1.1, this.z, 3);
    host.sound('eat', this.x, this.y + 0.6, this.z, 0.6, 1.2);
    return 'healed';
  }

  /** Right-click without food: sit and stay / get up and follow. */
  toggleSit(host: EntityHost): void {
    this.sitting = !this.sitting;
    this.path = null;
    this.fightTarget = null;
    this.vx = this.vz = 0;
    host.sound('hound', this.x, this.y + 0.6, this.z, 0.5, this.sitting ? 0.9 : 1.15);
  }

  protected onHurt(host: EntityHost, byPlayer: boolean, attacker?: Mob): void {
    this.panic = 0;
    if (this.tamed) {
      this.sitting = false;
      if (attacker && !attacker.spec.folk && !attacker.petOfPlayer) this.fightTarget = attacker;
      return;
    }
    if (byPlayer) {
      // the pack defends its own
      for (const m of host.entities.mobsNear(this.x, this.y, this.z, 14)) {
        if (m instanceof Hound && !m.tamed && m.alive) { m.anger = 600; m.prey = null; }
      }
      this.anger = 600;
    } else if (attacker && attacker !== this) this.fightTarget = attacker;
  }

  // ------------------------------------------------------------------ helpers
  private validFoe(m: Mob | null): m is Mob {
    return !!m && m.alive && !m.removed && m !== this && !m.spec.folk && !m.petOfPlayer;
  }

  /** Steer, step up, swim and accelerate towards a point; returns horizontal distance. */
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

  /** Follows an A* path towards (tx, ty, tz), re-planning now and then. */
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
    this.moveTo(host, tx, tz, speedMul);   // no path: head straight there
  }

  /** Chase and bite. */
  private fight(host: EntityHost, t: { x: number; y: number; z: number; width: number } | null, speedMul: number): void {
    const p = host.player;
    const tx = t ? t.x : p.x, ty = t ? t.y : p.y, tz = t ? t.z : p.z;
    const reach = 1.25 + (t ? t.width / 2 : 0.3);
    const dist = Math.hypot(tx - this.x, tz - this.z);
    if (dist > reach - 0.3) this.pathTo(host, tx, ty, tz, speedMul);
    else this.turnTowards(Math.atan2(-(tx - this.x), -(tz - this.z)), 0.4);
    if (dist < reach && Math.abs(ty - this.y) < 1.6 && this.attackCooldown <= 0) {
      const base = this.tamed ? 4 : 3;
      const dmg = host.difficulty === 'easy' ? base - 1 : host.difficulty === 'hard' ? base + 1 : base;
      if (t) (t as Mob).hurt(dmg, host, tx - this.x, tz - this.z, false, this);
      else host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'hound' });
      this.attackCooldown = 20;
      this.attackAnim = 8;
      host.sound('hound_bite', this.x, this.y + 0.6, this.z, 0.6, 1);
    }
  }

  // ------------------------------------------------------------------ tick
  tick(host: EntityHost): void {
    // a wild hound with nothing to do behaves like any other animal
    const busyWild = !this.tamed && (this.anger > 0 || this.validFoe(this.fightTarget) || this.validFoe(this.prey));
    if (this.deathTime > 0 || (!this.tamed && !busyWild)) {
      super.tick(host);
      if (!this.tamed && this.deathTime === 0) this.wildScan(host);
      return;
    }
    if (!this.tickCommon(host)) return;
    const p = host.player;
    if (this.attackCooldown > 0) this.attackCooldown--;
    const ownerOk = !p.dead;

    if (!this.tamed) {
      // ---- angry / defending / hunting wild hound
      if (this.anger > 0) {
        this.anger--;
        if (p.dead || p.creative || this.distanceTo(p.x, p.y, p.z) > 24) this.anger = 0;
        else this.fight(host, null, 1.35);
      } else if (this.validFoe(this.fightTarget)) {
        this.fight(host, this.fightTarget, 1.3);
      } else if (this.validFoe(this.prey)) {
        if (++this.chaseTicks > 240) this.prey = null;
        else this.fight(host, this.prey, 1.25);
      }
      this.wildScan(host);
    } else if (this.sitting) {
      // ---- sit and stay
      this.vx *= 0.5; this.vz *= 0.5;
      if (--this.lookTimer <= 0) {
        this.lookTimer = 30 + Math.floor(Math.random() * 40);
        const want = Math.atan2(-(p.x - this.x), -(p.z - this.z)) - this.yaw;
        this.headYaw = Math.max(-0.9, Math.min(0.9, wrapAngle(want)));
      }
    } else {
      // ---- companion
      if (++this.scan >= 10) {
        this.scan = 0;
        if (!this.validFoe(this.fightTarget)) {
          const t = host.ownerFightTarget();
          this.fightTarget = this.validFoe(t) ? t : null;
        }
      }
      const dOwner = this.distanceTo(p.x, p.y, p.z);
      const foe = this.fightTarget;
      if (this.validFoe(foe) && ownerOk && dOwner < 20 && this.distanceTo(foe.x, foe.y, foe.z) < 20) {
        this.fight(host, foe, 1.4);
      } else {
        this.fightTarget = null;
        if (ownerOk && dOwner > 14 && !p.flying) this.catchUp(host);
        else if (ownerOk && dOwner > 3.2) {
          this.pathTo(host, p.x, p.y, p.z, dOwner > 8 ? 1.5 : 1.15);
          this.idleTimer = 0;
        } else this.idle(host);
      }
      this.headYaw *= 0.8;
    }
    if (this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.6), Math.floor(this.z))] === 1) this.vy += 0.045;
    this.physics(host.world, 0.08, 0.98, 0.546);
    this.animateLimbs();
    if (--this.barkTimer <= 0) {
      this.barkTimer = 300 + Math.floor(Math.random() * 600);
      if (this.distanceTo(p.x, p.y, p.z) < 16) host.sound(this.anger > 0 ? 'hound_growl' : 'hound', this.x, this.y + 0.6, this.z, 0.5, 0.9 + Math.random() * 0.2);
    }
  }
  private barkTimer = 200 + Math.floor(Math.random() * 400);

  /** Wild hounds look for rabbits to chase now and then. */
  private wildScan(host: EntityHost): void {
    if (this.prey || this.anger > 0 || --this.huntTimer > 0) return;
    this.huntTimer = 600 + Math.floor(Math.random() * 1200);
    let best: Mob | null = null, bd = 12;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 12)) {
      if (m.mobType !== 'rabbit' || !m.alive) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd && this.canSee(host, m.x, m.y + 0.3, m.z)) { bd = d; best = m; }
    }
    if (best) { this.prey = best; this.chaseTicks = 0; }
  }

  /** Near the owner: pad about a little, look at them. */
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

  /** Too far behind: bound straight to a free spot next to the owner. */
  private catchUp(host: EntityHost): void {
    const p = host.player;
    const px = Math.floor(p.x), py = Math.floor(p.y + 0.01), pz = Math.floor(p.z);
    // the nearest free spot next to the owner (not the owner's own block)
    let s: Step | null = null;
    for (const [dx, dz] of CATCH_UP_OFFSETS) {
      for (const dy of [0, 1, -1, 2, -2]) {
        if (canStand(host.world, px + dx, py + dy, pz + dz)) { s = { x: px + dx, y: py + dy, z: pz + dz }; break; }
      }
      if (s) break;
    }
    if (!s) {
      this.pathTo(host, p.x, p.y, p.z, 1.5);
      return;
    }
    host.effect('poof', this.x, this.y + 0.4, this.z, 4);
    this.setPos(s.x + 0.5, s.y, s.z + 0.5);
    this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z;
    this.vx = this.vy = this.vz = 0;
    this.path = null;
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
    // sitting: haunches down, back legs tucked forward, chest and head up, tail on the ground
    if (root && this.deathTime === 0) root.position.y = sit ? -0.19 : 0;
    if (body) body.rotation.x = sit ? -0.6 : 0;
    if (head) {
      const b = this.base.get('head')!;
      head.position.y = b.y + (sit ? 0.26 : 0);
      head.position.z = b.z - (sit ? 0.1 : 0);
    }
    for (const [l, n] of [[legBL, 'legBL'], [legBR, 'legBR']] as const) {
      if (!l) continue;
      const b = this.base.get(n)!;
      l.position.z = b.z + (sit ? 0.06 : 0);
      l.position.y = b.y - (sit ? 0.12 : 0);
      if (sit) l.rotation.x = -1.45;
    }
    for (const [l, n] of [[legFL, 'legFL'], [legFR, 'legFR']] as const) {
      if (!l) continue;
      const b = this.base.get(n)!;
      l.position.y = b.y + (sit ? 0.19 : 0);
      l.scale.y = sit ? 1.35 : 1;
      if (sit) l.rotation.x = 0.12;
    }
    if (tail) {
      const tb = this.base.get('tail')!;
      tail.position.y = tb.y - (sit ? 0.28 : 0);
      tail.position.z = tb.z + (sit ? 0.08 : 0);
      const frac = this.tamed ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0.45;
      tail.rotation.x = sit ? -1.15 : this.anger > 0 ? 0.55 : -0.9 + 1.3 * frac;
      const happy = this.tamed && !sit && this.fightTarget === null;
      tail.rotation.y = happy ? Math.sin((this.age + alpha) * 0.55) * 0.35 * frac : 0;
    }
    if (this.attackAnim > 0 && head) head.rotation.x = -Math.sin((this.attackAnim / 8) * Math.PI) * 0.5;
  }

  // ------------------------------------------------------------------ saving
  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, p: this.persistent, d: { tamed: this.tamed, sitting: this.sitting } };
  }

  restore(d: Record<string, unknown>): void {
    if (d.tamed === true) {
      const h = this.health;
      this.tame();
      this.health = Math.max(1, Math.min(20, h));
    }
    this.sitting = d.sitting === true && this.tamed;
  }
}
