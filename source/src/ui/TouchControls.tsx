import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/Engine';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import { getItem } from '../inventory/ItemRegistry';
import { Villager } from '../entities/Villager';
import { Hound } from '../entities/Hound';
import { Ashboar, ASHBOAR_FOOD } from '../entities/Ashboar';
import type { Game } from '../game/Game';

/**
 * ON-SCREEN CONTROLS (phones and tablets)
 * ---------------------------------------
 *  - Joystick (bottom left, appears under your thumb): walk in any direction;
 *    push past the rim to sprint.
 *  - Drag anywhere else to look around.
 *  - Tap: use / place (open doors and chests, place the held block, eat...) at the
 *    crosshair; tapping a creature attacks it (villagers and Fellhounds are used).
 *  - Touch and hold: mine the block at the crosshair (or keep eating, draw a bow).
 *    You can keep dragging while holding to aim.
 *  - Buttons: Jump (double-tap to fly in Creative), Sneak (on/off), Inventory, Pause.
 *  - Tap a hotbar slot to select it; hold it to drop one item.
 * All of it feeds the same input state as the keyboard and mouse (InputManager).
 */
const CONTAINERS = new Set(['inventory', 'creative', 'crafting', 'furnace', 'chest', 'runes', 'trade', 'map']);
/** Finger pixels -> mouse-movement units for turning. */
const LOOK_SPEED = 1.6;
/** A touch held this long without moving mines instead of tapping. */
export const HOLD_MS = 260;
/** Holding a hotbar slot this long drops one of the item. */
const HOTBAR_DROP_MS = 450;
const TAP_SLOP = 10;
const STICK_R = 48;

interface LookTouch {
  id: number; x0: number; y0: number; x: number; y: number;
  /** When the finger went down: page time, and the event's own timestamp (unaffected by a busy page). */
  t0: number; ts0: number;
  moved: boolean; hold: number | null; timer: number; rearmed: boolean;
}
/** `ox, oy`: where the thumb landed (the stick's zero); `cx, cy`: where the base is drawn (kept on screen). */
interface StickTouch { id: number; ox: number; oy: number; cx: number; cy: number }

function holdButton(): number {
  const g = engine.game;
  const held = g?.inventory.selectedStack;
  if (!g || !held) return 0;
  const def = getItem(held.id);
  if (def.kind === 'bow') return 2;
  if (def.kind === 'food' && !g.player.creative && g.player.food < 20) return 2;
  return 0;
}

function tapButton(): number {
  const g = engine.game;
  const m = g?.targetMob;
  // a tap feeds an Ashboar a Glowcap; otherwise a tap on a creature is a hit (villagers and hounds: a right-click)
  if (m instanceof Ashboar && g?.inventory.selectedStack?.id === ASHBOAR_FOOD) return 2;
  if (m && !(m instanceof Villager) && !(m instanceof Hound)) return 0;
  return 2;
}

function Icon({ kind }: { kind: 'jump' | 'sneak' | 'inventory' | 'pause' | 'close' }) {
  const p = { fill: 'none', stroke: '#fff', strokeWidth: 3, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const };
  switch (kind) {
    case 'jump': return <svg viewBox="0 0 24 24"><path d="M5 15 L12 8 L19 15" {...p} /><path d="M12 8 V20" {...p} /></svg>;
    case 'sneak': return <svg viewBox="0 0 24 24"><path d="M5 9 L12 16 L19 9" {...p} /><path d="M5 20 H19" {...p} /></svg>;
    case 'inventory': return <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" {...p} /><path d="M3 12 H21 M9 5 V19 M15 5 V19" {...p} strokeWidth={2} /></svg>;
    case 'pause': return <svg viewBox="0 0 24 24"><path d="M8 5 V19 M16 5 V19" {...p} strokeWidth={4} /></svg>;
    default: return <svg viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18" {...p} /></svg>;
  }
}

/** Keeps a finger's events coming to this element (throws if the pointer is already gone). */
function capture(e: React.PointerEvent<Element>): void {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* lifted already */ }
}

function GameControls() {
  const input = engine.input;
  const look = useRef<LookTouch | null>(null);
  const stick = useRef<StickTouch | null>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const hotbarTimer = useRef(0);
  const hotbarTouch = useRef<{ id: number; x0: number; y0: number; slot: number; ts0: number; dropped: ReturnType<Game['dropOne']> } | null>(null);
  const jumpFingers = useRef(new Set<number>());
  const [sneak, setSneak] = useState(input.sneakLatch);
  const [jump, setJump] = useState(false);

  const resetStick = () => {
    stick.current = null;
    input.stick = null;
    const b = base.current, k = knob.current;
    if (b) { b.style.left = ''; b.style.top = ''; b.classList.remove('active', 'sprint'); }
    if (k) k.style.transform = '';
  };
  const hideRing = () => ring.current?.classList.remove('go', 'show');
  const endLook = (tap: boolean, ts = performance.now()) => {
    const l = look.current;
    if (!l) return;
    clearTimeout(l.timer);
    // judged by the events' own timestamps, so a slow frame can't turn a tap into a hold
    const quick = ts - l.ts0 < HOLD_MS;
    let isTap = tap && !l.moved && ts - l.ts0 < HOLD_MS + 120;
    if (l.hold !== null) {
      // the hold timer beat a quick lift that was still queued (a slow frame): if no
      // game tick has acted on the hold yet, take it back; either way the finger's own
      // timestamps say it was a tap, so the tap still happens
      if (!(isTap && quick && input.retractMouse(l.hold))) {
        input.virtualMouse(l.hold, false);
        if (!quick) isTap = false;
      }
    }
    if (isTap) {
      const b = tapButton();
      input.virtualMouse(b, true);
      input.virtualMouse(b, false);
    }
    look.current = null;
    hideRing();
  };

  // leaving the game screen (inventory, pause...) lets go of everything
  useEffect(() => () => {
    endLook(false);
    resetStick();
    jumpFingers.current.clear();
    input.virtualKey('Space', false);
    clearTimeout(hotbarTimer.current);
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = window.innerWidth, h = window.innerHeight;
    capture(e);
    if (!stick.current && e.clientX < w * 0.4 && e.clientY > h * 0.3) {
      // the joystick appears under the thumb (its base is kept fully on screen, but
      // the stick's zero is where the thumb landed, so it never starts off-centre)
      const cx = Math.max(STICK_R + 16, Math.min(w * 0.4, e.clientX));
      const cy = Math.max(STICK_R + 16, Math.min(h - STICK_R - 16, e.clientY));
      stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, cx, cy };
      const b = base.current;
      if (b) { b.style.left = `${cx}px`; b.style.top = `${cy}px`; b.classList.add('active'); }
      moveStick(e.clientX, e.clientY);
      return;
    }
    if (look.current) return;
    const l: LookTouch = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), ts0: e.timeStamp,
      moved: false, hold: null, timer: 0, rearmed: false,
    };
    const startHold = () => {
      if (look.current !== l || l.moved) return;
      // if the page was busy the finger may already be up with its event still queued: give it a moment
      if (!l.rearmed && performance.now() - l.t0 > HOLD_MS + 60) { l.rearmed = true; l.timer = window.setTimeout(startHold, 40); return; }
      l.hold = holdButton();
      input.virtualMouse(l.hold, true);
    };
    l.timer = window.setTimeout(startHold, HOLD_MS);
    look.current = l;
    const r = ring.current;
    if (r) { r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`; r.classList.remove('go'); r.classList.add('show'); void r.offsetWidth; r.classList.add('go'); }
  };

  const moveStick = (x: number, y: number) => {
    const s = stick.current!;
    const dx = x - s.ox, dy = y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    // the knob is drawn relative to the base, which may sit a little away from the thumb
    const kx = s.ox - s.cx + dx * k, ky = s.oy - s.cy + dy * k;
    const kd = Math.hypot(kx, ky), kk = kd > STICK_R ? STICK_R / kd : 1;
    if (knob.current) knob.current.style.transform = `translate(${kx * kk}px, ${ky * kk}px)`;
    let fx = dx / STICK_R, fy = -dy / STICK_R;
    const len = Math.hypot(fx, fy);
    if (len > 1) { fx /= len; fy /= len; }
    if (len < 0.15) { fx = 0; fy = 0; }
    const sprint = d > STICK_R * 1.3 && fy > 0.6;
    base.current?.classList.toggle('sprint', sprint);
    input.stick = { forward: fy, strafe: fx, sprint };
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === e.pointerId) { moveStick(e.clientX, e.clientY); return; }
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    input.addLook((e.clientX - l.x) * LOOK_SPEED, (e.clientY - l.y) * LOOK_SPEED);
    l.x = e.clientX; l.y = e.clientY;
    if (!l.moved && Math.hypot(l.x - l.x0, l.y - l.y0) > TAP_SLOP) {
      l.moved = true;
      if (l.hold === null) { clearTimeout(l.timer); hideRing(); }
    }
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    if (stick.current?.id === e.pointerId) { resetStick(); return; }
    if (look.current?.id === e.pointerId) endLook(!cancel, e.timeStamp);
  };

  const jumpUp = (id: number) => {
    const f = jumpFingers.current;
    if (!f.delete(id) || f.size > 0) return;
    input.virtualKey('Space', false);
    setJump(false);
  };

  const button = (handler: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); handler(); },
  });

  const hotbarSlot = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.floor(((e.clientX - r.left) / r.width) * 9);
  };

  return (
    <div className="touch-controls" data-touch-controls data-testid="touch-controls"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => onUp(e)} onPointerCancel={(e) => onUp(e, true)}
      onLostPointerCapture={(e) => onUp(e, true)}
      onContextMenu={(e) => e.preventDefault()}>
      <div ref={ring} className="tc-ring" />
      <div ref={base} className="tc-stick" data-testid="touch-joystick"><div ref={knob} className="tc-knob" /></div>
      <div className="tc-hotbar" data-testid="touch-hotbar"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (hotbarTouch.current) return;
          const slot = hotbarSlot(e);
          const t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, slot, ts0: e.timeStamp, dropped: null as ReturnType<Game['dropOne']> };
          hotbarTouch.current = t;
          engine.game?.selectSlot(slot);
          clearTimeout(hotbarTimer.current);
          // held still on one slot: drop one of it
          hotbarTimer.current = window.setTimeout(() => { if (hotbarTouch.current === t && t.slot === slot) t.dropped = engine.game?.dropOne() ?? null; }, HOTBAR_DROP_MS);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const t = hotbarTouch.current;
          if (!t || t.id !== e.pointerId) return;
          if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > TAP_SLOP) clearTimeout(hotbarTimer.current);
          // sliding along the hotbar picks the slot under the finger
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientY >= r.top - 8 && e.clientX >= r.left && e.clientX < r.right) {
            const slot = hotbarSlot(e);
            if (slot !== t.slot) { t.slot = slot; engine.game?.selectSlot(slot); }
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          const t = hotbarTouch.current;
          if (t?.id !== e.pointerId) return;
          hotbarTouch.current = null;
          clearTimeout(hotbarTimer.current);
          // a slow frame let the drop timer run before this lift was seen: by the
          // finger's own timestamps it was a quick tap, so the item goes back
          if (t.dropped && e.timeStamp - t.ts0 < HOTBAR_DROP_MS) engine.game?.takeBackDrop(t.dropped);
        }}
        onPointerCancel={(e) => { if (hotbarTouch.current?.id === e.pointerId) { hotbarTouch.current = null; clearTimeout(hotbarTimer.current); } }} />
      <div className="tc-btn tc-pause" data-testid="touch-pause" {...button(() => engine.openOverlay('pause'))}><Icon kind="pause" /></div>
      <div className="tc-btn tc-inv" data-testid="touch-inventory" {...button(() => { if (!engine.game?.player.dead) engine.openInventory(); })}><Icon kind="inventory" /></div>
      <div className={'tc-btn tc-sneak' + (sneak ? ' on' : '')} data-testid="touch-sneak"
        {...button(() => {
          // in a boat the Sneak button climbs out
          const g = engine.game;
          if (g?.riding) { g.dismount(); setSneak(false); return; }
          input.sneakLatch = !input.sneakLatch; setSneak(input.sneakLatch);
        })}><Icon kind="sneak" /></div>
      <div className={'tc-btn tc-jump' + (jump ? ' on' : '')} data-testid="touch-jump"
        onPointerDown={(e) => {
          e.stopPropagation();
          capture(e);
          const f = jumpFingers.current;
          if (f.size === 0) { input.virtualKey('Space', true); setJump(true); }   // a second finger on it is not a second jump
          f.add(e.pointerId);
        }}
        onPointerUp={(e) => { e.stopPropagation(); jumpUp(e.pointerId); }}
        onPointerCancel={(e) => jumpUp(e.pointerId)}
        onLostPointerCapture={(e) => { e.stopPropagation(); jumpUp(e.pointerId); }}><Icon kind="jump" /></div>
    </div>
  );
}

/** A close button for inventories and other screens (there is no E or Esc key on a phone). */
function CloseButton() {
  return (
    <div className="tc-btn tc-close" data-touch-controls data-testid="touch-close"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => { e.stopPropagation(); engine.closeOverlay(); }}>
      <Icon kind="close" />
    </div>
  );
}

export function TouchControls() {
  const touch = useStore(ui, (s) => s.touch);
  const screen = useStore(ui, (s) => s.screen);
  const overlay = useStore(ui, (s) => s.overlay);
  if (!touch || screen !== 'game') return null;
  if (overlay === null) return <GameControls />;
  if (CONTAINERS.has(overlay)) return <CloseButton />;
  return null;
}

/** On a phone held upright the view is tiny: suggest turning it sideways. */
export function RotateHint() {
  const touch = useStore(ui, (s) => s.touch);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth && window.innerWidth < 700);
  useEffect(() => {
    const f = () => setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 700);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  if (!touch || !portrait) return null;
  return <div className="rotate-hint shadow" data-testid="rotate-hint">Turn your phone sideways to play</div>;
}
