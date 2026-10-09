import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { EMBER_LAMP, IS_WATER } from '../world/BlockRegistry';

/** What Ashboars eat (and are bred with): Glowcaps from the cavern floors. */
export const ASHBOAR_FOOD = 'glowcap';
/** A piglet grows up in 10 minutes (Glowcaps make it quicker). */
export const ASHBOAR_GROW_TICKS = 12000;
const LOVE_TICKS = 600;
/** After having a piglet a grown-up waits 5 minutes before it can again. */
export const ASHBOAR_BREED_COOLDOWN = 6000;
/** How close an Ember Lamp has to be to scare an Ashboar off. */
export const LAMP_RANGE = 6;
const ANGER_TICKS = 400;

export type AshboarFeed = 'love' | 'grew' | 'no';

/**
 * ASHBOAR (2.1)
 * -------------
 * A heavy beast that roams the Cinderdeep's cavern floors in small herds. Calm
 * until someone hurts one: then every grown-up of the herd nearby charges the
 * player, and a hit tosses you into the air. Lava and fire don't hurt it.
 *  - Ember Lamps scare it: it won't come within about six blocks of one, and an
 *    angry one gives up the charge when it gets that close (so a lamp-lit base is safe).
 *  - Feed two grown-ups a Glowcap each and they have a piglet; a Glowcap makes a
 *    piglet grow up sooner. Piglets never charge.
 *  - Peaceful difficulty: nothing charges; hurt Ashboars just run.
 */
export class Ashboar extends Mob {
  anger = 0;
  love = 0;
  breedCooldown = 0;
  /** Ticks until a piglet is grown (0 = grown up). */
  childAge = 0;
  private partner: Ashboar | null = null;
  private lampTimer = Math.floor(Math.random() * 20);
  /** The nearest Ember Lamp (checked once a second), or null. */
  lamp: { x: number; y: number; z: number } | null = null;
  private gruntTimer = 200 + Math.floor(Math.random() * 600);

  constructor(host?: EntityHost) {
    super('ashboar', host);
  }

  get isBaby(): boolean {
    return this.childAge > 0;
  }

  makeBaby(ticks = ASHBOAR_GROW_TICKS): void {
    this.childAge = Math.max(1, ticks);
    this.width = 0.6;
    this.height = 0.6;
    this.health = Math.min(this.health, 10);
  }

  private growUp(host: EntityHost): void {
    this.childAge = 0;
    this.width = this.spec.width;
    this.height = this.spec.height;
    host.effect('happy', this.x, this.y + 1.2, this.z, 6);
  }

  /** Right-clicked with a Glowcap. */
  feed(host: EntityHost): AshboarFeed {
    if (!this.alive) return 'no';
    if (this.isBaby) {
      this.childAge = Math.max(1, this.childAge - Math.floor(ASHBOAR_GROW_TICKS / 10));
      host.effect('happy', this.x, this.y + 0.8, this.z, 5);
      host.sound('eat', this.x, this.y + 0.5, this.z, 0.6, 1.4);
      return 'grew';
    }
    if (this.love > 0 || this.breedCooldown > 0 || this.anger > 0) return 'no';
    this.love = LOVE_TICKS;
    this.panic = 0;
    host.effect('heart', this.x, this.y + 1.3, this.z, 6);
    host.sound('eat', this.x, this.y + 0.6, this.z, 0.6, 0.9);
    return 'love';
  }

  protected onHurt(host: EntityHost, byPlayer: boolean): void {
    this.love = 0;
    if (!byPlayer || host.difficulty === 'peaceful' || host.player.creative) return;
    // the herd stands up for its own: the grown-ups nearby charge, piglets run
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 16)) {
      if (!(m instanceof Ashboar) || !m.alive) continue;
      if (m.isBaby) { m.panic = 100; continue; }
      if (m.nearLamp()) continue;
      m.anger = ANGER_TICKS;
      m.panic = 0;
      m.love = 0;
    }
    if (!this.isBaby && !this.nearLamp()) { this.anger = ANGER_TICKS; this.panic = 0; }
  }

  /** Is an Ember Lamp close enough to frighten it? */
  nearLamp(): boolean {
    return !!this.lamp && Math.hypot(this.lamp.x + 0.5 - this.x, this.lamp.z + 0.5 - this.z) <= LAMP_RANGE + 0.5;
  }

  private findLamp(host: EntityHost): void {
    const w = host.world;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
    for (let dy = -2; dy <= 3; dy++) for (let dz = -LAMP_RANGE; dz <= LAMP_RANGE; dz++) for (let dx = -LAMP_RANGE; dx <= LAMP_RANGE; dx++) {
      if (w.getBlock(bx + dx, by + dy, bz + dz) !== EMBER_LAMP) continue;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) { bd = d; best = { x: bx + dx, y: by + dy, z: bz + dz }; }
    }
    this.lamp = best;
  }

  /** Steer, step up and accelerate towards a point; returns the horizontal distance. */
  private moveTo(host: EntityHost, tx: number, tz: number, speedMul: number, stopAt = 0.4): number {
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > stopAt) {
      this.turnTowards(Math.atan2(-dx, -dz), 0.3);
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

  tick(host: EntityHost): void {
    if (!this.alive) { super.tick(host); return; }
    // ---- timers: growing up, love, the wait between piglets, temper
    if (this.childAge > 1) this.childAge--;
    else if (this.childAge === 1) this.growUp(host);
    if (this.breedCooldown > 0) this.breedCooldown--;
    if (this.love > 0) {
      this.love--;
      if (this.age % 12 === 0) host.effect('heart', this.x, this.y + this.height + 0.2, this.z, 1);
    }
    if (--this.lampTimer <= 0) { this.lampTimer = 20; this.findLamp(host); }
    const p = host.player;
    if (this.anger > 0) {
      this.anger--;
      if (p.dead || p.creative || host.difficulty === 'peaceful' || this.isBaby || this.distanceTo(p.x, p.y, p.z) > 24) this.anger = 0;
      if (this.nearLamp()) { this.anger = 0; this.panic = 40; }   // the lamp's glow is too much: back off
    }
    if (--this.gruntTimer <= 0) {
      this.gruntTimer = 300 + Math.floor(Math.random() * 600);
      if (this.distanceTo(p.x, p.y, p.z) < 16) host.sound(this.anger > 0 ? 'ashboar_snort' : 'ashboar', this.x, this.y + 0.6, this.z, 0.5, this.isBaby ? 1.5 : 0.9 + Math.random() * 0.2);
    }

    if (this.anger > 0) { this.charge(host); return; }
    if (this.love > 0 && this.findPartner(host)) { this.court(host); return; }
    // ---- calm: keep away from Ember Lamps, otherwise graze about like any animal
    if (this.lamp && this.nearLamp() && (!this.hasTarget || this.age % 20 === 0)) {
      const dx = this.x - (this.lamp.x + 0.5), dz = this.z - (this.lamp.z + 0.5), l = Math.hypot(dx, dz) || 1;
      this.targetX = this.x + (dx / l) * (LAMP_RANGE + 3);
      this.targetZ = this.z + (dz / l) * (LAMP_RANGE + 3);
      this.hasTarget = true;
      this.stuckTicks = 0;
    }
    super.tick(host);
  }

  /** Runs at the player and tosses them into the air. */
  private charge(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    const dx = p.x - this.x, dz = p.z - this.z;
    const dist = this.moveTo(host, p.x, p.z, 1.45, 0.9);
    this.headYaw = 0;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (dist < 1.75 && Math.abs(p.y - this.y) < 1.6 && this.attackCooldown <= 0) {
      const dmg = host.difficulty === 'easy' ? 2 : host.difficulty === 'hard' ? 6 : 4;
      const before = p.health;
      host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'mob', mob: this });
      if (p.health < before) {
        const l = Math.hypot(dx, dz) || 1;
        p.vx += (dx / l) * 0.5; p.vz += (dz / l) * 0.5;
        p.vy = Math.max(p.vy, 0.62);          // up you go
      }
      this.attackCooldown = 30;
      this.attackAnim = 10;
      host.sound('ashboar_snort', this.x, this.y + 0.6, this.z, 0.7, 0.8 + Math.random() * 0.2);
    }
    this.swimAndMove(host);
  }

  private findPartner(host: EntityHost): boolean {
    const q = this.partner;
    if (q && q.alive && !q.removed && q.love > 0 && this.distanceTo(q.x, q.y, q.z) < 10) return true;
    this.partner = null;
    if (this.age % 10 !== 0) return false;
    let bd = 8;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 8)) {
      if (!(m instanceof Ashboar) || m === this || !m.alive || m.isBaby || m.love <= 0) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd) { bd = d; this.partner = m; }
    }
    return !!this.partner;
  }

  /** Walks over to its partner; when they meet, a piglet is born. */
  private court(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const q = this.partner!;
    const dist = this.moveTo(host, q.x, q.z, 1.0, 1.0);
    if (dist < 1.6 && Math.abs(q.y - this.y) < 1.5 && this.id < q.id) {
      const baby = host.spawnMob?.('ashboar', (this.x + q.x) / 2, Math.max(this.y, q.y), (this.z + q.z) / 2);
      if (baby instanceof Ashboar) {
        baby.makeBaby();
        baby.yaw = this.yaw;
      }
      for (const a of [this, q]) { a.love = 0; a.breedCooldown = ASHBOAR_BREED_COOLDOWN; a.partner = null; }
      host.effect('heart', baby?.x ?? this.x, (baby?.y ?? this.y) + 0.8, baby?.z ?? this.z, 8);
      host.spawnXp(1 + Math.floor(Math.random() * 7), this.x, this.y + 0.5, this.z);
      host.sound('ashboar', this.x, this.y + 0.5, this.z, 0.6, 1.5);
      host.animalBred?.('ashboar');
    }
    this.swimAndMove(host);
  }

  private swimAndMove(host: EntityHost): void {
    if (this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.6), Math.floor(this.z))] === 1) this.vy += 0.045;
    this.physics(host.world, 0.08, 0.98, 0.546);
    this.animateLimbs();
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    if (!this.isBaby) { super.die(host, byPlayer); return; }
    // piglets leave nothing behind
    this.deathTime = 1;
    host.sound('ashboar_death', this.x, this.y + 0.4, this.z, 0.6, 1.5);
    host.onMobKilled(this.mobType, byPlayer, this);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const root = this.object.children[0];
    const s = this.isBaby ? 0.55 : 1;
    if (root.scale.x !== s) root.scale.setScalar(s);
    const head = this.parts.get('head');
    if (head) {
      head.scale.setScalar(this.isBaby ? 1.3 : 1);
      if (this.anger > 0) {
        // head down to charge; the toss throws it up
        const toss = this.attackAnim > 0 ? Math.sin((this.attackAnim / 10) * Math.PI) : 0;
        head.rotation.x = 0.35 - toss * 1.0;
      }
    }
    const tail = this.parts.get('tail');
    if (tail) tail.rotation.x = this.anger > 0 ? -0.9 : 0.2 + Math.sin((this.age + alpha) * 0.2) * 0.15;
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, a: { child: this.childAge, cool: this.breedCooldown } };
  }

  restore(d: Record<string, unknown>): void {
    if (typeof d.child === 'number' && d.child > 0) this.makeBaby(Math.min(ASHBOAR_GROW_TICKS, d.child));
    if (typeof d.cool === 'number' && d.cool > 0) this.breedCooldown = Math.min(ASHBOAR_BREED_COOLDOWN, d.cool);
  }
}
