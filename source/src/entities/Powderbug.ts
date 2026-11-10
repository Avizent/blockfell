import { Mob } from './Mob';
import type { EntityHost } from './Entity';

/**
 * POWDERBUG (2.9)
 * ---------------
 * A round, many-legged beetle with a smouldering fuse on its back. It hunts the player in the
 * dark; when it gets close it stops, hisses, swells and pops. The blast hurts creatures and the
 * player, but only breaks soft natural blocks (dirt, grass, sand, gravel, snow): never houses,
 * planks, stone, doors or chests. Hit it hard enough before the fuse runs out and it simply
 * dies; run away and it gives up. ORIGINAL design.
 */
export const POWDERBUG_FUSE = 30;
export const POWDERBUG_RADIUS = 3;

export class Powderbug extends Mob {
  fuse = 0;

  constructor(host?: EntityHost) {
    super('powderbug', host);
  }

  tick(host: EntityHost): void {
    const p = host.player;
    if (this.fuse > 0) {
      if (!this.tickCommon(host)) return;
      this.vx *= 0.5; this.vz *= 0.5;
      this.physics(host.world, 0.08, 0.98, 0.546);
      this.animateLimbs();
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > 6 || p.dead || p.creative) { this.fuse = 0; return; }   // the player got away: it fizzles out
      if (this.fuse % 5 === 0) host.effect('smoke', this.x, this.y + this.height + 0.3, this.z, 1);
      if (--this.fuse <= 0) this.explode(host);
      return;
    }
    this.attackCooldown = 5;   // (it never bites: it only pops)
    super.tick(host);
    if (!this.alive || this.deathTime > 0) return;
    if (this.chasing && !p.dead && !p.creative && Math.hypot(p.x - this.x, p.z - this.z) < 2.4 && Math.abs(p.y - this.y) < 2.2) {
      this.fuse = POWDERBUG_FUSE;
      host.sound('powder_hiss', this.x, this.y + 0.5, this.z, 0.8, 1);
    }
  }

  private explode(host: EntityHost): void {
    this.removed = true;
    host.powderBlast?.(this.x, this.y + 0.4, this.z, POWDERBUG_RADIUS, this);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const root = this.object.children[0];
    const s = this.fuse > 0 ? 1 + (1 - this.fuse / POWDERBUG_FUSE) * 0.55 : 1;
    root.scale.setScalar(s);
    if (this.hurtTime === 0) this.material.color.setScalar(this.fuse > 0 && ((this.fuse >> 2) & 1) ? 2.2 : 1);
  }
}
