/**
 * TUNES (2.11)
 * ------------
 * A tune is 32 steps (two bars of 16 eighth notes) on three tracks:
 *   melody: -1 = rest, 0..7 = the notes of a pentatonic scale (C D E G A C D E)
 *   bass:   -1 = rest, 0..3 = four low notes
 *   drums:  0 = none, 1 = kick, 2 = snare, 3 = hat
 * Plain data (no imports) so saves, discs, the editor and the Jukebox all share it.
 * All three built-in tunes are ORIGINAL compositions.
 */
export interface Tune {
  name: string;
  /** Beats per minute (a step is half a beat). */
  tempo: number;
  /** Melody instrument: 0 Harp, 1 Bell, 2 Pipe, 3 Marimba. */
  inst: number;
  mel: number[];
  bass: number[];
  drum: number[];
}

export const STEPS = 32;
export const INST_NAMES = ['Harp', 'Bell', 'Pipe', 'Marimba'];
export const INST_KEYS = ['harp', 'bell', 'pipe', 'marimba'];
/** Semitones above middle C. */
export const MEL_SEMI = [0, 2, 4, 7, 9, 12, 14, 16];
export const MEL_NAMES = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
export const BASS_SEMI = [-24, -19, -17, -12];
export const BASS_NAMES = ['C', 'G', 'A', 'C'];
export const DRUM_NAMES = ['Kick', 'Snare', 'Hat'];
export const DRUM_KEYS = ['', 'kick', 'snare', 'hat'];

const fill = (n: number, v: number) => new Array<number>(n).fill(v);

export function emptyTune(): Tune {
  return { name: 'My Tune', tempo: 110, inst: 0, mel: fill(STEPS, -1), bass: fill(STEPS, -1), drum: fill(STEPS, 0) };
}

/** Seconds' worth of ticks (20 a second) between steps. */
export function stepTicks(t: Tune): number {
  return 20 * 30 / Math.max(40, Math.min(200, t.tempo));
}

function ints(a: unknown, max: number, min: number): number[] | null {
  if (!Array.isArray(a)) return null;
  const out = fill(STEPS, min);
  for (let i = 0; i < STEPS; i++) {
    const v = a[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : min;
  }
  return out;
}

/** A validated copy of saved tune data, or undefined. */
export function cleanTune(raw: unknown): Tune | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const mel = ints(o.mel, 7, -1), bass = ints(o.bass, 3, -1), drum = ints(o.drum, 3, 0);
  if (!mel || !bass || !drum) return undefined;
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 20) : 'My Tune',
    tempo: typeof o.tempo === 'number' ? Math.max(40, Math.min(200, Math.round(o.tempo))) : 110,
    inst: typeof o.inst === 'number' ? Math.max(0, Math.min(3, Math.floor(o.inst))) : 0,
    mel, bass, drum,
  };
}

export function copyTune(t: Tune): Tune {
  return { ...t, mel: [...t.mel], bass: [...t.bass], drum: [...t.drum] };
}

/** True if the tune has any notes at all. */
export function tuneHasNotes(t: Tune): boolean {
  return t.mel.some((v) => v >= 0) || t.bass.some((v) => v >= 0) || t.drum.some((v) => v > 0);
}

const R = -1;
export const BUILTIN_TUNES: Record<string, Tune> = {
  // lively, bouncy, on the marimba
  disc_jig: {
    name: 'Fellfire Jig', tempo: 150, inst: 3,
    mel: [0, 2, 4, 2, 4, 5, 4, 2, 0, 2, 4, 5, 6, 5, 4, R, 4, 5, 6, 5, 4, 2, 0, 2, 4, 2, 0, R, 0, R, R, R],
    bass: [0, R, 3, R, 0, R, 3, R, 0, R, 3, R, 2, R, 3, R, 0, R, 3, R, 0, R, 3, R, 1, R, 3, R, 0, R, R, R],
    drum: [1, 0, 3, 0, 2, 0, 3, 0, 1, 0, 3, 0, 2, 0, 3, 3, 1, 0, 3, 0, 2, 0, 3, 0, 1, 3, 1, 0, 2, 0, 0, 0],
  },
  // slow and soft, on the pipe
  disc_lullaby: {
    name: 'Moss Lullaby', tempo: 72, inst: 2,
    mel: [4, R, R, 2, 0, R, 2, R, 4, R, R, 5, 4, R, R, R, 2, R, 4, R, 5, R, 4, R, 2, R, R, R, 0, R, R, R],
    bass: [0, R, R, R, R, R, R, R, 2, R, R, R, R, R, R, R, 1, R, R, R, R, R, R, R, 0, R, R, R, R, R, R, R],
    drum: fill(STEPS, 0),
  },
  // shimmering bells rising and falling
  disc_drift: {
    name: 'Starhollow Drift', tempo: 100, inst: 1,
    mel: [0, 2, 4, 3, 5, 3, 4, 2, 2, 4, 6, 5, 7, 5, 6, 4, 4, 6, 7, 6, 5, 3, 4, 2, 0, R, 2, R, 0, R, R, R],
    bass: [0, R, R, R, 1, R, R, R, 2, R, R, R, 1, R, R, R, 0, R, R, R, 1, R, R, R, 2, R, R, R, 0, R, R, R],
    drum: [3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0],
  },
};

/** The tune on a disc stack (built-in discs, or a recorded Music Disc). */
export function tuneOfStack(s: { id: string; tune?: Tune } | null | undefined): Tune | null {
  if (!s) return null;
  if (BUILTIN_TUNES[s.id]) return BUILTIN_TUNES[s.id];
  return s.id === 'music_disc' && s.tune ? s.tune : null;
}

export function isDisc(id: string): boolean {
  return id === 'music_disc' || id in BUILTIN_TUNES;
}
