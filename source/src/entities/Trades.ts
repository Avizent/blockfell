import type { Profession } from '../world/BlockRegistry';

/**
 * VILLAGER TRADES
 * ---------------
 * Every profession has four levels (Novice to Expert). A villager starts with two
 * offers from its Novice pool and learns two more each time it levels up.
 * Offers are either "buy" (the villager pays Amber for goods) or "sell" (the
 * player pays Amber). Each offer can be used a limited number of times before
 * the villager needs to restock at its workstation.
 */
export interface Trade {
  cost: [string, number];
  cost2?: [string, number];
  result: [string, number];
  ench?: Record<string, number>;
  uses: number;
  maxUses: number;
  xp: number;        // villager experience per trade
  tier: number;      // 1..4, level that unlocked it
}

export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert'];
/** Villager experience needed to reach level 2, 3 and 4. */
export const LEVEL_XP = [0, 10, 40, 90];
export const PROFESSION_NAMES: Record<Profession, string> = {
  farmer: 'Farmer', smith: 'Smith', mason: 'Mason', scribe: 'Scribe', fletcher: 'Fletcher', mapmaker: 'Mapmaker',
};

type O = { cost: [string, number]; cost2?: [string, number]; result: [string, number]; ench?: Record<string, number>; max?: number; always?: boolean };
const buy = (item: string, n: number, amber = 1, max = 16): O => ({ cost: [item, n], result: ['amber', amber], max });
const sell = (amber: number, item: string, n = 1, ench?: Record<string, number>, max = 12): O => ({ cost: ['amber', amber], result: [item, n], ench, max });
/** An offer every villager of the profession has at that level. */
const always = (o: O): O => ({ ...o, always: true });

const POOLS: Record<Profession, O[][]> = {
  farmer: [
    [buy('wheat', 18), buy('carrot', 15), sell(1, 'bread', 6), buy('wheat_seeds', 24)],
    [sell(1, 'apple', 4), sell(1, 'bone_meal', 12), sell(2, 'hay_bale', 3), sell(1, 'cooked_rabbit', 3)],
    [sell(1, 'cooked_porkchop', 3), sell(1, 'steak', 3), buy('raw_beef', 8), sell(3, 'grain_bin')],
    [sell(5, 'iron_hoe', 1, { sturdy: 3 }, 3), sell(2, 'bread', 16), sell(3, 'carrot', 32)],
  ],
  smith: [
    [buy('coal', 15), sell(3, 'iron_axe'), sell(2, 'iron_shovel'), buy('raw_iron', 6)],
    [buy('iron_ingot', 4), sell(5, 'iron_helmet', 1, undefined, 4), sell(4, 'iron_boots', 1, undefined, 4), sell(3, 'bucket')],
    [sell(9, 'iron_chestplate', 1, undefined, 3), sell(7, 'iron_leggings', 1, undefined, 3), sell(4, 'iron_sword'), sell(5, 'iron_pickaxe')],
    [sell(12, 'iron_pickaxe', 1, { swift: 2, sturdy: 1 }, 3), sell(14, 'iron_sword', 1, { keen: 2, sturdy: 1 }, 3), sell(16, 'iron_chestplate', 1, { warding: 2 }, 3)],
  ],
  mason: [
    [buy('stone', 16), sell(1, 'bricks', 10), sell(1, 'stone_bricks', 12), buy('cobblestone', 32)],
    [sell(1, 'glass', 6), sell(1, 'terracotta', 8), buy('sandstone', 16), sell(1, 'brick_stairs', 6)],
    [sell(1, 'orange_terracotta', 8), sell(1, 'stone_brick_slab', 12), sell(1, 'yellow_terracotta', 8), sell(1, 'flower_pot', 3)],
    [sell(3, 'lumen', 2, undefined, 8), sell(1, 'white_terracotta', 8), sell(2, 'brown_terracotta', 12)],
  ],
  scribe: [
    [buy('feather', 10), buy('leather', 6), sell(1, 'rune_shard', 2), buy('string', 12)],
    [sell(3, 'rune_shard', 5), sell(5, 'iron_boots', 1, { soft_landing: 2 }, 3), sell(6, 'rune_table', 1, undefined, 2), buy('bone', 16)],
    [sell(6, 'bow', 1, { might: 2 }, 3), sell(8, 'iron_helmet', 1, { warding: 2 }, 3), sell(2, 'torch', 16), sell(2, 'painting', 1)],
    [sell(12, 'iron_chestplate', 1, { warding: 3 }, 2), sell(10, 'iron_pickaxe', 1, { bounty: 2 }, 2), sell(6, 'rune_shard', 12, undefined, 4)],
  ],
  fletcher: [
    [buy('stick', 32), sell(1, 'arrow', 12), buy('flint', 10), buy('feather', 12)],
    [sell(2, 'bow'), buy('string', 10), sell(1, 'flint', 10), sell(2, 'arrow', 24)],
    [sell(6, 'bow', 1, { might: 1 }, 3), sell(3, 'arrow', 40)],
    [sell(12, 'bow', 1, { might: 3, sturdy: 2 }, 2), sell(8, 'bow', 1, { might: 2 }, 3)],
  ],
  // 1.8: the Mapmaker draws maps to the ruins, dungeons and villages around (the map is
  // drawn when you buy it: see Game.drawMap)
  mapmaker: [
    [always(sell(4, 'ruin_map', 1, undefined, 2)), buy('leather', 6), buy('feather', 10), buy('string', 12)],
    [always(sell(7, 'dungeon_map', 1, undefined, 2)), sell(1, 'torch', 12), buy('glass', 8), sell(2, 'ladder', 8)],
    [always(sell(5, 'village_map', 1, undefined, 2)), sell(2, 'painting'), sell(2, 'lantern', 2), sell(3, 'sign', 3)],
    [sell(9, 'dungeon_map', 1, undefined, 4), sell(4, 'map_table', 1, undefined, 3), sell(6, 'bell', 1, undefined, 2)],
  ],
};
const TRADE_XP = [2, 5, 10, 15];

/** Picks `n` distinct offers for a level from a seeded random source. */
export function tradesFor(p: Profession, level: number, rng: () => number, n = 2): Trade[] {
  const pool = POOLS[p][Math.max(0, Math.min(3, level - 1))];
  const fixed = pool.filter((o) => o.always);
  const picked = [...fixed, ...pool.filter((o) => !o.always).sort(() => rng() - 0.5)].slice(0, Math.max(n, fixed.length));
  return picked.map((o) => ({
    cost: o.cost, cost2: o.cost2, result: o.result, ench: o.ench, uses: 0, maxUses: o.max ?? 12,
    xp: TRADE_XP[level - 1], tier: level,
  }));
}

/** Villager level (1..4) for an amount of trading experience. */
export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1;
  return l;
}
