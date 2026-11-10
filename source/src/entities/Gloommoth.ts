import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { IS_SOLID } from '../world/BlockRegistry';

/**
 * GLOOMMOTH (2.9)
 * ---------------
 * A night-flying moth with soft dark wings. It circles above the player, then swoops down for a
 * bite and climbs away again. It never walks: it flies, and it flutters off at sunrise.
 * It drops Gloomdust, which brews a Potion of Night Eyes. ORIGINAL design.
 */
export class Gloommoth extends Mob {
  private mode: 'circle' | 'dive' | 'retreat' = 'circle';
  private timer = 60 + Math.floor(Math.random() * 60);
  private angle = Math.random() * Math.PI * 2;
  private dayTicks = 0;
  private bite = 0;

  constructor(host?: EntityHost) {
    super('gloommoth', host);
    this.knockbackTaken = 0.6;
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    const p = host.player;
    if (host.isDay()) {
      this.dayTicks++;
      if (this.dayTicks > 160) { this.removed = true; host.effect('poof', this.x, this.y + 0.3, this.z, 6); return; }
    }
    if (this.bite > 0) this.bite--;
    const prey = !p.dead && !p.creative;
    let tx = this.x, ty = this.y, tz = this.z, sp = 0.07;
    if (!prey) {
      this.angle += 0.02; tx = this.x + Math.cos(this.angle) * 5; tz = this.z + Math.sin(this.angle) * 5; ty = this.y + 0.3; sp = 0.04;
    } else if (this.mode === 'circle') {
      this.angle += 0.045;
      tx = p.x + Math.cos(this.angle) * 6; tz = p.z + Math.sin(this.angle) * 6; ty = p.y + 5 + Math.sin(this.age * 0.05) * 1.5;
      if (--this.timer <= 0 && Math.hypot(p.x - this.x, p.z - this.z) < 16) { this.mode = 'dive'; this.timer = 50; host.sound('gloommoth', this.x, this.y, this.z, 0.6, 1.3); }
      else if (this.timer < -400) this.timer = 40;
    } else if (this.mode === 'dive') {
      tx = p.x; ty = p.y + 0.9; tz = p.z; sp = 0.15;
      const d = Math.hypot(p.x - this.x, p.y + 0.9 - this.y, p.z - this.z);
      if (d < 1.4 && this.bite <= 0) {
        const base = this.spec.attack ?? 3;
        const dmg = host.difficulty === 'easy' ? Math.max(1, base / 2 + 0.5) : host.difficulty === 'hard' ? base * 1.5 : base;
        host.damagePlayer(dmg, { x: this.x, y: this.y, z: this.z, kind: 'mob', mob: this });
        this.bite = 30; this.attackAnim = 8;
        this.mode = 'retreat'; this.timer = 40;
      } else if (--this.timer <= 0) { this.mode = 'retreat'; this.timer = 40; }
    } else {
      tx = this.x + Math.cos(this.angle) * 4; tz = this.z + Math.sin(this.angle) * 4; ty = p.y + 7; sp = 0.1;
      if (--this.timer <= 0) { this.mode = 'circle'; this.timer = 70 + Math.floor(Math.random() * 90); }
    }
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
    this.vx += ((dx / d) * sp - this.vx) * 0.12;
    this.vz += ((dz / d) * sp - this.vz) * 0.12;
    this.vy += ((dy / d) * sp - this.vy) * 0.12;
    // don't blunder into rock: lift over whatever is ahead
    const ax = Math.floor(this.x + this.vx * 6), az = Math.floor(this.z + this.vz * 6);
    if (host.world.isLoaded(ax, az) && IS_SOLID[host.world.getBlock(ax, Math.floor(this.y + 0.3), az)]) this.vy += 0.05;
    if (Math.abs(dx) > 0.2 || Math.abs(dz) > 0.2) this.turnTowards(Math.atan2(-dx, -dz), 0.15);
    this.physics(host.world, 0, 1, 1, 1);
    this.animateLimbs();
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const wl = this.parts.get('wingL'), wr = this.parts.get('wingR');
    const f = Math.sin((this.age + alpha) * 0.9) * 0.6;
    if (wl) wl.rotation.z = f;
    if (wr) wr.rotation.z = -f;
  }
}
