import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/Engine';
import { Button } from './widgets';

/**
 * THE END (2.2): shown once per world after the Hollowdrake is beaten and the
 * player steps into the Roost's Stargate. Slow scrolling words over a field of
 * stars - an ORIGINAL little story of the journey - then the credits, then home.
 * Tap, click or press a key to speed it up; Skip goes straight home.
 */
export const END_STORY: string[] = [
  'THE END',
  '',
  'You came into a land of square trees and green hills,',
  'with nothing in your hands but your hands.',
  '',
  'You punched a tree. You built a crafting table.',
  'You lit your first torch, and the night stepped back.',
  '',
  'You built a home. You found friends:',
  'a hound with a blue collar, villagers who knew your name.',
  '',
  'You went down into the Cinderdeep,',
  'where the lava sea glows and the embers whisper.',
  '',
  'You rose through a Stargate into the Starhollow,',
  'where islands float in the quiet between the stars.',
  '',
  'You rang the four Storm Bells,',
  'and the Hollowdrake’s shield fell like rain.',
  '',
  'The Hollowdrake was never wicked.',
  'It guarded the stars because no one else would,',
  'and it had been alone for a very long time.',
  'Now it rests, and the stars are free to shine',
  'on every world you will ever build.',
  '',
  'But this is not really the end.',
  '',
  'Your world is still out there: the house you built,',
  'the farm, the tower, the path you dug through the hill.',
  'There are islands you haven’t flown to yet,',
  'caves you haven’t lit, and things nobody has built before.',
  '',
  'So go home. Build something wonderful.',
  'The stars will be watching.',
  '',
  '',
  '',
  'BLOCKFELL',
  'An original game',
  '',
  'Made by Avizent',
  '',
  'Every block, creature, picture, sound and word',
  'was made for this game.',
  '',
  'Thank you for playing.',
];

/** Seconds the story takes to scroll by at normal speed. */
const DURATION = 70;

export function TheEnd({ onDone }: { onDone: () => void }) {
  const [y, setY] = useState(0);
  const fast = useRef(false);
  const done = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  // the stars: a few hundred twinkling points
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const stars = Array.from({ length: 360 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 2 : 1, p: Math.random() * 6.28, c: Math.random() < 0.2 ? '#bfa8ff' : Math.random() < 0.3 ? '#a8eaff' : '#ffffff' }));
    let raf = 0;
    const draw = (t: number) => {
      c.width = c.clientWidth; c.height = c.clientHeight;
      ctx.fillStyle = '#05040f';
      ctx.fillRect(0, 0, c.width, c.height);
      for (const s of stars) {
        ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t / 900 + s.p));
        ctx.fillStyle = s.c;
        ctx.fillRect(Math.floor(s.x * c.width), Math.floor(s.y * c.height), s.s * 2, s.s * 2);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  // the scroll
  useEffect(() => {
    let raf = 0, last = performance.now(), pos = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const el = textRef.current;
      const total = (el?.scrollHeight ?? 1000) + window.innerHeight;
      pos += (total / DURATION) * dt * (fast.current ? 6 : 1);
      setY(pos);
      if (pos >= total) { finish(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const speed = (on: boolean) => () => { fast.current = on; };
    const down = speed(true), up = speed(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  return (
    <div className="screen the-end" data-testid="the-end" style={{ background: '#05040f', overflow: 'hidden' }}>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div ref={textRef} style={{ position: 'absolute', left: 0, right: 0, top: '100%', transform: `translateY(${-y}px)`, textAlign: 'center' }}>
        {END_STORY.map((line, i) => (
          <div key={i} className={line === 'THE END' || line === 'BLOCKFELL' ? 'end-title shadow' : 'shadow'}
            style={{ minHeight: '12rem', lineHeight: '12rem', color: line === line.toUpperCase() && line.length > 2 ? '#ffe9a8' : '#e8e4ff' }}>{line}</div>
        ))}
      </div>
      <div className="end-skip">
        <Button size="third" testId="btn-end-skip" onClick={() => { engine.audio.unlock(); finish(); }}>Skip</Button>
      </div>
    </div>
  );
}
