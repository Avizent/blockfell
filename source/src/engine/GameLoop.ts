import { TICK_MS } from '../world/constants';

/**
 * Fixed-timestep loop: simulation runs at exactly 20 ticks per second (like the
 * reference game) while rendering runs every animation frame and interpolates
 * between the last two ticks using `alpha`.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  running = false;
  fps = 0;
  frameMs = 0;
  worstFrameMs = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private worstWindow = 0;

  constructor(
    private tick: () => void,
    private frame: (dt: number, alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      let dt = now - this.last;
      this.last = now;
      if (dt > 250) dt = 250; // tab was hidden: don't try to catch up minutes of ticks
      this.acc += dt;
      let ticks = 0;
      while (this.acc >= TICK_MS && ticks < 8) {
        this.tick();
        this.acc -= TICK_MS;
        ticks++;
      }
      if (ticks === 8) this.acc = 0;
      const t0 = performance.now();
      this.frame(dt / 1000, this.acc / TICK_MS);
      this.frameMs = performance.now() - t0;
      this.fpsFrames++;
      this.fpsTime += dt;
      this.worstWindow = Math.max(this.worstWindow, dt);
      if (this.fpsTime >= 500) {
        this.fps = Math.round((this.fpsFrames * 1000) / this.fpsTime);
        this.worstFrameMs = this.worstWindow;
        this.fpsFrames = 0;
        this.fpsTime = 0;
        this.worstWindow = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
