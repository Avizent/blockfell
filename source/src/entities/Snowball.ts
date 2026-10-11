import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import type { Mob } from './Mob';
import { IS_FLUID } from '../world/BlockRegistry';

const GEO = new THREE.BoxGeometry(0.24, 0.24, 0.24);
const BITS = new THREE.BoxGeometry(0.14, 0.14, 0.3);

/** Damage a snowball does: none to most creatures (it just knocks them back), more to fire creatures. */
export function snowballDamage(target: Mob, fromPlayer: boolean): number {
  if (target.spec.fireproof && target.spec.hostile) return 3;
  return fromPlayer ? 0 : 1;
}

/**
 * SNOWBALL (2.3): thrown by the player (right-click with snowballs) or by a Snow Pal.
 * It flies in an arc and bursts into a puff of snow on whatever it hits. A
 * snowball knocks a creature back but doesn't hurt it - except creatures of fire
 * (Cinderlings and Smoulderers take 3), and a Snow Pal's snowballs sting a
 * little (1). It puts out a creature that is on fire. Snowballs never hurt the
 * player, and they fly past the player's pets and Snow Pals.
 */
export class Snowball extends Entity {
  readonly type = 'snowball';
  /** Thrown by a creature (a Snow Pal); null = by the player. */
  shooter: Mob | null = null;
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    const ball = new THREE.Mesh(GEO, this.mat);
    const bits = new THREE.Mesh(BITS, this.mat);
    this.object.add(ball, bits);
  }

  get fromPlayer(): boolean {
    return this.shooter === null;
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const speed = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
    // creatures along this tick's flight
    const hit = this.age > 0 ? host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed) : null;
    // (the player's snowballs, and a Snow Pal's, fly past the player's own creatures)
    if (hit && hit.mob !== this.shooter && !hit.mob.petOfPlayer) {
      const m = hit.mob;
      const at = { x: this.x + dx * hit.t, y: this.y + dy * hit.t, z: this.z + dz * hit.t };
      if (m.spec.folk) {
        // villagers and Sentinels just get a nudge
        m.vx += dx * 0.25; m.vz += dz * 0.25; m.vy = Math.max(m.vy, 0.2);
      } else {
        m.hurt(snowballDamage(m, this.fromPlayer), host, dx, dz, this.fromPlayer, this.shooter ?? undefined);
      }
      if (m.fireTicks > 0 && !m.spec.fireproof) m.fireTicks = 0;
      this.burst(host, at.x, at.y, at.z);
      return;
    }
    const box = new AABB(this.x - 0.1, this.y - 0.1, this.z - 0.1, this.x + 0.1, this.y + 0.1, this.z + 0.1);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz || this.inFluid(host)) { this.burst(host, this.x, this.y, this.z); return; }
    this.vx *= 0.99; this.vy = this.vy * 0.99 - 0.03; this.vz *= 0.99;
    if (this.age > 200) this.removed = true;
  }

  private inFluid(host: EntityHost): boolean {
    return IS_FLUID[host.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] === 1;
  }

  private burst(host: EntityHost, x: number, y: number, z: number): void {
    host.effect('snow', x, y, z, 8);
    host.sound('snow_hit', x, y, z, 0.5, 0.9 + Math.random() * 0.3);
    this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = (this.age + alpha) * 0.5;
    this.object.rotation.set(t, t * 0.7, 0);
    this.mat.color.setScalar(Math.max(0.35, host.brightnessAt(this.x, this.y, this.z)));
  }

  dispose(): void {
    super.dispose();
    this.mat.dispose();
  }
}
