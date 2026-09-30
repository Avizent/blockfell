import { Store } from '../core/store';

export type Screen = 'title' | 'worlds' | 'create' | 'edit' | 'loading' | 'game' | 'quit' | 'options' | 'import';
export type Overlay = null | 'pause' | 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative' | 'death' | 'options' | 'advancements' | 'stats' | 'sleep' | 'runes' | 'trade' | 'sign';

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
  offhand: boolean;
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
  /** On-screen touch controls are on. */
  touch: boolean;
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
  touch: false,
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
