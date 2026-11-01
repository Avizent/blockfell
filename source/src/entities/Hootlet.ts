import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { hootletModel } from './mobModels';

/** Seeds a wild Hootlet will take from your hand (one try in three); any seeds mend a tamed one. */
export const HOOTLET_FOOD = ['wheat_seeds'];
const TAMED_HEALTH = 14;
/** Little presents a tamed Hootlet drops now and then. */
const GIFTS: [string, number][] = [['feather', 8], ['amber', 1], ['string', 2], ['bone', 2]];

export type HootletFeed = 'tamed' | 'failed' | 'healed' | 'full' | 'no';

/**
 * HOOTLET (2.10) - an ORIGINAL small owl (working name).
 * Wild ones live in forests, flutter low and are shy: they fly off unless you sneak up.
 * Feed one wheat seeds (one try in three) and it becomes your companion. A tamed Hootlet:
 *  - wears a red ribbon, flutters round you and perches on your shoulder when you stand still;
 *  - hoots a warning when a hostile creature comes within 14 blocks;
 *  - brings a little present now and then, and is mended by seeds;
 *  - stays where it is if you right-click it (right-click again to call it).
 */
export class Hootlet extends Mob {
  tamed = false;
  sitting = false;
  perched = false;
  giftTimer = 5000 + Math.floor(Math.random() * 3000);
  private flee = 0;
  private hop = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private orbit = Math.random() * Math.PI * 2;
  private stillTicks = 0;
  private lastPx = 0;
  private lastPz = 0;
  private warnCooldown = 0;
  private hoot = 300 + Math.floor(Math.random() * 600);

  constructor(host?: EntityHost) {
    super('hootlet', host);
    this.knockbackTaken = 0.6;
  }

  get maxHealth(): number { return this.tamed ? TAMED_HEALTH : this.spec.health; }

  tame(): void {
    this.tamed = true;
    this.petOfPlayer = true;
    this.persistent = true;
    this.panic = 0;
    this.health = TAMED_HEALTH;
    this.sitting = false;
    this.setModel(hootletModel(true));
  }

  feed(host: EntityHost, item: string): HootletFeed {
    if (!HOOTLET_FOOD.includes(item) || !this.alive) return 'no';
    if (!this.tamed) {
      host.sound('eat', this.x, this.y + 0.3, this.z, 0.4, 1.6);
      if (Math.random() < 1 / 3) {
        this.tame();
        host.effect('heart', this.x, this.y + 0.6, this.z, 6);
        host.sound('hootlet', this.x, this.y + 0.3, this.z, 0.8, 1.1);
        return 'tamed';
      }
      host.effect('smoke', this.x, this.y + 0.5, this.z, 3);
      return 'failed';
    }
    if (this.health >= this.maxHealth) return 'full';
    this.health = Math.min(this.maxHealth, this.health + 3);
    host.effect('heart', this.x, this.y + 0.6, this.z, 3);
    host.sound('eat', this.x, this.y + 0.3, this.z, 0.4, 1.6);
    return 'healed';
  }

  toggleSit(host: EntityHost): void {
    this.sitting = !this.sitting;
    this.perched = false;
    host.sound('hootlet', this.x, this.y + 0.3, this.z, 0.5, this.sitting ? 0.9 : 1.2);
  }

  protected onHurt(): void {
    if (this.tamed) { this.sitting = false; this.perched = false; }
    else this.flee = 80;
  }

  private groundY(host: EntityHost, x: number, z: number): number {
    const fx = Math.floor(x), fz = Math.floor(z);
    return host.world.isLoaded(fx, fz) ? host.world.highestSolid(fx, fz) + 1 : this.y;
  }

  tick(host: EntityHost): void {
    if (this.deathTime > 0) { super.tick(host); return; }
    if (!this.tickCommon(host)) return;
    const p = host.player;
    let sp = 0.08;
    const dP = this.distanceTo(p.x, p.y, p.z);
    if (this.warnCooldown > 0) this.warnCooldown--;

    if (!this.tamed) {
      // shy: flies off from a player who isn't creeping
      if (this.age % 10 === 0 && !p.dead && !p.creative && !p.sneaking && dP < 6 && this.flee < 20) this.flee = 60;
      if (this.flee > 0) {
        this.flee--;
        const a = Math.atan2(this.x - p.x, this.z - p.z);
        this.tx = this.x + Math.sin(a) * 6; this.tz = this.z + Math.cos(a) * 6;
        this.ty = Math.max(this.y, this.groundY(host, this.x, this.z) + 3);
        sp = 0.16;
      } else {
        if (--this.hop <= 0) {
          this.hop = 80 + Math.floor(Math.random() * 200);
          if (Math.random() < 0.55) { this.tx = this.x; this.tz = this.z; this.ty = this.groundY(host, this.x, this.z); }   // perch
          else {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
            this.tx = this.x + Math.cos(a) * r; this.tz = this.z + Math.sin(a) * r;
            this.ty = this.groundY(host, this.tx, this.tz) + Math.random() * 2;
          }
        }
        sp = 0.05;
      }
    } else {
      // keep an eye out for danger
      if (this.age % 20 === 0 && this.warnCooldown === 0 && !p.dead) {
        for (const m of host.entities.mobsNear(p.x, p.y, p.z, 14)) {
          if (m.spec.hostile && m.alive && !m.removed) {
            this.warnCooldown = 600;
            host.sound('hootlet', this.x, this.y + 0.3, this.z, 0.9, 0.85);
            host.effect('crit', this.x, this.y + 0.7, this.z, 8);
            host.hootletWarn?.(this, m);
            break;
          }
        }
      }
      // a present
      if (!p.dead && dP < 8 && --this.giftTimer <= 0) {
        this.giftTimer = 5000 + Math.floor(Math.random() * 3000);
        let r = Math.random() * GIFTS.reduce((a, [, w]) => a + w, 0), id = GIFTS[0][0];
        for (const [g, w] of GIFTS) { r -= w; if (r <= 0) { id = g; break; } }
        host.spawnItem({ id, count: 1 }, this.x, this.y + 0.3, this.z, [0, 0.12, 0]);
        host.effect('heart', this.x, this.y + 0.6, this.z, 3);
        host.sound('hootlet', this.x, this.y + 0.3, this.z, 0.6, 1.3);
        host.foxGift?.(this, id);
      }
      const moved = Math.hypot(p.x - this.lastPx, p.z - this.lastPz);
      this.lastPx = p.x; this.lastPz = p.z;
      this.stillTicks = moved < 0.01 && Math.abs(p.vy) < 0.1 ? this.stillTicks + 1 : 0;
      if (this.sitting) {
        this.tx = this.x; this.tz = this.z; this.ty = this.groundY(host, this.x, this.z); sp = 0.05;
      } else if (!p.dead && dP > 26) {
        // too far behind: flutter to the player's side
        host.effect('poof', this.x, this.y + 0.3, this.z, 3);
        this.setPos(p.x + 1.5, p.y + 1.5, p.z);
        this.vx = this.vy = this.vz = 0;
        this.perched = false;
      } else if (!p.dead) {
        if (this.perched && moved > 0.08) this.perched = false;
        if (!this.perched && this.stillTicks > 60 && dP < 4) this.perched = true;
        if (this.perched) {
          // on the shoulder
          const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
          const px = p.x + rx * 0.42, pz = p.z + rz * 0.42, py = p.y + 1.25;
          this.setPos(this.x + (px - this.x) * 0.35, this.y + (py - this.y) * 0.35, this.z + (pz - this.z) * 0.35);
          this.vx = this.vy = this.vz = 0;
          this.yaw = p.yaw;
          this.animateLimbs();
          return;
        }
        this.orbit += 0.025;
        const rad = 1.8 + Math.sin(this.orbit * 0.6) * 0.5;
        this.tx = p.x + Math.cos(this.orbit) * rad; this.tz = p.z + Math.sin(this.orbit) * rad;
        this.ty = p.y + 1.6 + Math.sin(this.orbit * 1.7) * 0.4;
        sp = Math.max(0.04, Math.min(0.2, dP * 0.045));
      }
    }

    const dx = this.tx - this.x, dy = this.ty - this.y, dz = this.tz - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (this.tx === 0 && this.tz === 0 && this.ty === 0) { this.tx = this.x; this.ty = this.y; this.tz = this.z; }
    else if (d > 0.15) {
      const k = Math.min(1, d / 1.5);
      this.vx += ((dx / d) * sp * k - this.vx) * 0.15;
      this.vy += ((dy / d) * sp * k - this.vy) * 0.15;
      this.vz += ((dz / d) * sp * k - this.vz) * 0.15;
      if (Math.abs(dx) > 0.2 || Math.abs(dz) > 0.2) this.turnTowards(Math.atan2(-dx, -dz), 0.2);
    } else { this.vx *= 0.7; this.vy *= 0.7; this.vz *= 0.7; }
    // lift over rock ahead
    const ax = Math.floor(this.x + this.vx * 5), az = Math.floor(this.z + this.vz * 5);
    if (host.world.isLoaded(ax, az) && host.world.getBlock(ax, Math.floor(this.y + 0.3), az) !== 0 && d > 0.3) this.vy += 0.03;
    this.physics(host.world, 0, 1, 1, 1);
    this.animateLimbs();
    if (!this.tamed && --this.hoot <= 0) {
      this.hoot = 500 + Math.floor(Math.random() * 900);
      if (dP < 18) host.sound('hootlet', this.x, this.y + 0.3, this.z, 0.4, 1 + Math.random() * 0.2);
    }
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const wl = this.parts.get('wingL'), wr = this.parts.get('wingR');
    const airborne = !this.perched && !this.sitting && (Math.abs(this.vx) + Math.abs(this.vz) + Math.abs(this.vy) > 0.03);
    const f = airborne ? Math.sin((this.age + alpha) * 1.1) * 0.9 : 0.05;
    if (wl) wl.rotation.z = f;
    if (wr) wr.rotation.z = -f;
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    super.die(host, byPlayer);
    if (this.tamed) host.petDied(this);
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, p: this.persistent, d: { tamed: this.tamed, sitting: this.sitting, gift: this.giftTimer } };
  }

  restore(d: Record<string, unknown>): void {
    if (d.tamed === true) {
      const h = this.health;
      this.tame();
      this.health = Math.max(1, Math.min(TAMED_HEALTH, h));
    }
    this.sitting = d.sitting === true && this.tamed;
    if (typeof d.gift === 'number' && d.gift > 0) this.giftTimer = Math.min(8000, d.gift);
  }
}
