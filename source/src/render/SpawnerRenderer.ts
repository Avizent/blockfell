import * as THREE from 'three';
import { instantiate } from '../entities/BoxModel';
import { mobModel, type MobType } from '../entities/mobModels';
import type { SpawnerSystem } from '../game/Spawners';

interface Figure {
  root: THREE.Group;
  material: THREE.MeshLambertMaterial;
  mob: string;
  spin: number;
}

const SHOW_RANGE = 28;
const FIGURE_SCALE = 0.34;

/**
 * The little creature turning slowly inside each Monster Cage near the player: a
 * scaled-down copy of the creature the cage makes, so you can tell a Shambler cage
 * from a Crawler cage before it wakes. It spins faster while the cage is working.
 */
export class SpawnerRenderer {
  readonly group = new THREE.Group();
  private figures = new Map<string, Figure>();

  update(spawners: SpawnerSystem, cam: THREE.Vector3, brightness: (x: number, y: number, z: number) => number, dt: number): void {
    const seen = new Set<string>();
    for (const [k, s] of spawners.known) {
      if (Math.abs(s.x + 0.5 - cam.x) > SHOW_RANGE || Math.abs(s.y + 0.5 - cam.y) > SHOW_RANGE || Math.abs(s.z + 0.5 - cam.z) > SHOW_RANGE) continue;
      const mob = spawners.entity(s.x, s.y, s.z).mob;
      let f = this.figures.get(k);
      if (f && f.mob !== mob) { this.remove(k, f); f = undefined; }
      if (!f) {
        const inst = instantiate(mobModel(mob as MobType));
        const root = new THREE.Group();
        inst.root.scale.setScalar(FIGURE_SCALE);
        root.add(inst.root);
        root.position.set(s.x + 0.5, s.y + 0.14, s.z + 0.5);
        this.group.add(root);
        f = { root, material: inst.material, mob, spin: Math.random() * Math.PI * 2 };
        this.figures.set(k, f);
      }
      seen.add(k);
      f.spin += dt * (spawners.active(s.x, s.y, s.z) ? 2.4 : 0.5);
      f.root.rotation.y = f.spin;
      f.root.position.y = s.y + 0.14 + Math.sin(f.spin * 0.7) * 0.03;
      // lit like the cage, but never pitch black (the embers inside light it)
      f.material.color.setScalar(Math.max(0.45, brightness(s.x + 0.5, s.y + 0.5, s.z + 0.5)));
    }
    for (const [k, f] of this.figures) if (!seen.has(k)) this.remove(k, f);
  }

  get count(): number {
    return this.figures.size;
  }

  private remove(k: string, f: Figure): void {
    this.group.remove(f.root);
    f.material.dispose();
    this.figures.delete(k);
  }

  dispose(): void {
    for (const [k, f] of this.figures) this.remove(k, f);
  }
}
