import * as THREE from 'three';
import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { ROOST, PYLONS, ISLAND_TOP } from '../world/Starhollow';
import { drakeModel, DRAKE_SCALE } from './drakeModel';

type Phase = 'circle' | 'bolts' | 'swoop' | 'climb' | 'perch' | 'dying';


/** The Hollowdrake's full health (100 hearts). */
export const DRAKE_HEALTH = 200;
/**
 * THE HOLLOWDRAKE (2.2)
 * ---------------------
 * The Starhollow's guardian. It circles high over its Roost, throws star bolts at
 * the player from afar, swoops down to strike, and now and then lands on the Roost
 * to rest. While any of the four Storm Bells still rings out, a shield of starlight
 * turns every blow aside; ring them all (climb the pylons and use the bells) and it
 * can be hurt. Beaten, it fades into starlight and leaves Star Scales on the Roost
 * (the Starhollow system handles the victory, the exit gate and the End screen).
 * It isn't saved as an entity: the system keeps its health and brings it back.
 */
export class Hollowdrake extends Mob {
  phase: Phase = 'circle';
  /** Set by the Starhollow system: true while any Storm Bell is unrung. */
  shielded = true;
  private phaseTicks = 0;
  private circleAngle = Math.random() * Math.PI * 2;
  private nextAttack = 120;
  private nextPerch = 900;
  private boltsLeft = 0;
  private flap = 0;
  private shieldMesh: THREE.Mesh;
  private shieldMat: THREE.MeshBasicMaterial;
  private pitch = 0;
  private struck = false;
  /** Ticks into the death fade (0 = alive). */
  dyingTicks = 0;

  constructor(host?: EntityHost) {
    super('hollowdrake', host, drakeModel());
    this.health = DRAKE_HEALTH;
    this.persistent = true;
    this.knockbackTaken = 0;
    const root = this.object.children[0];
    root.rotation.order = 'YXZ';
    root.position.y = this.height / 2;
    this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 1), this.shieldMat);
    this.shieldMesh.position.y = this.height / 2;
    this.object.add(this.shieldMesh);
  }

  get maxHealth(): number { return DRAKE_HEALTH; }

  /** Damage it deals, by difficulty (none on Peaceful: it still knocks you about). */
  private dmg(host: EntityHost, base: number): number {
    const d = host.difficulty;
    return d === 'peaceful' ? 0 : d === 'easy' ? base / 2 : d === 'hard' ? base * 1.5 : base;
  }

  hurt(amount: number, host: EntityHost, _kx: number, _kz: number, byPlayer: boolean, attacker?: Mob): void {
    if (!this.alive || this.dyingTicks > 0 || this.invulnerable > 0) return;
    if (attacker === this) return;
    this.invulnerable = 10;
    if (this.shielded) {
      host.effect('star', this.x, this.y + this.height / 2, this.z, 12);
      host.sound('drake_shield', this.x, this.y + 1, this.z, 0.9, 1);
      host.drakeShieldHit?.();
      return;
    }
    // resting on the Roost it takes a heavier beating
    this.health -= amount * (this.phase === 'perch' ? 1.5 : 1);
    this.hurtTime = 10;
    host.sound('drake_hurt', this.x, this.y + 1, this.z, 1, 0.9 + Math.random() * 0.2);
    if (byPlayer && this.phase === 'circle' && Math.random() < 0.5) this.startPhase('swoop');
    if (this.health <= 0) {
      this.health = 0;
      this.dyingTicks = 1;
      this.phase = 'dying';
      host.sound('drake_death', this.x, this.y + 1, this.z, 1, 1);
    }
  }

  private startPhase(ph: Phase): void {
    this.phase = ph;
    this.phaseTicks = 0;
    this.struck = false;
    if (ph === 'bolts') this.boltsLeft = 3;
  }

  /** Fly towards a point: steer the velocity, at most `speed` blocks a tick. */
  private flyTo(tx: number, ty: number, tz: number, speed: number, turn = 0.08): number {
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const s = Math.min(speed, d * 0.25 + 0.05);
    this.vx += ((dx / d) * s - this.vx) * turn;
    this.vy += ((dy / d) * s - this.vy) * turn;
    this.vz += ((dz / d) * s - this.vz) * turn;
    return d;
  }

  tick(host: EntityHost): void {
    this.beginTick();
    this.prevLimbAmount = this.limbAmount;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invulnerable > 0) this.invulnerable--;
    if (this.attackAnim > 0) this.attackAnim--;
    this.phaseTicks++;
    const p = host.player;
    const playerOk = !p.dead && !p.creative;
    const roostY = ROOST.y + 1;

    if (this.phase === 'dying') {
      // rises slowly, shedding starlight, then is gone (the system sees `removed` and celebrates)
      this.dyingTicks++;
      this.vx *= 0.9; this.vz *= 0.9; this.vy = 0.05;
      if (this.dyingTicks % 2 === 0) host.effect('star', this.x + (Math.random() - 0.5) * 5, this.y + Math.random() * 3, this.z + (Math.random() - 0.5) * 5, 4);
      if (this.dyingTicks >= 100) {
        this.removed = true;
        this.deathTime = 1;
        host.onMobKilled(this.mobType, true, this);
      }
    } else if (this.phase === 'perch') {
      // land on the Roost, rest for 8 seconds, bite anyone close in front, then take off
      const d = this.flyTo(ROOST.x + 0.5, roostY, ROOST.z + 0.5, 0.35, 0.15);
      if (d < 0.8) { this.vx = this.vy = this.vz = 0; this.x = ROOST.x + 0.5; this.y = roostY; this.z = ROOST.z + 0.5; }
      if (playerOk && d < 1.5) {
        const dx = p.x - this.x, dz = p.z - this.z;
        this.turnTowards(Math.atan2(-dx, -dz), 0.05);
        if (Math.hypot(dx, dz) < 5 && Math.abs(p.y - this.y) < 3 && this.attackCooldown-- <= 0) {
          host.damagePlayer(this.dmg(host, 5), { x: this.x, y: this.y, z: this.z, kind: 'drake', mob: this });
          this.attackCooldown = 30; this.attackAnim = 12;
          host.sound('drake_roar', this.x, this.y + 1, this.z, 0.8, 1.2);
        }
      }
      if (this.phaseTicks > 220) { this.startPhase('climb'); this.nextPerch = 700 + Math.floor(Math.random() * 500); }
    } else if (this.phase === 'swoop') {
      // dive at the player, strike, and climb away
      const d = this.flyTo(p.x, p.y + 1, p.z, 0.85, 0.12);
      if (playerOk && !this.struck && d < 3) {
        this.struck = true;
        const before = p.health;
        host.damagePlayer(this.dmg(host, 6), { x: this.x, y: this.y, z: this.z, kind: 'drake', mob: this });
        if (p.health <= before) {
          const kx = p.x - this.x, kz = p.z - this.z, l = Math.hypot(kx, kz) || 1;
          p.vx += (kx / l) * 0.9; p.vz += (kz / l) * 0.9; p.vy = Math.max(p.vy, 0.5);
        }
        this.attackAnim = 12;
        host.sound('drake_roar', this.x, this.y + 1, this.z, 1, 1);
        this.startPhase('climb');
      } else if (!playerOk || this.phaseTicks > 140) this.startPhase('climb');
    } else if (this.phase === 'climb') {
      const a = Math.atan2(this.z - ROOST.z, this.x - ROOST.x);
      this.flyTo(ROOST.x + Math.cos(a) * 30, roostY + 24, ROOST.z + Math.sin(a) * 30, 0.6, 0.08);
      if (this.phaseTicks > 60) { this.circleAngle = a; this.startPhase('circle'); }
    } else if (this.phase === 'bolts') {
      // hover and throw three bolts at the player
      this.vx *= 0.92; this.vy *= 0.92; this.vz *= 0.92;
      const dx = p.x - this.x, dz = p.z - this.z;
      this.turnTowards(Math.atan2(-dx, -dz), 0.1);
      if (this.phaseTicks % 14 === 0 && this.boltsLeft > 0 && playerOk) {
        this.boltsLeft--;
        this.attackAnim = 8;
        const hx = this.x - Math.sin(this.yaw) * 5, hz = this.z - Math.cos(this.yaw) * 5, hy = this.y + 1.6;
        const tx = p.x - hx, ty = p.y + 1 - hy, tz = p.z - hz, l = Math.hypot(tx, ty, tz) || 1, sp = 0.9;
        host.spawnStarBolt?.(hx, hy, hz, (tx / l) * sp, (ty / l) * sp, (tz / l) * sp, this, this.dmg(host, 4));
        host.sound('drake_bolt', hx, hy, hz, 0.9, 1);
      }
      if (this.boltsLeft <= 0 && this.phaseTicks > 50) this.startPhase('circle');
    } else {
      // circle high above the Roost; now and then attack, or come down to rest
      this.circleAngle += 0.012;
      const r = 32 + Math.sin(this.age * 0.01) * 6;
      this.flyTo(ROOST.x + Math.cos(this.circleAngle) * r, roostY + 20 + Math.sin(this.age * 0.02) * 4, ROOST.z + Math.sin(this.circleAngle) * r, 0.5, 0.06);
      if (--this.nextPerch <= 0) this.startPhase('perch');
      else if (--this.nextAttack <= 0) {
        this.nextAttack = 140 + Math.floor(Math.random() * 120);
        const dp = this.distanceTo(p.x, p.y, p.z);
        if (playerOk && dp < 90) {
          const near = Math.hypot(p.x - ROOST.x, p.z - ROOST.z) < 60;
          // it never dives at someone up on a pylon (a swoop would throw them off): bolts instead
          const onPylon = p.y > ISLAND_TOP + 8 && PYLONS.some((q) => Math.abs(p.x - q.x - 0.5) < 4 && Math.abs(p.z - q.z - 0.5) < 4);
          this.startPhase(near && !onPylon && Math.random() < 0.55 ? 'swoop' : 'bolts');
        }
      }
    }
    // move (it flies through anything) and face where it is going
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.syncBox();
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.05 && this.phase !== 'bolts' && this.phase !== 'perch') this.turnTowards(Math.atan2(-this.vx, -this.vz), 0.12);
    this.pitch += (Math.max(-0.6, Math.min(0.6, -this.vy * 1.6)) - this.pitch) * 0.15;
    this.flap += this.phase === 'perch' ? 0 : this.phase === 'swoop' ? 0.08 : 0.18;
    // a deep wingbeat now and then
    if (this.age % 90 === 0 && this.phase !== 'perch' && this.distanceTo(p.x, p.y, p.z) < 80) host.sound('drake_wings', this.x, this.y + 1, this.z, 0.7, 0.9);
    if (this.age % 400 === 200 && this.phase === 'circle' && this.distanceTo(p.x, p.y, p.z) < 100) host.sound('drake_roar', this.x, this.y + 1, this.z, 0.8, 0.9);
  }

  render(alpha: number, host: EntityHost): void {
    this.object.position.set(
      this.prevX + (this.x - this.prevX) * alpha,
      this.prevY + (this.y - this.prevY) * alpha,
      this.prevZ + (this.z - this.prevZ) * alpha,
    );
    const root = this.object.children[0];
    const yaw = this.prevYaw + wrapAngle(this.yaw - this.prevYaw) * alpha;
    root.rotation.y = yaw + Math.PI;
    root.rotation.x = this.pitch;
    const P = this.parts;
    const t = this.age + alpha;
    const perched = this.phase === 'perch';
    // standing on the Roost its legs reach down to the floor
    root.position.y = perched ? 14 * DRAKE_SCALE / 16 : this.height / 2;
    const beat = Math.sin(this.flap + alpha * 0.18);
    const wl = P.get('wingL'), wr = P.get('wingR'), tl = P.get('wingTipL'), tr = P.get('wingTipR');
    if (wl && wr && tl && tr) {
      // folded on the Roost; beating in flight
      wl.rotation.z = perched ? 0.9 : beat * 0.55;
      wr.rotation.z = perched ? -0.9 : -beat * 0.55;
      tl.rotation.z = perched ? 2.2 : beat * 0.35 + 0.05;
      tr.rotation.z = perched ? -2.2 : -beat * 0.35 - 0.05;
      wl.rotation.y = perched ? 0.5 : 0; wr.rotation.y = perched ? -0.5 : 0;
    }
    for (const [n, k] of [['tail1', 0], ['tail2', 1], ['tail3', 2]] as const) {
      const o = P.get(n);
      if (o) { o.rotation.y = Math.sin(t * 0.08 - k * 0.7) * 0.22; o.rotation.x = perched ? 0.15 : 0.05 - this.pitch * 0.3; }
    }
    const n1 = P.get('neck1'), n2 = P.get('neck2'), head = P.get('head'), jaw = P.get('jaw');
    if (n1 && n2 && head) {
      const look = perched ? -0.35 : 0.1;
      n1.rotation.x = look; n2.rotation.x = look * 0.6; head.rotation.x = perched ? 0.35 : -this.pitch * 0.5;
    }
    if (jaw) jaw.rotation.x = this.attackAnim > 0 ? Math.sin((this.attackAnim / 12) * Math.PI) * 0.6 : 0.05;
    for (const n of ['hornL', 'hornR']) { const o = P.get(n); if (o) o.rotation.x = -0.45; }
    for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) { const o = P.get(n); if (o) o.rotation.x = perched ? 0 : 0.9; }
    // light: always clearly visible against the stars; red when hurt; fading when beaten
    const b = Math.max(0.75, host.brightnessAt(this.x, this.y + 1, this.z));
    if (this.hurtTime > 0) this.material.color.setRGB(1, b * 0.5, b * 0.5);
    else this.material.color.setScalar(b);
    const fading = this.dyingTicks > 0 ? this.dyingTicks / 100 : 0;
    this.material.transparent = fading > 0;
    this.material.opacity = 1 - fading * 0.85;
    // the shield shimmers while any Storm Bell rings
    this.shieldMesh.visible = this.shielded && this.dyingTicks === 0;
    this.shieldMat.opacity = 0.12 + Math.sin(t * 0.15) * 0.06;
    this.shieldMesh.rotation.y = t * 0.01;
  }

  dispose(): void {
    this.shieldMesh.geometry.dispose();
    this.shieldMat.dispose();
    super.dispose();
  }

  serialize(): Record<string, unknown> | null {
    return null;   // the Starhollow system remembers it
  }
}
