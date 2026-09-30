import * as B from '../world/BlockRegistry';
import { DYE_COLORS, DYE_NAMES, woolKey } from '../world/dyes';

export type ItemKind = 'block' | 'item' | 'tool' | 'food' | 'armor' | 'spawn' | 'bow' | 'bucket' | 'boat' | 'rod';
export type Category = 'building' | 'decoration' | 'natural' | 'functional' | 'tools' | 'combat' | 'food' | 'ingredients' | 'spawn';
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';

export interface ToolInfo {
  type: ToolKind;
  tier: number;          // 0 wood, 1 stone, 2 iron
  speed: number;         // mining speed multiplier with the right block
  durability: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  maxStack: number;
  category: Category;
  block?: number;                        // block placed by this item
  tool?: ToolInfo;
  attack: number;                        // melee damage (hearts x2)
  durability?: number;                   // tools, armour, bow
  food?: { hunger: number; saturation: number };
  armor?: { slot: number; points: number }; // slot 0 head .. 3 feet
  spawn?: string;
  icon: { kind: 'iso'; block: number } | { kind: 'flat'; texture: string } | { kind: 'sprite'; name: string };
  fuel?: number;                         // furnace burn ticks
  smelt?: { result: string; xp: number };
}

const items: ItemDef[] = [];
const byId = new Map<string, ItemDef>();

function add(d: Partial<ItemDef> & { id: string; name: string; category: Category }): ItemDef {
  const def: ItemDef = {
    kind: 'item', maxStack: 64, attack: 1,
    icon: { kind: 'sprite', name: d.id },
    ...d,
  } as ItemDef;
  items.push(def);
  byId.set(def.id, def);
  return def;
}

function blockItem(key: string, category: Category, extra: Partial<ItemDef> = {}): ItemDef {
  const block = B.blockByKey(key) ?? B.blockByKey(key + ':s')!;
  const flat = block.render === B.RENDER_CROSS || block.render === B.RENDER_TORCH;
  return add({
    id: key, name: block.name, kind: 'block', category, block: block.id,
    icon: flat ? { kind: 'flat', texture: key === 'torch' ? 'torch' : key } : { kind: 'iso', block: block.id },
    ...extra,
  });
}

// ---- blocks
blockItem('grass', 'natural');
blockItem('dirt', 'natural');
blockItem('stone', 'building', { smelt: undefined });
blockItem('cobblestone', 'building', { smelt: { result: 'stone', xp: 0.1 } });
blockItem('mossy_cobblestone', 'building');
blockItem('planks', 'building', { fuel: 300 });
blockItem('log', 'natural', { fuel: 300, smelt: { result: 'coal', xp: 0.15 } });
blockItem('leaves', 'natural');
blockItem('sand', 'natural', { smelt: { result: 'glass', xp: 0.1 } });
blockItem('sandstone', 'building');
blockItem('gravel', 'natural');
blockItem('coal_ore', 'natural', { smelt: { result: 'coal', xp: 0.1 } });
blockItem('iron_ore', 'natural', { smelt: { result: 'iron_ingot', xp: 0.7 } });
blockItem('bricks', 'building');
blockItem('stone_bricks', 'building');
blockItem('glass', 'building');
blockItem('wool', 'building');
blockItem('snow', 'natural');
blockItem('snowy_grass', 'natural');
blockItem('bedrock', 'building');
blockItem('lumen', 'building');
blockItem('tall_grass', 'natural');
blockItem('flower_red', 'natural');
blockItem('flower_yellow', 'natural');
blockItem('crafting_table', 'functional', { fuel: 300 });
blockItem('furnace', 'functional');
blockItem('chest', 'functional', { fuel: 300 });
blockItem('torch', 'functional');

// ---- 1.1 blocks
/** Item for a block family registered under several ids (slabs, stairs, doors, beds). */
function familyItem(id: string, block: number, category: Category, sprite = false, extra: Partial<ItemDef> = {}): ItemDef {
  return add({
    id, name: B.getBlock(block).name, kind: 'block', category, block,
    icon: sprite ? { kind: 'sprite', name: id } : { kind: 'iso', block }, ...extra,
  });
}
for (const [item, ids] of Object.entries(B.SLABS)) familyItem(item, ids.bottom, 'building', false, item === 'oak_slab' ? { fuel: 150 } : {});
for (const [item, ids] of Object.entries(B.STAIRS)) familyItem(item, ids['n:bottom'], 'building', false, item === 'oak_stairs' ? { fuel: 300 } : {});
familyItem('oak_door', B.doorId('lower', 'n', false, 'l'), 'functional', true, { maxStack: 16, fuel: 200 });
familyItem('bed', B.bedId('foot', 'n'), 'functional', true, { maxStack: 1 });
blockItem('birch_log', 'natural', { fuel: 300, smelt: { result: 'coal', xp: 0.15 } });
blockItem('birch_leaves', 'natural');
blockItem('spruce_log', 'natural', { fuel: 300, smelt: { result: 'coal', xp: 0.15 } });
blockItem('spruce_leaves', 'natural');
blockItem('red_sand', 'natural', { smelt: { result: 'glass', xp: 0.1 } });
for (const k of ['terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta', 'white_terracotta']) blockItem(k, 'building');
blockItem('cactus', 'natural', { smelt: { result: 'green_dye', xp: 0.2 } });
blockItem('dead_bush', 'natural');
blockItem('rune_ore', 'natural');
blockItem('rune_table', 'functional');

// ---- 1.2 blocks
blockItem('path', 'building');
blockItem('hay_bale', 'building');
for (const k of ['grain_bin', 'forge', 'mason_bench', 'scribe_desk', 'fletching_bench']) blockItem(k, 'functional', k === 'grain_bin' || k === 'scribe_desk' || k === 'fletching_bench' ? { fuel: 300 } : {});

// ---- 1.4 decoration
familyItem('oak_fence', B.OAK_FENCE, 'decoration', true, { fuel: 300 });
familyItem('oak_fence_gate', B.gateId('n', false), 'decoration', true, { fuel: 300 });
familyItem('glass_pane', B.GLASS_PANE, 'decoration', false, { icon: { kind: 'flat', texture: 'glass' } });
familyItem('ladder', B.LADDERS.s, 'decoration', false, { icon: { kind: 'flat', texture: 'ladder' }, fuel: 300 });
familyItem('oak_trapdoor', B.trapdoorId('n', 'bottom', false), 'decoration', false, { fuel: 300 });
familyItem('sign', B.SIGN_STANDING, 'decoration', true, { maxStack: 16, fuel: 200 });
familyItem('lantern', B.LANTERN_STANDING, 'decoration', true);
familyItem('flower_pot', B.FLOWER_POT, 'decoration', true);
add({ id: 'painting', name: 'Painting', category: 'decoration' });
for (const c of DYE_COLORS) if (c !== 'white') blockItem(woolKey(c), 'decoration');
blockItem('flower_blue', 'natural');
blockItem('flower_white', 'natural');

// ---- ingredients
add({ id: 'stick', name: 'Stick', category: 'ingredients', fuel: 100 });
add({ id: 'coal', name: 'Coal', category: 'ingredients', fuel: 1600 });
add({ id: 'raw_iron', name: 'Raw Iron', category: 'ingredients', smelt: { result: 'iron_ingot', xp: 0.7 } });
add({ id: 'iron_ingot', name: 'Iron Ingot', category: 'ingredients' });
add({ id: 'flint', name: 'Flint', category: 'ingredients' });
add({ id: 'leather', name: 'Leather', category: 'ingredients' });
add({ id: 'feather', name: 'Feather', category: 'ingredients' });
add({ id: 'bone', name: 'Bone', category: 'ingredients' });
add({ id: 'string', name: 'String', category: 'ingredients' });
add({ id: 'rune_shard', name: 'Rune Shard', category: 'ingredients' });
add({ id: 'bucket', name: 'Bucket', kind: 'bucket', maxStack: 16, category: 'tools' });
add({ id: 'water_bucket', name: 'Water Bucket', kind: 'bucket', maxStack: 1, category: 'tools' });
// ---- 1.6 boats and fishing
add({ id: 'boat', name: 'Boat', kind: 'boat', maxStack: 1, category: 'tools', fuel: 1200 });
add({ id: 'fishing_rod', name: 'Fishing Rod', kind: 'rod', maxStack: 1, category: 'tools', durability: 64, fuel: 300 });
// ---- 1.2 items
add({ id: 'wheat_seeds', name: 'Wheat Seeds', category: 'ingredients', block: B.WHEAT[0] });
add({ id: 'wheat', name: 'Wheat', category: 'ingredients' });
add({ id: 'bone_meal', name: 'Bone Meal', category: 'ingredients' });
add({ id: 'amber', name: 'Amber', category: 'ingredients' });
// ---- 1.4 dyes
for (const c of DYE_COLORS) add({ id: `${c}_dye`, name: `${DYE_NAMES[c]} Dye`, category: 'ingredients' });

// ---- tools
const MATS: [string, string, number, number, number][] = [
  // prefix, display, tier, speed, durability
  ['wooden', 'Wooden', 0, 2, 59],
  ['stone', 'Stone', 1, 4, 131],
  ['iron', 'Iron', 2, 6, 250],
];
const ATTACK: Record<ToolKind, number[]> = { sword: [4, 5, 6], axe: [3, 4, 5], pickaxe: [2, 3, 4], shovel: [1.5, 2.5, 3.5], hoe: [1, 1, 1] };
for (const [p, disp, tier, speed, dur] of MATS) {
  for (const t of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'] as ToolKind[]) {
    add({
      id: `${p}_${t}`, name: `${disp} ${t[0].toUpperCase()}${t.slice(1)}`, kind: 'tool', maxStack: 1,
      category: t === 'sword' ? 'combat' : 'tools',
      tool: { type: t, tier, speed, durability: dur }, durability: dur, attack: ATTACK[t][tier],
      fuel: p === 'wooden' ? 200 : undefined,
    });
  }
}
add({ id: 'bow', name: 'Bow', kind: 'bow', maxStack: 1, category: 'combat', durability: 384, fuel: 300 });
add({ id: 'arrow', name: 'Arrow', category: 'combat' });

// ---- armour
const ARMOR: [string, string, number[], number[]][] = [
  ['leather', 'Leather', [1, 3, 2, 1], [55, 80, 75, 65]],
  ['iron', 'Iron', [2, 6, 5, 2], [165, 240, 225, 195]],
];
const PIECES = [['helmet', 'Cap'], ['chestplate', 'Tunic'], ['leggings', 'Pants'], ['boots', 'Boots']];
for (const [mat, disp, pts, durs] of ARMOR) {
  PIECES.forEach(([piece, leatherName], slot) => {
    const name = mat === 'leather' ? `Leather ${leatherName}` : `${disp} ${piece[0].toUpperCase()}${piece.slice(1)}`;
    add({
      id: `${mat}_${piece}`, name, kind: 'armor', maxStack: 1, category: 'combat',
      armor: { slot, points: pts[slot] }, durability: durs[slot],
    });
  });
}

// ---- food
const FOOD: [string, string, number, number, string?][] = [
  ['apple', 'Apple', 4, 2.4],
  ['raw_porkchop', 'Raw Porkchop', 3, 1.8, 'cooked_porkchop'],
  ['cooked_porkchop', 'Cooked Porkchop', 8, 12.8],
  ['raw_beef', 'Raw Beef', 3, 1.8, 'steak'],
  ['steak', 'Steak', 8, 12.8],
  ['raw_chicken', 'Raw Chicken', 2, 1.2, 'cooked_chicken'],
  ['cooked_chicken', 'Cooked Chicken', 6, 7.2],
  ['raw_mutton', 'Raw Mutton', 2, 1.2, 'cooked_mutton'],
  ['cooked_mutton', 'Cooked Mutton', 6, 9.6],
  ['spoiled_flesh', 'Spoiled Flesh', 4, 0.8],
  ['raw_rabbit', 'Raw Rabbit', 3, 1.8, 'cooked_rabbit'],
  ['cooked_rabbit', 'Cooked Rabbit', 5, 6],
  ['bread', 'Bread', 5, 6],
  ['carrot', 'Carrot', 3, 3.6],
  ['raw_trout', 'Raw Trout', 2, 0.4, 'cooked_trout'],
  ['cooked_trout', 'Cooked Trout', 5, 6],
  ['raw_perch', 'Raw Perch', 2, 0.4, 'cooked_perch'],
  ['cooked_perch', 'Cooked Perch', 6, 9.6],
];
for (const [id, name, hunger, saturation, cooked] of FOOD) {
  add({
    id, name, kind: 'food', category: 'food', food: { hunger, saturation },
    smelt: cooked ? { result: cooked, xp: 0.35 } : undefined,
    ...(id === 'carrot' ? { block: B.CARROTS[0] } : {}),
  });
}

// ---- spawn items
const MOBS: [string, string][] = [
  ['pig', 'Pig'], ['cow', 'Cow'], ['sheep', 'Sheep'], ['chicken', 'Chicken'], ['shambler', 'Shambler'], ['skeleton', 'Bone Archer'],
  ['goat', 'Goat'], ['rabbit', 'Rabbit'], ['crawler', 'Crawler'], ['dustwalker', 'Dustwalker'],
  ['villager', 'Villager'], ['sentinel', 'Sentinel'], ['hound', 'Fellhound'],
];
for (const [mob, name] of MOBS) {
  add({ id: `spawn_${mob}`, name: `${name} Spawn Egg`, kind: 'spawn', category: 'spawn', spawn: mob });
}

export const ITEMS: ReadonlyArray<ItemDef> = items;

export function getItem(id: string): ItemDef {
  return byId.get(id) ?? byId.get('stick')!;
}

export function hasItem(id: string): boolean {
  return byId.has(id);
}

export function maxStackOf(id: string): number {
  return byId.get(id)?.maxStack ?? 64;
}

/** Item for a block (e.g. pick block). Orientation variants map to the base item. */
export function itemForBlock(blockId: number): string | null {
  const b = B.getBlock(blockId);
  if (b.item && byId.has(b.item)) return b.item;
  return null;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  building: 'Building Blocks',
  decoration: 'Decoration Blocks',
  natural: 'Natural Blocks',
  functional: 'Functional Blocks',
  tools: 'Tools',
  combat: 'Combat',
  food: 'Food',
  ingredients: 'Ingredients',
  spawn: 'Spawn Items',
};
