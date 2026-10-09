import * as THREE from 'three';
import { Entity, EntityHost, Hurtable } from './Entity';
import { MobType, mobModel } from './mobModels';
import { instantiate, BuiltModel } from './BoxModel';
import { IS_LAVA, IS_SOLID, IS_WATER } from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';

interface MobSpec {
  name: string;
  hostile: boolean;
  health: number;
  speed: number;          // movement attribute (blocks/tick scale like the reference game)
  width: number;
  height: number;
  drops: [string, number, number, number?][]; // item, min, max, chance
  xp: [number, number];
  attack?: number;
  ranged?: boolean;
  sound: string;
  burnsInSun?: boolean;   // undead catch fire in daylight
  climbs?: boolean;       // walks up walls
  neutralInLight?: boolean; // ignores the player in bright light unless hit
  hops?: boolean;         // moves in little jumps
  hungerHit?: boolean;    // its hits make the player hungry
  huntsFolk?: boolean;    // attacks villagers too
  folk?: 'villager' | 'sentinel';
  /** 2.0: lava and fire don't hurt it. */
  fireproof?: boolean;
  /** 2.0: glows in the dark (drawn bright, sheds sparks). */
  glows?: boolean;
  /** 2.0: its hits set the player alight for this many ticks. */
  ignites?: number;
  /** 2.0: leaps at its prey from a few blocks away. */
  leaps?: boolean;
  /** 2.0: throws embers instead of shooting arrows (ranged). */
  embers?: boolean;
}

export const MOB_SPECS: Record<MobType, MobSpec> = {
  pig: { name: 'Pig', hostile: false, health: 10, speed: 0.25, width: 0.9, height: 0.9, drops: [['raw_porkchop', 1, 3]], xp: [1, 3], sound: 'pig' },
  cow: { name: 'Cow', hostile: false, health: 10, speed: 0.2, width: 0.9, height: 1.4, drops: [['raw_beef', 1, 3], ['leather', 0, 2]], xp: [1, 3], sound: 'cow' },
  sheep: { name: 'Sheep', hostile: false, health: 8, speed: 0.23, width: 0.9, height: 1.3, drops: [['wool', 1, 1], ['raw_mutton', 1, 2]], xp: [1, 3], sound: 'sheep' },
  chicken: { name: 'Chicken', hostile: false, health: 4, speed: 0.25, width: 0.4, height: 0.7, drops: [['raw_chicken', 1, 1], ['feather', 0, 2]], xp: [1, 3], sound: 'chicken' },
  shambler: { name: 'Shambler', hostile: true, health: 20, speed: 0.23, width: 0.6, height: 1.95, drops: [['spoiled_flesh', 0, 2], ['iron_ingot', 1, 1, 0.025]], xp: [5, 5], attack: 3, sound: 'shambler', burnsInSun: true, huntsFolk: true },
  skeleton: { name: 'Bone Archer', hostile: true, health: 20, speed: 0.25, width: 0.6, height: 1.99, drops: [['bone', 0, 2], ['arrow', 0, 2], ['string', 0, 1]], xp: [5, 5], ranged: true, attack: 2, sound: 'skeleton', burnsInSun: true },
  goat: { name: 'Goat', hostile: false, health: 10, speed: 0.25, width: 0.9, height: 1.3, drops: [['leather', 0, 1], ['raw_mutton', 1, 2]], xp: [1, 3], sound: 'goat' },
  rabbit: { name: 'Rabbit', hostile: false, health: 3, speed: 0.3, width: 0.4, height: 0.5, drops: [['raw_rabbit', 0, 1], ['leather', 0, 1]], xp: [1, 3], sound: 'rabbit', hops: true },
  crawler: { name: 'Crawler', hostile: true, health: 16, speed: 0.3, width: 1.4, height: 0.9, drops: [['string', 0, 2]], xp: [5, 5], attack: 2, sound: 'crawler', climbs: true, neutralInLight: true },
  dustwalker: { name: 'Dustwalker', hostile: true, health: 20, speed: 0.23, width: 0.6, height: 1.95, drops: [['spoiled_flesh', 0, 2], ['iron_ingot', 1, 1, 0.025]], xp: [5, 5], attack: 3, sound: 'dustwalker', hungerHit: true, huntsFolk: true },
  villager: { name: 'Villager', hostile: false, health: 20, speed: 0.25, width: 0.6, height: 1.95, drops: [], xp: [0, 0], sound: 'villager', folk: 'villager' },
  hound: { name: 'Fellhound', hostile: false, health: 8, speed: 0.3, width: 0.6, height: 0.85, drops: [], xp: [1, 3], attack: 4, sound: 'hound' },
  sentinel: { name: 'Sentinel', hostile: false, health: 100, speed: 0.2, width: 1.4, height: 2.6, drops: [['iron_ingot', 3, 5], ['stone_bricks', 1, 3]], xp: [0, 0], attack: 10, sound: 'sentinel', folk: 'sentinel' },
  cinderling: { name: 'Cinderling', hostile: true, health: 10, speed: 0.33, width: 0.5, height: 1.0, drops: [['ember', 0, 1]], xp: [3, 5], attack: 2, sound: 'cinderling', fireproof: true, glows: true, ignites: 60, leaps: true },
  smoulderer: { name: 'Smoulderer', hostile: true, health: 24, speed: 0.2, width: 0.6, height: 2.1, drops: [['ember', 0, 2], ['fire_opal', 1, 1, 0.08]], xp: [8, 8], attack: 3, ranged: true, embers: true, sound: 'smoulderer', fireproof: true, ignites: 40 },
  ashboar: { name: 'Ashboar', hostile: false, health: 20, speed: 0.24, width: 1.1, height: 1.15, drops: [['raw_ashboar', 1, 3], ['leather', 0, 2]], xp: [1, 3], attack: 4, sound: 'ashboar', fireproof: true },
};

const tmpColor = new THREE.Color();
const LEGS_A = ['legFL', 'legBR'];
const LEGS_B = ['legFR', 'legBL'];

/**
 * Voxel creature with cheap AI:
 *  - passive: idle / wander to random reachable spots / panic when hurt,
 *    stepping up single blocks, avoiding drops higher than 3 blocks and swimming.
 *  - hostile: acquire the player (range + occasional line-of-sight ray),
 *    chase and melee, or keep distance and shoot arrows (ranged).
 * AI decisions run at most a few times per second; movement is per tick.
 */
export class Mob extends Entity implements Hurtable {
  readonly type = 'mob';
  readonly mobType: MobType;
  readonly spec: MobSpec;
  health: number;
  hurtTime = 0;
  deathTime = 0;
  invulnerable = 0;
  attackCooldown = 20;
  protected targetX = 0;
  protected targetZ = 0;
  protected hasTarget = false;
  protected stuckTicks = 0;
  protected panic = 0;
  protected headYaw = 0;
  protected headPitch = 0;
  protected lookTimer = 0;
  protected chasing = false;
  protected sawPlayer = false;
  protected losTimer = 0;
  protected burnTicks = 0;
  /** Ticks left of burning after touching lava. */
  fireTicks = 0;
  protected limbPhase = 0;
  protected limbAmount = 0;
  protected prevLimbAmount = 0;
  protected attackAnim = 0;
  protected hopTimer = 0;
  /** Set when a neutral creature is attacked: it fights back regardless of light. */
  protected provoked = false;
  persistent = false;
  /** A tamed companion of the player (its kills count as the player's). */
  petOfPlayer = false;
  /** Current non-player target (villager, Sentinel...) while chasing; null = the player. */
  targetEnt: Mob | null = null;
  /** A creature that hit this one and should be fought back. */
  revengeOn: Mob | null = null;
  /** Part of a night raid: hunts villagers and marches on the village centre. */
  raider: { x: number; z: number } | null = null;
  protected parts: Map<string, THREE.Object3D>;
  protected material: THREE.MeshLambertMaterial;
  protected bow: THREE.Object3D | null = null;
  /** 1.8: ticks left glowing (a village bell was rung nearby): bright, and seen through walls. */
  glowTicks = 0;
  /** 2.0: ticks until a Cinderling may leap again. */
  protected leapCooldown = 0;
  private glowing = false;

  constructor(type: MobType, host?: EntityHost, model?: BuiltModel) {
    super();
    this.mobType = type;
    this.spec = MOB_SPECS[type];
    this.health = this.spec.health;
    this.width = this.spec.width;
    this.height = this.spec.height;
    this.stepHeight = 0.6;
    const inst = instantiate(model ?? mobModel(type));
    this.object.add(inst.root);
    this.parts = inst.parts;
    this.material = inst.material;
    this.yaw = Math.random() * Math.PI * 2;
    if (type === 'skeleton' && host) {
      const { mesh } = host.models.createMesh('bow');
      mesh.scale.setScalar(0.7);
      mesh.rotation.set(0, Math.PI / 2, -Math.PI / 4);
      mesh.position.set(0, -0.55, 0.12);
      this.parts.get('armR')?.add(mesh);
      this.bow = mesh;
    }
  }

  get alive(): boolean {
    return this.deathTime === 0;
  }

  /** Swaps the creature's model (villagers changing job). */
  setModel(model: BuiltModel): void {
    const old = this.object.children[0];
    if (old) this.object.remove(old);
    this.material.dispose();
    const inst = instantiate(model);
    this.object.add(inst.root);
    this.parts = inst.parts;
    this.material = inst.material;
    this.glowing = false;
  }

  /** How strongly knockback moves this creature (0..1). */
  protected knockbackTaken = 1;

  hurt(amount: number, host: EntityHost, kx: number, kz: number, byPlayer: boolean, attacker?: Mob): void {
    if (!this.alive || this.invulnerable > 0) return;
    this.health -= amount;
    this.hurtTime = 10;
    this.invulnerable = 10;
    const kl = Math.hypot(kx, kz) || 1;
    const kb = this.knockbackTaken;
    this.vx += (kx / kl) * 0.4 * kb;
    this.vz += (kz / kl) * 0.4 * kb;
    this.vy = Math.max(this.vy, 0.36 * kb);
    host.sound(this.spec.sound + '_hurt', this.x, this.y + 0.5, this.z, 0.6, 0.9 + Math.random() * 0.3);
    if (attacker && attacker !== this) {
      this.revengeOn = attacker;
      if (this.spec.hostile) this.provoked = true;   // even a calm Crawler fights back
    }
    if (!this.spec.hostile) { this.panic = 60; this.hasTarget = false; }
    else if (byPlayer) { this.chasing = true; this.sawPlayer = true; this.provoked = true; this.targetEnt = null; this.revengeOn = null; }
    this.onHurt(host, byPlayer, attacker);
    if (this.health <= 0) this.die(host, byPlayer || !!attacker?.petOfPlayer);
  }

  /** Hook for subclasses (villagers call the Sentinel, the Sentinel gets angry). */
  protected onHurt(_host: EntityHost, _byPlayer: boolean, _attacker?: Mob): void {}

  /** Line of sight from this creature's eyes to a point. */
  /** Line of sight from the eyes: only solid blocks block it (not grass, crops, torches...). */
  protected canSee(host: EntityHost, x: number, y: number, z: number): boolean {
    const ex = this.x, ey = this.y + this.height * 0.85, ez = this.z;
    const dx = x - ex, dy = y - ey, dz = z - ez;
    const steps = Math.ceil(Math.hypot(dx, dy, dz) * 4);
    let lx = NaN, ly = NaN, lz = NaN;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const bx = Math.floor(ex + dx * t), by = Math.floor(ey + dy * t), bz = Math.floor(ez + dz * t);
      if (bx === lx && by === ly && bz === lz) continue;
      lx = bx; ly = by; lz = bz;
      const b = host.world.getBlock(bx, by, bz);
      if (b !== UNLOADED && IS_SOLID[b]) return false;
    }
    return true;
  }

  /**
   * Picks what a hostile creature fights: the player when seen (and closer), a
   * creature that hurt it, or - for Shamblers, Dustwalkers and raiders - the
   * nearest visible villager (raiders also go for the Sentinel).
   */
  protected acquireTarget(host: EntityHost): void {
    const p = host.player;
    const pOk = !p.dead && !p.creative;
    const dP = pOk ? this.distanceTo(p.x, p.y, p.z) : Infinity;
    const seePlayer = pOk && dP < 16 && this.canSee(host, p.x, p.eyeY, p.z);
    const r = this.revengeOn;
    if (r && (!r.alive || r.removed || this.distanceTo(r.x, r.y, r.z) > 24)) this.revengeOn = null;
    let ent: Mob | null = null, entD = Infinity;
    if (this.revengeOn) { ent = this.revengeOn; entD = this.distanceTo(ent.x, ent.y, ent.z); }
    else if (this.spec.huntsFolk || this.raider) {
      for (const m of host.entities.mobsNear(this.x, this.y, this.z, 16)) {
        if (!m.alive || !m.spec.folk || (m.spec.folk === 'sentinel' && !this.raider)) continue;
        const d = this.distanceTo(m.x, m.y, m.z);
        if (d < entD && this.canSee(host, m.x, m.y + m.height * 0.8, m.z)) { ent = m; entD = d; }
      }
    }
    if (seePlayer && dP <= entD) { this.targetEnt = null; this.chasing = true; this.sawPlayer = true; return; }
    if (ent) { this.targetEnt = ent; this.chasing = true; this.sawPlayer = this.canSee(host, ent.x, ent.y + ent.height * 0.8, ent.z); return; }
    // nobody in sight: keep after the player we were chasing until they are far away
    if (this.chasing && !this.targetEnt && pOk && dP <= 24) { this.sawPlayer = false; return; }
    this.chasing = false;
    this.targetEnt = null;
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    this.deathTime = 1;
    host.sound(this.spec.sound + '_death', this.x, this.y + 0.5, this.z, 0.7, 1);
    host.onMobKilled(this.mobType, byPlayer, this);
    if (!byPlayer && !this.spec.hostile) return;
    for (const [item, min, max, chance] of this.spec.drops) {
      if (chance !== undefined && Math.random() > chance) continue;
      let n = min + Math.floor(Math.random() * (max - min + 1));
      if (byPlayer && chance === undefined) n += Math.floor(Math.random() * (host.plunderLevel() + 1));
      if (n > 0) host.spawnItem({ id: item, count: n }, this.x, this.y + 0.5, this.z);
    }
    if (byPlayer) {
      const [a, b] = this.spec.xp;
      host.spawnXp(a + Math.floor(Math.random() * (b - a + 1)), this.x, this.y + 0.5, this.z);
    }
  }

  protected solidAt(host: EntityHost, x: number, y: number, z: number): boolean {
    return IS_SOLID[host.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
  }

  /** Is the ground ahead safe (no drop > 3 blocks, no water for land animals)? */
  protected safeAhead(host: EntityHost, dx: number, dz: number): boolean {
    const ax = this.x + dx * 0.8, az = this.z + dz * 0.8;
    for (let d = 0; d <= 3; d++) {
      const b = host.world.getBlock(Math.floor(ax), Math.floor(this.y - 1 - d + 0.01), Math.floor(az));
      if (b === UNLOADED) return false;
      if (IS_LAVA[b]) return false;
      if (IS_WATER[b]) return this.spec.hostile;
      if (IS_SOLID[b]) return true;
    }
    return false;
  }

  protected pickWanderTarget(host: EntityHost): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
      const tx = this.x + Math.cos(a) * r, tz = this.z + Math.sin(a) * r;
      if (!host.world.isLoaded(Math.floor(tx), Math.floor(tz))) continue;
      this.targetX = tx; this.targetZ = tz; this.hasTarget = true; this.stuckTicks = 0;
      return;
    }
  }

  /** Per-tick bookkeeping shared by every creature. Returns false while dying. */
  protected tickCommon(host: EntityHost): boolean {
    this.beginTick();
    this.prevLimbAmount = this.limbAmount;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invulnerable > 0) this.invulnerable--;
    if (this.attackAnim > 0) this.attackAnim--;
    if (this.glowTicks > 0) this.glowTicks--;
    if (this.deathTime === 0) this.tickFire(host);
    if (this.deathTime > 0) {
      this.deathTime++;
      this.vx *= 0.5; this.vz *= 0.5;
      this.physics(host.world, 0.08, 0.98, 0.546);
      if (this.deathTime >= 20) {
        this.removed = true;
        host.effect('poof', this.x, this.y + this.height / 2, this.z, 12);
      }
      return false;
    }
    return true;
  }

  /** Lava burns (2 hearts every half second) and sets creatures alight; water or rain puts the fire out. */
  protected tickFire(host: EntityHost): void {
    if (this.spec.fireproof) { this.fireTicks = 0; return; }
    if (this.inLava) {
      this.fireTicks = 160;
      if (this.age % 10 === 0) this.hurt(4, host, 0, 0, false);
    } else if (this.fireTicks > 0) {
      if (this.inWater || host.rainingOn(Math.floor(this.x), Math.floor(this.y + this.height), Math.floor(this.z))) {
        this.fireTicks = 0;
        host.sound('fizz', this.x, this.y + 0.5, this.z, 0.4, 1.2);
        host.effect('smoke', this.x, this.y + this.height * 0.6, this.z, 4);
        return;
      }
      this.fireTicks--;
      if (this.fireTicks % 20 === 0) this.hurt(1, host, 0, 0, false);
    }
    if (this.fireTicks > 0 && this.age % 3 === 0) host.effect('flame', this.x + (Math.random() - 0.5) * this.width, this.y + Math.random() * this.height, this.z + (Math.random() - 0.5) * this.width, 1);
  }

  /** Walking animation from the distance moved this tick. */
  protected animateLimbs(): void {
    const moved = Math.hypot(this.x - this.prevX, this.z - this.prevZ);
    this.limbAmount += (Math.min(1, moved * 4) - this.limbAmount) * 0.4;
    this.limbPhase += moved * 6;
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    let forward = 0;
    let speedMul = 1;
    let wantJump = false;

    // ---- hostile targeting
    const calm = this.spec.neutralInLight && !this.provoked && !this.raider && host.brightnessAt(this.x, this.y + 0.5, this.z) > 0.45;
    if (this.spec.hostile && !calm) {
      if (--this.losTimer <= 0) { this.losTimer = 10; this.acquireTarget(host); }
      if (this.targetEnt && (!this.targetEnt.alive || this.targetEnt.removed)) { this.targetEnt = null; this.chasing = false; }
      if (!this.targetEnt && (p.dead || p.creative)) this.chasing = false;
    } else { this.chasing = false; this.targetEnt = null; }

    if (this.chasing) {
      const te = this.targetEnt;
      const tx = te ? te.x : p.x, ty = te ? te.y : p.y, tz = te ? te.z : p.z;
      const dx = tx - this.x, dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      this.turnTowards(Math.atan2(-dx, -dz), 0.35);
      this.headYaw = 0;
      if (this.spec.ranged) {
        if (dist > 10 || !this.sawPlayer) forward = 1;
        else if (dist < 5) forward = -0.6;
        if (this.attackCooldown <= 0 && this.sawPlayer && dist < 15) {
          this.attackCooldown = host.difficulty === 'hard' ? 25 : 40;
          this.shoot(host, tx, te ? te.y + te.height * 0.6 : p.y + 1.1, tz);
        }
      } else {
        forward = 1;
        const dy = Math.abs(ty - this.y);
        const reach = 1.35 + (te ? te.width / 2 - 0.3 : 0);
        if (dist < reach && dy < 1.5 && this.attackCooldown <= 0) {
          const base = this.spec.attack ?? 2;
          const dmg = host.difficulty === 'easy' ? Math.max(1, base / 2 + 0.5) : host.difficulty === 'hard' ? base * 1.5 : base;
          if (te) te.hurt(dmg, host, dx, dz, false, this);
          else {
            host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'mob', mob: this });
            if (this.spec.hungerHit) p.addExhaustion(3);
            if (this.spec.ignites && !p.creative && !p.dead) p.fireTicks = Math.max(p.fireTicks, this.spec.ignites);
          }
          this.attackCooldown = 20;
          this.attackAnim = 10;
        } else if (this.spec.leaps && this.leapCooldown <= 0 && this.onGround && dist > 1.8 && dist < 5 && dy < 1.5 && this.sawPlayer) {
          // spring at the prey
          this.vy = 0.42;
          this.vx += (dx / dist) * 0.32; this.vz += (dz / dist) * 0.32;
          this.leapCooldown = 50;
          host.sound(this.spec.sound, this.x, this.y + 0.5, this.z, 0.5, 1.3);
        }
      }
      speedMul = 1.1;
    } else if (this.raider) {
      // march on the village
      const dx = this.raider.x - this.x, dz = this.raider.z - this.z;
      if (Math.hypot(dx, dz) > 5) { this.targetX = this.raider.x; this.targetZ = this.raider.z; this.hasTarget = true; this.stuckTicks = Math.min(this.stuckTicks, 40); }
    } else if (this.panic > 0) {
      this.panic--;
      if (!this.hasTarget || this.age % 20 === 0) this.pickWanderTarget(host);
      speedMul = 1.7;
    } else if (!this.hasTarget) {
      if (Math.random() < 1 / 100) this.pickWanderTarget(host);
      else if (this.mobType === 'goat' && this.onGround && Math.random() < 1 / 300) this.vy = 0.62; // goats leap
    }

    if (!this.chasing && this.hasTarget) {
      const dx = this.targetX - this.x, dz = this.targetZ - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6 || this.stuckTicks > 80) this.hasTarget = false;
      else {
        this.turnTowards(Math.atan2(-dx, -dz), 0.25);
        forward = 1;
        speedMul *= this.panic > 0 ? 1 : 0.7;
      }
    }
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.leapCooldown > 0) this.leapCooldown--;

    // ---- obstacle handling
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (forward > 0 && !this.chasing && !this.safeAhead(host, fx, fz)) { forward = 0; this.hasTarget = false; }
    if (this.spec.climbs && forward !== 0 && this.collidedH) {
      this.vy = 0.2; // crawlers scale walls
    } else if (forward !== 0 && this.collidedH && this.onGround) {
      const ax = this.x + fx * (this.width / 2 + 0.3), az = this.z + fz * (this.width / 2 + 0.3);
      const blockedLow = this.solidAt(host, ax, this.y + 0.5, az);
      const blockedHigh = this.solidAt(host, ax, this.y + 1.5, az) || this.solidAt(host, this.x, this.y + this.height + 0.5, this.z);
      if (blockedLow && !blockedHigh) wantJump = true;
      else this.stuckTicks += 10;
    }
    if (forward !== 0) this.stuckTicks++;
    if (this.inWater && IS_WATER[host.world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.6), Math.floor(this.z))] === 1) this.vy += 0.045;

    // ---- movement (reference-game style ground acceleration)
    if (forward !== 0) {
      const accel = (this.onGround ? this.spec.speed * 0.22 : this.spec.speed * 0.05) * speedMul * forward;
      this.vx += fx * accel;
      this.vz += fz * accel;
    }
    if (wantJump) this.vy = 0.42;
    if (this.spec.hops) {
      if (this.hopTimer > 0) this.hopTimer--;
      if (forward !== 0 && this.onGround && this.hopTimer === 0) { this.vy = 0.33; this.hopTimer = 6; }
      if (this.onGround && this.hopTimer > 0) { this.vx *= 0.3; this.vz *= 0.3; }
    }
    this.physics(host.world, 0.08, 0.98, 0.546);

    const moved = Math.hypot(this.x - this.prevX, this.z - this.prevZ);
    this.limbAmount += (Math.min(1, moved * 4) - this.limbAmount) * 0.4;
    this.limbPhase += moved * 6;

    // ---- look around when idle
    if (!this.chasing && --this.lookTimer <= 0) {
      this.lookTimer = 40 + Math.floor(Math.random() * 60);
      const dp = this.distanceTo(p.x, p.y, p.z);
      if (dp < 8 && Math.random() < 0.6) {
        const want = Math.atan2(-(p.x - this.x), -(p.z - this.z)) - this.yaw;
        this.headYaw = Math.max(-1, Math.min(1, wrapAngle(want)));
        this.headPitch = -Math.atan2(p.eyeY - (this.y + this.height), dp) * 0.6;
      } else {
        this.headYaw = (Math.random() - 0.5) * 1.2;
        this.headPitch = (Math.random() - 0.5) * 0.4;
      }
    }

    // ---- glowing creatures shed sparks
    if (this.spec.glows && this.age % 9 === 0) host.effect('flame', this.x + (Math.random() - 0.5) * this.width, this.y + this.height * (0.4 + Math.random() * 0.6), this.z + (Math.random() - 0.5) * this.width, 1);

    // ---- sunlight burns undead
    if (this.spec.burnsInSun && host.isDay() && !this.inWater && host.weatherRain() < 0.3) {
      const light = host.world.getLight(Math.floor(this.x), Math.floor(this.y + this.height), Math.floor(this.z));
      if ((light >> 4) === 15) {
        this.burnTicks++;
        if (this.burnTicks % 4 === 0) host.effect('flame', this.x, this.y + this.height * 0.6, this.z, 1);
        if (this.burnTicks % 20 === 0) this.hurt(1, host, 0, 0, false);
      } else this.burnTicks = 0;
    }
  }

  protected shoot(host: EntityHost, tx: number, ty: number, tz: number): void {
    const sx = this.x, sy = this.y + this.height * 0.8, sz = this.z;
    if (this.spec.embers) {
      // a glowing ember, thrown in a shallow arc
      const dx = tx - sx, dz = tz - sz, dist = Math.hypot(dx, dz);
      const dy = ty - sy + dist * 0.04;
      const l = Math.hypot(dx, dy, dz) || 1, speed = 0.9, spread = host.difficulty === 'hard' ? 0.03 : 0.08;
      host.spawnEmber(sx + (dx / l) * 0.7, sy, sz + (dz / l) * 0.7,
        (dx / l + (Math.random() - 0.5) * spread) * speed, (dy / l) * speed, (dz / l + (Math.random() - 0.5) * spread) * speed, this);
      host.sound('ember_throw', sx, sy, sz, 0.7, 0.9 + Math.random() * 0.2);
      this.attackAnim = 8;
      this.attackCooldown = host.difficulty === 'hard' ? 35 : 55;
      return;
    }
    const dx = tx - sx, dz = tz - sz;
    const dist = Math.hypot(dx, dz);
    const dy = ty - sy + dist * 0.12;
    const l = Math.hypot(dx, dy, dz);
    const spread = host.difficulty === 'hard' ? 0.02 : 0.06;
    const speed = 1.6;
    host.spawnArrow(sx + (dx / l) * 0.6, sy, sz + (dz / l) * 0.6,
      (dx / l + (Math.random() - 0.5) * spread) * speed, (dy / l) * speed, (dz / l + (Math.random() - 0.5) * spread) * speed, false, 2, this);
    host.sound('bow', sx, sy, sz, 0.6, 1.1);
    this.attackAnim = 8;
  }

  protected turnTowards(target: number, rate: number): void {
    const d = wrapAngle(target - this.yaw);
    this.yaw += Math.max(-rate, Math.min(rate, d));
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const yaw = this.prevYaw + wrapAngle(this.yaw - this.prevYaw) * alpha;
    const root = this.object.children[0];
    root.rotation.y = yaw + Math.PI;
    if (this.deathTime > 0) root.rotation.z = Math.min(Math.PI / 2, ((this.deathTime + alpha) / 20) * Math.PI / 2 * 1.6);
    const swing = Math.sin(this.limbPhase) * (this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * alpha) * 0.9;
    const P = this.parts;
    for (const n of LEGS_A) { const o = P.get(n); if (o) o.rotation.x = swing; }
    for (const n of LEGS_B) { const o = P.get(n); if (o) o.rotation.x = -swing; }
    const legL = P.get('legL'), legR = P.get('legR'), armL = P.get('armL'), armR = P.get('armR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL && armR) {
      if (this.mobType === 'shambler') {
        const att = this.attackAnim > 0 ? Math.sin((this.attackAnim / 10) * Math.PI) * 0.6 : 0;
        armL.rotation.x = -Math.PI / 2 + swing * 0.2 - att;
        armR.rotation.x = -Math.PI / 2 - swing * 0.2 - att;
      } else if (this.mobType === 'smoulderer' && this.chasing) {
        const att = this.attackAnim > 0 ? Math.sin((this.attackAnim / 8) * Math.PI) : 0;
        armR.rotation.x = -Math.PI / 2 - att * 0.9;
        armL.rotation.x = -swing * 0.5;
        armL.rotation.y = 0;
      } else if (this.mobType === 'skeleton' && this.chasing) {
        armR.rotation.x = -Math.PI / 2;
        armL.rotation.x = -Math.PI / 2 + 0.2;
        armL.rotation.y = 0.5;
      } else {
        armL.rotation.x = -swing;
        armR.rotation.x = swing;
        armL.rotation.y = 0;
      }
    }
    const wingL = P.get('wingL'), wingR = P.get('wingR');
    if (wingL && wingR) {
      const flap = !this.onGround ? Math.sin((this.age + alpha) * 1.5) * 0.8 + 0.8 : 0;
      wingL.rotation.z = flap; wingR.rotation.z = -flap;
    }
    if (this.mobType === 'crawler') {
      for (let i = 0; i < 8; i++) {
        const leg = P.get(`leg${i}`);
        if (!leg) continue;
        const side = i < 4 ? 1 : -1, k = i % 4;
        const phase = Math.sin(this.limbPhase * 1.4 + k * 1.6 + (side > 0 ? 0 : Math.PI));
        const amt = this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * alpha;
        leg.rotation.z = side * (-0.55 + phase * 0.25 * amt);
        leg.rotation.y = side * ((k - 1.5) * 0.35 + phase * 0.3 * amt);
      }
    }
    if (this.mobType === 'rabbit') {
      const b = P.get('legBL'), c = P.get('legBR');
      const jump = this.onGround ? 0 : -0.8;
      if (b) b.rotation.x = jump; if (c) c.rotation.x = jump;
    }
    const head = P.get('head');
    if (head) { head.rotation.y = this.headYaw; head.rotation.x = this.headPitch; }
    if (this.bow) this.bow.visible = true;

    const b = this.spec.glows ? Math.max(0.92, host.brightnessAt(this.x, this.y + this.height * 0.7, this.z)) : host.brightnessAt(this.x, this.y + this.height * 0.7, this.z);
    tmpColor.setScalar(b);
    if (this.hurtTime > 0 || this.deathTime > 0) tmpColor.setRGB(Math.min(1, b * 1.4 + 0.3), b * 0.45, b * 0.45);
    // glowing (1.8): lit up and drawn over walls, so the player can see where it lurks
    const glow = this.glowTicks > 0 && this.deathTime === 0;
    if (glow !== this.glowing) {
      this.glowing = glow;
      this.material.depthTest = !glow;
      this.material.transparent = glow;
      this.material.opacity = glow ? 0.85 : 1;
      this.object.traverse((o) => { o.renderOrder = glow ? 20 : 0; });
      this.material.needsUpdate = true;
    }
    if (glow) tmpColor.setRGB(Math.max(b, 0.95), Math.max(b, 0.92) * 0.95, Math.max(b, 0.7) * 0.75);
    this.material.color.copy(tmpColor);
  }

  dispose(): void {
    super.dispose();
    this.material.dispose();
    if (this.bow) ((this.bow as THREE.Mesh).material as THREE.Material).dispose();
  }

  serialize(): Record<string, unknown> | null {
    if (!this.alive) return null;
    return { t: 'mob', m: this.mobType, x: this.x, y: this.y, z: this.z, yaw: this.yaw, h: this.health, p: this.persistent || !!this.raider };
  }
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
