/**
 * Keyboard/mouse state with pointer lock. Game code polls `isDown` for held keys
 * and consumes edge-triggered presses via `consumePress`, so input handling runs
 * inside the fixed-step game loop without missing fast taps.
 */
export class InputManager {
  private down = new Set<string>();
  /** Edge-triggered presses since the last tick, counted so two quick taps between ticks both register. */
  private pressed = new Map<string, number>();
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private mouseReleased = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  lockFailed = false;
  /** Automation/testing: accept mouse buttons without pointer lock. */
  allowUnlocked = false;
  /** When false (menus open) game keys are ignored and the cursor is free. */
  gameFocus = false;
  /** On-screen touch controls are in use (no pointer lock; see ui/TouchControls). */
  touchMode = false;
  /** Analog movement from the on-screen joystick, or null when it isn't held. */
  stick: { forward: number; strafe: number; sprint: boolean } | null = null;
  /** The on-screen Sneak button is switched on. */
  sneakLatch = false;
  onLockChange?: (locked: boolean) => void;
  onKey?: (code: string, e: KeyboardEvent) => boolean | void;
  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  requestLock(): void {
    if (this.touchMode) return;   // fingers, not a captured mouse
    if (document.pointerLockElement === this.target) return;
    try {
      const r = (this.target.requestPointerLock as unknown as (o?: object) => Promise<void> | void).call(this.target, { unadjustedMovement: false });
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.onPointerLockError());
    } catch {
      this.onPointerLockError();
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.gameFocus && this.down.has(code);
  }

  consumePress(code: string): boolean {
    const n = this.pressed.get(code);
    if (!n) return false;
    if (n > 1) this.pressed.set(code, n - 1); else this.pressed.delete(code);
    return this.gameFocus;
  }

  /** Takes every queued press of `code` at once and returns how many there were. */
  consumePresses(code: string): number {
    const n = this.pressed.get(code) ?? 0;
    this.pressed.delete(code);
    return this.gameFocus ? n : 0;
  }

  mouseIsDown(b: number): boolean {
    return this.gameFocus && this.mouseDown.has(b);
  }

  consumeMouse(b: number): boolean {
    if (!this.mousePressed.has(b)) return false;
    this.mousePressed.delete(b);
    return this.gameFocus;
  }

  consumeMouseRelease(b: number): boolean {
    if (!this.mouseReleased.has(b)) return false;
    this.mouseReleased.delete(b);
    return true;
  }

  takeMouseDelta(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  clearTransient(): void {
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
  }

  releaseAll(): void {
    this.down.clear();
    this.mouseDown.clear();
    this.stick = null;
    this.clearTransient();
  }

  // ---- on-screen controls feed the same state as the keyboard and mouse
  /** A key pressed or released by an on-screen button. */
  virtualKey(code: string, down: boolean): void {
    if (!down) { this.down.delete(code); return; }
    if (!this.gameFocus) return;
    this.pressed.set(code, (this.pressed.get(code) ?? 0) + 1);
    this.down.add(code);
  }

  /** A mouse button pressed or released by a tap or a held finger. */
  virtualMouse(button: number, down: boolean): void {
    if (!down) {
      if (this.mouseDown.has(button)) this.mouseReleased.add(button);
      this.mouseDown.delete(button);
      return;
    }
    if (!this.gameFocus) return;
    this.mouseDown.add(button);
    this.mousePressed.add(button);
  }

  /**
   * Takes back a press the game has not seen yet (a finger that turned out to be a
   * tap, not a hold). Returns false if a game tick already acted on it.
   */
  retractMouse(button: number): boolean {
    if (!this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
    this.mouseDown.delete(button);
    this.mouseReleased.delete(button);
    return true;
  }

  /** Turning the view by dragging a finger (in mouse-movement units). */
  addLook(dx: number, dy: number): void {
    if (!this.gameFocus) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  virtualIsDown(code: string): boolean {
    return this.down.has(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      // typing in a text field (e.g. creative search): only Escape reaches the game
      if (e.code !== 'Escape') return;
      (e.target as HTMLElement).blur();
    }
    if (this.onKey && this.onKey(e.code, e) === true) { e.preventDefault(); return; }
    if (!this.gameFocus) return;
    if (!e.repeat) this.pressed.set(e.code, (this.pressed.get(e.code) ?? 0) + 1);
    this.down.add(e.code);
    // stop browser shortcuts that collide with game keys
    if (['Space', 'Tab', 'F3', 'Slash', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Quote'].includes(e.code) || e.ctrlKey) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => {
    this.releaseAll();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.gameFocus) return;
    // ignore rare giant spikes some browsers emit when (re)locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.gameFocus) return;
    if (!this.locked && !this.allowUnlocked) { this.requestLock(); return; }
    this.mouseDown.add(e.button);
    this.mousePressed.add(e.button);
    e.preventDefault();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.mouseDown.has(e.button)) this.mouseReleased.add(e.button);
    this.mouseDown.delete(e.button);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.gameFocus) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.target;
    if (this.locked) this.lockFailed = false;
    if (!this.locked) this.releaseAll();
    this.onLockChange?.(this.locked);
  };

  private onPointerLockError = () => {
    this.lockFailed = true;
    this.onLockChange?.(false);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
  }
}
