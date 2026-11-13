import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import type { MobType } from './mobModels';

/**
 * WILDLINGS (2.17) - three ORIGINAL small creatures you can catch with a Capture Orb.
 * ---------------------------------------------------------------------------------
 *  - Emberling (a glowing salamander): lives in deserts and badlands; companion sets nearby hostile creatures alight.
 *  - Mossback  (a garden-shelled tortoise): lives in forests and plains; companion mends you slowly while you are close.
 *  - Stormkit  (a static-furred hopper): lives on hills and snowy ground; companion zaps nearby hostile creatures.
 * A wild Wildling is shy and runs from you unless you creep (sneak). Throw a Capture Orb at one: the weaker it
 * is, the better your chance. A caught one follows you, sits and stays on a right-click, is mended by an
 * apple or carrot, and never wanders off. Names are free: use a Name Tag.
 */
export type WildKind = 'emberling' | 'mossback' | 'stormkit';
export const WILD_KINDS: WildKind[] = ['emberling', 'mossback', 'stormkit'];

export const WILD_INFO: Record<WildKind, { name: string; habitat: string; power: string; hint: string }> = {
  emberling: { name: 'Emberling', habitat: 'Deserts and badlands', power: 'Sets nearby hostile creatures alight', hint: 'A glowing salamander of the hot sands.' },
  mossback: { name: 'Mossback', habitat: 'Forests and plains', power: 'Mends you slowly while you are close', hint: 'A slow tortoise with a garden on its shell.' },
  stormkit: { name: 'Stormkit', habitat: 'Hills and snowy ground', power: 'Zaps nearby hostile creatures', hint: 'A static-furred hopper with a zigzag tail.' },
};

export function isWildKind(t: string): t is WildKind {
  return t === 'emberling' || t === 'mossback' || t === 'stormkit';
}

/** Hearts-times-two a caught Wildling has (more than a wild one). */
const CAUGHT_BONUS = 6;
/** What mends a caught Wildling. */
export const WILD_FOOD: Record<string, number> = { apple: 4, carrot: 4, wheat_seeds: 2 };

export type WildFeed = 'healed' | 'full' | 'no';

export class Wildling extends Mob {
  caught = false;
  sitting = false;
  private power = 120 + Math.floor(Math.random() * 120);
  private noticed = false;
  private chirp = 300 + Math.floor(Math.random() * 500);

  constructor(type: MobType, host?: EntityHost) {
    super(type, host);
    this.knockbackTaken = 0.7;
  }

  get kind(): WildKind { return this.mobType as WildKind; }
  get maxHealth(): number { return this.caught ? this.spec.health + CAUGHT_BONUS : this.spec.health; }

  /** Chance (0..1) that a Capture Orb holds this creature: better the more hurt it is. */
  catchChance(sneaking = false): number {
    const missing = 1 - Math.max(0, Math.min(1, this.health / this.maxHealth));
    return Math.min(0.95, 0.3 + 0.55 * missing + (sneaking ? 0.1 : 0));
  }

  /** The orb held it. */
  catchNow(host: EntityHost): void {
    this.caught = true;
    this.petOfPlayer = true;
    this.persistent = true;
    this.panic = 0;
    this.sitting = false;
    this.health = this.maxHealth;
    host.effect('heart', this.x, this.y + this.height + 0.3, this.z, 6);
    host.sound(this.spec.sound, this.x, this.y + 0.3, this.z, 0.8, 1.2);
  }

  /** The orb did not hold it: it bolts. */
  breakFree(host: EntityHost): void {
    this.panic = 100;
    host.effect('smoke', this.x, this.y + this.height / 2, this.z, 5);
    host.sound(this.spec.sound, this.x, this.y + 0.3, this.z, 0.6, 0.8);
  }

  feed(host: EntityHost, item: string): WildFeed {
    const heal = WILD_FOOD[item];
    if (!heal || !this.caught || !this.alive) return 'no';
    if (this.health >= this.maxHealth) return 'full';
    this.health = Math.min(this.maxHealth, this.health + heal);
    host.effect('heart', this.x, this.y + this.height + 0.3, this.z, 3);
    host.sound('eat', this.x, this.y + 0.3, this.z, 0.4, 1.6);
    return 'healed';
  }

  toggleSit(host: EntityHost): void {
    this.sitting = !this.sitting;
    this.hasTarget = false;
    host.sound(this.spec.sound, this.x, this.y + 0.3, this.z, 0.5, this.sitting ? 0.9 : 1.2);
  }

  protected onHurt(): void {
    if (this.caught) this.sitting = false;
  }

  private nearestHostile(host: EntityHost, r: number): Mob | null {
    let best: Mob | null = null, bd = r * r;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, r)) {
      if (m === this || !m.alive || !m.spec.hostile || m.removed) continue;
      const d = (m.x - this.x) ** 2 + (m.y - this.y) ** 2 + (m.z - this.z) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Bring a far-behind companion to the player's side. */
  private catchUp(host: EntityHost): void {
    const p = host.player;
    const offs: [number, number][] = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2, 2], [-2, 2], [2, -2], [-2, -2]];
    for (const [ox, oz] of offs) {
      const fx = Math.floor(p.x + ox), fz = Math.floor(p.z + oz);
      if (!host.world.isLoaded(fx, fz)) continue;
      const gy = host.world.highestSolid(fx, fz) + 1;
      if (Math.abs(gy - p.y) > 3) continue;
      this.setPos(p.x + ox, gy, p.z + oz);
      this.vx = this.vy = this.vz = 0;
      this.hasTarget = false;
      host.effect('poof', this.x, this.y + 0.3, this.z, 5);
      return;
    }
  }

  private usePower(host: EntityHost): void {
    const p = host.player;
    if (p.dead) return;
    switch (this.kind) {
      case 'emberling': {
        const m = this.nearestHostile(host, 6);
        if (!m) return;
        if (!m.spec.fireproof) m.fireTicks = Math.max(m.fireTicks, 80);
        host.effect('flame', m.x, m.y + m.height / 2, m.z, 6);
        host.sound('emberling', this.x, this.y + 0.3, this.z, 0.7, 1.4);
        this.power = 240;
        break;
      }
      case 'stormkit': {
        const m = this.nearestHostile(host, 8);
        if (!m) return;
        m.hurt(3, host, m.x - this.x, m.z - this.z, false, this);
        host.effect('crit', m.x, m.y + m.height / 2, m.z, 8);
        host.sound('stormkit', this.x, this.y + 0.3, this.z, 0.8, 1.6);
        this.power = 150;
        break;
      }
      case 'mossback': {
        if (this.distanceTo(p.x, p.y, p.z) > 6 || p.health >= 20) { this.power = 40; return; }
        p.health = Math.min(20, p.health + 2);
        host.effect('heart', p.x, p.y + 1.9, p.z, 3);
        host.sound('mossback', this.x, this.y + 0.3, this.z, 0.5, 1.4);
        this.power = 500;
        break;
      }
    }
  }

  tick(host: EntityHost): void {
    const p = host.player;
    const dP = this.distanceTo(p.x, p.y, p.z);
    if (this.deathTime > 0) { super.tick(host); return; }

    if (!this.caught) {
      // the Ledger notices a creature once you have properly seen it
      if (!this.noticed && this.age % 20 === 0 && dP < 14 && !p.dead) { this.noticed = true; host.wildSeen?.(this.kind); }
      // shy: bolts from a player who isn't creeping
      if (this.age % 10 === 0 && !p.dead && !p.creative && !p.sneaking && dP < 5 && this.panic < 20) this.panic = 50;
      super.tick(host);
      return;
    }

    // ---- a caught Wildling
    if (this.sitting) {
      if (!this.tickCommon(host)) return;
      this.vx *= 0.5; this.vz *= 0.5;
      this.physics(host.world, 0.08, 0.98, 0.546);
      this.animateLimbs();
    } else {
      if (dP > 3.2) { this.targetX = p.x; this.targetZ = p.z; this.hasTarget = true; this.stuckTicks = 0; }
      else if (dP < 2.2) this.hasTarget = false;
      if (dP > 16 && !p.flying) this.catchUp(host);
      super.tick(host);
    }
    if (!this.alive || this.deathTime > 0) return;
    if (this.power > 0) this.power--;
    else if (!this.sitting || this.kind === 'mossback') this.usePower(host);
    if (--this.chirp <= 0) {
      this.chirp = 500 + Math.floor(Math.random() * 700);
      host.sound(this.spec.sound, this.x, this.y + 0.3, this.z, 0.35, 1.1);
    }
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (s && this.caught) s.d = { c: 1, s: this.sitting ? 1 : 0 };
    return s;
  }

  restore(d: Record<string, unknown>): void {
    if (d.c === 1) {
      this.caught = true;
      this.petOfPlayer = true;
      this.persistent = true;
      this.sitting = d.s === 1;
      this.noticed = true;
    }
  }
}
