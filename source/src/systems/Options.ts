import { isTouchDevice, TouchSetting } from '../engine/touch';

export interface Options {
  fov: number;              // vertical degrees
  renderDistance: number;   // chunks
  simulationDistance: number; // chunks
  sensitivity: number;      // 0..1
  invertY: boolean;
  guiScale: number;         // 0 = auto
  brightness: number;       // 0 (moody) .. 1 (bright)
  viewBobbing: boolean;
  clouds: boolean;
  renderScale: number;      // fraction of device pixel ratio
  masterVolume: number;
  musicVolume: number;
  soundVolume: number;
  /** All sound on or off (1.7.1; the volume sliders keep their levels). Also the M key and the pause menu. */
  sound: boolean;
  /** Music on or off (1.7.1): sound effects carry on without it. */
  music: boolean;
  showFps: boolean;
  greedyMeshing: boolean;
  /** On-screen controls for phones and tablets. */
  touchControls: TouchSetting;
  /** If Blockfell closed while you were in a world, open straight back into it (1.6). */
  reopenLastWorld: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  fov: 70,
  renderDistance: 8,
  simulationDistance: 6,
  sensitivity: 0.5,
  invertY: false,
  guiScale: 0,
  brightness: 0.5,
  viewBobbing: true,
  clouds: true,
  renderScale: 1,
  masterVolume: 0.8,
  musicVolume: 0.5,
  soundVolume: 1,
  sound: true,
  music: true,
  showFps: false,
  greedyMeshing: true,
  touchControls: 'auto',
  reopenLastWorld: true,
};

/** Lighter first-run settings for phones and tablets. */
const TOUCH_DEFAULTS: Partial<Options> = { renderDistance: 5, simulationDistance: 4, renderScale: 0.75 };

const KEY = 'blockfell.options.v1';

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return isTouchDevice() ? { ...DEFAULT_OPTIONS, ...TOUCH_DEFAULTS } : { ...DEFAULT_OPTIONS };
}

export function saveOptions(o: Options): void {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage unavailable */ }
}

/**
 * Touch screens: the largest quarter-step scale at which the tallest screen (the
 * Creative catalogue with its tabs, about 196 GUI pixels) still fits. A phone in a
 * browser tab loses some height to the address bar, and whole-number steps would
 * then drop it to a tiny scale 1. (Quarter steps keep 16-pixel icons on whole pixels.)
 */
export function touchGuiScale(w: number, h: number): number {
  const fit = Math.min(w / 340, (h + 8) / 196, 4);
  return Math.max(1, Math.floor(fit * 4) / 4);
}

/** Largest integer GUI scale that keeps a 320x240 GUI-pixel canvas on screen (reference-game rule). */
export function autoGuiScale(w: number, h: number, max = 4, minH = 240): number {
  let s = 1;
  while (s < max && w / (s + 1) >= 320 && h / (s + 1) >= minH) s++;
  return s;
}
