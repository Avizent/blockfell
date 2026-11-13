import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { Wildling } from './Wildling';
import { IS_FLUID } from '../world/BlockRegistry';

const GEO = new THREE.BoxGeometry(0.26, 0.26, 0.26);
const BAND = new THREE.BoxGeometry(0.28, 0.07, 0.28);

/**
 * CAPTURE ORB (2.17): thrown by the player. It flies in an arc. If it strikes a wild Wildling it rolls the
 * creature's catch chance (better when the creature is hurt): the creature is caught, or it bursts the orb and bolts.
 * If it strikes anything else, or the ground, it simply drops back to be picked up.
 */
export class OrbShot extends Entity {
  readonly type = 'orbshot';
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0x5ee0d0 });
  private readonly bandMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  /** Was the thrower creeping (a small bonus)? */
  sneaking = false;

  constructor() {
    super();
    this.width = 0.26;
    this.height = 0.26;
    this.object.add(new THREE.Mesh(GEO, this.mat), new THREE.Mesh(BAND, this.bandMat));
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const speed = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
    const hit = this.age > 0 ? host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed) : null;
    if (hit && !hit.mob.petOfPlayer) {
      const m = hit.mob;
      const at = { x: this.x + dx * hit.t, y: this.y + dy * hit.t, z: this.z + dz * hit.t };
      if (m instanceof Wildling && !m.caught) {
        if (Math.random() < m.catchChance(this.sneaking)) { m.catchNow(host); host.orbCaught?.(m); }
        else { m.breakFree(host); host.orbFailed?.(m); }
        host.effect('star', at.x, at.y, at.z, 8);
        this.removed = true;       // the orb is used up either way
        return;
      }
      this.drop(host, at.x, at.y, at.z);
      return;
    }
    const box = new AABB(this.x - 0.1, this.y - 0.1, this.z - 0.1, this.x + 0.1, this.y + 0.1, this.z + 0.1);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    const fluid = IS_FLUID[host.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] === 1;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz || fluid) { this.drop(host, this.x, this.y, this.z); return; }
    this.vx *= 0.99; this.vy = this.vy * 0.99 - 0.03; this.vz *= 0.99;
    if (this.age > 200) this.drop(host, this.x, this.y, this.z);
  }

  /** A miss: the orb rolls to a stop and can be picked up again. */
  private drop(host: EntityHost, x: number, y: number, z: number): void {
    host.spawnItem({ id: 'capture_orb', count: 1 }, x, y + 0.2, z);
    host.sound('pop', x, y, z, 0.3, 1.3);
    this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = (this.age + alpha) * 0.4;
    this.object.rotation.set(t, t * 0.6, 0);
    this.mat.color.setScalar(Math.max(0.5, host.brightnessAt(this.x, this.y, this.z)));
  }

  dispose(): void {
    super.dispose();
    this.mat.dispose();
    this.bandMat.dispose();
  }
}
