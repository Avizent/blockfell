/**
 * Ordered list of every block texture. The position in this list is the texture's
 * layer index in the GPU texture array (and its tile index in the 2D atlas image).
 * Shared by the main thread and the meshing worker so both agree on layer ids
 * without passing any data around.
 */
import { DYE_COLORS } from '../world/dyes';

export const WATER_FRAMES = 8;
export const LAVA_FRAMES = 8;
export const DESTROY_STAGES = 10;

const base = [
  'missing',
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'gravel',
  'log_side', 'log_top', 'leaves', 'coal_ore', 'iron_ore', 'planks',
  'cobblestone', 'mossy_cobblestone', 'bedrock',
  'crafting_table_top', 'crafting_table_side', 'crafting_table_front',
  'glass', 'tall_grass', 'flower_red', 'flower_yellow', 'bricks', 'stone_bricks',
  'wool', 'torch', 'sandstone_side', 'sandstone_top', 'sandstone_bottom', 'snow',
  'furnace_front', 'furnace_front_lit', 'furnace_side', 'furnace_top',
  'chest_front', 'chest_side', 'chest_top', 'lumen', 'grass_side_snow',
  // 1.1
  'door_lower', 'door_upper',
  'bed_top_head', 'bed_top_foot', 'bed_side_head', 'bed_side_foot', 'bed_end_head', 'bed_end_foot',
  'birch_log_side', 'birch_log_top', 'birch_leaves', 'spruce_log_side', 'spruce_log_top', 'spruce_leaves',
  'red_sand', 'terracotta', 'terracotta_orange', 'terracotta_yellow', 'terracotta_brown', 'terracotta_white',
  'cactus_side', 'cactus_top', 'cactus_bottom', 'dead_bush',
  'rune_ore', 'rune_table_top', 'rune_table_side', 'rune_table_bottom',
  // 1.2
  'farmland_dry', 'farmland_moist',
  'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'wheat_4', 'wheat_5', 'wheat_6', 'wheat_7',
  'carrots_0', 'carrots_1', 'carrots_2', 'carrots_3',
  'path_top', 'path_side', 'hay_top', 'hay_side',
  'grain_bin_top', 'grain_bin_side', 'forge_top', 'forge_side', 'mason_top', 'mason_side',
  'scribe_top', 'scribe_side', 'fletch_top', 'fletch_side',
  // 1.4: decoration
  'ladder', 'trapdoor', 'glass_pane_edge', 'flower_blue', 'flower_white',
  'lantern_side', 'lantern_hang_side', 'lantern_top', 'chain', 'flower_pot', 'flower_pot_top',
  ...DYE_COLORS.filter((c) => c !== 'white').map((c) => `wool_${c}`),
  // 1.7: lava and dungeons
  'cinderstone', 'spawner',
  // 1.8: village life
  'bell', 'bell_mount', 'map_table_top', 'map_table_side',
  // 1.10
  'cinderstone_bricks',
  // 2.0: the Cinderdeep
  'ashrock', 'ash', 'ember_ore', 'fire_opal_ore', 'glowcap', 'ashrock_bricks', 'ember_lamp', 'deepgate',
  // 2.0.1
  'glimmerstone',
  // 2.2: the Starhollow
  'starstone', 'starstone_bricks', 'starbloom', 'stargate', 'storm_bell', 'storm_bell_rung', 'storm_bell_mount', 'roost',
];

export const TEXTURE_NAMES: string[] = [
  ...base,
  ...Array.from({ length: WATER_FRAMES }, (_, i) => `water_${i}`),
  ...Array.from({ length: LAVA_FRAMES }, (_, i) => `lava_${i}`),
  ...Array.from({ length: DESTROY_STAGES }, (_, i) => `destroy_${i}`),
];

const index = new Map<string, number>();
TEXTURE_NAMES.forEach((n, i) => index.set(n, i));

export function textureLayer(name: string): number {
  const i = index.get(name);
  if (i === undefined) throw new Error('Unknown texture ' + name);
  return i;
}

export const WATER_LAYER = textureLayer('water_0');
export const LAVA_LAYER = textureLayer('lava_0');
export const DESTROY_LAYER = textureLayer('destroy_0');
