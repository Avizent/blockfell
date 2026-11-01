import { Villager } from './Villager';
import type { EntityHost } from './Entity';
import { traderTrades } from './Trades';
import { mulberry32 } from '../core/rng';
import { pushChat } from '../ui/uiStore';

/** How long a trader stays: about 9 minutes (20 ticks a second). */
export const TRADER_STAY = 10800;

/**
 * WANDERING TRADER (2.11)
 * -----------------------
 * A visitor with a great pack on his back. He strolls about for a few minutes, sells potatoes,
 * milk and rare finds for Amber, then packs up and leaves. He owns no bed or workstation and
 * belongs to no village. ORIGINAL design.
 */
export class WanderingTrader extends Villager {
  /** Ticks until he leaves. */
  stay = TRADER_STAY;

  constructor(host?: EntityHost) {
    super(host, null, 'trader', 'trader');
    this.persistent = true;
    this.trades = traderTrades(mulberry32(this.seed));
  }

  get name(): string { return 'Wandering Trader'; }
  get fullName(): string { return 'the Wandering Trader'; }
  get title(): string { return `${Math.max(1, Math.ceil(this.stay / 1200))} min left`; }
  get label(): string { return 'Trader'; }

  protected findFreeWorkstation(): null { return null; }
  protected findFreeBed(): null { return null; }

  tick(host: EntityHost): void {
    if (this.tradingWith) this.stay = Math.max(this.stay, 600);     // never leaves mid-deal
    else if (--this.stay <= 0) {
      this.removed = true;
      host.effect('poof', this.x, this.y + 1, this.z, 14);
      if (Math.hypot(host.player.x - this.x, host.player.z - this.z) < 48) pushChat('The Wandering Trader packs up and moves on.');
      return;
    }
    super.tick(host);
  }

  serialize(): Record<string, unknown> | null {
    const base = super.serialize();
    return base ? { ...base, v: { ...(base.v as Record<string, unknown>), stay: this.stay } } : null;
  }

  restore(v: Record<string, unknown>): void {
    super.restore(v);
    if (typeof v.stay === 'number') this.stay = v.stay;
  }
}
