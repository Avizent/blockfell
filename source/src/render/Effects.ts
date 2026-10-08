import * as THREE from 'three';
import type { ItemModels } from './ItemModels';

/** Thin dark wireframe around the targeted block (sized to its selection box). */
export class BlockOutline {
  readonly mesh: THREE.LineSegments;

  constructor(scene: THREE.Scene) {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const m = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  show(x: number, y: number, z: number, sel: number[]): void {
    const e = 0.002;
    const w = sel[3] - sel[0] + e * 2, h = sel[4] - sel[1] + e * 2, d = sel[5] - sel[2] + e * 2;
    this.mesh.scale.set(w, h, d);
    this.mesh.position.set(x + (sel[0] + sel[3]) / 2, y + (sel[1] + sel[4]) / 2, z + (sel[2] + sel[5]) / 2);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Progressive crack texture drawn over a block while it is being mined. */
export class CrackOverlay {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private stage = -1;

  constructor(scene: THREE.Scene, private models: ItemModels) {
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      color: 0xffffff, opacity: 0.85,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  /** `sel` is the block's selection box, so cracks hug slabs, doors and other shapes. */
  show(x: number, y: number, z: number, progress: number, sel: number[] = [0, 0, 0, 1, 1, 1]): void {
    const s = Math.min(9, Math.floor(progress * 10));
    if (s !== this.stage) {
      this.stage = s;
      this.mat.map = this.models.destroyTexture(s);
      this.mat.needsUpdate = true;
    }
    this.mesh.position.set(x + (sel[0] + sel[3]) / 2, y + (sel[1] + sel[4]) / 2, z + (sel[2] + sel[5]) / 2);
    this.mesh.scale.set(Math.max(0.01, sel[3] - sel[0]), Math.max(0.01, sel[4] - sel[1]), Math.max(0.01, sel[5] - sel[2]));
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.stage = -1;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  r: number; g: number; b: number;
  gravity: number;
  glow: boolean;
}

/**
 * Small cube particles (block breaking debris, smoke, flames, splashes) drawn
 * with ONE InstancedMesh (single draw call). Capacity is fixed; the oldest
 * particles are recycled.
 */
export type EffectKind = 'poof' | 'smoke' | 'flame' | 'crit' | 'splash' | 'happy' | 'angry' | 'drip' | 'heart' | 'ash';

export class Particles {
  private mesh: THREE.InstancedMesh;
  private items: Particle[] = [];
  private readonly cap = 600;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, this.color.set(1, 1, 1));
    scene.add(this.mesh);
  }

  get count(): number { return this.items.length; }

  spawn(p: Omit<Particle, 'life'>): void {
    const item = { ...p, life: 0 };
    if (this.items.length >= this.cap) this.items[Math.floor(Math.random() * this.cap)] = item; // recycle
    else this.items.push(item);
  }

  blockBreak(x: number, y: number, z: number, colors: THREE.Color[], brightness: number, amount = 24): void {
    for (let i = 0; i < amount; i++) {
      const c = colors[i % colors.length];
      this.spawn({
        x: x + 0.15 + Math.random() * 0.7, y: y + 0.15 + Math.random() * 0.7, z: z + 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15 + 0.05, vz: (Math.random() - 0.5) * 0.15,
        max: 12 + Math.random() * 14, size: 0.06 + Math.random() * 0.05,
        r: c.r * brightness, g: c.g * brightness, b: c.b * brightness, gravity: 0.04, glow: false,
      });
    }
  }

  hitSpark(x: number, y: number, z: number, colors: THREE.Color[], brightness: number): void {
    this.blockBreak(x - 0.5, y - 0.5, z - 0.5, colors, brightness, 3);
  }

  /** `light` (0-1) dims the particles that don't glow (smoke, splashes, drips) to the brightness where they appear. */
  effect(kind: EffectKind, x: number, y: number, z: number, count: number, light = 1): void {
    const k = Math.max(0.18, Math.min(1, light));
    for (let i = 0; i < count; i++) {
      const j = () => (Math.random() - 0.5);
      if (kind === 'happy' || kind === 'angry') {
        const happy = kind === 'happy';
        this.spawn({ x: x + j() * 0.9, y: y + j() * 0.6, z: z + j() * 0.9, vx: 0, vy: 0.012, vz: 0,
          max: 18 + Math.random() * 10, size: 0.08, r: happy ? 0.35 : 0.9, g: happy ? 1 : 0.2, b: happy ? 0.4 : 0.15, gravity: 0, glow: true });
      } else if (kind === 'poof' || kind === 'smoke') {
        const g = (0.6 + Math.random() * 0.35) * k;
        this.spawn({ x: x + j() * 0.8, y: y + j() * 0.8, z: z + j() * 0.8, vx: j() * 0.05, vy: 0.03 + Math.random() * 0.03, vz: j() * 0.05,
          max: 14 + Math.random() * 10, size: 0.12 + Math.random() * 0.1, r: g, g, b: g, gravity: -0.002, glow: false });
      } else if (kind === 'flame') {
        this.spawn({ x: x + j() * 0.5, y: y + j() * 0.6, z: z + j() * 0.5, vx: 0, vy: 0.04, vz: 0,
          max: 10 + Math.random() * 6, size: 0.08, r: 1, g: 0.6 + Math.random() * 0.3, b: 0.15, gravity: -0.002, glow: true });
      } else if (kind === 'drip') {
        // a raindrop landing: a tiny splash that jumps up and falls back
        this.spawn({ x: x + j() * 0.9, y, z: z + j() * 0.9, vx: j() * 0.03, vy: 0.05 + Math.random() * 0.03, vz: j() * 0.03,
          max: 5 + Math.random() * 3, size: 0.045, r: 0.62 * k, g: 0.72 * k, b: 0.95 * k, gravity: 0.03, glow: false });
      } else if (kind === 'heart') {
        const k = Math.random();
        this.spawn({ x: x + j() * 0.8, y: y + j() * 0.4, z: z + j() * 0.8, vx: 0, vy: 0.02, vz: 0,
          max: 20 + Math.random() * 10, size: 0.1, r: 1, g: 0.25 + k * 0.2, b: 0.4 + k * 0.1, gravity: 0, glow: true });
      } else if (kind === 'ash') {
        // 2.0: flecks of ash and the odd ember drifting in the Cinderdeep's air
        const ember = Math.random() < 0.25;
        const g = 0.32 + Math.random() * 0.2;
        this.spawn({ x: x + j() * 0.6, y, z: z + j() * 0.6, vx: j() * 0.02, vy: ember ? 0.012 : -0.006, vz: j() * 0.02,
          max: 50 + Math.random() * 40, size: ember ? 0.04 : 0.035, r: ember ? 1 : g * k, g: ember ? 0.5 : g * k, b: ember ? 0.15 : g * k, gravity: 0, glow: ember });
      } else if (kind === 'crit') {
        this.spawn({ x, y, z, vx: j() * 0.3, vy: Math.random() * 0.2, vz: j() * 0.3,
          max: 10, size: 0.06, r: 0.9, g: 0.9, b: 0.95, gravity: 0.02, glow: true });
      } else {
        this.spawn({ x: x + j(), y, z: z + j(), vx: j() * 0.1, vy: 0.15 + Math.random() * 0.1, vz: j() * 0.1,
          max: 12, size: 0.07, r: 0.55 * k, g: 0.7 * k, b: k, gravity: 0.04, glow: false });
      }
    }
  }

  /** Advances particles (called per tick) */
  tick(isSolid: (x: number, y: number, z: number) => boolean): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life++;
      if (p.life >= p.max) {
        // swap-remove (order does not matter for particles)
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
        continue;
      }
      p.vy -= p.gravity;
      const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
      if (isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vx *= 0.5; p.vz *= 0.5; p.vy = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      p.vx *= 0.96; p.vz *= 0.96;
    }
  }

  render(): void {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const p = this.items[i];
      const s = p.size * (1 - (p.life / p.max) * 0.5);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setRGB(p.r, p.g, p.b));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
