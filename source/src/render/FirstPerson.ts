import * as THREE from 'three';
import type { ItemModels } from './ItemModels';
import { playerModel } from '../entities/mobModels';
import { visualKey, type Slot } from '../inventory/ItemStack';
import { getItem } from '../inventory/ItemRegistry';

/**
 * First-person hand and held item, rendered in a separate overlay scene after the
 * world (depth cleared) so they never clip into blocks. Animations: walking bob,
 * swing (mining/attacking/placing), equip dip when switching items, eating and
 * bow drawing.
 */
const DOWN = new THREE.Vector3(0, -1, 0);

export class FirstPerson {
  readonly root = new THREE.Group();
  private arm: THREE.Mesh;
  private armMat: THREE.MeshLambertMaterial;
  private itemHolder = new THREE.Group();
  private itemMesh: THREE.Mesh | null = null;
  private itemMat: THREE.MeshLambertMaterial | null = null;
  private currentId = '';
  private isBlock = false;
  swingTicks = 0;         // counts down from SWING_TIME
  private prevSwing = 0;
  equip = 1;              // 0 = lowered, 1 = raised
  private prevEquip = 1;
  private pendingId: string | null = null;
  eating = 0;             // ticks into eating
  drawing = 0;            // ticks drawing the bow
  static SWING_TIME = 6;
  /** Hand/item placement in camera space (exposed so it can be tuned visually). */
  pose = {
    ax: 0.42, ay: -0.3, az: -0.72,            // hand anchor
    dx: -0.42, dy: 0.5, dz: -0.75, roll: 0.6, s: 1.0, // arm direction (shoulder -> hand)
    blockScale: 0.26, bx: 0.1, by: -0.06, bz: -0.02, brx: 0.3, bry: 0.78,
    itemScale: 0.4, ix: 0.08, iy: 0.02, iz: -0.02, irx: 0.0, iry: 2.45, irz: 0.12,
  };
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();

  constructor(scene: THREE.Scene, private models: ItemModels) {
    // arm uses the player skin texture (right arm)
    const pm = playerModel();
    this.armMat = pm.material.clone();
    const armPivot = pm.root.getObjectByName('armR')!;
    const armSrc = armPivot.children[0] as THREE.Mesh;
    this.arm = new THREE.Mesh(armSrc.geometry, this.armMat);
    this.root.add(this.arm);
    this.root.add(this.itemHolder);
    scene.add(this.root);
  }

  /** Called on tick: advances animation state. */
  tick(selected: Slot): void {
    this.prevSwing = this.swingTicks;
    if (this.swingTicks > 0) this.swingTicks--;
    this.prevEquip = this.equip;
    const id = visualKey(selected);
    if (id !== this.currentId && this.pendingId !== id) this.pendingId = id;
    if (this.pendingId !== null) {
      this.equip = Math.max(0, this.equip - 0.4);
      if (this.equip === 0) { this.setItem(this.pendingId); this.pendingId = null; }
    } else this.equip = Math.min(1, this.equip + 0.4);
  }

  /**
   * Where the tip of the held item (the top right corner of its sprite: the end of
   * a fishing rod) appears on screen, in normalised device coordinates of `cam`
   * (the overlay camera the hand is drawn with). False if nothing is held.
   */
  tipOnScreen(cam: THREE.Camera, out: THREE.Vector3): boolean {
    if (!this.itemMesh || this.isBlock) return false;
    this.root.updateMatrixWorld(true);
    out.set(0.41, 0.41, 0);
    this.itemMesh.localToWorld(out);
    out.project(cam);
    return true;
  }

  swing(): void {
    if (this.swingTicks <= FirstPerson.SWING_TIME / 2 || this.swingTicks === 0) {
      this.swingTicks = FirstPerson.SWING_TIME;
      this.prevSwing = FirstPerson.SWING_TIME;
    }
  }

  private setItem(id: string): void {
    this.currentId = id;
    if (this.itemMesh) {
      this.itemMesh.removeFromParent();
      this.itemMat?.dispose();
      this.itemMesh = null;
    }
    if (!id) return;
    const { mesh, isBlock } = this.models.createMesh(id);
    this.itemMesh = mesh;
    this.itemMat = mesh.material as THREE.MeshLambertMaterial;
    this.isBlock = isBlock;
    this.itemHolder.add(mesh);
  }

  update(alpha: number, bobPhase: number, bobAmount: number, brightness: number, fovFactor: number): void {
    const swingT = this.prevSwing + (this.swingTicks - this.prevSwing) * alpha;
    const p = swingT > 0 ? 1 - swingT / FirstPerson.SWING_TIME : 0; // 0..1 progress
    const eq = this.prevEquip + (this.equip - this.prevEquip) * alpha;
    const sp = Math.sqrt(p);
    const hasItem = !!this.itemMesh;
    const A = this.pose;

    const bobX = Math.sin(bobPhase * Math.PI) * bobAmount * 0.5;
    const bobY = -Math.abs(Math.cos(bobPhase * Math.PI) * bobAmount);

    // root = the hand anchor, in camera space; swing moves it towards the crosshair
    const r = this.root;
    r.position.set(
      A.ax + bobX - Math.sin(sp * Math.PI) * 0.22,
      A.ay + bobY + Math.sin(sp * Math.PI * 2) * 0.1 - (1 - eq) * 0.5,
      A.az - Math.sin(p * Math.PI) * 0.15,
    );
    r.rotation.set(0, 0, 0);
    r.rotation.y = -Math.sin(p * p * Math.PI) * 0.3;
    r.rotation.z = Math.sin(sp * Math.PI) * 0.3;
    r.rotation.x = -Math.sin(sp * Math.PI) * 0.5;
    r.scale.setScalar(1 / Math.max(0.6, fovFactor));

    this.arm.visible = !hasItem;
    if (!hasItem) {
      // point the arm's hand end (-Y in model space) from the shoulder (off-screen,
      // bottom right) towards the anchor, then roll it to show the side of the arm
      const v = this.tmpV.set(A.dx, A.dy, A.dz).normalize();
      this.tmpQ.setFromUnitVectors(DOWN, v);
      this.tmpQ2.setFromAxisAngle(v, A.roll);
      this.arm.quaternion.copy(this.tmpQ2).multiply(this.tmpQ);
      this.arm.scale.setScalar(A.s);
      this.arm.position.copy(v).multiplyScalar(-0.375 * A.s);
    }
    if (this.itemMesh) {
      const h = this.itemHolder;
      h.rotation.set(0, 0, 0);
      h.position.set(0, 0, 0);
      if (this.isBlock) {
        this.itemMesh.scale.setScalar(A.blockScale);
        h.position.set(A.bx, A.by, A.bz);
        h.rotation.set(A.brx, A.bry, 0, 'YXZ');
      } else {
        const def = getItem(this.currentId.split('#')[0]);
        this.itemMesh.scale.setScalar(A.itemScale);
        h.position.set(A.ix, A.iy, A.iz);
        h.rotation.set(A.irx, A.iry, A.irz, 'YXZ');
        if (def.kind === 'bow') h.rotation.set(A.irx, A.iry, A.irz - 0.9, 'YXZ');
      }
      if (this.eating > 0) {
        h.position.x -= 0.22;
        h.position.y += 0.1 + Math.abs(Math.sin(this.eating * 0.8)) * 0.04;
        h.position.z += 0.1;
      }
      if (this.drawing > 0) {
        const d = Math.min(1, this.drawing / 20);
        h.position.x -= 0.22;
        h.position.z += d * 0.12;
      }
      this.itemMat!.color.setScalar(brightness);
    }
    this.armMat.color.setScalar(brightness);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.itemMat?.dispose();
    this.armMat.dispose();
  }
}
