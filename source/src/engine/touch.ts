/**
 * TOUCH DEVICES
 * -------------
 * Phones and tablets have no mouse to capture (Safari on iPhone and iPad does not
 * support pointer lock at all) and no keyboard, so Blockfell switches to on-screen
 * controls there (see ui/TouchControls.tsx). This module decides when that
 * happens and makes the mouse-driven menus and inventories work with fingers.
 */
export type TouchSetting = 'auto' | 'on' | 'off';

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/** A device whose main pointer is a finger. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (isIOS()) return true;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia('(any-pointer: fine)').matches) return false;
  } catch { /* old browser */ }
  return (navigator.maxTouchPoints ?? 0) > 0;
}

export function wantsTouch(setting: TouchSetting): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return isTouchDevice();
}

/**
 * MOUSE EMULATION FOR THE MENUS
 * The inventory, sliders and scrollbars are written for a mouse (mousedown, then
 * mousemove/mouseup on the window, and mouseover/mouseout for hovering). Mobile
 * browsers only send the "compatibility" mouse events after a finger lifts, and iOS
 * drops them altogether when a hover handler changes the page. So while touch
 * controls are on, a finger's pointer events are turned straight into mouse events
 * here, and the browser's own late copies are ignored. Touches on the in-game
 * controls layer (marked data-touch-controls) are left alone: it reads pointer
 * events itself.
 *
 * On an inventory slot a finger has no second button, so the press is held back
 * until it is clear what the finger is doing:
 *  - lifted quickly: a left click (pick up, put down or swap a stack);
 *  - moved: a left drag (drag a carried stack across slots to share it out evenly);
 *  - held still for LONG_PRESS_MS: a right click (pick up half a stack, or put down
 *    one item), and a drag after that puts one item in each slot it crosses.
 */
export const LONG_PRESS_MS = 450;
const SLOP = 10;

interface Bridged {
  id: number;
  x0: number; y0: number;
  /** The down event's own timestamp: taps and long presses are told apart by event times
   *  (never by a timer, which a busy page can run after the lift has already happened). */
  ts0: number;
  /** Where the finger went down, and the element under it now (for mouseover/mouseout). */
  target: Element; over: Element;
  /** The mouse button sent down, or null while a press on a slot is still undecided. */
  pressed: 0 | 2 | null;
}

let bridgeOn = false;
let lastTouch = -1e9;
/** Only one finger drives the emulated mouse at a time: the first one down. */
let finger: Bridged | null = null;

interface Pos { clientX: number; clientY: number; screenX: number; screenY: number }
function fire(type: string, target: EventTarget, p: Pos, button = 0, related: EventTarget | null = null): void {
  const held = type === 'mouseup' || finger?.pressed == null ? 0 : finger.pressed === 2 ? 2 : 1;
  const m = new MouseEvent(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: p.clientX, clientY: p.clientY, screenX: p.screenX, screenY: p.screenY,
    button, buttons: held, relatedTarget: related,
  });
  target.dispatchEvent(m);
}

const under = (x: number, y: number): Element => document.elementFromPoint(x, y) ?? document.body;

/** Moves the emulated pointer onto `el`: mouseout on the old element, mouseover on the new one. */
function hoverTo(b: Bridged, el: Element, p: Pos): void {
  if (el === b.over) return;
  const old = b.over;
  b.over = el;
  fire('mouseout', old, p, 0, el);
  fire('mouseover', el, p, 0, old);
}

function press(b: Bridged, button: 0 | 2, at: Element, p: Pos): void {
  b.pressed = button;
  fire('mousedown', at, p, button);
}

/** Ends the emulated press: mouseup (if a button went down), then nothing is hovered any more. */
function release(b: Bridged, at: Element, p: Pos): void {
  if (b.pressed !== null) fire('mouseup', at, p, b.pressed);
  finger = null;
  // (hides tooltips and highlights: a finger that has gone hovers nothing)
  fire('mouseout', b.over, p, 0, null);
}

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType === 'mouse') return;
  lastTouch = performance.now();
  if (!bridgeOn) return;
  // a primary pointer means no other finger is on the glass: if the bridged one never
  // reported its lift (its element was removed under it, say), let it go now
  if (finger && e.isPrimary) release(finger, finger.over, e);
  if (finger) return;
  const t = e.target as Element | null;
  if (!t || t.closest?.('[data-touch-controls]')) return;
  const b: Bridged = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ts0: e.timeStamp, target: t, over: t, pressed: null };
  finger = b;
  fire('mousemove', t, e);
  fire('mouseover', t, e);
  // on a slot the press waits for the finger's next move or its lift (see above)
  if (!t.closest?.('[data-slot]')) press(b, 0, t, e);
}

function onPointerMove(e: PointerEvent): void {
  if (e.pointerType === 'mouse') return;
  lastTouch = performance.now();
  const b = finger;
  if (!b || b.id !== e.pointerId) return;
  if (b.pressed === null) {
    const start: Pos = { clientX: b.x0, clientY: b.y0, screenX: e.screenX - (e.clientX - b.x0), screenY: e.screenY - (e.clientY - b.y0) };
    if (e.timeStamp - b.ts0 >= LONG_PRESS_MS) press(b, 2, b.target, start);   // held, then moving: a right drag
    else if (Math.hypot(e.clientX - b.x0, e.clientY - b.y0) > SLOP) press(b, 0, b.target, start);   // dragging straight away
    else return;
  }
  const el = under(e.clientX, e.clientY);
  hoverTo(b, el, e);
  fire('mousemove', el, e);
}

function onPointerUp(e: PointerEvent): void {
  if (e.pointerType === 'mouse') return;
  lastTouch = performance.now();
  const b = finger;
  if (!b || b.id !== e.pointerId) return;
  if (e.type === 'pointercancel') { release(b, b.over, e); return; }
  // lifted without moving: a tap (left click) or, held long enough, a right click
  if (b.pressed === null) press(b, e.timeStamp - b.ts0 >= LONG_PRESS_MS ? 2 : 0, b.target, e);
  const el = under(e.clientX, e.clientY);
  hoverTo(b, el, e);   // the lift may be a little away from the last move
  release(b, el, e);
}

/** The browser's own mouse events that follow a touch arrive late (or not at all): drop them. */
function swallowCompat(e: MouseEvent): void {
  if (!bridgeOn || !e.isTrusted) return;
  const fromTouch = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents === true;
  if (fromTouch || performance.now() - lastTouch < 900) e.stopPropagation();
}

/** iPhone and iPad Safari ignore user-scalable=no: stop pinch-zooming the page while touch controls are on. */
function noPinch(e: Event): void {
  if (bridgeOn) e.preventDefault();
}

let installed = false;
export function setTouchBridge(on: boolean): void {
  bridgeOn = on;
  if (!on) finger = null;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  for (const type of ['mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout']) window.addEventListener(type, swallowCompat as EventListener, true);
  for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, noPinch, { passive: false });
}

/** True within a moment of a finger touching the screen. */
export function recentTouch(): boolean {
  return performance.now() - lastTouch < 900;
}
