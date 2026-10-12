import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { Boat, board } from './Boat';
import { IS_LAVA, IS_RAIL } from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';
import type { World } from '../world/World';
import { DIR_X, DIR_Z, opposite, railShape } from '../world/rails';
import { boxTouches, moveBox } from '../player/PlayerPhysics';
import type { ItemModels } from '../render/ItemModels';

export const CART_WIDTH = 0.9;
export const CART_HEIGHT = 0.62;
/** The rider's feet above the cart's bottom: standing inside it. */
export const CART_SEAT = 0.05;
/** The rail's surface is 1/16 above its floor; the cart's body rides this much higher still. */
const RAIL_TOP = 1 / 16;
const LIFT = 0.1;
/** Rider's push (blocks per tick per tick) and the speed it stops helping at, on Rail and Boost Rail. */
const PUSH = 0.02, PUSH_MAX = 0.22;
const PUSH_BOOST = 0.035, PUSH_MAX_BOOST = 0.45;
/** Boost Rail: speed gained per tick while rolling over it, and the speed it tops out at. */
const BOOST = 0.05, BOOST_MAX = 0.5;
/** Gravity along a slope. */
const SLOPE_G = 0.012;
/** Top speed (blocks per tick; 0.55 is 11 blocks a second). */
export const CART_MAX_SPEED = 0.55;
const FRICTION_RIDDEN = 0.997, FRICTION_EMPTY = 0.994;

/** One rail piece as the cart sees it. */
interface Piece { a: number; b: number; rise: number; kind: number }

function pieceAt(world: World, x: number, y: number, z: number): Piece | null {
  const id = world.getBlock(x, y, z);
  const kind = IS_RAIL[id];
  if (!kind) return null;
  const s = railShape((dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), kind);
  return { a: s.a, b: s.b, rise: s.rise, kind };
}

/**
 * MINECART (2.4)
 * --------------
 * Put it on a Rail and right-click (tap) it to climb in. It follows the track: a
 * parameter t (0 to 1) runs along the rail piece from its first end to its second,
 * through the middle of the cell, and carries over into the next piece. It rolls
 * freely with a little friction; slopes pull it downhill; a Boost Rail speeds it up;
 * a Station Rail brings it to a stop. W pushes (a little, or harder on a Boost
 * Rail), S brakes and, once stopped, rolls it backwards. It stops at the end of the
 * track; if the rail under it is broken it drops and runs on until it lands on a
 * rail again. Sneak climbs out; hit it to pick it up.
 */
export class Minecart extends Boat {
  readonly type = 'minecart';
  readonly itemId = 'minecart';
  readonly seat = CART_SEAT;
  /** Running on a rail (otherwise falling or rolling free). */
  onRail = false;
  cx = 0; cy = 0; cz = 0;
  /** Where along the piece (0..1) and the signed speed along it (+ = towards the second end). */
  t = 0.5;
  v = 0;
  /** +1: the nose points towards the piece's second end; -1: the first. */
  nose = 1;
  /** Which way the rider is looking (set by the game each tick): from a standstill, W sets off that way. */
  riderYaw: number | null = null;
  private piece: Piece | null = null;
  private stationHold = 0;
  pitch = 0; prevPitch = 0;
  private hitDelay = 0;
  /** Blocks rolled while ridden (for the stat), and the last speed (for the bump). */
  lastSpeed = 0;
  private body: THREE.MeshLambertMaterial | null = null;
  private trim: THREE.MeshLambertMaterial | null = null;
  private wheels: THREE.Object3D[] = [];
  private spin = 0;

  constructor() {
    super();
    this.width = CART_WIDTH;
    this.height = CART_HEIGHT;
  }

  /** Rolling over a Boost Rail right now. */
  get onBoostRail(): boolean {
    return this.onRail && this.piece?.kind === 2;
  }

  get speed(): number {
    return this.onRail ? Math.abs(this.v) : Math.hypot(this.vx, this.vz);
  }

  // ------------------------------------------------------------------ placing and finding the rail
  /** Puts the cart on the rail piece in this cell, facing as near to `yaw` as the track allows. */
  placeOn(world: World, cx: number, cy: number, cz: number, yaw: number): boolean {
    const p = pieceAt(world, cx, cy, cz);
    if (!p) return false;
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.piece = p;
    this.t = 0.5;
    this.v = 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ex = DIR_X[p.b] - DIR_X[p.a], ez = DIR_Z[p.b] - DIR_Z[p.a];
    this.nose = fx * ex + fz * ez >= 0 ? 1 : -1;
    this.onRail = true;
    this.updateFromTrack(true);
    this.yaw = this.prevYaw = this.targetYaw();
    return true;
  }

  /** The rail piece (if any) under a loose cart; joins it. */
  private tryAttach(world: World): boolean {
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    for (const cy of [Math.floor(this.y + 0.2), Math.floor(this.y + 0.2) - 1]) {
      const p = pieceAt(world, fx, cy, fz);
      if (!p) continue;
      const top = cy + RAIL_TOP + 1;                    // highest the track gets in this cell
      if (this.y > top + 0.3 || this.y < cy - 0.1) continue;
      this.cx = fx; this.cy = cy; this.cz = fz;
      this.piece = p;
      // the point along the piece nearest to us
      let best = 0.5, bd = Infinity;
      for (let i = 0; i <= 20; i++) {
        const [px, , pz] = this.at(p, i / 20);
        const d = (px - this.x) ** 2 + (pz - this.z) ** 2;
        if (d < bd) { bd = d; best = i / 20; }
      }
      this.t = best;
      const [tx, tz] = this.tangent(p, best);
      const along = this.vx * tx + this.vz * tz;
      this.v = Math.max(-CART_MAX_SPEED, Math.min(CART_MAX_SPEED, along));
      if (Math.abs(this.v) > 0.03) this.nose = this.v > 0 ? 1 : -1;
      this.onRail = true;
      return true;
    }
    return false;
  }

  /** Position (x, y, z) at parameter t of a piece in this cell. */
  private at(p: Piece, t: number): [number, number, number] {
    const ax = this.cx + 0.5 + DIR_X[p.a] * 0.5, az = this.cz + 0.5 + DIR_Z[p.a] * 0.5;
    const bx = this.cx + 0.5 + DIR_X[p.b] * 0.5, bz = this.cz + 0.5 + DIR_Z[p.b] * 0.5;
    const mx = this.cx + 0.5, mz = this.cz + 0.5;
    const ha = p.rise === p.a ? 1 : 0, hb = p.rise === p.b ? 1 : 0, hm = (ha + hb) / 2;
    let x: number, z: number, h: number;
    if (t <= 0.5) { const f = t * 2; x = ax + (mx - ax) * f; z = az + (mz - az) * f; h = ha + (hm - ha) * f; }
    else { const f = (t - 0.5) * 2; x = mx + (bx - mx) * f; z = mz + (bz - mz) * f; h = hm + (hb - hm) * f; }
    return [x, this.cy + RAIL_TOP + LIFT + h, z];
  }

  /** Unit direction of travel (horizontal) in the direction of increasing t. */
  private tangent(p: Piece, t: number): [number, number] {
    const first = t < 0.5;
    const x0 = first ? DIR_X[p.a] * 0.5 : 0, z0 = first ? DIR_Z[p.a] * 0.5 : 0;
    const x1 = first ? 0 : DIR_X[p.b] * 0.5, z1 = first ? 0 : DIR_Z[p.b] * 0.5;
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  private targetYaw(): number {
    if (!this.piece) return this.yaw;
    const [tx, tz] = this.tangent(this.piece, this.t);
    const hx = tx * this.nose, hz = tz * this.nose;
    return Math.atan2(-hx, -hz);
  }

  private updateFromTrack(snap = false): void {
    const p = this.piece!;
    const [x, y, z] = this.at(p, this.t);
    this.x = x; this.y = y; this.z = z;
    this.onGround = true;
    // slope tilt: nose up when heading towards the high end
    const headEnd = this.nose > 0 ? p.b : p.a;
    this.pitch = p.rise < 0 ? 0 : p.rise === headEnd ? 0.62 : -0.62;
    if (snap) this.prevPitch = this.pitch;
    const [tx, tz] = this.tangent(p, this.t);
    this.vx = tx * this.v; this.vz = tz * this.v;
    this.vy = 0;
  }

  // ------------------------------------------------------------------ the tick
  tick(host: EntityHost): void {
    this.beginTick();
    this.prevPitch = this.pitch;
    if (this.wobble > 0) this.wobble--;
    if (this.hits > 0 && ++this.hitDecay >= 40) { this.hits--; this.hitDecay = 0; }
    if (this.hitDelay > 0) this.hitDelay--;
    if (this.stationHold > 0) this.stationHold--;
    const world = host.world;
    this.afloat = false;

    if (!this.onRail) this.tickFree(host);
    if (this.onRail) this.tickRail(host);
    this.syncBox();
    this.lastSpeed = this.speed;

    if (!this.rider) { this.control.forward = 0; this.control.turn = 0; }
    // wheels turn with the distance rolled
    if (this.onRail) this.spin += this.v * 2.2;
    if (boxTouches(world, this.box, (b) => IS_LAVA[b] === 1)) {
      this.removed = true;
      host.sound('fizz', this.x, this.y, this.z, 0.7, 0.9);
      host.effect('smoke', this.x, this.y + 0.4, this.z, 14);
    }
    // rolling noise
    if (this.onRail && Math.abs(this.v) > 0.06 && this.age % Math.max(3, Math.round(2.2 / (Math.abs(this.v) * 10 + 1) * 4)) === 0) {
      host.sound('rail', this.x, this.y, this.z, Math.min(0.5, 0.12 + Math.abs(this.v)), 0.8 + Math.abs(this.v) * 1.2);
    }
  }

  /** Off the rails: fall and slide until we land on one. */
  private tickFree(host: EntityHost): void {
    const world = host.world;
    if (this.tryAttach(world)) return;
    this.vy = (this.vy - 0.04) * 0.98;
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
    const f = this.onGround ? 0.7 : 0.99;
    this.vx *= f; this.vz *= f;
    this.pitch = 0;
    if (this.tryAttach(world)) return;
  }

  private tickRail(host: EntityHost): void {
    const world = host.world;
    let p = pieceAt(world, this.cx, this.cy, this.cz);
    if (!p) { this.derail(); return; }
    this.piece = p;
    const c = this.control;
    const riding = this.rider;
    const boost = p.kind === 2;

    // ---- the rider
    if (riding) {
      if (c.forward > 0 && Math.abs(this.v) < 0.03 && this.riderYaw !== null) {
        const [tx, tz] = this.tangent(p, this.t);
        this.nose = tx * -Math.sin(this.riderYaw) + tz * -Math.cos(this.riderYaw) >= 0 ? 1 : -1;
      }
      if (c.forward > 0) {
        const cap = boost ? PUSH_MAX_BOOST : PUSH_MAX;
        if (this.nose * this.v < cap) this.v += this.nose * (boost ? PUSH_BOOST : PUSH) * c.forward;
        if (p.kind === 3 && Math.abs(this.v) < 0.03) { this.v = this.nose * 0.07; this.stationHold = 16; }
      } else if (c.forward < 0) {
        if (Math.abs(this.v) > 0.03) this.v *= 0.88;
        else this.v -= this.nose * 0.012;
      }
    }
    // ---- slopes pull downhill (a Station Rail holds the cart)
    if (p.rise >= 0 && p.kind !== 3) this.v += p.rise === p.b ? -SLOPE_G : SLOPE_G;
    // ---- special rails
    if (boost) {
      const sp = Math.abs(this.v);
      if (sp > 0.02 || (riding && c.forward > 0)) {
        const dir = sp > 0.02 ? Math.sign(this.v) : this.nose;
        if (sp < BOOST_MAX) { this.v += dir * BOOST; if (this.age % 4 === 0) host.effect('flame', this.x, this.y + 0.1, this.z, 1); }
      }
    } else if (p.kind === 3 && this.stationHold <= 0) {
      if (Math.abs(this.v) > 0.02) { this.v *= 0.72; if (Math.abs(this.v) <= 0.02) this.v = 0; }
      else this.v = 0;
    }
    this.v *= riding ? FRICTION_RIDDEN : FRICTION_EMPTY;
    if (Math.abs(this.v) < 0.0008) this.v = 0;
    this.v = Math.max(-CART_MAX_SPEED, Math.min(CART_MAX_SPEED, this.v));
    if (Math.abs(this.v) > 0.04) this.nose = this.v > 0 ? 1 : -1;

    // ---- along the track, over into the next piece when it runs out
    this.t += this.v;
    let guard = 0;
    while ((this.t > 1 || this.t < 0) && guard++ < 6) {
      const forward = this.t > 1;
      const over = forward ? this.t - 1 : -this.t;
      const exit = forward ? p.b : p.a;
      const nxt = this.nextPiece(world, exit, p);
      if (!nxt) {
        // the end of the line: stop at the buffer
        if (Math.abs(this.v) > 0.1) host.sound('thud', this.x, this.y, this.z, 0.5, 0.8);
        this.t = forward ? 1 : 0;
        this.v = 0;
        break;
      }
      if (nxt === 'unloaded') { this.t = forward ? 1 : 0; this.v = 0; break; }
      this.cx = nxt.cx; this.cy = nxt.cy; this.cz = nxt.cz;
      p = nxt.piece;
      this.piece = p;
      const speed = Math.abs(this.v);
      if (nxt.entry === p.a) { this.t = over; this.v = speed; } else { this.t = 1 - over; this.v = -speed; }
      if (p.kind === 3 && speed > 0.05) this.stationHold = 0;
    }
    this.updateFromTrack();
    // turn to follow the track (smoothly round curves)
    let dy = this.targetYaw() - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * 0.4;
    this.onGround = true;
  }

  /** The piece a cart leaving through end `exit` of `from` runs onto, 'unloaded', or null (no connecting rail). */
  private nextPiece(world: World, exit: number, from: Piece): { cx: number; cy: number; cz: number; piece: Piece; entry: number } | 'unloaded' | null {
    const nx = this.cx + DIR_X[exit], nz = this.cz + DIR_Z[exit];
    const entry = opposite(exit);
    const ys = from.rise === exit ? [this.cy + 1] : [this.cy, this.cy - 1];
    for (const y of ys) {
      const id = world.getBlock(nx, y, nz);
      if (id === UNLOADED) return 'unloaded';
      const piece = pieceAt(world, nx, y, nz);
      if (!piece) continue;
      if (piece.a === entry || piece.b === entry) return { cx: nx, cy: y, cz: nz, piece, entry };
      return null;
    }
    return null;
  }

  /** The rail under us is gone: carry on freely with the speed we had. */
  private derail(): void {
    this.onRail = false;
    this.piece = null;
    this.onGround = false;
    this.vy = 0.02;
  }

  // ------------------------------------------------------------------ hits
  hit(creative: boolean): boolean {
    if (this.hitDelay > 0) return false;
    this.hitDelay = 4;
    return super.hit(creative);
  }

  // ------------------------------------------------------------------ model
  protected build(models: ItemModels): void {
    void models;
    const body = new THREE.MeshLambertMaterial({ color: 0xaeb2c2 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x5c6072 });
    this.body = body; this.trim = trim;
    this.mat = body;
    const g = new THREE.Group();
    const W = 0.84, L = 1.0, H = 0.46, T = 0.07;
    const floor = board(W - 2 * T, 0.06, L - 2 * T, trim); floor.position.y = 0.17;
    const left = board(T, H, L, body); left.position.set(-(W - T) / 2, 0.17 + H / 2, 0);
    const right = board(T, H, L, body); right.position.set((W - T) / 2, 0.17 + H / 2, 0);
    const back = board(W - 2 * T, H, T, body); back.position.set(0, 0.17 + H / 2, (L - T) / 2);
    const front = board(W - 2 * T, H, T, body); front.position.set(0, 0.17 + H / 2, -(L - T) / 2);
    const rimL = board(T + 0.04, 0.05, L + 0.04, trim); rimL.position.set(-(W - T) / 2, 0.17 + H, 0);
    const rimR = board(T + 0.04, 0.05, L + 0.04, trim); rimR.position.set((W - T) / 2, 0.17 + H, 0);
    const rimB = board(W, 0.05, T + 0.04, trim); rimB.position.set(0, 0.17 + H, (L - T) / 2);
    const rimF = board(W, 0.05, T + 0.04, trim); rimF.position.set(0, 0.17 + H, -(L - T) / 2);
    g.add(floor, left, right, back, front, rimL, rimR, rimB, rimF);
    // four rivets on each side, to look riveted
    for (const side of [-1, 1]) for (const z of [-0.3, 0, 0.3]) {
      const r = board(0.03, 0.05, 0.05, trim); r.position.set(side * (W / 2 + 0.005), 0.17 + H * 0.5, z); g.add(r);
    }
    // wheels: short discs on two axles
    for (const side of [-1, 1]) for (const z of [-0.32, 0.32]) {
      const wheel = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), trim);
      disc.rotation.z = Math.PI / 2;
      const spoke = board(0.07, 0.04, 0.2, body);
      wheel.add(disc, spoke);
      wheel.position.set(side * (W / 2 - 0.02), 0.1, z);
      g.add(wheel);
      this.wheels.push(wheel);
    }
    this.object.add(g);
    this.lightTimer = 0;
  }

  render(alpha: number, host: EntityHost): void {
    if (!this.mat) this.build(host.models);
    Entity.prototype.render.call(this, alpha, host);
    const yaw = this.prevYaw + (this.yaw - this.prevYaw) * alpha;
    const pitch = this.prevPitch + (this.pitch - this.prevPitch) * alpha;
    const shake = this.rider && this.onRail && Math.abs(this.v) > 0.2 ? Math.sin(this.age * 1.7) * 0.004 * Math.abs(this.v) * 10 : 0;
    this.object.rotation.set(pitch, yaw, (this.wobble > 0 ? Math.sin(this.wobble * 1.3) * this.wobble * 0.012 : 0) + shake, 'YXZ');
    for (const w of this.wheels) w.rotation.x = this.spin;
    if (this.lightTimer-- <= 0) {
      this.lightTimer = 6;
      const br = host.brightnessAt(this.x, this.y + 0.6, this.z);
      this.body!.color.setHex(0xaeb2c2).multiplyScalar(br);
      this.trim!.color.setHex(0x5c6072).multiplyScalar(br);
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.body?.dispose();
    this.trim?.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'minecart', x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }
}
