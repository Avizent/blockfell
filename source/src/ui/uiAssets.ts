import type { TextureAtlas } from '../meshing/TextureAtlas';

/**
 * ORIGINAL interface artwork, generated at start-up as tiny PNG data URLs and
 * displayed with nearest-neighbour scaling (pixel-exact at every GUI scale).
 */
type Pal = Record<string, string>;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function fromMap(map: string[], pal: Pal): string {
  const h = map.length, w = Math.max(...map.map((r) => r.length));
  const [c, ctx] = canvas(w, h);
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return c.toDataURL();
}

const HEART_SHAPE = [
  '.##...##.',
  '####.####',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
];

function heartMap(fill: 'full' | 'half' | 'empty'): string[] {
  const inside = (x: number, y: number) => y >= 0 && y < HEART_SHAPE.length && HEART_SHAPE[y][x] === '#';
  return HEART_SHAPE.map((row, y) => [...row].map((ch, x) => {
    if (ch !== '#') return '.';
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) return 'o';
    if (fill === 'empty' || (fill === 'half' && x > 4)) return 'e';
    if ((x === 2 && y === 2) || (x === 2 && y === 1) || (x === 1 && y === 2)) return 'w';
    if (y >= 4) return 'R';
    return 'r';
  }).join(''));
}

const FOOD = [
  '......ob.',
  '.....obbo',
  '....oob..',
  '..ooomo..',
  '.omhmmo..',
  'omhmmmo..',
  'ommmmo...',
  '.ommo....',
  '..oo.....',
];
const ARMOR = [
  'oo.....oo',
  'oLo...oLo',
  'oLLoooLLo',
  'oLLLLLLLo',
  '.oLLLLDo.',
  '.oLLLLDo.',
  '.oLLLLDo.',
  '.ooooooo.',
];
const BUBBLE = [
  '...ooo...',
  '..owwbo..',
  '.owbbbbo.',
  '.obbbbbo.',
  '.obbbbbo.',
  '..obbbo..',
  '...ooo...',
];

export interface HudIcons {
  heart: { full: string; half: string; empty: string; fullFlash: string };
  food: { full: string; half: string; empty: string };
  armor: { full: string; half: string; empty: string };
  bubble: string;
  logo: string;
  logoW: number;
  logoH: number;
  grassThumb: string;
}

export let hudIcons: HudIcons;

function halfMap(map: string[], keepLeft: boolean, emptyChar: string): string[] {
  return map.map((row) => [...row].map((ch, x) => {
    const inner = ch !== '.' && ch !== 'o';
    if (!inner) return ch;
    return (keepLeft ? x > 4 : x <= 4) ? emptyChar : ch;
  }).join(''));
}

function emptyMap(map: string[], emptyChar: string): string[] {
  return map.map((row) => [...row].map((ch) => (ch !== '.' && ch !== 'o' ? emptyChar : ch)).join(''));
}

/** Builds all UI images and exposes the backgrounds as CSS variables. */
export function buildUiAssets(atlas: TextureAtlas): void {
  const root = document.documentElement.style;

  // button noise (subtle stone grain)
  {
    const [c, ctx] = canvas(64, 64);
    const img = ctx.createImageData(64, 64);
    for (let i = 0; i < 64 * 64; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.random() < 0.35 ? 14 : 0;
    }
    ctx.putImageData(img, 0, 0);
    root.setProperty('--btn-noise', `url(${c.toDataURL()})`);
  }
  // menu background: darkened dirt tile
  {
    const [c, ctx] = canvas(16, 16);
    const d = new Uint8ClampedArray(atlas.get('dirt').d);
    for (let i = 0; i < d.length; i += 4) { d[i] *= 0.26; d[i + 1] *= 0.26; d[i + 2] *= 0.28; }
    ctx.putImageData(new ImageData(d, 16, 16), 0, 0);
    root.setProperty('--dirt-bg', `url(${c.toDataURL()})`);
  }
  // hotbar strip 182x22 (9 slots, 20px pitch)
  {
    const [c, ctx] = canvas(182, 22);
    ctx.fillStyle = 'rgba(12,12,14,0.92)';
    ctx.fillRect(0, 0, 182, 22);
    for (let i = 0; i < 9; i++) {
      const x = 1 + i * 20;
      ctx.fillStyle = 'rgba(96,96,100,0.78)'; ctx.fillRect(x, 1, 20, 20);
      ctx.fillStyle = 'rgba(40,40,44,0.9)'; ctx.fillRect(x + 1, 2, 18, 18);
      ctx.fillStyle = 'rgba(150,150,156,0.55)'; ctx.fillRect(x + 1, 19, 18, 1); ctx.fillRect(x + 18, 2, 1, 18);
      ctx.fillStyle = 'rgba(20,20,22,0.9)'; ctx.fillRect(x + 1, 2, 17, 1); ctx.fillRect(x + 1, 2, 1, 17);
    }
    root.setProperty('--hotbar-bg', `url(${c.toDataURL()})`);
  }
  {
    const [c, ctx] = canvas(24, 24);
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, 24, 24);
    ctx.clearRect(3, 3, 18, 18);
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(1, 1, 22, 2); ctx.fillRect(1, 1, 2, 22); ctx.fillRect(1, 21, 22, 2); ctx.fillRect(21, 1, 2, 22);
    ctx.fillStyle = '#9d9d9d'; ctx.fillRect(3, 3, 18, 1); ctx.fillRect(3, 3, 1, 18);
    ctx.clearRect(0, 0, 1, 1); ctx.clearRect(23, 0, 1, 1); ctx.clearRect(0, 23, 1, 1); ctx.clearRect(23, 23, 1, 1);
    root.setProperty('--hotbar-sel', `url(${c.toDataURL()})`);
  }
  {
    const [c, ctx] = canvas(22, 22);
    ctx.fillStyle = 'rgba(12,12,14,0.92)'; ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = 'rgba(96,96,100,0.78)'; ctx.fillRect(1, 1, 20, 20);
    ctx.fillStyle = 'rgba(40,40,44,0.9)'; ctx.fillRect(2, 2, 18, 18);
    root.setProperty('--offhand-bg', `url(${c.toDataURL()})`);
  }
  // experience bar
  for (const [name, fill, edge] of [['--xp-empty', '#1d2a14', '#0a0f07'], ['--xp-full', '#86e62c', '#3f7d10']] as const) {
    const [c, ctx] = canvas(182, 5);
    ctx.fillStyle = edge; ctx.fillRect(0, 0, 182, 5);
    ctx.fillStyle = fill; ctx.fillRect(1, 1, 180, 3);
    if (name === '--xp-full') { ctx.fillStyle = '#c4ff7a'; ctx.fillRect(1, 1, 180, 1); }
    for (let i = 1; i < 18; i++) { ctx.fillStyle = edge; ctx.fillRect(Math.round(i * 182 / 18), 1, 1, 3); }
    root.setProperty(name, `url(${c.toDataURL()})`);
  }

  const heartPal: Pal = { o: '#1a0a0a', r: '#e02530', R: '#a8141f', w: '#ffb6b6', e: 'rgba(40,8,8,0.8)' };
  const flashPal: Pal = { ...heartPal, o: '#ffffff' };
  const foodPal: Pal = { o: '#3a1a08', b: '#efe8d8', m: '#b3602e', h: '#e39456', e: 'rgba(40,20,8,0.75)' };
  const armorPal: Pal = { o: '#1c1c1c', L: '#dcdcdc', D: '#9a9a9a', e: 'rgba(30,30,30,0.75)' };

  const logo = buildLogo(atlas);
  const grass = atlas.tileCanvas('grass_side', 2);
  hudIcons = {
    heart: {
      full: fromMap(heartMap('full'), heartPal),
      half: fromMap(heartMap('half'), heartPal),
      empty: fromMap(heartMap('empty'), heartPal),
      fullFlash: fromMap(heartMap('empty'), flashPal),
    },
    food: {
      full: fromMap(FOOD, foodPal),
      half: fromMap(halfMap(FOOD, false, 'e'), foodPal),
      empty: fromMap(emptyMap(FOOD, 'e'), foodPal),
    },
    armor: {
      full: fromMap(ARMOR, armorPal),
      half: fromMap(halfMap(ARMOR, true, 'e'), armorPal),
      empty: fromMap(emptyMap(ARMOR, 'e'), armorPal),
    },
    bubble: fromMap(BUBBLE, { o: '#1d3c8a', w: '#ffffff', b: '#6fa8ff' }),
    logo: logo.url,
    logoW: logo.w,
    logoH: logo.h,
    grassThumb: grass.toDataURL(),
  };
}

/**
 * Title logo: the word BLOCKFELL set in the game's own pixel font, where every
 * font pixel becomes a small stone block with a bevel and a dark extruded side.
 */
function buildLogo(atlas: TextureAtlas): { url: string; w: number; h: number } {
  const text = 'BLOCKFELL';
  const [, tctx] = canvas(80, 10);
  tctx.font = '8px Blockfell';
  tctx.textBaseline = 'alphabetic';
  tctx.fillStyle = '#fff';
  tctx.fillText(text, 0, 7);
  const tw = Math.ceil(tctx.measureText(text).width);
  const td = tctx.getImageData(0, 0, 80, 10).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < 80 && y < 10 && td[(y * 80 + x) * 4 + 3] > 128;
  const P = 6; // logo pixels per font pixel
  const depth = 3;
  const W = tw * P + depth + 2, H = 8 * P + depth + 2;
  const [c, ctx] = canvas(W, H);
  const stone = atlas.get('stone').d;
  const cobble = atlas.get('cobblestone').d;
  // extrusion (dark sides) first
  for (let y = 0; y < 8; y++) for (let x = 0; x < tw; x++) {
    if (!on(x, y)) continue;
    for (let d = depth; d >= 1; d--) {
      ctx.fillStyle = d === depth ? '#141414' : '#2c2c2c';
      ctx.fillRect(1 + x * P + d, 1 + y * P + d, P, P);
    }
  }
  // faces
  for (let y = 0; y < 8; y++) for (let x = 0; x < tw; x++) {
    if (!on(x, y)) continue;
    for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
      const gx = (x * P + px) & 15, gy = (y * P + py) & 15;
      const src = (y < 3 ? stone : cobble);
      const i = (gy * 16 + gx) * 4;
      let f = 1.12;
      if (py === 0 && !on(x, y - 1)) f = 1.45;
      if (px === 0 && !on(x - 1, y)) f = Math.max(f, 1.3);
      if (py === P - 1 && !on(x, y + 1)) f = 0.72;
      if (px === P - 1 && !on(x + 1, y)) f = Math.min(f, 0.82);
      ctx.fillStyle = `rgb(${Math.min(255, src[i] * f) | 0},${Math.min(255, src[i + 1] * f) | 0},${Math.min(255, src[i + 2] * f) | 0})`;
      ctx.fillRect(1 + x * P + px, 1 + y * P + py, 1, 1);
    }
  }
  // outline
  const img = ctx.getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (img.data[i + 3] > 0) { out.data.set(img.data.subarray(i, i + 4), i); continue; }
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && img.data[(yy * W + xx) * 4 + 3] > 0) near = true;
    }
    if (near) { out.data[i] = 8; out.data[i + 1] = 8; out.data[i + 2] = 8; out.data[i + 3] = 255; }
  }
  ctx.putImageData(out, 0, 0);
  return { url: c.toDataURL(), w: W, h: H };
}
