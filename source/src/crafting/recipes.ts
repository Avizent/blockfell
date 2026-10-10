import { RecipeManager } from './RecipeManager';
import { DYE_COLORS, DYE_RGB, DyeColor, woolKey } from '../world/dyes';
import { cloneStack, type ItemStack, type Slot } from '../inventory/ItemStack';

export const recipes = new RecipeManager();

const shaped = (pattern: string[], key: Record<string, string>, id: string, count = 1) =>
  recipes.add({ type: 'shaped', pattern, key, result: { id, count } });
const shapeless = (ingredients: string[], id: string, count = 1) =>
  recipes.add({ type: 'shapeless', ingredients, result: { id, count } });

shapeless(['log'], 'planks', 4);
shapeless(['birch_log'], 'planks', 4);
shapeless(['spruce_log'], 'planks', 4);
shaped(['P', 'P'], { P: 'planks' }, 'stick', 4);
shaped(['PP', 'PP'], { P: 'planks' }, 'crafting_table');
shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, 'chest');
shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace');
shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone');
shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
shaped(['SS', 'SS'], { S: 'string' }, 'wool');
shaped([' TS', 'T S', ' TS'], { T: 'stick', S: 'string' }, 'bow');
shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);
// ---- 1.6 boats and fishing
shaped(['P P', 'PPP'], { P: 'planks' }, 'boat');
shaped(['  T', ' TS', 'T S'], { T: 'stick', S: 'string' }, 'fishing_rod');

const TOOL_MATS: [string, string][] = [['wooden', 'planks'], ['stone', 'cobblestone'], ['iron', 'iron_ingot']];
for (const [p, m] of TOOL_MATS) {
  shaped(['MMM', ' S ', ' S '], { M: m, S: 'stick' }, `${p}_pickaxe`);
  shaped(['MM', 'MS', ' S'], { M: m, S: 'stick' }, `${p}_axe`);
  shaped(['M', 'S', 'S'], { M: m, S: 'stick' }, `${p}_shovel`);
  shaped(['M', 'M', 'S'], { M: m, S: 'stick' }, `${p}_sword`);
}
for (const [p, m] of [['leather', 'leather'], ['iron', 'iron_ingot']]) {
  shaped(['MMM', 'M M'], { M: m }, `${p}_helmet`);
  shaped(['M M', 'MMM', 'MMM'], { M: m }, `${p}_chestplate`);
  shaped(['MMM', 'M M', 'M M'], { M: m }, `${p}_leggings`);
  shaped(['M M', 'M M'], { M: m }, `${p}_boots`);
}

// ---- 1.1
const SLAB_MATS: [string, string][] = [['oak', 'planks'], ['cobblestone', 'cobblestone'], ['stone', 'stone'], ['stone_brick', 'stone_bricks'], ['sandstone', 'sandstone'], ['brick', 'bricks']];
for (const [key, mat] of SLAB_MATS) {
  shaped(['MMM'], { M: mat }, `${key}_slab`, 6);
  if (key !== 'stone') shaped(['M  ', 'MM ', 'MMM'], { M: mat }, `${key}_stairs`, 4);
}
shaped(['PP', 'PP', 'PP'], { P: 'planks' }, 'oak_door', 3);
shaped(['WWW', 'PPP'], { W: 'wool', P: 'planks' }, 'bed');
shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket');
shaped([' R ', 'RIR', 'SSS'], { R: 'rune_shard', I: 'iron_ingot', S: 'stone_bricks' }, 'rune_table');

// ---- 1.2: farming and villages
for (const [p, m] of TOOL_MATS) shaped(['MM', ' S', ' S'], { M: m, S: 'stick' }, `${p}_hoe`);
shaped(['WWW'], { W: 'wheat' }, 'bread');
shaped(['WWW', 'WWW', 'WWW'], { W: 'wheat' }, 'hay_bale');
shapeless(['hay_bale'], 'wheat', 9);
shapeless(['bone'], 'bone_meal', 3);
shaped(['P P', 'PWP', 'PPP'], { P: 'planks', W: 'wheat' }, 'grain_bin');
shaped([' I ', 'CFC', 'CCC'], { I: 'iron_ingot', C: 'cobblestone', F: 'furnace' }, 'forge');
shaped([' I ', 'SSS'], { I: 'iron_ingot', S: 'stone' }, 'mason_bench');
shaped(['FL', 'PP', 'PP'], { F: 'feather', L: 'leather', P: 'planks' }, 'scribe_desk');
shaped(['F F', 'PPP'], { F: 'flint', P: 'planks' }, 'fletching_bench');
// ---- 1.8: village life
shaped(['SPS', 'SIS', ' I '], { S: 'stick', P: 'planks', I: 'iron_ingot' }, 'bell');
shaped(['CC', 'PP', 'PP'], { C: 'coal', P: 'planks' }, 'map_table');

// ---- 1.4: decoration
shaped(['PSP', 'PSP'], { P: 'planks', S: 'stick' }, 'oak_fence', 3);
shaped(['SPS', 'SPS'], { P: 'planks', S: 'stick' }, 'oak_fence_gate');
shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
shaped(['PPP', 'PPP'], { P: 'planks' }, 'oak_trapdoor', 2);
shaped(['GGG', 'GGG'], { G: 'glass' }, 'glass_pane', 16);
shaped(['PPP', 'PPP', ' S '], { P: 'planks', S: 'stick' }, 'sign', 3);
shaped([' I ', 'GTG', ' G '], { I: 'iron_ingot', G: 'glass', T: 'torch' }, 'lantern', 2);
for (const m of ['bricks', 'terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta', 'white_terracotta']) {
  shaped(['M M', ' M '], { M: m }, 'flower_pot');
}
for (const c of DYE_COLORS) shaped(['SSS', 'SWS', 'SSS'], { S: 'stick', W: woolKey(c) }, 'painting');

// dyes: flowers and a few other things give the base colours...
shapeless(['flower_red'], 'red_dye', 2);
shapeless(['flower_yellow'], 'yellow_dye', 2);
shapeless(['flower_blue'], 'blue_dye', 2);
shapeless(['flower_white'], 'white_dye', 2);
shapeless(['bone_meal'], 'white_dye');
shapeless(['coal'], 'black_dye');
shapeless(['dead_bush'], 'brown_dye');
// (cactus smelts into green dye)
// ...and two dyes mix into a new one
const MIX: [DyeColor, DyeColor, DyeColor][] = [
  ['red', 'yellow', 'orange'], ['red', 'white', 'pink'], ['green', 'white', 'lime'], ['blue', 'white', 'light_blue'],
  ['black', 'white', 'gray'], ['gray', 'white', 'light_gray'], ['blue', 'green', 'cyan'], ['red', 'blue', 'purple'],
  ['purple', 'pink', 'magenta'], ['red', 'green', 'brown'],
];
for (const [a, b, out] of MIX) shapeless([`${a}_dye`, `${b}_dye`], `${out}_dye`, 2);
shapeless(['black_dye', 'white_dye', 'white_dye'], 'light_gray_dye', 3);

// wool: any wool + a dye = wool of that colour; eight white wool around a dye = eight dyed
for (const c of DYE_COLORS) {
  for (const w of DYE_COLORS) if (w !== c) shapeless([woolKey(w), `${c}_dye`], woolKey(c));
  if (c !== 'white') shaped(['WWW', 'WDW', 'WWW'], { W: 'wool', D: `${c}_dye` }, woolKey(c), 8);
}

// ---- 1.10: Cinderstone without lava (worlds made before 1.7 have none), and Cinderstone Bricks
shaped(['SCS', 'CIC', 'SCS'], { S: 'stone', C: 'coal', I: 'iron_ingot' }, 'cinderstone', 4);
shaped(['CC', 'CC'], { C: 'cinderstone' }, 'cinderstone_bricks', 4);

// ---- 2.0: the Cinderdeep
shaped(['AA', 'AA'], { A: 'ashrock' }, 'ashrock_bricks', 4);
shaped([' G ', 'GEG', ' G '], { G: 'glass', E: 'ember' }, 'ember_lamp');
shaped(['E', 'S'], { E: 'ember', S: 'stick' }, 'torch', 8);
shaped([' S ', 'IOI', ' I '], { S: 'string', I: 'iron_ingot', O: 'fire_opal' }, 'cinder_charm');
// 2.0.1: four Glimmer Dust make the block again
shaped(['DD', 'DD'], { D: 'glimmer_dust' }, 'glimmerstone');

// ---- 2.1: armour stands, Ashboar meat (smelted in a furnace), and dyed leather armour (below)
shaped(['SSS', ' S ', 'SPS'], { S: 'stick', P: 'oak_slab' }, 'armour_stand');
shaped(['SSS', ' S ', 'SPS'], { S: 'stick', P: 'stone_slab' }, 'armour_stand');
// ---- 2.2: the Starhollow
shaped([' R ', 'GOG', ' R '], { R: 'rune_shard', G: 'glimmer_dust', O: 'fire_opal' }, 'star_lens');
shaped(['S S', 'SDS', 'S S'], { S: 'star_scale', D: 'drift_silk' }, 'star_wings');
shaped(['SS', 'SS'], { S: 'starstone' }, 'starstone_bricks', 4);
shapeless(['starbloom'], 'purple_dye', 2);

/** The four leather armour pieces (2.1: they can be dyed). */
export const LEATHER_PIECES = ['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots'];

/**
 * Crafting that isn't a fixed recipe (2.1): a leather armour piece and one to eight
 * dyes anywhere in the grid give the piece in that colour (several dyes mix, kept
 * as bright as the dyes themselves); a dyed piece on its own is washed back to plain
 * leather. Wear and runes stay with the piece.
 */
export function specialCraft(grid: Slot[]): ItemStack | null {
  const wings = mendWings(grid);
  if (wings !== undefined) return wings;
  let piece: ItemStack | null = null;
  const dyes: [number, number, number][] = [];
  for (const s of grid) {
    if (!s) continue;
    if (LEATHER_PIECES.includes(s.id)) {
      if (piece) return null;
      piece = s;
    } else if (s.id.endsWith('_dye') && (s.id.slice(0, -4) as DyeColor) in DYE_RGB) dyes.push(DYE_RGB[s.id.slice(0, -4) as DyeColor]);
    else return null;
  }
  if (!piece) return null;
  const out = cloneStack(piece)!;
  out.count = 1;
  if (!dyes.length) {
    if (piece.color === undefined) return null;
    delete out.color;
    return out;
  }
  out.color = mixDyes(dyes);
  return out;
}

/** Average of the dye colours, scaled back up to their average brightness. */
export function mixDyes(dyes: [number, number, number][]): number {
  let r = 0, g = 0, b = 0, peak = 0;
  for (const [dr, dg, db] of dyes) { r += dr; g += dg; b += db; peak += Math.max(dr, dg, db); }
  const n = dyes.length;
  r /= n; g /= n; b /= n; peak /= n;
  const m = Math.max(r, g, b) || 1;
  const k = peak / m;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/**
 * 2.2: worn Starwings and one to three Star Scales give the wings back mended, a
 * third of their full wear for each scale. (undefined: the grid isn't wings and scales)
 */
function mendWings(grid: Slot[]): ItemStack | null | undefined {
  let wings: ItemStack | null = null, scales = 0;
  for (const s of grid) {
    if (!s) continue;
    if (s.id === 'star_wings') { if (wings) return undefined; wings = s; } else if (s.id === 'star_scale') scales++;
    else return undefined;
  }
  if (!wings || scales === 0 || scales > 3) return undefined;
  if (!wings.damage) return null;
  const out = cloneStack(wings)!;
  out.count = 1;
  const left = Math.max(0, (wings.damage ?? 0) - scales * 144);
  if (left > 0) out.damage = left; else delete out.damage;
  return out;
}
