/**
 * WEATHER
 * -------
 * World-wide weather: clear skies, rain (snow in cold places, nothing in deserts
 * and badlands) and thunderstorms. Each spell lasts a random time, then the
 * weather changes. `rain` and `thunder` are smoothed 0..1 intensities that fade
 * in and out over a few seconds; the renderer, audio, lighting and gameplay
 * rules all read them. `flash` is the brief brightening after a lightning strike.
 */
export type WeatherKind = 'clear' | 'rain' | 'thunder';

export interface WeatherSave {
  kind: WeatherKind;
  timer: number;
}

const between = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

/** How long a spell of each kind of weather lasts, in ticks (20 per second). */
export function weatherDuration(kind: WeatherKind): number {
  if (kind === 'clear') return between(9600, 36000);     // 8-30 minutes
  if (kind === 'rain') return between(3600, 9600);       // 3-8 minutes
  return between(3000, 7200);                            // 2.5-6 minutes
}

export class WeatherSystem {
  kind: WeatherKind = 'clear';
  timer = between(6000, 18000);
  rain = 0;
  thunder = 0;
  flash = 0;

  /** Advances the weather by one tick. `cycle` = the Weather Cycle game rule. */
  tick(cycle: boolean): void {
    if (cycle && --this.timer <= 0) {
      this.set(this.kind === 'clear' ? (Math.random() < 0.3 ? 'thunder' : 'rain') : 'clear');
    }
    const wantRain = this.kind === 'clear' ? 0 : 1;
    const wantThunder = this.kind === 'thunder' ? 1 : 0;
    this.rain += Math.max(-0.01, Math.min(0.01, wantRain - this.rain));
    this.thunder += Math.max(-0.01, Math.min(0.01, wantThunder - this.thunder));
  }

  set(kind: WeatherKind, duration = weatherDuration(kind), immediate = false): void {
    this.kind = kind;
    this.timer = duration;
    if (immediate) {
      this.rain = kind === 'clear' ? 0 : 1;
      this.thunder = kind === 'thunder' ? 1 : 0;
    }
  }

  get raining(): boolean { return this.rain > 0.2; }
  get stormy(): boolean { return this.thunder > 0.8; }

  load(s: WeatherSave | undefined): void {
    if (!s || (s.kind !== 'clear' && s.kind !== 'rain' && s.kind !== 'thunder')) return;
    this.set(s.kind, Math.max(1, Math.floor(s.timer) || 1), true);
  }

  save(): WeatherSave {
    return { kind: this.kind, timer: this.timer };
  }
}
