import { Mob } from '../entities/Mob';
import { Villager, CHILD_TICKS } from '../entities/Villager';
import { Sentinel } from '../entities/Sentinel';
import type { MobType } from '../entities/mobModels';
import type { Entity } from '../entities/Entity';
import type { VillagePlan } from '../world/Villages';
import { toWorld, VILLAGE_REGION } from '../world/Villages';
import * as B from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';
import type { Chunk } from '../world/Chunk';
import { nearestStandable } from '../entities/Pathfinder';
import { dungeonCandidate } from '../world/Dungeons';
import { villageName } from '../entities/villageNames';
import type { MapTarget } from '../inventory/ItemStack';
import { ui, pushChat, pushToast } from '../ui/uiStore';
import type { Game } from './Game';

/** Saved per-village state. */
export interface VillageState {
  id: string;
  populated: boolean;
  /** (Before 1.8: tickCount until which the village gave the hero discount. Now a reputation boost.) */
  heroUntil?: number;
  /** In-game day of the last raid (raids are at most every other night). */
  lastRaidDay?: number;
  /** 1.8: the player's standing in this village, -100..100. */
  rep?: number;
  /** 1.8: standing gained today from trading, gifts and fighting monsters (each has a daily cap). */
  gains?: { day: number; trade: number; gift: number; defend: number };
  /** 1.8: food in the village store (from the harvest and from gifts). Children need it. */
  food?: number;
  /** 1.8: world time (DayNight.time) when the player was last near the village. */
  lastSeen?: number;
  /** 1.8: places the village's Mapmakers have already drawn maps to ("x,y,z"). */
  mapped?: string[];
  /** 1.8: children born here. */
  born?: number;
}

/** Food a village needs in its store for a child to be born. */
export const FOOD_PER_CHILD = 12;
const FOOD_MAX = 64;
/** Standing gained per day from each source at most. */
const DAILY_CAP = { trade: 12, gift: 15, defend: 6 };

export interface Standing { key: 'hostile' | 'distrustful' | 'neutral' | 'friendly' | 'honoured'; name: string }
export function standingOf(rep: number): Standing {
  if (rep <= -60) return { key: 'hostile', name: 'Hostile' };
  if (rep <= -25) return { key: 'distrustful', name: 'Distrustful' };
  if (rep < 25) return { key: 'neutral', name: 'Neutral' };
  if (rep < 60) return { key: 'friendly', name: 'Friendly' };
  return { key: 'honoured', name: 'Honoured' };
}

/** Food value of a gift to a villager (0 = not something villagers want). */
export const GIFT_FOOD: Record<string, number> = {
  bread: 3, apple: 2, carrot: 1, wheat: 1, cooked_porkchop: 3, steak: 3, cooked_chicken: 2, cooked_mutton: 3, cooked_rabbit: 2,
  cooked_trout: 2, cooked_perch: 3, flower_red: 0, flower_yellow: 0, flower_blue: 0, flower_white: 0,
};

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
 *
 * 1.8 VILLAGE LIFE: the player's standing in each village, the village food store
 * and children, Village Bells (the meeting point and the alarm), maps drawn by the
 * Mapmaker, and catching up on the time a village spent unloaded.
 */
export class VillageManager {
  readonly states = new Map<string, VillageState>();
  raid: Raid | null = null;
  /** Village Bells in loaded chunks ("x,y,z"). */
  readonly bells = new Map<string, { x: number; y: number; z: number }>();
  private lastTod = -1;
  private birthTimer = 0;
  /** Session tick when the player was last near each village (to tell a night's sleep from being away). */
  private nearTick = new Map<string, number>();

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

  /** The village's name ("Millbrook"), the same every time from the seed. */
  name(id: string | null): string {
    return id ? villageName(this.game.world.seed, id) : '';
  }

  private state(id: string): VillageState {
    let st = this.states.get(id);
    if (!st) { st = { id, populated: false }; this.states.set(id, st); }
    return st;
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

  // ------------------------------------------------------------------ standing (1.8)
  rep(id: string | null): number {
    return id ? this.states.get(id)?.rep ?? 0 : 0;
  }

  standing(id: string | null): Standing {
    return standingOf(this.rep(id));
  }

  /**
   * Price factor for what the player gives: from 0.7 (Honoured, 100) to 1.3 (Hostile, -100).
   * Applies to Amber the player pays and to goods a villager buys.
   */
  priceFactor(id: string | null): number {
    return 1 - (this.rep(id) / 100) * 0.3;
  }

  /** For the trade screen: the fraction off (positive) or extra (negative) on prices. */
  discount(id: string | null): number {
    return Math.round((1 - this.priceFactor(id)) * 100) / 100;
  }

  /** Changes the player's standing in a village; tells the player when it crosses a boundary. */
  addRep(id: string | null, delta: number, cap?: keyof typeof DAILY_CAP): number {
    if (!id || !delta) return 0;
    const st = this.state(id);
    if (cap) {
      const day = this.game.dayNight.day;
      if (!st.gains || st.gains.day !== day) st.gains = { day, trade: 0, gift: 0, defend: 0 };
      const room = DAILY_CAP[cap] - st.gains[cap];
      delta = Math.max(0, Math.min(delta, room));
      if (!delta) return 0;
      st.gains[cap] += delta;
    }
    const before = st.rep ?? 0;
    st.rep = Math.max(-100, Math.min(100, before + delta));
    const a = standingOf(before), b = standingOf(st.rep);
    if (a.key !== b.key) pushChat(`Your standing in ${this.name(id)} is now ${b.name}.`);
    return st.rep - before;
  }

  /** A villager or the Sentinel was hurt (or killed) by the player. */
  onFolkHurt(m: Mob, villageId: string | null, killed: boolean): void {
    if (m instanceof Sentinel) this.addRep(villageId, killed ? -20 : -5);
    else if (m instanceof Villager) this.addRep(villageId, killed ? -30 : m.isChild ? -15 : -8);
  }

  /** A villager died: tell the player (if near) who it was and what happened. */
  onVillagerDied(v: Villager, byPlayer: boolean, killer: Mob | null): void {
    const p = this.game.player;
    if (Math.hypot(v.x - p.x, v.z - p.z) > 64) return;
    const who = v.fullName;
    const how = byPlayer ? 'was killed by you' : killer ? `was killed by ${killer.spec.folk ? 'the ' : 'a '}${killer.spec.name}` : 'died';
    pushChat(`${who} ${how}.`);
  }

  /** A hostile creature killed by the player inside a village: a little standing there. */
  onHostileKilled(x: number, z: number): void {
    const plan = this.villageAt(x, z, 4);
    if (plan && this.states.get(plan.id)?.populated) this.addRep(plan.id, 1, 'defend');
  }

  onTrade(v: Villager, n: number): void {
    this.addRep(v.villageId, n, 'trade');
  }

  /** A gift of food (or a flower) to a villager. Returns false if nobody wants it. */
  gift(v: Villager, item: string): boolean {
    if (GIFT_FOOD[item] === undefined || !v.villageId) return false;
    const st = this.state(v.villageId);
    st.food = Math.min(FOOD_MAX, (st.food ?? 0) + GIFT_FOOD[item]);
    this.addRep(v.villageId, 3, 'gift');
    return true;
  }

  addFood(id: string | null, n: number): void {
    if (!id) return;
    const st = this.state(id);
    st.food = Math.max(0, Math.min(FOOD_MAX, (st.food ?? 0) + n));
  }

  // ------------------------------------------------------------------ bells (1.8)
  scanChunk(c: Chunk): void {
    const b = c.blocks;
    let i = b.indexOf(B.BELL);
    while (i >= 0) {
      const x = c.cx * 16 + (i & 15), y = i >> 8, z = c.cz * 16 + ((i >> 4) & 15);
      this.bells.set(`${x},${y},${z}`, { x, y, z });
      i = b.indexOf(B.BELL, i + 1);
    }
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (id === B.BELL) this.bells.set(`${x},${y},${z}`, { x, y, z });
    else if (old === B.BELL) this.bells.delete(`${x},${y},${z}`);
  }

  /** The bell of a village (the one nearest its well), if it has one. */
  bellOf(plan: VillagePlan): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null, bd = 1e9;
    for (const b of this.bells.values()) {
      if (b.x < plan.minX - 8 || b.x > plan.maxX + 8 || b.z < plan.minZ - 8 || b.z > plan.maxZ + 8) continue;
      const d = Math.hypot(b.x - plan.x, b.z - plan.z);
      if (d < bd && this.game.world.getBlock(b.x, b.y, b.z) === B.BELL) { bd = d; best = b; }
    }
    return best;
  }

  /** Where the village meets at midday: round its bell, or its well. */
  meetingPoint(id: string | null): { x: number; y: number; z: number } | null {
    const plan = id ? this.plan(id) : null;
    if (!plan) return null;
    const bell = this.bellOf(plan);
    if (bell) return { x: bell.x, y: bell.y, z: bell.z };
    return { x: plan.x, y: plan.y + 1, z: plan.z };
  }

  /**
   * Ringing a bell: the villagers of its village hurry indoors for a minute, and
   * monsters within 32 blocks glow (seen through walls) for half a minute.
   */
  ring(x: number, y: number, z: number): { villagers: number; monsters: number } {
    const g = this.game;
    g.sound('bell', x + 0.5, y + 0.5, z + 0.5, 1.2, 1);
    g.effect('happy', x + 0.5, y + 1.1, z + 0.5, 4);
    let villagers = 0, monsters = 0;
    const plan = this.villageAt(x, z, 16);
    if (plan) {
      for (const v of this.villagersOf(plan.id)) {
        if (Math.hypot(v.x - x, v.z - z) > 80) continue;
        v.alarm = 1200;
        villagers++;
      }
    }
    for (const m of g.entities.mobsNear(x, y, z, 32)) {
      if (!m.alive || !m.spec.hostile) continue;
      m.glowTicks = 600;
      monsters++;
    }
    g.progress.add('bells_rung');
    if (villagers) pushChat(monsters ? `The bell rings out: everyone indoors! (${monsters} monster${monsters > 1 ? 's' : ''} nearby)` : 'The bell rings out: everyone indoors!');
    else if (monsters) pushChat(`The bell rings out: ${monsters} monster${monsters > 1 ? 's' : ''} nearby.`);
    return { villagers, monsters };
  }

  // ------------------------------------------------------------------ population
  onChunkLoaded(c: Chunk): void {
    this.scanChunk(c);
    const plan = this.game.world.generator.villages?.centredInChunk(c.cx, c.cz);
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
    const st = this.state(plan.id);
    st.populated = true;
    st.lastSeen = g.dayNight.time;
    st.food ??= 6;
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
    if (g.tickCount % 40 === 7) this.updateNearby();
    if (++this.birthTimer >= 600) { this.birthTimer = 0; this.maybeBirths(); }
  }

  /**
   * Villages near the player: catch up on time they spent unloaded, keep their
   * "last seen" time, and - for a Hostile standing - set the Sentinel on the player.
   */
  private updateNearby(): void {
    const g = this.game, p = g.player, now = g.dayNight.time;
    for (const st of this.states.values()) {
      if (!st.populated) continue;
      const plan = this.plan(st.id);
      if (!plan) continue;
      const near = Math.hypot(plan.x - p.x, plan.z - p.z) <= plan.radius + 64 && g.world.isLoaded(plan.x, plan.z);
      if (!near) continue;
      if (st.lastSeen !== undefined && now - st.lastSeen > 2400) {
        if (!this.areaLoaded(plan)) continue;      // wait until the whole village is here
        // (time can also jump while the player is here: sleeping through the night)
        const stayed = g.tickCount - (this.nearTick.get(st.id) ?? -1e9) < 200;
        this.catchUp(plan, now - st.lastSeen, stayed ? 'overnight' : 'away');
      }
      st.lastSeen = now;
      this.nearTick.set(st.id, g.tickCount);
      if ((st.rep ?? 0) <= -60 && !p.creative && !p.dead) {
        for (const e of g.entities.list) {
          if (e instanceof Sentinel && e.alive && e.villageId === st.id && e.distanceTo(p.x, p.y, p.z) < 20) e.angry = Math.max(e.angry, 200);
        }
      }
    }
  }

  private areaLoaded(plan: VillagePlan): boolean {
    const w = this.game.world;
    for (const b of plan.buildings) {
      if (b.bed && !w.isLoaded(b.bed.x, b.bed.z)) return false;
      if (b.kind === 'farm' && !w.isLoaded(b.x0, b.z0)) return false;
    }
    return true;
  }

  /** New villagers move into free beds; a village without a Sentinel gets a new one; standing drifts back. */
  private dawn(): void {
    const g = this.game, p = g.player;
    for (const st of this.states.values()) {
      // standing slowly returns towards neutral (grudges fade faster than goodwill)
      const r = st.rep ?? 0;
      if (r > 0) st.rep = Math.max(0, r - 2);
      else if (r < 0) st.rep = Math.min(0, r + 4);
      if (!st.populated) continue;
      const plan = this.plan(st.id);
      if (!plan || Math.hypot(plan.x - p.x, plan.z - p.z) > 128 || !g.world.isLoaded(plan.x, plan.z)) continue;
      const folk = this.villagersOf(plan.id);
      if (folk.length >= 2) this.newcomer(plan, folk);
      const hasSentinel = g.entities.list.some((e) => e instanceof Sentinel && e.alive && e.villageId === plan.id);
      if (!hasSentinel && folk.length >= 3) this.spawnSentinel(plan);
    }
  }

  /** One newcomer moves into a free bed. */
  private newcomer(plan: VillagePlan, folk: Villager[]): Villager | null {
    const g = this.game;
    const bed = this.freeBed(plan, folk);
    if (!bed) return null;
    const v = g.entities.spawnMob('villager', bed.sx + 0.5, bed.sy, bed.sz + 0.5, g) as Villager;
    v.villageId = plan.id;
    v.home = { x: bed.x, y: bed.y, z: bed.z, f: bed.f };
    return v;
  }

  /**
   * A bed nobody sleeps in: first the village's own houses, then any bed the
   * player has put inside (or just outside) the village.
   */
  freeBed(plan: VillagePlan, folk: Villager[]): { x: number; y: number; z: number; f: B.Facing; sx: number; sy: number; sz: number } | null {
    const g = this.game, w = g.world;
    const taken = (x: number, y: number, z: number) => folk.some((v) => v.home && v.home.x === x && v.home.y === y && v.home.z === z)
      || g.entities.list.some((e) => e instanceof Villager && e.alive && !e.removed && e.home && e.home.x === x && e.home.y === y && e.home.z === z);
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

  // ------------------------------------------------------------------ children (1.8)
  /** Every 30 seconds each village near the player may have a child (food, a free bed, two grown-ups). */
  private maybeBirths(): void {
    const g = this.game, p = g.player;
    const tod = g.dayNight.timeOfDay;
    if (tod >= 12000) return;   // children are born by day
    for (const st of this.states.values()) {
      if (!st.populated || (st.food ?? 0) < FOOD_PER_CHILD || this.raidActive(st.id)) continue;
      const plan = this.plan(st.id);
      if (!plan || Math.hypot(plan.x - p.x, plan.z - p.z) > plan.radius + 64 || !g.world.isLoaded(plan.x, plan.z)) continue;
      if (Math.random() < 0.35) this.birth(plan);
    }
  }

  /**
   * A child is born, if the village has the food, a free bed and two grown-ups.
   * (`quiet`: during catch-up - no message of its own, and the grown-ups may be asleep.)
   */
  birth(plan: VillagePlan, quiet = false): Villager | null {
    const g = this.game, p = g.player;
    const st = this.state(plan.id);
    if ((st.food ?? 0) < FOOD_PER_CHILD) return null;
    const folk = this.villagersOf(plan.id);
    const adults = folk.filter((v) => !v.isChild && (quiet || !v.sleeping));
    if (adults.length < 2) return null;
    const bed = this.freeBed(plan, folk);
    if (!bed) return null;
    // the two grown-ups closest together
    let pa = adults[0], pb = adults[1], bd = 1e9;
    for (let i = 0; i < adults.length; i++) for (let j = i + 1; j < adults.length; j++) {
      const d = adults[i].distanceTo(adults[j].x, adults[j].y, adults[j].z);
      if (d < bd) { bd = d; pa = adults[i]; pb = adults[j]; }
    }
    const near = bd < 12;
    const sx = near ? Math.floor((pa.x + pb.x) / 2) : bed.sx, sz = near ? Math.floor((pa.z + pb.z) / 2) : bed.sz;
    const spot = (near ? nearestStandable(g.world, sx, Math.floor(pa.y), sz, 2) : null) ?? { x: bed.sx, y: bed.sy, z: bed.sz };
    const child = g.entities.spawnMob('villager', spot.x + 0.5, spot.y, spot.z + 0.5, g) as Villager;
    child.villageId = plan.id;
    child.home = { x: bed.x, y: bed.y, z: bed.z, f: bed.f };
    child.makeChild(CHILD_TICKS);
    st.food = (st.food ?? 0) - FOOD_PER_CHILD;
    st.born = (st.born ?? 0) + 1;
    for (const v of [pa, pb, child]) g.effect('heart', v.x, v.y + v.height + 0.3, v.z, 5);
    if (!quiet && Math.hypot(plan.x - p.x, plan.z - p.z) <= plan.radius + 32) {
      pushChat(`A child was born in ${this.name(plan.id)}: ${child.name}.`);
      g.progress.grant('born');
    }
    return child;
  }

  // ------------------------------------------------------------------ catching up (1.8)
  /**
   * The village was unloaded for `elapsed` ticks: work out what would have happened
   * meanwhile - crops growing and the farmers harvesting them, restocking, newcomers
   * at each dawn, children growing up and being born - and apply it in one go.
   */
  catchUp(plan: VillagePlan, elapsed: number, why: 'away' | 'overnight' = 'away'): { harvested: number; grown: number; restocked: number; newcomers: number; born: number; grewUp: number } {
    const g = this.game, w = g.world, p = g.player;
    const st = this.state(plan.id);
    const out = { harvested: 0, grown: 0, restocked: 0, newcomers: 0, born: 0, grewUp: 0 };
    if (elapsed <= 0) return out;
    const folk = this.villagersOf(plan.id);
    const farmers = folk.some((v) => v.job === 'farmer' && !v.isChild);
    // crops: random ticks reach each cell 3/4096 times a tick; a moist field grows on half of them
    const rate = (3 / 4096) * elapsed;
    for (const b of plan.buildings) {
      if (b.kind !== 'farm') continue;
      for (let lz = 1; lz < b.d - 1; lz++) for (let lx = 1; lx < b.w - 1; lx++) {
        const [x, z] = toWorld(b, lx, lz);
        const y = b.y + 1;
        if (!w.isLoaded(x, z)) continue;
        const id = w.getBlock(x, y, z), below = w.getBlock(x, y - 1, z);
        if (!B.IS_FARMLAND(below)) continue;
        let stages = B.cropStages(id);
        let s = B.CROP_STAGE[id];
        if (!stages) {
          if (id !== B.AIR || !farmers) continue;
          stages = b.crop === 'carrots' ? B.CARROTS : B.WHEAT;   // the farmer sows the empty cell
          s = 0;
        }
        const last = stages.length - 1;
        const grow = poisson(rate * (below === B.FARMLAND_MOIST ? 0.5 : 0.25));
        let total = s + grow;
        if (farmers && total >= last) {
          // ripe crops are harvested and replanted, again and again
          const cycles = Math.floor(total / last);
          out.harvested += cycles;
          total -= cycles * last;
        }
        const next = stages[Math.min(last, total)];
        if (next !== id) { w.setBlock(x, y, z, next, 'growth'); out.grown++; }
      }
    }
    st.food = Math.min(FOOD_MAX, (st.food ?? 0) + out.harvested);
    // restocking and growing up
    for (const v of folk) {
      if (elapsed >= 6000 && v.trades.some((t) => t.uses > 0)) { v.restock(); out.restocked++; }
      if (v.isChild) {
        v.childAge = Math.max(1, v.childAge - elapsed);
        if (v.childAge <= 1) { v.growUp(g); out.grewUp++; }
      }
    }
    // each dawn that went by: a newcomer and perhaps a child
    const t0 = g.dayNight.time - elapsed;
    const dawns = Math.max(0, Math.floor((g.dayNight.time - 1000) / 24000) - Math.floor((t0 - 1000) / 24000));
    for (let d = 0; d < Math.min(dawns, 3); d++) {
      const now = this.villagersOf(plan.id);
      if (now.length >= 2 && this.newcomer(plan, now)) out.newcomers++;
      if ((st.food ?? 0) >= FOOD_PER_CHILD && this.birth(plan, true)) out.born++;
    }
    const parts: string[] = [];
    if (out.harvested) parts.push(`${out.harvested} crop${out.harvested > 1 ? 's' : ''} harvested`);
    if (out.born) parts.push(out.born > 1 ? `${out.born} children born` : 'a child born');
    if (out.grewUp) parts.push(out.grewUp > 1 ? `${out.grewUp} children grew up` : 'a child grew up');
    if (out.newcomers) parts.push(out.newcomers > 1 ? `${out.newcomers} newcomers moved in` : 'a newcomer moved in');
    if (parts.length && Math.hypot(plan.x - p.x, plan.z - p.z) <= plan.radius + 64) {
      pushChat(why === 'overnight' ? `Overnight in ${this.name(plan.id)}: ${parts.join(', ')}.` : `While you were away from ${this.name(plan.id)}: ${parts.join(', ')}.`);
    }
    return out;
  }

  // ------------------------------------------------------------------ maps (1.8)
  /**
   * Somewhere for a map to lead: the nearest dungeon, ruin or other village from a
   * point, skipping places already on maps from this village. Searches the world
   * generator directly (the places need not be loaded or even visited).
   */
  findMapTarget(kind: MapTarget['kind'], fromX: number, fromZ: number, villageId: string | null): MapTarget | null {
    const gen = this.game.world.surface;
    if (!gen || !gen.structures) return null;
    const skip = new Set(villageId ? this.state(villageId).mapped ?? [] : []);
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    let best: MapTarget | null = null, bd = 1e9;
    const consider = (t: MapTarget) => {
      if (skip.has(key(t.x, t.y, t.z))) return;
      const d = Math.hypot(t.x - fromX, t.z - fromZ);
      if (d < 24 || d >= bd) return;
      bd = d; best = t;
    };
    if (kind === 'village') {
      const vp = gen.villages;
      if (!vp) return null;
      const rx = Math.floor(fromX / VILLAGE_REGION), rz = Math.floor(fromZ / VILLAGE_REGION);
      for (let r = 0; r <= 4 && !best; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const pl = vp.planForRegion(rx + dx, rz + dz);
          if (pl && pl.id !== villageId) consider({ kind, x: pl.x, y: pl.y + 1, z: pl.z, name: this.name(pl.id) });
        }
      }
      return best;
    }
    if (kind === 'dungeon' && gen.version < 5) return null;
    const ccx = Math.floor(fromX / 16), ccz = Math.floor(fromZ / 16);
    const maxR = kind === 'dungeon' ? 14 : 24;
    let foundAt = -1;
    for (let r = 1; r <= maxR; r++) {
      if (foundAt >= 0 && r > foundAt + 1) break;   // one more ring after the first find, for the nearest
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = ccx + dx, cz = ccz + dz;
        if (kind === 'dungeon') {
          if (!dungeonCandidate(this.game.world.seed, cx, cz)) continue;
          for (const s of gen.generateChunk(cx, cz).spawners) consider({ kind, x: s.x, y: s.y, z: s.z });
        } else {
          if (!gen.ruinCandidate(cx, cz)) continue;
          for (const c of gen.generateChunk(cx, cz).containers) if (c.loot === 'ruin') consider({ kind, x: c.x, y: c.y, z: c.z });
        }
      }
      if (best && foundAt < 0) foundAt = r;
    }
    return best;
  }

  /** Remembers that a village's Mapmaker has drawn a map to this place (the next map leads elsewhere). */
  markMapped(villageId: string | null, t: MapTarget): void {
    if (!villageId) return;
    const st = this.state(villageId);
    st.mapped = [...(st.mapped ?? []), `${t.x},${t.y},${t.z}`].slice(-32);
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
    const st = this.state(id);
    st.lastRaidDay = g.dayNight.day;
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
    g.progress.grant('hero');
    g.progress.add('raids_won');
    // grateful villagers: a gift of amber and bread, and a big rise in standing
    const amber = 3 + r.waves + Math.floor(Math.random() * 3);
    g.entities.spawnItem({ id: 'amber', count: amber }, p.x, p.y + 1.5, p.z);
    g.entities.spawnItem({ id: 'bread', count: 3 }, p.x, p.y + 1.5, p.z);
    for (const v of this.villagersOf(r.plan.id)) g.effect('happy', v.x, v.y + 2, v.z, 6);
    const id = r.plan.id;
    this.endRaid(`Victory! ${this.name(id)} is safe, and its villagers will not forget it.`, true);
    this.addRep(id, 40);
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

/** A Poisson-distributed count with mean `lambda` (normal approximation for large means). */
function poisson(lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss()));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
