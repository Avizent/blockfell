import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { GameLoop } from './GameLoop';
import { MenuPanorama } from './MenuPanorama';
import type { EngineServices } from './services';
import { WorkerPool } from '../workers/WorkerPool';
import { AudioManager } from '../systems/AudioManager';
import { Options, autoGuiScale, touchGuiScale, loadOptions, saveOptions } from '../systems/Options';
import { SaveManager, WorldRecord, DEFAULT_RULES, GameRules, OVERWORLD, type DimId } from '../systems/SaveManager';
import { hasGenerator, newestGenVersion } from '../world/generators';
import { type Arrival, DIM_NAMES } from '../world/dims';
import { ItemIcons } from '../render/ItemIcons';
import { ItemModels } from '../render/ItemModels';
import { Game } from '../game/Game';
import { ui, pushChat, pushToast, Overlay } from '../ui/uiStore';
import { backups } from '../systems/WorldBackup';
import { CloudSync } from '../systems/CloudSync';
import { GAME_VERSION, SAVE_FORMAT, WORLD_HEIGHT } from '../world/constants';
import { seedFromString } from '../core/rng';
import type { Difficulty, GameMode } from '../player/Player';
import * as B from '../world/BlockRegistry';
import { biomeName, GEN_VERSION } from '../world/TerrainGenerator';
import { setTouchBridge, wantsTouch } from './touch';

export interface NewWorldSettings {
  name: string;
  seedText: string;
  gameMode: GameMode;
  difficulty: Difficulty;
  structures: boolean;
  bonusChest: boolean;
  rules: GameRules;
}

export const BENCH_WORLD = 'Benchmark (temporary)';

/**
 * The world that was open when Blockfell last closed without Save and Quit (a phone
 * closing the app in the background, a closed tab). Kept in localStorage so the
 * next start can go straight back in. It is cleared while that world loads and set
 * again once it is ready, so a world that fails to load never traps the start-up.
 */
const RESUME_KEY = 'blockfell.resume';
function readResume(): string | null { try { return localStorage.getItem(RESUME_KEY); } catch { return null; } }
function writeResume(id: string | null): void {
  try { if (id) localStorage.setItem(RESUME_KEY, id); else localStorage.removeItem(RESUME_KEY); } catch { /* storage unavailable */ }
}

/** Asks the browser to keep Blockfell's storage even when the device runs short of space. */
function requestPersistentStorage(): void {
  const st = navigator.storage;
  // Firefox asks the player with a pop-up; everywhere else the browser decides quietly
  if (!st?.persist || /firefox/i.test(navigator.userAgent)) return;
  void st.persisted().then((p) => (p ? true : st.persist())).catch(() => false);
}
const FACING_NAMES = ['south (+Z)', 'west (-X)', 'north (-Z)', 'east (+X)'];

/**
 * Application controller: owns the long-lived services (renderer, workers, audio,
 * input, persistence), switches between the title panorama and game sessions,
 * and routes global keys / pointer lock.
 */
export class Engine implements EngineServices {
  renderer!: Renderer;
  input!: InputManager;
  pool!: WorkerPool;
  audio = new AudioManager();
  options: Options = loadOptions();
  icons!: ItemIcons;
  models!: ItemModels;
  saves = new SaveManager();
  /** Dropbox sync (1.9). */
  cloud = new CloudSync({
    saves: this.saves,
    openWorldId: () => this.game?.record.id ?? this.openingWorld,
    ignored: (rec) => rec.name === BENCH_WORLD,
  });
  /** A world being checked against Dropbox before it loads. */
  private openingWorld: string | null = null;
  loop!: GameLoop;
  game: Game | null = null;
  panorama: MenuPanorama | null = null;
  private loadingGame = false;
  private busy = false;

  init(container: HTMLElement): void {
    this.renderer = new Renderer(container);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.options.renderScale);
    this.input = new InputManager(this.renderer.canvas);
    this.pool = new WorkerPool();
    this.icons = new ItemIcons(this.renderer.atlas);
    this.models = new ItemModels(this.renderer.atlas, this.icons);
    this.applyTouchMode();
    window.addEventListener('resize', () => this.applyGuiScale());
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onKey = (code, e) => this.onKey(code, e);
    this.renderer.canvas.addEventListener('mousedown', () => {
      this.audio.unlock();
      const s = ui.get();
      if (s.screen === 'game' && s.overlay === null && !this.input.locked && !this.input.allowUnlocked) this.input.requestLock();
    });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    // on phones only the end of a tap counts as a user gesture for starting sound
    window.addEventListener('pointerup', () => this.audio.unlock(), { capture: true });
    window.addEventListener('touchend', () => this.audio.unlock(), { capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true });
    this.applyAudio();
    this.loop = new GameLoop(() => this.tick(), (dt, a) => this.frame(dt, a));
    this.panorama = new MenuPanorama(this.renderer, this.pool);
    this.loop.start();
    void this.saves.open().then(async () => {
      await backups.load(this.saves);
      // clean up a benchmark world left behind by an interrupted #bench run
      if (location.hash !== '#bench') {
        for (const w of await this.saves.listWorlds()) if (w.name === BENCH_WORLD) await this.saves.deleteWorld(w.id);
      }
      ui.set((s) => ({ worldsVersion: s.worldsVersion + 1 }));
      if (this.saves.upgraded.length) {
        const n = this.saves.upgraded.length;
        pushToast({ kind: 'info', icon: 'chest', title: `Updated for Blockfell ${GAME_VERSION}`, desc: n === 1 ? this.saves.upgraded[0] : `${n} worlds (old copies kept)` });
      }
      if (this.saves.upgradeFailed.length) pushToast({ kind: 'info', icon: 'bedrock', title: 'A world could not be updated', desc: this.saves.upgradeFailed.join(', ') });
      await this.cloud.init();
      if (!(await this.resumeLastWorld())) void this.cloud.syncAll();
    });
    // Chunk streaming must not depend on the frame rate: when the page is occluded
    // or rendering is slow, keep feeding the workers from a timer as well.
    setInterval(() => this.backgroundPump(), 100);
    window.addEventListener('beforeunload', () => { if (this.game) void this.game.save(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || !this.game) return;
      void this.game.save({ urgent: true });   // and straight up to Dropbox, if linked
      // switching apps on a phone pauses the game, like losing the mouse on a computer
      const s = ui.get();
      if (this.input.touchMode && s.screen === 'game' && s.overlay === null && !this.game.player.dead) this.openOverlay('pause');
    });
  }

  private backgroundPump(): void {
    const g = this.game;
    if (g && (this.loadingGame || ui.get().screen === 'game')) {
      if (performance.now() - this.lastFrame > 150) g.chunks.update(g.player.x, g.player.z, null);
    }
  }

  // ------------------------------------------------------------------ gui scale
  /** Turns the on-screen touch controls on or off (Options, or automatically on phones and tablets). */
  applyTouchMode(): void {
    const on = wantsTouch(this.options.touchControls);
    const was = this.input.touchMode;
    this.input.touchMode = on;
    if (on) { this.input.allowUnlocked = true; this.input.exitLock(); }
    else if (was) { this.input.allowUnlocked = false; this.input.sneakLatch = false; this.input.stick = null; }
    setTouchBridge(on);
    document.documentElement.classList.toggle('touch', on);
    ui.set({ touch: on });
    this.applyGuiScale();
    this.updateFocus();
  }

  applyGuiScale(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const auto = this.input?.touchMode ? touchGuiScale(w, h) : autoGuiScale(w, h);
    const s = this.options.guiScale > 0 ? Math.min(this.options.guiScale, auto) : auto;
    document.documentElement.style.fontSize = s + 'px';
    this.icons?.build(s * Math.min(2, window.devicePixelRatio || 1));
    ui.set({ gui: s, optionsVersion: ui.get().optionsVersion + 1 });
  }

  applyAudio(): void {
    this.audio.volumes.master = this.options.masterVolume;
    this.audio.volumes.music = this.options.musicVolume;
    this.audio.volumes.sfx = this.options.soundVolume;
    this.audio.setMusic(this.options.music);
    this.audio.setEnabled(this.options.sound);
    this.audio.applyVolumes();
  }

  /** The Sound switch (Options, pause menu, M key in a world). */
  toggleSound(announce = false): void {
    const on = !this.options.sound;
    this.setOption('sound', on);
    if (on) this.audio.play('click', undefined, undefined, undefined, 0.5);
    if (announce) pushChat(on ? 'Sound on' : 'Sound off - press M to turn it back on');
  }

  setOption<K extends keyof Options>(key: K, value: Options[K]): void {
    this.options = { ...this.options, [key]: value };
    saveOptions(this.options);
    const g = this.game;
    switch (key) {
      case 'renderDistance': if (g) g.chunks.renderDistance = value as number; break;
      case 'simulationDistance': if (g) g.entities.simulationDistance = (value as number) * 16; break;
      case 'guiScale': this.applyGuiScale(); break;
      case 'renderScale': this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * (value as number)); break;
      case 'masterVolume': case 'musicVolume': case 'soundVolume': case 'sound': case 'music': this.applyAudio(); break;
      case 'greedyMeshing': if (g) { g.chunks.greedy = value as boolean; g.chunks.invalidateAll(); } break;
      case 'touchControls': this.applyTouchMode(); break;
    }
    ui.set((s) => ({ optionsVersion: s.optionsVersion + 1 }));
  }

  // ------------------------------------------------------------------ loop
  private tick(): void {
    if (this.game && ui.get().screen === 'game') this.game.tick();
  }

  private lastFrame = 0;

  private frame(dt: number, alpha: number): void {
    this.lastFrame = performance.now();
    const s = ui.get();
    if (this.game && this.loadingGame) {
      const p = this.game.player;
      this.game.chunks.update(p.x, p.z, null);
      const { ready, total } = this.game.loadingProgress();
      const st = this.game.chunks.stats;
      ui.set({
        loading: {
          title: this.loadingTitle, stage: ready < total ? 'Building terrain' : 'Preparing spawn area',
          progress: total ? ready / total : 0,
          detail: `${st.totalGenerated} chunks generated · ${ready} / ${total} spawn chunks meshed`,
        },
      });
      if (ready >= total) this.finishLoading();
      return;
    }
    if (this.game && s.screen === 'game') {
      this.game.paused = s.overlay === 'pause' || s.overlay === 'options' || s.overlay === 'advancements' || s.overlay === 'stats';
      this.game.frame(dt, alpha);
      return;
    }
    if (this.panorama) this.panorama.frame(dt);
  }

  // ------------------------------------------------------------------ worlds
  async listWorlds(): Promise<WorldRecord[]> {
    return this.saves.listWorlds();
  }

  /** The world played most recently (for Continue), not counting the benchmark world. */
  async lastWorld(): Promise<WorldRecord | null> {
    return (await this.saves.listWorlds()).find((w) => w.name !== BENCH_WORLD) ?? null;
  }

  /** At start-up: back into the world that was open when Blockfell closed (Options: Reopen Last World). */
  async resumeLastWorld(): Promise<boolean> {
    const id = readResume();
    if (!id || !this.options.reopenLastWorld || location.hash === '#bench' || this.game || ui.get().screen !== 'title') return false;
    const rec = await this.saves.getWorld(id);
    writeResume(null);   // set again once the world is ready (see finishLoading)
    if (!rec || rec.name === BENCH_WORLD) return false;
    await this.playWorld(id);
    return true;
  }

  /** Remembers that a world was just exported or backed up (for the reminder in the world list). */
  async markBackedUp(id: string): Promise<void> {
    const rec = await this.saves.getWorld(id);
    if (!rec) return;
    rec.lastBackup = Date.now();
    await this.saves.putWorld(rec);
    ui.set((s) => ({ worldsVersion: s.worldsVersion + 1 }));
  }

  async createWorld(set: NewWorldSettings): Promise<void> {
    if (this.busy) return;
    const now = Date.now();
    const rec: WorldRecord = {
      id: 'w' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: set.name.trim() || 'New World',
      seed: seedFromString(set.seedText),
      seedText: set.seedText,
      gameMode: set.gameMode,
      difficulty: set.difficulty,
      structures: set.structures,
      bonusChest: set.bonusChest,
      rules: { ...DEFAULT_RULES, ...set.rules },
      created: now,
      lastPlayed: now,
      version: GAME_VERSION,
      genVersion: GEN_VERSION,
      format: SAVE_FORMAT,
      time: 1000,
      day: 0,
      stats: {},
      advancements: [],
    };
    await this.saves.putWorld(rec);
    await this.playWorld(rec.id);
  }

  /** Title of the loading screen while a world (or another dimension of it) loads. */
  private loadingTitle = 'Loading world';

  /**
   * 2.0: carries the player into another dimension of the open world - through a
   * Deepgate, or home to the surface after dying in the Cinderdeep. The world is
   * saved with the player in the new dimension, then that landscape is loaded like a
   * world is (its own chunks, chests and creatures) and the player arrives.
   */
  async changeDimension(target: DimId, arrival: Arrival): Promise<void> {
    const g = this.game;
    if (!g || this.busy || !hasGenerator(target) || target === g.dim) return;
    this.busy = true;
    try {
      const title = target === OVERWORLD
        ? (arrival.kind === 'respawn' ? 'Waking up on the surface' : arrival.kind === 'home' ? 'Going home' : 'Returning to the surface')
        : target === 'starhollow' ? 'Entering the Starhollow' : 'Entering the Cinderdeep';
      this.loadingTitle = title;
      ui.set({ screen: 'loading', overlay: null, loading: { title, stage: 'Saving', progress: -1, detail: g.record.name } });
      this.input.exitLock();
      g.leaveFor(target, arrival);
      await g.save();
      const rec = g.record;
      g.dispose();
      this.game = null;
      (window as unknown as Record<string, unknown>).__game = null;
      this.pool.clearPending();
      if (target !== OVERWORLD) {
        const now = Date.now();
        rec.dims = { ...(rec.dims ?? {}) };
        const info = rec.dims[target] ?? { genVersion: newestGenVersion(target), firstVisit: now };
        rec.dims[target] = { ...info, lastVisit: now };
        await this.saves.putWorld(rec);
      }
      ui.set({ loading: { title, stage: 'Reading save data', progress: -1, detail: rec.name } });
      const deltas = await this.saves.loadDeltas(rec.id, target);
      const extra = await this.saves.getExtra(rec.id, target);
      this.game = new Game(this, rec, deltas, extra, target, arrival);
      this.loadingGame = true;
      (window as unknown as Record<string, unknown>).__game = this.game;
    } finally {
      this.busy = false;
    }
  }

  async playWorld(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let rec = await this.saves.getWorld(id);
      if (!rec) return;
      if (this.cloud.active && rec.name !== BENCH_WORLD) {
        // bring the world up to date from Dropbox first (it may have been played on another device)
        this.openingWorld = id;   // (until the game exists: a background sync must not replace it meanwhile)
        ui.set({ screen: 'loading', overlay: null, loading: { title: 'Loading world', stage: 'Checking Dropbox', progress: -1, detail: rec.name } });
        const out = await this.cloud.prepareToPlay(id);
        if (out === 'conflict' || out === 'newer') {
          ui.set({ screen: 'worlds', selectedWorld: id, syncPrompt: { id, kind: out } });
          return;
        }
        if (out === 'offline') pushToast({ kind: 'info', icon: 'bedrock', title: 'Dropbox not reached', desc: 'Playing the copy on this device' });
        if (out === 'downloaded') pushToast({ kind: 'info', icon: 'chest', title: 'Updated from Dropbox', desc: rec.name });
        rec = await this.saves.getWorld(id);
        if (!rec) return;
      }
      if ((rec.format ?? 1) < SAVE_FORMAT) {
        // conversion failed at start-up (see SaveManager.upgradeAll): opening it now would lose its changes
        pushToast({ kind: 'info', icon: 'bedrock', title: 'This world could not be updated', desc: 'Export it and send the file for help' });
        return;
      }
      const dim = playerDim(rec);
      this.loadingTitle = dim === OVERWORLD ? 'Loading world' : `Loading world: ${DIM_NAMES[dim]}`;
      ui.set({ screen: 'loading', overlay: null, loading: { title: this.loadingTitle, stage: 'Reading save data', progress: -1, detail: rec.name } });
      this.panorama?.dispose();
      this.panorama = null;
      this.pool.clearPending();
      const deltas = await this.saves.loadDeltas(id, dim);
      const extra = await this.saves.getExtra(id, dim);
      this.game = new Game(this, rec, deltas, extra, dim);
      this.loadingGame = true;
      (window as unknown as Record<string, unknown>).__game = this.game;
    } finally {
      this.busy = false;
      this.openingWorld = null;
    }
  }

  private finishLoading(): void {
    const g = this.game!;
    this.loadingGame = false;
    g.begin();
    ui.set({ screen: 'game', overlay: g.player.dead ? 'death' : null });
    this.input.releaseAll();
    this.updateFocus();
    if (!g.player.dead) this.input.requestLock();
    void g.save({ quiet: true });
    if (g.record.name !== BENCH_WORLD) writeResume(g.record.id);
    requestPersistentStorage();
  }

  async saveAndQuit(): Promise<void> {
    const g = this.game;
    if (!g) return;
    // Ask for folder permission first, while the click that triggered this still counts
    // as a user gesture (the browser may show a one-off "allow editing" prompt).
    const backupWanted = backups.supported && !!backups.handle && backups.autoBackup && g.record.name !== BENCH_WORLD;
    const backupAllowed = backupWanted ? backups.permission(true) : Promise.resolve(false);
    ui.set({ screen: 'loading', overlay: null, loading: { title: 'Saving world', stage: 'Saving chunks', progress: -1, detail: g.record.name } });
    this.input.exitLock();
    writeResume(null);   // quit on purpose: the next start shows the title screen
    await g.save();
    if (this.cloud.active && g.record.name !== BENCH_WORLD) {
      ui.set((s) => ({ loading: { ...s.loading, stage: 'Saving to Dropbox' } }));
      const out = await Promise.race([
        this.cloud.pushWorld(g.record.id, false),
        new Promise<'slow'>((r) => setTimeout(() => r('slow'), 25000)),
      ]);
      if (out === 'offline' || out === 'slow') pushToast({ kind: 'info', icon: 'bedrock', title: 'Saved on this device', desc: 'It will go to Dropbox when you are back online' });
      else if (out === 'conflict') pushToast({ kind: 'info', icon: 'bedrock', title: 'Not sent to Dropbox', desc: 'Changed on another device too: choose a copy in the world list' });
      else if (out === 'relink') pushToast({ kind: 'info', icon: 'bedrock', title: 'Not sent to Dropbox', desc: 'The Dropbox link has expired: link again' });
      else if (out === 'error') pushToast({ kind: 'info', icon: 'bedrock', title: 'Dropbox upload failed', desc: 'Saved on this device; it will try again' });
    }
    if (backupWanted) {
      if (await backupAllowed) {
        ui.set((s) => ({ loading: { ...s.loading, stage: `Backing up to ${backups.folderName}` } }));
        try {
          const file = await backups.exportWorld(g.record.id);
          await this.markBackedUp(g.record.id);
          pushToast({ kind: 'info', icon: 'chest', title: 'World backed up', desc: `${backups.folderName}/${file}` });
        } catch (e) {
          console.warn('backup failed', e);
          pushToast({ kind: 'info', icon: 'bedrock', title: 'Backup failed', desc: 'Choose the folder again in Import World' });
        }
      } else {
        pushToast({ kind: 'info', icon: 'bedrock', title: 'Not backed up', desc: `No permission for ${backups.folderName}` });
      }
    }
    g.dispose();
    this.game = null;
    (window as unknown as Record<string, unknown>).__game = null;
    this.pool.clearPending();
    this.panorama = new MenuPanorama(this.renderer, this.pool);
    ui.set((s) => ({ screen: 'title', overlay: null, worldsVersion: s.worldsVersion + 1 }));
    this.updateFocus();
    void this.cloud.refreshUi();
  }

  /** Deletes a world here, or here and in Dropbox (`everywhere`; throws if Dropbox can't be reached). */
  async deleteWorld(id: string, everywhere = false): Promise<void> {
    if (this.cloud.active || everywhere) await this.cloud.deleteWorld(id, everywhere);
    if (readResume() === id) writeResume(null);
    await this.saves.deleteWorld(id);
    ui.set((s) => ({ worldsVersion: s.worldsVersion + 1, selectedWorld: null }));
    void this.cloud.refreshUi();
  }

  /** The game saved its world (autosave, leaving the app, Save and Quit). */
  worldSaved(id: string, urgent: boolean): void {
    if (this.game?.record.name === BENCH_WORLD) return;
    this.cloud.noteSaved(id, urgent);
  }

  // ------------------------------------------------------------------ overlays & focus
  updateFocus(): void {
    const s = ui.get();
    const inGame = s.screen === 'game' && s.overlay === null && !!this.game && !this.game.player.dead;
    this.input.gameFocus = inGame && (this.input.locked || this.input.allowUnlocked);
    if (!inGame) this.input.releaseAll();
  }

  openOverlay(o: Overlay): void {
    if (o === null) { this.closeOverlay(); return; }
    ui.set({ overlay: o });
    this.input.exitLock();
    this.updateFocus();
  }

  /** 2.2: the End screen, after the Hollowdrake is beaten (it shows once per world). */
  showTheEnd(): void {
    this.input.exitLock();
    this.input.releaseAll();
    ui.set({ overlay: 'theend', boss: null });
    this.audio.play('drake_victory', undefined, undefined, undefined, 0.8);
  }

  /** The End screen is over (or skipped): home to the bed or spawn point. */
  finishTheEnd(): void {
    const g = this.game;
    if (!g || ui.get().overlay !== 'theend') return;
    if (g.record.star) g.record.star.seenEnd = true;
    ui.set({ overlay: null });
    void this.changeDimension(OVERWORLD, { kind: 'home', note: 'You are home again. The stars are shining a little brighter.' });
  }

  closeOverlay(): void {
    const s = ui.get();
    if (s.overlay === 'theend') { this.finishTheEnd(); return; }
    if (this.game && (s.overlay === 'inventory' || s.overlay === 'creative' || s.overlay === 'crafting' || s.overlay === 'furnace' || s.overlay === 'chest' || s.overlay === 'runes' || s.overlay === 'trade')) {
      this.game.closeScreen();
    }
    if (this.game && s.overlay === 'sleep') { ui.set({ overlay: null }); this.game.wake(false); }
    if (this.game && s.overlay === 'sign') this.game.finishSign();
    ui.set({ overlay: null });
    this.input.releaseAll();
    if (this.game && !this.game.player.dead) this.input.requestLock();
    this.updateFocus();
  }

  openBlockScreen(x: number, y: number, z: number, kind: 'crafting' | 'furnace' | 'chest' | 'runes'): void {
    if (!this.game) return;
    this.game.openBlockUI(x, y, z, kind);
    this.input.exitLock();
    this.updateFocus();
  }

  /** Opens the text editor for the sign at (x, y, z). */
  openSignEditor(x: number, y: number, z: number): void {
    if (!this.game) return;
    this.game.signPos = { x, y, z };
    this.openOverlay('sign');
  }

  openTrade(v: import('../entities/Villager').Villager): void {
    if (!this.game) return;
    this.game.openTrade(v);
    this.input.exitLock();
    this.updateFocus();
  }

  openInventory(): void {
    if (!this.game) return;
    this.game.openInventory();
    this.input.exitLock();
    this.updateFocus();
  }

  private lastLockChange = 0;

  private onLockChange(locked: boolean): void {
    this.lastLockChange = performance.now();
    const s = ui.get();
    ui.set({ locked, lockFailed: this.input.lockFailed });
    if (!locked && s.screen === 'game' && s.overlay === null && this.game && !this.game.player.dead && !this.input.allowUnlocked) {
      // the browser released the mouse (Esc / tab switch): pause like the reference game
      ui.set({ overlay: 'pause' });
    }
    this.updateFocus();
  }

  private onKey(code: string, e: KeyboardEvent): boolean | void {
    const s = ui.get();
    if (s.screen !== 'game' || !this.game) return false;
    if (e.repeat && code !== 'F3') return false;
    const o = s.overlay;
    const containerOpen = o === 'inventory' || o === 'creative' || o === 'crafting' || o === 'furnace' || o === 'chest' || o === 'runes' || o === 'trade' || o === 'map';
    if (code === 'Escape') {
      if (o === 'death') return true;
      // the Esc press that released pointer lock already opened the pause menu
      if (o === 'pause' && performance.now() - this.lastLockChange < 250) return true;
      if (o === 'options' || o === 'advancements' || o === 'stats') { ui.set({ overlay: 'pause' }); return true; }
      if (o !== null) { this.closeOverlay(); return true; }
      this.openOverlay('pause');
      return true;
    }
    if (code === 'KeyE') {
      if (containerOpen) { this.closeOverlay(); return true; }
      if (o === null && !this.game.player.dead) { this.openInventory(); return true; }
      return false;
    }
    if (code === 'F3') { if (!e.repeat) ui.set({ showDebug: !s.showDebug }); if (!s.showDebug) this.updateDebug(this.game); return true; }
    if (code === 'F1') { ui.set({ hideHud: !s.hideHud }); return true; }
    if (code === 'KeyM') { this.toggleSound(true); return true; }
    return false;
  }

  // ------------------------------------------------------------------ debug overlay
  updateDebug(g: Game): void {
    const p = g.player;
    const r = this.renderer;
    const cs = g.chunks.stats;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const yawDeg = ((((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const facing = FACING_NAMES[Math.round(((yawDeg + 180) % 360) / 90) % 4];
    const light = g.world.getLight(bx, Math.min(WORLD_HEIGHT - 1, Math.floor(p.eyeY)), bz);
    const col = g.world.generator.column(bx, bz);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const t = g.target;
    const info = r.gl.info;
    const lines = [
      `Blockfell ${GAME_VERSION}`,
      `${this.loop.fps} fps (frame ${this.loop.frameMs.toFixed(1)} ms, worst ${this.loop.worstFrameMs.toFixed(0)} ms)`,
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Block: ${bx} ${by} ${bz}  Chunk: ${bx >> 4} ${bz >> 4} [${bx & 15} ${bz & 15}]  Dimension: ${g.dim}`,
      `Facing: ${facing} (${yawDeg.toFixed(1)} / ${((p.pitch * 180) / Math.PI).toFixed(1)})`,
      `Velocity: ${(p.vx * 20).toFixed(2)} ${(p.vy * 20).toFixed(2)} ${(p.vz * 20).toFixed(2)} m/s`,
      `Light: sky ${light >> 4} block ${light & 15}  Biome: ${biomeName(col.biome)}`,
      `Seed: ${g.world.seed}  Day ${g.dayNight.day} time ${g.dayNight.timeOfDay}`,
      `Weather: ${g.weather.kind} (rain ${g.weather.rain.toFixed(2)}, thunder ${g.weather.thunder.toFixed(2)}, ${Math.ceil(g.weather.timer / 20)} s left)`,
      `Chunks: ${cs.loaded} loaded, ${cs.meshed} meshed, ${cs.visible} visible (rd ${g.chunks.renderDistance})`,
      `Queues: gen ${cs.genQueued}, mesh ${cs.meshQueued}, in flight ${cs.inflight} (${this.pool.size} workers)`,
      `Timing: gen ${cs.genMs.toFixed(1)} ms, light ${cs.lightMs.toFixed(1)} ms, mesh ${cs.meshMs.toFixed(1)} ms`,
      `Draw calls: ${r.lastDrawCalls}  Triangles: ${r.lastTriangles.toLocaleString()}`,
      `Visible verts: ${cs.vertices.toLocaleString()}  Greedy: ${g.chunks.greedy ? 'on' : 'off'} (last ${cs.lastMeshFaces} faces -> ${cs.lastMeshQuads} quads)`,
      `Entities: ${g.entities.list.length} (${g.entities.mobCount} mobs)  Particles: ${g.particles.count}`,
    ];
    const right = [
      `GPU: ${info.memory.geometries} geometries, ${info.memory.textures} textures`,
      `Chunk geometries: ${cs.geometries}  Unloaded total: ${cs.totalUnloaded}`,
      mem ? `JS heap: ${(mem.usedJSHeapSize / 1048576).toFixed(0)} / ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : 'JS heap: n/a (browser)',
      `Generated: ${cs.totalGenerated}  Meshed: ${cs.totalMeshed}`,
      `Render scale: ${r.gl.getPixelRatio().toFixed(2)}  ${window.innerWidth}x${window.innerHeight}`,
      (() => { const a = this.audio.status(); return `Sound: ${a.enabled ? 'on' : 'off'}, music ${a.music ? 'on' : 'off'} (audio ${a.state}, ${a.played} sounds)`; })(),
      t ? `Targeted: ${B.getBlock(t.block).name} @ ${t.x} ${t.y} ${t.z}` : 'Targeted: -',
      t ? `Face: ${['east', 'west', 'up', 'down', 'south', 'north'][t.face] ?? '-'}  dist ${t.dist.toFixed(2)}` : '',
    ];
    ui.set({ debug: { lines, right } });
  }

  quitGame(): void {
    ui.set({ screen: 'quit' });
    try { window.close(); } catch { /* not allowed for user-opened tabs */ }
  }

  notify(text: string): void {
    pushChat(text);
  }
}

export const engine = new Engine();

/** The dimension a saved player is in (overworld when unknown or not available in this Blockfell). */
function playerDim(rec: WorldRecord): DimId {
  const d = rec.player?.dim;
  return d && hasGenerator(d) ? d : OVERWORLD;
}
