import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { IS_FLUID } from '../world/BlockRegistry';
import { EFFECT_BY_ID } from '../inventory/potions';

const BODY = new THREE.BoxGeometry(0.26, 0.26, 0.26);
const NECK = new THREE.BoxGeometry(0.12, 0.14, 0.12);

/**
 * SPLASH POTION (2.5): thrown with right-click. It flies in an arc and shatters on
 * whatever it hits (a block, a creature or water), and the potion's effect washes
 * over everyone near the spot (the player, and creatures: see Game.shatterPotion).
 */
export class SplashPotion extends Entity {
  readonly type = 'splash_potion';
  /** Which effect it carries (an EffectId). */
  effectId = 'swiftness';
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly neck = new THREE.MeshBasicMaterial({ color: 0xd8c8a8 });

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    const neck = new THREE.Mesh(NECK, this.neck);
    neck.position.set(0, 0.2, 0);
    this.object.add(new THREE.Mesh(BODY, this.mat), neck);
  }

  setEffect(id: string): void {
    this.effectId = id;
    const rgb = EFFECT_BY_ID[id]?.rgb ?? [255, 255, 255];
    this.mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const speed = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
    const hit = this.age > 0 ? host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed) : null;
    if (hit && !hit.mob.petOfPlayer) {
      this.shatter(host, this.x + dx * hit.t, this.y + dy * hit.t, this.z + dz * hit.t);
      return;
    }
    const box = new AABB(this.x - 0.1, this.y - 0.1, this.z - 0.1, this.x + 0.1, this.y + 0.1, this.z + 0.1);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    const wet = IS_FLUID[host.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] === 1;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz || wet) { this.shatter(host, this.x, this.y, this.z); return; }
    this.vx *= 0.99; this.vy = this.vy * 0.99 - 0.05; this.vz *= 0.99;
    if (this.age > 200) this.removed = true;
  }

  private shatter(host: EntityHost, x: number, y: number, z: number): void {
    this.removed = true;
    host.shatterPotion(x, y, z, this.effectId);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = (this.age + alpha) * 0.4;
    this.object.rotation.set(t, 0, t * 0.6);
  }

  dispose(): void {
    super.dispose();
    this.mat.dispose();
    this.neck.dispose();
  }
}
