import type { ItemStack, Slot } from '../inventory/ItemStack';

export interface ShapedRecipe {
  type: 'shaped';
  pattern: string[];                 // rows; ' ' = empty
  key: Record<string, string>;       // symbol -> item id
  result: ItemStack;
}
export interface ShapelessRecipe {
  type: 'shapeless';
  ingredients: string[];
  result: ItemStack;
}
export type Recipe = ShapedRecipe | ShapelessRecipe;

/**
 * Recipe matching against a real crafting grid (2x2 or 3x3).
 * Shaped recipes may sit anywhere in the grid (the occupied bounding box is
 * compared) and also match their horizontal mirror image. Shapeless recipes
 * compare ingredient multisets.
 */
export class RecipeManager {
  private recipes: Recipe[] = [];

  add(r: Recipe): void {
    this.recipes.push(r);
  }

  all(): ReadonlyArray<Recipe> {
    return this.recipes;
  }

  match(grid: Slot[], width: number): Recipe | null {
    const height = grid.length / width;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    const present: string[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const s = grid[y * width + x];
      if (!s) continue;
      present.push(s.id);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (maxX < 0) return null;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const cell = (x: number, y: number): string | null => grid[(minY + y) * width + (minX + x)]?.id ?? null;

    for (const r of this.recipes) {
      if (r.type === 'shapeless') {
        if (r.ingredients.length !== present.length) continue;
        const need = [...r.ingredients].sort();
        const have = [...present].sort();
        if (need.every((v, i) => v === have[i])) return r;
        continue;
      }
      const ph = r.pattern.length, pw = Math.max(...r.pattern.map((row) => row.length));
      if (ph !== bh || pw !== bw) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < ph && ok; y++) for (let x = 0; x < pw && ok; x++) {
          const px = mirror ? pw - 1 - x : x;
          const sym = r.pattern[y][px] ?? ' ';
          const want = sym === ' ' ? null : r.key[sym];
          if (want !== cell(x, y)) ok = false;
        }
        if (ok) return r;
      }
    }
    return null;
  }
}
