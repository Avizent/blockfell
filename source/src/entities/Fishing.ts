import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { AABB, moveBox } from '../player/PlayerPhysics';
import { IS_WATER, FLUID_LEVEL } from '../world/BlockRegistry';
import type { ItemStack } from '../inventory/ItemStack';

/** What a line can bring up, by weight: mostly fish, some junk, a little treasure. */
export const CATCHES: { stack: () => ItemStack; weight: number; kind: 'fish' | 'junk' | 'treasure' }[] = [
  { stack: () => ({ id: 'raw_trout', count: 1 }), weight: 60, kind: 'fish' },
  { stack: () => ({ id: 'raw_perch', count: 1 }), weight: 25, kind: 'fish' },
  { stack: () => ({ id: 'stick', count: 1 + Math.floor(Math.random() * 2) }), weight: 3, kind: 'junk' },
  { stack: () => ({ id: 'string', count: 1 }), weight: 2.5, kind: 'junk' },
  { stack: () => ({ id: 'bone', count: 1 }), weight: 2.5, kind: 'junk' },
  { stack: () => ({ id: 'leather', count: 1 }), weight: 2, kind: 'junk' },
  { stack: () => ({ id: 'amber', count: 1 + Math.floor(Math.random() * 3) }), weight: 2.5, kind: 'treasure' },
  { stack: () => ({ id: 'rune_shard', count: 1 }), weight: 1.5, kind: 'treasure' },
  { stack: () => ({ id: 'bow', count: 1, damage: Math.floor(Math.random() * 300) }), weight: 1, kind: 'treasure' },
];

export function rollCatch(r = Math.random()): { stack: ItemStack; kind: 'fish' | 'junk' | 'treasure' } {
  const total = CATCHES.reduce((a, c) => a + c.weight, 0);
  let x = r * total;
  for (const c of CATCHES) { x -= c.weight; if (x <= 0) return { stack: c.stack(), kind: c.kind }; }
  const last = CATCHES[0];
  return { stack: last.stack(), kind: last.kind };
}

/** Ticks to wait for a fish: 5 to 30 seconds (rain makes them bite sooner). */
function waitTicks(): number {
  return 100 + Math.floor(Math.random() * 500);
}

/**
 * The float at the end of a fishing line. Cast from a Fishing Rod, it flies in an
 * arc and settles on water (or lies where it lands on the ground). On water a fish
 * comes after a while: a trail of ripples swims towards the float, then it bites -
 * the float is pulled under with a splash, and the player has about a second to
 * reel in (right-click / tap again). The rod and the reeling are handled by Game.
 */
export class Bobber extends Entity {
  readonly type = 'bobber';
  state: 'flying' | 'floating' | 'ground' = 'flying';
  /** Ticks until a fish comes. */
  wait = waitTicks();
  /** Ticks of a fish swimming in (ripples coming closer). */
  approach = 0;
  /** Ticks left of a bite (the moment to reel in). */
  bite = 0;
  private fishAngle = 0;
  private approachTotal = 1;
  private mesh: THREE.Group;
  private mats: THREE.MeshLambertMaterial[] = [];

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    this.mesh = new THREE.Group();
    const top = new THREE.MeshLambertMaterial({ color: 0xd8342c });
    const bottom = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
    const stem = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    this.mats.push(top, bottom, stem);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.18), top); a.position.y = 0.16;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.18), bottom); b.position.y = 0.06;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), stem); c.position.y = 0.25;
    this.mesh.add(a, b, c);
    this.object.add(this.mesh);
  }

  /** Top of the water in the float's cell (or the cell below), or null. */
  private surface(host: EntityHost): number | null {
    const bx = Math.floor(this.x), bz = Math.floor(this.z);
    for (const cy of [Math.floor(this.y + 0.1), Math.floor(this.y - 0.4)]) {
      const id = host.world.getBlock(bx, cy, bz);
      if (!IS_WATER[id]) continue;
      if (IS_WATER[host.world.getBlock(bx, cy + 1, bz)]) return cy + 1;
      const l = FLUID_LEVEL[id];
      return cy + (l <= 0 || l >= 8 ? 14 : Math.max(2, Math.round((14 * (8 - l)) / 8))) / 16;
    }
    return null;
  }

  tick(host: EntityHost): void {
    this.beginTick();
    if (this.age > 20 * 60 * 5) { this.removed = true; return; }
    const surf = this.surface(host);
    if (this.state === 'flying') {
      if (surf !== null && this.y < surf) {
        this.state = 'floating';
        this.vx *= 0.3; this.vz *= 0.3; this.vy = Math.max(this.vy, -0.05);
        host.sound('splash', this.x, this.y, this.z, 0.25, 1.5);
        host.effect('splash', this.x, surf, this.z, 6);
      }
    }
    if (this.state === 'floating' && surf !== null) {
      // bob on the surface; a biting fish pulls the float under
      const target = surf - 0.12 - (this.bite > 0 ? 0.25 : 0);
      this.vy += (target - this.y) * 0.2;
      this.vy *= 0.6;
      this.vx *= 0.85; this.vz *= 0.85;
      this.fish(host, surf);
    } else if (this.state === 'floating') {
      this.state = 'flying';   // the water went (or the float drifted off it)
    }
    if (this.state !== 'floating') {
      this.vy = (this.vy - 0.04) * 0.92;
      this.vx *= 0.92; this.vz *= 0.92;
    }
    if (this.state === 'ground') { this.vx = 0; this.vz = 0; }
    const box = AABB.fromFeet(this.x, this.y, this.z, this.width, this.height);
    const ovx = this.vx, ovy = this.vy, ovz = this.vz;
    const [mx, my, mz] = moveBox(host.world, box, ovx, ovy, ovz);
    this.x += mx; this.y += my; this.z += mz;
    if (this.state === 'flying' && (my !== ovy && ovy < 0)) { this.state = 'ground'; this.vx = this.vy = this.vz = 0; }
    else if (this.state === 'flying' && (mx !== ovx || mz !== ovz)) { this.vx = 0; this.vz = 0; }
  }

  /** The waiting, the approach and the bite. */
  private fish(host: EntityHost, surf: number): void {
    if (this.bite > 0) {
      this.bite--;
      if (this.bite === 0) this.wait = waitTicks();   // it got away
      return;
    }
    if (this.approach > 0) {
      this.approach--;
      const d = 0.4 + (this.approach / this.approachTotal) * 3.5;
      host.effect('splash', this.x + Math.cos(this.fishAngle) * d, surf, this.z + Math.sin(this.fishAngle) * d, 2);
      if (this.approach === 0) {
        this.bite = 20 + Math.floor(Math.random() * 20);
        this.vy = -0.2;
        host.sound('splash', this.x, surf, this.z, 0.45, 1.1 + Math.random() * 0.3);
        host.effect('splash', this.x, surf, this.z, 12);
      }
      return;
    }
    // fish come sooner in the rain
    this.wait -= host.weatherRain() > 0.3 && Math.random() < 0.25 ? 2 : 1;
    if (this.wait <= 0) {
      this.approachTotal = this.approach = 20 + Math.floor(Math.random() * 40);
      this.fishAngle = Math.random() * Math.PI * 2;
    }
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const l = host.brightnessAt(this.x, this.y + 0.3, this.z);
    this.mats[0].color.setRGB(0.85 * l, 0.2 * l, 0.17 * l);
    this.mats[1].color.setScalar(0.94 * l);
  }

  dispose(): void {
    super.dispose();
    this.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}
