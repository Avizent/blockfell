/**
 * An ItemStack is plain data (easy to save and clone): item id, count and optional
 * damage for tools/armour. All behaviour lives in helper functions and the
 * ItemRegistry, never in UI components.
 */
export interface ItemStack {
  id: string;
  count: number;
  damage?: number;
  /** Runes inscribed at a Rune Table: rune id -> rank. */
  ench?: Record<string, number>;
  /** Explorer maps (1.8): the place the map leads to. */
  map?: MapTarget;
  /** 2.1: dyed leather armour, 0xRRGGBB. */
  color?: number;
}

/** Where an explorer map leads (a dungeon, a ruin or another village). */
export interface MapTarget {
  kind: 'dungeon' | 'ruin' | 'village';
  x: number; y: number; z: number;
  /** The village a map leads to, or the village whose Mapmaker drew it. */
  name?: string;
  /** Set once the player has reached the spot. */
  found?: boolean;
}

export type Slot = ItemStack | null;

export function makeStack(id: string, count = 1, damage?: number): ItemStack {
  const s: ItemStack = { id, count };
  if (damage) s.damage = damage;
  return s;
}

export function cloneStack(s: Slot): Slot {
  return s ? { ...s, ...(s.ench ? { ench: { ...s.ench } } : {}), ...(s.map ? { map: { ...s.map } } : {}) } : null;
}

function sameRunes(a: ItemStack, b: ItemStack): boolean {
  const ka = a.ench ? Object.keys(a.ench) : [], kb = b.ench ? Object.keys(b.ench) : [];
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a.ench![k] !== b.ench?.[k]) return false;
  return true;
}

/** Two stacks can merge if they are the same item with no per-item state. */
export function stacksMatch(a: Slot, b: Slot): boolean {
  return !!a && !!b && a.id === b.id && (a.damage ?? 0) === (b.damage ?? 0) && sameRunes(a, b) && !a.map && !b.map && a.color === b.color;
}

/**
 * What a stack looks like: its item id, plus "#rrggbb" for dyed leather (2.1).
 * Icons, held items and dropped items are built and cached by this key.
 */
export function visualKey(s: Slot): string {
  if (!s) return '';
  return s.color === undefined ? s.id : `${s.id}#${s.color.toString(16).padStart(6, '0')}`;
}

/** Splits a visual key back into the item id and its colour (if any). */
export function parseVisualKey(key: string): { id: string; color: number | undefined } {
  const i = key.indexOf('#');
  return i < 0 ? { id: key, color: undefined } : { id: key.slice(0, i), color: parseInt(key.slice(i + 1), 16) };
}
