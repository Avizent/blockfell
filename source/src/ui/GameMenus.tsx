import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/Engine';
import { restartForUpdate } from '../engine/offline';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import { Button, ItemIcon, Slider, Title } from './widgets';
import { ADVANCEMENTS, STAT_LABELS, formatStat } from '../systems/Progress';
import type { Difficulty } from '../player/Player';
import type { WeatherKind } from '../systems/WeatherSystem';
import { mapImage, MAP_PX, MAP_SCALE, compassName } from '../render/mapImage';

const WEATHER_NAMES: Record<WeatherKind, string> = { clear: 'Clear', rain: 'Rain', thunder: 'Thunderstorm' };

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'], ['Mouse', 'Look around'], ['Space', 'Jump / swim up (double-tap: fly in Creative)'],
  ['Left Ctrl or double-tap W', 'Sprint'], ['Left Shift', 'Sneak / fly down'], ['Left mouse', 'Mine / attack'],
  ['Right mouse', 'Place block / use item / open'], ['Middle mouse', 'Pick block'], ['1 - 9, mouse wheel', 'Select hotbar slot'],
  ['E', 'Inventory'], ['Q (Ctrl+Q)', 'Drop item (whole stack)'], ['F', 'Swap item to off-hand'],
  ['Esc', 'Pause menu'], ['M', 'Sound on / off'], ['F1', 'Hide HUD'], ['F3', 'Debug / performance overlay'],
  ['In inventories', 'Shift-click moves, right-click splits, drag spreads, double-click collects, 1-9 swaps'],
  ['Touch: left thumb', 'Joystick - walk; push past the rim to sprint'],
  ['Touch: right thumb', 'Drag to look; tap to use or place (tap a creature to attack); hold to mine'],
  ['Touch: buttons', 'Jump (double-tap: fly), Sneak on/off, Inventory, Pause; tap a hotbar slot, hold to drop'],
];

function ControlsPanel({ onDone, inGame }: { onDone: () => void; inGame: boolean }) {
  return (
    <div className={'screen' + (inGame ? '' : ' dirt-bg')}>
      {inGame && <div className="overlay-dim" />}
      <div className="menu-header" style={{ position: 'relative' }}><Title>Controls</Title></div>
      <div className="col" style={{ position: 'relative', gap: 0, overflowY: 'auto' }}>
        {CONTROLS.map(([k, v]) => (
          <div key={k} className="stat-row" style={{ width: '330rem' }}><span className="yellow">{k}</span><span className="shadow" style={{ textAlign: 'right', maxWidth: '200rem', whiteSpace: 'normal' }}>{v}</span></div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div className="menu-footer" style={{ position: 'relative' }}><Button onClick={onDone}>Done</Button></div>
    </div>
  );
}

export function OptionsScreen() {
  useStore(ui, (s) => s.optionsVersion);
  const [controls, setControls] = useState(false);
  const from = useStore(ui, (s) => s.optionsReturn);
  const inGame = useStore(ui, (s) => s.screen === 'game');
  const touchNow = useStore(ui, (s) => s.touch);
  const o = engine.options;
  const set = engine.setOption.bind(engine);
  const g = engine.game;
  const back = () => (inGame ? ui.set({ overlay: 'pause' }) : ui.set({ screen: (from as 'title') ?? 'title' }));
  const onOff = (b: boolean) => (b ? 'ON' : 'OFF');
  const diffs: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];
  if (controls) return <ControlsPanel onDone={() => setControls(false)} inGame={inGame} />;
  return (
    <div className={'screen' + (inGame ? '' : ' dirt-bg')} data-testid="options-screen">
      {inGame && <div className="overlay-dim" />}
      <div className="menu-header" style={{ position: 'relative' }}><Title>Options</Title></div>
      <div className="options-scroll" style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center', width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150rem 150rem', gap: '4rem 8rem', marginTop: '6rem', alignContent: 'start', paddingBottom: '6rem' }}>
        <Slider value={o.fov} min={30} max={110} onChange={(v) => set('fov', v)} label={`FOV: ${o.fov === 70 ? 'Normal' : o.fov}`} />
        <Slider value={o.renderDistance} min={2} max={16} onChange={(v) => set('renderDistance', v)} label={`Render Distance: ${o.renderDistance} chunks`} />
        <Slider value={o.sensitivity} min={0} max={1} step={0.01} onChange={(v) => set('sensitivity', v)} label={`Sensitivity: ${Math.round(o.sensitivity * 200)}%`} />
        <Slider value={o.simulationDistance} min={4} max={12} onChange={(v) => set('simulationDistance', v)} label={`Simulation: ${o.simulationDistance} chunks`} />
        <Slider value={o.brightness} min={0} max={1} step={0.01} onChange={(v) => set('brightness', v)} label={`Brightness: ${o.brightness === 0 ? 'Moody' : o.brightness === 1 ? 'Bright' : Math.round(o.brightness * 100) + '%'}`} />
        <Button size="small" onClick={() => set('guiScale', (o.guiScale + 1) % 5)}>GUI Scale: {o.guiScale === 0 ? 'Auto' : o.guiScale}</Button>
        <Button size="small" onClick={() => set('viewBobbing', !o.viewBobbing)}>View Bobbing: {onOff(o.viewBobbing)}</Button>
        <Button size="small" onClick={() => set('clouds', !o.clouds)}>Clouds: {onOff(o.clouds)}</Button>
        <Slider value={o.renderScale} min={0.5} max={1} step={0.05} onChange={(v) => set('renderScale', v)} label={`Render Scale: ${Math.round(o.renderScale * 100)}%`} />
        <Button size="small" onClick={() => set('invertY', !o.invertY)}>Invert Mouse: {onOff(o.invertY)}</Button>
        <Button size="small" testId="btn-sound" title="Switch all sound on or off (M in a world)" onClick={() => engine.toggleSound()}>Sound: {onOff(o.sound)}</Button>
        <Button size="small" testId="btn-music" title="Switch the music on or off; sound effects carry on" onClick={() => set('music', !o.music)}>Music: {onOff(o.music)}</Button>
        <Slider value={o.masterVolume} min={0} max={1} step={0.01} onChange={(v) => set('masterVolume', v)} label={o.sound ? `Master Volume: ${Math.round(o.masterVolume * 100)}%` : 'Master Volume: Sound OFF'} />
        <Slider value={o.musicVolume} min={0} max={1} step={0.01} onChange={(v) => set('musicVolume', v)} label={o.music ? `Music Volume: ${Math.round(o.musicVolume * 100)}%` : 'Music Volume: Music OFF'} />
        <Slider value={o.soundVolume} min={0} max={1} step={0.01} onChange={(v) => set('soundVolume', v)} label={`Sound Effects: ${Math.round(o.soundVolume * 100)}%`} />
        <Button size="small" onClick={() => set('greedyMeshing', !o.greedyMeshing)} title="Engine benchmark toggle">Greedy Meshing: {onOff(o.greedyMeshing)}</Button>
        <Button size="small" testId="btn-touch-controls" title="On-screen joystick and buttons for phones and tablets"
          onClick={() => set('touchControls', o.touchControls === 'auto' ? 'on' : o.touchControls === 'on' ? 'off' : 'auto')}>
          Touch Controls: {o.touchControls === 'auto' ? `Auto (${touchNow ? 'On' : 'Off'})` : o.touchControls === 'on' ? 'On' : 'Off'}
        </Button>
        <Button size="small" testId="btn-reopen-last" title="If Blockfell closes while you are in a world, open straight back into it next time"
          onClick={() => set('reopenLastWorld', !o.reopenLastWorld)}>Reopen Last World: {onOff(o.reopenLastWorld)}</Button>
        <Button size="small" onClick={() => setControls(true)}>Controls...</Button>
        {!inGame && <Button size="small" testId="btn-options-dropbox" title="Keep your worlds in Dropbox and play them on your other devices"
          onClick={() => ui.set({ screen: 'cloud', cloudReturn: 'options' })}>Dropbox Sync...</Button>}
        {g && (
          <>
            <Button size="small" onClick={() => { g.difficulty = diffs[(diffs.indexOf(g.difficulty) + 1) % 4]; ui.set((s) => ({ optionsVersion: s.optionsVersion + 1 })); }}>
              Difficulty: {g.difficulty[0].toUpperCase() + g.difficulty.slice(1)}
            </Button>
            <Button size="small" onClick={() => { g.setGameMode(g.player.creative ? 'survival' : 'creative'); ui.set((s) => ({ optionsVersion: s.optionsVersion + 1 })); }}>
              Game Mode: {g.player.creative ? 'Creative' : 'Survival'}
            </Button>
            <Button size="small" testId="btn-weather" disabled={!g.player.creative} title={g.player.creative ? 'Change the weather now' : 'Creative mode only'}
              onClick={() => { const k: WeatherKind[] = ['clear', 'rain', 'thunder']; g.setWeather(k[(k.indexOf(g.weather.kind) + 1) % 3]); ui.set((s) => ({ optionsVersion: s.optionsVersion + 1 })); }}>
              Weather: {WEATHER_NAMES[g.weather.kind]}
            </Button>
            <Button size="small" onClick={() => { g.rules.doWeatherCycle = !g.rules.doWeatherCycle; ui.set((s) => ({ optionsVersion: s.optionsVersion + 1 })); }}>
              Weather Cycle: {onOff(g.rules.doWeatherCycle)}
            </Button>
          </>
        )}
      </div>
      </div>
      <div className="menu-footer" style={{ position: 'relative' }}><Button testId="btn-options-done" onClick={back}>Done</Button></div>
    </div>
  );
}

/** The Sound switch on the pause menu, so it is one tap away on a phone or tablet. */
function SoundButton() {
  useStore(ui, (s) => s.optionsVersion);
  return <Button size="half" testId="btn-pause-sound" title="Switch all sound on or off (M)" onClick={() => engine.toggleSound()}>Sound: {engine.options.sound ? 'ON' : 'OFF'}</Button>;
}

/** 2.0.1: a newer Blockfell is waiting: save the world and start it, from inside the game. */
function PauseUpdate() {
  const upd = useStore(ui, (s) => s.update);
  if (!upd) return null;
  return (
    <Button size="wide" testId="btn-pause-update" onClick={async () => { await engine.saveAndQuit(); restartForUpdate(); }}>
      Save and Update to Blockfell {upd.version || 'new version'}
    </Button>
  );
}

export function PauseMenu() {
  return (
    <div className="screen" data-testid="pause-menu">
      <div className="overlay-dim" />
      <div className="col" style={{ position: 'relative', marginTop: '40rem' }}>
        <Title style={{ marginBottom: '14rem' }}>Game Menu</Title>
        <Button size="wide" testId="btn-back-to-game" onClick={() => engine.closeOverlay()}>Back to Game</Button>
        <div className="row">
          <Button size="half" onClick={() => ui.set({ overlay: 'advancements' })}>Advancements</Button>
          <Button size="half" onClick={() => ui.set({ overlay: 'stats' })}>Statistics</Button>
        </div>
        <div className="row">
          <Button size="half" onClick={() => ui.set({ overlay: 'options', optionsReturn: 'pause' })}>Options...</Button>
          <SoundButton />
        </div>
        <div style={{ height: '8rem' }} />
        <Button size="wide" testId="btn-save-quit" onClick={() => void engine.saveAndQuit()}>Save and Quit to Title</Button>
        <PauseUpdate />
      </div>
    </div>
  );
}

/** Only as much text as fits on the board (measured in the same pixel font the sign uses). */
let measureCtx: CanvasRenderingContext2D | null = null;
function fitsSign(line: string): boolean {
  if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d'); if (measureCtx) measureCtx.font = '16px Blockfell, monospace'; }
  return !measureCtx || measureCtx.measureText(line).width <= 178;
}

export function SignEditor() {
  const g = engine.game;
  const pos = g?.signPos;
  const be = pos ? g!.blockEntityAt(pos.x, pos.y, pos.z) : undefined;
  const [lines, setLines] = useState<string[]>(be?.type === 'sign' ? [...be.lines] : ['', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // (a phone only shows its keyboard when a line is tapped, so say so)
  const touch = useStore(ui, (s) => s.touch);
  // a phone in landscape is short: close the gaps so Done stays on screen
  const gui = useStore(ui, (s) => s.gui);
  const short = window.innerHeight / gui < 250;
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const change = (i: number, v: string) => {
    if (v.length > lines[i].length && !fitsSign(v)) return;
    const next = [...lines];
    next[i] = v;
    setLines(next);
    g?.setSignText(next);
  };
  const onKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault();
      if (i < 3) refs.current[i + 1]?.focus();
      else if (e.key === 'Enter') engine.closeOverlay();
    } else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
  };
  return (
    <div className="screen" data-testid="sign-screen">
      <div className="overlay-dim" />
      <div className="menu-header" style={{ position: 'relative', marginTop: short ? '2rem' : '20rem' }}>
        <Title>{touch ? <span data-testid="sign-touch-hint">Tap a line to write on the sign</span> : 'Edit Sign Message'}</Title>
      </div>
      <div className="sign-board" style={short ? { marginTop: '2rem' } : undefined}>
        {lines.map((l, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} className="sign-line" data-testid={`sign-line-${i}`} value={l} spellCheck={false}
            onChange={(e) => change(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} />
        ))}
      </div>
      <div className="sign-post" style={short ? { height: '6rem' } : undefined} />
      <div style={{ flex: 1 }} />
      <div className="menu-footer" style={{ position: 'relative' }}><Button testId="btn-sign-done" onClick={() => engine.closeOverlay()}>Done</Button></div>
    </div>
  );
}

/** 1.8: looking at an explorer map: the land round the cross, and where you are. */
export function MapScreen() {
  const g = engine.game;
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  const held = g && g.mapSlot >= 0 ? g.inventory.get(g.mapSlot) : null;
  const t = held?.map;
  const holder = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!g || !t || !holder.current || !g.world.surface) return;
    const c = mapImage(g.world.surface, t);
    c.style.width = '160rem'; c.style.height = '160rem';
    c.setAttribute('data-testid', 'map-canvas');
    holder.current.replaceChildren(c);
  }, [t?.x, t?.z]);
  if (!g || !held || !t) return null;
  const p = g.player;
  const half = (MAP_PX / 2) * MAP_SCALE;
  const fx = (p.x - (t.x - half)) / (2 * half), fz = (p.z - (t.z - half)) / (2 * half);
  const inside = fx >= 0 && fx <= 1 && fz >= 0 && fz <= 1;
  const cx = Math.max(0, Math.min(1, fx)), cz = Math.max(0, Math.min(1, fz));
  const dist = Math.round(Math.hypot(t.x - p.x, t.z - p.z));
  const kind = t.kind === 'village' ? `Map to ${t.name ?? 'a village'}` : t.kind === 'dungeon' ? 'Dungeon Map' : 'Ruin Map';
  const by = t.kind === 'village' ? '' : t.name ? `Drawn by the Mapmaker of ${t.name}` : 'An explorer map';
  return (
    <div className="screen" data-testid="map-screen">
      <div className="overlay-dim" />
      <div style={{ flex: 1 }} />
      <div className="map-screen-panel">
        <div className="ms-title">{kind}{t.found ? ' (found)' : ''}</div>
        {by && <div className="ms-sub">{by}</div>}
        <div style={{ position: 'relative', width: '160rem', height: '160rem' }}>
          <div ref={holder} />
          <div className="ms-you" data-testid="map-you" style={{ left: `${cx * 160}rem`, top: `${cz * 160}rem`, opacity: inside ? 1 : 0.55 }} />
        </div>
        <div className="ms-sub" data-testid="map-screen-text">
          {dist < 5 ? 'You are at the cross.' : `The cross is ${dist} blocks ${compassName(t.x - p.x, t.z - p.z)} of you${inside ? '' : ' (you are off the edge of the map)'}.`}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div className="menu-footer" style={{ position: 'relative' }}><Button testId="btn-map-done" onClick={() => engine.closeOverlay()}>Done</Button></div>
    </div>
  );
}

export function SleepScreen() {
  const f = useStore(ui, (s) => s.sleep);
  return (
    <div className="screen" style={{ background: `rgba(8, 8, 24, ${0.25 + f * 0.7})` }} data-testid="sleep-screen">
      <div style={{ flex: 1 }} />
      <div className="menu-footer"><Button testId="btn-leave-bed" onClick={() => engine.closeOverlay()}>Leave Bed</Button></div>
    </div>
  );
}

export function DeathScreen() {
  const msg = useStore(ui, (s) => s.deathMessage);
  const score = useStore(ui, (s) => s.score);
  return (
    <div className="screen" style={{ background: 'linear-gradient(rgba(96,0,0,0.45), rgba(160,20,20,0.6))' }} data-testid="death-screen">
      <div className="col" style={{ marginTop: '60rem' }}>
        <div className="shadow" style={{ fontSize: '16rem', lineHeight: '18rem' }}>You Died!</div>
        <div className="shadow" style={{ marginTop: '8rem' }}>{msg}</div>
        <div className="shadow" style={{ marginBottom: '20rem' }}>Score: <span className="yellow">{score}</span></div>
        <Button testId="btn-respawn" onClick={() => { engine.game?.respawn(); engine.closeOverlay(); }}>Respawn</Button>
        <Button onClick={() => void engine.saveAndQuit()}>Title Screen</Button>
      </div>
    </div>
  );
}

export function AdvancementsScreen() {
  const g = engine.game;
  const done = g ? g.progress.done : new Set<string>();
  return (
    <div className="screen">
      <div className="overlay-dim" />
      <div className="menu-header" style={{ position: 'relative' }}><Title>Advancements ({done.size}/{ADVANCEMENTS.length})</Title></div>
      <div className="adv-grid" style={{ position: 'relative', overflowY: 'auto', maxHeight: 'calc(100% - 70rem)' }}>
        {ADVANCEMENTS.map((a) => (
          <div key={a.id} className={'adv' + (done.has(a.id) ? ' done' : '')}>
            <ItemIcon id={a.icon} style={{ position: 'relative' }} />
            <div>
              <div className={done.has(a.id) ? 'yellow' : 'shadow'}>{a.title}</div>
              <div className="gray">{a.description}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div className="menu-footer" style={{ position: 'relative' }}><Button onClick={() => ui.set({ overlay: 'pause' })}>Done</Button></div>
    </div>
  );
}

export function StatsScreen() {
  const g = engine.game;
  if (g) g.snapshot();
  const stats = g ? g.progress.stats : {};
  return (
    <div className="screen">
      <div className="overlay-dim" />
      <div className="menu-header" style={{ position: 'relative' }}><Title>Statistics</Title></div>
      <div className="col" style={{ position: 'relative', gap: 0, overflowY: 'auto' }}>
        {STAT_LABELS.map(([k, label, kind]) => (
          <div key={k} className="stat-row"><span className="shadow">{label}</span><span className="shadow">{formatStat(stats[k] ?? 0, kind)}</span></div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div className="menu-footer" style={{ position: 'relative' }}><Button onClick={() => ui.set({ overlay: 'pause' })}>Done</Button></div>
    </div>
  );
}
