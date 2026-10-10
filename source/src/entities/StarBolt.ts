import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { rayBox } from '../interaction/VoxelRaycaster';
import type { Mob } from './Mob';

const GEO = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const CORE = new THREE.BoxGeometry(0.2, 0.2, 0.2);

/**
 * A Hollowdrake's star bolt (2.2): a ball of violet starlight flying straight at
 * its target. It stings the player it hits (and knocks them back) and bursts into
 * sparkles against anything solid. It never breaks blocks.
 */
export class StarBolt extends Entity {
  readonly type = 'starbolt';
  shooter: Mob | null = null;
  damage = 4;
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.85 });
  private readonly coreMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff });

  constructor() {
    super();
    this.width = 0.4;
    this.height = 0.4;
    this.object.add(new THREE.Mesh(GEO, this.mat), new THREE.Mesh(CORE, this.coreMat));
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const p = host.player;
    const speed = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
    if (!p.dead && this.age > 1) {
      const pb = p.box;
      const r = rayBox(this.x, this.y, this.z, dx, dy, dz, pb.minX - 0.15, pb.minY - 0.15, pb.minZ - 0.15, pb.maxX + 0.15, pb.maxY + 0.15, pb.maxZ + 0.15);
      if (r && r.t <= speed) {
        host.damagePlayer(this.damage, { x: this.x - dx * 2, y: this.y, z: this.z - dz * 2, kind: 'starbolt', mob: this.shooter ?? undefined });
        this.burst(host);
        return;
      }
    }
    const hit = host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed);
    if (hit && this.age > 1 && hit.mob !== this.shooter && hit.mob.petOfPlayer) {
      hit.mob.hurt(this.damage, host, dx, dz, false, this.shooter ?? undefined);
      this.burst(host);
      return;
    }
    const box = new AABB(this.x - 0.15, this.y - 0.15, this.z - 0.15, this.x + 0.15, this.y + 0.15, this.z + 0.15);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz) { this.burst(host); return; }
    if (this.age % 2 === 0) host.effect('star', this.x, this.y, this.z, 1);
    if (this.age > 100 || this.y < -20) this.removed = true;
  }

  private burst(host: EntityHost): void {
    host.effect('star', this.x, this.y, this.z, 10);
    host.sound('star_burst', this.x, this.y, this.z, 0.7, 0.9 + Math.random() * 0.2);
    this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = (this.age + alpha) * 0.35;
    this.object.rotation.set(t, t * 1.4, t * 0.6);
    const s = 1 + Math.sin(t * 3) * 0.15;
    this.object.scale.setScalar(s);
  }

  dispose(): void {
    super.dispose();
    this.mat.dispose();
    this.coreMat.dispose();
  }
}
