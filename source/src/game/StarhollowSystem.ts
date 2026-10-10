import type { Game } from './Game';
import * as B from '../world/BlockRegistry';
import { UNLOADED } from '../world/World';
import { ROOST, PYLONS, bellPos, ISLAND_TOP } from '../world/Starhollow';
import { Hollowdrake, DRAKE_HEALTH } from '../entities/Hollowdrake';
import { Drifter } from '../entities/Drifter';
import { Mob } from '../entities/Mob';
import { pushChat, ui } from '../ui/uiStore';
import { makeStack } from '../inventory/ItemStack';
import { OVERWORLD } from '../world/dims';

/** What a world remembers about its Starhollow (kept in the world record). */
export interface StarState {
  /** Where the player stepped into a Stargate on the surface (the way back comes out there). */
  from?: { x: number; z: number };
  /** Is the Hollowdrake about (alive) or beaten (dead: its exit gate is lit on the Roost)? */
  dragon: 'alive' | 'dead';
  /** Its health when the player last left (it doesn't heal while you are away). */
  health: number;
  /** Has the End screen been shown in this world? (It shows once; later trips just go home.) */
  seenEnd?: boolean;
  /** How many times it has been beaten. */
  wins?: number;
}

export const defaultStarState = (): StarState => ({ dragon: 'alive', health: DRAKE_HEALTH });

/**
 * Below this height in the Starhollow the stars catch you and carry you home. (The
 * world has a floor at 0 you could otherwise land on; the lowest island undersides
 * are above 20, so nobody standing on land is ever this low.)
 */
export const VOID_Y = 12;

/**
 * THE STARHOLLOW'S RULES (2.2)
 * ---------------------------
 * Runs while the player is in the Starhollow: keeps the Hollowdrake in the sky
 * (spawned from the saved state, its health saved back), counts the Storm Bells
 * still ringing (they shield it), rings a bell when the player uses one, shows
 * the boss bar, celebrates the victory (Star Scales on the Roost, experience, the
 * exit gate), brings the Hollowdrake back when a Star Lens is used on that gate,
 * lets Drifters drift in, and catches a player who falls into the void.
 */
export class StarhollowSystem {
  drake: Hollowdrake | null = null;
  /** Storm Bells still ringing (-1 = not counted yet). */
  bellsLeft = -1;
  private shieldHint = 0;
  private caught = false;

  constructor(private game: Game) {}

  get state(): StarState {
    const r = this.game.record;
    if (!r.star) r.star = defaultStarState();
    return r.star;
  }

  tick(): void {
    const g = this.game, p = g.player;
    // ---- falling into the void: the stars catch you
    if (this.caught) {
      // held still among the stars while the world below is made ready
      p.vx = p.vy = p.vz = 0; p.fallDistance = 0; p.flying = true;
      return;
    }
    if (p.y < VOID_Y && !p.dead) {
      this.caught = true;
      p.vx = p.vy = p.vz = 0; p.fallDistance = 0; p.flying = true;
      g.catchFromVoid();
      return;
    }
    if (g.tickCount % 20 === 0) this.countBells();
    // ---- the Hollowdrake
    const st = this.state;
    if (this.drake && (this.drake.removed || !this.drake.alive) && this.drake.dyingTicks === 0) this.drake = null;
    if (st.dragon === 'alive' && !this.drake && g.world.isLoaded(ROOST.x, ROOST.z) && g.world.getBlock(ROOST.x, ROOST.y - 1, ROOST.z) !== UNLOADED) {
      const d = g.entities.spawnMob('hollowdrake', ROOST.x + 30, ROOST.y + 22, ROOST.z, g) as Hollowdrake;
      d.health = Math.max(1, Math.min(DRAKE_HEALTH, st.health || DRAKE_HEALTH));
      this.drake = d;
    }
    const d = this.drake;
    if (d) {
      d.shielded = this.bellsLeft !== 0;
      if (g.tickCount % 20 === 0 && d.dyingTicks === 0) st.health = d.health;
    }
    if (this.shieldHint > 0) this.shieldHint--;
    // ---- Drifters drift in among the islands
    if (g.rules.doMobSpawning && g.tickCount % 20 === 7 && Math.random() < 0.15) this.spawnDrifter();
    // ---- the boss bar
    if (g.tickCount % 5 === 0) {
      const show = !!d && d.dyingTicks === 0 && Math.hypot(p.x - ROOST.x, p.z - ROOST.z) < 220;
      const boss = show ? { name: 'Hollowdrake', hp: d!.health / DRAKE_HEALTH, shield: d!.shielded, bells: Math.max(0, this.bellsLeft) } : null;
      const cur = ui.get().boss;
      if (JSON.stringify(cur) !== JSON.stringify(boss)) ui.set({ boss });
    }
  }

  /** Counts the Storm Bells still ringing (a pylon whose chunk isn't loaded keeps its last count). */
  countBells(): void {
    const w = this.game.world;
    let left = 0, known = 0;
    for (let i = 0; i < PYLONS.length; i++) {
      const b = bellPos(i);
      const id = w.getBlock(b.x, b.y, b.z);
      if (id === UNLOADED) continue;
      known++;
      if (id === B.STORM_BELL) left++;
    }
    if (known === PYLONS.length) this.bellsLeft = left;
    else if (this.bellsLeft < 0) this.bellsLeft = 4;
  }

  /** The player used a Storm Bell: it rings out one last time and falls silent. */
  ringBell(x: number, y: number, z: number): void {
    const g = this.game, w = g.world;
    if (w.getBlock(x, y, z) !== B.STORM_BELL) return;
    w.setBlock(x, y, z, B.STORM_BELL_RUNG, 'player');
    g.sound('storm_bell', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    g.effect('star', x + 0.5, y + 0.8, z + 0.5, 20);
    for (let k = 1; k < 18; k++) g.effect('star', x + 0.5, y + 1 + k * 1.5, z + 0.5, 2);
    this.countBells();
    const left = this.bellsLeft;
    if (left > 0) pushChat(`A Storm Bell falls silent. ${left} still ${left === 1 ? 'rings' : 'ring'}.`);
    else {
      pushChat("The last Storm Bell falls silent: the Hollowdrake's shield is gone!");
      g.sound('drake_shield', ROOST.x, ROOST.y + 10, ROOST.z, 1, 0.6);
      g.progress.grant('storm_bells');
    }
  }

  /** A blow bounced off the shield: say why, now and then. */
  shieldHit(): void {
    if (this.shieldHint > 0) return;
    this.shieldHint = 400;
    const left = Math.max(1, this.bellsLeft);
    pushChat(`The Storm Bells shield the Hollowdrake. Climb the pylons and ring ${left === 4 ? 'all four' : `the last ${left}`}!`);
  }

  /** The Hollowdrake has faded into starlight. */
  victory(): void {
    const g = this.game, st = this.state;
    st.dragon = 'dead';
    st.health = 0;
    st.wins = (st.wins ?? 0) + 1;
    this.drake = null;
    ui.set({ boss: null });
    const top = ROOST.y + 1;
    for (let i = 0; i < 8; i++) g.entities.spawnItem(makeStack('star_scale'), ROOST.x + 0.5 + (Math.random() - 0.5) * 3, top + 0.5, ROOST.z + 0.5 + (Math.random() - 0.5) * 3);
    g.spawnXp(250, ROOST.x + 0.5, top + 0.5, ROOST.z + 0.5);
    g.world.setBlock(ROOST.x, ROOST.y, ROOST.z, B.STARGATE, 'system');
    g.effect('star', ROOST.x + 0.5, top, ROOST.z + 0.5, 40);
    g.sound('drake_victory', ROOST.x + 0.5, top, ROOST.z + 0.5, 1, 1);
    g.progress.grant('hollowdrake');
    g.progress.add('drakes_beaten');
    pushChat('The Hollowdrake fades into starlight, and the stars shine brighter.');
    pushChat('Star Scales lie on the Roost, and a Stargate there leads home.');
  }

  /** A Star Lens used on the Roost's gate after a victory calls the Hollowdrake back (the bells ring again). */
  summon(): boolean {
    const g = this.game, st = this.state, w = g.world;
    if (st.dragon !== 'dead') return false;
    if (w.getBlock(ROOST.x, ROOST.y, ROOST.z) !== B.STARGATE) return false;
    w.setBlock(ROOST.x, ROOST.y, ROOST.z, B.ROOST, 'system');
    for (let i = 0; i < PYLONS.length; i++) { const b = bellPos(i); w.setBlock(b.x, b.y, b.z, B.STORM_BELL, 'system'); }
    st.dragon = 'alive';
    st.health = DRAKE_HEALTH;
    this.bellsLeft = 4;
    g.sound('drake_roar', ROOST.x, ROOST.y + 10, ROOST.z, 1, 0.8);
    g.effect('star', ROOST.x + 0.5, ROOST.y + 1, ROOST.z + 0.5, 30);
    pushChat('The Star Lens flares: the four Storm Bells ring again, and the Hollowdrake rises!');
    return true;
  }

  /** A Drifter now and then, 20-48 blocks away in the open air around the player's height. */
  private spawnDrifter(): void {
    const g = this.game, p = g.player, w = g.world;
    let n = 0;
    for (const e of g.entities.list) if (e instanceof Drifter && Math.hypot(e.x - p.x, e.z - p.z) < 96) n++;
    if (n >= 5) return;
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 28;
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = Math.max(30, Math.min(100, p.y + (Math.random() - 0.3) * 16));
    if (!w.isLoaded(Math.floor(x), Math.floor(z))) return;
    for (let dy = -1; dy <= 2; dy++) if (w.getBlock(Math.floor(x), Math.floor(y) + dy, Math.floor(z)) !== B.AIR) return;
    g.entities.spawnMob('drifter', x, y, z, g);
  }

  /** Is a creature one of the Starhollow's own? */
  static isStarCreature(m: Mob): boolean {
    return m instanceof Hollowdrake || m instanceof Drifter;
  }

  /** Where Star Scales and the like land (for tests): the top of the Roost. */
  static roostTop(): { x: number; y: number; z: number } {
    return { x: ROOST.x + 0.5, y: ISLAND_TOP + 2, z: ROOST.z + 0.5 };
  }
}

export { OVERWORLD };
