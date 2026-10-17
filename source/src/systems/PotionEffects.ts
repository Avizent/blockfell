import { EFFECT_BY_ID, EFFECTS, type EffectId } from '../inventory/potions';

/** What the effects list shows: one row per active effect. */
export interface EffectRow { id: string; name: string; seconds: number; rgb: [number, number, number] }

/** What is saved with the world: remaining ticks per effect. */
export type SavedEffects = Record<string, number>;

/**
 * POTION EFFECTS (2.5): the timed brews on the player. Each effect has a number of
 * ticks left; drinking again resets it to the longer of the two (they never stack).
 * Game reads `has()` where an effect matters (speed, melee, healing, vision,
 * air, fire) and calls `tick()` once a tick.
 */
export class PotionEffects {
  private left = new Map<EffectId, number>();

  has(id: EffectId): boolean { return (this.left.get(id) ?? 0) > 0; }
  ticksLeft(id: EffectId): number { return this.left.get(id) ?? 0; }
  get any(): boolean { return this.left.size > 0; }

  /** Starts (or lengthens) an effect. Returns true if it was newly started. */
  add(id: EffectId, ticks: number): boolean {
    const had = this.has(id);
    this.left.set(id, Math.max(this.left.get(id) ?? 0, Math.max(1, Math.round(ticks))));
    return !had;
  }

  clear(): void { this.left.clear(); }

  /** One tick: counts every effect down. Returns the effects that just ran out. */
  tick(): EffectId[] {
    const ended: EffectId[] = [];
    for (const [id, n] of this.left) {
      if (n <= 1) { this.left.delete(id); ended.push(id); } else this.left.set(id, n - 1);
    }
    return ended;
  }

  /** The list for the screen (longest-lasting first is not needed: the order is the brewing list's). */
  rows(): EffectRow[] {
    const out: EffectRow[] = [];
    for (const e of EFFECTS) {
      const n = this.left.get(e.id);
      if (n) out.push({ id: e.id, name: e.name, seconds: Math.ceil(n / 20), rgb: e.rgb });
    }
    return out;
  }

  save(): SavedEffects | undefined {
    if (!this.left.size) return undefined;
    return Object.fromEntries(this.left);
  }

  load(s: SavedEffects | undefined): void {
    this.left.clear();
    if (!s) return;
    for (const [k, v] of Object.entries(s)) {
      if (EFFECT_BY_ID[k] && Number.isFinite(v) && v > 0) this.left.set(k as EffectId, Math.min(v, 20 * 60 * 30));
    }
  }
}
