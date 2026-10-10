import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { IS_SOLID } from '../world/BlockRegistry';

/**
 * DRIFTER (2.2)
 * -------------
 * A gentle creature of the Starhollow: a glowing bell of starlight trailing soft
 * tendrils, drifting slowly between the islands. It never falls (it floats), keeps
 * clear of the ground and of solid rock, and flees when hurt. It drops Drift Silk,
 * which goes into Starwings.
 */
export class Drifter extends Mob {
  private bob = Math.random() * Math.PI * 2;
  private wanderTimer = 0;
  private tx = 0; private ty = 0; private tz = 0;

  constructor(host?: EntityHost) {
    super('drifter', host);
    this.knockbackTaken = 0.5;
  }

  private pickTarget(host: EntityHost): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      const y = Math.max(20, Math.min(110, this.y + (Math.random() - 0.5) * 8));
      if (!host.world.isLoaded(Math.floor(x), Math.floor(z))) continue;
      if (IS_SOLID[host.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))]) continue;
      this.tx = x; this.ty = y; this.tz = z;
      return;
    }
    this.tx = this.x; this.ty = this.y + 1; this.tz = this.z;
  }

  tick(host: EntityHost): void {
    if (!this.tickCommon(host)) return;
    this.bob += 0.06;
    if (this.panic > 0) this.panic--;
    if (--this.wanderTimer <= 0 || (this.panic > 0 && this.age % 15 === 0)) {
      this.wanderTimer = 80 + Math.floor(Math.random() * 120);
      this.pickTarget(host);
    }
    // keep a little above whatever is below
    const below = host.world.getBlock(Math.floor(this.x), Math.floor(this.y - 1.5), Math.floor(this.z));
    const lift = IS_SOLID[below] ? 0.01 : 0;
    const dx = this.tx - this.x, dy = this.ty - this.y, dz = this.tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
    const sp = (this.panic > 0 ? 0.09 : 0.035);
    this.vx += ((dx / d) * sp - this.vx) * 0.05;
    this.vz += ((dz / d) * sp - this.vz) * 0.05;
    this.vy += ((dy / d) * sp * 0.6 - this.vy) * 0.05 + Math.sin(this.bob) * 0.002 + lift;
    if (Math.abs(dx) > 0.2 || Math.abs(dz) > 0.2) this.turnTowards(Math.atan2(-dx, -dz), 0.05);
    this.physics(host.world, 0, 1, 1, 1);
    this.animateLimbs();
    if (this.age % 30 === 0) host.effect('star', this.x, this.y + 0.3, this.z, 1);
  }

  render(alpha: number, host: EntityHost): void {
    super.render(alpha, host);
    const t = this.age + alpha;
    const root = this.object.children[0];
    root.position.y = Math.sin(this.bob) * 0.12;
    for (let i = 0; i < 4; i++) {
      const o = this.parts.get(`tendril${i}`);
      if (o) { o.rotation.x = Math.sin(t * 0.08 + i) * 0.25; o.rotation.z = Math.cos(t * 0.07 + i * 1.3) * 0.25; }
    }
    const bell = this.parts.get('bell');
    if (bell) bell.scale.y = 1 + Math.sin(t * 0.1) * 0.06;
    // they glow softly in the dark
    const b = Math.max(0.85, host.brightnessAt(this.x, this.y + 0.5, this.z));
    if (this.hurtTime === 0) this.material.color.setScalar(b);
  }
}
