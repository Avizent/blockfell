import { CSSProperties, ReactNode, useRef } from 'react';
import { engine } from '../engine/Engine';
import { useStore } from '../core/store';
import { ui } from './uiStore';
import type { Slot } from '../inventory/ItemStack';
import { getItem } from '../inventory/ItemRegistry';

export function click(): void {
  engine.audio.unlock();
  engine.audio.play('click', undefined, undefined, undefined, 0.5);
}

export function Button(props: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; size?: 'half' | 'third' | 'wide' | 'small' | 'full';
  title?: string; style?: CSSProperties; testId?: string;
}) {
  const cls = 'btn' + (props.size && props.size !== 'full' ? ' ' + props.size : '');
  return (
    <button
      className={cls}
      disabled={props.disabled}
      title={props.title}
      style={props.style}
      data-testid={props.testId}
      onClick={() => { if (!props.disabled) { click(); props.onClick?.(); } }}
    >
      {props.children}
    </button>
  );
}

/** Slider with pixel knob. value in [min,max]; label renders the text inside. */
export function Slider(props: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = props.width ?? 150;
  const frac = (props.value - props.min) / (props.max - props.min);
  const set = (clientX: number) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    let f = (clientX - r.left - 4 * ui.get().gui) / (r.width - 8 * ui.get().gui);
    f = Math.max(0, Math.min(1, f));
    let v = props.min + f * (props.max - props.min);
    const step = props.step ?? 1;
    v = Math.round(v / step) * step;
    if (v !== props.value) props.onChange(Number(v.toFixed(4)));
  };
  return (
    <div
      ref={ref}
      className="slider"
      style={{ width: `${w}rem` }}
      onMouseDown={(e) => {
        set(e.clientX);
        const move = (ev: MouseEvent) => set(ev.clientX);
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); click(); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
    >
      <div className="knob" style={{ left: `calc(${frac} * (${w}rem - 10rem))` }} />
      <span>{props.label}</span>
    </div>
  );
}

export function ItemIcon({ id, style }: { id: string; style?: CSSProperties }) {
  useStore(ui, (s) => s.optionsVersion);
  return <div className="item" style={{ ...engine.icons.style(id), ...style }} />;
}

/** Shimmer drawn over rune-inscribed items, masked to the icon's own pixels. */
export function Glint({ id, style }: { id: string; style?: CSSProperties }) {
  const st = engine.icons.style(id);
  const mask = `${st.backgroundImage}`;
  return (
    <div className="item glint" style={{
      WebkitMaskImage: mask, maskImage: mask,
      WebkitMaskSize: st.backgroundSize as string, maskSize: st.backgroundSize as string,
      WebkitMaskPosition: st.backgroundPosition as string, maskPosition: st.backgroundPosition as string,
      ...style,
    }} />
  );
}

/** Icon + count + durability bar for a stack. */
export function StackView({ stack }: { stack: Slot }) {
  if (!stack) return null;
  const def = getItem(stack.id);
  const dur = def.durability && stack.damage ? 1 - stack.damage / def.durability : null;
  return (
    <>
      <ItemIcon id={stack.id} />
      {stack.ench && Object.keys(stack.ench).length > 0 && <Glint id={stack.id} />}
      {stack.count > 1 && <div className="count">{stack.count}</div>}
      {dur !== null && (
        <div className="durability">
          <div style={{ width: `${Math.round(13 * dur)}rem`, background: `hsl(${Math.round(dur * 120)}, 100%, 50%)` }} />
        </div>
      )}
    </>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="shadow" style={{ textAlign: 'center', ...style }}>{children}</div>;
}
