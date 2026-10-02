import { Mob, wrapAngle } from './Mob';
import type { EntityHost } from './Entity';
import { villagerModel } from './mobModels';
import * as B from '../world/BlockRegistry';
import type { Facing, Profession } from '../world/BlockRegistry';
import { findPath, nearestStandable, canStand, Step } from './Pathfinder';
import { Trade, tradesFor, levelForXp, PROFESSION_NAMES, LEVEL_NAMES } from './Trades';
import { mulberry32 } from '../core/rng';
import { toWorld } from '../world/Villages';
import { villagerName } from './villageNames';

type Mode = 'idle' | 'wander' | 'work' | 'working' | 'harvest' | 'home' | 'flee' | 'gather' | 'gathered' | 'play' | 'avoid' | 'shelter';

/** How long a villager child takes to grow up: 20 minutes (one in-game day). */
export const CHILD_TICKS = 24000;
/** Midday, when the village gathers round its bell (or its well). */
const GATHER_FROM = 5600, GATHER_TO = 7200;
export interface Spot { x: number; y: number; z: number }

/**
 * VILLAGER
 * --------
 * Daily routine: by day villagers wander the village paths, spend time at their
 * workstation (where they restock their trades) and farmers tend the fields;
 * towards sunset they walk home, open and close their front door, and sleep in
 * their bed until morning. Hostile creatures or a raid send them running home.
 * Movement uses A* paths over the voxel grid (see Pathfinder).
 *
 * 1.8: every villager has a name (from its seed); at midday they gather round the
 * village bell or well; they go indoors when it rains or the bell rings and shut
 * their doors at night; they wave at a player they like and keep away from one
 * they distrust. Children (born when the village has food and a free bed) play,
 * run home when frightened and grow up after a day.
 */
export class Villager extends Mob {
  job: Profession | null = null;
  level = 1;
  tradeXp = 0;
  trades: Trade[] = [];
  seed = (Math.random() * 0x7fffffff) | 0;
  home: (Spot & { f: Facing }) | null = null;
  work: Spot | null = null;
  villageId: string | null = null;
  sleeping = false;
  /** The player has this villager's trade screen open. */
  tradingWith = false;
  private mode: Mode = 'idle';
  private modeTimer = 20;
  private path: Step[] | null = null;
  private pathIdx = 0;
  private goal: Step | null = null;
  private repaths = 0;
  private stuck = 0;
  private lastGoalDist = 1e9;
  private doors: { x: number; y: number; z: number; t: number }[] = [];
  private fear = 0;
  private scanTimer = Math.floor(Math.random() * 100);
  private lastRestock = -1e9;
  private harvestCell: Step | null = null;
  /** 1.8: ticks left as a child (0 = grown up). */
  childAge = 0;
  /** 1.8: ticks left hiding indoors after the village bell rang. */
  alarm = 0;
  private greetCooldown = 200 + Math.floor(Math.random() * 400);
  private waveAnim = 0;
  private doorCheck = 0;

  constructor(host?: EntityHost, job: Profession | null = null) {
    super('villager', host, villagerModel(job ?? 'none'));
    this.persistent = true;
    if (job) this.setJob(job);
  }

  get label(): string {
    return this.job ? this.job[0].toUpperCase() + this.job.slice(1) : 'Villager';
  }

  /** 1.8: the villager's own name ("Brannoc"), the same every time (from its seed). */
  get name(): string {
    return villagerName(this.seed);
  }

  /** "Brannoc the Smith", "Tamsin" (no job), "little Tamsin" (a child). */
  get fullName(): string {
    if (this.isChild) return `little ${this.name}`;
    return this.job ? `${this.name} the ${PROFESSION_NAMES[this.job]}` : this.name;
  }

  /** "Journeyman Smith", "No job yet", "Child (grows up in 12 min)". */
  get title(): string {
    if (this.isChild) return `Child (grows up in ${Math.max(1, Math.ceil(this.childAge / 1200))} min)`;
    return this.job ? `${LEVEL_NAMES[this.level - 1]} ${PROFESSION_NAMES[this.job]}` : 'No job yet';
  }

  get isChild(): boolean {
    return this.childAge > 0;
  }

  /** What the villager is doing, for the info card. */
  get activity(): string {
    if (this.sleeping) return 'Asleep';
    if (this.tradingWith) return 'Trading with you';
    if (this.alarm > 0) return 'Hiding indoors (the bell rang)';
    switch (this.mode) {
      case 'working': return 'Working';
      case 'work': return 'Off to work';
      case 'harvest': return 'Tending the fields';
      case 'home': return this.homeReason;
      case 'flee': return 'Running for safety';
      case 'avoid': return 'Keeping away from you';
      case 'gather': case 'gathered': return 'Meeting the neighbours';
      case 'play': return 'Playing';
      case 'shelter': return 'Sheltering from the rain';
      case 'wander': return this.isChild ? 'Running about' : 'Strolling';
      default: return 'Resting';
    }
  }
  private homeReason = 'Going home';

  /** 1.8: a newborn (smaller, no job, grows up after `ticks`). */
  makeChild(ticks: number): void {
    if (this.job) this.setJob(null);
    this.childAge = Math.max(1, ticks);
    this.width = 0.4;
    this.height = 1.0;
  }

  /** The child is grown: full size, and free to take a job at the next free workstation. */
  growUp(host: EntityHost): void {
    this.childAge = 0;
    this.width = this.spec.width;
    this.height = this.spec.height;
    this.scanTimer = 190;
    host.effect('happy', this.x, this.y + 2.1, this.z, 8);
    host.villagerGrewUp?.(this);
  }

  setJob(job: Profession | null): void {
    this.job = job;
    this.level = 1;
    this.tradeXp = 0;
    this.trades = job ? tradesFor(job, 1, mulberry32(this.seed)) : [];
    this.setModel(villagerModel(job ?? 'none'));
  }

  /** Adds trading experience; returns true on a level up (new offers unlocked). */
  gainXp(n: number): boolean {
    this.tradeXp += n;
    const l = levelForXp(this.tradeXp);
    if (l > this.level && this.job) {
      for (let k = this.level + 1; k <= l; k++) this.trades.push(...tradesFor(this.job, k, mulberry32(this.seed + k * 7919)));
      this.level = l;
      return true;
    }
    return false;
  }

  restock(): void {
    for (const t of this.trades) t.uses = 0;
  }

  private lastAttacker: Mob | null = null;

  protected onHurt(host: EntityHost, byPlayer: boolean, attacker?: Mob): void {
    this.fear = 100;
    this.lastAttacker = attacker ?? null;
    if (this.sleeping) this.wakeUp(host);
    if (byPlayer) {
      host.alertSentinels(this.x, this.z);
      host.effect('angry', this.x, this.y + 2.1, this.z, 3);
      if (this.health > 0) host.folkHurt?.(this, this.villageId, false);
    }
  }

  protected die(host: EntityHost, byPlayer: boolean): void {
    super.die(host, byPlayer);
    if (byPlayer) host.folkHurt?.(this, this.villageId, true);
    host.villagerDied?.(this, byPlayer, this.lastAttacker);
  }

  // ------------------------------------------------------------------ helpers
  private cell(): Step {
    return { x: Math.floor(this.x), y: Math.floor(this.y + 0.01), z: Math.floor(this.z) };
  }

  private goTo(host: EntityHost, target: Step | null): boolean {
    this.path = null;
    this.goal = target;
    if (!target) return false;
    const c = this.cell();
    const path = findPath(host.world, c.x, c.y, c.z, target.x, target.y, target.z, { partial: true, maxNodes: 2000 });
    if (!path || !path.length) { this.path = null; return !!path; }
    this.path = path;
    this.pathIdx = 0;
    this.stuck = 0;
    this.lastGoalDist = 1e9;
    return true;
  }

  private bedside(host: EntityHost): Step | null {
    if (!this.home) return null;
    return nearestStandable(host.world, this.home.x, this.home.y, this.home.z, 1);
  }

  private bedIntact(host: EntityHost): boolean {
    const h = this.home;
    return !!h && B.getBlock(host.world.getBlock(h.x, h.y, h.z)).shape === 'bed';
  }

  private wakeUp(host: EntityHost): void {
    this.sleeping = false;
    const s = this.bedside(host);
    if (s) this.setPos(s.x + 0.5, s.y, s.z + 0.5);
    this.mode = 'idle';
    this.modeTimer = 20;
  }

  /** Opens a closed door in this cell (either half) and remembers to close it later. */
  private openDoorAt(host: EntityHost, x: number, y: number, z: number): void {
    for (const yy of [y, y + 1]) {
      const d = B.getBlock(host.world.getBlock(x, yy, z));
      if (d.shape === 'door') {
        const lowerY = d.half === 'lower' ? yy : yy - 1;
        if (!d.open) {
          host.toggleDoor(x, lowerY, z);
          this.doors.push({ x, y: lowerY, z, t: host.tickCount });
        }
        return;
      }
    }
  }

  private closeDoors(host: EntityHost): void {
    for (let i = this.doors.length - 1; i >= 0; i--) {
      const d = this.doors[i];
      if (host.tickCount - d.t < 20) continue;
      if (Math.hypot(this.x - (d.x + 0.5), this.z - (d.z + 0.5)) < 1.6 && host.tickCount - d.t < 200) continue;
      const def = B.getBlock(host.world.getBlock(d.x, d.y, d.z));
      if (def.shape === 'door' && def.open) host.toggleDoor(d.x, d.y, d.z);
      this.doors.splice(i, 1);
    }
  }

  private nearestHostile(host: EntityHost, r: number): Mob | null {
    let best: Mob | null = null, bd = r;
    for (const m of host.entities.mobsNear(this.x, this.y, this.z, r)) {
      if (!m.alive || !m.spec.hostile) continue;
      const d = this.distanceTo(m.x, m.y, m.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  private findFreeWorkstation(host: EntityHost): Spot | null {
    const cx = Math.floor(this.x), cy = Math.floor(this.y), cz = Math.floor(this.z);
    let best: Spot | null = null, bd = 1e9;
    for (let dy = -3; dy <= 4; dy++) for (let dz = -16; dz <= 16; dz++) for (let dx = -16; dx <= 16; dx++) {
      const id = host.world.getBlock(cx + dx, cy + dy, cz + dz);
      if (!B.professionOfBlock(id)) continue;
      const s = { x: cx + dx, y: cy + dy, z: cz + dz };
      if (host.isClaimed(s.x, s.y, s.z, this)) continue;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  private findFreeBed(host: EntityHost): (Spot & { f: Facing }) | null {
    const cx = Math.floor(this.x), cy = Math.floor(this.y), cz = Math.floor(this.z);
    let best: (Spot & { f: Facing }) | null = null, bd = 1e9;
    for (let dy = -3; dy <= 4; dy++) for (let dz = -20; dz <= 20; dz++) for (let dx = -20; dx <= 20; dx++) {
      const d = B.getBlock(host.world.getBlock(cx + dx, cy + dy, cz + dz));
      if (d.shape !== 'bed' || d.half !== 'foot' || !d.facing) continue;
      const s = { x: cx + dx, y: cy + dy, z: cz + dz, f: d.facing };
      if (host.isClaimed(s.x, s.y, s.z, this)) continue;
      const dd = dx * dx + dz * dz + dy * dy;
      if (dd < bd) { bd = dd; best = s; }
    }
    return best;
  }

  /** A mature crop (or an empty field cell) in this village's farms. */
  private findCropWork(host: EntityHost): Step | null {
    const plan = this.villageId ? host.villagePlan(this.villageId) : null;
    let best: Step | null = null, bd = 1e9;
    const consider = (x: number, y: number, z: number) => {
      const id = host.world.getBlock(x, y, z);
      const below = host.world.getBlock(x, y - 1, z);
      if (!B.IS_FARMLAND(below)) return;
      const ripe = B.CROP_STAGE[id] >= 0 && B.CROP_STAGE[id] === B.CROP_MAX[id];
      if (!ripe && id !== B.AIR) return;
      const d = (x - this.x) ** 2 + (z - this.z) ** 2 + (ripe ? 0 : 30);
      if (d < bd) { bd = d; best = { x, y, z }; }
    };
    if (plan) {
      for (const b of plan.buildings) {
        if (b.kind !== 'farm') continue;
        for (let lz = 1; lz < b.d - 1; lz++) for (let lx = 1; lx < b.w - 1; lx++) {
          const [x, z] = toWorld(b, lx, lz);
          consider(x, b.y + 1, z);
        }
      }
    } else {
      const c = this.cell();
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) for (let dy = -2; dy <= 2; dy++) consider(c.x + dx, c.y + dy, c.z + dz);
    }
    return best;
  }

  private wanderSpot(host: EntityHost): Step | null {
    const plan = this.villageId ? host.villagePlan(this.villageId) : null;
    if (plan && plan.paths.size && Math.random() < 0.8) {
      const keys = [...plan.paths.keys()];
      for (let i = 0; i < 6; i++) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        const [x, z] = k.split(',').map(Number);
        if (Math.hypot(x - this.x, z - this.z) > 26) continue;
        const y = plan.paths.get(k)! + 1;
        if (canStand(host.world, x, y, z)) return { x, y, z };
      }
    }
    const c = this.cell();
    for (let i = 0; i < 8; i++) {
      const x = c.x + Math.round((Math.random() - 0.5) * 16), z = c.z + Math.round((Math.random() - 0.5) * 16);
      const s = nearestStandable(host.world, x, c.y, z, 1);
      if (s) return s;
    }
    return null;
  }

  // ------------------------------------------------------------------ tick
  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    if (this.health < this.spec.health && host.tickCount % 200 === 0 && this.hurtTime === 0) this.health++;
    const tod = host.timeOfDay();
    const night = tod >= 12500 && tod < 23300;
    const evening = tod >= 11600 && tod < 23300;
    const raid = host.raidActive(this.villageId);
    if (this.childAge > 1) this.childAge--;
    else if (this.childAge === 1) this.growUp(host);
    if (this.alarm > 0) this.alarm--;
    if (this.greetCooldown > 0) this.greetCooldown--;
    if (this.waveAnim > 0) this.waveAnim--;
    const rep = host.villageStanding?.(this.villageId) ?? 0;
    const rainy = host.weatherRain() > 0.3;
    if (this.fear > 0) this.fear--;
    if (host.tickCount % 10 === (this.id % 10) && this.nearestHostile(host, 10)) this.fear = Math.max(this.fear, 60);
    this.closeDoors(host);

    // ---- asleep
    if (this.sleeping) {
      if (!night || !this.bedIntact(host) || this.fear > 0 || this.hurtTime > 0) this.wakeUp(host);
      else { this.vx = this.vy = this.vz = 0; this.limbAmount = 0; return; }
    }

    // ---- claim a job and a bed (villagers without them, every few seconds)
    if (++this.scanTimer >= 200) {
      this.scanTimer = 0;
      if (this.work && B.professionOfBlock(host.world.getBlock(this.work.x, this.work.y, this.work.z)) !== this.job) {
        // workstation gone: a villager who never traded goes back to being unemployed
        this.work = null;
        if (this.tradeXp === 0 && this.job) this.setJob(null);
      }
      if (!this.work && !this.isChild) {
        const w = this.findFreeWorkstation(host);
        if (w) {
          const prof = B.professionOfBlock(host.world.getBlock(w.x, w.y, w.z))!;
          if (!this.job) { this.setJob(prof); host.effect('happy', this.x, this.y + 2.1, this.z, 5); }
          if (this.job === prof) this.work = w;
        }
      }
      if (!this.home || !this.bedIntact(host)) {
        this.home = null;
        const b = this.findFreeBed(host);
        if (b) this.home = b;
      }
    }

    let forward = 0;
    let speedMul = 0.8;
    // ---- choose what to do
    if (this.tradingWith) {
      this.path = null;
      const dx = p.x - this.x, dz = p.z - this.z;
      this.turnTowards(Math.atan2(-dx, -dz), 0.3);
      this.headYaw = 0;
      this.headPitch = -Math.atan2(p.eyeY - (this.y + 1.6), Math.hypot(dx, dz)) * 0.8;
    } else {
      // keep away from a player the village distrusts
      const pd = this.distanceTo(p.x, p.y, p.z);
      if (rep <= -25 && pd < 6 && !p.creative && !p.dead && this.mode !== 'avoid' && this.fear === 0 && !this.sleeping) {
        const dx = this.x - p.x, dz = this.z - p.z, l = Math.hypot(dx, dz) || 1;
        this.mode = 'avoid';
        this.goTo(host, nearestStandable(host.world, Math.floor(this.x + (dx / l) * 8), Math.floor(this.y), Math.floor(this.z + (dz / l) * 8), 2));
        this.modeTimer = 60;
      }
      // rain sends everyone indoors (or under any roof nearby); so does the bell
      const wet = rainy && !evening && host.rainingOn(this.x, this.y + this.height + 0.2, this.z);
      const wantHome = evening || raid || this.fear > 0 || this.alarm > 0 || (rainy && !!this.home);
      this.homeReason = this.alarm > 0 ? 'Hurrying indoors (the bell rang)' : raid || this.fear > 0 ? 'Running home' : rainy && !evening ? 'Sheltering from the rain' : 'Going home';
      if (this.mode === 'avoid') {
        if (!this.path || --this.modeTimer <= 0) { this.mode = 'idle'; this.modeTimer = 20; }
        speedMul = 1.2;
      } else if (wet && !this.home && this.mode !== 'shelter') {
        const s = this.shelterSpot(host);
        if (s) { this.mode = 'shelter'; this.goTo(host, s); }
      } else if (this.mode === 'shelter' && !rainy) {
        this.mode = 'idle'; this.modeTimer = 20;
      } else if (wantHome) {
        if (this.home && this.mode !== 'home') {
          this.mode = 'home';
          this.goTo(host, this.bedside(host));
        } else if (!this.home && this.fear > 0 && this.mode !== 'flee') {
          const h = this.nearestHostile(host, 12);
          if (h) {
            const dx = this.x - h.x, dz = this.z - h.z, l = Math.hypot(dx, dz) || 1;
            this.mode = 'flee';
            this.goTo(host, nearestStandable(host.world, Math.floor(this.x + (dx / l) * 10), Math.floor(this.y), Math.floor(this.z + (dz / l) * 10), 2));
            this.modeTimer = 60;
          }
        }
        if (this.mode === 'home' && !this.path) {
          // at the bedside: sleep once night falls
          const s = this.bedside(host);
          const there = s && Math.hypot(s.x + 0.5 - this.x, s.z + 0.5 - this.z) < 1.2;
          if (there && night && --this.doorCheck <= 0) { this.doorCheck = 100; this.shutDoors(host); }
          if (there && night && this.bedIntact(host) && this.fear === 0 && !raid) {
            this.shutDoors(host);   // the last thing before bed
            this.doorCheck = 0;
            this.sleeping = true;
            this.vx = this.vy = this.vz = 0;
            return;
          }
          if (!there && --this.modeTimer <= 0) { this.modeTimer = 60; this.goTo(host, s); }
        }
        if (this.mode === 'flee' && (!this.path || --this.modeTimer <= 0)) this.mode = 'idle';
        speedMul = this.fear > 0 || raid || this.alarm > 0 ? 1.3 : 0.9;
      } else if (this.mode !== 'shelter') {
        if (this.mode === 'home' || this.mode === 'flee') { this.mode = 'idle'; this.modeTimer = 10 + Math.floor(Math.random() * 40); }
        if (!this.path && --this.modeTimer <= 0) this.pickActivity(host);
        if (this.mode === 'gather' && !this.path) { this.mode = 'gathered'; this.modeTimer = 120 + Math.floor(Math.random() * 160); }
        if (this.mode === 'gathered') {
          // chat with the neighbours: face the middle of the gathering, now and then a word
          const mp = host.meetingPoint?.(this.villageId);
          if (mp) this.turnTowards(Math.atan2(-(mp.x + 0.5 - this.x), -(mp.z + 0.5 - this.z)), 0.15);
          if (host.tickCount % 80 === this.id % 80 && Math.random() < 0.35) {
            host.sound('villager', this.x, this.y + 1.6, this.z, 0.35, this.isChild ? 1.5 : 0.9 + Math.random() * 0.3);
            if (Math.random() < 0.4) host.effect('happy', this.x, this.y + this.height + 0.2, this.z, 1);
          }
        }
        if (this.mode === 'play' || this.isChild) speedMul = 1.25;
        if (this.mode === 'working') {
          if (this.work) {
            const dx = this.work.x + 0.5 - this.x, dz = this.work.z + 0.5 - this.z;
            this.turnTowards(Math.atan2(-dx, -dz), 0.2);
            if (host.tickCount - this.lastRestock > 6000 && this.trades.some((t) => t.uses > 0)) {
              this.restock();
              this.lastRestock = host.tickCount;
              host.effect('happy', this.x, this.y + 2, this.z, 3);
            }
          }
        } else if (this.mode === 'work' && !this.path) {
          this.mode = 'working';
          this.modeTimer = 200 + Math.floor(Math.random() * 300);
        } else if (this.mode === 'harvest' && this.harvestCell) {
          const hc = this.harvestCell;
          if (Math.hypot(hc.x + 0.5 - this.x, hc.z + 0.5 - this.z) < 1.6 && Math.abs(hc.y - this.y) < 2) {
            this.tendCrop(host, hc);
            this.harvestCell = null;
            this.path = null;
            this.modeTimer = 10;
          } else if (!this.path) { this.harvestCell = null; this.modeTimer = 20; }
        }
      }
    }

    // ---- follow the path
    if (this.path) forward = this.followPath(host);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (forward !== 0) {
      const accel = (this.onGround ? this.spec.speed * 0.22 : this.spec.speed * 0.05) * speedMul * forward;
      this.vx += fx * accel;
      this.vz += fz * accel;
    }
    if (this.inWater) this.vy += 0.04;
    this.physics(host.world, 0.08, 0.98, 0.546);
    this.animateLimbs();

    // ---- look at a nearby player now and then (and wave, if the village likes them)
    if (!this.tradingWith && --this.lookTimer <= 0) {
      this.lookTimer = 40 + Math.floor(Math.random() * 60);
      const dp = this.distanceTo(p.x, p.y, p.z);
      const eyes = this.y + this.height * 0.82;
      if (dp < 7 && Math.random() < 0.7) {
        const want = Math.atan2(-(p.x - this.x), -(p.z - this.z)) - this.yaw;
        this.headYaw = Math.max(-1, Math.min(1, wrapAngle(want)));
        this.headPitch = -Math.atan2(p.eyeY - eyes, dp) * 0.6;
        if (rep >= 25 && dp < 5 && this.greetCooldown === 0 && !p.dead) {
          this.greet(host);
        } else if (Math.random() < 0.25) host.sound('villager', this.x, eyes, this.z, 0.5, this.isChild ? 1.5 : 0.9 + Math.random() * 0.3);
      } else { this.headYaw = (Math.random() - 0.5) * 1.2; this.headPitch = (Math.random() - 0.5) * 0.3; }
    }
  }

  /** A wave and a cheerful word for a player the village likes. */
  greet(host: EntityHost): void {
    this.greetCooldown = 1200;
    this.waveAnim = 30;
    host.effect('happy', this.x, this.y + this.height + 0.2, this.z, 3);
    host.sound('villager_yes', this.x, this.y + this.height * 0.82, this.z, 0.5, this.isChild ? 1.5 : 1.15);
  }

  /** The nearest spot within 8 blocks with a roof over it (for a villager without a home). */
  private shelterSpot(host: EntityHost): Step | null {
    const c = this.cell();
    let best: Step | null = null, bd = 1e9;
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const d = dx * dx + dz * dz;
      if (d >= bd) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const x = c.x + dx, y = c.y + dy, z = c.z + dz;
        if (!canStand(host.world, x, y, z) || host.rainingOn(x + 0.5, y + 2, z + 0.5)) continue;
        bd = d; best = { x, y, z };
        break;
      }
    }
    return best;
  }

  /** At night: shut any door left open near the villager's bed (unless someone is standing in it). */
  private shutDoors(host: EntityHost): void {
    const h = this.home;
    if (!h) return;
    const p = host.player;
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = h.x + dx, y = h.y + dy, z = h.z + dz;
      const d = B.getBlock(host.world.getBlock(x, y, z));
      if (d.shape !== 'door' || d.half !== 'lower' || !d.open) continue;
      if (Math.floor(p.x) === x && Math.floor(p.z) === z && Math.abs(Math.floor(p.y) - y) <= 1) continue;
      if (host.entities.mobsNear(x + 0.5, y, z + 0.5, 0.9).length) continue;
      host.toggleDoor(x, y, z);
    }
  }

  private pickActivity(host: EntityHost): void {
    const r = Math.random();
    const tod = host.timeOfDay();
    // midday: off to the meeting point (children half the time; they'd rather play)
    if (tod >= GATHER_FROM && tod < GATHER_TO && host.weatherRain() <= 0.3 && (!this.isChild || r < 0.5)) {
      const spot = this.meetingSpot(host);
      if (spot) { this.mode = 'gather'; this.goTo(host, spot); this.modeTimer = 200; return; }
    }
    if (this.isChild) {
      // children play: chase about near the well or the bell, or after another child
      this.mode = 'play';
      const other = host.entities.mobsNear(this.x, this.y, this.z, 16).find((m) => m !== this && m instanceof Villager && m.isChild && m.alive);
      const target = other && Math.random() < 0.5
        ? nearestStandable(host.world, Math.floor(other.x), Math.floor(other.y), Math.floor(other.z), 2)
        : this.meetingSpot(host, 7) ?? this.wanderSpot(host);
      this.goTo(host, target);
      this.modeTimer = 20 + Math.floor(Math.random() * 60);
      return;
    }
    if (this.job === 'farmer' && r < 0.4) {
      const c = this.findCropWork(host);
      if (c) { this.mode = 'harvest'; this.harvestCell = c; this.goTo(host, c); return; }
    }
    if (this.job && this.work && r < 0.7) {
      this.mode = 'work';
      this.goTo(host, nearestStandable(host.world, this.work.x, this.work.y, this.work.z, 1));
      return;
    }
    if (r < 0.88) {
      this.mode = 'wander';
      this.goTo(host, this.wanderSpot(host));
      this.modeTimer = 40 + Math.floor(Math.random() * 120);
      return;
    }
    this.mode = 'idle';
    this.modeTimer = 60 + Math.floor(Math.random() * 140);
  }

  /**
   * A free spot 2.5-`r` blocks from the village's meeting point (its bell or well), on the
   * ground round it: never above the bell, so nobody aims for the roof of the well the
   * bell hangs in.
   */
  private meetingSpot(host: EntityHost, r = 4): Step | null {
    const mp = host.meetingPoint?.(this.villageId);
    if (!mp) return null;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * (r - 2.5);
      const x = Math.floor(mp.x + 0.5 + Math.cos(a) * d), z = Math.floor(mp.z + 0.5 + Math.sin(a) * d);
      if (Math.hypot(x - mp.x, z - mp.z) < 2.5) continue;
      // in that column: the standable cell nearest the villager's own level, at or below the bell
      const own = Math.floor(this.y);
      let best: Step | null = null;
      for (let y = mp.y; y >= mp.y - 6; y--) {
        if (canStand(host.world, x, y, z) && (!best || Math.abs(y - own) < Math.abs(best.y - own))) best = { x, y, z };
      }
      if (best) return best;
    }
    return null;
  }

  /** Farmers harvest ripe crops and replant, or sow an empty field cell. */
  private tendCrop(host: EntityHost, c: Step): void {
    const id = host.world.getBlock(c.x, c.y, c.z);
    const stages = B.cropStages(id);
    if (stages && B.CROP_STAGE[id] === stages.length - 1) {
      host.world.setBlock(c.x, c.y, c.z, stages[0], 'growth');
      host.sound('break:grass', c.x + 0.5, c.y + 0.5, c.z + 0.5, 0.6, 1);
      host.addVillageFood?.(this.villageId, 1);   // the harvest goes into the village store
    } else if (id === B.AIR && B.IS_FARMLAND(host.world.getBlock(c.x, c.y - 1, c.z))) {
      host.world.setBlock(c.x, c.y, c.z, Math.random() < 0.6 ? B.WHEAT[0] : B.CARROTS[0], 'growth');
      host.sound('place:grass', c.x + 0.5, c.y + 0.5, c.z + 0.5, 0.5, 1);
    }
    this.attackAnim = 8;
  }

  /** Steers along the current path; returns the forward input. */
  private followPath(host: EntityHost): number {
    const path = this.path!;
    if (this.pathIdx >= path.length) { this.path = null; return 0; }
    const s = path[this.pathIdx];
    const dx = s.x + 0.5 - this.x, dz = s.z + 0.5 - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (this.pathIdx === path.length - 1 ? 0.3 : 0.45) && Math.abs(s.y - this.y) < 1.2) {
      this.pathIdx++;
      if (this.pathIdx >= path.length) { this.path = null; return 0; }
      return this.followPath(host);
    }
    this.openDoorAt(host, s.x, s.y, s.z);
    this.turnTowards(Math.atan2(-dx, -dz), 0.45);
    if (s.y > this.y + 0.5 && this.onGround && dist < 1.4 && this.collidedH) this.vy = 0.42;
    // progress check towards the goal
    const g = path[path.length - 1];
    const gd = Math.hypot(g.x + 0.5 - this.x, g.z + 0.5 - this.z) + Math.abs(g.y - this.y);
    if (gd < this.lastGoalDist - 0.05) { this.lastGoalDist = gd; this.stuck = 0; }
    else if (++this.stuck > 60) {
      if (++this.repaths > 3) { this.path = null; this.repaths = 0; return 0; }
      this.goTo(host, this.goal);
      return 0;
    }
    // slow down for sharp turns
    const turn = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw));
    return turn > 1.2 ? 0.3 : 1;
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const root = this.object.children[0];
    if (this.sleeping && this.home) {
      const [fx, fz] = B.FACING_VEC[this.home.f];
      root.rotation.order = 'YXZ';
      root.rotation.set(-Math.PI / 2, Math.atan2(-fx, -fz), 0);
      this.object.position.set(this.home.x + 0.5 - fx * 0.5, this.home.y + 0.69, this.home.z + 0.5 - fz * 0.5);
      const head = this.parts.get('head');
      if (head) { head.rotation.x = 0; head.rotation.y = 0; }
    } else if (root.rotation.order !== 'XYZ') {
      root.rotation.order = 'XYZ';
      root.rotation.x = 0;
    }
    // arms: a small tending/working motion, or a wave
    if (this.attackAnim > 0) {
      const a = this.parts.get('armR');
      if (a) a.rotation.x = -Math.sin((this.attackAnim / 8) * Math.PI) * 1.2;
    }
    if (this.waveAnim > 0) {
      const a = this.parts.get('armR');
      if (a) { a.rotation.x = -2.6; a.rotation.z = Math.sin((this.waveAnim + alpha) * 0.6) * 0.5; }
    } else {
      const a = this.parts.get('armR');
      if (a && a.rotation.z !== 0) a.rotation.z = 0;
    }
    // children: small, with big heads
    const s = this.isChild ? 0.55 : 1;
    if (root.scale.x !== s) root.scale.setScalar(s);
    const head = this.parts.get('head');
    if (head) head.scale.setScalar(this.isChild ? 1.35 : 1);
  }

  serialize(): Record<string, unknown> | null {
    const base = super.serialize();
    if (!base) return null;
    return {
      ...base, p: true,
      v: { job: this.job, level: this.level, xp: this.tradeXp, trades: this.trades, home: this.home, work: this.work, village: this.villageId, seed: this.seed, sleeping: this.sleeping, ...(this.childAge > 0 ? { child: this.childAge } : {}) },
    };
  }

  restore(v: Record<string, unknown>): void {
    const job = (v.job as Profession | null) ?? null;
    if (job !== this.job) this.setJob(job);
    this.level = (v.level as number) ?? 1;
    this.tradeXp = (v.xp as number) ?? 0;
    if (Array.isArray(v.trades)) this.trades = v.trades as Trade[];
    this.home = (v.home as Villager['home']) ?? null;
    this.work = (v.work as Spot | null) ?? null;
    this.villageId = (v.village as string | null) ?? null;
    if (typeof v.seed === 'number') this.seed = v.seed;
    this.sleeping = v.sleeping === true;
    if (typeof v.child === 'number' && v.child > 0) this.makeChild(v.child);
  }
}
