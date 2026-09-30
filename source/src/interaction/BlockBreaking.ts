import { BlockDef, getBlock } from '../world/BlockRegistry';
import { swiftBonus } from '../inventory/Enchantments';
import type { Slot } from '../inventory/ItemStack';
import { getItem } from '../inventory/ItemRegistry';

/** Can the held item harvest (get drops from) this block? */
export function canHarvest(block: BlockDef, held: Slot): boolean {
  if (!block.requiresTool) return true;
  if (!held) return false;
  const t = getItem(held.id).tool;
  return !!t && t.type === block.tool && t.tier >= block.minTier;
}

/**
 * Mining progress added per tick (break when the sum reaches 1), following the
 * reference game's formula: speed / hardness / (canHarvest ? 30 : 100), where
 * speed is the tool multiplier for the right tool, divided by 5 when underwater
 * or airborne.
 */
export function breakProgressPerTick(blockId: number, held: Slot, underwater: boolean, onGround: boolean): number {
  const b = getBlock(blockId);
  if (b.hardness < 0) return 0;
  if (b.hardness === 0) return 1;
  let speed = 1;
  const tool = held ? getItem(held.id).tool : undefined;
  if (tool && tool.type === b.tool) speed = tool.speed + swiftBonus(held);
  if (tool && tool.type === 'sword' && b.key.endsWith('leaves')) speed = 1.5;
  if (underwater) speed /= 5;
  if (!onGround) speed /= 5;
  return speed / b.hardness / (canHarvest(b, held) ? 30 : 100);
}
