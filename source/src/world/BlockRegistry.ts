import { textureLayer, WATER_LAYER } from '../meshing/textureNames';
import { DYE_COLORS, DYE_NAMES, DyeColor, woolKey } from './dyes';

/**
 * Block registry. Block ids are small integers (stored in Uint8Array chunk data).
 * This module is imported by both the main thread and the worker, so it only
 * contains plain data.
 */
export const RENDER_NONE = 0;
export const RENDER_CUBE = 1;
export const RENDER_CROSS = 2;
export const RENDER_TORCH = 3;
export const RENDER_LIQUID = 4;
export const RENDER_MODEL = 5;      // one or more boxes (slabs, stairs, doors, beds, cactus...)
export const RENDER_WALL_TORCH = 6; // torch leaning out of a wall

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | null;
export type SoundType = 'stone' | 'wood' | 'grass' | 'gravel' | 'sand' | 'glass' | 'wool' | 'snow';
export type Facing = 'n' | 'e' | 's' | 'w';
export type Interaction = 'crafting' | 'furnace' | 'chest' | 'runes' | 'door' | 'bed' | 'gate' | 'trapdoor' | 'sign' | 'pot' | null;
export type Shape = 'slab' | 'stairs' | 'door' | 'bed' | 'wall_torch'
  | 'fence' | 'pane' | 'gate' | 'ladder' | 'trapdoor' | 'sign' | 'wall_sign' | 'lantern' | 'pot' | null;

/** Face index (E, W, U, D, S, N) that points in a facing direction. */
export const FACE_OF: Record<Facing, number> = { e: 0, w: 1, s: 4, n: 5 };

export interface DropSpec {
  item: string;
  min: number;
  max: number;
  chance?: number;
}

export interface BlockDef {
  id: number;
  key: string;               // unique registry key
  name: string;              // display name
  render: number;            // RENDER_*
  opaque: boolean;           // full opaque cube: hides neighbour faces, blocks light, casts AO
  solid: boolean;            // has a collision box
  cutout: boolean;           // alpha-tested texture (leaves, glass, plants)
  liquid: boolean;
  cullSame: boolean;         // hide faces between two blocks of this type (glass)
  replaceable: boolean;      // placing a block into this cell replaces it (air, water, tall grass)
  lightOpacity: number;      // 0..15 light reduction when passing through
  lightEmission: number;     // 0..15
  hardness: number;          // < 0 = unbreakable
  tool: ToolType;            // preferred tool
  requiresTool: boolean;     // needs the right tool to drop anything
  minTier: number;           // 0 = wood, 1 = stone, 2 = iron
  faces: number[];           // texture layer for each face [E, W, U, D, S, N]
  drops: DropSpec[];
  item: string | null;       // item obtained via pick-block / creative
  sound: SoundType;
  selection: [number, number, number, number, number, number]; // AABB in block space
  interact: Interaction;
  facing: Facing | null;
  variantOf: string | null;  // orientation variants share a base key
  xp: [number, number];
  /** RENDER_MODEL boxes in 1/16 block units, flattened [x0,y0,z0,x1,y1,z1, ...]. */
  model: number[] | null;
  /** Collision boxes in 1/16 units; null = full cube (when solid). */
  collision: number[] | null;
  /** Quarter turns applied to the texture on the top/bottom faces of a model (beds). */
  topRot: number;
  /** Model faces touching a neighbour of the same group are hidden (slab rows, bed halves). */
  cullGroup: string | null;
  /** Blocks light but is lit by its neighbours when drawn (slabs, stairs). */
  neighborLight: boolean;
  /** -1 not a fluid; 0 source; 1..7 flowing (weaker); 8 falling. */
  fluidLevel: number;
  shape: Shape;
  /** Shape parameters: slab/stair half, door half/open/hinge, bed part. */
  half: 'bottom' | 'top' | 'lower' | 'upper' | 'foot' | 'head' | null;
  open: boolean;
  hinge: 'l' | 'r' | null;
  /** Block that two slabs of this kind combine into. */
  fullBlock: string | null;
  /** Per-box texture overrides for models, [E, W, U, D, S, N] names or null (lantern chain, potted cactus). */
  modelFaces: (string[] | null)[] | null;
  /** A small cross-shaped plant drawn inside the model (flower pots). */
  cross: { tex: string; lo: number; hi: number; y0: number; y1: number } | null;
}

const defs: BlockDef[] = [];
const byKey = new Map<string, BlockDef>();
const FULL: BlockDef['selection'] = [0, 0, 0, 1, 1, 1];

type Opts = Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'faces'>> & {
  tex?: string;              // same texture on every face
  top?: string; bottom?: string; side?: string; front?: string;
};

function faceLayers(o: Opts, facing: Facing | null): number[] {
  const all = o.tex ?? o.side ?? 'missing';
  const side = o.side ?? all;
  const top = o.top ?? all;
  const bottom = o.bottom ?? top;
  const f = [side, side, top, bottom, side, side];
  if (o.front) {
    // front texture points in the facing direction
    const idx = facing === 'e' ? 0 : facing === 'w' ? 1 : facing === 's' ? 4 : 5;
    f[idx] = o.front;
  }
  return f.map(textureLayer);
}

function unionBox(m: number[]): BlockDef['selection'] {
  const b: BlockDef['selection'] = [1, 1, 1, 0, 0, 0];
  for (let i = 0; i < m.length; i += 6) {
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m[i + k] / 16); b[k + 3] = Math.max(b[k + 3], m[i + k + 3] / 16); }
  }
  return b;
}

function reg(key: string, name: string, o: Opts): BlockDef {
  const id = defs.length;
  const def: BlockDef = {
    id, key, name,
    render: o.render ?? RENDER_CUBE,
    opaque: o.opaque ?? true,
    solid: o.solid ?? true,
    cutout: o.cutout ?? false,
    liquid: o.liquid ?? false,
    cullSame: o.cullSame ?? false,
    replaceable: o.replaceable ?? false,
    lightOpacity: o.lightOpacity ?? ((o.opaque ?? true) ? 15 : 0),
    lightEmission: o.lightEmission ?? 0,
    hardness: o.hardness ?? 1,
    tool: o.tool ?? null,
    requiresTool: o.requiresTool ?? false,
    minTier: o.minTier ?? 0,
    faces: faceLayers(o, o.facing ?? null),
    drops: o.drops ?? [{ item: key, min: 1, max: 1 }],
    item: o.item === undefined ? key : o.item,
    sound: o.sound ?? 'stone',
    selection: o.selection ?? FULL,
    interact: o.interact ?? null,
    facing: o.facing ?? null,
    variantOf: o.variantOf ?? null,
    xp: o.xp ?? [0, 0],
    model: o.model ?? null,
    collision: o.collision !== undefined ? o.collision : (o.model ?? null),
    topRot: o.topRot ?? 0,
    cullGroup: o.cullGroup ?? null,
    neighborLight: o.neighborLight ?? false,
    fluidLevel: o.fluidLevel ?? -1,
    shape: o.shape ?? null,
    half: o.half ?? null,
    open: o.open ?? false,
    hinge: o.hinge ?? null,
    fullBlock: o.fullBlock ?? null,
    modelFaces: o.modelFaces ?? null,
    cross: o.cross ?? null,
  };
  if (def.model && !o.selection) def.selection = unionBox(def.model);
  defs.push(def);
  byKey.set(key, def);
  return def;
}

// ---- registry (order defines numeric ids; never reorder once worlds are saved) ----
export const AIR = reg('air', 'Air', {
  render: RENDER_NONE, opaque: false, solid: false, replaceable: true, lightOpacity: 0,
  hardness: 0, drops: [], item: null,
}).id;
export const GRASS = reg('grass', 'Grass Block', {
  top: 'grass_top', side: 'grass_side', bottom: 'dirt', hardness: 0.6, tool: 'shovel',
  drops: [{ item: 'dirt', min: 1, max: 1 }], sound: 'grass',
}).id;
export const DIRT = reg('dirt', 'Dirt', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' }).id;
export const STONE = reg('stone', 'Stone', {
  tex: 'stone', hardness: 1.5, tool: 'pickaxe', requiresTool: true,
  drops: [{ item: 'cobblestone', min: 1, max: 1 }],
}).id;
export const SAND = reg('sand', 'Sand', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand' }).id;
export const GRAVEL = reg('gravel', 'Gravel', {
  tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel',
  drops: [{ item: 'gravel', min: 1, max: 1, chance: 0.9 }, { item: 'flint', min: 1, max: 1, chance: 0.1 }],
}).id;
export const WATER = reg('water', 'Water', {
  render: RENDER_LIQUID, opaque: false, solid: false, liquid: true, replaceable: true, fluidLevel: 0,
  lightOpacity: 2, hardness: -1, drops: [], item: null, tex: 'water_0', selection: [0, 0, 0, 0, 0, 0],
}).id;
export const LOG = reg('log', 'Oak Log', {
  side: 'log_side', top: 'log_top', hardness: 2, tool: 'axe', sound: 'wood',
}).id;
export const LEAVES = reg('leaves', 'Oak Leaves', {
  tex: 'leaves', opaque: false, cutout: true, lightOpacity: 1, hardness: 0.2, tool: null,
  drops: [{ item: 'apple', min: 1, max: 1, chance: 0.05 }, { item: 'stick', min: 1, max: 2, chance: 0.04 }],
  sound: 'grass',
}).id;
export const COAL_ORE = reg('coal_ore', 'Coal Ore', {
  tex: 'coal_ore', hardness: 3, tool: 'pickaxe', requiresTool: true,
  drops: [{ item: 'coal', min: 1, max: 1 }], xp: [0, 2],
}).id;
export const IRON_ORE = reg('iron_ore', 'Iron Ore', {
  tex: 'iron_ore', hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 1,
  drops: [{ item: 'raw_iron', min: 1, max: 1 }], xp: [0, 1],
}).id;
export const PLANKS = reg('planks', 'Oak Planks', { tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood' }).id;
export const COBBLESTONE = reg('cobblestone', 'Cobblestone', {
  tex: 'cobblestone', hardness: 2, tool: 'pickaxe', requiresTool: true,
}).id;
export const MOSSY_COBBLESTONE = reg('mossy_cobblestone', 'Mossy Cobblestone', {
  tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', requiresTool: true,
}).id;
export const BEDROCK = reg('bedrock', 'Bedrock', { tex: 'bedrock', hardness: -1, drops: [] }).id;
export const CRAFTING_TABLE = reg('crafting_table', 'Crafting Table', {
  top: 'crafting_table_top', bottom: 'planks', side: 'crafting_table_side', front: 'crafting_table_front',
  facing: 's', hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting',
}).id;
export const GLASS = reg('glass', 'Glass', {
  tex: 'glass', opaque: false, cutout: true, cullSame: true, lightOpacity: 0, hardness: 0.3,
  drops: [], sound: 'glass',
}).id;
export const TALL_GRASS = reg('tall_grass', 'Tall Grass', {
  render: RENDER_CROSS, tex: 'tall_grass', opaque: false, solid: false, cutout: true, replaceable: true,
  lightOpacity: 0, hardness: 0, drops: [{ item: 'wheat_seeds', min: 1, max: 1, chance: 0.125 }], sound: 'grass', item: 'tall_grass',
  selection: [0.1, 0, 0.1, 0.9, 0.8, 0.9],
}).id;
export const FLOWER_RED = reg('flower_red', 'Ember Poppy', {
  render: RENDER_CROSS, tex: 'flower_red', opaque: false, solid: false, cutout: true,
  lightOpacity: 0, hardness: 0, sound: 'grass', selection: [0.3, 0, 0.3, 0.7, 0.65, 0.7],
}).id;
export const FLOWER_YELLOW = reg('flower_yellow', 'Sunbell', {
  render: RENDER_CROSS, tex: 'flower_yellow', opaque: false, solid: false, cutout: true,
  lightOpacity: 0, hardness: 0, sound: 'grass', selection: [0.3, 0, 0.3, 0.7, 0.6, 0.7],
}).id;
export const BRICKS = reg('bricks', 'Bricks', { tex: 'bricks', hardness: 2, tool: 'pickaxe', requiresTool: true }).id;
export const STONE_BRICKS = reg('stone_bricks', 'Stone Bricks', {
  tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', requiresTool: true,
}).id;
export const WOOL = reg('wool', 'White Wool', { tex: 'wool', hardness: 0.8, sound: 'wool' }).id;
export const TORCH = reg('torch', 'Torch', {
  render: RENDER_TORCH, tex: 'torch', opaque: false, solid: false, cutout: true, lightOpacity: 0,
  lightEmission: 14, hardness: 0, sound: 'wood', selection: [0.4, 0, 0.4, 0.6, 0.625, 0.6],
}).id;
export const SANDSTONE = reg('sandstone', 'Sandstone', {
  side: 'sandstone_side', top: 'sandstone_top', bottom: 'sandstone_bottom', hardness: 0.8,
  tool: 'pickaxe', requiresTool: true,
}).id;
export const SNOW = reg('snow', 'Snow Block', { tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow' }).id;
export const SNOWY_GRASS = reg('snowy_grass', 'Snowy Grass Block', {
  top: 'snow', side: 'grass_side_snow', bottom: 'dirt', hardness: 0.6, tool: 'shovel',
  drops: [{ item: 'dirt', min: 1, max: 1 }], sound: 'snow', item: 'snowy_grass',
}).id;
export const LUMEN = reg('lumen', 'Lumen Block', {
  tex: 'lumen', lightEmission: 15, hardness: 0.3, sound: 'glass',
}).id;

// Orientable functional blocks: one id per facing so the voxel data stays a plain Uint8Array.
const FACINGS: Facing[] = ['n', 'e', 's', 'w'];
function orientable(key: string, name: string, o: Opts): number[] {
  return FACINGS.map((f) => reg(`${key}:${f}`, name, { ...o, facing: f, variantOf: key, item: o.item ?? key }).id);
}
export const FURNACE = orientable('furnace', 'Furnace', {
  front: 'furnace_front', side: 'furnace_side', top: 'furnace_top', hardness: 3.5, tool: 'pickaxe',
  requiresTool: true, interact: 'furnace', drops: [{ item: 'furnace', min: 1, max: 1 }],
});
export const FURNACE_LIT = orientable('furnace_lit', 'Furnace', {
  front: 'furnace_front_lit', side: 'furnace_side', top: 'furnace_top', hardness: 3.5, tool: 'pickaxe',
  requiresTool: true, interact: 'furnace', lightEmission: 13, drops: [{ item: 'furnace', min: 1, max: 1 }],
  item: 'furnace',
});
export const CHEST = orientable('chest', 'Chest', {
  front: 'chest_front', side: 'chest_side', top: 'chest_top', hardness: 2.5, tool: 'axe', sound: 'wood',
  interact: 'chest', drops: [{ item: 'chest', min: 1, max: 1 }],
});

// ======================================================================
// Version 1.1 blocks. Appended only (ids of existing blocks never change).
// ======================================================================

// ---- helpers for oriented box models (canonical models face north, -Z)
export const FACING_VEC: Record<Facing, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const OPPOSITE: Record<Facing, Facing> = { n: 's', s: 'n', e: 'w', w: 'e' };
export const LEFT_OF: Record<Facing, Facing> = { n: 'w', e: 'n', s: 'e', w: 's' };
export const RIGHT_OF: Record<Facing, Facing> = { n: 'e', e: 's', s: 'w', w: 'n' };
const TURNS: Record<Facing, number> = { n: 0, e: 1, s: 2, w: 3 };

/** Rotates a point (1/16 units) about the block centre by quarter turns (clockwise seen from above). */
function rotXZ(x: number, z: number, turns: number): [number, number] {
  switch (turns & 3) {
    case 1: return [16 - z, x];
    case 2: return [16 - x, 16 - z];
    case 3: return [z, 16 - x];
    default: return [x, z];
  }
}

export function rotateBoxes(m: number[], f: Facing): number[] {
  const t = TURNS[f];
  const out: number[] = [];
  for (let i = 0; i < m.length; i += 6) {
    const [ax, az] = rotXZ(m[i], m[i + 2], t);
    const [bx, bz] = rotXZ(m[i + 3], m[i + 5], t);
    out.push(Math.min(ax, bx), m[i + 1], Math.min(az, bz), Math.max(ax, bx), m[i + 4], Math.max(az, bz));
  }
  return out;
}

// ---- flowing water: levels 1..7 spread sideways, level 8 falls
export const WATER_FLOW: number[] = [WATER];
for (let l = 1; l <= 7; l++) {
  WATER_FLOW.push(reg(`water_flow_${l}`, 'Water', {
    render: RENDER_LIQUID, opaque: false, solid: false, liquid: true, replaceable: true, fluidLevel: l,
    lightOpacity: 2, hardness: -1, drops: [], item: null, tex: 'water_0', selection: [0, 0, 0, 0, 0, 0],
  }).id);
}
export const WATER_FALLING = reg('water_falling', 'Water', {
  render: RENDER_LIQUID, opaque: false, solid: false, liquid: true, replaceable: true, fluidLevel: 8,
  lightOpacity: 2, hardness: -1, drops: [], item: null, tex: 'water_0', selection: [0, 0, 0, 0, 0, 0],
}).id;

// ---- wall torches: facing = direction the flame leans (away from the wall)
const WALL_TORCH_SEL = [5.5, 3, 11, 10.5, 13.5, 16];
export const WALL_TORCH: Record<Facing, number> = { n: 0, e: 0, s: 0, w: 0 };
for (const f of FACINGS) {
  WALL_TORCH[f] = reg(`wall_torch:${f}`, 'Torch', {
    render: RENDER_WALL_TORCH, tex: 'torch', opaque: false, solid: false, cutout: true, lightOpacity: 0,
    lightEmission: 14, hardness: 0, sound: 'wood', facing: f, variantOf: 'wall_torch', item: 'torch', shape: 'wall_torch',
    drops: [{ item: 'torch', min: 1, max: 1 }],
    selection: unionBox(rotateBoxes(WALL_TORCH_SEL, f)),
  }).id;
}

// ---- slabs and stairs
interface Material { key: string; name: string; o: Opts }
const MATERIALS: Material[] = [
  { key: 'oak', name: 'Oak', o: { tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood' } },
  { key: 'cobblestone', name: 'Cobblestone', o: { tex: 'cobblestone', hardness: 2, tool: 'pickaxe', requiresTool: true } },
  { key: 'stone', name: 'Stone', o: { tex: 'stone', hardness: 1.5, tool: 'pickaxe', requiresTool: true } },
  { key: 'stone_brick', name: 'Stone Brick', o: { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', requiresTool: true } },
  { key: 'sandstone', name: 'Sandstone', o: { side: 'sandstone_side', top: 'sandstone_top', bottom: 'sandstone_bottom', hardness: 0.8, tool: 'pickaxe', requiresTool: true } },
  { key: 'brick', name: 'Brick', o: { tex: 'bricks', hardness: 2, tool: 'pickaxe', requiresTool: true } },
];
const FULL_OF: Record<string, string> = { oak: 'planks', cobblestone: 'cobblestone', stone: 'stone', stone_brick: 'stone_bricks', sandstone: 'sandstone', brick: 'bricks' };
export const SLABS: Record<string, { bottom: number; top: number }> = {};
for (const m of MATERIALS) {
  const item = `${m.key}_slab`;
  const common: Opts = {
    ...m.o, render: RENDER_MODEL, opaque: false, lightOpacity: 15, neighborLight: true, shape: 'slab',
    variantOf: item, item, drops: [{ item, min: 1, max: 1 }], cullGroup: item, fullBlock: FULL_OF[m.key],
  };
  SLABS[item] = {
    bottom: reg(`${item}:bottom`, `${m.name} Slab`, { ...common, half: 'bottom', model: [0, 0, 0, 16, 8, 16] }).id,
    top: reg(`${item}:top`, `${m.name} Slab`, { ...common, half: 'top', model: [0, 8, 0, 16, 16, 16] }).id,
  };
}
export const STAIRS: Record<string, Record<string, number>> = {};
for (const m of MATERIALS) {
  if (m.key === 'stone') continue;
  const item = `${m.key}_stairs`;
  STAIRS[item] = {};
  for (const f of FACINGS) {
    for (const half of ['bottom', 'top'] as const) {
      // canonical (north): a full-width half slab plus the raised back half on the north side
      const canon = half === 'bottom' ? [0, 0, 0, 16, 8, 16, 0, 8, 0, 16, 16, 8] : [0, 8, 0, 16, 16, 16, 0, 0, 0, 16, 8, 8];
      STAIRS[item][`${f}:${half}`] = reg(`${item}:${f}:${half}`, `${m.name} Stairs`, {
        ...m.o, render: RENDER_MODEL, opaque: false, lightOpacity: 15, neighborLight: true, shape: 'stairs',
        facing: f, half, variantOf: item, item, drops: [{ item, min: 1, max: 1 }],
        model: rotateBoxes(canon, f), selection: [0, 0, 0, 1, 1, 1],
      }).id;
    }
  }
}

// ---- doors: facing = direction the player looked when placing; hinge on the player's left or right
const PANEL: Record<Facing, number[]> = {
  n: [0, 0, 0, 16, 16, 3], s: [0, 0, 13, 16, 16, 16], w: [0, 0, 0, 3, 16, 16], e: [13, 0, 0, 16, 16, 16],
};
export const DOORS: Record<string, number> = {};
for (const half of ['lower', 'upper'] as const) {
  for (const f of FACINGS) {
    for (const open of [false, true]) {
      for (const hinge of ['l', 'r'] as const) {
        const side: Facing = !open ? OPPOSITE[f] : hinge === 'l' ? LEFT_OF[f] : RIGHT_OF[f];
        const key = `oak_door:${half}:${f}:${open ? 'o' : 'c'}:${hinge}`;
        DOORS[key] = reg(key, 'Oak Door', {
          tex: half === 'lower' ? 'door_lower' : 'door_upper', render: RENDER_MODEL, opaque: false, cutout: true,
          lightOpacity: 0, hardness: 3, tool: 'axe', sound: 'wood', shape: 'door', facing: f, half, open, hinge,
          variantOf: 'oak_door', item: 'oak_door', interact: 'door',
          drops: half === 'lower' ? [{ item: 'oak_door', min: 1, max: 1 }] : [], model: PANEL[side],
        }).id;
      }
    }
  }
}
export function doorId(half: 'lower' | 'upper', f: Facing, open: boolean, hinge: 'l' | 'r'): number {
  return DOORS[`oak_door:${half}:${f}:${open ? 'o' : 'c'}:${hinge}`];
}

// ---- beds: facing = direction from the foot to the head
const BED_ROT: Record<Facing, number> = { n: 0, e: 1, s: 2, w: 3 };
export const BEDS: Record<string, number> = {};
for (const part of ['foot', 'head'] as const) {
  for (const f of FACINGS) {
    const legs = part === 'head' ? [0, 0, 0, 3, 3, 3, 13, 0, 0, 16, 3, 3] : [0, 0, 13, 3, 3, 16, 13, 0, 13, 16, 3, 16];
    const canon = [0, 3, 0, 16, 9, 16, ...legs];
    const o: Opts = {
      top: part === 'head' ? 'bed_top_head' : 'bed_top_foot', bottom: 'planks', side: part === 'head' ? 'bed_side_head' : 'bed_side_foot',
      render: RENDER_MODEL, opaque: false, lightOpacity: 0, hardness: 0.2, sound: 'wool', shape: 'bed', half: part, facing: f,
      variantOf: 'bed', item: 'bed', interact: 'bed', drops: part === 'foot' ? [{ item: 'bed', min: 1, max: 1 }] : [],
      model: rotateBoxes(canon, f), collision: [0, 0, 0, 16, 9, 16], topRot: BED_ROT[f], cullGroup: `bed:${f}`,
    };
    const key = `bed:${part}:${f}`;
    const def = reg(key, 'Bed', o);
    // the outer end of each half shows the headboard / footboard
    const endFace = FACE_OF[part === 'head' ? f : OPPOSITE[f]];
    def.faces[endFace] = textureLayer(part === 'head' ? 'bed_end_head' : 'bed_end_foot');
    BEDS[key] = def.id;
  }
}
export function bedId(part: 'foot' | 'head', f: Facing): number {
  return BEDS[`bed:${part}:${f}`];
}

// ---- natural blocks for the new biomes
export const BIRCH_LOG = reg('birch_log', 'Birch Log', { side: 'birch_log_side', top: 'birch_log_top', hardness: 2, tool: 'axe', sound: 'wood' }).id;
export const BIRCH_LEAVES = reg('birch_leaves', 'Birch Leaves', {
  tex: 'birch_leaves', opaque: false, cutout: true, lightOpacity: 1, hardness: 0.2, sound: 'grass',
  drops: [{ item: 'stick', min: 1, max: 2, chance: 0.04 }],
}).id;
export const SPRUCE_LOG = reg('spruce_log', 'Spruce Log', { side: 'spruce_log_side', top: 'spruce_log_top', hardness: 2, tool: 'axe', sound: 'wood' }).id;
export const SPRUCE_LEAVES = reg('spruce_leaves', 'Spruce Needles', {
  tex: 'spruce_leaves', opaque: false, cutout: true, lightOpacity: 1, hardness: 0.2, sound: 'grass',
  drops: [{ item: 'stick', min: 1, max: 2, chance: 0.05 }],
}).id;
export const RED_SAND = reg('red_sand', 'Red Sand', { tex: 'red_sand', hardness: 0.5, tool: 'shovel', sound: 'sand' }).id;
export const TERRACOTTA = [
  reg('terracotta', 'Terracotta', { tex: 'terracotta', hardness: 1.25, tool: 'pickaxe', requiresTool: true }).id,
  reg('orange_terracotta', 'Orange Terracotta', { tex: 'terracotta_orange', hardness: 1.25, tool: 'pickaxe', requiresTool: true }).id,
  reg('yellow_terracotta', 'Yellow Terracotta', { tex: 'terracotta_yellow', hardness: 1.25, tool: 'pickaxe', requiresTool: true }).id,
  reg('brown_terracotta', 'Brown Terracotta', { tex: 'terracotta_brown', hardness: 1.25, tool: 'pickaxe', requiresTool: true }).id,
  reg('white_terracotta', 'Pale Terracotta', { tex: 'terracotta_white', hardness: 1.25, tool: 'pickaxe', requiresTool: true }).id,
];
export const CACTUS = reg('cactus', 'Cactus', {
  side: 'cactus_side', top: 'cactus_top', bottom: 'cactus_bottom', render: RENDER_MODEL, opaque: false, cutout: true,
  lightOpacity: 0, hardness: 0.4, sound: 'wool', model: [1, 0, 1, 15, 16, 15], collision: [1, 0, 1, 15, 15, 15],
}).id;
export const DEAD_BUSH = reg('dead_bush', 'Dry Shrub', {
  render: RENDER_CROSS, tex: 'dead_bush', opaque: false, solid: false, cutout: true, replaceable: true,
  lightOpacity: 0, hardness: 0, sound: 'grass', drops: [{ item: 'stick', min: 0, max: 2 }],
  selection: [0.15, 0, 0.15, 0.85, 0.8, 0.85],
}).id;

// ---- runes (enchanting)
export const RUNE_ORE = reg('rune_ore', 'Rune Ore', {
  tex: 'rune_ore', hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 1,
  drops: [{ item: 'rune_shard', min: 1, max: 3 }], xp: [2, 5], lightEmission: 3,
}).id;
export const RUNE_TABLE = reg('rune_table', 'Rune Table', {
  top: 'rune_table_top', side: 'rune_table_side', bottom: 'rune_table_bottom', render: RENDER_MODEL, opaque: false,
  lightOpacity: 0, lightEmission: 7, hardness: 5, tool: 'pickaxe', requiresTool: true, interact: 'runes',
  model: [0, 0, 0, 16, 12, 16],
}).id;

// ======================================================================
// Version 1.2 blocks: farming and villages. Appended only.
// ======================================================================
export type CropKind = 'wheat' | 'carrots';
export const FARMLAND = reg('farmland', 'Farmland', {
  top: 'farmland_dry', side: 'dirt', bottom: 'dirt', hardness: 0.6, tool: 'shovel', sound: 'gravel',
  drops: [{ item: 'dirt', min: 1, max: 1 }], item: 'dirt',
}).id;
export const FARMLAND_MOIST = reg('farmland_moist', 'Farmland', {
  top: 'farmland_moist', side: 'dirt', bottom: 'dirt', hardness: 0.6, tool: 'shovel', sound: 'gravel',
  drops: [{ item: 'dirt', min: 1, max: 1 }], item: 'dirt',
}).id;
/** Crop ids by stage. Wheat has 8 stages (0..7), carrots 4 (0..3). */
export const WHEAT: number[] = [];
for (let s = 0; s < 8; s++) {
  WHEAT.push(reg(`wheat:${s}`, 'Wheat Crops', {
    render: RENDER_CROSS, tex: `wheat_${s}`, opaque: false, solid: false, cutout: true, lightOpacity: 0, hardness: 0,
    sound: 'grass', item: 'wheat_seeds', variantOf: 'wheat',
    drops: s === 7 ? [{ item: 'wheat', min: 1, max: 1 }, { item: 'wheat_seeds', min: 1, max: 3 }] : [{ item: 'wheat_seeds', min: 1, max: 1 }],
    selection: [0, 0, 0, 1, Math.max(2, (s + 1) * 2) / 16, 1],
  }).id);
}
export const CARROTS: number[] = [];
for (let s = 0; s < 4; s++) {
  CARROTS.push(reg(`carrots:${s}`, 'Carrots', {
    render: RENDER_CROSS, tex: `carrots_${s}`, opaque: false, solid: false, cutout: true, lightOpacity: 0, hardness: 0,
    sound: 'grass', item: 'carrot', variantOf: 'carrots',
    drops: s === 3 ? [{ item: 'carrot', min: 2, max: 4 }] : [{ item: 'carrot', min: 1, max: 1 }],
    selection: [0, 0, 0, 1, (s + 1) * 3 / 16, 1],
  }).id);
}
export const PATH = reg('path', 'Village Path', {
  top: 'path_top', side: 'path_side', bottom: 'dirt', hardness: 0.65, tool: 'shovel', sound: 'gravel',
  drops: [{ item: 'dirt', min: 1, max: 1 }],
}).id;
export const HAY_BALE = reg('hay_bale', 'Hay Bale', { top: 'hay_top', side: 'hay_side', hardness: 0.5, sound: 'grass' }).id;

// ---- villager workstations (each one gives a villager its job)
export type Profession = 'farmer' | 'smith' | 'mason' | 'scribe' | 'fletcher';
export const PROFESSIONS: Profession[] = ['farmer', 'smith', 'mason', 'scribe', 'fletcher'];
export const GRAIN_BIN = reg('grain_bin', 'Grain Bin', {
  top: 'grain_bin_top', side: 'grain_bin_side', bottom: 'planks', hardness: 2, tool: 'axe', sound: 'wood',
}).id;
export const FORGE = reg('forge', 'Forge', {
  top: 'forge_top', side: 'forge_side', bottom: 'cobblestone', hardness: 3.5, tool: 'pickaxe', requiresTool: true, lightEmission: 8,
}).id;
export const MASON_BENCH = reg('mason_bench', "Mason's Bench", {
  top: 'mason_top', side: 'mason_side', bottom: 'stone', hardness: 2.5, tool: 'pickaxe', requiresTool: true,
}).id;
export const SCRIBE_DESK = reg('scribe_desk', "Scribe's Desk", {
  top: 'scribe_top', side: 'scribe_side', bottom: 'planks', hardness: 2.5, tool: 'axe', sound: 'wood',
}).id;
export const FLETCHING_BENCH = reg('fletching_bench', 'Fletching Bench', {
  top: 'fletch_top', side: 'fletch_side', bottom: 'planks', hardness: 2.5, tool: 'axe', sound: 'wood',
}).id;
export const WORKSTATION: Record<Profession, number> = {
  farmer: GRAIN_BIN, smith: FORGE, mason: MASON_BENCH, scribe: SCRIBE_DESK, fletcher: FLETCHING_BENCH,
};
export function professionOfBlock(id: number): Profession | null {
  for (const p of PROFESSIONS) if (WORKSTATION[p] === id) return p;
  return null;
}

// ======================================================================
// Version 1.4 blocks: decoration. Appended only.
// ======================================================================
const WOOD: Opts = { hardness: 2, tool: 'axe', sound: 'wood' };

// ---- fences and glass panes connect to their neighbours; the arms are worked out
// from the surrounding cells wherever the shape is needed (mesher, physics, raycast).
export const OAK_FENCE = reg('oak_fence', 'Oak Fence', {
  ...WOOD, tex: 'planks', render: RENDER_MODEL, opaque: false, lightOpacity: 0, shape: 'fence',
  model: [6, 0, 6, 10, 16, 10], collision: [6, 0, 6, 10, 24, 10], cullGroup: 'oak_fence',
}).id;

// ---- fence gates: facing = direction the player looked when placing; opening swings the
// two leaves away from whoever opens it. Closed gates are as tall as a fence to jump.
const GATE_CLOSED = [0, 5, 7, 2, 16, 9, 14, 5, 7, 16, 16, 9, 2, 12, 7, 14, 15, 9, 2, 6, 7, 14, 9, 9, 6, 9, 7, 10, 12, 9];
const GATE_OPEN = [0, 5, 7, 2, 16, 9, 14, 5, 7, 16, 16, 9,
  0, 12, 1, 2, 15, 7, 0, 6, 1, 2, 9, 7, 0, 9, 1, 2, 12, 3,
  14, 12, 1, 16, 15, 7, 14, 6, 1, 16, 9, 7, 14, 9, 1, 16, 12, 3];
export const GATES: Record<string, number> = {};
for (const f of FACINGS) {
  for (const open of [false, true]) {
    const key = `oak_fence_gate:${f}:${open ? 'o' : 'c'}`;
    GATES[key] = reg(key, 'Oak Fence Gate', {
      ...WOOD, tex: 'planks', render: RENDER_MODEL, opaque: false, lightOpacity: 0, shape: 'gate', facing: f, open,
      solid: !open, variantOf: 'oak_fence_gate', item: 'oak_fence_gate', interact: 'gate',
      drops: [{ item: 'oak_fence_gate', min: 1, max: 1 }],
      model: rotateBoxes(open ? GATE_OPEN : GATE_CLOSED, f), collision: open ? null : rotateBoxes([0, 0, 6, 16, 24, 10], f),
      selection: unionBox(rotateBoxes([0, 0, 6, 16, 16, 10], f)),
    }).id;
  }
}
export function gateId(f: Facing, open: boolean): number {
  return GATES[`oak_fence_gate:${f}:${open ? 'o' : 'c'}`];
}

// ---- ladders: facing = the side you climb on (the wall is behind, like wall torches)
export const LADDERS: Record<Facing, number> = { n: 0, e: 0, s: 0, w: 0 };
for (const f of FACINGS) {
  LADDERS[f] = reg(`ladder:${f}`, 'Ladder', {
    tex: 'ladder', render: RENDER_MODEL, opaque: false, cutout: true, lightOpacity: 0, hardness: 0.4, tool: 'axe', sound: 'wood',
    shape: 'ladder', facing: f, variantOf: 'ladder', item: 'ladder', drops: [{ item: 'ladder', min: 1, max: 1 }],
    model: rotateBoxes([0, 0, 15, 16, 16, 16], f), collision: rotateBoxes([0, 0, 13, 16, 16, 16], f), cullGroup: 'ladder',
  }).id;
}

// ---- trapdoors: `facing` is the hinge side; open ones stand up against it
export const TRAPDOORS: Record<string, number> = {};
for (const f of FACINGS) {
  for (const half of ['bottom', 'top'] as const) {
    for (const open of [false, true]) {
      const key = `oak_trapdoor:${f}:${half}:${open ? 'o' : 'c'}`;
      const model = open ? PANEL[f] : half === 'bottom' ? [0, 0, 0, 16, 3, 16] : [0, 13, 0, 16, 16, 16];
      TRAPDOORS[key] = reg(key, 'Oak Trapdoor', {
        ...WOOD, hardness: 3, tex: 'trapdoor', render: RENDER_MODEL, opaque: false, cutout: true, lightOpacity: 0, shape: 'trapdoor',
        facing: f, half, open, variantOf: 'oak_trapdoor', item: 'oak_trapdoor', interact: 'trapdoor',
        drops: [{ item: 'oak_trapdoor', min: 1, max: 1 }], model,
      }).id;
    }
  }
}
export function trapdoorId(f: Facing, half: 'bottom' | 'top', open: boolean): number {
  return TRAPDOORS[`oak_trapdoor:${f}:${half}:${open ? 'o' : 'c'}`];
}

export const GLASS_PANE = reg('glass_pane', 'Glass Pane', {
  tex: 'glass', render: RENDER_MODEL, opaque: false, cutout: true, lightOpacity: 0, hardness: 0.3, sound: 'glass', drops: [],
  shape: 'pane', model: [7, 0, 7, 9, 16, 9], cullGroup: 'glass_pane',
}).id;

// ---- coloured wool (white wool is the original 'wool' block)
export const WOOLS: Record<DyeColor, number> = { white: WOOL } as Record<DyeColor, number>;
for (const c of DYE_COLORS) {
  if (c === 'white') continue;
  WOOLS[c] = reg(woolKey(c), `${DYE_NAMES[c]} Wool`, { tex: `wool_${c}`, hardness: 0.8, sound: 'wool' }).id;
}

// ---- two more wild flowers (dye sources)
export const FLOWER_BLUE = reg('flower_blue', 'Skybell', {
  render: RENDER_CROSS, tex: 'flower_blue', opaque: false, solid: false, cutout: true,
  lightOpacity: 0, hardness: 0, sound: 'grass', selection: [0.2, 0, 0.2, 0.8, 0.75, 0.8],
}).id;
export const FLOWER_WHITE = reg('flower_white', 'Moon Daisy', {
  render: RENDER_CROSS, tex: 'flower_white', opaque: false, solid: false, cutout: true,
  lightOpacity: 0, hardness: 0, sound: 'grass', selection: [0.25, 0, 0.25, 0.75, 0.65, 0.75],
}).id;

// ---- signs: the board and its text are drawn by the sign renderer from the block entity
const SIGN: Opts = {
  ...WOOD, hardness: 1, tex: 'planks', render: RENDER_MODEL, opaque: false, solid: false, lightOpacity: 0,
  item: 'sign', interact: 'sign', drops: [{ item: 'sign', min: 1, max: 1 }],
};
export const SIGN_STANDING = reg('sign', 'Oak Sign', { ...SIGN, shape: 'sign', selection: [0.25, 0, 0.25, 0.75, 1, 0.75] }).id;
export const WALL_SIGNS: Record<Facing, number> = { n: 0, e: 0, s: 0, w: 0 };
for (const f of FACINGS) {
  WALL_SIGNS[f] = reg(`wall_sign:${f}`, 'Oak Sign', {
    ...SIGN, shape: 'wall_sign', facing: f, variantOf: 'wall_sign', selection: unionBox(rotateBoxes([0, 4, 14, 16, 12, 16], f)),
  }).id;
}

// ---- lanterns: standing, or hanging from the block above on a short chain
const LANTERN: Opts = {
  top: 'lantern_top', bottom: 'lantern_top', render: RENDER_MODEL, opaque: false, cutout: true, lightOpacity: 0, lightEmission: 15,
  hardness: 1, tool: 'pickaxe', sound: 'stone', shape: 'lantern', variantOf: 'lantern', item: 'lantern', drops: [{ item: 'lantern', min: 1, max: 1 }],
};
export const LANTERN_STANDING = reg('lantern', 'Lantern', { ...LANTERN, side: 'lantern_side', half: 'bottom', model: [5, 0, 5, 11, 7, 11, 6, 7, 6, 10, 9, 10] }).id;
const CHAIN_FACES = ['chain', 'chain', 'lantern_top', 'lantern_top', 'chain', 'chain'];
export const LANTERN_HANGING = reg('lantern:hanging', 'Lantern', {
  ...LANTERN, side: 'lantern_hang_side', half: 'top', model: [5, 2, 5, 11, 9, 11, 6, 9, 6, 10, 11, 10, 7, 11, 7, 9, 16, 9],
  collision: [5, 2, 5, 11, 11, 11], modelFaces: [null, null, CHAIN_FACES],
}).id;

// ---- flower pots: an empty pot, or one holding a flower, a cactus or a dry shrub
const POT_MODEL = [5, 0, 5, 11, 6, 11];
const POT: Opts = {
  side: 'flower_pot', top: 'flower_pot_top', bottom: 'flower_pot_top', render: RENDER_MODEL, opaque: false, cutout: true,
  lightOpacity: 0, hardness: 0, sound: 'stone', shape: 'pot', interact: 'pot', item: 'flower_pot', variantOf: 'flower_pot',
  model: POT_MODEL,
};
export const FLOWER_POT = reg('flower_pot', 'Flower Pot', { ...POT, drops: [{ item: 'flower_pot', min: 1, max: 1 }] }).id;
export const POT_PLANTS = ['flower_red', 'flower_yellow', 'flower_blue', 'flower_white', 'cactus', 'dead_bush'] as const;
export const POTTED: Record<string, number> = {};
for (const plant of POT_PLANTS) {
  const drops = [{ item: 'flower_pot', min: 1, max: 1 }, { item: plant, min: 1, max: 1 }];
  POTTED[plant] = reg(`flower_pot:${plant}`, 'Flower Pot', plant === 'cactus'
    ? { ...POT, drops, model: [...POT_MODEL, 6, 6, 6, 10, 15, 10], collision: POT_MODEL, modelFaces: [null, ['cactus_side', 'cactus_side', 'cactus_top', 'cactus_bottom', 'cactus_side', 'cactus_side']], selection: [5 / 16, 0, 5 / 16, 11 / 16, 15 / 16, 11 / 16] }
    : { ...POT, drops, collision: POT_MODEL, cross: { tex: plant, lo: 4, hi: 12, y0: 5, y1: 17 }, selection: [5 / 16, 0, 5 / 16, 11 / 16, 14 / 16, 11 / 16] }).id;
}
/** The plant item held by a potted-plant block, or null. */
export function potPlant(id: number): string | null {
  for (const p of POT_PLANTS) if (POTTED[p] === id) return p;
  return null;
}

export const BLOCK_COUNT = defs.length;
export const BLOCKS: ReadonlyArray<BlockDef> = defs;

export function getBlock(id: number): BlockDef {
  return defs[id] ?? defs[0];
}

export function blockByKey(key: string): BlockDef | undefined {
  return byKey.get(key);
}

export function facingVariant(base: string, facing: Facing): number {
  return byKey.get(`${base}:${facing}`)!.id;
}

// ---- dense lookup tables for hot loops (meshing, lighting, physics, raycasting) ----
export const IS_WATER = new Uint8Array(256);
export const FLUID_LEVEL = new Int8Array(256).fill(-1);
export const NEIGHBOR_LIGHT = new Uint8Array(256);
export const TOP_ROT = new Uint8Array(256);
/** Model boxes per block id (1/16 units) or null. */
export const MODEL: (Int8Array | null)[] = new Array(256).fill(null);
/** Collision boxes per block id (block units, relative to the cell) or null for a full cube. */
export const COLLISION: (Float32Array | null)[] = new Array(256).fill(null);
export const CULL_GROUP = new Int16Array(256).fill(-1);
export const IS_OPAQUE = new Uint8Array(256);
export const IS_SOLID = new Uint8Array(256);
export const RENDER = new Uint8Array(256);
export const LIGHT_OPACITY = new Uint8Array(256);
export const LIGHT_EMISSION = new Uint8Array(256);
export const IS_CUTOUT = new Uint8Array(256);
export const CULL_SAME = new Uint8Array(256);
export const FACE_LAYER = new Uint8Array(256 * 6);
for (const d of defs) {
  IS_OPAQUE[d.id] = d.opaque ? 1 : 0;
  IS_SOLID[d.id] = d.solid ? 1 : 0;
  RENDER[d.id] = d.render;
  LIGHT_OPACITY[d.id] = d.lightOpacity;
  LIGHT_EMISSION[d.id] = d.lightEmission;
  IS_CUTOUT[d.id] = d.cutout ? 1 : 0;
  CULL_SAME[d.id] = d.cullSame ? 1 : 0;
  for (let f = 0; f < 6; f++) FACE_LAYER[d.id * 6 + f] = d.faces[f];
  if (d.fluidLevel >= 0) { IS_WATER[d.id] = 1; FLUID_LEVEL[d.id] = d.fluidLevel; }
  NEIGHBOR_LIGHT[d.id] = d.neighborLight ? 1 : 0;
  TOP_ROT[d.id] = d.topRot;
  if (d.model) MODEL[d.id] = Int8Array.from(d.model);
  if (d.solid && d.collision) COLLISION[d.id] = Float32Array.from(d.collision, (v) => v / 16);
}
{
  const groups = new Map<string, number>();
  for (const d of defs) {
    if (!d.cullGroup) continue;
    if (!groups.has(d.cullGroup)) groups.set(d.cullGroup, groups.size);
    CULL_GROUP[d.id] = groups.get(d.cullGroup)!;
  }
}
/** Crop growth stage per id (-1 = not a crop) and the last stage of that crop. */
export const CROP_STAGE = new Int8Array(256).fill(-1);
export const CROP_MAX = new Int8Array(256);
/** Blocks that react to random ticks (crops, farmland). */
export const RANDOM_TICK = new Uint8Array(256);
WHEAT.forEach((id, s) => { CROP_STAGE[id] = s; CROP_MAX[id] = 7; RANDOM_TICK[id] = 1; });
CARROTS.forEach((id, s) => { CROP_STAGE[id] = s; CROP_MAX[id] = 3; RANDOM_TICK[id] = 1; });
RANDOM_TICK[FARMLAND] = 1;
RANDOM_TICK[FARMLAND_MOIST] = 1;
export function cropStages(id: number): number[] | null {
  const d = defs[id];
  if (!d) return null;
  return d.variantOf === 'wheat' ? WHEAT : d.variantOf === 'carrots' ? CARROTS : null;
}
export const IS_FARMLAND = (id: number): boolean => id === FARMLAND || id === FARMLAND_MOIST;

// ---- 1.4 lookup tables
/** Per-box texture layers for models with overrides (6 per box, -1 = the block's own face). */
export const MODEL_FACES: (Int16Array | null)[] = new Array(256).fill(null);
/** Cross plant inside a model: [layer, lo, hi, y0, y1] in 1/16 units. */
export const MODEL_CROSS: (Int16Array | null)[] = new Array(256).fill(null);
/** Ladders. */
export const CLIMBABLE = new Uint8Array(256);
/** 1 = fence, 2 = glass pane: shapes that reach out to their neighbours. */
export const CONNECT = new Uint8Array(256);
export const CONNECT_FENCE = 1;
export const CONNECT_PANE = 2;
/** Fence gates: 1 = spans the X axis (facing n/s), 2 = spans the Z axis (facing e/w). */
export const GATE_AXIS = new Uint8Array(256);
/** Solid blocks creatures may spawn on (not fences, gates, panes, ladders, lanterns, pots...). */
export const SPAWN_FLOOR = new Uint8Array(256);
export const PANE_EDGE_LAYER = textureLayer('glass_pane_edge');
for (const d of defs) {
  if (d.modelFaces && d.model) {
    const a = new Int16Array(d.model.length).fill(-1);
    d.modelFaces.forEach((f, box) => { if (f) for (let k = 0; k < 6; k++) a[box * 6 + k] = textureLayer(f[k]); });
    MODEL_FACES[d.id] = a;
  }
  if (d.cross) MODEL_CROSS[d.id] = Int16Array.from([textureLayer(d.cross.tex), d.cross.lo, d.cross.hi, d.cross.y0, d.cross.y1]);
  if (d.shape === 'ladder') CLIMBABLE[d.id] = 1;
  if (d.shape === 'fence') CONNECT[d.id] = CONNECT_FENCE;
  if (d.shape === 'pane') CONNECT[d.id] = CONNECT_PANE;
  if (d.shape === 'gate' && d.facing) GATE_AXIS[d.id] = d.facing === 'n' || d.facing === 's' ? 1 : 2;
  const partial = d.collision !== null && d.shape !== 'slab' && d.shape !== 'stairs' && d.id !== RUNE_TABLE;
  SPAWN_FLOOR[d.id] = d.solid && !partial && !CONNECT[d.id] ? 1 : 0;
}

// ---- connected shapes (fences and panes). Mask bits: 1 north, 2 east, 4 south, 8 west.
export const MASK_N = 1, MASK_E = 2, MASK_S = 4, MASK_W = 8;
/** Does a fence/pane reach toward neighbour `nb` lying in direction `dir`? */
export function connectsTo(self: number, nb: number, dir: Facing): boolean {
  const k = CONNECT[self];
  if (!k || nb === 255) return false;
  if (CONNECT[nb] === k) return true;
  if (IS_OPAQUE[nb]) return true;
  if (k === CONNECT_FENCE) return GATE_AXIS[nb] === (dir === 'e' || dir === 'w' ? 1 : 2);
  return nb === GLASS;
}
export function connectMask(self: number, n: number, e: number, s: number, w: number): number {
  return (connectsTo(self, n, 'n') ? MASK_N : 0) | (connectsTo(self, e, 'e') ? MASK_E : 0)
    | (connectsTo(self, s, 's') ? MASK_S : 0) | (connectsTo(self, w, 'w') ? MASK_W : 0);
}
/** Mask of a connected block at (x, y, z) using a block lookup. */
export function connectMaskAt(get: (x: number, y: number, z: number) => number, id: number, x: number, y: number, z: number): number {
  return connectMask(id, get(x, y, z - 1), get(x + 1, y, z), get(x, y, z + 1), get(x - 1, y, z));
}
function fenceModel(m: number): number[] {
  const b = [6, 0, 6, 10, 16, 10];
  if (m & MASK_N) b.push(7, 12, 0, 9, 15, 6, 7, 6, 0, 9, 9, 6);
  if (m & MASK_S) b.push(7, 12, 10, 9, 15, 16, 7, 6, 10, 9, 9, 16);
  if (m & MASK_E) b.push(10, 12, 7, 16, 15, 9, 10, 6, 7, 16, 9, 9);
  if (m & MASK_W) b.push(0, 12, 7, 6, 15, 9, 0, 6, 7, 6, 9, 9);
  return b;
}
function fenceCollision(m: number): number[] {
  const b = [6, 0, 6, 10, 24, 10];
  if (m & MASK_N) b.push(6, 0, 0, 10, 24, 6);
  if (m & MASK_S) b.push(6, 0, 10, 10, 24, 16);
  if (m & MASK_E) b.push(10, 0, 6, 16, 24, 10);
  if (m & MASK_W) b.push(0, 0, 6, 6, 24, 10);
  return b;
}
function paneModel(m: number): number[] {
  const ns = (m & (MASK_N | MASK_S)) !== 0, ew = (m & (MASK_E | MASK_W)) !== 0;
  if (!ns && !ew) return [7, 0, 7, 9, 16, 9];
  const b: number[] = [];
  if (ns) b.push(7, 0, m & MASK_N ? 0 : 7, 9, 16, m & MASK_S ? 16 : 9);
  if (ew && !ns) b.push(m & MASK_W ? 0 : 7, 0, 7, m & MASK_E ? 16 : 9, 16, 9);
  else if (ew) {
    if (m & MASK_W) b.push(0, 0, 7, 7, 16, 9);
    if (m & MASK_E) b.push(9, 0, 7, 16, 16, 9);
  }
  return b;
}
/** [kind][mask] model boxes (1/16), collision boxes (block units) and selection box. */
export const CONNECT_MODEL: Int8Array[][] = [[], [], []];
export const CONNECT_COLLIDE: Float32Array[][] = [[], [], []];
export const CONNECT_SELECT: number[][][] = [[], [], []];
for (let m = 0; m < 16; m++) {
  for (const k of [CONNECT_FENCE, CONNECT_PANE]) {
    const model = k === CONNECT_FENCE ? fenceModel(m) : paneModel(m);
    const col = k === CONNECT_FENCE ? fenceCollision(m) : model;
    CONNECT_MODEL[k][m] = Int8Array.from(model);
    CONNECT_COLLIDE[k][m] = Float32Array.from(col, (v) => v / 16);
    const lo = k === CONNECT_FENCE ? 6 : 7, hi = 16 - lo;
    CONNECT_SELECT[k][m] = [m & MASK_W ? 0 : lo / 16, 0, m & MASK_N ? 0 : lo / 16, m & MASK_E ? 1 : hi / 16, 1, m & MASK_S ? 1 : hi / 16];
  }
}
/** Selection box of the block at a position (connected shapes depend on their neighbours). */
export function selectionAt(get: (x: number, y: number, z: number) => number, id: number, x: number, y: number, z: number): number[] {
  const k = CONNECT[id];
  if (k) return CONNECT_SELECT[k][connectMaskAt(get, id, x, y, z)];
  return defs[id]?.selection ?? FULL;
}
/** Collision boxes (block units) at a position; null = full cube. Only meaningful for solid blocks. */
export function collisionAt(get: (x: number, y: number, z: number) => number, id: number, x: number, y: number, z: number): Float32Array | null {
  const k = CONNECT[id];
  if (k) return CONNECT_COLLIDE[k][connectMaskAt(get, id, x, y, z)];
  return COLLISION[id];
}

// unknown ids behave like opaque stone so corrupt data never produces holes
for (let i = defs.length; i < 256; i++) { IS_OPAQUE[i] = 1; IS_SOLID[i] = 1; RENDER[i] = RENDER_CUBE; LIGHT_OPACITY[i] = 15; }
FACE_LAYER.fill(0, defs.length * 6);
export { WATER_LAYER };
