import * as THREE from 'three';
import { instantiate } from '../entities/BoxModel';
import { playerModel } from '../entities/mobModels';
import { makePlate } from '../entities/Mob';

/**
 * 2.11.1: the player's own body, seen in the third-person views, with the name from a
 * Name Tag floating above the head.
 */
export class PlayerBody {
  readonly group = new THREE.Group();
  private root: THREE.Object3D;
  private parts: Map<string, THREE.Object3D>;
  private material: THREE.MeshLambertMaterial;
  private plate: { name: string; sprite: THREE.Sprite } | null = null;

  constructor(scene: THREE.Scene) {
    const inst = instantiate(playerModel());
    this.root = inst.root;
    this.parts = inst.parts;
    this.material = inst.material;
    this.group.add(inst.root);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(show: boolean, x: number, y: number, z: number, yaw: number, pitch: number, walk: number, speed: number, name: string, bright: number, sneaking: boolean): void {
    this.group.visible = show;
    if (!show) return;
    this.group.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;
    const amp = Math.min(1, speed * 7) * 0.9;
    const swing = Math.sin(walk * 6.5) * amp;
    const set = (n: string, v: number) => { const o = this.parts.get(n); if (o) o.rotation.x = v; };
    set('legL', swing); set('legR', -swing); set('armL', -swing); set('armR', swing);
    const head = this.parts.get('head');
    if (head) head.rotation.x = -pitch * 0.8;
    this.root.rotation.x = sneaking ? 0.25 : 0;
    this.material.color.setScalar(bright);
    const label = name.trim();
    if (this.plate && this.plate.name !== label) {
      this.plate.sprite.removeFromParent();
      this.plate.sprite.material.map?.dispose();
      this.plate.sprite.material.dispose();
      this.plate = null;
    }
    if (label && !this.plate) {
      this.plate = { name: label, sprite: makePlate(label) };
      this.group.add(this.plate.sprite);
    }
    if (this.plate) this.plate.sprite.position.set(0, (sneaking ? 1.62 : 1.8) + 0.38, 0);
  }
}
