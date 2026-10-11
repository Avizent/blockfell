import * as THREE from 'three';
import type { EntityHost } from './Entity';
import { Boat, board, planks } from './Boat';
import { boxTouches, moveBox } from '../player/PlayerPhysics';
import { IS_LAVA, IS_SOLID, SNOW, SNOWY_GRASS } from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';
import type { ItemModels } from '../render/ItemModels';

export const SLEDGE_WIDTH = 0.9;
export const SLEDGE_HEIGHT = 0.35;
/** Rider's feet below the sledge's bottom: sitting, eyes about a metre above the snow. */
export const SLEDGE_SEAT = -0.55;
/** How low it floats (it is wooden). */
const FLOAT_DRAFT = 0.12;
/** Pushing off with your feet: acceleration, and the speed it stops helping at (blocks per tick). */
const PUSH_SNOW = 0.02, PUSH_MAX_SNOW = 0.16;
const PUSH_LAND = 0.012, PUSH_MAX_LAND = 0.07;
const TURN = 0.06;
/** Glide on snow; dragging on anything else. */
const FRICTION_SNOW = 0.985, FRICTION_LAND = 0.62, FRICTION_AIR = 0.99, FRICTION_WATER = 0.85;
/** Dropping down a step turns into speed: this much per block dropped (up to DROP_MAX). */
const DROP_BOOST = 0.075, DROP_MAX = 0.3;
export const SLEDGE_MAX_SPEED = 0.62;

/** Is this block good sledging (snow)? */
export function snowy(b: number): boolean {
  return b === SNOW || b === SNOWY_GRASS;
}

/**
 * SLEDGE (2.3) - the name is in world/names.ts
 * -------------------------------------------
 * Put one down on the ground and right-click (tap) it to sit on it. On snow it
 * glides: push off with W (the joystick forwards) - your feet only help while it
 * is slow - steer with A and D, brake with S. Every step it drops down turns into
 * speed, so a snowy hillside is a fast ride; it hops up one-block steps while it
 * is moving. Off the snow it drags along slowly, and in water it floats. Sneak to
 * climb off; hit it to pick it up (it breaks back into a Sledge item).
 */
export class Sledge extends Boat {
  readonly type = 'sledge';
  readonly itemId = 'sledge';
  readonly seat = SLEDGE_SEAT;
  /** On snow (gliding) this tick. */
  onSnow = false;
  private airFrom: number | null = null;
  private lastSpeed = 0;
  private trim: THREE.MeshLambertMaterial | null = null;

  constructor() {
    super();
    this.width = SLEDGE_WIDTH;
    this.height = SLEDGE_HEIGHT;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  tick(host: EntityHost): void {
    this.beginTick();
    if (this.wobble > 0) this.wobble--;
    if (this.hits > 0 && ++this.hitDecay >= 40) { this.hits--; this.hitDecay = 0; }
    const world = host.world;
    const surf = this.waterSurface(world);
    this.afloat = surf !== null && this.y < surf + 0.1;
    const ground = this.onGround ? this.groundUnder(host) : 'none';
    this.onSnow = ground === 'snow';
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const c = this.control;
    let along = this.vx * fx + this.vz * fz;

    if (this.rider) {
      this.yaw -= c.turn * TURN * (this.speed > 0.25 ? 0.75 : 1);
      if (c.forward > 0 && (this.onGround || this.afloat)) {
        const push = this.onSnow ? PUSH_SNOW : PUSH_LAND, max = this.onSnow ? PUSH_MAX_SNOW : PUSH_MAX_LAND;
        if (along < max) { this.vx += fx * push * c.forward; this.vz += fz * push * c.forward; }
      } else if (c.forward < 0) { this.vx *= 0.88; this.vz *= 0.88; }
    }

    // runners: on the ground it goes the way it points (sideways slip dies away)
    if (this.onGround && !this.afloat) {
      const nfx = -Math.sin(this.yaw), nfz = -Math.cos(this.yaw);
      along = this.vx * nfx + this.vz * nfz;
      const side = (this.vx * -nfz + this.vz * nfx) * 0.45;
      this.vx = nfx * along + -nfz * side;
      this.vz = nfz * along + nfx * side;
    }

    let friction: number;
    if (this.afloat) {
      this.vy += (surf! - FLOAT_DRAFT - this.y) * 0.15;
      this.vy *= 0.6;
      friction = FRICTION_WATER;
    } else {
      this.vy = (this.vy - 0.04) * 0.98;
      friction = ground === 'none' ? FRICTION_AIR : ground === 'snow' ? FRICTION_SNOW : FRICTION_LAND;
    }

    // up a one-block step while moving (or being pushed)
    const moving = this.lastSpeed > 0.04 || (this.rider && c.forward > 0);
    if (this.collidedH && this.onGround && moving) {
      const sp = Math.max(this.lastSpeed, 0.05);
      const dirx = this.speed > 0.01 ? this.vx / this.speed : fx, dirz = this.speed > 0.01 ? this.vz / this.speed : fz;
      const ax = Math.floor(this.x + dirx * (this.width / 2 + 0.3)), az = Math.floor(this.z + dirz * (this.width / 2 + 0.3));
      const y0 = Math.floor(this.y + 0.1);
      const step = world.getBlock(ax, y0, az), above = world.getBlock(ax, y0 + 1, az), above2 = world.getBlock(ax, y0 + 2, az);
      if (step !== UNLOADED && IS_SOLID[step] && !IS_SOLID[above] && !IS_SOLID[above2]) {
        this.vy = 0.46;
        this.vx = dirx * sp * 0.85;
        this.vz = dirz * sp * 0.85;
      }
    }

    this.syncBox();
    const ovx = this.vx, ovy = this.vy, ovz = this.vz;
    const [mx, my, mz] = moveBox(world, this.box, ovx, ovy, ovz);
    this.x = (this.box.minX + this.box.maxX) / 2;
    this.y = this.box.minY;
    this.z = (this.box.minZ + this.box.maxZ) / 2;
    const wasGround = this.onGround;
    this.onGround = ovy < 0 && my !== ovy;
    this.collidedH = mx !== ovx || mz !== ovz;
    if (mx !== ovx) this.vx = 0;
    if (my !== ovy) this.vy = 0;
    if (mz !== ovz) this.vz = 0;
    if (!this.collidedH) this.lastSpeed = Math.hypot(this.vx, this.vz);

    // a drop: the fall becomes speed (downhill is fast) if it lands on snow
    if (!this.onGround && wasGround) this.airFrom = this.y;
    if (!this.onGround && this.airFrom !== null) this.airFrom = Math.max(this.airFrom, this.y);
    if (this.onGround && this.airFrom !== null) {
      const drop = this.airFrom - this.y;
      this.airFrom = null;
      const sp = this.speed;
      if (drop > 0.5 && this.groundUnder(host) === 'snow' && sp > 0.02) {
        const boost = Math.min(DROP_MAX, drop * DROP_BOOST);
        this.vx += (this.vx / sp) * boost;
        this.vz += (this.vz / sp) * boost;
        host.effect('snow', this.x, this.y + 0.1, this.z, 5);
      }
    }

    this.vx *= friction;
    this.vz *= friction;
    const sp = this.speed;
    if (sp > SLEDGE_MAX_SPEED) { this.vx *= SLEDGE_MAX_SPEED / sp; this.vz *= SLEDGE_MAX_SPEED / sp; }
    if (Math.abs(this.vx) < 1e-4) this.vx = 0;
    if (Math.abs(this.vz) < 1e-4) this.vz = 0;

    // snow spraying from the runners, and their swish
    if (this.onSnow && sp > 0.12) {
      if (this.age % 3 === 0) host.effect('snow', this.x - (this.vx / sp) * 0.7, this.y + 0.1, this.z - (this.vz / sp) * 0.7, sp > 0.3 ? 3 : 1);
      if (this.age % 9 === 0) host.sound('sledge', this.x, this.y, this.z, Math.min(0.6, 0.15 + sp), 0.9 + sp * 0.6);
    }
    if (!this.rider) { this.control.forward = 0; this.control.turn = 0; }
    if (boxTouches(world, this.box, (b) => IS_LAVA[b] === 1)) {
      this.removed = true;
      host.sound('fizz', this.x, this.y, this.z, 0.7, 0.9);
      host.effect('smoke', this.x, this.y + 0.3, this.z, 12);
      host.effect('flame', this.x, this.y + 0.3, this.z, 6);
    }
  }

  /**
   * What it rests on: snow (anywhere under it - over a step's edge it is still on
   * the step), something else, or nothing (about to drop off an edge).
   */
  private groundUnder(host: EntityHost): 'snow' | 'other' | 'none' {
    const h = this.width / 2 - 0.02, y = Math.floor(this.y - 0.05);
    let solid = false;
    for (const [dx, dz] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) {
      const b = host.world.getBlock(Math.floor(this.x + dx), y, Math.floor(this.z + dz));
      if (snowy(b)) return 'snow';
      if (b !== UNLOADED && IS_SOLID[b]) solid = true;
    }
    return solid ? 'other' : 'none';
  }

  // ---------------------------------------------------------------- model
  protected build(models: ItemModels): void {
    const mat = new THREE.MeshLambertMaterial({ map: planks(models) });
    const trim = new THREE.MeshLambertMaterial({ color: 0xc23b30 });
    this.mat = mat;
    this.trim = trim;
    const g = new THREE.Group();
    const L = 1.5, W = 0.86;
    // two red runners, curling up at the front
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 0.05);
      const runner = board(0.08, 0.07, L, trim); runner.position.set(x, 0.035, 0.05);
      const curl1 = board(0.08, 0.2, 0.08, trim); curl1.position.set(x, 0.12, -L / 2 + 0.06);
      const curl2 = board(0.08, 0.08, 0.16, trim); curl2.position.set(x, 0.24, -L / 2 + 0.14);
      const post1 = board(0.07, 0.14, 0.07, mat); post1.position.set(x, 0.14, -0.35);
      const post2 = board(0.07, 0.14, 0.07, mat); post2.position.set(x, 0.14, 0.4);
      g.add(runner, curl1, curl2, post1, post2);
    }
    // the deck: three slats across, a board along each side
    for (const z of [-0.42, -0.05, 0.32, 0.62]) {
      const slat = board(W, 0.05, 0.26, mat); slat.position.set(0, 0.235, z);
      g.add(slat);
    }
    // a rope handle at the front
    const rope = board(W - 0.24, 0.04, 0.04, new THREE.MeshLambertMaterial({ color: 0xd8c79a }));
    rope.position.set(0, 0.3, -L / 2 + 0.2);
    g.add(rope);
    this.object.add(g);
    this.lightTimer = 0;
  }

  render(alpha: number, host: EntityHost): void {
    const light = this.lightTimer;
    super.render(alpha, host);
    if (light <= 0 && this.trim && this.mat) this.trim.color.setHex(0xc23b30).multiplyScalar(this.mat.color.r);
  }

  dispose(): void {
    super.dispose();
    this.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== this.mat && m.material !== this.trim) (m.material as THREE.Material).dispose(); });
    this.trim?.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'sledge', x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }
}
