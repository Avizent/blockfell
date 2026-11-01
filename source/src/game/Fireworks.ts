import type { Particles } from '../render/Effects';

/** Colours a burst can be (0-1 rgb). ORIGINAL palette. */
const COLOURS: [number, number, number][] = [
  [1, 0.25, 0.28], [1, 0.8, 0.2], [0.3, 0.6, 1], [0.35, 0.95, 0.5], [1, 0.45, 0.85], [0.7, 0.4, 1], [1, 0.62, 0.2], [0.55, 1, 1],
];
type Shape = 'sphere' | 'ring' | 'willow' | 'twin' | 'heart';

interface Rocket {
  x: number; y: number; z: number;
  vy: number; dx: number; dz: number;
  fuse: number; delay: number;
}

export interface FireworkHost {
  particles: Particles;
  sound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void;
}

/**
 * 2.10: FIREWORKS. A rocket climbs trailing sparks, then bursts into a ball, a ring,
 * a golden willow, a two-colour ball or a heart. Harmless: only light and sound.
 */
export class Fireworks {
  private rockets: Rocket[] = [];
  constructor(private host: FireworkHost) {}

  get active(): number { return this.rockets.length; }

  launch(x: number, y: number, z: number, delay = 0): void {
    this.rockets.push({
      x, y, z, vy: 0.55 + Math.random() * 0.1, dx: (Math.random() - 0.5) * 0.04, dz: (Math.random() - 0.5) * 0.04,
      fuse: 24 + Math.floor(Math.random() * 10), delay,
    });
  }

  tick(): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      if (r.delay > 0) { if (--r.delay === 0) this.host.sound('rocket', r.x, r.y, r.z, 0.6, 0.9 + Math.random() * 0.2); continue; }
      r.x += r.dx; r.y += r.vy; r.z += r.dz;
      r.vy *= 0.985;
      this.host.particles.spawn({
        x: r.x, y: r.y, z: r.z, vx: (Math.random() - 0.5) * 0.02, vy: -0.03, vz: (Math.random() - 0.5) * 0.02,
        max: 10 + Math.random() * 6, size: 0.1, r: 1, g: 0.65 + Math.random() * 0.25, b: 0.25, gravity: 0.004, glow: true,
      });
      if (--r.fuse <= 0) { this.burst(r.x, r.y, r.z); this.rockets.splice(i, 1); }
    }
  }

  private burst(x: number, y: number, z: number): void {
    const shapes: Shape[] = ['sphere', 'ring', 'willow', 'twin', 'heart'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const c1 = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    const c2 = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    const P = this.host.particles;
    const add = (vx: number, vy: number, vz: number, c: [number, number, number], max: number, gravity: number, size = 0.2) =>
      P.spawn({ x, y, z, vx, vy, vz, max, size, r: c[0], g: c[1], b: c[2], gravity, glow: true });
    const n = 110;
    if (shape === 'sphere' || shape === 'twin') {
      for (let i = 0; i < n; i++) {
        // a point on a sphere (golden-angle spiral)
        const u = 1 - (2 * (i + 0.5)) / n, a = i * 2.39996, r = Math.sqrt(1 - u * u);
        const sp = 0.24 * (shape === 'twin' && i % 2 ? 0.55 : 1);
        add(Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, shape === 'twin' && i % 2 ? c2 : c1, 34 + Math.random() * 10, 0.006);
      }
    } else if (shape === 'ring') {
      const tilt = Math.random() * Math.PI, yaw = Math.random() * Math.PI * 2;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        let vx = Math.cos(a) * 0.25, vy = 0, vz = Math.sin(a) * 0.25;
        const vy2 = vy * Math.cos(tilt) - vz * Math.sin(tilt), vz2 = vy * Math.sin(tilt) + vz * Math.cos(tilt);
        vy = vy2; vz = vz2;
        const vx3 = vx * Math.cos(yaw) - vz * Math.sin(yaw), vz3 = vx * Math.sin(yaw) + vz * Math.cos(yaw);
        add(vx3, vy, vz3, i % 8 === 0 ? c2 : c1, 34, 0.004);
      }
      for (let i = 0; i < 10; i++) add((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, [1, 1, 1], 30, 0.003, 0.14);
    } else if (shape === 'willow') {
      const gold: [number, number, number] = [1, 0.82, 0.35];
      for (let i = 0; i < n; i++) {
        const u = 1 - (2 * (i + 0.5)) / n, a = i * 2.39996, r = Math.sqrt(1 - u * u);
        add(Math.cos(a) * r * 0.2, u * 0.2 + 0.03, Math.sin(a) * r * 0.2, gold, 56 + Math.random() * 16, 0.011, 0.15);
      }
    } else {
      // a heart in the sky (facing a random way round)
      const yaw = Math.random() * Math.PI * 2;
      for (let i = 0; i < 80; i++) {
        const t = (i / 80) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3) / 16, hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        add(hx * 0.2 * Math.cos(yaw), hy * 0.2 + 0.02, hx * 0.2 * Math.sin(yaw), [1, 0.3, 0.45], 38, 0.004);
      }
    }
    this.host.sound('firework', x, y, z, 1.4, 0.9 + Math.random() * 0.25);
  }
}
