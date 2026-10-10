import { Store } from '../core/store';
import type { CloudUi } from '../systems/CloudSync';

export type Screen = 'title' | 'worlds' | 'create' | 'edit' | 'loading' | 'game' | 'quit' | 'options' | 'import' | 'cloud';
export type Overlay = null | 'pause' | 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative' | 'death' | 'options' | 'advancements' | 'stats' | 'sleep' | 'runes' | 'trade' | 'sign' | 'map' | 'theend';

/** 1.8: the card shown when looking at a villager (or a Sentinel). */
export interface VillagerCard {
  name: string; title: string; activity: string;
  village: string; standing: string; standingKey: string; rep: number;
  home: boolean; child: boolean;
}
/** 1.8: the compass of a held explorer map. */
export interface MapHud { label: string; text: string; arrow: number | null; found: boolean }

export interface HudState {
  health: number;
  food: number;
  xpLevel: number;
  xpProgress: number;
  armor: number;
  air: number;
  selected: number;
  creative: boolean;
  hurtTick: number;
  regenTick: number;
  underwater: boolean;
  /** Eyes in lava / on fire (screen overlays). */
  inLava?: boolean;
  burning?: boolean;
  /** 2.0: 0..1 while standing in a Deepgate (the glow that builds before you are carried away). */
  gate?: number;
  offhand: boolean;
  /** 2.2: the gate being stood in is a Stargate (a violet glow), and gliding on Starwings. */
  gateStar?: boolean;
  gliding?: boolean;
  saturationShake: boolean;
}

export interface Toast { id: number; title: string; desc: string; icon: string; kind: 'advancement' | 'info' }
export interface ChatLine { id: number; text: string; time: number }

export interface DebugInfo {
  lines: string[];
  right: string[];
}

export interface LoadingState {
  title: string;
  stage: string;
  progress: number;  // 0..1, -1 = indeterminate
  detail: string;
}

export interface UIState {
  screen: Screen;
  overlay: Overlay;
  optionsReturn: Screen | Overlay;
  gui: number;
  hud: HudState;
  invVersion: number;
  heldName: { text: string; key: number } | null;
  /** A newer Blockfell has been downloaded and will start after a restart (1.6). */
  update: { version: string } | null;
  toasts: Toast[];
  chat: ChatLine[];
  villagerCard: VillagerCard | null;
  mapHud: MapHud | null;
  debug: DebugInfo | null;
  showDebug: boolean;
  hideHud: boolean;
  /** 0..1 fade while sleeping in a bed. */
  sleep: number;
  locked: boolean;
  lockFailed: boolean;
  loading: LoadingState;
  worldsVersion: number;
  selectedWorld: string | null;
  editWorld: string | null;
  deathMessage: string;
  score: number;
  optionsVersion: number;
  furnace: { burn: number; cook: number };
  /** Night raid bar (null when no raid). */
  raid: { label: string; progress: number } | null;
  /** 2.2: the Hollowdrake's health bar (null when it isn't about). */
  boss: { name: string; hp: number; shield: boolean; bells: number } | null;
  /** On-screen touch controls are on. */
  touch: boolean;
  /** Dropbox sync (1.9). */
  cloud: CloudUi;
  /** A world that can't be opened until the player decides (changed on two devices, or saved by a newer version). */
  syncPrompt: { id: string; kind: 'conflict' | 'newer' } | null;
  /** Where the Dropbox Sync screen returns to. */
  cloudReturn: Screen;
}

export const ui = new Store<UIState>({
  screen: 'title',
  overlay: null,
  optionsReturn: 'title',
  gui: 3,
  hud: {
    health: 20, food: 20, xpLevel: 0, xpProgress: 0, armor: 0, air: 300, selected: 0, creative: false,
    hurtTick: 0, regenTick: 0, underwater: false, offhand: false, saturationShake: false,
  },
  invVersion: 0,
  heldName: null,
  update: null,
  toasts: [],
  villagerCard: null,
  mapHud: null,
  chat: [],
  debug: null,
  showDebug: false,
  hideHud: false,
  sleep: 0,
  locked: false,
  lockFailed: false,
  loading: { title: '', stage: '', progress: -1, detail: '' },
  worldsVersion: 0,
  selectedWorld: null,
  editWorld: null,
  deathMessage: '',
  score: 0,
  optionsVersion: 0,
  furnace: { burn: 0, cook: 0 },
  raid: null,
  boss: null,
  touch: false,
  cloud: {
    available: false, why: '', hasKey: false, builtInKey: false, linked: false, account: '', busy: false, offline: false,
    relink: false, lastSync: 0, message: '', worlds: {}, remoteOnly: [],
  },
  syncPrompt: null,
  cloudReturn: 'worlds',
});

let toastId = 1;
export function pushToast(t: Omit<Toast, 'id'>): void {
  const toast = { ...t, id: toastId++ };
  ui.set((s) => ({ toasts: [...s.toasts, toast].slice(-3) }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) })), 5000);
}

let chatId = 1;
export function pushChat(text: string): void {
  const line = { id: chatId++, text, time: Date.now() };
  ui.set((s) => ({ chat: [...s.chat, line].slice(-8) }));
  setTimeout(() => ui.set((s) => ({ chat: s.chat.filter((x) => x.id !== line.id) })), 10000);
}
