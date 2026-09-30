import { AABB, boxCollides, boxTouches, moveBox } from './PlayerPhysics';
import { World, UNLOADED } from '../world/World';
import { CLIMBABLE, IS_WATER } from '../world/BlockRegistry';

export type GameMode = 'survival' | 'creative';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export interface MoveInput {
  forward: number;   // -1..1
  strafe: number;    // -1..1 (+ = right)
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_STANDING = 1.62;
export const EYE_SNEAKING = 1.27;

/** XP needed to go from `level` to `level + 1` (reference-game curve). */
export function xpForLevel(level: number): number {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}

/**
 * Player state and movement physics. Movement runs in fixed 20 Hz ticks using
 * per-tick constants modelled on the reference game (gravity 0.08, drag 0.98,
 * ground friction 0.546, jump impulse 0.42 ...), which is what makes walking,
 * sprinting, jumping and falling feel familiar. Rendering interpolates between
 * prev* and current positions.
 */
export class Player {
  x = 0; y = 80; z = 0;
  prevX = 0; prevY = 80; prevZ = 0;
  vx = 0; vy = 0; vz = 0;
  yaw = 0; pitch = 0;
  onGround = false;
  inWater = false;
  eyeInWater = false;
  collidedH = false;
  /** Standing in a ladder cell (climb by walking into it or holding jump). */
  onLadder = false;
  flying = false;
  sprinting = false;
  sneaking = false;
  readonly box = new AABB();

  gameMode: GameMode = 'survival';
  health = 20;
  food = 20;
  saturation = 5;
  exhaustion = 0;
  air = 300;
  xpLevel = 0;
  xpProgress = 0;
  xpTotal = 0;
  /** Seed for the Rune Table offers (changes after every inscription). */
  runeSeed = (Math.random() * 0x7fffffff) | 0;
  fallDistance = 0;
  invulnerable = 0;     // ticks of damage immunity
  hurtTime = 0;         // for the camera shake / red flash
  dead = false;
  regenTimer = 0;
  starveTimer = 0;
  drownTimer = 0;
  spawnX = 0.5; spawnY = 80; spawnZ = 0.5;
  /** Foot of the bed the player last used (respawn point), if any. */
  bed: { x: number; y: number; z: number } | null = null;

  eyeHeight = EYE_STANDING;
  prevEyeHeight = EYE_STANDING;
  walkDist = 0;
  prevWalkDist = 0;
  bob = 0;
  prevBob = 0;

  // statistics accumulators (centimetres, like the reference game's stats)
  statWalk = 0; statSprint = 0; statSwim = 0; statFly = 0; statFall = 0; statJumps = 0;
  onLanded?: (fallDistance: number) => void;

  get creative(): boolean {
    return this.gameMode === 'creative';
  }

  setPosition(x: number, y: number, z: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.z = this.prevZ = z;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
    this.syncBox();
  }

  /**
   * Sitting in a boat: the player is carried to (x, y, z) each tick instead of
   * walking (interpolation still runs from the previous position).
   */
  ride(x: number, y: number, z: number): void {
    this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z;
    this.prevEyeHeight = this.eyeHeight;
    this.prevWalkDist = this.walkDist;
    this.prevBob = this.bob;
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
    this.onGround = true;
    this.inWater = false;
    this.eyeInWater = false;
    this.sprinting = false;
    this.sneaking = false;
    this.flying = false;
    this.bob = 0;
    this.eyeHeight += (EYE_STANDING - this.eyeHeight) * 0.5;
    this.syncBox();
  }

  private syncBox(): void {
    AABB.fromFeet(this.x, this.y, this.z, PLAYER_WIDTH, PLAYER_HEIGHT, this.box);
  }

  get eyeY(): number {
    return this.y + this.eyeHeight;
  }

  addExhaustion(n: number): void {
    if (!this.creative) this.exhaustion = Math.min(40, this.exhaustion + n);
  }

  addXp(n: number): void {
    this.xpTotal += n;
    this.xpProgress += n / xpForLevel(this.xpLevel);
    while (this.xpProgress >= 1) {
      this.xpProgress = (this.xpProgress - 1) * xpForLevel(this.xpLevel);
      this.xpLevel++;
      this.xpProgress /= xpForLevel(this.xpLevel);
    }
  }

  private moveRelative(fwd: number, str: number, speed: number): void {
    let len = fwd * fwd + str * str;
    if (len < 1e-4) return;
    len = Math.sqrt(len);
    if (len < 1) len = 1;
    fwd = (fwd / len) * speed;
    str = (str / len) * speed;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    this.vx += -s * fwd + c * str;
    this.vz += -c * fwd - s * str;
  }

  /** Sneaking stops you walking off edges (reference-game behaviour). */
  private backOffFromEdge(world: World): void {
    const step = 0.05;
    const test = (dx: number, dz: number) => {
      const b = this.box.clone().offset(dx, -0.6, dz);
      return boxCollides(world, b);
    };
    let dx = this.vx, dz = this.vz;
    while (dx !== 0 && !test(dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
    while (dz !== 0 && !test(0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    while (dx !== 0 && dz !== 0 && !test(dx, dz)) {
      dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    }
    this.vx = dx;
    this.vz = dz;
  }

  private move(world: World): void {
    const ovx = this.vx, ovy = this.vy, ovz = this.vz;
    const [mx, my, mz] = moveBox(world, this.box, ovx, ovy, ovz, this.onGround && !this.flying ? 0.6 : 0);
    this.x = (this.box.minX + this.box.maxX) / 2;
    this.y = this.box.minY;
    this.z = (this.box.minZ + this.box.maxZ) / 2;
    const wasGround = this.onGround;
    this.onGround = ovy < 0 && my !== ovy;
    this.collidedH = mx !== ovx || mz !== ovz;
    if (mx !== ovx) this.vx = 0;
    if (my !== ovy) this.vy = 0;
    if (mz !== ovz) this.vz = 0;

    // fall tracking
    if (this.onGround) {
      if (this.fallDistance > 0 && !wasGround) this.onLanded?.(this.fallDistance);
      this.fallDistance = 0;
    } else if (my < 0) {
      this.fallDistance -= my;
    }
    const hd = Math.hypot(mx, mz);
    if (this.onGround) this.walkDist += hd * 0.6;
    // statistics
    const cm = Math.hypot(mx, my, mz) * 100;
    if (this.flying) this.statFly += cm;
    else if (this.inWater) this.statSwim += cm;
    else if (this.onGround) { if (this.sprinting) this.statSprint += hd * 100; else this.statWalk += hd * 100; }
    if (this.sprinting && this.onGround) this.addExhaustion(0.1 * hd);
    if (this.inWater) this.addExhaustion(0.01 * cm / 100);
  }

  tickMovement(world: World, input: MoveInput): void {
    this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z;
    this.prevEyeHeight = this.eyeHeight;
    this.prevWalkDist = this.walkDist;
    this.prevBob = this.bob;
    if (this.dead) return;
    // don't simulate inside unloaded chunks: wait for terrain (prevents falling into the void)
    if (world.getBlock(Math.floor(this.x), Math.max(0, Math.floor(this.y)), Math.floor(this.z)) === UNLOADED) return;

    this.syncBox();
    const feet = this.box.clone();
    feet.minY += 0.4; feet.maxY -= 0.4;
    this.inWater = boxTouches(world, feet, (b) => IS_WATER[b] === 1);
    this.eyeInWater = IS_WATER[world.getBlock(Math.floor(this.x), Math.floor(this.y + this.eyeHeight - 0.08), Math.floor(this.z))] === 1;
    if (this.inWater || this.flying) this.fallDistance = 0;

    this.sneaking = input.sneak && !this.flying;
    const targetEye = this.sneaking ? EYE_SNEAKING : EYE_STANDING;
    this.eyeHeight += (targetEye - this.eyeHeight) * 0.5;

    let fwd = input.forward, str = input.strafe;
    if (this.sneaking) { fwd *= 0.3; str *= 0.3; }
    const canSprint = fwd > 0.5 && !this.sneaking && (this.creative || this.food > 6) && !this.eyeInWater;
    if (input.sprint && canSprint) this.sprinting = true;
    if (!canSprint || this.collidedH) this.sprinting = false;
    // tiny residual velocities snap to zero so the player comes fully to rest
    if (Math.abs(this.vx) < 0.003) this.vx = 0;
    if (Math.abs(this.vz) < 0.003) this.vz = 0;
    if (Math.abs(this.vy) < 0.003) this.vy = 0;

    if (this.flying) {
      this.moveRelative(fwd, str, this.sprinting ? 0.1 : 0.05);
      if (input.jump) this.vy += 0.25;
      if (input.sneak) this.vy -= 0.25;
      this.move(world);
      this.vx *= 0.91; this.vz *= 0.91; this.vy *= 0.6;
      if (this.onGround && !input.jump) this.flying = false;
    } else if (this.inWater) {
      this.moveRelative(fwd, str, 0.02);
      if (input.jump) this.vy += 0.04;
      this.move(world);
      this.vx *= 0.8; this.vy *= 0.8; this.vz *= 0.8;
      this.vy -= 0.02;
      if (this.collidedH) {
        const test = this.box.clone().offset(this.vx, this.vy + 0.6, this.vz);
        if (!boxCollides(world, test)) this.vy = 0.3;
      }
    } else {
      if (input.jump && this.onGround) {
        this.vy = 0.42;
        this.statJumps++;
        if (this.sprinting) {
          this.vx += -Math.sin(this.yaw) * 0.2;
          this.vz += -Math.cos(this.yaw) * 0.2;
          this.addExhaustion(0.2);
        } else this.addExhaustion(0.05);
      }
      const speed = this.onGround ? (this.sprinting ? 0.13 : 0.1) : (this.sprinting ? 0.026 : 0.02);
      const friction = this.onGround ? 0.546 : 0.91;
      this.moveRelative(fwd, str, speed);
      this.onLadder = CLIMBABLE[world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] === 1;
      if (this.onLadder) {
        // ladders: slow sideways drift, a gentle slide down, and sneaking holds on
        this.fallDistance = 0;
        this.vx = Math.max(-0.15, Math.min(0.15, this.vx));
        this.vz = Math.max(-0.15, Math.min(0.15, this.vz));
        if (this.vy < -0.15) this.vy = -0.15;
        if (this.sneaking && this.vy < 0) this.vy = 0;
      }
      if (this.sneaking && this.onGround) this.backOffFromEdge(world);
      this.move(world);
      if (this.onLadder && (this.collidedH || input.jump)) this.vy = 0.2;
      this.vy = (this.vy - 0.08) * 0.98;
      this.vx *= friction;
      this.vz *= friction;
    }
    // view bobbing amount follows horizontal speed on the ground
    const hs = Math.min(0.1, Math.hypot(this.x - this.prevX, this.z - this.prevZ));
    this.bob += ((this.onGround && !this.flying ? hs : 0) - this.bob) * 0.4;
    if (this.y < -64) this.y = -64;
  }
}
