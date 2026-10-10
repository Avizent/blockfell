import * as THREE from 'three';
import { BuiltModel, FacePainter, PartDef, buildModel, instantiate } from './BoxModel';
import type { Slot } from '../inventory/ItemStack';

/**
 * Worn armour (2.1): ORIGINAL box shells drawn around a humanoid's head, body,
 * arms and legs, for armour stands and the player picture in the inventory.
 * Each piece is built on the same pivots as the body part it covers, so it moves
 * with that part. Iron is painted grey metal; leather is painted near-white and
 * tinted by its colour (plain leather brown, or the dye it was crafted with).
 */

/** The colour plain (undyed) leather is tinted with. */
export const LEATHER_TINT = 0xa66a3e;

type Mat = 'leather' | 'iron' | 'wings';
/** One box of a piece: which humanoid part it sits on, its box, and how much bigger than the part it is drawn. */
interface Shell { on: string; def: PartDef; grow: number }

const IRON = { base: '#c3c3c9', light: '#e6e6ec', dark: '#8c8c93', deep: '#6c6c72' };
const HIDE = { base: '#ece6df', light: '#f8f4ef', dark: '#c2b8ad', deep: '#9e9286' };

const SIDES = ['front', 'back', 'left', 'right'] as const;

/** 2.2: Starwings - two violet, star-speckled wings on the back, edged with pale bone. */
function wingShells(): Shell[] {
  const wing = (name: string, x0: number): Shell => ({ on: 'body', grow: 1, def: { name, size: [10, 14, 1], pivot: [0, 11, -2.6], from: [x0, -13, -0.5], base: '#5b3f92', noise: 0.08,
    paint: (p) => {
      for (const f of ['front', 'back'] as const) {
        for (let i = 0; i < 9; i++) p.px(f, (i * 7 + 3) % 10, (i * 5 + 2) % 14, '#ece6ff');
        p.px(f, x0 < 0 ? 0 : 9, 0, '#ddd6c6', 1, 14); p.px(f, 0, 0, '#ddd6c6', 10, 1);
      }
    } } });
  return [wing('a_wingL', 0.5), wing('a_wingR', -10.5)];
}

function shells(mat: Mat, slot: number): Shell[] {
  if (mat === 'wings') return wingShells();
  const c = mat === 'iron' ? IRON : HIDE;
  const iron = mat === 'iron';
  const box = (name: string, on: string, size: [number, number, number], from: [number, number, number], grow: number, paint: (p: FacePainter) => void): Shell =>
    ({ on, grow, def: { name, size, pivot: [0, 0, 0], from, base: c.base, noise: iron ? 0.05 : 0.07, paint } });
  switch (slot) {
    case 0: // helmet / cap
      return [box('a_helmet', 'head', [8, 8, 8], [-4, 0, -4], 1.15, (p) => {
        p.clear('bottom');
        if (iron) {
          p.fill('top', c.base, 0.05, 41);
          p.px('top', 3, 0, c.light, 2, 8);                                   // a ridge front to back
          for (const f of SIDES) { p.px(f, 0, 7, c.dark, 8, 1); p.px(f, 0, 2, c.dark, 8, 1); }
          p.clear('front', 1, 3, 6, 5);                                       // the face shows through
          p.px('front', 3, 3, c.dark, 2, 3);                                  // nose guard
          p.px('left', 1, 4, c.deep); p.px('left', 6, 4, c.deep); p.px('right', 1, 4, c.deep); p.px('right', 6, 4, c.deep); // rivets
        } else {
          for (const f of SIDES) p.px(f, 0, 2, c.dark, 8, 1);                // brim stitching
          p.px('top', 1, 3, c.dark, 6, 1); p.px('top', 3, 1, c.dark, 1, 6);  // seams on the crown
          p.clear('front', 0, 3, 8, 5);
          p.clear('left', 0, 5, 8, 3); p.clear('right', 0, 5, 8, 3);
          p.px('back', 0, 7, c.deep, 8, 1);
        }
      })];
    case 1: { // chestplate / tunic, with shoulder pieces
      const sleeve = (name: string, on: string) => box(name, on, [4, 6, 4], [-2, -4, -2], 1.2, (p) => {
        p.clear('bottom');
        for (const f of SIDES) p.px(f, 0, 5, iron ? c.deep : c.dark, 4, 1);
        if (iron) { p.px('top', 0, 0, c.light, 4, 1); p.px('front', 1, 1, c.deep); p.px('back', 2, 1, c.deep); }
      });
      return [
        box('a_chest', 'body', [8, 12, 4], [-4, 0, -2], 1.12, (p) => {
          p.clear('bottom');
          p.clear('top', 3, 1, 2, 2);                                         // neck hole
          if (iron) {
            p.px('front', 3, 1, c.light, 2, 9);                               // breastplate ridge
            p.px('front', 0, 0, c.dark, 8, 1); p.px('front', 1, 10, c.dark, 6, 1);
            p.px('front', 1, 2, c.deep); p.px('front', 6, 2, c.deep); p.px('front', 1, 8, c.deep); p.px('front', 6, 8, c.deep);
            p.px('back', 0, 0, c.dark, 8, 1); p.px('back', 3, 2, c.dark, 2, 8);
          } else {
            p.px('front', 2, 0, c.dark, 4, 2);                                // collar
            for (let y = 2; y < 9; y += 2) { p.px('front', 3, y, c.deep); p.px('front', 4, y + 1, c.deep); } // lacing
            p.px('front', 0, 10, c.dark, 8, 1); p.px('back', 0, 10, c.dark, 8, 1);
            p.px('left', 0, 10, c.dark, 4, 1); p.px('right', 0, 10, c.dark, 4, 1);
          }
        }),
        sleeve('a_sleeveL', 'armL'), sleeve('a_sleeveR', 'armR'),
      ];
    }
    case 2: { // leggings / pants: a belt and the upper legs
      const leg = (name: string, on: string) => box(name, on, [4, 9, 4], [-2, -9, -2], 1.12, (p) => {
        p.clear('top'); p.clear('bottom');
        for (const f of SIDES) p.px(f, 0, 8, c.dark, 4, 1);
        if (iron) { p.px('front', 1, 3, c.light, 2, 2); p.px('front', 1, 4, c.deep, 2, 1); }   // knee plate
        else p.px('left', 1, 0, c.deep, 1, 8);                                                     // side seam
      });
      return [
        box('a_belt', 'body', [8, 3, 4], [-4, 0, -2], 1.1, (p) => {
          p.clear('top'); p.clear('bottom');
          for (const f of SIDES) p.px(f, 0, 0, iron ? c.deep : c.dark, f === 'front' || f === 'back' ? 8 : 4, 1);
          p.px('front', 3, 1, iron ? c.light : c.deep, 2, 1);                                      // buckle
        }),
        leg('a_legL', 'legL'), leg('a_legR', 'legR'),
      ];
    }
    default: { // boots
      const boot = (name: string, on: string) => box(name, on, [4, 4, 4], [-2, -12, -2], 1.16, (p) => {
        p.clear('top');
        p.fill('bottom', iron ? c.deep : c.dark, 0.05, 5);
        for (const f of SIDES) p.px(f, 0, 3, iron ? c.deep : c.dark, 4, 1);                      // sole
        p.px('front', 0, 0, iron ? c.light : c.dark, 4, 1);                                        // cuff
        if (iron) p.px('front', 1, 1, c.dark, 2, 2);
      });
      return [boot('a_bootL', 'legL'), boot('a_bootR', 'legR')];
    }
  }
}

const cache = new Map<string, { model: BuiltModel; on: Map<string, string> }>();

function pieceModel(mat: Mat, slot: number): { model: BuiltModel; on: Map<string, string> } {
  const key = `${mat}:${slot}`;
  let m = cache.get(key);
  if (m) return m;
  const list = shells(mat, slot);
  const model = buildModel(list.map((s) => s.def), 64, 32, 300 + slot * 7 + (mat === 'iron' ? 1 : 0));
  const on = new Map<string, string>();
  for (const s of list) {
    on.set(s.def.name, s.on);
    // drawn a little bigger than the body part, around its own centre
    const pivot = model.parts.get(s.def.name)!;
    pivot.children[0].scale.setScalar(s.grow);
    // the wings spread a little outwards and back
    if (s.def.name === 'a_wingL') { pivot.rotation.z = 0.32; pivot.rotation.y = -0.25; }
    if (s.def.name === 'a_wingR') { pivot.rotation.z = -0.32; pivot.rotation.y = 0.25; }
  }
  m = { model, on };
  cache.set(key, m);
  return m;
}

/** Which armour material an item is made of (null: not armour this can show). */
function materialOf(id: string): Mat | null {
  if (id === 'star_wings') return 'wings';
  if (id.startsWith('leather_')) return 'leather';
  if (id.startsWith('iron_')) return 'iron';
  return null;
}

interface Worn { key: string; objs: THREE.Object3D[]; material: THREE.MeshLambertMaterial; tint: THREE.Color }

/** Dresses a humanoid model (its head/body/arm/leg pivots) in up to four armour pieces. */
export class ArmourDresser {
  private worn: (Worn | null)[] = [null, null, null, null];
  private level = 1;

  constructor(private parts: Map<string, THREE.Object3D>) {}

  /** Shows the armour in `slots` (head, chest, legs, feet); cheap when nothing changed. */
  set(slots: Slot[]): void {
    for (let i = 0; i < 4; i++) {
      const s = slots[i] ?? null;
      const mat = s ? materialOf(s.id) : null;
      const key = s && mat ? `${s.id}#${s.color ?? ''}` : '';
      if ((this.worn[i]?.key ?? '') === key) continue;
      this.take(i);
      if (!s || !mat) continue;
      const { model, on } = pieceModel(mat, i);
      const inst = instantiate(model);
      const objs: THREE.Object3D[] = [];
      for (const pivot of [...inst.root.children]) {
        const target = this.parts.get(on.get(pivot.name) ?? '');
        if (!target) continue;
        target.add(pivot);
        objs.push(pivot);
      }
      const tint = new THREE.Color(mat === 'leather' ? (s.color ?? LEATHER_TINT) : 0xffffff);
      this.worn[i] = { key, objs, material: inst.material, tint };
    }
    this.light(this.level);
  }

  /** World brightness 0..1, applied with each piece's colour. */
  light(b: number): void {
    this.level = b;
    for (const w of this.worn) if (w) w.material.color.copy(w.tint).multiplyScalar(b);
  }

  /** Is anything shown in this slot? */
  wearing(i: number): boolean {
    return !!this.worn[i];
  }

  private take(i: number): void {
    const w = this.worn[i];
    if (!w) return;
    for (const o of w.objs) o.removeFromParent();
    w.material.dispose();
    this.worn[i] = null;
  }

  dispose(): void {
    for (let i = 0; i < 4; i++) this.take(i);
  }
}
