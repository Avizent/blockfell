import { getItem } from './ItemRegistry';
import type { ItemStack, Slot } from './ItemStack';
import { mulberry32 } from '../core/rng';

/**
 * RUNES (Blockfell's enchanting)
 * ------------------------------
 * A Rune Table spends Rune Shards and experience levels to inscribe runes on
 * tools, weapons, bows and armour. Each rune has up to three ranks. Offers are
 * generated from a per-player "rune seed", so looking at the same item again
 * shows the same offers; the seed changes after every inscription.
 */
export type RuneId = 'swift' | 'sturdy' | 'keen' | 'warding' | 'soft_landing' | 'bounty' | 'might' | 'plunder';

export interface RuneDef {
  id: RuneId;
  name: string;
  max: number;
  describe: (lvl: number) => string;
}

export const RUNES: Record<RuneId, RuneDef> = {
  swift: { id: 'swift', name: 'Swift', max: 3, describe: (l) => `+${l * l + 1} mining speed` },
  sturdy: { id: 'sturdy', name: 'Sturdy', max: 3, describe: (l) => `${Math.round(100 - 100 / (l + 1))}% chance to take no wear` },
  keen: { id: 'keen', name: 'Keen Edge', max: 3, describe: (l) => `+${0.5 * l + 0.5} attack damage` },
  warding: { id: 'warding', name: 'Warding', max: 3, describe: (l) => `-${4 * l}% damage taken` },
  soft_landing: { id: 'soft_landing', name: 'Soft Landing', max: 3, describe: (l) => `-${12 * l}% fall damage` },
  bounty: { id: 'bounty', name: 'Bounty', max: 3, describe: (l) => `Ores may drop up to ${l + 1}x as much` },
  might: { id: 'might', name: 'Might', max: 3, describe: (l) => `+${25 * (l + 1)}% arrow damage` },
  plunder: { id: 'plunder', name: 'Plunder', max: 3, describe: (l) => `Creatures drop up to ${l} extra` },
};

const NUMERALS = ['', 'I', 'II', 'III'];
export function runeLabel(id: RuneId, lvl: number): string {
  return `${RUNES[id].name} ${NUMERALS[lvl] ?? lvl}`;
}

/** Runes that can go on an item. */
export function runesFor(itemId: string): RuneId[] {
  const d = getItem(itemId);
  if (d.tool) {
    switch (d.tool.type) {
      case 'pickaxe': return ['swift', 'sturdy', 'bounty'];
      case 'axe': return ['swift', 'sturdy', 'keen'];
      case 'shovel': return ['swift', 'sturdy'];
      case 'hoe': return ['sturdy'];
      case 'sword': return ['keen', 'sturdy', 'plunder'];
    }
  }
  if (d.kind === 'bow') return ['might', 'sturdy'];
  if (d.kind === 'rod') return ['sturdy'];
  if (d.armor) return d.armor.slot === 3 ? ['warding', 'sturdy', 'soft_landing'] : ['warding', 'sturdy'];
  return [];
}

export function canInscribe(s: Slot): boolean {
  return !!s && s.count === 1 && runesFor(s.id).length > 0 && !hasRunes(s);
}

export function hasRunes(s: Slot): boolean {
  return !!s?.ench && Object.keys(s.ench).length > 0;
}

export function runeLevel(s: Slot | undefined, id: RuneId): number {
  return (s?.ench?.[id] as number | undefined) ?? 0;
}

export interface RuneOffer {
  tier: number;          // 1..3
  minLevel: number;      // experience level needed
  cost: number;          // levels and shards spent
  runes: Partial<Record<RuneId, number>>;
}

/** Experience needed / levels and shards spent for the three offers. */
export const OFFER_TIERS = [
  { minLevel: 3, cost: 1 },
  { minLevel: 10, cost: 2 },
  { minLevel: 20, cost: 3 },
];

/** The three offers shown for an item (deterministic for a given seed). */
export function runeOffers(item: ItemStack, seed: number): RuneOffer[] {
  const pool = runesFor(item.id);
  if (!pool.length) return [];
  return OFFER_TIERS.map((t, i) => {
    const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1) ^ item.id.length * 7919) >>> 0);
    const runes: Partial<Record<RuneId, number>> = {};
    const count = i === 2 ? Math.min(2, pool.length) : i === 1 && rng() < 0.4 ? Math.min(2, pool.length) : 1;
    const order = [...pool].sort(() => rng() - 0.5);
    for (let k = 0; k < count; k++) {
      const id = order[k];
      const top = Math.min(RUNES[id].max, i + 1);
      runes[id] = Math.max(1, top - (rng() < 0.35 ? 1 : 0));
    }
    return { tier: i + 1, minLevel: t.minLevel, cost: t.cost, runes };
  });
}

/** Chance that a use wears the item (Sturdy); armour is harder to protect, like the reference game. */
export function wearChance(s: Slot, armour: boolean): number {
  const l = runeLevel(s, 'sturdy');
  if (!l) return 1;
  return armour ? 0.6 + 0.4 / (l + 1) : 1 / (l + 1);
}

/** Multiplier for mining speed with the right tool (Swift). */
export function swiftBonus(s: Slot): number {
  const l = runeLevel(s, 'swift');
  return l ? l * l + 1 : 0;
}
