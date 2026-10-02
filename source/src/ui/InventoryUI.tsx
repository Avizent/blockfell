import { useEffect, useReducer, useRef, useState, createContext, useContext, ReactNode, WheelEvent as RWheelEvent } from 'react';
import * as THREE from 'three';
import { engine } from '../engine/Engine';
import { recentTouch } from '../engine/touch';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import { StackView, ItemIcon, Glint } from './widgets';
import { LEVEL_NAMES, LEVEL_XP, PROFESSION_NAMES } from '../entities/Trades';
import type { ScreenHandler, SlotRef, SlotGroup } from '../inventory/ScreenHandler';
import type { Slot } from '../inventory/ItemStack';
import { makeStack } from '../inventory/ItemStack';
import { ITEMS, getItem, maxStackOf, CATEGORY_LABELS, Category, ItemDef } from '../inventory/ItemRegistry';
import { playerModel } from '../entities/mobModels';
import { RUNES, RuneId, canInscribe, runeLabel, runeOffers } from '../inventory/Enchantments';
import { instantiate } from '../entities/BoxModel';

// ------------------------------------------------------------------ pixel art bits
function px(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c.toDataURL();
}
let art: { arrow: string; arrowFill: string; flame: string; flameFill: string; trash: string } | null = null;
function getArt() {
  if (art) return art;
  const arrowShape = (c: CanvasRenderingContext2D, col: string) => {
    c.fillStyle = col;
    c.fillRect(0, 6, 15, 4);
    for (let i = 0; i < 8; i++) c.fillRect(15 + i, i, 1, 16 - i * 2);
  };
  const flameShape = (c: CanvasRenderingContext2D, a: string, b: string) => {
    const rows = ['....#.....', '...##..#..', '...###.##.', '..#####.#.', '..########', '.#########', '.###aa####', '.##aaaa###', '.##aaaa##.', '..#aaa##..', '...####...'];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { if (r[x] === '.') continue; c.fillStyle = r[x] === 'a' ? b : a; c.fillRect(x + 2, y + 2, 1, 1); } });
  };
  art = {
    arrow: px(23, 16, (c) => arrowShape(c, '#8b8a86')),
    arrowFill: px(23, 16, (c) => arrowShape(c, '#ffffff')),
    flame: px(14, 14, (c) => flameShape(c, '#8b8a86', '#8b8a86')),
    flameFill: px(14, 14, (c) => flameShape(c, '#ff9a1a', '#ffe070')),
    trash: px(16, 16, (c) => {
      c.fillStyle = '#5a1010';
      for (let i = 2; i < 14; i++) { c.fillRect(i, i, 2, 1); c.fillRect(15 - i, i, 2, 1); }
      c.fillStyle = '#ff5555';
      for (let i = 3; i < 13; i++) { c.fillRect(i, i, 1, 1); c.fillRect(15 - i, i, 1, 1); }
    }),
  };
  return art;
}

// ------------------------------------------------------------------ interaction controller
interface Drag { button: 0 | 1; slots: SlotRef[] }

class InvController {
  drag: Drag | null = null;
  hovered: SlotRef | null = null;
  last = { id: '', t: 0 };
  mouse = { x: -100, y: -100 };
  /** Touch: the slot a finger just picked a stack up from (lifting it over another slot puts it there). */
  pickedFrom: SlotRef | null = null;
  constructor(public h: ScreenHandler, public refresh: () => void) {}

  down(ref: SlotRef, e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const button: 0 | 1 = e.button === 2 ? 1 : 0;
    if (e.button === 1) return;
    const now = performance.now();
    // double click: collect matching stacks
    if (button === 0 && !e.shiftKey && this.last.id === ref.id && now - this.last.t < 300 && this.h.cursor.stack && !this.h.get(ref)) {
      this.h.collect();
      this.last = { id: '', t: 0 };
      this.refresh();
      return;
    }
    this.last = { id: ref.id, t: now };
    if (this.h.cursor.stack && !e.shiftKey && ref.group !== 'output' && ref.group !== 'furnace_out') {
      this.drag = { button, slots: [ref] };
      this.refresh();
      return;
    }
    const had = !!this.h.cursor.stack;
    this.h.click(ref, button, e.shiftKey);
    this.pickedFrom = !had && this.h.cursor.stack && recentTouch() ? ref : null;
    this.refresh();
  }

  enter(ref: SlotRef): void {
    this.hovered = ref;
    if (this.drag && !this.drag.slots.includes(ref) && ref.group !== 'output' && ref.group !== 'furnace_out') {
      this.drag.slots.push(ref);
    }
    this.refresh();
  }

  leave(ref: SlotRef): void {
    if (this.hovered === ref) this.hovered = null;
    this.refresh();
  }

  up(): void {
    const d = this.drag;
    const from = this.pickedFrom;
    this.pickedFrom = null;
    if (!d) {
      // touch: a stack picked up with a finger and carried to another slot is put down there
      const to = this.hovered;
      if (from && to && to !== from && to.group !== 'output' && to.group !== 'furnace_out' && this.h.cursor.stack && recentTouch()) { this.h.click(to, 0, false); this.refresh(); }
      return;
    }
    this.drag = null;
    if (d.slots.length === 1) this.h.click(d.slots[0], d.button, false);
    else this.h.distribute(d.slots, d.button);
    this.refresh();
  }

  key(e: KeyboardEvent): void {
    const ref = this.hovered;
    if (!ref) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // typing in the search box
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) { this.h.hotbarSwap(ref, Number(m[1]) - 1); this.refresh(); e.preventDefault(); return; }
    if (e.code === 'KeyQ') { this.h.dropFrom(ref, e.ctrlKey || e.metaKey); this.refresh(); e.preventDefault(); }
  }
}

const Ctx = createContext<InvController | null>(null);

function useController(): [InvController | null, number] {
  const [ver, force] = useReducer((x: number) => x + 1, 0);
  const inv = useStore(ui, (s) => s.invVersion);
  const g = engine.game;
  const ref = useRef<InvController | null>(null);
  if (g?.screen && (!ref.current || ref.current.h !== g.screen)) ref.current = new InvController(g.screen, force);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const up = () => c.up();
    const move = (e: MouseEvent) => { c.mouse.x = e.clientX; c.mouse.y = e.clientY; force(); };
    const key = (e: KeyboardEvent) => c.key(e);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move); window.removeEventListener('keydown', key); };
  }, [ref.current]);
  return [ref.current, ver + inv];
}

function SlotBox({ r, x, y, big, ghost }: { r: SlotRef; x: number; y: number; big?: boolean; ghost?: string }) {
  const c = useContext(Ctx)!;
  const stack = c.h.get(r);
  const dragging = c.drag?.slots.includes(r);
  return (
    <div
      className={'slot' + (big ? ' big' : '')}
      style={{ left: `${x}rem`, top: `${y}rem` }}
      data-slot={r.id}
      onMouseDown={(e) => c.down(r, e)}
      onMouseEnter={() => c.enter(r)}
      onMouseLeave={() => c.leave(r)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!stack && ghost && <div className="ghost" style={engine.icons.style(ghost)} />}
      <StackView stack={stack} />
      {(c.hovered === r || dragging) && <div className="hover" />}
    </div>
  );
}

function tooltipLines(s: Slot, def: ItemDef): ReactNode {
  if (!s) return null;
  const extra: string[] = [];
  if (def.food) extra.push(`Restores ${def.food.hunger / 2} hunger`);
  if (def.tool) extra.push(`${def.attack} attack damage`);
  if (def.armor) extra.push(`+${def.armor.points} armour`);
  if (def.durability) extra.push(`Durability: ${def.durability - (s.damage ?? 0)} / ${def.durability}`);
  if (def.fuel) extra.push('Furnace fuel');
  const runes = s.ench ? Object.entries(s.ench) as [RuneId, number][] : [];
  return (
    <>
      <div className={runes.length ? 'rune' : undefined}>{def.name}</div>
      {runes.map(([id, l]) => <div key={id} className="rune">{runeLabel(id, l)} <span className="sub">({RUNES[id]?.describe(l)})</span></div>)}
      {extra.map((t) => <div key={t} className="sub">{t}</div>)}
    </>
  );
}

function CursorAndTooltip({ c, hoverStack }: { c: InvController; hoverStack?: Slot }) {
  const gui = useStore(ui, (s) => s.gui);
  const cur = c.h.cursor.stack;
  const hs = hoverStack ?? (c.hovered ? c.h.get(c.hovered) : null);
  return (
    <>
      {cur && (
        <div className="cursor-item" style={{ left: c.mouse.x - 8 * gui, top: c.mouse.y - 8 * gui }}>
          <StackView stack={c.drag && c.drag.slots.length > 1 ? previewAfterDrag(c) : cur} />
        </div>
      )}
      {!cur && hs && (
        <div className="tooltip" style={{ left: c.mouse.x + 10 * gui, top: c.mouse.y - 14 * gui }}>
          {tooltipLines(hs, getItem(hs.id))}
        </div>
      )}
    </>
  );
}

function previewAfterDrag(c: InvController): Slot {
  const cur = c.h.cursor.stack!;
  const d = c.drag!;
  const each = d.button === 0 ? Math.floor(cur.count / d.slots.length) : 1;
  const left = cur.count - each * d.slots.length;
  return left > 0 ? { ...cur, count: left } : null;
}

function Panel({ w, h, children, c }: { w: number; h: number; children: ReactNode; c: InvController }) {
  return (
    <div className="screen" data-testid="inventory-screen" onContextMenu={(e) => e.preventDefault()}>
      <div className="overlay-dim" onMouseDown={(e) => { if (c.h.cursor.stack) { c.h.dropCursor(e.button === 2 ? 1 : 0); c.refresh(); } }} />
      <div className="panel" style={{ width: `${w}rem`, height: `${h}rem`, left: `calc(50% - ${w / 2}rem)`, top: `calc(50% - ${h / 2}rem)` }}>
        {children}
      </div>
    </div>
  );
}

function PlayerSlots({ c, y, x = 7 }: { c: InvController; y: number; x?: number }) {
  return (
    <>
      {c.h.group('main').map((r, i) => <SlotBox key={r.id} r={r} x={x + (i % 9) * 18} y={y + Math.floor(i / 9) * 18} />)}
      {c.h.group('hotbar').map((r, i) => <SlotBox key={r.id} r={r} x={x + i * 18} y={y + 58} />)}
    </>
  );
}

// ------------------------------------------------------------------ player preview (small dedicated renderer)
let previewRenderer: THREE.WebGLRenderer | null = null;
let previewScene: THREE.Scene | null = null;
let previewCam: THREE.PerspectiveCamera | null = null;
let previewModel: { root: THREE.Group; parts: Map<string, THREE.Object3D> } | null = null;

function PlayerPreview({ x, y, w, h, mouse }: { x: number; y: number; w: number; h: number; mouse: { x: number; y: number } }) {
  const host = useRef<HTMLDivElement>(null);
  const gui = useStore(ui, (s) => s.gui);
  useEffect(() => {
    if (!previewRenderer) {
      previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
      previewRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      previewScene = new THREE.Scene();
      previewScene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
      const d = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
      d.position.set(0.4, 1, 1);
      previewScene.add(d);
      previewCam = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
      previewCam.position.set(0, 1.0, 4.4);
      previewCam.lookAt(0, 0.95, 0);
      const inst = instantiate(playerModel());
      previewModel = inst;
      previewScene.add(inst.root);
    }
    const el = previewRenderer.domElement;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.imageRendering = 'pixelated';
    host.current?.appendChild(el);
    return () => { el.remove(); };
  }, []);
  useEffect(() => {
    if (!previewRenderer || !previewScene || !previewCam || !previewModel || !host.current) return;
    const r = host.current.getBoundingClientRect();
    previewRenderer.setPixelRatio(1);
    previewRenderer.setSize(Math.round(w * gui), Math.round(h * gui), false);
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.25;
    const yaw = Math.atan((mouse.x - cx) / (40 * gui)) * 0.9;
    const pitch = Math.atan((mouse.y - cy) / (40 * gui)) * 0.5;
    previewModel.root.rotation.y = yaw * 0.6;
    const head = previewModel.parts.get('head');
    if (head) { head.rotation.y = yaw * 0.5; head.rotation.x = pitch; }
    previewRenderer.render(previewScene, previewCam);
  });
  return <div ref={host} style={{ position: 'absolute', left: `${x}rem`, top: `${y}rem`, width: `${w}rem`, height: `${h}rem`, background: '#000', boxShadow: 'inset 1rem 1rem 0 #373633, inset -1rem -1rem 0 #fffefa' }} />;
}

// ------------------------------------------------------------------ survival screens
const ARMOR_GHOSTS = ['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots'];

export function SurvivalInventory() {
  const [c] = useController();
  if (!c) return null;
  const a = getArt();
  return (
    <Ctx.Provider value={c}>
      <Panel w={176} h={166} c={c}>
        {c.h.group('armor').map((r, i) => <SlotBox key={r.id} r={r} x={7} y={7 + i * 18} ghost={ARMOR_GHOSTS[i]} />)}
        <PlayerPreview x={25} y={7} w={51} h={72} mouse={c.mouse} />
        {c.h.group('offhand').map((r) => <SlotBox key={r.id} r={r} x={76} y={61} ghost="apple" />)}
        <div className="label" style={{ position: 'absolute', left: '97rem', top: '6rem' }}>Crafting</div>
        {c.h.group('craft').map((r, i) => <SlotBox key={r.id} r={r} x={97 + (i % 2) * 18} y={17 + Math.floor(i / 2) * 18} />)}
        <img src={a.arrow} style={{ position: 'absolute', left: '134rem', top: '27rem', width: '16rem', height: '11rem', imageRendering: 'pixelated' }} alt="" />
        {c.h.group('output').map((r) => <SlotBox key={r.id} r={r} x={153} y={27} />)}
        <PlayerSlots c={c} y={83} />
      </Panel>
      <CursorAndTooltip c={c} />
    </Ctx.Provider>
  );
}

export function CraftingTableScreen() {
  const [c] = useController();
  if (!c) return null;
  const a = getArt();
  return (
    <Ctx.Provider value={c}>
      <Panel w={176} h={166} c={c}>
        <div className="label" style={{ position: 'absolute', left: '28rem', top: '5rem' }}>Crafting</div>
        {c.h.group('craft').map((r, i) => <SlotBox key={r.id} r={r} x={29 + (i % 3) * 18} y={16 + Math.floor(i / 3) * 18} />)}
        <img src={a.arrow} style={{ position: 'absolute', left: '89rem', top: '35rem', width: '22rem', height: '15rem', imageRendering: 'pixelated' }} alt="" />
        {c.h.group('output').map((r) => <SlotBox key={r.id} r={r} x={119} y={30} big />)}
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '72rem' }}>Inventory</div>
        <PlayerSlots c={c} y={83} />
      </Panel>
      <CursorAndTooltip c={c} />
    </Ctx.Provider>
  );
}

export function ChestScreen() {
  const [c] = useController();
  if (!c) return null;
  return (
    <Ctx.Provider value={c}>
      <Panel w={176} h={166} c={c}>
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '5rem' }}>Chest</div>
        {c.h.group('chest').map((r, i) => <SlotBox key={r.id} r={r} x={7 + (i % 9) * 18} y={17 + Math.floor(i / 9) * 18} />)}
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '72rem' }}>Inventory</div>
        <PlayerSlots c={c} y={83} />
      </Panel>
      <CursorAndTooltip c={c} />
    </Ctx.Provider>
  );
}

export function FurnaceScreen() {
  const [c] = useController();
  const f = useStore(ui, (s) => s.furnace);
  if (!c) return null;
  const a = getArt();
  const flameH = Math.round(f.burn * 14);
  const arrowW = Math.round(f.cook * 23);
  return (
    <Ctx.Provider value={c}>
      <Panel w={176} h={166} c={c}>
        <div className="label" style={{ position: 'absolute', left: 0, right: 0, top: '5rem', textAlign: 'center' }}>Furnace</div>
        {c.h.group('furnace_in').map((r) => <SlotBox key={r.id} r={r} x={55} y={16} />)}
        <div style={{ position: 'absolute', left: '56rem', top: '36rem', width: '14rem', height: '14rem', backgroundImage: `url(${a.flame})`, backgroundSize: '14rem 14rem', imageRendering: 'pixelated' }}>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '14rem', height: `${flameH}rem`, backgroundImage: `url(${a.flameFill})`, backgroundSize: '14rem 14rem', backgroundPosition: 'bottom', imageRendering: 'pixelated' }} />
        </div>
        {c.h.group('furnace_fuel').map((r) => <SlotBox key={r.id} r={r} x={55} y={52} ghost="coal" />)}
        <div style={{ position: 'absolute', left: '79rem', top: '34rem', width: '23rem', height: '16rem', backgroundImage: `url(${a.arrow})`, backgroundSize: '23rem 16rem', imageRendering: 'pixelated' }}>
          <div style={{ width: `${arrowW}rem`, height: '16rem', backgroundImage: `url(${a.arrowFill})`, backgroundSize: '23rem 16rem', imageRendering: 'pixelated' }} />
        </div>
        {c.h.group('furnace_out').map((r) => <SlotBox key={r.id} r={r} x={111} y={30} big />)}
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '72rem' }}>Inventory</div>
        <PlayerSlots c={c} y={83} />
      </Panel>
      <CursorAndTooltip c={c} />
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ rune table
export function RuneTableScreen() {
  const [c] = useController();
  if (!c) return null;
  const g = engine.game!;
  const p = g.player;
  const item = g.runeSlots.get(0), shards = g.runeSlots.get(1);
  const offers = item && canInscribe(item) ? runeOffers(item, p.runeSeed) : [];
  return (
    <Ctx.Provider value={c}>
      <Panel w={176} h={166} c={c}>
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '5rem' }}>Rune Table</div>
        <div style={{ position: 'absolute', left: '8rem', top: '20rem', width: '44rem', height: '52rem', background: '#3c3548', boxShadow: 'inset 1rem 1rem 0 #29232f, inset -1rem -1rem 0 #4d4560' }} />
        {c.h.group('rune_item').map((r) => <SlotBox key={r.id} r={r} x={11} y={40} ghost="iron_pickaxe" />)}
        {c.h.group('rune_shards').map((r) => <SlotBox key={r.id} r={r} x={31} y={40} ghost="rune_shard" />)}
        {[0, 1, 2].map((i) => {
          const o = offers[i];
          const top = 14 + i * 19;
          if (!o) return <div key={i} className="rune-offer empty" style={{ top: `${top}rem` }} />;
          const ok = p.creative || (p.xpLevel >= o.minLevel && (shards?.count ?? 0) >= o.cost);
          const list = Object.entries(o.runes) as [RuneId, number][];
          const title = list.map(([id, l]) => runeLabel(id, l)).join(', ');
          return (
            <div key={i} className={'rune-offer' + (ok ? '' : ' disabled')} style={{ top: `${top}rem` }} title={`${title}\nNeeds level ${o.minLevel}. Costs ${o.cost} level${o.cost > 1 ? 's' : ''} and ${o.cost} rune shard${o.cost > 1 ? 's' : ''}.`}
              data-testid={`rune-offer-${i + 1}`}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); if (ok && g.inscribe(o.tier)) c.refresh(); }}>
              <div className="cost"><ItemIcon id="rune_shard" style={{ left: 0, top: 0 }} /><div className="count">{o.cost}</div></div>
              <div className="name">{runeLabel(list[0][0], list[0][1])}{list.length > 1 ? ` +${list.length - 1}` : ''}</div>
              <div className="lvl">{o.minLevel}</div>
            </div>
          );
        })}
        <div className="label" style={{ position: 'absolute', left: '8rem', top: '72rem' }}>Inventory</div>
        <PlayerSlots c={c} y={83} />
      </Panel>
      <CursorAndTooltip c={c} />
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ villager trading
function TradeItem({ id, n, ench }: { id: string; n: number; ench?: boolean }) {
  return (
    <div className="ti">
      <ItemIcon id={id} style={{ left: 0, top: 0 }} />
      {ench && <Glint id={id} style={{ left: 0, top: 0 }} />}
      {n > 1 && <div className="count">{n}</div>}
    </div>
  );
}

export function TradeScreen() {
  const [c] = useController();
  const [hover, setHover] = useState<number | null>(null);
  const [scroll, setScroll] = useState(0);
  /** Touch: a vertical swipe over the offers scrolls them; a tap trades. */
  const swipe = useRef<{ y: number; start: number; moved: boolean } | null>(null);
  if (!c) return null;
  const g = engine.game!;
  const v = g.tradeWith;
  if (!v || !v.job) return null;
  const ROWS = 7;
  const offers = v.trades;
  const showLocked = v.level < 4;
  const total = offers.length + (showLocked ? 1 : 0);
  const maxScroll = Math.max(0, total - ROWS);
  const sc = Math.min(scroll, maxScroll);
  const lvl = v.level;
  const xpFrac = lvl >= 4 ? 1 : (v.tradeXp - LEVEL_XP[lvl - 1]) / (LEVEL_XP[lvl] - LEVEL_XP[lvl - 1]);
  const disc = g.discount(v.villageId);
  const hov = hover !== null ? offers[hover] : null;
  const hovCost = hov ? g.tradeCost(v, hov) : null;
  const name = (id: string) => getItem(id).name;
  return (
    <Ctx.Provider value={c}>
      <Panel w={276} h={166} c={c}>
        <div className="label" style={{ position: 'absolute', left: '6rem', top: '5rem' }}>Trades</div>
        <div onWheel={(e) => setScroll((q) => Math.max(0, Math.min(maxScroll, q + Math.sign(e.deltaY))))} data-testid="trade-list"
          onPointerDown={(e) => { if (e.pointerType !== 'mouse') swipe.current = { y: e.clientY, start: sc, moved: false }; }}
          onPointerMove={(e) => {
            const sw = swipe.current;
            if (!sw || e.pointerType === 'mouse') return;
            const dy = e.clientY - sw.y;
            if (Math.abs(dy) > 8) sw.moved = true;
            if (sw.moved) setScroll(Math.max(0, Math.min(maxScroll, sw.start - Math.round(dy / (20 * ui.get().gui)))));
          }}
          onPointerUp={() => { setTimeout(() => { swipe.current = null; }, 0); }}
          onPointerCancel={() => { swipe.current = null; }}>
          {Array.from({ length: ROWS }, (_, row) => {
            const i = row + sc;
            const top = `${16 + row * 20}rem`;
            if (i === offers.length && showLocked) {
              return <div key={row} className="trade-offer locked" style={{ top }}>Reaches {LEVEL_NAMES[lvl]}: 2 more trades</div>;
            }
            const t = offers[i];
            if (!t) return null;
            const { cost, cost2 } = g.tradeCost(v, t);
            const sold = t.uses >= t.maxUses;
            const ok = g.canTrade(v, i);
            return (
              <div key={row} className={'trade-offer' + (ok ? '' : ' disabled') + (hover === i ? ' selected' : '')} style={{ top }}
                data-testid={`trade-offer-${i}`}
                title={sold ? 'Sold out: the villager restocks at its workstation' : 'Click to trade (Shift-click: as many as you can)'}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); if (!recentTouch()) { g.trade(v, i, e.shiftKey); c.refresh(); } }}
                onPointerUp={(e) => { if (e.pointerType !== 'mouse' && !swipe.current?.moved) { g.trade(v, i, false); c.refresh(); } }}>
                <TradeItem id={cost[0]} n={cost[1]} />
                {cost2 ? <TradeItem id={cost2[0]} n={cost2[1]} /> : <div className="ti" />}
                <div className="arrow">&gt;</div>
                <TradeItem id={t.result[0]} n={t.result[1]} ench={!!t.ench} />
                {sold && <div className="sold">SOLD OUT</div>}
              </div>
            );
          })}
        </div>
        <div className="label" style={{ position: 'absolute', left: '112rem', top: '5rem', width: '160rem', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: `${v.name.length + LEVEL_NAMES[lvl - 1].length + PROFESSION_NAMES[v.job].length > 24 ? 7 : 8}rem` }} data-testid="trade-title">
          {v.name}, {LEVEL_NAMES[lvl - 1]} {PROFESSION_NAMES[v.job]}
        </div>
        <div className="trade-xp" style={{ left: '112rem', top: '17rem', width: '100rem' }}><div style={{ width: `${Math.round(Math.max(0, Math.min(1, xpFrac)) * 100)}rem` }} /></div>
        <div className="label" style={{ position: 'absolute', left: '112rem', top: '27rem', fontSize: '7rem', lineHeight: '10rem', width: '158rem' }}>
          {hov && hovCost ? (
            <>
              <div>Give {hovCost.cost[1]} {name(hovCost.cost[0])}{hovCost.cost2 ? ` and ${hovCost.cost2[1]} ${name(hovCost.cost2[0])}` : ''}</div>
              <div>Get {hov.result[1]} {name(hov.result[0])}{hov.ench ? ' (with runes)' : ''}</div>
              <div style={{ color: '#555' }}>{hov.uses >= hov.maxUses ? 'Sold out until restocked' : `${hov.maxUses - hov.uses} left`}</div>
            </>
          ) : <div style={{ color: '#555' }}>Hover over an offer to see it. Click to trade.</div>}
          {disc !== 0 && (
            <div style={{ color: disc > 0 ? '#2f7a1f' : '#9a2a1a' }} data-testid="trade-standing">
              {g.villages.name(v.villageId)} sees you as {g.villages.standing(v.villageId).name}: prices {Math.round(Math.abs(disc) * 100)}% {disc > 0 ? 'lower' : 'higher'}
            </div>
          )}
        </div>
        <div className="label" style={{ position: 'absolute', left: '112rem', top: '72rem' }}>Inventory</div>
        <PlayerSlots c={c} y={83} x={109} />
      </Panel>
      <CursorAndTooltip c={c} hoverStack={hov ? { id: hov.result[0], count: hov.result[1], ...(hov.ench ? { ench: hov.ench } : {}) } : undefined} />
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ creative
type Tab = Category | 'search' | 'inventory';
const TOP_TABS: Tab[] = ['building', 'decoration', 'natural', 'functional', 'tools'];
const BOTTOM_TABS: Tab[] = ['combat', 'food', 'ingredients', 'spawn'];
const TAB_ICON: Record<Tab, string> = {
  building: 'bricks', decoration: 'lantern', natural: 'grass', functional: 'crafting_table', tools: 'iron_pickaxe', combat: 'iron_sword',
  food: 'apple', ingredients: 'stick', spawn: 'spawn_pig', search: 'flint', inventory: 'chest',
};

export function CreativeScreen() {
  const [c] = useController();
  const [tab, setTab] = useState<Tab>((engine.game?.creativeTab as Tab) ?? 'building');
  const [query, setQuery] = useState('');
  const [scroll, setScroll] = useState(0);
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Touch: a vertical swipe over the catalogue scrolls it; a tap picks an item. */
  const swipe = useRef<{ y: number; start: number; moved: boolean } | null>(null);
  useEffect(() => { if (tab === 'search') searchRef.current?.focus(); }, [tab]);
  if (!c) return null;
  const g = engine.game!;
  const items = tab === 'search'
    ? ITEMS.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.id.includes(query.toLowerCase()))
    : tab === 'inventory' ? [] : ITEMS.filter((i) => i.category === tab);
  const rows = Math.ceil(items.length / 9);
  const maxScroll = Math.max(0, rows - 5);
  const sc = Math.min(scroll, maxScroll);
  const visible = items.slice(sc * 9, sc * 9 + 45);
  const W = 195, H = 136;
  const hoveredItem = hoverCat ? getItem(hoverCat) : null;

  const pickCatalog = (def: ItemDef, e: { button: number; shiftKey: boolean; preventDefault?: () => void; stopPropagation?: () => void }) => {
    e.preventDefault?.(); e.stopPropagation?.();
    const cur = c.h.cursor.stack;
    if (e.shiftKey) {
      g.inventory.add(makeStack(def.id, def.maxStack));
    } else if (cur) {
      if (cur.id === def.id && e.button === 0 && cur.count < maxStackOf(def.id)) c.h.cursor.stack = { ...cur, count: cur.count + 1 };
      else c.h.cursor.stack = null;
    } else {
      c.h.cursor.stack = makeStack(def.id, e.button === 2 ? 1 : def.maxStack);
    }
    c.refresh();
  };
  const choose = (t: Tab) => { setTab(t); setScroll(0); g.creativeTab = t; };
  const onWheel = (e: RWheelEvent) => setScroll((s) => Math.max(0, Math.min(maxScroll, s + Math.sign(e.deltaY))));

  const tabEl = (t: Tab, i: number, top: boolean, right = false) => (
    <div
      key={t}
      className={'tab ' + (top ? 'top' : 'bottom') + (tab === t ? ' active' : '')}
      title={t === 'search' ? 'Search Items' : t === 'inventory' ? 'Survival Inventory' : CATEGORY_LABELS[t as Category]}
      data-testid={`tab-${t}`}
      style={{ left: `${right ? W - 28 : i * 28}rem`, top: top ? `${tab === t ? -31 : -29}rem` : `${H - 1}rem` }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); choose(t); }}
    >
      <ItemIcon id={TAB_ICON[t]} />
    </div>
  );

  return (
    <Ctx.Provider value={c}>
      <div className="screen" data-testid="creative-screen" onContextMenu={(e) => e.preventDefault()}>
        <div className="overlay-dim" onMouseDown={(e) => { if (c.h.cursor.stack) { c.h.dropCursor(e.button === 2 ? 1 : 0); c.refresh(); } }} />
        <div style={{ position: 'absolute', left: `calc(50% - ${W / 2}rem)`, top: `calc(50% - ${H / 2}rem)`, width: `${W}rem`, height: `${H}rem` }}>
          {TOP_TABS.map((t, i) => tabEl(t, i, true))}
          {tabEl('search', 0, true, true)}
          {BOTTOM_TABS.map((t, i) => tabEl(t, i, false))}
          {tabEl('inventory', 0, false, true)}
          <div className="panel" style={{ left: 0, top: 0, width: `${W}rem`, height: `${H}rem`, zIndex: 2 }}>
            {tab !== 'inventory' && (
              <div className="label" style={{ position: 'absolute', left: '8rem', top: '5rem' }}>
                {tab === 'search' ? 'Search Items' : CATEGORY_LABELS[tab as Category]}
              </div>
            )}
            {tab === 'search' && (
              <input ref={searchRef} autoFocus className="search" data-testid="creative-search" style={{ left: '82rem', top: '4rem', width: '88rem' }} value={query}
                onChange={(e) => { setQuery(e.target.value); setScroll(0); }} onMouseDown={(e) => e.stopPropagation()} />
            )}
            {tab !== 'inventory' && (
              <>
                <div onWheel={onWheel} data-testid="creative-grid" style={{ touchAction: 'none' }}
                  onPointerDown={(e) => { if (e.pointerType !== 'mouse') swipe.current = { y: e.clientY, start: sc, moved: false }; }}
                  onPointerMove={(e) => {
                    const sw = swipe.current;
                    if (!sw || e.pointerType === 'mouse') return;
                    const dy = e.clientY - sw.y;
                    if (Math.abs(dy) > 8) sw.moved = true;
                    if (sw.moved) setScroll(Math.max(0, Math.min(maxScroll, sw.start - Math.round(dy / (18 * ui.get().gui)))));
                  }}
                  onPointerUp={() => { setTimeout(() => { swipe.current = null; }, 0); }}>
                  {Array.from({ length: 45 }, (_, i) => {
                    const def = visible[i];
                    return (
                      <div key={i} className="slot" data-testid={def ? `cat-${def.id}` : undefined}
                        style={{ left: `${7 + (i % 9) * 18}rem`, top: `${17 + Math.floor(i / 9) * 18}rem` }}
                        onMouseDown={(e) => { if (def && !recentTouch()) pickCatalog(def, e); }}
                        onPointerUp={(e) => { if (def && e.pointerType !== 'mouse' && !swipe.current?.moved) pickCatalog(def, { button: 0, shiftKey: false }); }}
                        onMouseEnter={() => setHoverCat(def ? def.id : null)}
                        onMouseLeave={() => setHoverCat(null)}>
                        {def && <ItemIcon id={def.id} />}
                        {def && hoverCat === def.id && <div className="hover" />}
                      </div>
                    );
                  })}
                </div>
                <div className="scrollbar-track" style={{ left: '174rem', top: '17rem', height: '90rem' }}>
                  <div className={'scrollbar-thumb' + (maxScroll === 0 ? ' disabled' : '')}
                    style={{ top: `${maxScroll ? (sc / maxScroll) * 73 : 0}rem` }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const startY = e.clientY, start = sc, gui = ui.get().gui;
                      const move = (ev: MouseEvent) => setScroll(Math.max(0, Math.min(maxScroll, Math.round(start + ((ev.clientY - startY) / gui / 73) * maxScroll))));
                      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }} />
                </div>
              </>
            )}
            {tab === 'inventory' && (
              <>
                {c.h.group('armor').map((r, i) => <SlotBox key={r.id} r={r} x={i < 2 ? 53 : 107} y={5 + (i % 2) * 22} ghost={ARMOR_GHOSTS[i]} />)}
                <PlayerPreview x={73} y={5} w={32} h={43} mouse={c.mouse} />
                {c.h.group('offhand').map((r) => <SlotBox key={r.id} r={r} x={34} y={19} ghost="apple" />)}
                {c.h.group('main').map((r, i) => <SlotBox key={r.id} r={r} x={8 + (i % 9) * 18} y={53 + Math.floor(i / 9) * 18} />)}
              </>
            )}
            {c.h.group('hotbar').map((r, i) => <SlotBox key={r.id} r={r} x={8 + i * 18} y={111} />)}
            <div className="slot" data-testid="destroy-slot" style={{ left: '172rem', top: '111rem' }}
              title="Destroy Item (shift-click: clear inventory)"
              onMouseDown={(e) => {
                e.stopPropagation();
                if (e.shiftKey) { for (let i = 0; i < g.inventory.size; i++) g.inventory.slots[i] = null; g.inventory.changed(); }
                else c.h.cursor.stack = null;
                c.refresh();
              }}>
              <div className="item" style={{ backgroundImage: `url(${getArt().trash})`, backgroundSize: '16rem 16rem', imageRendering: 'pixelated' }} />
            </div>
          </div>
        </div>
      </div>
      <CursorAndTooltip c={c} hoverStack={hoveredItem ? makeStack(hoveredItem.id, 1) : undefined} />
    </Ctx.Provider>
  );
}

export type { SlotGroup };
