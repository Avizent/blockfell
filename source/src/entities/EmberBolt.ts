import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { rayBox } from '../interaction/VoxelRaycaster';
import type { Mob } from './Mob';

const GEO = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const CORE = new THREE.BoxGeometry(0.12, 0.12, 0.12);

/**
 * A Smoulderer's thrown ember (2.0): a small glowing coal that flies in a shallow
 * arc. It burns the player it hits (and sets them alight); against a wall it bursts
 * into sparks. It never harms the creatures of the Cinderdeep.
 */
export class EmberBolt extends Entity {
  readonly type = 'ember';
  shooter: Mob | null = null;
  damage = 3;
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  private readonly coreMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    const outer = new THREE.Mesh(GEO, this.mat);
    const core = new THREE.Mesh(CORE, this.coreMat);
    this.object.add(outer, core);
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const p = host.player;
    const speed = Math.hypot(this.vx, this.vy, this.vz) || 1;
    const dx = this.vx / speed, dy = this.vy / speed, dz = this.vz / speed;
    if (!p.dead && this.age > 1) {
      const pb = p.box;
      const r = rayBox(this.x, this.y, this.z, dx, dy, dz, pb.minX - 0.1, pb.minY - 0.1, pb.minZ - 0.1, pb.maxX + 0.1, pb.maxY + 0.1, pb.maxZ + 0.1);
      if (r && r.t <= speed) {
        host.damagePlayer(this.damage, { x: this.x, y: this.y, z: this.z, kind: 'ember', mob: this.shooter ?? undefined });
        if (!p.creative) p.fireTicks = Math.max(p.fireTicks, 80);
        this.burst(host);
        return;
      }
    }
    // the player's companions get burned too
    const hit = host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed);
    if (hit && this.age > 1 && hit.mob.petOfPlayer) {
      hit.mob.hurt(this.damage, host, dx, dz, false, this.shooter ?? undefined);
      hit.mob.fireTicks = Math.max(hit.mob.fireTicks, 60);
      this.burst(host);
      return;
    }
    const box = new AABB(this.x - 0.1, this.y - 0.1, this.z - 0.1, this.x + 0.1, this.y + 0.1, this.z + 0.1);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz) { this.burst(host); return; }
    this.vx *= 0.995; this.vy = this.vy * 0.995 - 0.012; this.vz *= 0.995;
    if (this.age % 2 === 0) host.effect('flame', this.x, this.y, this.z, 1);
    if (this.age > 120) this.removed = true;
  }

  private burst(host: EntityHost): void {
    host.effect('flame', this.x, this.y, this.z, 6);
    host.effect('smoke', this.x, this.y, this.z, 3);
    host.sound('ember_hit', this.x, this.y, this.z, 0.6, 0.9 + Math.random() * 0.2);
    this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = (this.age + alpha) * 0.4;
    this.object.rotation.set(t, t * 1.3, 0);
  }

  dispose(): void {
    super.dispose();
    this.mat.dispose();
    this.coreMat.dispose();
  }
}
