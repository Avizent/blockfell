import { ItemStack, Slot, cloneStack, makeStack, stacksMatch } from './ItemStack';
import { wearChance } from './Enchantments';
import { getItem, maxStackOf } from './ItemRegistry';

export const HOTBAR_START = 0;
export const MAIN_START = 9;
export const ARMOR_START = 36; // head, chest, legs, feet
export const OFFHAND = 40;
export const INVENTORY_SIZE = 41;

/** Generic slot container (player inventory, chests, furnaces, crafting grids). */
export class Container {
  slots: Slot[];
  version = 0;
  onChange?: () => void;

  constructor(size: number) {
    this.slots = new Array(size).fill(null);
  }

  get size(): number { return this.slots.length; }

  get(i: number): Slot { return this.slots[i]; }

  set(i: number, s: Slot): void {
    this.slots[i] = s && s.count > 0 ? s : null;
    this.changed();
  }

  changed(): void {
    this.version++;
    this.onChange?.();
  }

  /**
   * Inserts a stack into slots [from, to) : first merging with matching stacks,
   * then filling empty slots. Mutates `stack.count`; returns the leftover count.
   */
  insert(stack: ItemStack, order: number[]): number {
    const max = maxStackOf(stack.id);
    for (const i of order) {
      if (stack.count <= 0) break;
      const s = this.slots[i];
      if (s && stacksMatch(s, stack) && s.count < max) {
        const n = Math.min(max - s.count, stack.count);
        s.count += n;
        stack.count -= n;
      }
    }
    for (const i of order) {
      if (stack.count <= 0) break;
      if (!this.slots[i]) {
        const n = Math.min(max, stack.count);
        this.slots[i] = { ...stack, count: n };
        stack.count -= n;
      }
    }
    this.changed();
    return stack.count;
  }

  clear(): void {
    this.slots.fill(null);
    this.changed();
  }

  toJSON(): Slot[] {
    return this.slots.map(cloneStack);
  }

  load(data: Slot[] | undefined): void {
    if (!data) return;
    for (let i = 0; i < this.slots.length; i++) {
      const s = data[i];
      this.slots[i] = s && s.id && s.count > 0 ? { id: s.id, count: s.count, ...(s.damage ? { damage: s.damage } : {}), ...(cleanRunes(s.ench) ?? {}) } : null;
    }
    this.changed();
  }
}

/** Validated copy of saved runes ({ ench } or undefined when there are none). */
function cleanRunes(e: unknown): { ench: Record<string, number> } | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(e as Record<string, unknown>)) if (typeof v === 'number' && v > 0) out[k] = Math.min(3, Math.floor(v));
  return Object.keys(out).length ? { ench: out } : undefined;
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
export const HOTBAR_ORDER = range(0, 9);
export const MAIN_ORDER = range(9, 36);
export const PICKUP_ORDER = [...HOTBAR_ORDER, ...MAIN_ORDER];

/** The player's 41-slot inventory: hotbar (0-8), main (9-35), armour (36-39), off-hand (40). */
export class PlayerInventory extends Container {
  selected = 0;

  constructor() {
    super(INVENTORY_SIZE);
  }

  get selectedStack(): Slot {
    return this.slots[this.selected];
  }

  get offhand(): Slot {
    return this.slots[OFFHAND];
  }

  /** Adds an item picked up from the world. Returns the number that did not fit. */
  add(stack: ItemStack): number {
    return this.insert({ ...stack }, PICKUP_ORDER);
  }

  canFit(stack: ItemStack): number {
    const max = maxStackOf(stack.id);
    let room = 0;
    for (const i of PICKUP_ORDER) {
      const s = this.slots[i];
      if (!s) room += max;
      else if (stacksMatch(s, stack)) room += max - s.count;
      if (room >= stack.count) return stack.count;
    }
    return room;
  }

  /** Removes `n` items from a slot; returns what was removed. */
  take(i: number, n: number): Slot {
    const s = this.slots[i];
    if (!s) return null;
    const k = Math.min(n, s.count);
    const out = { ...s, count: k };
    s.count -= k;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  countItem(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  consumeItem(id: string, n: number): boolean {
    if (this.countItem(id) < n) return false;
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(n, s.count);
        s.count -= k; n -= k;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return true;
  }

  /** Damages the item in a slot; returns true if it broke. */
  damageItem(i: number, amount = 1): boolean {
    const s = this.slots[i];
    if (!s) return false;
    const def = getItem(s.id);
    if (!def.durability) return false;
    // Sturdy runes give each point of wear a chance to be ignored
    const chance = wearChance(s, !!def.armor);
    let n = 0;
    for (let k = 0; k < amount; k++) if (chance >= 1 || Math.random() < chance) n++;
    if (n === 0) return false;
    s.damage = (s.damage ?? 0) + n;
    if (s.damage >= def.durability) {
      this.slots[i] = null;
      this.changed();
      return true;
    }
    this.changed();
    return false;
  }

  armorPoints(): number {
    let p = 0;
    for (let i = 0; i < 4; i++) {
      const s = this.slots[ARMOR_START + i];
      if (s) p += getItem(s.id).armor?.points ?? 0;
    }
    return p;
  }

  /** Creative pick-block: select existing stack, or put one in the hotbar. */
  pickBlock(id: string, creative: boolean): void {
    for (let i = 0; i < 9; i++) if (this.slots[i]?.id === id) { this.selected = i; this.changed(); return; }
    if (!creative) {
      for (let i = 9; i < 36; i++) {
        if (this.slots[i]?.id === id) {
          const t = this.slots[this.selected];
          this.slots[this.selected] = this.slots[i];
          this.slots[i] = t;
          this.changed();
          return;
        }
      }
      return;
    }
    let target = this.selected;
    if (this.slots[target]) {
      const empty = HOTBAR_ORDER.find((i) => !this.slots[i]);
      if (empty !== undefined) target = empty;
    }
    this.selected = target;
    this.slots[target] = makeStack(id, maxStackOf(id));
    this.changed();
  }
}
