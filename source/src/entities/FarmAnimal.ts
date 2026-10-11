import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import type { MobType } from './mobModels';
import { sheepModel } from './mobModels';
import { IS_WATER, GRASS, DIRT } from '../world/BlockRegistry';
import { DYE_COLORS, DYE_MIXES, type DyeColor } from '../world/dyes';

/** 2.3: what each farm animal eats (and is bred with). */
export const FARM_FOOD: Partial<Record<MobType, string[]>> = {
  pig: ['carrot', 'apple'],
  cow: ['wheat'],
  sheep: ['wheat'],
  chicken: ['wheat_seeds'],
};
export const FARM_TYPES: MobType[] = ['pig', 'cow', 'sheep', 'chicken'];
/** A young one grows up in 10 minutes (its food makes it quicker). */
export const FARM_GROW_TICKS = 12000;
const LOVE_TICKS = 600;
/** After having a young one a grown-up waits 5 minutes before it can again. */
export const FARM_BREED_COOLDOWN = 6000;

export type FarmFeed = 'love' | 'grew' | 'no';

/**
 * FARM ANIMALS (2.3): pigs, cows, sheep and chickens.
 *  - Hold their food (pigs: a carrot or an apple; cows and sheep: wheat; chickens: seeds) and
 *    they come to you, so you can lead them home or into a pen.
 *  - Feed two grown-ups of a kind and they have a young one; feed a young one and
 *    it grows up sooner. Young ones follow a grown-up and drop nothing.
 */
export class FarmAnimal extends Mob {
  love = 0;
  breedCooldown = 0;
  /** Ticks until a young one is grown (0 = grown up). */
  childAge = 0;
  private partner: FarmAnimal | null = null;
  private parentRef: FarmAnimal | null = null;
  private tempted = false;

  constructor(type: MobType, host?: EntityHost) {
    super(type, host);
  }

  get isBaby(): boolean {
    return this.childAge > 0;
  }

  get food(): string[] {
    return FARM_FOOD[this.mobType] ?? [];
  }

  makeBaby(ticks = FARM_GROW_TICKS): void {
    this.childAge = Math.max(1, ticks);
    this.width = this.spec.width * 0.55;
    this.height = this.spec.height * 0.55;
  }

  protected growUp(host: EntityHost): void {
    this.childAge = 0;
    this.width = this.spec.width;
    this.height = this.spec.height;
    host.effect('happy', this.x, this.y + 1, this.z, 6);
  }

  /** Right-clicked with its food. */
  feed(host: EntityHost): FarmFeed {
    if (!this.alive) return 'no';
    if (this.isBaby) {
      this.childAge = Math.max(1, this.childAge - Math.floor(FARM_GROW_TICKS / 10));
      host.effect('happy', this.x, this.y + this.height + 0.2, this.z, 5);
      host.sound('eat', this.x, this.y + 0.5, this.z, 0.6, 1.4);
      return 'grew';
    }
    if (this.love > 0 || this.breedCooldown > 0) return 'no';
    this.love = LOVE_TICKS;
    this.panic = 0;
    host.effect('heart', this.x, this.y + this.height + 0.3, this.z, 6);
    host.sound('eat', this.x, this.y + 0.6, this.z, 0.6, 1);
    return 'love';
  }

  protected onHurt(): void {
    this.love = 0;
  }

  /** Steer and accelerate towards a point; returns the horizontal distance. */
  protected moveTo(host: EntityHost, tx: number, tz: number, speedMul: number, stopAt = 0.4): number {
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > stopAt) {
      this.turnTowards(Math.atan2(-dx, -dz), 0.3);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (this.collidedH && this.onGround) {
        const ax = this.x + fx * (this.width / 2 + 0.3), az = this.z + fz * (this.width / 2 + 0.3);
        if (this.solidAt(host, ax, this.y + 0.5, az) && !this.solidAt(host, ax, this.y + 1.5, az)) this.vy = 0.42;
      }
      if (!this.safeAhead(host, fx, fz)) return dist;
      const accel = (this.onGround ? this.spec.speed * 0.22 : this.spec.speed * 0.05) * speedMul;
      this.vx += fx * accel;
      this.vz += fz * accel;
    }
    return dist;
  }

  tick(host: EntityHost): void {
    if (!this.alive) { super.tick(host); return; }
    if (this.childAge > 1) this.childAge--;
    else if (this.childAge === 1) this.growUp(host);
    if (this.breedCooldown > 0) this.breedCooldown--;
    if (this.love > 0) {
      this.love--;
      if (this.age % 12 === 0) host.effect('heart', this.x, this.y + this.height + 0.2, this.z, 1);
    }
    if (this.panic > 0) { super.tick(host); return; }
    if (this.love > 0 && this.findPartner(host)) { this.court(host); return; }
    // the player holding its food: come over (and stop a step away)
    const p = host.player;
    if (this.age % 10 === 0) {
      const held = p.dead ? null : host.heldItem?.() ?? null;
      this.tempted = !!held && this.food.includes(held) && this.distanceTo(p.x, p.y, p.z) < 10;
    }
    if (this.tempted) { this.goTo(host, p.x, p.z, 1.15, 2.2, () => this.turnTowards(Math.atan2(-(p.x - this.x), -(p.z - this.z)), 0.2)); return; }
    // a young one keeps near a grown-up of its kind
    if (this.isBaby) {
      const q = this.findParent(host);
      if (q && this.distanceTo(q.x, q.y, q.z) > 3.5) { this.goTo(host, q.x, q.z, 1.2, 2.5); return; }
    }
    super.tick(host);
  }

  /** One tick of walking towards a point (or, close enough, `whenThere`). */
  private goTo(host: EntityHost, tx: number, tz: number, speedMul: number, stopAt: number, whenThere?: () => void): void {
    if (!this.tickCommon(host)) return;
    const d = this.moveTo(host, tx, tz, speedMul, stopAt);
    if (d <= stopAt) whenThere?.();
    this.hasTarget = false;
    this.swimAndMove(host);
  }

  private findParent(host: EntityHost): FarmAnimal | null {
    const q = this.parentRef;
    if (q && q.alive && !q.removed && !q.isBaby && this.distanceTo(q.x, q.y, q.z) < 16) return q;
    this.parentRef = null;
    if (this.age % 20 !== 0) return null;
    let bd = 12;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 12)) {
      if (!(m instanceof FarmAnimal) || m === this || m.mobType !== this.mobType || !m.alive || m.isBaby) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd) { bd = d; this.parentRef = m; }
    }
    return this.parentRef;
  }

  private findPartner(host: EntityHost): boolean {
    const q = this.partner;
    if (q && q.alive && !q.removed && q.love > 0 && this.distanceTo(q.x, q.y, q.z) < 10) return true;
    this.partner = null;
    if (this.age % 10 !== 0) return false;
    let bd = 8;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, 8)) {
      if (!(m instanceof FarmAnimal) || m === this || m.mobType !== this.mobType || !m.alive || m.isBaby || m.love <= 0) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd) { bd = d; this.partner = m; }
    }
    return !!this.partner;
  }

  /** Walks over to its partner; when they meet, a young one is born. */
  private court(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const q = this.partner!;
    const dist = this.moveTo(host, q.x, q.z, 1.0, 1.0);
    if (dist < 1.4 + this.width / 2 && Math.abs(q.y - this.y) < 1.5 && this.id < q.id) {
      const baby = host.spawnMob?.(this.mobType, (this.x + q.x) / 2, Math.max(this.y, q.y), (this.z + q.z) / 2);
      if (baby instanceof FarmAnimal) {
        baby.makeBaby();
        baby.yaw = this.yaw;
        baby.persistent = true;
        baby.parentRef = this;
        this.inherit(baby, q);
      }
      for (const a of [this, q]) { a.love = 0; a.breedCooldown = FARM_BREED_COOLDOWN; a.partner = null; }
      host.effect('heart', baby?.x ?? this.x, (baby?.y ?? this.y) + 0.6, baby?.z ?? this.z, 8);
      host.spawnXp(1 + Math.floor(Math.random() * 7), this.x, this.y + 0.5, this.z);
      host.sound(this.spec.sound, this.x, this.y + 0.5, this.z, 0.6, 1.4);
      host.animalBred?.(this.mobType);
    }
    this.swimAndMove(host);
  }

  /** What the young one gets from its parents (sheep: the colour of their wool). */
  protected inherit(_baby: FarmAnimal, _other: FarmAnimal): void {}

  protected swimAndMove(host: EntityHost): void {
    if (this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.6), Math.floor(this.z))] === 1) this.vy += 0.045;
    this.physics(host.world, 0.08, 0.98, 0.546);
    this.animateLimbs();
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    if (!this.isBaby) { super.die(host, byPlayer); return; }
    // young ones leave nothing behind
    this.deathTime = 1;
    host.sound(this.spec.sound + '_death', this.x, this.y + 0.4, this.z, 0.6, 1.5);
    host.onMobKilled(this.mobType, byPlayer, this);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const root = this.object.children[0];
    const s = this.isBaby ? 0.55 : 1;
    if (root.scale.x !== s) root.scale.setScalar(s);
    const head = this.parts.get('head');
    if (head) head.scale.setScalar(this.isBaby ? 1.35 : 1);
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, f: this.saveData() };
  }

  protected saveData(): Record<string, unknown> {
    return { child: this.childAge, cool: this.breedCooldown };
  }

  restore(d: Record<string, unknown>): void {
    if (typeof d.child === 'number' && d.child > 0) this.makeBaby(Math.min(FARM_GROW_TICKS, d.child));
    if (typeof d.cool === 'number' && d.cool > 0) this.breedCooldown = Math.min(FARM_BREED_COOLDOWN, d.cool);
  }
}

/** Natural wool colours of new sheep: mostly white, some grey, black or brown, very rarely pink. */
export function naturalWool(): DyeColor {
  const r = Math.random();
  return r < 0.815 ? 'white' : r < 0.865 ? 'light_gray' : r < 0.915 ? 'gray' : r < 0.965 ? 'black' : r < 0.997 ? 'brown' : 'pink';
}

/** Wool grows back about this often (per tick) while a sheared sheep stands on grass. */
const GRAZE_CHANCE = 1 / 700;

export type SheepUse = 'dyed' | 'same' | 'sheared' | 'bare' | 'young' | 'no';

/**
 * SHEEP (2.3): dye one (right-click with a dye) and its wool turns that colour.
 * Shears clip 1-3 wool of its colour; the wool grows back once it has eaten some
 * grass (the grass block it eats turns to dirt; a woolly sheep only nibbles). A lamb gets its parents' colour,
 * or the mix of the two when two dyes would mix (red and yellow: orange).
 */
export class Sheep extends FarmAnimal {
  color: DyeColor = 'white';
  sheared = false;
  private grazing = 0;
  private shownModel = 'sheep:white:0';

  constructor(host?: EntityHost) {
    super('sheep', host);
  }

  setWool(color: DyeColor, sheared: boolean): void {
    this.color = color;
    this.sheared = sheared;
  }

  /** Right-clicked with a dye. */
  dye(host: EntityHost, color: DyeColor): SheepUse {
    if (!this.alive) return 'no';
    if (this.color === color) return 'same';
    this.color = color;
    host.effect('happy', this.x, this.y + this.height, this.z, 6);
    host.sound('place:wool', this.x, this.y + 0.8, this.z, 0.6, 1.2);
    return 'dyed';
  }

  /** Right-clicked with shears: 1-3 wool of its colour. */
  shear(host: EntityHost): SheepUse {
    if (!this.alive) return 'no';
    if (this.isBaby) return 'young';
    if (this.sheared) return 'bare';
    this.sheared = true;
    const n = 1 + Math.floor(Math.random() * 3);
    host.spawnItem({ id: this.color === 'white' ? 'wool' : `${this.color}_wool`, count: n }, this.x, this.y + 0.9, this.z);
    host.sound('shear', this.x, this.y + 0.8, this.z, 0.8, 1);
    host.sound('sheep', this.x, this.y + 0.8, this.z, 0.4, 1.1);
    return 'sheared';
  }

  tick(host: EntityHost): void {
    super.tick(host);
    if (!this.alive) return;
    // grazing: head down for two seconds; a sheared sheep's wool grows back
    if (this.grazing > 0) {
      this.grazing--;
      this.vx *= 0.5; this.vz *= 0.5;
      if (this.grazing === 10) {
        const bx = Math.floor(this.x), by = Math.floor(this.y - 0.01), bz = Math.floor(this.z);
        // (a woolly grown-up only nibbles; a sheared sheep or a lamb eats the grass down to the dirt)
        if (host.world.getBlock(bx, by, bz) === GRASS && (this.sheared || this.isBaby)) {
          host.world.setBlock(bx, by, bz, DIRT, 'mob');
          if (this.sheared) { this.sheared = false; host.effect('happy', this.x, this.y + 1, this.z, 4); }
          if (this.isBaby) this.childAge = Math.max(1, this.childAge - 600);
        }
      }
    } else if (this.onGround && this.panic === 0 && this.love === 0 && Math.random() < (this.sheared ? GRAZE_CHANCE * 2 : GRAZE_CHANCE)) {
      if (host.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.01), Math.floor(this.z)) === GRASS) this.grazing = 40;
    }
  }

  protected inherit(baby: FarmAnimal, other: FarmAnimal): void {
    if (!(baby instanceof Sheep) || !(other instanceof Sheep)) return;
    const a = this.color, b = other.color;
    let c: DyeColor = a;
    if (a !== b) {
      const mix = DYE_MIXES.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
      c = mix ? mix[2] : Math.random() < 0.5 ? a : b;
    }
    baby.setWool(c, false);
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    if (this.isBaby) { super.die(host, byPlayer); return; }
    // the wool (if it has any) is its colour; the meat as usual
    this.deathTime = 1;
    host.sound('sheep_death', this.x, this.y + 0.5, this.z, 0.7, 1);
    host.onMobKilled(this.mobType, byPlayer, this);
    if (!byPlayer) return;
    if (!this.sheared) host.spawnItem({ id: this.color === 'white' ? 'wool' : `${this.color}_wool`, count: 1 }, this.x, this.y + 0.5, this.z);
    const n = 1 + Math.floor(Math.random() * 2) + Math.floor(Math.random() * (host.plunderLevel() + 1));
    host.spawnItem({ id: 'raw_mutton', count: n }, this.x, this.y + 0.5, this.z);
    host.spawnXp(1 + Math.floor(Math.random() * 3), this.x, this.y + 0.5, this.z);
  }

  render(alpha: number, host: EntityHost): void {
    const key = `sheep:${this.color}:${this.sheared ? 1 : 0}`;
    if (key !== this.shownModel) {
      this.shownModel = key;
      this.setModel(sheepModel(this.color, this.sheared));
    }
    super.render(alpha, host);
    const head = this.parts.get('head');
    if (head && this.grazing > 0) head.rotation.x = 0.9;
  }

  protected saveData(): Record<string, unknown> {
    return { ...super.saveData(), color: this.color, sheared: this.sheared };
  }

  restore(d: Record<string, unknown>): void {
    super.restore(d);
    if (typeof d.color === 'string' && (DYE_COLORS as readonly string[]).includes(d.color)) this.color = d.color as DyeColor;
    this.sheared = d.sheared === true;
  }
}
