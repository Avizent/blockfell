/**
 * POTIONS (2.5): six brews, each a drinkable potion and a splash potion.
 * All names, colours and ingredients are our own: nothing here comes from another game.
 *
 *   Glass Bottle  --(right-click water)-->  Water Bottle
 *   Water Bottle + ingredient (Brewing Stand, 20 s)  -->  Potion
 *   Potion + Glimmer Dust                            -->  Splash Potion
 */
export type EffectId = 'swiftness' | 'might' | 'mending' | 'night_eyes' | 'deep_breath' | 'emberward';

export interface EffectDef {
  id: EffectId;
  /** The effect's name in the effects list. */
  name: string;
  /** Names of the potion and the splash potion. */
  potion: string;
  splash: string;
  rgb: [number, number, number];
  /** How long a drunk potion lasts (ticks; 20 = 1 second). */
  duration: number;
  /** What a Water Bottle is brewed with. */
  ingredient: string;
  /** One line for the guide and the tooltip. */
  blurb: string;
}

export const EFFECTS: EffectDef[] = [
  { id: 'swiftness', name: 'Swiftness', potion: 'Potion of Swiftness', splash: 'Splash Potion of Swiftness', rgb: [120, 200, 255], duration: 3600, ingredient: 'feather', blurb: 'Run a third faster.' },
  { id: 'might', name: 'Might', potion: 'Potion of Might', splash: 'Splash Potion of Might', rgb: [210, 70, 60], duration: 3600, ingredient: 'bone', blurb: 'Your blows hit 1.5 hearts harder.' },
  { id: 'mending', name: 'Mending', potion: 'Potion of Mending', splash: 'Splash Potion of Mending', rgb: [255, 120, 170], duration: 900, ingredient: 'starbloom', blurb: 'Heal half a heart every two seconds.' },
  { id: 'night_eyes', name: 'Night Eyes', potion: 'Potion of Night Eyes', splash: 'Splash Potion of Night Eyes', rgb: [150, 110, 230], duration: 4800, ingredient: 'glowcap', blurb: 'See in the dark.' },
  { id: 'deep_breath', name: 'Deep Breath', potion: 'Potion of Deep Breath', splash: 'Splash Potion of Deep Breath', rgb: [60, 130, 240], duration: 4800, ingredient: 'drift_silk', blurb: 'Breathe under water without running out of air.' },
  { id: 'emberward', name: 'Emberward', potion: 'Potion of Emberward', splash: 'Splash Potion of Emberward', rgb: [255, 150, 40], duration: 4800, ingredient: 'ember', blurb: 'Fire and lava cannot hurt you.' },
];

export const EFFECT_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));
export const potionItem = (e: EffectId): string => `potion_${e}`;
export const splashItem = (e: EffectId): string => `splash_${e}`;
/** What turns a potion into a splash potion. */
export const SPLASH_INGREDIENT = 'glimmer_dust';
/** One piece of fuel (coal) powers this many brews. */
export const BREW_FUEL_CHARGES = 10;
export const BREW_TICKS = 400;
/** Splash potions act within this many blocks (a thrown potion lasts 3/4 as long as a drunk one at its edge, full in the middle). */
export const SPLASH_RADIUS = 4;

/** Is the item a bottle the Brewing Stand can work on? */
export function isBottle(id: string): boolean {
  return id === 'water_bottle' || id.startsWith('potion_');
}

/** The effect a potion item gives (and whether it is the splash kind), or null. */
export function effectOfItem(id: string): { effect: EffectDef; splash: boolean } | null {
  const splash = id.startsWith('splash_');
  if (!splash && !id.startsWith('potion_')) return null;
  const e = EFFECT_BY_ID[id.slice(splash ? 7 : 7)];
  return e ? { effect: e, splash } : null;
}

/** Is this an ingredient the Brewing Stand takes? */
export function isIngredient(id: string): boolean {
  return id === SPLASH_INGREDIENT || EFFECTS.some((e) => e.ingredient === id);
}

/** What a bottle becomes with an ingredient, or null if they don't go together. */
export function brewResult(bottle: string, ingredient: string): string | null {
  if (bottle === 'water_bottle') {
    const e = EFFECTS.find((x) => x.ingredient === ingredient);
    return e ? potionItem(e.id) : null;
  }
  if (bottle.startsWith('potion_') && ingredient === SPLASH_INGREDIENT) {
    const e = EFFECT_BY_ID[bottle.slice(7)];
    return e ? splashItem(e.id) : null;
  }
  return null;
}
