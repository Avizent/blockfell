/** Biome identifiers and presentation data. Selection logic lives in TerrainGenerator. */
export const BIOME_OCEAN = 0;
export const BIOME_BEACH = 1;
export const BIOME_PLAINS = 2;
export const BIOME_FOREST = 3;
export const BIOME_DESERT = 4;
export const BIOME_MOUNTAINS = 5;
export const BIOME_SNOWY = 6;
export const BIOME_RIVER = 7;
export const BIOME_BIRCH = 8;
export const BIOME_TAIGA = 9;
export const BIOME_BADLANDS = 10;
/** The Cinderdeep (2.0): a whole dimension, not an overworld biome. */
export const BIOME_CINDERDEEP = 11;

export interface BiomeInfo {
  name: string;
  treeChance: number;     // probability that a 5x5 tree cell gets a tree
  grassChance: number;    // tall grass per surface block
  flowerChance: number;
}

export const BIOMES: BiomeInfo[] = [
  { name: 'Ocean', treeChance: 0, grassChance: 0, flowerChance: 0 },
  { name: 'Beach', treeChance: 0, grassChance: 0, flowerChance: 0 },
  { name: 'Plains', treeChance: 0.07, grassChance: 0.14, flowerChance: 0.012 },
  { name: 'Forest', treeChance: 0.85, grassChance: 0.06, flowerChance: 0.006 },
  { name: 'Desert', treeChance: 0, grassChance: 0, flowerChance: 0 },
  { name: 'Mountains', treeChance: 0.18, grassChance: 0.05, flowerChance: 0.002 },
  { name: 'Snowy Peaks', treeChance: 0.05, grassChance: 0, flowerChance: 0 },
  { name: 'River', treeChance: 0, grassChance: 0.02, flowerChance: 0 },
  { name: 'Birch Forest', treeChance: 0.8, grassChance: 0.08, flowerChance: 0.01 },
  { name: 'Taiga', treeChance: 0.7, grassChance: 0.1, flowerChance: 0.002 },
  { name: 'Badlands', treeChance: 0, grassChance: 0, flowerChance: 0 },
  { name: 'Cinderdeep', treeChance: 0, grassChance: 0, flowerChance: 0 },
];
