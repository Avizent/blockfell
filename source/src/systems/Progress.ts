import { NAMES } from '../world/names';

export interface AdvancementDef {
  id: string;
  title: string;
  description: string;
  icon: string;          // item id
  parent?: string;
}

/** Original advancement set (tracked from real gameplay events). */
export const ADVANCEMENTS: AdvancementDef[] = [
  { id: 'wood', title: 'Timber!', description: 'Chop a log from a tree', icon: 'log' },
  { id: 'planks', title: 'Woodworker', description: 'Turn a log into planks', icon: 'planks', parent: 'wood' },
  { id: 'table', title: 'Workbench', description: 'Craft a crafting table', icon: 'crafting_table', parent: 'planks' },
  { id: 'pickaxe', title: 'Pick It Up', description: 'Craft a wooden pickaxe', icon: 'wooden_pickaxe', parent: 'table' },
  { id: 'stone', title: 'Rock Solid', description: 'Mine cobblestone with a pickaxe', icon: 'cobblestone', parent: 'pickaxe' },
  { id: 'stone_pick', title: 'Upgrade', description: 'Craft a stone pickaxe', icon: 'stone_pickaxe', parent: 'stone' },
  { id: 'furnace', title: 'Hot Stuff', description: 'Craft a furnace', icon: 'furnace', parent: 'stone' },
  { id: 'iron', title: 'Metal Age', description: 'Smelt an iron ingot', icon: 'iron_ingot', parent: 'furnace' },
  { id: 'iron_pick', title: 'Iron Will', description: 'Craft an iron pickaxe', icon: 'iron_pickaxe', parent: 'iron' },
  { id: 'armor', title: 'Suit Up', description: 'Wear a piece of armour', icon: 'iron_chestplate', parent: 'iron' },
  { id: 'torch', title: 'Let There Be Light', description: 'Place a torch', icon: 'torch', parent: 'stone' },
  { id: 'sword', title: 'Armed', description: 'Craft a sword', icon: 'wooden_sword', parent: 'table' },
  { id: 'kill', title: 'Monster Slayer', description: 'Defeat a hostile creature', icon: 'iron_sword', parent: 'sword' },
  { id: 'bow', title: 'Sharpshooter', description: 'Hit a creature with an arrow', icon: 'bow', parent: 'kill' },
  { id: 'eat', title: 'Snack Time', description: 'Eat something', icon: 'apple' },
  { id: 'chest', title: 'Hoarder', description: 'Open a chest', icon: 'chest' },
  { id: 'deep', title: 'Deep Dive', description: 'Descend below height 20', icon: 'iron_ore' },
  { id: 'summit', title: 'Summit', description: 'Climb above height 105', icon: 'snow' },
  { id: 'night', title: 'First Night', description: 'Live to see the sun rise again', icon: 'torch' },
  { id: 'sleep', title: 'Sweet Dreams', description: 'Sleep in a bed', icon: 'bed' },
  { id: 'runes', title: 'Rune Carver', description: 'Inscribe runes at a Rune Table', icon: 'rune_shard' },
  { id: 'harvest', title: 'Green Fingers', description: 'Harvest a ripe crop', icon: 'wheat' },
  { id: 'trade', title: 'Good Deal', description: 'Trade with a villager', icon: 'amber' },
  { id: 'hero', title: 'Hero of the Village', description: 'Defend a village from a night raid', icon: 'iron_sword' },
  { id: 'storm', title: 'Storm Watcher', description: 'See lightning strike close by', icon: 'water_bucket' },
  { id: 'tame', title: 'Loyal Companion', description: 'Tame a Fellhound', icon: 'raw_beef' },
  { id: 'dye', title: 'A Splash of Colour', description: 'Craft a dye or dyed wool', icon: 'red_dye' },
  { id: 'sign', title: 'Signpost', description: 'Write something on a sign', icon: 'sign' },
  { id: 'painting', title: 'Art Lover', description: 'Hang a painting', icon: 'painting' },
  { id: 'boat', title: 'Set Sail', description: 'Row a boat across the water', icon: 'boat' },
  { id: 'fish', title: 'Catch of the Day', description: 'Catch a fish', icon: 'raw_trout', parent: 'boat' },
  { id: 'cinder', title: 'Cooling Off', description: 'Pour water on lava to make Cinderstone', icon: 'cinderstone', parent: 'deep' },
  { id: 'dungeon', title: 'Dungeon Delver', description: 'Open a chest in a dungeon', icon: 'mossy_cobblestone', parent: 'deep' },
  { id: 'spawner', title: 'Cage Breaker', description: 'Break a Monster Cage', icon: 'spawner', parent: 'dungeon' },
  { id: 'born', title: 'A Growing Village', description: 'See a child born in a village', icon: 'bread', parent: 'trade' },
  { id: 'map', title: 'X Marks the Spot', description: 'Follow a map to the place it shows', icon: 'dungeon_map', parent: 'trade' },
  // 2.0: the Cinderdeep
  { id: 'deepgate', title: 'Into the Cinderdeep', description: 'Go through a Deepgate', icon: 'cinderstone', parent: 'cinder' },
  { id: 'ember', title: 'Embers in the Dark', description: 'Mine Ember Ore', icon: 'ember', parent: 'deepgate' },
  { id: 'shrine', title: 'Shrine Raider', description: 'Open a chest in an Ember Shrine', icon: 'ashrock_bricks', parent: 'deepgate' },
  { id: 'charm', title: 'Fireproof', description: 'Make a Cinder Charm', icon: 'cinder_charm', parent: 'shrine' },
  // 2.1
  { id: 'stand', title: 'On Display', description: 'Put armour on an Armour Stand', icon: 'armour_stand', parent: 'armor' },
  { id: 'dye_armour', title: 'Dressed to Impress', description: 'Dye a piece of leather armour', icon: 'leather_chestplate', parent: 'dye' },
  { id: 'ashboar_breed', title: 'Ember Piglet', description: 'Feed two Ashboars Glowcaps so they have a piglet', icon: 'glowcap', parent: 'deepgate' },
  // 2.2: the Starhollow
  { id: 'stargate', title: 'Among the Stars', description: 'Go through a Stargate to the Starhollow', icon: 'star_lens', parent: 'deepgate' },
  { id: 'storm_bells', title: 'Silence the Bells', description: 'Ring all four Storm Bells', icon: 'starstone_bricks', parent: 'stargate' },
  { id: 'hollowdrake', title: 'Free the Stars', description: 'Defeat the Hollowdrake', icon: 'star_scale', parent: 'storm_bells' },
  { id: 'glide', title: 'Take Wing', description: 'Glide on Starwings', icon: 'star_wings', parent: 'hollowdrake' },
  // 2.3: snow day, pets and farm animals
  { id: 'snowball', title: 'Snowball Fight!', description: 'Throw a snowball', icon: 'snowball' },
  { id: 'snowpal', title: 'A Frosty Friend', description: `Build a ${NAMES.snowpal}`, icon: 'snow', parent: 'snowball' },
  { id: 'sledge', title: 'Downhill Dash', description: `Ride a ${NAMES.sledge} fast down a snowy hill`, icon: 'sledge', parent: 'snowball' },
  { id: 'fox', title: 'Best Friends', description: `Tame a ${NAMES.fox}`, icon: 'raw_trout' },
  { id: 'nametag', title: "What's Your Name?", description: 'Give a creature a name with a Name Tag', icon: 'name_tag' },
  { id: 'farm_baby', title: 'Little Ones', description: 'Feed two farm animals so they have a baby', icon: 'wheat', parent: 'harvest' },
  // 2.5: potions
  { id: 'brew_stand', title: 'Bubble, Bubble', description: 'Craft a Brewing Stand', icon: 'brewing_stand', parent: 'furnace' },
  { id: 'brew_drink', title: 'Down the Hatch', description: 'Drink a potion', icon: 'potion_swiftness', parent: 'brew_stand' },
  { id: 'long_reach', title: 'Long Reach', description: 'Hit a creature with a spear from 4 blocks away', icon: 'iron_spear', parent: 'kill' },
  { id: 'crossbow', title: 'Loaded', description: 'Fire a crossbow', icon: 'crossbow', parent: 'bow' },
  { id: 'flame_hit', title: 'Fire Arrow', description: 'Set a creature alight with a Flame Arrow', icon: 'flame_arrow', parent: 'crossbow' },
  { id: 'brew_splash', title: 'Splash Zone', description: 'Throw a splash potion', icon: 'splash_mending', parent: 'brew_drink' },
  { id: 'dye_sheep', title: 'Woolly Rainbow', description: 'Dye a sheep', icon: 'pink_dye', parent: 'dye' },
  // 2.4: tracks, carts and parties
  { id: 'cart', title: 'All Aboard', description: 'Ride a Minecart along a rail', icon: 'minecart', parent: 'iron' },
  { id: 'express', title: 'Express Service', description: 'Whizz along on a Boost Rail in a Minecart', icon: 'boost_rail', parent: 'cart' },
  { id: 'party', title: 'Party Time!', description: 'Pop a Party Popper', icon: 'party_popper' },
  { id: 'gift', title: 'A Thoughtful Gift', description: 'Give a Party Bag to a villager or a pet', icon: 'party_bag', parent: 'party' },
  { id: 'cake', title: 'Let Them Eat Cake', description: 'Eat a slice of Party Cake', icon: 'cake', parent: 'party' },
];

export const STAT_LABELS: [string, string, 'count' | 'cm' | 'ticks' | 'hp'][] = [
  ['play_time', 'Time Played', 'ticks'],
  ['blocks_mined', 'Blocks Mined', 'count'],
  ['blocks_placed', 'Blocks Placed', 'count'],
  ['items_crafted', 'Items Crafted', 'count'],
  ['mobs_killed', 'Creatures Defeated', 'count'],
  ['deaths', 'Deaths', 'count'],
  ['deep_visits', 'Trips to the Cinderdeep', 'count'],
  ['jumps', 'Jumps', 'count'],
  ['walk', 'Distance Walked', 'cm'],
  ['sprint', 'Distance Sprinted', 'cm'],
  ['swim', 'Distance Swum', 'cm'],
  ['fly', 'Distance Flown', 'cm'],
  ['fall', 'Distance Fallen', 'cm'],
  ['damage_taken', 'Damage Taken', 'hp'],
  ['damage_dealt', 'Damage Dealt', 'hp'],
  ['food_eaten', 'Food Eaten', 'count'],
  ['items_dropped', 'Items Dropped', 'count'],
  ['items_inscribed', 'Items Inscribed', 'count'],
  ['trades', 'Villager Trades', 'count'],
  ['raids_won', 'Raids Defended', 'count'],
  ['hounds_tamed', 'Fellhounds Tamed', 'count'],
  ['boat', 'Distance by Boat', 'cm'],
  ['fish_caught', 'Fish Caught', 'count'],
  ['spawners_broken', 'Monster Cages Broken', 'count'],
  ['bells_rung', 'Bells Rung', 'count'],
  ['maps_followed', 'Maps Followed', 'count'],
  ['animals_bred', 'Animals Bred', 'count'],
  ['star_visits', 'Trips to the Starhollow', 'count'],
  ['drakes_beaten', 'Hollowdrakes Defeated', 'count'],
  ['glide', 'Distance Glided', 'cm'],
  ['snowballs_thrown', 'Snowballs Thrown', 'count'],
  ['potions_drunk', 'Potions Drunk', 'count'],
  ['potions_thrown', 'Splash Potions Thrown', 'count'],
  ['snowpals_built', `${NAMES.snowpal}s Built`, 'count'],
  ['sledge', `Distance by ${NAMES.sledge}`, 'cm'],
  ['foxes_tamed', `${NAMES.fox}s Tamed`, 'count'],
  ['sheep_sheared', 'Sheep Sheared', 'count'],
  ['names_given', 'Creatures Named', 'count'],
  ['cart', 'Distance by Minecart', 'cm'],
  ['bags_given', 'Party Bags Given', 'count'],
  ['cake_eaten', 'Slices of Cake Eaten', 'count'],
];

export function formatStat(v: number, kind: 'count' | 'cm' | 'ticks' | 'hp'): string {
  if (kind === 'cm') return v >= 100000 ? (v / 100000).toFixed(2) + ' km' : (v / 100).toFixed(1) + ' m';
  if (kind === 'ticks') {
    const s = Math.floor(v / 20);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min ${s % 60} s`;
  }
  if (kind === 'hp') return (v / 2).toFixed(1) + ' hearts';
  return String(Math.floor(v));
}

export class Progress {
  stats: Record<string, number> = {};
  done = new Set<string>();
  onGrant?: (a: AdvancementDef) => void;

  add(stat: string, n = 1): void {
    this.stats[stat] = (this.stats[stat] ?? 0) + n;
  }

  grant(id: string): void {
    if (this.done.has(id)) return;
    const a = ADVANCEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.done.add(id);
    this.onGrant?.(a);
  }

  load(stats: Record<string, number> | undefined, adv: string[] | undefined): void {
    this.stats = { ...(stats ?? {}) };
    this.done = new Set(adv ?? []);
  }
}
