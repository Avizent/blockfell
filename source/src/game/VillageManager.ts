import { Mob } from '../entities/Mob';
import { Villager } from '../entities/Villager';
import { Sentinel } from '../entities/Sentinel';
import type { MobType } from '../entities/mobModels';
import type { Entity } from '../entities/Entity';
import type { VillagePlan } from '../world/Villages';
import { toWorld } from '../world/Villages';
import * as B from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';
import { nearestStandable } from '../entities/Pathfinder';
import { ui, pushChat, pushToast } from '../ui/uiStore';
import type { Game } from './Game';

/** Saved per-village state. */
export interface VillageState {
  id: string;
  populated: boolean;
  /** tickCount until which this village gives the hero discount. */
  heroUntil?: number;
  /** In-game day of the last raid (raids are at most every other night). */
  lastRaidDay?: number;
}

interface Raid {
  plan: VillagePlan;
  wave: number;
  waves: number;
  mobs: Mob[];
  pause: number;
  away: number;
  total: number;
}

/**
 * Keeps track of the villages near the player: spawns their villagers and
 * Sentinel the first time a village loads, answers "whose bed is this?", brings
 * new villagers in at dawn when beds are free, and runs night raids.
 */
export class VillageManager {
  readonly states = new Map<string, VillageState>();
  raid: Raid | null = null;
  private lastTod = -1;

  constructor(private game: Game) {}

  load(list: VillageState[] | undefined): void {
    for (const s of list ?? []) if (s && typeof s.id === 'string') this.states.set(s.id, { ...s });
  }

  save(): VillageState[] {
    return [...this.states.values()];
  }

  plan(id: string): VillagePlan | null {
    return this.game.world.generator.villages?.byId(id) ?? null;
  }

  /** The village the point is in (within its area plus a margin). */
  villageAt(x: number, z: number, margin = 8): VillagePlan | null {
    const v = this.game.world.generator.villages;
    if (!v) return null;
    return v.near(x, z, margin)[0] ?? null;
  }

  villagersOf(id: string): Villager[] {
    const out: Villager[] = [];
    for (const e of this.game.entities.list) if (e instanceof Villager && e.alive && !e.removed && e.villageId === id) out.push(e);
    return out;
  }

  isClaimed(x: number, y: number, z: number, by: Entity): boolean {
    for (const e of this.game.entities.list) {
      if (!(e instanceof Villager) || e === by || !e.alive || e.removed) continue;
      if (e.home && e.home.x === x && e.home.y === y && e.home.z === z) return true;
      if (e.work && e.work.x === x && e.work.y === y && e.work.z === z) return true;
    }
    return false;
  }

  alertSentinels(x: number, z: number): void {
    for (const e of this.game.entities.list) {
      if (e instanceof Sentinel && e.alive && Math.hypot(e.x - x, e.z - z) < 24) e.angry = 600;
    }
  }

  discount(id: string | null): number {
    if (!id) return 0;
    const s = this.states.get(id);
    return s?.heroUntil && s.heroUntil > this.game.tickCount ? 0.3 : 0;
  }

  // ------------------------------------------------------------------ population
  onChunkLoaded(cx: number, cz: number): void {
    const plan = this.game.world.generator.villages?.centredInChunk(cx, cz);
    if (!plan) return;
    const st = this.states.get(plan.id);
    if (st?.populated) return;
    this.populate(plan);
  }

  populate(plan: VillagePlan): void {
    const g = this.game;
    for (const b of plan.buildings) {
      if (!b.bed) continue;
      const [sx, sz] = toWorld(b, 2, 2);
      const v = g.entities.spawnMob('villager', sx + 0.5, b.y + 1, sz + 0.5, g) as Villager;
      v.villageId = plan.id;
      v.home = { ...b.bed };
      if (b.job) { v.setJob(b.job); v.work = b.work ? { ...b.work } : null; }
    }
    this.spawnSentinel(plan);
    this.states.set(plan.id, { ...(this.states.get(plan.id) ?? { id: plan.id }), populated: true });
  }

  private spawnSentinel(plan: VillagePlan): void {
    const g = this.game;
    const x = plan.x + 4, z = plan.z;
    const y = (plan.paths.get(x + ',' + z) ?? plan.y) + 1;
    const s = g.entities.spawnMob('sentinel', x + 0.5, y, z + 0.5, g) as Sentinel;
    s.villageId = plan.id;
    s.homeX = plan.x + 0.5;
    s.homeZ = plan.z + 0.5;
  }

  // ------------------------------------------------------------------ per tick
  tick(): void {
    const g = this.game;
    const tod = g.dayNight.timeOfDay;
    const crossed = (at: number) => this.lastTod >= 0 && this.lastTod < at && tod >= at;
    if (crossed(1000)) this.dawn();
    if (crossed(12900)) this.maybeStartRaid();
    this.lastTod = tod;
    if (this.raid) this.tickRaid();
  }

  /** New villagers move into free beds; a village without a Sentinel gets a new one. */
  private dawn(): void {
    const g = this.game, p = g.player;
    for (const st of this.states.values()) {
      if (!st.populated) continue;
      const plan = this.plan(st.id);
      if (!plan || Math.hypot(plan.x - p.x, plan.z - p.z) > 128 || !g.world.isLoaded(plan.x, plan.z)) continue;
      const folk = this.villagersOf(plan.id);
      if (folk.length >= 2) {
        const bed = this.freeBed(plan, folk);
        if (bed) {   // one newcomer per village per day
          const v = g.entities.spawnMob('villager', bed.sx + 0.5, bed.sy, bed.sz + 0.5, g) as Villager;
          v.villageId = plan.id;
          v.home = { x: bed.x, y: bed.y, z: bed.z, f: bed.f };
        }
      }
      const hasSentinel = g.entities.list.some((e) => e instanceof Sentinel && e.alive && e.villageId === plan.id);
      if (!hasSentinel && folk.length >= 3) this.spawnSentinel(plan);
    }
  }

  /**
   * A bed nobody sleeps in: first the village's own houses, then any bed the
   * player has put inside (or just outside) the village.
   */
  private freeBed(plan: VillagePlan, folk: Villager[]): { x: number; y: number; z: number; f: B.Facing; sx: number; sy: number; sz: number } | null {
    const g = this.game, w = g.world;
    const taken = (x: number, y: number, z: number) => folk.some((v) => v.home && v.home.x === x && v.home.y === y && v.home.z === z)
      || g.entities.list.some((e) => e instanceof Villager && e.alive && e.home && e.home.x === x && e.home.y === y && e.home.z === z);
    for (const b of plan.buildings) {
      if (!b.bed || !w.isLoaded(b.bed.x, b.bed.z)) continue;
      if (B.getBlock(w.getBlock(b.bed.x, b.bed.y, b.bed.z)).shape !== 'bed') continue;
      if (taken(b.bed.x, b.bed.y, b.bed.z)) continue;
      const [sx, sz] = toWorld(b, 2, 2);
      return { ...b.bed, sx, sy: b.y + 1, sz };
    }
    const m = 8;
    for (let x = plan.minX - m; x <= plan.maxX + m; x++) for (let z = plan.minZ - m; z <= plan.maxZ + m; z++) {
      if (!w.isLoaded(x, z)) continue;
      for (let y = plan.y - 12; y <= plan.y + 16; y++) {
        const d = B.getBlock(w.getBlock(x, y, z));
        if (d.shape !== 'bed' || d.half !== 'foot' || !d.facing || taken(x, y, z)) continue;
        const s = nearestStandable(w, x, y, z, 2);
        if (!s) continue;
        return { x, y, z, f: d.facing, sx: s.x, sy: s.y, sz: s.z };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ raids
  private maybeStartRaid(): void {
    const g = this.game, p = g.player;
    if (this.raid || g.difficulty === 'peaceful' || p.dead) return;
    const plan = this.villageAt(p.x, p.z, 8);
    if (!plan || !this.states.get(plan.id)?.populated) return;
    const st = this.states.get(plan.id)!;
    if (st.lastRaidDay !== undefined && g.dayNight.day - st.lastRaidDay < 2) return;
    if (this.villagersOf(plan.id).length === 0) return;
    const chance = g.difficulty === 'easy' ? 0.15 : g.difficulty === 'normal' ? 0.25 : 0.4;
    if (Math.random() < chance) this.startRaid(plan.id);
  }

  startRaid(id: string): boolean {
    const g = this.game;
    const plan = this.plan(id);
    if (!plan || this.raid || g.difficulty === 'peaceful') return false;
    const st = this.states.get(id) ?? { id, populated: false };
    st.lastRaidDay = g.dayNight.day;
    this.states.set(id, st);
    const waves = g.difficulty === 'easy' ? 2 : g.difficulty === 'hard' ? 4 : 3;
    this.raid = { plan, wave: 0, waves, mobs: [], pause: 60, away: 0, total: 1 };
    pushChat('A raid is coming! Defend the village!');
    pushToast({ title: 'Night Raid!', desc: 'Defend the village', icon: 'iron_sword', kind: 'info' });
    g.sound('raid_horn', plan.x, plan.y + 2, plan.z, 1.4);
    return true;
  }

  private spawnWave(): void {
    const g = this.game;
    const r = this.raid!;
    const plan = r.plan;
    r.wave++;
    const n = 3 + r.wave * 2 + (g.difficulty === 'hard' ? 1 : 0);
    const dry = plan.style === 'sandstone';
    r.mobs = [];
    for (let tries = 0; tries < 40 && r.mobs.length < n; tries++) {
      const a = Math.random() * Math.PI * 2, d = plan.radius + 6 + Math.random() * 6;
      const x = Math.floor(plan.x + Math.cos(a) * d), z = Math.floor(plan.z + Math.sin(a) * d);
      if (!g.world.isLoaded(x, z)) continue;
      const top = g.world.highestSolid(x, z);
      if (top < 1) continue;
      const above = g.world.getBlock(x, top + 1, z);
      if (above === UNLOADED || B.IS_WATER[g.world.getBlock(x, top, z)]) continue;
      // a small band per spot
      const band = Math.min(n - r.mobs.length, 1 + Math.floor(Math.random() * 3));
      for (let k = 0; k < band; k++) {
        const q = Math.random();
        const type: MobType = q < 0.45 ? (dry ? 'dustwalker' : 'shambler') : q < 0.75 ? 'skeleton' : 'crawler';
        const m = g.entities.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 2, top + 1, z + 0.5 + (Math.random() - 0.5) * 2, g);
        m.raider = { x: plan.x + 0.5, z: plan.z + 0.5 };
        m.persistent = true;
        r.mobs.push(m);
      }
    }
    r.total = r.mobs.reduce((a, m) => a + m.spec.health, 0) || 1;
    if (r.wave > 1) pushChat(`Wave ${r.wave} of ${r.waves}`);
  }

  private tickRaid(): void {
    const g = this.game, p = g.player;
    const r = this.raid!;
    const plan = r.plan;
    // leaving the village for a while ends the raid
    if (Math.hypot(p.x - plan.x, p.z - plan.z) > plan.radius + 64) {
      if (++r.away > 600) { this.endRaid('The raid is over.', false); return; }
    } else r.away = 0;
    if (r.pause > 0) {
      if (--r.pause === 0) this.spawnWave();
      this.pushBar();
      return;
    }
    r.mobs = r.mobs.filter((m) => m.alive && !m.removed);
    if (this.villagersOf(plan.id).length === 0) { this.endRaid('The village has fallen...', false); return; }
    if (r.mobs.length === 0) {
      if (r.wave >= r.waves) { this.victory(); return; }
      r.pause = 100;
      pushChat(`Wave ${r.wave} defeated!`);
    }
    this.pushBar();
  }

  private pushBar(): void {
    const r = this.raid;
    if (!r) { if (ui.get().raid) ui.set({ raid: null }); return; }
    const left = r.pause > 0 && r.mobs.length === 0 ? (r.wave === 0 ? 1 : 0) : r.mobs.reduce((a, m) => a + Math.max(0, m.health), 0) / r.total;
    const label = r.wave === 0 ? 'Raid' : `Raid - Wave ${r.wave} of ${r.waves}`;
    const cur = ui.get().raid;
    const progress = Math.round(left * 100) / 100;
    if (!cur || cur.label !== label || cur.progress !== progress) ui.set({ raid: { label, progress } });
  }

  private victory(): void {
    const g = this.game, p = g.player;
    const r = this.raid!;
    const st = this.states.get(r.plan.id) ?? { id: r.plan.id, populated: true };
    st.heroUntil = g.tickCount + 24000;
    this.states.set(r.plan.id, st);
    g.progress.grant('hero');
    g.progress.add('raids_won');
    // grateful villagers: a gift of amber and bread
    const amber = 3 + r.waves + Math.floor(Math.random() * 3);
    g.entities.spawnItem({ id: 'amber', count: amber }, p.x, p.y + 1.5, p.z);
    g.entities.spawnItem({ id: 'bread', count: 3 }, p.x, p.y + 1.5, p.z);
    for (const v of this.villagersOf(r.plan.id)) g.effect('happy', v.x, v.y + 2, v.z, 6);
    this.endRaid('Victory! The village is safe. Its villagers will trade with you at a discount for a day.', true);
    g.sound('levelup', p.x, p.y, p.z, 0.8, 1);
  }

  endRaid(message: string, won: boolean): void {
    const r = this.raid;
    if (!r) return;
    for (const m of r.mobs) { if (!won) { m.raider = null; m.persistent = false; } }
    this.raid = null;
    pushChat(message);
    ui.set({ raid: null });
  }

  raidActive(id: string | null): boolean {
    return !!this.raid && !!id && this.raid.plan.id === id;
  }
}
