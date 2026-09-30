import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { findPath, Step } from './Pathfinder';

/**
 * SENTINEL
 * --------
 * An ORIGINAL stone guardian that watches over a village. It walks slowly around
 * the village, fights any hostile creature within 16 blocks (raiders first) and
 * hurls it into the air, and only turns on the player if the player attacks it
 * or a villager. Heavy: it barely reacts to knockback.
 */
export class Sentinel extends Mob {
  villageId: string | null = null;
  homeX = 0;
  homeZ = 0;
  /** Ticks left being angry at the player. */
  angry = 0;
  private path: Step[] | null = null;
  private pathIdx = 0;
  private retarget = 0;
  private wanderTimer = 100;

  constructor(host?: EntityHost) {
    super('sentinel', host);
    this.persistent = true;
    this.knockbackTaken = 0.08;
  }

  protected onHurt(host: EntityHost, byPlayer: boolean): void {
    if (byPlayer) { this.angry = 600; host.effect('angry', this.x, this.y + 2.8, this.z, 4); }
  }

  /** Nearest hostile creature (raiders count double), or the player when angry. */
  private pick(host: EntityHost): void {
    const p = host.player;
    let best: Mob | null = null, bd = 16;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 16)) {
      if (!m.alive || !m.spec.hostile) continue;
      const d = this.distanceTo(m.x, m.y, m.z) * (m.raider ? 0.5 : 1);
      if (d < bd && this.canSee(host, m.x, m.y + m.height * 0.5, m.z)) { bd = d; best = m; }
    }
    if (this.revengeOn && this.revengeOn.alive && !this.revengeOn.removed) best = this.revengeOn;
    this.targetEnt = best;
    this.chasing = !!best || (this.angry > 0 && !p.dead && !p.creative && this.distanceTo(p.x, p.y, p.z) < 20);
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    if (this.angry > 0) this.angry--;
    if (this.health < this.spec.health && host.tickCount % 100 === 0) this.health++;
    if (--this.retarget <= 0) { this.retarget = 10; this.pick(host); }
    if (this.attackCooldown > 0) this.attackCooldown--;

    let forward = 0;
    let speedMul = 0.8;
    if (this.chasing) {
      const te = this.targetEnt;
      if (te && (!te.alive || te.removed)) { this.targetEnt = null; this.chasing = false; }
      const tx = te ? te.x : p.x, ty = te ? te.y : p.y, tz = te ? te.z : p.z;
      const dx = tx - this.x, dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      this.turnTowards(Math.atan2(-dx, -dz), 0.3);
      this.headYaw = 0;
      const reach = 1.6 + (te ? te.width / 2 : 0.3);
      if (dist > reach - 0.3) forward = 1;
      speedMul = 1.2;
      if (dist < reach && Math.abs(ty - this.y) < 2.5 && this.attackCooldown <= 0) {
        const base = 7 + Math.floor(Math.random() * 8);
        const dmg = host.difficulty === 'easy' ? base * 0.6 : host.difficulty === 'hard' ? base * 1.4 : base;
        if (te) {
          te.hurt(dmg, host, dx, dz, false, this);
          te.vy = 0.6;
        } else {
          host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'mob' });
          p.vy = Math.max(p.vy, 0.6);
        }
        host.sound('sentinel_hit', this.x, this.y + 1.5, this.z, 0.8, 1);
        this.attackCooldown = 25;
        this.attackAnim = 12;
      }
      this.path = null;
    } else {
      // stroll around the village, never far from its centre
      if (!this.path && --this.wanderTimer <= 0) {
        this.wanderTimer = 160 + Math.floor(Math.random() * 300);
        const tx = Math.floor(this.homeX + (Math.random() - 0.5) * 24), tz = Math.floor(this.homeZ + (Math.random() - 0.5) * 24);
        const ty = host.world.highestSolid(tx, tz) + 1;
        if (ty > 0) {
          const path = findPath(host.world, Math.floor(this.x), Math.floor(this.y + 0.01), Math.floor(this.z), tx, ty, tz, { partial: true, maxNodes: 1200 });
          if (path && path.length) { this.path = path; this.pathIdx = 0; }
        }
      }
      if (this.path) {
        const s = this.path[this.pathIdx];
        const dx = s.x + 0.5 - this.x, dz = s.z + 0.5 - this.z;
        if (Math.hypot(dx, dz) < 0.6) { if (++this.pathIdx >= this.path.length) this.path = null; }
        else { this.turnTowards(Math.atan2(-dx, -dz), 0.2); forward = 0.6; }
        if (this.age % 400 === 0) this.path = null;   // don't get stuck forever
      }
    }

    // obstacles: step over single blocks
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (forward !== 0 && this.collidedH && this.onGround) {
      const ax = this.x + fx * (this.width / 2 + 0.3), az = this.z + fz * (this.width / 2 + 0.3);
      if (this.solidAt(host, ax, this.y + 0.5, az) && !this.solidAt(host, ax, this.y + 1.5, az)) this.vy = 0.45;
    }
    if (forward !== 0) {
      const accel = (this.onGround ? this.spec.speed * 0.22 : this.spec.speed * 0.05) * speedMul * forward;
      this.vx += fx * accel;
      this.vz += fz * accel;
    }
    if (this.inWater) this.vy += 0.03;
    this.physics(host.world, 0.08, 0.98, 0.546);
    this.animateLimbs();
    if (!this.chasing && --this.lookTimer <= 0) {
      this.lookTimer = 60 + Math.floor(Math.random() * 80);
      const dp = this.distanceTo(p.x, p.y, p.z);
      if (dp < 8) {
        const want = Math.atan2(-(p.x - this.x), -(p.z - this.z)) - this.yaw;
        this.headYaw = Math.max(-0.8, Math.min(0.8, wrapAngle(want)));
      } else this.headYaw = (Math.random() - 0.5) * 0.8;
    }
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const armL = this.parts.get('armL'), armR = this.parts.get('armR');
    if (armL && armR) {
      const att = this.attackAnim > 0 ? Math.sin((this.attackAnim / 12) * Math.PI) : 0;
      const swing = Math.sin(this.limbPhase) * this.limbAmount * 0.5;
      armL.rotation.x = -swing - att * 1.8;
      armR.rotation.x = swing - att * 1.8;
      armL.rotation.y = 0;
    }
  }

  serialize(): Record<string, unknown> | null {
    const base = super.serialize();
    if (!base) return null;
    return { ...base, p: true, s: { village: this.villageId, hx: this.homeX, hz: this.homeZ } };
  }

  restore(s: Record<string, unknown>): void {
    this.villageId = (s.village as string | null) ?? null;
    this.homeX = (s.hx as number) ?? this.x;
    this.homeZ = (s.hz as number) ?? this.z;
  }
}
