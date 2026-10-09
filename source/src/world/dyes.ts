/**
 * The sixteen dye colours (1.4). Plain data shared by the block registry, the
 * texture generator, items and recipes. Order is fixed: block ids of the
 * coloured wools are registered in this order.
 */
export const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;
export type DyeColor = typeof DYE_COLORS[number];

export const DYE_NAMES: Record<DyeColor, string> = {
  white: 'White', orange: 'Orange', magenta: 'Magenta', light_blue: 'Light Blue', yellow: 'Yellow', lime: 'Lime',
  pink: 'Pink', gray: 'Gray', light_gray: 'Light Gray', cyan: 'Cyan', purple: 'Purple', blue: 'Blue',
  brown: 'Brown', green: 'Green', red: 'Red', black: 'Black',
};

/** Base RGB of each colour (wool textures, dye sprites, sign text). */
export const DYE_RGB: Record<DyeColor, [number, number, number]> = {
  white: [234, 234, 230],
  orange: [232, 124, 34],
  magenta: [192, 70, 186],
  light_blue: [92, 168, 222],
  yellow: [244, 206, 52],
  lime: [122, 196, 50],
  pink: [238, 146, 174],
  gray: [70, 74, 80],
  light_gray: [154, 154, 148],
  cyan: [30, 142, 150],
  purple: [122, 50, 174],
  blue: [50, 68, 168],
  brown: [116, 76, 44],
  green: [76, 106, 30],
  red: [166, 42, 38],
  black: [26, 26, 32],
};

/** Block/item key of the wool of a colour (white wool keeps its original key). */
export function woolKey(c: DyeColor): string {
  return c === 'white' ? 'wool' : `${c}_wool`;
}

/** 2.1: words for a dyed leather colour (0xRRGGBB): "Dyed Red", or the nearest dye for a mix. */
export function dyedLabel(color: number): string {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  let best: DyeColor = 'white', bd = Infinity;
  for (const c of DYE_COLORS) {
    const [cr, cg, cb] = DYE_RGB[c];
    const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return bd === 0 ? `Dyed ${DYE_NAMES[best]}` : `Dyed (a mix, close to ${DYE_NAMES[best]})`;
}
