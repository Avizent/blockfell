import * as THREE from 'three';
import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { IS_WATER } from '../world/BlockRegistry';
import { FISH } from '../inventory/fish';
import { AXOLOTL_COATS, axolotlModel, type AxolotlCoat } from './mobModels';

/**
 * WATER CREATURES (2.13): Axolotl, Squid and Guardian. All three are ORIGINAL designs and they
 * all live and swim in water; out of it they flop about and slowly give up.
 */

/** Is this item a raw fish (what an Axolotl takes from your hand)? */
export function isFishItem(id: string | null | undefined): boolean {
  return !!id && FISH.some((f) => id === `raw_${f.key}`);
}

abstract class Swimmer extends Mob {
  protected tx = 0;
  protected ty = 0;
  protected tz = 0;
  protected goalTimer = 0;
  /** Ticks spent out of the water. */
  protected dry = 0;
  protected soundTimer = 200 + Math.floor(Math.random() * 400);

  protected waterAt(host: EntityHost, x: number, y: number, z: number): boolean {
    return IS_WATER[host.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
  }

  /** Picks a spot to swim to: inside the water and not at the very top. Returns false if none was found. */
  protected pickGoal(host: EntityHost, range: number, vert: number): boolean {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * range;
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      const y = this.y + (Math.random() - 0.5) * 2 * vert + this.height * 0.5;
      if (this.waterAt(host, x, y, z) && this.waterAt(host, x, y + 0.7, z)) {
        this.tx = x; this.ty = y - this.height * 0.5; this.tz = z;
        this.goalTimer = 60 + Math.floor(Math.random() * 120);
        return true;
      }
    }
    this.goalTimer = 20;
    return false;
  }

  /** Steers towards the current goal (or a point) at the given speed; never swims out of the water. */
  protected swimTo(host: EntityHost, x: number, y: number, z: number, sp: number, turn = 0.15): void {
    const dx = x - this.x, dy = y - this.y, dz = z - this.z, d = Math.hypot(dx, dy, dz) || 1;
    this.vx += ((dx / d) * sp - this.vx) * 0.15;
    this.vy += ((dy / d) * sp - this.vy) * 0.15;
    this.vz += ((dz / d) * sp - this.vz) * 0.15;
    if (Math.abs(dx) > 0.15 || Math.abs(dz) > 0.15) this.turnTowards(Math.atan2(-dx, -dz), turn);
    // keep to the water: look a little ahead and turn back if it would be air or the surface
    const ax = this.x + this.vx * 6, az = this.z + this.vz * 6, ay = this.y + this.height * 0.5 + this.vy * 6;
    if (!this.waterAt(host, ax, ay, az) || !this.waterAt(host, ax, ay + this.height * 0.5 + 0.2, az)) {
      this.vx *= 0.3; this.vz *= 0.3; this.vy = Math.min(this.vy, -0.01);
      this.goalTimer = 0;
    }
  }

  /** Out of the water: flop about, and (for the ones that cannot breathe air) slowly suffocate. */
  protected flop(host: EntityHost, suffocate: boolean, after: number): void {
    this.dry++;
    if (this.onGround && this.age % 12 === 0) {
      this.vy = 0.2; this.vx += (Math.random() - 0.5) * 0.14; this.vz += (Math.random() - 0.5) * 0.14;
      this.turnTowards(Math.random() * Math.PI * 2, 0.5);
    }
    if (suffocate && this.dry > after && this.dry % 20 === 0) this.hurt(1, host, 0, 0, false);
  }

  protected moveAndAnimate(host: EntityHost): void {
    this.physics(host.world, this.inWater ? 0 : 0.08, 0.98, 0.546);
    if (this.inWater) this.dry = 0;
    this.animateLimbs();
    if (--this.soundTimer <= 0) {
      this.soundTimer = 300 + Math.floor(Math.random() * 500);
      host.sound(this.spec.sound, this.x, this.y + 0.3, this.z, 0.4, 0.9 + Math.random() * 0.3);
    }
  }
}

// ---------------------------------------------------------------------------------------------

/**
 * AXOLOTL - a smiling pond salamander in five colours (blue is very rare). It paddles about in
 * lakes, rivers and the sea. Hold a raw fish and it swims over; feed it one to mend it.
 * Hurt, it plays dead and heals. It fights hostile creatures that are in the water, and when it
 * finishes one off it grants you a short Mending boost.
 */
export class Axolotl extends Swimmer {
  coat: AxolotlCoat = 'pink';
  playDead = 0;
  private cool = 0;
  private foe: Mob | null = null;
  private tilt = 0;
  private fed = 0;

  constructor(host?: EntityHost) {
    super('axolotl', host);
    this.knockbackTaken = 0.5;
  }

  setCoat(c: AxolotlCoat | number): void {
    const coat = typeof c === 'number' ? AXOLOTL_COATS[Math.max(0, Math.min(AXOLOTL_COATS.length - 1, Math.floor(c)))] : c;
    this.coat = coat;
    this.setModel(axolotlModel(coat));
  }

  /** A raw fish from the player: it is mended by 4 and shows hearts. */
  feed(host: EntityHost): 'fed' | 'full' {
    if (this.health >= this.spec.health && this.fed > 0) return 'full';
    this.health = Math.min(this.spec.health, this.health + 4);
    this.fed++;
    host.effect('heart', this.x, this.y + this.height + 0.2, this.z, 5);
    host.sound('eat', this.x, this.y + 0.3, this.z, 0.4, 1.6);
    return 'fed';
  }

  protected onHurt(_host: EntityHost, _byPlayer: boolean, _attacker?: Mob): void {
    if (this.health > 0 && (this.health < this.spec.health * 0.5 || Math.random() < 0.4)) this.playDead = 240;
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    if (this.cool > 0) this.cool--;
    if (this.playDead > 0) {
      this.playDead--;
      this.vx *= 0.5; this.vz *= 0.5;
      if (this.playDead % 20 === 0) { this.health = Math.min(this.spec.health, this.health + 1); host.effect('heart', this.x, this.y + 0.6, this.z, 1); }
      this.moveAndAnimate(host);
      return;
    }
    if (!this.inWater) {
      this.flop(host, true, 1200);
      this.moveAndAnimate(host);
      return;
    }
    // a hostile creature in the water: go and bite it
    if (this.foe && (!this.foe.alive || this.foe.removed || this.distanceTo(this.foe.x, this.foe.y, this.foe.z) > 12 || !this.foe.inWater)) this.foe = null;
    if (!this.foe && this.age % 10 === 0 && host.difficulty !== 'peaceful') {
      let best = 9;
      for (const m of host.entities.mobsNear(this.x, this.y, this.z, 9)) {
        if (m === this || !m.alive || !m.spec.hostile || !m.inWater) continue;
        const d = this.distanceTo(m.x, m.y, m.z);
        if (d < best) { best = d; this.foe = m; }
      }
    }
    if (this.foe) {
      const f = this.foe, d = this.distanceTo(f.x, f.y + f.height * 0.5, f.z);
      this.swimTo(host, f.x, f.y + f.height * 0.4, f.z, 0.13, 0.3);
      if (d < 1.5 && this.cool <= 0) {
        this.cool = 24; this.attackAnim = 8;
        f.hurt(2, host, f.x - this.x, f.z - this.z, false, this);
        host.sound('axolotl', this.x, this.y + 0.3, this.z, 0.5, 1.5);
        if (!f.alive) { host.axolotlHelped?.(); this.foe = null; }
      }
      this.moveAndAnimate(host);
      return;
    }
    // a raw fish in the player's hand: swim over
    const held = !p.dead ? host.heldItem?.() ?? null : null;
    if (isFishItem(held) && this.distanceTo(p.x, p.y, p.z) < 10 && this.waterAt(host, p.x, p.y + 0.5, p.z)) {
      if (this.distanceTo(p.x, p.y + 0.6, p.z) > 1.6) this.swimTo(host, p.x, p.y + 0.4, p.z, 0.075, 0.25);
      else { this.vx *= 0.6; this.vy *= 0.6; this.vz *= 0.6; this.turnTowards(Math.atan2(-(p.x - this.x), -(p.z - this.z)), 0.2); }
      this.moveAndAnimate(host);
      return;
    }
    // otherwise: paddle about, with a rest every so often
    if (--this.goalTimer <= 0 || (this.collidedH && Math.random() < 0.3)) {
      if (Math.random() < 0.25) { this.tx = this.x; this.ty = this.y; this.tz = this.z; this.goalTimer = 40 + Math.floor(Math.random() * 60); }
      else this.pickGoal(host, 8, 2);
    }
    const d = Math.hypot(this.tx - this.x, this.ty - this.y, this.tz - this.z);
    if (d > 0.6) this.swimTo(host, this.tx, this.ty, this.tz, 0.045);
    else { this.vx *= 0.8; this.vy *= 0.8; this.vz *= 0.8; }
    this.moveAndAnimate(host);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = this.age + alpha;
    this.tilt += ((this.playDead > 0 ? 1.45 : 0) - this.tilt) * 0.12;
    const root = this.object.children[0];
    if (root && this.deathTime === 0) root.rotation.z = this.tilt;
    const tail = this.parts.get('tail');
    if (tail) tail.rotation.y = Math.sin(t * 0.25) * (this.playDead > 0 ? 0.05 : 0.35);
    for (const n of ['gillL1', 'gillL2', 'gillL3']) { const g = this.parts.get(n); if (g) g.rotation.y = Math.sin(t * 0.2 + n.length) * 0.25; }
    for (const n of ['gillR1', 'gillR2', 'gillR3']) { const g = this.parts.get(n); if (g) g.rotation.y = -Math.sin(t * 0.2 + n.length) * 0.25; }
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, ax: AXOLOTL_COATS.indexOf(this.coat) };
  }
}

// ---------------------------------------------------------------------------------------------

/**
 * SQUID - drifts through open water, pulsing along in little jets. Hurt, it blows an ink cloud
 * and jets away. It drops Ink Sacs (black dye). Stranded on land it slowly suffocates.
 */
export class Squid extends Swimmer {
  private jet = 0;
  private jetTimer = 30 + Math.floor(Math.random() * 50);
  private flee = 0;
  private fleeFrom = { x: 0, z: 0 };

  constructor(host?: EntityHost) {
    super('squid', host);
    this.knockbackTaken = 0.4;
  }

  protected onHurt(host: EntityHost, _byPlayer: boolean, attacker?: Mob): void {
    if (this.health <= 0) return;
    const p = host.player;
    this.flee = 50;
    this.fleeFrom = attacker ? { x: attacker.x, z: attacker.z } : { x: p.x, z: p.z };
    this.jet = 12;
    host.effect('smoke', this.x, this.y + this.height * 0.5, this.z, 18);
    host.effect('poof', this.x, this.y + this.height * 0.5, this.z, 6);
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    if (this.jet > 0) this.jet--;
    if (!this.inWater) {
      this.flop(host, true, 120);
      this.moveAndAnimate(host);
      return;
    }
    if (this.flee > 0) {
      this.flee--;
      const dx = this.x - this.fleeFrom.x, dz = this.z - this.fleeFrom.z, d = Math.hypot(dx, dz) || 1;
      this.swimTo(host, this.x + (dx / d) * 6, this.y - 0.5, this.z + (dz / d) * 6, 0.2, 0.4);
      this.moveAndAnimate(host);
      return;
    }
    if (--this.goalTimer <= 0 || (this.collidedH && Math.random() < 0.3)) this.pickGoal(host, 12, 4);
    // glide, then pulse: a jet every second or two
    if (--this.jetTimer <= 0) { this.jetTimer = 30 + Math.floor(Math.random() * 40); this.jet = 12; }
    const sp = this.jet > 0 ? 0.13 : 0.03;
    if (Math.hypot(this.tx - this.x, this.ty - this.y, this.tz - this.z) > 0.8) this.swimTo(host, this.tx, this.ty, this.tz, sp, 0.1);
    else { this.vx *= 0.9; this.vy *= 0.9; this.vz *= 0.9; }
    this.moveAndAnimate(host);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = this.age + alpha;
    const body = this.parts.get('body');
    const k = this.jet > 0 ? Math.sin((this.jet / 12) * Math.PI) : 0;
    if (body) { body.scale.set(1 - k * 0.12, 1 + k * 0.18, 1 - k * 0.12); body.rotation.x = Math.sin(t * 0.07) * 0.05; }
    for (let i = 0; i < 8; i++) {
      const a = this.parts.get(`ten${i}`);
      if (!a) continue;
      const ang = (i / 8) * Math.PI * 2;
      const sway = Math.sin(t * 0.18 + i) * 0.14 - k * 0.5;
      a.rotation.x = Math.sin(ang) * sway; a.rotation.z = -Math.cos(ang) * sway;
    }
  }
}

// ---------------------------------------------------------------------------------------------

export const GUARDIAN_CHARGE = 70;
export const GUARDIAN_RANGE = 14;

/**
 * GUARDIAN - a barnacled shell-fish of the deep sea with a ring of coral spines and one amber
 * eye. It keeps its distance, fixes its eye on you and charges a beam for about three seconds;
 * break its line of sight (swim behind rock) and the charge fails. The beam hurts. Its spines
 * prick anyone who hits it up close. Drops Tide Shards. ORIGINAL design.
 */
export class Guardian extends Swimmer {
  charge = 0;
  private cool = 40;
  private orbit = Math.random() * Math.PI * 2;
  private foeMob: Mob | null = null;
  /** Where the beam is aimed (world position), or null. */
  aim: { x: number; y: number; z: number } | null = null;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;

  constructor(host?: EntityHost) {
    super('guardian', host);
    this.knockbackTaken = 0.3;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.8, depthWrite: false });
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), this.beamMat);
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.object.add(this.beam);
  }

  hurt(amount: number, host: EntityHost, kx: number, kz: number, byPlayer: boolean, attacker?: Mob): void {
    const p = host.player;
    const was = this.alive;
    super.hurt(amount, host, kx, kz, byPlayer, attacker);
    // the spines prick whoever hits it up close
    if (was && byPlayer && !p.dead && !p.creative && host.difficulty !== 'peaceful' && this.distanceTo(p.x, p.y, p.z) < 3.5) {
      host.damagePlayer(2, { x: this.x, y: this.y, z: this.z, kind: 'thorns', mob: this });
    }
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) { this.charge = 0; this.aim = null; return; }
    const p = host.player;
    if (this.cool > 0) this.cool--;
    if (!this.inWater) {
      this.charge = 0; this.aim = null;
      this.flop(host, true, 60);
      this.moveAndAnimate(host);
      return;
    }
    // who to shoot at: the player in range with a clear view, or a creature that hurt it
    let tx = 0, ty = 0, tz = 0, have = false, who: 'player' | 'mob' | null = null;
    const pOk = !p.dead && !p.creative && host.difficulty !== 'peaceful';
    if (pOk && this.distanceTo(p.x, p.y, p.z) < GUARDIAN_RANGE && this.canSee(host, p.x, p.y + 1, p.z)) { tx = p.x; ty = p.y + 1; tz = p.z; have = true; who = 'player'; }
    else {
      const r = this.revengeOn;
      if (r && r.alive && !r.removed && this.distanceTo(r.x, r.y, r.z) < GUARDIAN_RANGE && this.canSee(host, r.x, r.y + r.height * 0.5, r.z)) { this.foeMob = r; tx = r.x; ty = r.y + r.height * 0.5; tz = r.z; have = true; who = 'mob'; }
    }
    if (have && who) {
      this.aim = { x: tx, y: ty, z: tz };
      const d = Math.hypot(tx - this.x, ty - this.y, tz - this.z);
      this.turnTowards(Math.atan2(-(tx - this.x), -(tz - this.z)), 0.3);
      // hold at a distance of 5 to 9, drifting sideways
      this.orbit += 0.03;
      const want = 7;
      const ux = (this.x - tx) / (d || 1), uz = (this.z - tz) / (d || 1);
      const gx = tx + ux * want + Math.cos(this.orbit) * 1.5, gz = tz + uz * want + Math.sin(this.orbit) * 1.5;
      if (this.waterAt(host, gx, this.y + 0.5, gz)) this.swimTo(host, gx, Math.min(this.y, ty + 1), gz, 0.07, 0.3);
      else { this.vx *= 0.8; this.vz *= 0.8; }
      if (this.cool <= 0) {
        if (this.charge === 0) host.sound('guardian_charge', this.x, this.y + 0.5, this.z, 0.7, 1);
        this.charge++;
        if (this.charge >= GUARDIAN_CHARGE) {
          this.charge = 0; this.cool = 40; this.attackAnim = 10;
          host.sound('guardian_beam', this.x, this.y + 0.5, this.z, 0.8, 1);
          host.effect('crit', tx, ty, tz, 8);
          if (who === 'player') {
            const base = this.spec.attack ?? 5;
            const dmg = host.difficulty === 'easy' ? Math.max(1, base / 2 + 0.5) : host.difficulty === 'hard' ? base * 1.5 : base;
            host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'beam', mob: this });
          } else if (this.foeMob && this.foeMob.alive) this.foeMob.hurt(4, host, tx - this.x, tz - this.z, false, this);
        }
      }
    } else {
      this.charge = 0; this.aim = null;
      if (--this.goalTimer <= 0 || (this.collidedH && Math.random() < 0.3)) this.pickGoal(host, 12, 3);
      if (Math.hypot(this.tx - this.x, this.ty - this.y, this.tz - this.z) > 0.8) this.swimTo(host, this.tx, this.ty, this.tz, 0.05);
      else { this.vx *= 0.85; this.vy *= 0.85; this.vz *= 0.85; }
    }
    this.moveAndAnimate(host);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = this.age + alpha;
    const tail = this.parts.get('tail');
    if (tail) tail.rotation.y = Math.sin(t * 0.2) * 0.4;
    const fl = this.parts.get('finL'), fr = this.parts.get('finR');
    if (fl && fr) { const f = Math.sin(t * 0.25) * 0.4; fl.rotation.z = f; fr.rotation.z = -f; }
    // the beam grows from its eye to the target as it charges
    if (this.charge > 0 && this.aim && this.deathTime === 0) {
      const k = Math.min(1, this.charge / GUARDIAN_CHARGE);
      const ey = this.height * 0.6;
      const lx = this.aim.x - this.x, ly = this.aim.y - (this.y + ey), lz = this.aim.z - this.z;
      const L = Math.hypot(lx, ly, lz) || 1, len = L * k;
      this.beam.visible = true;
      this.beam.position.set((lx / L) * len * 0.5, ey + (ly / L) * len * 0.5, (lz / L) * len * 0.5);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(lx / L, ly / L, lz / L));
      this.beam.scale.set(0.5 + k * 1.5, 0.5 + k * 1.5, len);
      this.beamMat.opacity = 0.35 + 0.5 * k;
    } else this.beam.visible = false;
  }

  dispose(): void {
    super.dispose();
    this.beam.geometry.dispose();
    this.beamMat.dispose();
  }
}
