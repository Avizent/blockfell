/**
 * 2.10: the fish of Blockfell. Plain data (no imports) so the block registry, the
 * item registry, the textures and the fishing code can all share it.
 * ORIGINAL names and colours. Trout and Perch are the two everyday fish from before 2.10.
 */
export interface FishSpecies {
  /** Short key: item is `raw_<key>`, jar block is `jar:<key>`. */
  key: string;
  name: string;
  /** Body colour, belly colour and eye/fin accent (0-255). */
  body: [number, number, number];
  belly: [number, number, number];
  fin: [number, number, number];
  /** Light given off by the fish in a jar (0-15). */
  glow: number;
  /** Where a line brings it up. 'always' fish are the old ones. */
  where: 'always' | 'day' | 'night' | 'cold' | 'spore' | 'rare';
  /** Catch weight (relative to Trout's 60). */
  weight: number;
  /** New in 2.10 (needs its own raw-fish item and sprite). */
  isNew: boolean;
}

export const FISH: FishSpecies[] = [
  { key: 'trout', name: 'Trout', body: [110, 150, 120], belly: [214, 206, 170], fin: [186, 90, 70], glow: 0, where: 'always', weight: 60, isNew: false },
  { key: 'perch', name: 'Perch', body: [150, 160, 70], belly: [226, 214, 140], fin: [210, 120, 50], glow: 0, where: 'always', weight: 25, isNew: false },
  { key: 'sunfin', name: 'Sunfin', body: [250, 190, 50], belly: [255, 236, 150], fin: [240, 120, 30], glow: 5, where: 'day', weight: 14, isNew: true },
  { key: 'moonfin', name: 'Moonfin', body: [150, 170, 230], belly: [226, 232, 255], fin: [90, 100, 190], glow: 7, where: 'night', weight: 14, isNew: true },
  { key: 'frostfin', name: 'Frostfin', body: [170, 226, 244], belly: [244, 252, 255], fin: [110, 180, 220], glow: 3, where: 'cold', weight: 30, isNew: true },
  { key: 'glowfin', name: 'Glowfin', body: [60, 220, 190], belly: [170, 255, 230], fin: [255, 120, 220], glow: 12, where: 'spore', weight: 40, isNew: true },
  { key: 'ruby_carp', name: 'Ruby Carp', body: [200, 40, 60], belly: [255, 140, 130], fin: [255, 210, 80], glow: 4, where: 'rare', weight: 2, isNew: true },
];

export function fishByKey(key: string): FishSpecies | undefined {
  return FISH.find((f) => f.key === key);
}
