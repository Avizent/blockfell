import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/Engine';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import { Button, Title } from './widgets';
import { INST_NAMES, MEL_NAMES, BASS_NAMES, DRUM_NAMES, MEL_SEMI, BASS_SEMI, INST_KEYS, DRUM_KEYS } from '../inventory/tunes';

type Track = 'mel' | 'bass' | 'drum';
const ROWS: Record<Track, number> = { mel: 8, bass: 4, drum: 3 };
const COLORS: Record<Track, string> = { mel: '#e9b840', bass: '#59b2e8', drum: '#e8685e' };
const TRACK_NAMES: Record<Track, string> = { mel: 'Melody', bass: 'Bass', drum: 'Drums' };

/** 2.11: the Tune Box editor. A grid of 32 steps (two pages of 16); tap a square to put a note there. */
const BW = (w: number, extra?: React.CSSProperties): React.CSSProperties => ({ width: `${w}rem`, ...extra });

export function TuneEditor() {
  const g = engine.game;
  const [, bump] = useState(0);
  const [track, setTrack] = useState<Track>('mel');
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [cur, setCur] = useState(-1);
  const gui = useStore(ui, (s) => s.gui);
  const short = window.innerHeight / gui < 250;
  const tune = g?.tuneBoxTune() ?? null;
  const redo = () => bump((n) => n + 1);

  useEffect(() => {
    const id = setInterval(() => setCur(g ? g.previewStep() : -1), 60);
    return () => clearInterval(id);
  }, [g]);
  const nameRef = useRef<HTMLInputElement | null>(null);

  if (!g || !tune) return null;

  const rows = ROWS[track];
  const arr = tune[track];
  const rowLabel = (r: number): string => track === 'mel' ? MEL_NAMES[7 - r] : track === 'bass' ? BASS_NAMES[3 - r] : DRUM_NAMES[2 - r];
  // melody/bass: value = the row index counted from the bottom (0 = lowest); drums: 1 kick, 2 snare, 3 hat (kick at the bottom)
  const valueOfRow = (r: number): number => track === 'drum' ? 3 - r : rows - 1 - r;
  const sizes = { cell: short ? 9 : 11 };

  const click = (col: number, r: number) => {
    const step = page * 16 + col;
    const v = valueOfRow(r);
    const was = arr[step];
    if (track === 'drum') {
      // drums rows: top = hat (3), middle = snare (2), bottom = kick (1)
      arr[step] = was === v ? 0 : v;
    } else {
      arr[step] = was === v ? -1 : v;
    }
    const now = arr[step];
    if (now > 0 || (track !== 'drum' && now >= 0)) {
      const p = g.tunePos!;
      if (track === 'mel') g.sound('note:' + INST_KEYS[tune.inst], p.x + 0.5, p.y + 1, p.z + 0.5, 1, 2 ** (MEL_SEMI[now] / 12));
      else if (track === 'bass') g.sound('note:bass', p.x + 0.5, p.y + 1, p.z + 0.5, 1, 2 ** (BASS_SEMI[now] / 12));
      else g.sound('drum:' + DRUM_KEYS[now], p.x + 0.5, p.y + 1, p.z + 0.5, 1);
    }
    redo();
  };
  const togglePlay = () => { const on = !playing; setPlaying(on); g.previewTune(on); };
  const setTempo = (d: number) => { tune.tempo = Math.max(40, Math.min(200, tune.tempo + d)); redo(); };
  const clear = () => { tune.mel.fill(-1); tune.bass.fill(-1); tune.drum.fill(0); redo(); };

  const Cell = ({ col, r }: { col: number; r: number }) => {
    const step = page * 16 + col;
    const on = arr[step] === valueOfRow(r) && (track === 'drum' ? arr[step] > 0 : arr[step] >= 0);
    const here = cur === step;
    const beat = col % 4 === 0;
    return (
      <div data-testid={`tune-cell-${track}-${r}-${col}`} onClick={() => click(col, r)}
        style={{
          width: `${sizes.cell}rem`, height: `${sizes.cell}rem`, boxSizing: 'border-box', cursor: 'pointer',
          background: on ? COLORS[track] : here ? '#7a7a8a' : beat ? '#4a4a58' : '#383844',
          border: '1rem solid ' + (on ? '#fff3' : '#1c1c24'),
        }} />
    );
  };

  return (
    <div className="screen" data-testid="tune-screen">
      <div className="overlay-dim" />
      <div className="menu-header" style={{ position: 'relative', marginTop: short ? '1rem' : '4rem' }}>
        <Title>Tune Box</Title>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: '4rem', alignItems: 'center', justifyContent: 'center', marginTop: '2rem' }}>
        <input ref={nameRef} className="sign-line" data-testid="tune-name" value={tune.name} maxLength={20} spellCheck={false}
          style={{ width: '110rem', height: '16rem', fontSize: '10rem', color: '#fff' }}
          onChange={(e) => { tune.name = e.target.value; redo(); }} />
        <Button size="small" testId="tune-slower" style={BW(24)} onClick={() => setTempo(-10)}>-</Button>
        <span data-testid="tune-tempo" style={{ color: '#fff', fontSize: '10rem', minWidth: '42rem', textAlign: 'center' }}>{tune.tempo} bpm</span>
        <Button size="small" testId="tune-faster" style={BW(24)} onClick={() => setTempo(10)}>+</Button>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: '3rem', justifyContent: 'center', marginTop: '3rem' }}>
        {(['mel', 'bass', 'drum'] as Track[]).map((t) => (
          <Button key={t} size="small" testId={`tune-track-${t}`} style={BW(54, t === track ? { outline: '1rem solid #fff' } : undefined)} onClick={() => setTrack(t)}>{TRACK_NAMES[t]}</Button>
        ))}
        <Button size="small" testId="tune-inst" style={BW(54)} onClick={() => { tune.inst = (tune.inst + 1) % 4; redo(); }}>{INST_NAMES[tune.inst]}</Button>
        <Button size="small" testId="tune-page" style={BW(62)} onClick={() => setPage(page ? 0 : 1)}>{page ? 'Bars 3-4' : 'Bars 1-2'}</Button>
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
        <div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '24rem', color: '#ddd', fontSize: '8rem', textAlign: 'right', paddingRight: '3rem' }}>{rowLabel(r)}</span>
              {Array.from({ length: 16 }, (_, c) => <Cell key={c} col={c} r={r} />)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', textAlign: 'center', color: '#ffe9a8', fontSize: '9rem', minHeight: '12rem', marginTop: '2rem' }} data-testid="tune-msg">{msg}</div>
      <div style={{ position: 'relative', display: 'flex', gap: '3rem', justifyContent: 'center', marginTop: '4rem' }}>
        <Button size="small" testId="tune-play" style={BW(60)} onClick={togglePlay}>{playing ? 'Stop' : 'Play'}</Button>
        <Button size="small" testId="tune-clear" style={BW(60)} onClick={clear}>Clear</Button>
        <Button size="small" testId="tune-copy" style={BW(60)} onClick={() => { setMsg(g.tuneFromDisc()); redo(); }}>Copy disc</Button>
        <Button size="small" testId="tune-record" style={BW(60)} onClick={() => setMsg(g.recordDisc())}>Record</Button>
        <Button size="small" testId="btn-tune-done" style={BW(60)} onClick={() => { g.previewTune(false); engine.closeOverlay(); }}>Done</Button>
      </div>
    </div>
  );
}

