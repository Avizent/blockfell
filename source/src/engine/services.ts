import type { Renderer } from './Renderer';
import type { InputManager } from './InputManager';
import type { WorkerPool } from '../workers/WorkerPool';
import type { AudioManager } from '../systems/AudioManager';
import type { Options } from '../systems/Options';
import type { ItemIcons } from '../render/ItemIcons';
import type { ItemModels } from '../render/ItemModels';
import type { SaveManager } from '../systems/SaveManager';
import type { Game } from '../game/Game';

/** Services the engine provides to a running game session. */
export interface EngineServices {
  renderer: Renderer;
  input: InputManager;
  pool: WorkerPool;
  audio: AudioManager;
  options: Options;
  icons: ItemIcons;
  models: ItemModels;
  saves: SaveManager;
  openBlockScreen(x: number, y: number, z: number, kind: 'crafting' | 'furnace' | 'chest' | 'runes'): void;
  openTrade(v: import('../entities/Villager').Villager): void;
  openSignEditor(x: number, y: number, z: number): void;
  closeOverlay(): void;
  updateDebug(game: Game): void;
}
