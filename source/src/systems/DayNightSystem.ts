import * as THREE from 'three';
import { DAY_LENGTH_TICKS } from '../world/constants';
import type { SkyState } from '../render/Sky';

/**
 * Continuous world time. 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight
 * (a full cycle is 24000 ticks = 20 minutes). Produces the sky colours, the sun and
 * moon directions, the sky-light multiplier used by the chunk shader, fog colour
 * and the directional/ambient light used by entities.
 */
export interface Lighting {
  daylight: number;         // sky light multiplier for the chunk shader (0.2 .. 1)
  skyTint: THREE.Color;     // colour of sky light on blocks
  fog: THREE.Color;
  sunStrength: number;
  sunIntensity: number;     // directional light for entities
  ambient: number;
}

const DAY_ZENITH = new THREE.Color(0.42, 0.62, 1.0);
const DAY_HORIZON = new THREE.Color(0.72, 0.84, 1.0);
const NIGHT_ZENITH = new THREE.Color(0.005, 0.008, 0.03);
const NIGHT_HORIZON = new THREE.Color(0.03, 0.04, 0.09);
const SUNSET = new THREE.Color(1.0, 0.5, 0.22);

export class DayNightSystem {
  time = 1000;              // ticks since world creation, modulo day
  day = 0;
  readonly sky: SkyState = {
    zenith: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(), glowStrength: 0,
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), starAlpha: 0, angle: 0,
    cloudColor: new THREE.Color(), clear: 1,
  };
  readonly light: Lighting = {
    daylight: 1, skyTint: new THREE.Color(1, 1, 1), fog: new THREE.Color(), sunStrength: 1, sunIntensity: 1, ambient: 0.5,
  };

  get timeOfDay(): number {
    return ((this.time % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
  }

  isNight(): boolean {
    const t = this.timeOfDay;
    return t > 12600 && t < 23400;
  }

  tick(advance: boolean): void {
    if (!advance) return;
    this.time++;
    if (this.time % DAY_LENGTH_TICKS === 0) this.day++;
  }

  /**
   * Recomputes sky and light state; partial = fraction of the next tick for
   * smoothness. `w` darkens and greys the sky for rain and storms and brightens
   * everything for a moment after a lightning strike.
   */
  update(partial: number, w: { rain: number; thunder: number; flash: number } = NO_WEATHER): void {
    const t = (this.timeOfDay + partial) / DAY_LENGTH_TICKS; // 0..1, 0 = sunrise
    const angle = t * Math.PI * 2;
    const s = this.sky;
    s.angle = angle;
    s.sunDir.set(Math.cos(angle), Math.sin(angle), 0.18).normalize();
    s.moonDir.copy(s.sunDir).negate();

    const sunH = Math.sin(angle);
    const day = THREE.MathUtils.clamp(sunH * 2.4 + 0.35, 0, 1);
    const twilight = Math.max(0, 1 - Math.abs(sunH) / 0.32);

    s.zenith.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, day);
    s.horizon.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day);
    s.glow.copy(SUNSET);
    s.glowStrength = twilight * 0.9;
    s.horizon.lerp(SUNSET, twilight * 0.35);
    s.starAlpha = THREE.MathUtils.clamp(1 - day * 1.6, 0, 1);
    s.cloudColor.setRGB(1, 1, 1).lerp(new THREE.Color(0.12, 0.13, 0.2), 1 - day).lerp(new THREE.Color(1, 0.72, 0.55), twilight * 0.4);

    const L = this.light;
    L.daylight = 0.3 + 0.7 * day;
    L.skyTint.setRGB(1, 1, 1).lerp(new THREE.Color(1.0, 0.82, 0.7), twilight * 0.5).lerp(new THREE.Color(0.72, 0.78, 1.0), 1 - day);
    L.fog.copy(s.horizon);
    L.sunStrength = Math.max(0, sunH);
    L.sunIntensity = 0.25 + 0.75 * day;
    L.ambient = 0.28 + 0.4 * day;
    s.clear = 1;

    // ---- weather: an overcast, grey sky; storms are darker still
    const rain = w.rain, thunder = w.thunder;
    if (rain > 0.001) {
      const dim = 1 - 0.3 * rain - 0.35 * thunder;
      const grey = (0.36 + 0.64 * day) * (1 - 0.4 * thunder);
      TMP.setRGB(0.5, 0.53, 0.58).multiplyScalar(grey);
      s.zenith.lerp(TMP, rain * 0.85);
      TMP.setRGB(0.6, 0.63, 0.67).multiplyScalar(grey);
      s.horizon.lerp(TMP, rain * 0.85);
      s.glowStrength *= 1 - rain * 0.8;
      s.starAlpha *= 1 - rain;
      s.clear = 1 - rain;
      TMP.setRGB(0.52, 0.54, 0.58).multiplyScalar(0.3 + 0.7 * day * (1 - 0.45 * thunder));
      s.cloudColor.lerp(TMP, rain);
      L.daylight = 0.3 + 0.7 * day * dim;
      L.fog.copy(s.horizon);
      L.sunStrength *= 1 - rain * 0.85;
      L.sunIntensity = 0.25 + 0.75 * day * dim;
      L.ambient = 0.28 + 0.4 * day * dim;
    }
    if (w.flash > 0.001) {
      const f = Math.min(1, w.flash);
      L.daylight += (1 - L.daylight) * f * 0.8;
      TMP.setRGB(0.82, 0.84, 1.0);
      s.zenith.lerp(TMP, f * 0.6);
      s.horizon.lerp(TMP, f * 0.6);
      L.fog.copy(s.horizon);
      L.ambient += (0.7 - L.ambient) * f;
    }
  }
}

const NO_WEATHER = { rain: 0, thunder: 0, flash: 0 };
const TMP = new THREE.Color();
