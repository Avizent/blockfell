import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { boxTouches, moveBox } from '../player/PlayerPhysics';
import { IS_LAVA, IS_WATER, FLUID_LEVEL } from '../world/BlockRegistry';
import { waterFlow } from '../world/Fluids';
import type { World } from '../world/World';
import type { ItemModels } from '../render/ItemModels';
import { rayBox } from '../interaction/VoxelRaycaster';

export const BOAT_WIDTH = 1.375;
export const BOAT_HEIGHT = 0.5625;
/** How far the bottom of the hull sits below the water surface. */
export const BOAT_DRAFT = 0.3;
/** Rider's feet below the boat's bottom (so the eyes are about a metre above the water). */
export const BOAT_SEAT = -0.35;
/** Rowing: acceleration forwards / backwards and turning speed per tick. */
const ACCEL = 0.035;
const BACK = 0.012;
const TURN = 0.065;
/** Hits that break a boat (hits wear off again over time). */
const HITS_TO_BREAK = 3;

/** Water surface height in a cell column (sources 14/16 of a block, flowing water lower). */
export function waterSurfaceAt(world: World, x: number, y: number, z: number): number | null {
  return surfaceOf(world, x, y, z);
}

function surfaceOf(world: World, x: number, y: number, z: number): number | null {
  const id = world.getBlock(x, y, z);
  if (!IS_WATER[id]) return null;
  if (IS_WATER[world.getBlock(x, y + 1, z)]) return y + 1;
  const l = FLUID_LEVEL[id];
  const h = l <= 0 || l >= 8 ? 14 : Math.max(2, Math.round((14 * (8 - l)) / 8));
  return y + h / 16;
}

let boatTex: THREE.Texture | null = null;
/** Planks texture that repeats along long boards (one tile per block). */
function planks(models: ItemModels): THREE.Texture {
  if (boatTex) return boatTex;
  const t = models.tileTexture('planks').clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  boatTex = t;
  return t;
}

/** A box whose texture repeats once per block of its size instead of stretching. */
function board(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // face order +x, -x, +y, -y, +z, -z: each face's (u, v) span in blocks
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * spans[f][0], uv.getY(i) * spans[f][1]);
  }
  uv.needsUpdate = true;
  return new THREE.Mesh(g, mat);
}

/**
 * A rowing boat. Placed on water from the Boat item; the player climbs in with a
 * right-click (a tap) and rows with W/S (or the joystick forwards/back) and turns
 * with A/D (joystick left/right); Sneak climbs out. It floats at a fixed draft on
 * the water surface (a damped spring), is carried a little by currents, barely
 * moves on land, and breaks into a Boat item after a few hits.
 */
export class Boat extends Entity {
  readonly type = 'boat';
  /** The player is sitting in it. */
  rider = false;
  /** Rowing input while ridden: forward -1..1, turn -1..1 (+ = right). */
  readonly control = { forward: 0, turn: 0 };
  hits = 0;
  wobble = 0;
  /** Over water (the hull is floating). */
  afloat = false;
  private oar = 0;
  private prevOar = 0;
  private hitDecay = 0;
  private mat: THREE.MeshLambertMaterial | null = null;
  private oars: THREE.Group[] = [];
  private lightTimer = 0;

  constructor() {
    super();
    this.width = BOAT_WIDTH;
    this.height = BOAT_HEIGHT;
  }

  /** Water surface under the middle of the boat, or null if it is not over water. */
  waterSurface(world: World): number | null {
    const bx = Math.floor(this.x), bz = Math.floor(this.z);
    for (let cy = Math.floor(this.y + BOAT_DRAFT + 0.7); cy >= Math.floor(this.y - 0.7); cy--) {
      const s = surfaceOf(world, bx, cy, bz);
      if (s !== null) return s;
    }
    return null;
  }

  tick(host: EntityHost): void {
    this.beginTick();
    this.prevOar = this.oar;
    if (this.wobble > 0) this.wobble--;
    if (this.hits > 0 && ++this.hitDecay >= 40) { this.hits--; this.hitDecay = 0; }
    const world = host.world;
    const surf = this.waterSurface(world);
    this.afloat = surf !== null && this.y < surf + 0.2;

    if (this.rider) {
      const c = this.control;
      this.yaw -= c.turn * TURN;
      const acc = c.forward > 0 ? ACCEL * c.forward : BACK * c.forward;
      this.vx += -Math.sin(this.yaw) * acc;
      this.vz += -Math.cos(this.yaw) * acc;
      if (c.forward !== 0 || c.turn !== 0) this.oar += this.afloat ? 0.32 : 0.12;
    }

    let friction: number;
    if (this.afloat) {
      // float at a fixed draft: a damped spring towards the surface
      this.vy += (surf! - BOAT_DRAFT - this.y) * 0.15;
      this.vy *= 0.6;
      const [fx, fz] = waterFlow(world, Math.floor(this.x), Math.floor(surf! - 0.5), Math.floor(this.z));
      this.vx += fx * 0.004;
      this.vz += fz * 0.004;
      friction = 0.9;
    } else {
      this.vy = (this.vy - 0.04) * 0.98;
      friction = this.onGround ? 0.4 : 0.95;   // dragged along the ground it hardly moves
    }

    this.syncBox();
    const ovx = this.vx, ovy = this.vy, ovz = this.vz;
    const [mx, my, mz] = moveBox(world, this.box, ovx, ovy, ovz);
    this.x = (this.box.minX + this.box.maxX) / 2;
    this.y = this.box.minY;
    this.z = (this.box.minZ + this.box.maxZ) / 2;
    this.onGround = ovy < 0 && my !== ovy;
    this.collidedH = mx !== ovx || mz !== ovz;
    if (mx !== ovx) this.vx = 0;
    if (my !== ovy) this.vy = 0;
    if (mz !== ovz) this.vz = 0;
    this.vx *= friction;
    this.vz *= friction;
    if (Math.abs(this.vx) < 1e-4) this.vx = 0;
    if (Math.abs(this.vz) < 1e-4) this.vz = 0;
    if (this.afloat && this.rider && Math.hypot(mx, mz) > 0.05 && this.age % 12 === 0) {
      host.sound('splash', this.x, this.y, this.z, 0.15, 1.6 + Math.random() * 0.3);
    }
    if (!this.rider) { this.control.forward = 0; this.control.turn = 0; }
    if (boxTouches(world, this.box, (b) => IS_LAVA[b] === 1)) {
      // a wooden boat burns up in lava
      this.removed = true;
      host.sound('fizz', this.x, this.y, this.z, 0.7, 0.9);
      host.effect('smoke', this.x, this.y + 0.4, this.z, 14);
      host.effect('flame', this.x, this.y + 0.4, this.z, 8);
    }
  }

  /** A hit from the player: breaks after a few (at once in Creative). Returns true if it broke. */
  hit(creative: boolean): boolean {
    this.wobble = 10;
    this.hits += creative ? HITS_TO_BREAK : 1;
    this.hitDecay = 0;
    return this.hits >= HITS_TO_BREAK;
  }

  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number | null {
    this.syncBox();
    const b = this.box;
    const r = rayBox(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    return r ? r.t : null;
  }

  // ---------------------------------------------------------------- model
  private build(models: ItemModels): void {
    const mat = new THREE.MeshLambertMaterial({ map: planks(models) });
    this.mat = mat;
    const hull = new THREE.Group();
    const L = 2.0, W = 1.3, T = 0.1, H = 0.56;
    const floor = board(W - 2 * T, 0.06, L - 2 * T, mat); floor.position.y = BOAT_DRAFT + 0.05;   // just above the waterline
    const keel = board(W - 2 * T, T, L - 2 * T, mat); keel.position.y = T / 2;
    const left = board(T, H, L, mat); left.position.set(-(W - T) / 2, H / 2, 0);
    const right = board(T, H, L, mat); right.position.set((W - T) / 2, H / 2, 0);
    const stern = board(W - 2 * T, H, T, mat); stern.position.set(0, H / 2, (L - T) / 2);
    const bow = board(W - 2 * T, H + 0.1, T, mat); bow.position.set(0, (H + 0.1) / 2, -(L - T) / 2);
    const prow = board(0.26, 0.2, 0.26, mat); prow.position.set(0, H + 0.12, -(L - 0.26) / 2);
    const seat = board(W - 2 * T, 0.06, 0.34, mat); seat.position.set(0, H - 0.1, 0.25);
    hull.add(floor, keel, left, right, stern, bow, prow, seat);
    // two oars in rowlocks on the gunwales
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (W / 2 + 0.02), H, 0.05);
      const shaft = board(0.06, 0.06, 1.5, mat); shaft.position.set(side * 0.25, 0, 0);
      shaft.rotation.y = side * 1.2;
      const blade = board(0.03, 0.26, 0.4, mat);
      blade.position.set(side * 0.9, 0, 0.35);
      blade.rotation.y = side * 1.2;
      pivot.add(shaft, blade);
      pivot.rotation.z = side * -0.35;
      hull.add(pivot);
      this.oars.push(pivot);
    }
    this.object.add(hull);
    this.lightTimer = 0;
  }

  render(alpha: number, host: EntityHost): void {
    if (!this.mat) this.build(host.models);
    super.render(alpha, host);
    const yaw = this.prevYaw + (this.yaw - this.prevYaw) * alpha;
    this.object.rotation.set(0, yaw, this.wobble > 0 ? Math.sin(this.wobble * 1.3) * this.wobble * 0.012 : 0, 'YXZ');
    const o = this.prevOar + (this.oar - this.prevOar) * alpha;
    this.oars.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      p.rotation.y = Math.sin(o) * 0.5 * side;
      p.rotation.z = side * (-0.35 + Math.cos(o) * 0.12);
    });
    if (this.lightTimer-- <= 0) {
      this.lightTimer = 6;
      this.mat!.color.setScalar(host.brightnessAt(this.x, this.y + 0.7, this.z));
    }
  }

  dispose(): void {
    super.dispose();
    this.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.mat?.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'boat', x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }
}
