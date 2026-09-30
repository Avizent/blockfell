import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import type { ItemStack } from '../inventory/ItemStack';
import { stacksMatch } from '../inventory/ItemStack';
import { maxStackOf } from '../inventory/ItemRegistry';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { rayBox } from '../interaction/VoxelRaycaster';

/** A dropped item stack lying in the world. */
export class ItemEntity extends Entity {
  readonly type = 'item';
  stack: ItemStack;
  pickupDelay: number;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshLambertMaterial | null = null;
  private isBlock = false;
  private spin = Math.random() * Math.PI * 2;
  private meshFor = '';

  constructor(stack: ItemStack, pickupDelay = 10) {
    super();
    this.stack = { ...stack };
    this.pickupDelay = pickupDelay;
    this.width = 0.25;
    this.height = 0.25;
  }

  tick(host: EntityHost): void {
    if (this.removed) return;
    this.beginTick();
    if (this.pickupDelay > 0) this.pickupDelay--;
    if (this.inWater) this.vy += 0.03;
    this.physics(host.world, 0.04, 0.98, 0.588, 0.98);
    if (this.age > 6000) { this.removed = true; return; }
    if (this.inLava) {
      // lava burns dropped items
      this.removed = true;
      host.sound('fizz', this.x, this.y, this.z, 0.4, 1.4);
      host.effect('smoke', this.x, this.y + 0.2, this.z, 5);
      return;
    }

    // merge with nearby identical stacks (reduces entity count)
    if (this.age % 20 === 0) {
      for (const e of host.entities.itemsNear(this.x, this.y, this.z, 1)) {
        if (!(e instanceof ItemEntity)) continue;
        const o = e;
        if (o === this || o.removed || !stacksMatch(o.stack, this.stack)) continue;
        if (Math.abs(o.x - this.x) > 0.8 || Math.abs(o.y - this.y) > 0.6 || Math.abs(o.z - this.z) > 0.8) continue;
        const max = maxStackOf(this.stack.id);
        if (this.stack.count + o.stack.count > max) continue;
        this.stack.count += o.stack.count;
        this.pickupDelay = Math.max(this.pickupDelay, o.pickupDelay);
        o.removed = true;
      }
    }

    // pickup
    const p = host.player;
    if (this.pickupDelay === 0 && !p.dead) {
      const pb = p.box;
      const pick = new AABB(pb.minX - 1, pb.minY - 0.5, pb.minZ - 1, pb.maxX + 1, pb.maxY + 0.5, pb.maxZ + 1);
      this.syncBox();
      if (pick.intersects(this.box)) {
        const before = this.stack.count;
        const left = host.giveItem({ ...this.stack });
        if (left < before) {
          host.sound('pop', this.x, this.y, this.z, 0.25, 1.4 + Math.random() * 0.6);
          if (left === 0) this.removed = true;
          else this.stack.count = left;
        }
      }
    }
  }

  render(alpha: number, host: EntityHost): void {
    if (this.meshFor !== this.stack.id) {
      this.mesh?.removeFromParent();
      this.material?.dispose();
      const { mesh, isBlock } = host.models.createMesh(this.stack.id);
      this.mesh = mesh;
      this.material = mesh.material as THREE.MeshLambertMaterial;
      this.isBlock = isBlock;
      mesh.scale.setScalar(isBlock ? 0.25 : 0.42);
      this.object.add(mesh);
      this.meshFor = this.stack.id;
    }
    super.render(alpha, host);
    const t = this.age + alpha;
    const bob = Math.sin((t + this.spin * 10) / 10) * 0.08 + 0.1;
    this.mesh!.position.y = (this.isBlock ? 0.125 : 0.2) + bob;
    this.mesh!.rotation.y = t / 20 + this.spin;
    const b = host.brightnessAt(this.x, this.y + 0.2, this.z);
    this.material!.color.setScalar(b);
  }

  dispose(): void {
    super.dispose();
    this.material?.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'item', x: this.x, y: this.y, z: this.z, stack: this.stack, age: this.age };
  }
}

let orbTexture: THREE.Texture | null = null;
function getOrbTexture(): THREE.Texture {
  if (orbTexture) return orbTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2f5a10'; ctx.fillRect(1, 1, 6, 6);
  ctx.fillStyle = '#a6e22a'; ctx.fillRect(2, 1, 4, 6); ctx.fillRect(1, 2, 6, 4);
  ctx.fillStyle = '#f2ff9a'; ctx.fillRect(3, 3, 2, 2);
  orbTexture = new THREE.CanvasTexture(c);
  orbTexture.magFilter = THREE.NearestFilter;
  orbTexture.minFilter = THREE.NearestFilter;
  orbTexture.colorSpace = THREE.NoColorSpace;
  return orbTexture;
}

/** Experience orb: drifts towards the player and adds XP on contact. */
export class XpOrb extends Entity {
  readonly type = 'xp';
  value: number;
  private sprite: THREE.Sprite;

  constructor(value: number) {
    super();
    this.value = value;
    this.width = 0.3;
    this.height = 0.3;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getOrbTexture(), transparent: true, depthWrite: false }));
    const s = 0.18 + Math.min(0.2, value * 0.02);
    this.sprite.scale.set(s, s, s);
    this.object.add(this.sprite);
  }

  tick(host: EntityHost): void {
    this.beginTick();
    const p = host.player;
    const dx = p.x - this.x, dy = p.y + 0.8 - this.y, dz = p.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 8 && !p.dead && this.age > 10) {
      const f = (1 - d / 8) ** 2 * 0.1;
      this.vx += (dx / d) * f; this.vy += (dy / d) * f; this.vz += (dz / d) * f;
    }
    this.physics(host.world, 0.03, 0.98, 0.6, 0.98);
    if (this.inLava) { this.removed = true; host.effect('smoke', this.x, this.y, this.z, 2); return; }
    if (d < 1.2 && !p.dead && this.age > 10) {
      host.addXp(this.value);
      host.sound('orb', this.x, this.y, this.z, 0.25, 1.2 + Math.random() * 0.8);
      this.removed = true;
    }
    if (this.age > 6000) this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    this.sprite.position.y = 0.15 + Math.sin((this.age + alpha) / 5) * 0.03;
    const pulse = 0.75 + 0.25 * Math.sin((this.age + alpha) / 3);
    (this.sprite.material as THREE.SpriteMaterial).color.setScalar(pulse);
  }

  dispose(): void {
    super.dispose();
    this.sprite.material.dispose();
  }
}

/** Arrow projectile (player bow and skeletal archers). */
export class Arrow extends Entity {
  readonly type = 'arrow';
  fromPlayer: boolean;
  damage: number;
  /** The archer that loosed it (so companions know whom to go after). */
  shooter: import('./Mob').Mob | null = null;
  stuck = false;
  private stuckTime = 0;

  constructor(fromPlayer: boolean, damage: number) {
    super();
    this.fromPlayer = fromPlayer;
    this.damage = damage;
    this.width = 0.1;
    this.height = 0.1;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0xbfbfc6 }));
    head.position.z = -0.3;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.14), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    fl.position.z = 0.25;
    const inner = new THREE.Group();
    inner.add(shaft, head, fl);
    this.object.add(inner);
  }

  tick(host: EntityHost): void {
    this.beginTick();
    if (this.stuck) {
      this.stuckTime++;
      if (this.stuckTime > 1200) this.removed = true;
      // player can collect arrows they fired
      if (this.fromPlayer && this.stuckTime > 5 && !host.player.dead && host.player.box.intersects(new AABB(this.x - 0.6, this.y - 0.6, this.z - 0.6, this.x + 0.6, this.y + 0.6, this.z + 0.6))) {
        if (host.player.creative || host.giveItem({ id: 'arrow', count: 1 }) === 0) {
          host.sound('pop', this.x, this.y, this.z, 0.2, 1.6);
          this.removed = true;
        }
      }
      return;
    }
    // entity hits along this tick's segment
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    const len = speed || 1;
    const dx = this.vx / len, dy = this.vy / len, dz = this.vz / len;
    const hitEnt = host.entities.rayHitMob(this.x, this.y, this.z, dx, dy, dz, speed);
    const p = host.player;
    if (!this.fromPlayer && !p.dead && this.age > 1) {
      const pb = p.box;
      const r = rayBox(this.x, this.y, this.z, dx, dy, dz, pb.minX, pb.minY, pb.minZ, pb.maxX, pb.maxY, pb.maxZ);
      if (r && r.t <= speed) {
        host.damagePlayer(Math.ceil(speed * this.damage), { x: this.x, y: this.y, z: this.z, kind: 'arrow', mob: this.shooter ?? undefined });
        this.removed = true;
        return;
      }
    }
    // the player's arrows fly past their own companions
    if (hitEnt && this.fromPlayer && this.age > 0 && !hitEnt.mob.petOfPlayer) {
      hitEnt.mob.hurt(Math.ceil(speed * this.damage), host, dx, dz, true);
      host.playerAttacked(hitEnt.mob);
      host.onArrowHit();
      host.sound('hit', this.x, this.y, this.z, 0.5, 1.2);
      this.removed = true;
      return;
    }
    // archers' arrows also hit villagers and the Sentinel
    if (hitEnt && !this.fromPlayer && this.age > 1 && (hitEnt.mob.spec.folk || hitEnt.mob.petOfPlayer) && hitEnt.mob !== this.shooter) {
      hitEnt.mob.hurt(Math.ceil(speed * this.damage), host, dx, dz, false, this.shooter ?? undefined);
      host.sound('hit', this.x, this.y, this.z, 0.5, 1.2);
      this.removed = true;
      return;
    }
    const box = new AABB(this.x - 0.05, this.y - 0.05, this.z - 0.05, this.x + 0.05, this.y + 0.05, this.z + 0.05);
    const [mx, my, mz] = moveBox(host.world, box, this.vx, this.vy, this.vz);
    this.x += mx; this.y += my; this.z += mz;
    if (mx !== this.vx || my !== this.vy || mz !== this.vz) {
      this.stuck = true;
      host.sound('arrow_hit', this.x, this.y, this.z, 0.4, 1);
      return;
    }
    this.vx *= 0.99; this.vy = this.vy * 0.99 - 0.05; this.vz *= 0.99;
    this.yaw = Math.atan2(this.vx, this.vz);
    if (this.age > 400) this.removed = true;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    if (!this.stuck) {
      const h = Math.hypot(this.vx, this.vz);
      this.object.rotation.set(0, 0, 0);
      this.object.rotation.order = 'YXZ';
      this.object.rotation.y = Math.atan2(-this.vx, -this.vz);
      this.object.rotation.x = Math.atan2(this.vy, h);
    }
  }

  dispose(): void {
    super.dispose();
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }
}
