import { useEffect, useState } from 'react';
import { engine } from '../engine/Engine';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import { StackView, ItemIcon } from './widgets';
import { hudIcons } from './uiAssets';
import { OFFHAND } from '../inventory/Inventory';

function IconRow({ kind, value, max, bottom, right, jiggle }: { kind: 'heart' | 'food' | 'armor'; value: number; max: number; bottom: number; right?: boolean; jiggle?: boolean }) {
  const set = hudIcons[kind];
  const icons = [];
  for (let i = 0; i < max / 2; i++) {
    const v = value - i * 2;
    const img = v >= 2 ? set.full : v === 1 ? set.half : set.empty;
    const x = right ? 182 - 9 - i * 8 : i * 8;
    const dy = jiggle ? Math.floor(Math.random() * 2) : 0;
    icons.push(
      <div key={i} className="icon9" style={{ left: `${x}rem`, bottom: `${bottom + dy}rem`, backgroundImage: `url(${img})` }} />,
    );
  }
  return <>{icons}</>;
}

function Hotbar() {
  useStore(ui, (s) => s.invVersion);
  const hud = useStore(ui, (s) => s.hud);
  const g = engine.game;
  if (!g) return null;
  const inv = g.inventory;
  const off = inv.get(OFFHAND);
  return (
    <div className="hotbar-wrap" data-testid="hotbar">
      {off && (
        <div className="offhand">
          <div style={{ position: 'absolute', left: '3rem', top: '3rem', width: '16rem', height: '16rem' }}><StackView stack={off} /></div>
        </div>
      )}
      <div className="hotbar">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: `${3 + i * 20}rem`, top: '3rem', width: '16rem', height: '16rem' }}>
            <StackView stack={inv.get(i)} />
          </div>
        ))}
      </div>
      <div className="hotbar-sel" style={{ left: `${-1 + hud.selected * 20}rem` }} />
    </div>
  );
}

function Status() {
  const hud = useStore(ui, (s) => s.hud);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (hud.health > 4) return;
    const t = setInterval(() => setTick((x) => x + 1), 150);
    return () => clearInterval(t);
  }, [hud.health]);
  void tick;
  if (hud.creative) return null;
  const bubbles = hud.air < 300 ? Math.max(0, Math.ceil(((hud.air - 2) * 10) / 300)) : -1;
  return (
    <div className="hotbar-wrap" style={{ height: 0 }}>
      <div className={hud.hurtTick > 0 ? 'hurt-flash' : ''}>
        <IconRow kind="heart" value={hud.health} max={20} bottom={30} jiggle={hud.health <= 4} />
      </div>
      <IconRow kind="food" value={hud.food} max={20} bottom={30} right jiggle={hud.saturationShake && Math.random() < 0.3} />
      {hud.armor > 0 && <IconRow kind="armor" value={hud.armor} max={20} bottom={40} />}
      {bubbles >= 0 && Array.from({ length: bubbles }, (_, i) => (
        <div key={i} className="icon9" style={{ left: `${182 - 9 - i * 8}rem`, bottom: '40rem', backgroundImage: `url(${hudIcons.bubble})` }} />
      ))}
      <div className="xpbar" data-testid="xpbar"><div style={{ width: `${Math.round(hud.xpProgress * 182)}rem` }} /></div>
      {hud.xpLevel > 0 && <div className="xplevel">{hud.xpLevel}</div>}
    </div>
  );
}

function HeldName() {
  const held = useStore(ui, (s) => s.heldName);
  const creative = useStore(ui, (s) => s.hud.creative);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!held) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [held?.key]);
  if (!held) return null;
  return (
    <div className="hotbar-wrap" style={{ height: 0 }}>
      <div className="held-name shadow" style={{ opacity: visible ? 1 : 0, bottom: creative ? '28rem' : '45rem' }}>{held.text}</div>
    </div>
  );
}

function Chat() {
  const chat = useStore(ui, (s) => s.chat);
  return <div className="chat">{chat.map((c) => <div key={c.id} className="shadow">{c.text}</div>)}</div>;
}

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div style={{ position: 'relative', width: '16rem', height: '16rem' }}><ItemIcon id={t.icon} style={{ left: 0, top: 0 }} /></div>
          <div><div className="t1">{t.title}</div><div className="t2">{t.desc}</div></div>
        </div>
      ))}
    </div>
  );
}

function Debug() {
  const d = useStore(ui, (s) => s.debug);
  if (!d) return null;
  return (
    <>
      <div className="debug" data-testid="debug-overlay">{d.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
      <div className="debug right">{d.right.map((l, i) => (l ? <div key={i}>{l}</div> : null))}</div>
    </>
  );
}

/** 1.8: who the villager under the crosshair is, what they're doing, and how their village sees you. */
function VillagerCardView() {
  const c = useStore(ui, (s) => s.villagerCard);
  const raid = useStore(ui, (s) => !!s.raid);
  if (!c) return null;
  return (
    <div className="villager-card" data-testid="villager-card" style={{ top: raid ? '34rem' : '14rem' }}>
      <div className="vc-name" data-testid="vc-name">{c.name}</div>
      <div className="vc-title" data-testid="vc-title">{c.title}</div>
      <div className="vc-line" data-testid="vc-activity">{c.activity}{!c.home && !c.child ? ' - no bed' : ''}</div>
      {c.village && (
        <div className={'vc-line vc-' + c.standingKey} data-testid="vc-standing">{c.village}: {c.standing} ({c.rep > 0 ? '+' : ''}{c.rep})</div>
      )}
    </div>
  );
}

/** 1.8: a held explorer map shows which way to go. */
function MapCompass() {
  const m = useStore(ui, (s) => s.mapHud);
  if (!m) return null;
  return (
    <div className="map-compass" data-testid="map-compass">
      <div className="mc-dial">
        {m.arrow !== null ? <div className="mc-arrow" style={{ transform: `rotate(${m.arrow}deg)` }} data-testid="map-arrow" /> : <div className="mc-here">X</div>}
      </div>
      <div className="mc-text">
        <div className="mc-label">{m.label}{m.found ? ' (found)' : ''}</div>
        <div data-testid="map-text">{m.text}</div>
      </div>
    </div>
  );
}

/** Night raid bar at the top of the screen. */
function RaidBar() {
  const raid = useStore(ui, (s) => s.raid);
  if (!raid) return null;
  return (
    <div className="raid-bar" data-testid="raid-bar">
      <div className="raid-label shadow">{raid.label}</div>
      <div className="raid-track"><div className="raid-fill" style={{ width: `${Math.round(raid.progress * 180)}rem` }} /></div>
    </div>
  );
}

export function HUD() {
  const hide = useStore(ui, (s) => s.hideHud);
  const debug = useStore(ui, (s) => s.showDebug);
  const overlay = useStore(ui, (s) => s.overlay);
  const locked = useStore(ui, (s) => s.locked);
  const under = useStore(ui, (s) => s.hud.underwater);
  const inLava = useStore(ui, (s) => !!s.hud.inLava);
  const burning = useStore(ui, (s) => !!s.hud.burning);
  const gate = useStore(ui, (s) => s.hud.gate ?? 0);
  const hurt = useStore(ui, (s) => s.hud.hurtTick);
  return (
    <div className="hud">
      {under && <div className="underwater" />}
      {inLava && <div className="in-lava" data-testid="in-lava" />}
      {burning && <div className="on-fire" data-testid="on-fire" />}
      {gate > 0 && <div className="deepgate-glow" data-testid="gate-glow" style={{ opacity: gate }} />}
      {hurt > 0 && <div className="hurt-vignette" style={{ opacity: hurt / 10 }} />}
      {!hide && (
        <>
          {overlay === null && <div className="crosshair" />}
          <Hotbar />
          <Status />
          <HeldName />
          <Chat />
          <RaidBar />
          {overlay === null && <VillagerCardView />}
          {overlay === null && <MapCompass />}
        </>
      )}
      {debug && <Debug />}
      <Toasts />
      {overlay === null && !locked && !engine.input?.allowUnlocked && (
        <div className="click-to-play shadow" onClick={() => engine.input.requestLock()} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
          Click to play<br /><span className="gray">WASD move · Space jump · E inventory · Esc menu</span>
        </div>
      )}
    </div>
  );
}
