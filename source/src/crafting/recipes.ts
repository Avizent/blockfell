import { RecipeManager } from './RecipeManager';
import { DYE_COLORS, DyeColor, woolKey } from '../world/dyes';

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
