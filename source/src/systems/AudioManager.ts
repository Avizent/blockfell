/**
 * Fully procedural audio (WebAudio synthesis - no sound files):
 * material-specific digging/stepping/placing noises, UI clicks, pickups,
 * creature voices, and a sparse generative ambient music track.
 * Positional sounds are attenuated by distance and panned by direction.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  volumes = { master: 0.8, sfx: 1, music: 0.5 };
  listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private musicTimer = 25;
  /** The Sound switch (Options, pause menu, M): off = silent, and the audio engine is suspended. */
  enabled = true;
  /** The Music switch: off = no music, sound effects carry on. */
  musicEnabled = true;
  /** Sound effects actually started (for tests and the debug overlay). */
  played = 0;

  /**
   * Must be called from a user gesture (browser autoplay rules). With Sound switched
   * off it does nothing: no audio engine is started or woken.
   */
  unlock(): void {
    if (!this.enabled) return;
    if (this.ctx) {
      // iOS reports 'interrupted' (not 'suspended') after a call or switching apps
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    const rv = ctx.createGain();
    rv.gain.value = 0.6;
    this.reverb.connect(rv).connect(this.music);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.enabled ? this.volumes.master : 0;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.musicEnabled ? this.volumes.music * 0.35 : 0;
  }

  /**
   * Switches all sound on or off. Off: silenced at once and the audio engine is
   * suspended (no synthesis, no CPU). On: woken again - switching on is a tap or a
   * key press, which is the user gesture browsers need to start sound.
   */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      if (this.ctx) {
        this.applyVolumes();
        this.stopWeather();
        void this.ctx.suspend().catch(() => undefined);
      }
      return;
    }
    this.unlock();
    this.applyVolumes();
  }

  /** Switches the music on or off (a phrase already playing is silenced at once). */
  setMusic(on: boolean): void {
    this.musicEnabled = on;
    if (!on) this.musicTimer = Math.max(this.musicTimer, 20);
    this.applyVolumes();
  }

  /** What the audio engine is doing, for tests and the debug overlay. */
  status(): { enabled: boolean; music: boolean; state: string; master: number; musicGain: number; played: number } {
    return {
      enabled: this.enabled, music: this.musicEnabled, state: this.ctx?.state ?? 'none',
      master: this.ctx ? this.master.gain.value : 0, musicGain: this.ctx ? this.music.gain.value : 0, played: this.played,
    };
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  /** Output node for a positional sound (gain + stereo pan), or null if too far. */
  private out(x: number | undefined, y: number | undefined, z: number | undefined, volume: number): AudioNode | null {
    const ctx = this.ctx!;
    let gainV = volume, pan = 0;
    if (x !== undefined && y !== undefined && z !== undefined) {
      const dx = x - this.listener.x, dy = y - this.listener.y, dz = z - this.listener.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 24) return null;
      gainV *= Math.max(0, 1 - dist / 24) ** 1.5;
      if (dist > 0.5) {
        const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
        pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) * 0.7;
      }
    }
    if (gainV < 0.005) return null;
    const g = ctx.createGain();
    g.gain.value = gainV;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.sfx);
    return g;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, freq: number, q: number, type: BiquadFilterType, gain: number, rate = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, f0: number, f1: number, type: OscillatorType, gain: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private material(dest: AudioNode, t: number, mat: string, strength: number, pitch: number): void {
    switch (mat) {
      case 'wood':
        this.noiseBurst(dest, t, 0.09, 700 * pitch, 3, 'bandpass', 0.7 * strength);
        this.tone(dest, t, 0.08, 220 * pitch, 140 * pitch, 'triangle', 0.25 * strength);
        break;
      case 'grass':
        this.noiseBurst(dest, t, 0.12, 2800 * pitch, 0.7, 'highpass', 0.35 * strength);
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++) this.noiseBurst(dest, t + i * 0.018, 0.05, 1300 * pitch, 2, 'bandpass', 0.5 * strength);
        break;
      case 'sand':
        this.noiseBurst(dest, t, 0.14, 2200 * pitch, 0.6, 'bandpass', 0.3 * strength);
        break;
      case 'snow':
        this.noiseBurst(dest, t, 0.1, 3500 * pitch, 0.5, 'lowpass', 0.3 * strength);
        break;
      case 'wool':
        this.noiseBurst(dest, t, 0.12, 500 * pitch, 0.6, 'lowpass', 0.35 * strength);
        break;
      case 'glass':
        this.noiseBurst(dest, t, 0.08, 4000 * pitch, 1, 'highpass', 0.5 * strength);
        this.tone(dest, t, 0.25, 2400 * pitch, 2200 * pitch, 'sine', 0.12 * strength);
        this.tone(dest, t + 0.02, 0.2, 3100 * pitch, 3000 * pitch, 'sine', 0.08 * strength);
        break;
      default: // stone
        this.noiseBurst(dest, t, 0.08, 1700 * pitch, 2.5, 'bandpass', 0.8 * strength);
        this.noiseBurst(dest, t, 0.05, 400 * pitch, 1, 'lowpass', 0.3 * strength);
    }
  }

  /** Plays a named sound effect, optionally positioned in the world. */
  play(name: string, x?: number, y?: number, z?: number, volume = 1, pitch = 1): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const dest = this.out(x, y, z, volume);
    if (!dest) return;
    this.played++;
    const t = this.ctx.currentTime;
    const [kind, mat] = name.split(':');
    switch (kind) {
      case 'step': this.material(dest, t, mat, 0.35, pitch); break;
      case 'hit': if (mat) this.material(dest, t, mat, 0.45, pitch * 0.8); else { this.noiseBurst(dest, t, 0.08, 900, 1, 'lowpass', 0.8); this.tone(dest, t, 0.08, 160, 90, 'square', 0.15); } break;
      case 'break': this.material(dest, t, mat, 1, pitch * 0.85); this.material(dest, t + 0.03, mat, 0.7, pitch * 0.7); break;
      case 'place': this.material(dest, t, mat, 0.8, pitch); break;
      case 'click': this.tone(dest, t, 0.05, 1200, 900, 'square', 0.12); break;
      case 'pop': this.tone(dest, t, 0.07, 600 * pitch, 1400 * pitch, 'sine', 0.35); break;
      case 'orb': this.tone(dest, t, 0.12, 1500 * pitch, 2400 * pitch, 'sine', 0.2); this.tone(dest, t + 0.04, 0.12, 2000 * pitch, 3000 * pitch, 'sine', 0.12); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(dest, t + i * 0.09, 0.35, f, f, 'triangle', 0.25)); break;
      case 'hurt': this.tone(dest, t, 0.18, 330, 180, 'sawtooth', 0.25); this.noiseBurst(dest, t, 0.1, 700, 1, 'lowpass', 0.4); break;
      case 'eat': this.noiseBurst(dest, t, 0.08, 1100 * pitch, 1.2, 'bandpass', 0.5); break;
      case 'burp': this.tone(dest, t, 0.25, 180, 90, 'sawtooth', 0.2); break;
      case 'bow': this.noiseBurst(dest, t, 0.15, 1800, 0.8, 'bandpass', 0.4); this.tone(dest, t, 0.12, 300, 700, 'triangle', 0.1); break;
      case 'arrow_hit': this.tone(dest, t, 0.08, 400, 200, 'triangle', 0.3); break;
      case 'tool_break': this.noiseBurst(dest, t, 0.2, 3000, 1, 'highpass', 0.5); this.tone(dest, t, 0.2, 900, 300, 'square', 0.15); break;
      case 'splash': this.noiseBurst(dest, t, 0.4, 1200 * pitch, 0.5, 'lowpass', 0.5); break;
      case 'fizz': this.noiseBurst(dest, t, 0.55, 5200 * pitch, 0.6, 'highpass', 0.35); this.noiseBurst(dest, t + 0.05, 0.4, 2400 * pitch, 1.2, 'bandpass', 0.2); break;
      case 'lava_pop': this.tone(dest, t, 0.06, 180 * pitch, 520 * pitch, 'sine', 0.3); this.noiseBurst(dest, t, 0.05, 900 * pitch, 2, 'bandpass', 0.25); break;
      case 'lava_fill': this.noiseBurst(dest, t, 0.35, 500, 0.7, 'lowpass', 0.5); this.tone(dest, t, 0.3, 160, 320, 'sine', 0.14); break;
      case 'lava_empty': this.noiseBurst(dest, t, 0.4, 420, 0.6, 'lowpass', 0.55); this.tone(dest, t, 0.3, 300, 120, 'sine', 0.14); break;
      case 'cast': this.noiseBurst(dest, t, 0.18, 2200 * pitch, 0.7, 'bandpass', 0.35); this.tone(dest, t, 0.16, 900 * pitch, 380 * pitch, 'triangle', 0.08); break;
      case 'reel': for (let i = 0; i < 5; i++) this.tone(dest, t + i * 0.035, 0.03, 1500 * pitch, 1300 * pitch, 'square', 0.06); break;
      case 'bell': {
        // a cast bell: a strike, then inharmonic partials ringing away at different rates
        const f = 523 * pitch;
        this.noiseBurst(dest, t, 0.05, 2600, 1.2, 'bandpass', 0.35);
        for (const [ratio, g, dur] of [[0.5, 0.16, 4.2], [1, 0.22, 3.4], [1.19, 0.12, 2.6], [1.5, 0.09, 2.2], [2, 0.08, 1.8], [2.51, 0.05, 1.3], [3.01, 0.03, 0.9]] as const) {
          this.tone(dest, t, dur, f * ratio, f * ratio * 0.998, 'sine', g, 0.003);
        }
        break;
      }
      case 'page': this.noiseBurst(dest, t, 0.12, 3200 * pitch, 0.8, 'bandpass', 0.25); this.noiseBurst(dest, t + 0.09, 0.1, 2400 * pitch, 0.8, 'bandpass', 0.18); break;
      case 'chest_open': this.tone(dest, t, 0.25, 180, 260, 'triangle', 0.25); this.noiseBurst(dest, t, 0.2, 500, 1, 'bandpass', 0.2); break;
      case 'chest_close': this.tone(dest, t, 0.15, 220, 140, 'triangle', 0.3); this.noiseBurst(dest, t + 0.1, 0.06, 400, 1, 'lowpass', 0.4); break;
      case 'fall': this.noiseBurst(dest, t, 0.12, 300, 1, 'lowpass', 0.8); break;
      case 'door_open': this.tone(dest, t, 0.18, 140 * pitch, 220 * pitch, 'triangle', 0.25); this.noiseBurst(dest, t, 0.12, 700, 1.5, 'bandpass', 0.35); break;
      case 'door_close': this.noiseBurst(dest, t, 0.08, 500, 1, 'lowpass', 0.8); this.tone(dest, t, 0.1, 160 * pitch, 110 * pitch, 'triangle', 0.3); break;
      case 'bucket_fill': this.noiseBurst(dest, t, 0.3, 900, 0.7, 'bandpass', 0.45); this.tone(dest, t, 0.25, 300, 700, 'sine', 0.12); break;
      case 'bucket_empty': this.noiseBurst(dest, t, 0.35, 700, 0.6, 'lowpass', 0.5); this.tone(dest, t, 0.25, 600, 250, 'sine', 0.12); break;
      case 'runes': [660, 880, 990, 1320].forEach((f, i) => this.tone(dest, t + i * 0.06, 0.5, f, f * 1.01, 'sine', 0.12)); this.noiseBurst(dest, t, 0.6, 4000, 1, 'highpass', 0.1); break;
      case 'sleep': this.tone(dest, t, 1.2, 330, 220, 'sine', 0.1); break;
      case 'raid_horn': this.tone(dest, t, 2.2, 110, 104, 'sawtooth', 0.22, 0.02); this.tone(dest, t, 2.2, 165, 158, 'triangle', 0.14); this.noiseBurst(dest, t, 1.6, 300, 0.7, 'lowpass', 0.12); break;
      case 'sentinel_hit': this.noiseBurst(dest, t, 0.25, 220, 1, 'lowpass', 0.9); this.tone(dest, t, 0.3, 90, 50, 'square', 0.2); break;
      // ---- 2.0 the Cinderdeep
      case 'gate_light': this.noiseBurst(dest, t, 0.9, 900, 0.6, 'lowpass', 0.6); this.tone(dest, t, 1.1, 110, 220, 'sawtooth', 0.12, 0.05); this.tone(dest, t + 0.1, 1.0, 330, 440, 'sine', 0.1); break;
      case 'gate_hum': this.tone(dest, t, 1.0, 74 * pitch, 78 * pitch, 'sawtooth', 0.08, 0.2); this.tone(dest, t, 1.0, 148 * pitch, 150 * pitch, 'sine', 0.06, 0.2); break;
      case 'gate_travel': this.noiseBurst(dest, t, 1.6, 400, 0.5, 'lowpass', 0.8, 0.2); this.tone(dest, t, 1.6, 220, 55, 'sawtooth', 0.14, 0.05); this.tone(dest, t, 1.4, 440, 110, 'sine', 0.08); break;
      case 'ember_throw': this.noiseBurst(dest, t, 0.3, 1600 * pitch, 0.8, 'bandpass', 0.35); this.tone(dest, t, 0.25, 260 * pitch, 520 * pitch, 'triangle', 0.08); break;
      case 'ember_hit': this.noiseBurst(dest, t, 0.35, 2600 * pitch, 0.7, 'highpass', 0.35); this.noiseBurst(dest, t, 0.2, 500, 1, 'lowpass', 0.4); break;
      case 'deep_rumble': this.noiseBurst(dest, t, 3.2, 90 * pitch, 0.6, 'lowpass', 0.7, 0.8); this.tone(dest, t, 3, 41 * pitch, 36 * pitch, 'sine', 0.2, 0.6); break;
      default: this.creature(dest, t, name, pitch);
    }
  }

  private creature(dest: AudioNode, t: number, name: string, pitch: number): void {
    const [mob, what] = name.split('_');
    const hurt = what === 'hurt', death = what === 'death';
    const p = pitch * (hurt ? 1.15 : death ? 0.85 : 1);
    switch (mob) {
      case 'pig': this.tone(dest, t, 0.22, 170 * p, 110 * p, 'sawtooth', 0.18); this.noiseBurst(dest, t, 0.18, 400, 2, 'bandpass', 0.2); break;
      case 'cow': this.tone(dest, t, 0.7, 130 * p, 95 * p, 'sawtooth', 0.14, 0.08); break;
      case 'sheep': for (let i = 0; i < 5; i++) this.tone(dest, t + i * 0.07, 0.09, 280 * p, 250 * p, 'sawtooth', 0.1); break;
      case 'chicken': for (let i = 0; i < 3; i++) this.tone(dest, t + i * 0.09, 0.05, 1300 * p, 900 * p, 'square', 0.08); break;
      case 'shambler': this.tone(dest, t, 0.8, 95 * p, 70 * p, 'sawtooth', 0.16, 0.1); this.noiseBurst(dest, t, 0.6, 300, 1, 'lowpass', 0.2); break;
      case 'skeleton': for (let i = 0; i < 6; i++) this.noiseBurst(dest, t + i * 0.04, 0.03, 2500 * p, 3, 'bandpass', 0.4); break;
      case 'goat': this.tone(dest, t, 0.35, 420 * p, 380 * p, 'sawtooth', 0.12, 0.12); break;
      case 'rabbit': this.tone(dest, t, 0.06, 1800 * p, 1500 * p, 'sine', 0.08); break;
      case 'crawler': for (let i = 0; i < 4; i++) this.noiseBurst(dest, t + i * 0.05, 0.05, 1200 * p, 2, 'bandpass', 0.35); this.tone(dest, t, 0.3, 90 * p, 70 * p, 'sawtooth', 0.08); break;
      case 'dustwalker': this.tone(dest, t, 0.8, 80 * p, 60 * p, 'sawtooth', 0.14, 0.12); this.noiseBurst(dest, t, 0.7, 800, 0.6, 'bandpass', 0.25); break;
      case 'villager':
        if (what === 'no') { this.tone(dest, t, 0.14, 240 * p, 200 * p, 'triangle', 0.16); this.tone(dest, t + 0.16, 0.18, 200 * p, 150 * p, 'triangle', 0.16); }
        else if (what === 'yes') { this.tone(dest, t, 0.12, 220 * p, 260 * p, 'triangle', 0.16); this.tone(dest, t + 0.13, 0.16, 280 * p, 340 * p, 'triangle', 0.16); }
        else { this.tone(dest, t, 0.3, 200 * p, 250 * p, 'triangle', 0.16, 0.04); this.tone(dest, t + 0.05, 0.25, 400 * p, 480 * p, 'sine', 0.05); }
        break;
      case 'sentinel': this.noiseBurst(dest, t, 0.5, 180 * p, 1.5, 'bandpass', 0.6); this.tone(dest, t, 0.5, 70 * p, 55 * p, 'sawtooth', 0.12); break;
      case 'cinderling': for (let i = 0; i < 3; i++) this.noiseBurst(dest, t + i * 0.06, 0.06, 3200 * p, 2.5, 'bandpass', 0.3); this.tone(dest, t, 0.18, 700 * p, 1100 * p, 'square', 0.05); break;
      case 'smoulderer': this.noiseBurst(dest, t, 1.0, 260 * p, 0.8, 'lowpass', 0.4, 0.2); this.tone(dest, t, 0.9, 62 * p, 50 * p, 'sawtooth', 0.12, 0.15); break;
      case 'ashboar':
        if (what === 'snort') { this.noiseBurst(dest, t, 0.12, 700 * p, 1.2, 'bandpass', 0.55); this.noiseBurst(dest, t + 0.16, 0.18, 520 * p, 1.2, 'bandpass', 0.5); this.tone(dest, t + 0.14, 0.3, 110 * p, 70 * p, 'sawtooth', 0.12); }
        else if (death) { this.tone(dest, t, 0.9, 120 * p, 45 * p, 'sawtooth', 0.16, 0.1); this.noiseBurst(dest, t, 0.7, 300, 1, 'lowpass', 0.3); }
        else { this.tone(dest, t, hurt ? 0.25 : 0.4, (hurt ? 150 : 96) * p, (hurt ? 110 : 72) * p, 'sawtooth', 0.17, 0.04); this.noiseBurst(dest, t, 0.3, 380 * p, 1.4, 'bandpass', 0.28); }
        break;
      case 'hound':
        if (what === 'growl') { this.tone(dest, t, 0.7, 95 * p, 80 * p, 'sawtooth', 0.12, 0.05); this.noiseBurst(dest, t, 0.6, 260, 2, 'bandpass', 0.25); }
        else if (what === 'bite') { this.noiseBurst(dest, t, 0.07, 1400, 1, 'bandpass', 0.6); this.tone(dest, t, 0.08, 260, 140, 'square', 0.1); }
        else if (hurt) { this.tone(dest, t, 0.22, 900 * p, 640 * p, 'triangle', 0.14); }
        else if (death) { this.tone(dest, t, 0.6, 700 * p, 300 * p, 'triangle', 0.14); }
        else { this.tone(dest, t, 0.12, 340 * p, 190 * p, 'sawtooth', 0.16); this.noiseBurst(dest, t, 0.1, 700, 1.5, 'bandpass', 0.3); this.tone(dest, t + 0.2, 0.1, 360 * p, 200 * p, 'sawtooth', 0.12); }
        break;
      default: this.tone(dest, t, 0.1, 440, 440, 'sine', 0.1);
    }
  }

  // ------------------------------------------------------------------ weather
  private rainNodes: { src: AudioBufferSourceNode; lp: BiquadFilterNode; gain: GainNode } | null = null;

  /**
   * Continuous rain (or, in the snow, a soft wind): looping filtered noise whose
   * level follows the weather. Under a roof it is quieter and duller.
   */
  setWeather(level: number, sheltered: boolean, snow: boolean): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (!this.rainNodes) {
      if (level <= 0.001) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 250;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(lp).connect(gain).connect(this.sfx);
      src.start();
      this.rainNodes = { src, lp, gain };
    }
    const n = this.rainNodes;
    const t = ctx.currentTime;
    const target = level * (snow ? 0.07 : 0.26) * (sheltered ? 0.5 : 1);
    n.gain.gain.setTargetAtTime(target, t, 0.4);
    n.lp.frequency.setTargetAtTime(snow ? 500 : sheltered ? 900 : 3000, t, 0.3);
    if (level <= 0.001 && this.rainNodes) {
      n.gain.gain.setTargetAtTime(0, t, 0.2);
    }
  }

  stopWeather(): void {
    if (!this.rainNodes) return;
    try { this.rainNodes.src.stop(); } catch { /* already stopped */ }
    this.rainNodes.src.disconnect();
    this.rainNodes = null;
  }

  /** A thunderclap: a sharp crack followed by a long, rolling rumble. */
  thunder(volume: number, delay = 0): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, volume));
    g.connect(this.sfx);
    const t = ctx.currentTime + delay;
    if (volume > 0.5) this.noiseBurst(g, t, 0.25, 2500, 0.6, 'highpass', 0.7);
    for (let i = 0; i < 5; i++) {
      const at = t + 0.05 + i * (0.35 + Math.random() * 0.45);
      this.noiseBurst(g, at, 1.4 + Math.random() * 1.6, 120 + Math.random() * 120, 0.7, 'lowpass', 0.9 - i * 0.12, 0.6);
    }
    this.tone(g, t, 2.5, 55, 38, 'sine', 0.25, 0.08);
  }

  /** Called ~once a second: occasionally plays a short generative ambient phrase. */
  updateMusic(dt: number, night: boolean, deep = false): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || !this.musicEnabled || this.volumes.music <= 0) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 60 + Math.random() * 120;
    // the Cinderdeep (2.0): a darker mode, lower, with a slow drone underneath
    const scale = deep ? [0, 1, 5, 7, 8, 12, 13] : night ? [0, 3, 5, 7, 10, 12, 15] : [0, 2, 4, 7, 9, 12, 14];
    const root = deep ? 147 : night ? 196 : 220;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.2;
    if (deep) this.tone(this.reverb, t, 9, root / 2, root / 2 * 0.98, 'sine', 0.06, 1.5);
    const notes = 8 + Math.floor(Math.random() * 8);
    let deg = Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      deg = Math.max(0, Math.min(scale.length - 1, deg + Math.floor(Math.random() * 5) - 2));
      const f = root * Math.pow(2, scale[deg] / 12);
      const dur = 1.2 + Math.random() * 1.6;
      for (const [mult, type, g] of [[1, 'triangle', 0.12], [2, 'sine', 0.04]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(g, t + 0.04);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(gn);
        gn.connect(this.music);
        gn.connect(this.reverb);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
      if (Math.random() < 0.3) {
        const bass = root / 2 * Math.pow(2, scale[0] / 12);
        this.tone(this.reverb, t, 3, bass, bass, 'sine', 0.05, 0.3);
      }
      t += 0.45 + Math.random() * 0.9;
    }
  }
}
