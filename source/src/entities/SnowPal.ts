import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { IS_WATER } from '../world/BlockRegistry';
import { BIOME_BADLANDS, BIOME_DESERT } from '../world/BiomeSystem';

/** How far a Snow Pal looks for creatures to pelt, and how often it throws. */
export const SNOWPAL_RANGE = 10;
const THROW_TICKS = 20;
/** Snowball launch speed (blocks per tick) and the gravity snowballs fall with. */
const BALL_SPEED = 1.1;
const BALL_GRAVITY = 0.03;
/** A guarding Snow Pal stays within this many blocks of where it stands guard. */
const HOME_RADIUS = 7;

/**
 * SNOW PAL (2.3) - the name is in world/names.ts
 * ---------------------------------------------
 * A snowman helper: stack two Snow Blocks and use Coal on them (right-click the
 * top one). It pelts creatures of the night within 10 blocks with snowballs (a
 * sting of 1, more to creatures of fire, and a good knock back), which draws them
 * onto it rather than you. Right-click it to choose: guard this spot (it potters
 * about near it) or follow me. It is yours: your blows and arrows pass it by
 * (sneak and hit it to break it up into snowballs). It melts in water, in deserts
 * and badlands, and in the Cinderdeep.
 */
export class SnowPal extends Mob {
  /** Where it stands guard. */
  homeX = 0; homeY = 0; homeZ = 0;
  private homeSet = false;
  following = false;
  private target: Mob | null = null;
  private scan = Math.floor(Math.random() * 10);
  private throwArm = 0;
  private melt = 0;

  constructor(host?: EntityHost) {
    super('snowpal', host);
    this.petOfPlayer = true;
    this.persistent = true;
    this.knockbackTaken = 0.5;
  }

  /** Right-click: guard here / follow me. */
  toggleFollow(host: EntityHost): void {
    this.following = !this.following;
    if (!this.following) this.setHome(this.x, this.y, this.z);
    this.hasTarget = false;
    host.sound('snowpal', this.x, this.y + 1.2, this.z, 0.6, this.following ? 1.25 : 0.95);
    host.effect('snow', this.x, this.y + 1.3, this.z, 5);
  }

  setHome(x: number, y: number, z: number): void {
    this.homeX = x; this.homeY = y; this.homeZ = z;
    this.homeSet = true;
  }

  /** Potter about near home (or near the player it follows). */
  protected pickWanderTarget(host: EntityHost): void {
    const p = host.player;
    const cx = this.following ? p.x : this.homeX, cz = this.following ? p.z : this.homeZ;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * (this.following ? 3 : HOME_RADIUS);
      const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
      if (!host.world.isLoaded(Math.floor(tx), Math.floor(tz))) continue;
      this.targetX = tx; this.targetZ = tz; this.hasTarget = true; this.stuckTicks = 0;
      return;
    }
  }

  protected onHurt(): void {
    this.panic = 0;   // a snowman stands its ground
  }

  private validFoe(m: Mob | null): m is Mob {
    if (!m || !m.alive || m.removed || m === this || m.spec.folk || m.petOfPlayer) return false;
    return m.spec.hostile && this.distanceTo(m.x, m.y, m.z) <= SNOWPAL_RANGE + 2;
  }

  /** The nearest creature of the night it can see, or whatever hit it. */
  private findFoe(host: EntityHost): Mob | null {
    if (this.revengeOn && !this.revengeOn.spec.folk && !this.revengeOn.petOfPlayer && this.revengeOn.alive && this.distanceTo(this.revengeOn.x, this.revengeOn.y, this.revengeOn.z) <= SNOWPAL_RANGE) return this.revengeOn;
    let best: Mob | null = null, bd = SNOWPAL_RANGE;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, SNOWPAL_RANGE)) {
      if (!m.spec.hostile || !m.alive || m.petOfPlayer) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd && this.canSee(host, m.x, m.y + m.height * 0.6, m.z)) { bd = d; best = m; }
    }
    return best;
  }

  /** Throws a snowball at a creature: aimed a little high so the arc lands on it. */
  private throwAt(host: EntityHost, m: Mob): void {
    const sx = this.x, sy = this.y + 1.25, sz = this.z;
    const tx = m.x, ty = m.y + m.height * 0.55, tz = m.z;
    const dx = tx - sx, dz = tz - sz;
    const flat = Math.hypot(dx, dz) || 1;
    const t = flat / BALL_SPEED;
    const dy = ty - sy + 0.5 * BALL_GRAVITY * t * t;
    const len = Math.hypot(dx, dy, dz) || 1;
    const spread = () => (Math.random() - 0.5) * 0.04;
    host.spawnSnowball?.(sx + (dx / flat) * 0.5, sy, sz + (dz / flat) * 0.5,
      (dx / len) * BALL_SPEED + spread(), (dy / len) * BALL_SPEED + spread(), (dz / len) * BALL_SPEED + spread(), this);
    host.sound('throw', sx, sy, sz, 0.5, 1.1 + Math.random() * 0.2);
    this.throwArm = 8;
  }

  private meltingHere(host: EntityHost): boolean {
    if (host.world.dim === 'cinderdeep') return true;
    if (host.world.dim !== 'overworld') return false;
    const b = host.world.generator.column(Math.floor(this.x), Math.floor(this.z)).biome;
    return b === BIOME_DESERT || b === BIOME_BADLANDS;
  }

  tick(host: EntityHost): void {
    if (this.deathTime > 0) { super.tick(host); return; }
    if (!this.homeSet) this.setHome(this.x, this.y, this.z);
    if (this.throwArm > 0) this.throwArm--;
    // melting: water, heat
    const wet = this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z))] === 1;
    const hot = this.age % 20 === 0 && this.meltingHere(host);
    if (wet || hot) {
      if (++this.melt >= (wet ? 20 : 1)) {
        this.melt = 0;
        this.health -= 1;
        this.hurtTime = 10;
        host.sound('fizz', this.x, this.y + 0.8, this.z, 0.3, 1.5);
        if (this.health <= 0) this.die(host, false);
      }
      if (this.age % 6 === 0) host.effect('drip', this.x, this.y + 0.2, this.z, 2);
    } else if (this.melt > 0 && this.age % 40 === 0) this.melt--;
    if (this.deathTime > 0) return;

    if (++this.scan >= 10) {
      this.scan = 0;
      if (!this.validFoe(this.target)) this.target = this.findFoe(host);
    }
    const foe = this.validFoe(this.target) ? this.target : null;
    if (foe) {
      // stand and throw
      if (!this.tickCommon(host)) return;
      this.turnTowards(Math.atan2(-(foe.x - this.x), -(foe.z - this.z)), 0.4);
      this.headYaw = 0;
      if (this.attackCooldown > 0) this.attackCooldown--;
      if (this.attackCooldown <= 0 && this.canSee(host, foe.x, foe.y + foe.height * 0.6, foe.z)) {
        this.attackCooldown = THROW_TICKS;
        this.throwAt(host, foe);
      }
      this.vx *= 0.6; this.vz *= 0.6;
      this.physics(host.world, 0.08, 0.98, 0.546);
      this.animateLimbs();
      return;
    }
    this.target = null;
    // following: keep up with the player (no faster than a snowman can shuffle)
    const p = host.player;
    const dP = this.distanceTo(p.x, p.y, p.z);
    if (this.following && !p.dead && dP > 4) {
      if (!this.hasTarget || this.age % 20 === 0) { this.targetX = p.x; this.targetZ = p.z; this.hasTarget = true; this.stuckTicks = 0; }
    } else if (this.following && dP < 2.5 && this.hasTarget && Math.hypot(this.targetX - p.x, this.targetZ - p.z) < 1.5) {
      this.hasTarget = false;   // close enough: don't walk into the player
    } else if (!this.following && Math.hypot(this.x - this.homeX, this.z - this.homeZ) > HOME_RADIUS + 3 && !this.hasTarget) {
      this.targetX = this.homeX; this.targetZ = this.homeZ; this.hasTarget = true; this.stuckTicks = 0;
    }
    super.tick(host);
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    this.deathTime = 1;
    host.sound('snowpal_death', this.x, this.y + 0.8, this.z, 0.7, 1);
    host.effect('snow', this.x, this.y + 0.8, this.z, 16);
    host.onMobKilled(this.mobType, byPlayer, this);
    // it falls apart into snowballs whatever happened to it
    host.spawnItem({ id: 'snowball', count: 2 + Math.floor(Math.random() * 5) }, this.x, this.y + 0.6, this.z);
    host.petDied(this);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const armL = this.parts.get('armL'), armR = this.parts.get('armR');
    const wave = this.deathTime === 0 ? Math.sin((this.age + alpha) * 0.08) * 0.08 : 0;
    const t = this.throwArm > 0 ? Math.sin((this.throwArm / 8) * Math.PI) : 0;
    if (armL) { armL.rotation.order = 'YXZ'; armL.rotation.set(-0.5 - wave, Math.PI / 2 - 0.15, 0); }
    if (armR) { armR.rotation.order = 'YXZ'; armR.rotation.set(-0.5 + wave - t * 0.9, -Math.PI / 2 + 0.15 + t * 1.2, 0); }
    const head = this.parts.get('head');
    if (head) head.rotation.y = wrapAngle(this.headYaw);
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, p: true, sp: { hx: this.homeX, hy: this.homeY, hz: this.homeZ, follow: this.following } };
  }

  restore(d: Record<string, unknown>): void {
    if ([d.hx, d.hy, d.hz].every((v) => typeof v === 'number' && Number.isFinite(v))) this.setHome(d.hx as number, d.hy as number, d.hz as number);
    this.following = d.follow === true;
  }
}
