import { Container } from './Inventory';
import { ItemStack, Slot, stacksMatch } from './ItemStack';
import { getItem, maxStackOf } from './ItemRegistry';
import { recipes } from '../crafting/recipes';
import { canInscribe } from './Enchantments';

export type SlotGroup = 'hotbar' | 'main' | 'armor' | 'offhand' | 'craft' | 'output' | 'chest' | 'furnace_in' | 'furnace_fuel' | 'furnace_out' | 'rune_item' | 'rune_shards';

export interface SlotRef {
  id: string;               // unique within the screen (React key / hit testing)
  container: Container;
  index: number;
  group: SlotGroup;
  armorSlot?: number;       // 0..3 for armour slots
}

export interface HandlerHooks {
  onCraft?: (result: ItemStack) => void;
  onFurnaceTake?: (stack: ItemStack, xp: number) => void;
  onDrop?: (stack: ItemStack) => void;
}

/**
 * All inventory click semantics live here (not in React components):
 * pick up / place / merge / swap, half-splitting, one-by-one placing, shift-click
 * transfer, drag distribution, double-click collection, number-key hotbar swaps,
 * crafting output and furnace output rules.
 */
export class ScreenHandler {
  readonly slots: SlotRef[] = [];
  private byGroup = new Map<SlotGroup, SlotRef[]>();
  craftWidth = 0;
  craftGrid: Container | null = null;
  craftOutput: Container | null = null;
  furnaceXp?: () => number;

  constructor(public cursor: { stack: Slot }, private hooks: HandlerHooks = {}) {}

  addGroup(group: SlotGroup, container: Container, start: number, count: number, extra: Partial<SlotRef> = {}): SlotRef[] {
    const refs: SlotRef[] = [];
    for (let i = 0; i < count; i++) {
      const r: SlotRef = { id: `${group}:${start + i}`, container, index: start + i, group, ...extra };
      if (group === 'armor') r.armorSlot = i;
      refs.push(r);
      this.slots.push(r);
    }
    this.byGroup.set(group, [...(this.byGroup.get(group) ?? []), ...refs]);
    return refs;
  }

  /** Sets up a crafting grid of width w (2 or 3) with its output slot. */
  addCrafting(grid: Container, output: Container, w: number): void {
    this.craftGrid = grid;
    this.craftOutput = output;
    this.craftWidth = w;
    this.addGroup('craft', grid, 0, w * w);
    this.addGroup('output', output, 0, 1);
    this.updateCraftResult();
  }

  group(g: SlotGroup): SlotRef[] {
    return this.byGroup.get(g) ?? [];
  }

  get(ref: SlotRef): Slot {
    return ref.container.get(ref.index);
  }

  private put(ref: SlotRef, s: Slot): void {
    ref.container.set(ref.index, s);
    if (ref.group === 'craft') this.updateCraftResult();
  }

  updateCraftResult(): void {
    if (!this.craftGrid || !this.craftOutput) return;
    const r = recipes.match(this.craftGrid.slots, this.craftWidth);
    this.craftOutput.slots[0] = r ? { ...r.result } : null;
    this.craftOutput.changed();
  }

  /** Max stack a slot accepts for a given item (0 = not accepted). */
  capacity(ref: SlotRef, stack: ItemStack): number {
    const def = getItem(stack.id);
    switch (ref.group) {
      case 'output':
      case 'furnace_out':
        return 0;
      case 'armor':
        return def.armor && def.armor.slot === ref.armorSlot ? 1 : 0;
      case 'furnace_fuel':
        return def.fuel ? def.maxStack : 0;
      case 'rune_item':
        return canInscribe({ ...stack, count: 1 }) ? 1 : 0;
      case 'rune_shards':
        return stack.id === 'rune_shard' ? def.maxStack : 0;
      default:
        return def.maxStack;
    }
  }

  // ------------------------------------------------------------------ clicks
  click(ref: SlotRef, button: 0 | 1, shift: boolean): void {
    if (ref.group === 'output') { this.takeCraft(shift); return; }
    if (ref.group === 'furnace_out') { this.takeFurnace(ref, shift); return; }
    if (shift) { this.quickMove(ref); return; }
    const slot = this.get(ref);
    const cur = this.cursor.stack;
    if (button === 0) {
      if (!cur) {
        if (slot) { this.cursor.stack = slot; this.put(ref, null); }
      } else if (!slot) {
        const cap = this.capacity(ref, cur);
        if (cap <= 0) return;
        const n = Math.min(cap, cur.count);
        this.put(ref, { ...cur, count: n });
        this.setCursorCount(cur.count - n);
      } else if (stacksMatch(slot, cur)) {
        const cap = this.capacity(ref, cur);
        const n = Math.min(cap - slot.count, cur.count);
        if (n > 0) { slot.count += n; this.put(ref, slot); this.setCursorCount(cur.count - n); }
      } else if (this.capacity(ref, cur) >= cur.count) {
        this.put(ref, cur);
        this.cursor.stack = slot;
      }
    } else {
      if (!cur) {
        if (slot) {
          const half = Math.ceil(slot.count / 2);
          this.cursor.stack = { ...slot, count: half };
          slot.count -= half;
          this.put(ref, slot.count > 0 ? slot : null);
        }
      } else if (!slot) {
        if (this.capacity(ref, cur) <= 0) return;
        this.put(ref, { ...cur, count: 1 });
        this.setCursorCount(cur.count - 1);
      } else if (stacksMatch(slot, cur)) {
        if (slot.count < this.capacity(ref, cur)) {
          slot.count++;
          this.put(ref, slot);
          this.setCursorCount(cur.count - 1);
        }
      } else if (this.capacity(ref, cur) >= cur.count) {
        this.put(ref, cur);
        this.cursor.stack = slot;
      }
    }
  }

  private setCursorCount(n: number): void {
    if (!this.cursor.stack) return;
    if (n <= 0) this.cursor.stack = null;
    else this.cursor.stack = { ...this.cursor.stack, count: n };
  }

  /** Shift-click: move a stack to the "other side" of the screen. */
  quickMove(ref: SlotRef): void {
    const s = this.get(ref);
    if (!s) return;
    const targets = this.shiftTargets(ref, s);
    const stack = { ...s };
    this.moveInto(stack, targets);
    this.put(ref, stack.count > 0 ? stack : null);
  }

  private shiftTargets(ref: SlotRef, s: ItemStack): SlotRef[] {
    const def = getItem(s.id);
    const hot = this.group('hotbar'), main = this.group('main');
    const has = (g: SlotGroup) => this.group(g).length > 0;
    switch (ref.group) {
      case 'hotbar':
      case 'main': {
        const other = ref.group === 'hotbar' ? main : hot;
        if (has('chest')) return this.group('chest');
        if (has('rune_item')) {
          if (s.id === 'rune_shard') return this.group('rune_shards');
          if (canInscribe({ ...s, count: 1 }) && !this.get(this.group('rune_item')[0])) return this.group('rune_item');
          return other;
        }
        if (has('furnace_in')) {
          if (def.smelt) return this.group('furnace_in');
          if (def.fuel) return this.group('furnace_fuel');
          return other;
        }
        if (def.armor && has('armor')) {
          const a = this.group('armor')[def.armor.slot];
          if (!this.get(a)) return [a];
        }
        return other;
      }
      default:
        return [...main, ...hot];
    }
  }

  /** Merge into matching stacks first, then empty slots, respecting capacities. */
  private moveInto(stack: ItemStack, targets: SlotRef[]): void {
    for (const t of targets) {
      if (stack.count <= 0) return;
      const s = this.get(t);
      if (s && stacksMatch(s, stack)) {
        const n = Math.min(this.capacity(t, stack) - s.count, stack.count);
        if (n > 0) { s.count += n; stack.count -= n; this.put(t, s); }
      }
    }
    for (const t of targets) {
      if (stack.count <= 0) return;
      if (!this.get(t)) {
        const cap = this.capacity(t, stack);
        if (cap <= 0) continue;
        const n = Math.min(cap, stack.count);
        this.put(t, { ...stack, count: n });
        stack.count -= n;
      }
    }
  }

  private consumeCraftGrid(): void {
    const g = this.craftGrid!;
    for (let i = 0; i < g.size; i++) {
      const s = g.get(i);
      if (!s) continue;
      s.count--;
      g.slots[i] = s.count > 0 ? s : null;
    }
    g.changed();
    this.updateCraftResult();
  }

  private takeCraft(shift: boolean): void {
    const out = this.craftOutput?.get(0);
    if (!out) return;
    if (shift) {
      let guard = 0;
      while (guard++ < 64) {
        const r = this.craftOutput!.get(0);
        if (!r || r.id !== out.id) break;
        const stack = { ...r };
        const targets = [...this.group('main'), ...this.group('hotbar')];
        // only craft if the whole result fits
        if (!this.fits(stack, targets)) break;
        this.moveInto(stack, targets);
        this.hooks.onCraft?.({ ...r });
        this.consumeCraftGrid();
      }
      return;
    }
    const cur = this.cursor.stack;
    if (!cur) this.cursor.stack = { ...out };
    else if (stacksMatch(cur, out) && cur.count + out.count <= maxStackOf(out.id)) this.cursor.stack = { ...cur, count: cur.count + out.count };
    else return;
    this.hooks.onCraft?.({ ...out });
    this.consumeCraftGrid();
  }

  private fits(stack: ItemStack, targets: SlotRef[]): boolean {
    let room = 0;
    for (const t of targets) {
      const s = this.get(t);
      const cap = this.capacity(t, stack);
      if (!s) room += cap;
      else if (stacksMatch(s, stack)) room += Math.max(0, cap - s.count);
      if (room >= stack.count) return true;
    }
    return false;
  }

  private takeFurnace(ref: SlotRef, shift: boolean): void {
    const s = this.get(ref);
    if (!s) return;
    // stored experience is only paid out once something is actually taken
    const xp = () => (this.furnaceXp ? this.furnaceXp() : 0);
    if (shift) {
      const stack = { ...s };
      this.moveInto(stack, [...this.group('main'), ...this.group('hotbar')]);
      const moved = s.count - stack.count;
      if (moved > 0) this.hooks.onFurnaceTake?.({ ...s, count: moved }, xp());
      this.put(ref, stack.count > 0 ? stack : null);
      return;
    }
    const cur = this.cursor.stack;
    if (!cur) { this.cursor.stack = s; this.put(ref, null); this.hooks.onFurnaceTake?.(s, xp()); }
    else if (stacksMatch(cur, s)) {
      const n = Math.min(maxStackOf(s.id) - cur.count, s.count);
      if (n <= 0) return;
      this.cursor.stack = { ...cur, count: cur.count + n };
      s.count -= n;
      this.put(ref, s.count > 0 ? s : null);
      this.hooks.onFurnaceTake?.({ ...s, count: n }, xp());
    }
  }

  /** Double-click: gather matching items from the screen onto the cursor. */
  collect(): void {
    const cur = this.cursor.stack;
    if (!cur) return;
    const max = maxStackOf(cur.id);
    for (const pass of [0, 1]) {
      for (const r of this.slots) {
        if (cur.count >= max) break;
        if (r.group === 'output' || r.group === 'furnace_out') continue;
        const s = this.get(r);
        if (!s || !stacksMatch(s, cur)) continue;
        if (pass === 0 && s.count >= maxStackOf(s.id)) continue; // partial stacks first
        const n = Math.min(max - cur.count, s.count);
        cur.count += n;
        s.count -= n;
        this.put(r, s.count > 0 ? s : null);
      }
    }
    this.cursor.stack = { ...cur };
  }

  /**
   * Drag distribution. Left-drag splits the cursor stack evenly across the
   * dragged slots; right-drag places one item in each.
   */
  distribute(refs: SlotRef[], button: 0 | 1): void {
    const cur = this.cursor.stack;
    if (!cur || refs.length === 0) return;
    const valid = refs.filter((r) => {
      const s = this.get(r);
      return this.capacity(r, cur) > 0 && (!s || stacksMatch(s, cur));
    });
    if (valid.length === 0) return;
    let remaining = cur.count;
    const each = button === 0 ? Math.floor(cur.count / valid.length) : 1;
    if (each <= 0) return;
    for (const r of valid) {
      if (remaining <= 0) break;
      const s = this.get(r);
      const cap = this.capacity(r, cur);
      const have = s ? s.count : 0;
      const n = Math.min(each, cap - have, remaining);
      if (n <= 0) continue;
      this.put(r, { ...cur, count: have + n });
      remaining -= n;
    }
    this.setCursorCount(remaining);
  }

  /** Number key while hovering: swap with hotbar slot n. */
  hotbarSwap(ref: SlotRef, n: number): void {
    const hot = this.group('hotbar')[n];
    if (!hot || hot === ref) return;
    if (ref.group === 'output') return;
    const a = this.get(ref), b = this.get(hot);
    if (b && this.capacity(ref, b) < b.count) return;
    if (a && ref.group === 'furnace_out') {
      if (b) return;
      this.put(hot, a); this.put(ref, null);
      return;
    }
    this.put(ref, b);
    this.put(hot, a);
  }

  /** Q while hovering: drop one (or the whole stack). */
  dropFrom(ref: SlotRef, all: boolean): void {
    if (ref.group === 'output') return;
    const s = this.get(ref);
    if (!s) return;
    const n = all ? s.count : 1;
    this.hooks.onDrop?.({ ...s, count: n });
    s.count -= n;
    this.put(ref, s.count > 0 ? s : null);
  }

  /** Clicking outside the window with an item on the cursor throws it. */
  dropCursor(button: 0 | 1): void {
    const cur = this.cursor.stack;
    if (!cur) return;
    const n = button === 0 ? cur.count : 1;
    this.hooks.onDrop?.({ ...cur, count: n });
    this.setCursorCount(cur.count - n);
  }
}

export function stackFits(a: Slot, b: ItemStack): boolean {
  return !a || (stacksMatch(a, b) && a.count + b.count <= maxStackOf(b.id));
}
