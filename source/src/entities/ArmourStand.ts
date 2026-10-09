import * as THREE from 'three';
import { Entity, EntityHost } from './Entity';
import { BuiltModel, PartDef, buildModel, instantiate } from './BoxModel';
import { ArmourDresser } from './armourModels';
import { cloneStack, visualKey, type Slot } from '../inventory/ItemStack';
import { rayBox } from '../interaction/VoxelRaycaster';

/** Slots of an armour stand: head, chest, legs, feet (as worn armour), then the hand. */
export const STAND_HAND = 4;
export const STAND_WIDTH = 0.5;
export const STAND_HEIGHT = 1.975;
/** Half-width of the box you aim at (a bit wider than the stand, so it is easy to click). */
const HIT_HALF = 0.32;

const WOOD = '#a27a48', WOOD_DARK = '#7a5a32', WOOD_LIGHT = '#c49a62', STONE = '#9d9d9b';

/**
 * ORIGINAL stand design: a stone foot plate, two wooden leg posts, a hip bar, a
 * central post with a shoulder bar, two hanging arm posts and a round head. Its
 * pivots match a person's (head, body, arms, legs) so worn armour fits it.
 */
function standParts(): PartDef[] {
  const grain = (p: Parameters<NonNullable<PartDef['paint']>>[0]) => {
    for (const f of ['front', 'back', 'left', 'right'] as const) { p.px(f, 0, 1, WOOD_DARK, 1, 3); p.px(f, 1, 6, WOOD_LIGHT, 1, 2); }
  };
  return [
    { name: 'base', size: [12, 1, 12], pivot: [0, 0, 0], from: [-6, 0, -6], base: STONE, noise: 0.08,
      paint: (p) => { p.px('top', 0, 0, '#b7b7b4', 12, 1); p.px('top', 0, 11, '#7f7f7d', 12, 1); } },
    { name: 'legL', size: [2, 11, 2], pivot: [2, 12, 0], from: [-1, -11, -1], base: WOOD, paint: grain },
    { name: 'legR', size: [2, 11, 2], pivot: [-2, 12, 0], from: [-1, -11, -1], base: WOOD, paint: grain },
    { name: 'body', size: [8, 2, 2], pivot: [0, 12, 0], from: [-4, 0, -1], base: WOOD_DARK },
    { name: 'post', size: [2, 10, 2], pivot: [0, 0, 0], from: [-1, 2, -1], base: WOOD, parent: 'body', paint: grain },
    { name: 'shoulders', size: [12, 2, 3], pivot: [0, 0, 0], from: [-6, 10, -1.5], base: WOOD_DARK,
      paint: (p) => { p.px('top', 0, 1, WOOD_LIGHT, 12, 1); } },
    { name: 'armL', size: [2, 10, 2], pivot: [6, 22, 0], from: [-1, -10, -1], base: WOOD, paint: grain },
    { name: 'armR', size: [2, 10, 2], pivot: [-6, 22, 0], from: [-1, -10, -1], base: WOOD, paint: grain },
    { name: 'head', size: [2, 2, 2], pivot: [0, 24, 0], from: [-1, 0, -1], base: WOOD_DARK },
    { name: 'knob', size: [6, 6, 6], pivot: [0, 0, 0], from: [-3, 1.5, -3], base: WOOD_LIGHT, parent: 'head',
      paint: (p) => { p.fill('top', '#d2aa72', 0.06, 3); p.px('front', 1, 4, WOOD, 4, 1); } },
  ];
}

let model: BuiltModel | null = null;
function standModel(): BuiltModel {
  if (!model) model = buildModel(standParts(), 64, 64, 211);
  return model;
}

/**
 * ARMOUR STAND (2.1)
 * ------------------
 * Put armour on it to show it off (or keep a spare set ready): right-click with a
 * piece of armour to hang it in the right place, with anything else to put it in
 * the stand's hand. With an empty hand, right-click to take back the piece you aim
 * at; sneak and right-click to swap your whole set with the stand's. Two quick hits
 * knock it down (it drops itself and everything on it). It falls if the ground
 * goes, burns in lava, and is saved with the world.
 */
export class ArmourStand extends Entity {
  readonly type = 'armour_stand';
  readonly items: Slot[] = [null, null, null, null, null];
  private root: THREE.Group;
  private parts: Map<string, THREE.Object3D>;
  private material: THREE.MeshLambertMaterial;
  private dresser: ArmourDresser;
  private held: { key: string; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial } | null = null;
  private wobble = 0;
  private hits = 0;
  private lastHit = -100;
  private lightTimer = 0;

  constructor(yaw = 0) {
    super();
    this.width = STAND_WIDTH;
    this.height = STAND_HEIGHT;
    this.yaw = this.prevYaw = yaw;
    const inst = instantiate(standModel());
    this.root = inst.root;
    this.parts = inst.parts;
    this.material = inst.material;
    this.object.add(this.root);
    this.dresser = new ArmourDresser(this.parts);
  }

  /** World-space box you aim at. */
  hitBounds(): number[] {
    return [this.x - HIT_HALF, this.y, this.z - HIT_HALF, this.x + HIT_HALF, this.y + STAND_HEIGHT, this.z + HIT_HALF];
  }

  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number | null {
    const b = this.hitBounds();
    const r = rayBox(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
    return r ? r.t : null;
  }

  /** Is anything on the stand? */
  get empty(): boolean {
    return this.items.every((s) => !s);
  }

  /** A hit: the first wobbles it, a second soon after knocks it down (Creative: at once). Returns true when it breaks. */
  hit(creative: boolean): boolean {
    if (creative) return true;
    if (this.age - this.lastHit > 30) this.hits = 0;
    this.hits++;
    this.lastHit = this.age;
    this.wobble = 12;
    return this.hits >= 2;
  }

  tick(host: EntityHost): void {
    this.beginTick();
    if (this.wobble > 0) this.wobble--;
    this.vx = 0; this.vz = 0;
    this.physics(host.world, 0.08, 0.98, 0.5);
    this.vx = 0; this.vz = 0;
    if (this.inLava && !this.removed) {
      this.removed = true;
      host.sound('fizz', this.x, this.y + 0.5, this.z, 0.6, 1);
      host.effect('flame', this.x, this.y + 1, this.z, 8);
      this.dropAll(host, true);
    }
  }

  /** Scatters whatever it holds (and, if `self`, the stand itself) as items. */
  dropAll(host: { spawnItem(stack: NonNullable<Slot>, x: number, y: number, z: number): void }, self: boolean): void {
    for (let i = 0; i < this.items.length; i++) {
      const s = this.items[i];
      if (s) host.spawnItem(s, this.x, this.y + 0.4 + (3 - Math.min(3, i)) * 0.4, this.z);
      this.items[i] = null;
    }
    if (self) host.spawnItem({ id: 'armour_stand', count: 1 }, this.x, this.y + 0.3, this.z);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    this.root.rotation.y = this.yaw + Math.PI;
    this.root.rotation.z = this.wobble > 0 ? Math.sin((this.wobble - alpha) * 1.3) * 0.06 * (this.wobble / 12) : 0;
    this.dresser.set(this.items);
    // whatever it holds, in its right hand (the arm lifts a little)
    const key = visualKey(this.items[STAND_HAND]);
    if ((this.held?.key ?? '') !== key) {
      if (this.held) { this.held.mesh.removeFromParent(); this.held.mat.dispose(); this.held = null; }
      if (key) {
        const { mesh, isBlock } = host.models.createMesh(key);
        if (isBlock) { mesh.scale.setScalar(0.3); mesh.position.set(0, -0.62, 0.12); }
        else { mesh.scale.setScalar(0.62); mesh.rotation.set(0, 0, Math.PI / 4); mesh.position.set(0, -0.5, 0.1); }   // held upright, its face to the front
        this.parts.get('armR')?.add(mesh);
        this.held = { key, mesh, mat: mesh.material as THREE.MeshLambertMaterial };
      }
      this.lightTimer = 0;
    }
    const armR = this.parts.get('armR');
    if (armR) armR.rotation.x = this.held ? -0.35 : 0;
    if (this.lightTimer-- <= 0) {
      this.lightTimer = 8;
      const b = host.brightnessAt(this.x, this.y + 1.2, this.z);
      this.material.color.setScalar(b);
      this.dresser.light(b);
      this.held?.mat.color.setScalar(b);
    }
  }

  dispose(): void {
    this.dresser.dispose();
    if (this.held) this.held.mat.dispose();
    this.material.dispose();
    super.dispose();
  }

  serialize(): Record<string, unknown> {
    return { t: 'stand', x: this.x, y: this.y, z: this.z, yaw: this.yaw, items: this.items.map(cloneStack) };
  }
}
