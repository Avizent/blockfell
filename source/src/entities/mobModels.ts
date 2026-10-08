import { BuiltModel, PartDef, buildModel } from './BoxModel';

/**
 * ORIGINAL cuboid creature designs. Coordinates are in model pixels; the model's
 * feet centre is the origin and it faces +Z.
 */
export type MobType = 'pig' | 'cow' | 'sheep' | 'chicken' | 'shambler' | 'skeleton' | 'goat' | 'rabbit' | 'crawler' | 'dustwalker' | 'villager' | 'sentinel' | 'hound'
  | 'cinderling' | 'smoulderer';
export type VillagerLook = 'none' | 'farmer' | 'smith' | 'mason' | 'scribe' | 'fletcher' | 'mapmaker';

const quad = (name: string, x: number, z: number, h: number, w: number, base: string, paint?: PartDef['paint']): PartDef => ({
  name, size: [w, h, w], pivot: [x, h, z], from: [-w / 2, -h, -w / 2], base, paint,
});

function pig(): PartDef[] {
  return [
    { name: 'body', size: [10, 8, 14], pivot: [0, 6, 0], from: [-5, 0, -7], base: '#e9a3a3',
      paint: (p) => { p.px('top', 2, 3, '#d98e90', 3, 2); p.px('left', 5, 2, '#d98e90', 3, 3); p.px('right', 8, 3, '#d98e90', 2, 2); } },
    { name: 'head', size: [8, 8, 8], pivot: [0, 10, 7], from: [-4, -4, 0], base: '#eeaaaa',
      paint: (p) => {
        p.px('front', 1, 2, '#ffffff', 2, 2); p.px('front', 5, 2, '#ffffff', 2, 2);
        p.px('front', 2, 3, '#2a1a1a'); p.px('front', 5, 3, '#2a1a1a');
        p.px('front', 1, 7, '#d98e90', 6, 1);
      } },
    { name: 'snout', size: [4, 3, 1], pivot: [0, 0, 0], from: [-2, -4, 8], base: '#f4b8bc', parent: 'head',
      paint: (p) => { p.px('front', 0, 1, '#9e5a5e'); p.px('front', 3, 1, '#9e5a5e'); } },
    { name: 'earL', size: [2, 2, 1], pivot: [0, 0, 0], from: [2, 4, 3], base: '#d98e90', parent: 'head' },
    { name: 'earR', size: [2, 2, 1], pivot: [0, 0, 0], from: [-4, 4, 3], base: '#d98e90', parent: 'head' },
    quad('legFL', 3, 5, 6, 4, '#e39c9c'),
    quad('legFR', -3, 5, 6, 4, '#e39c9c'),
    quad('legBL', 3, -5, 6, 4, '#e39c9c'),
    quad('legBR', -3, -5, 6, 4, '#e39c9c'),
  ];
}

function cow(): PartDef[] {
  const spots = (p: Parameters<NonNullable<PartDef['paint']>>[0]) => {
    p.px('top', 1, 2, '#efe8dc', 5, 4); p.px('top', 7, 10, '#efe8dc', 4, 5);
    p.px('left', 3, 2, '#efe8dc', 6, 4); p.px('right', 10, 3, '#efe8dc', 5, 5); p.px('back', 3, 2, '#efe8dc', 4, 4);
  };
  return [
    { name: 'body', size: [12, 10, 18], pivot: [0, 12, 0], from: [-6, 0, -9], base: '#5d4330', paint: spots },
    { name: 'head', size: [8, 8, 6], pivot: [0, 18, 9], from: [-4, -4, 0], base: '#5a4130',
      paint: (p) => {
        p.px('front', 1, 2, '#1a1410', 2, 1); p.px('front', 5, 2, '#1a1410', 2, 1);
        p.px('front', 3, 0, '#efe8dc', 2, 3);
      } },
    { name: 'muzzle', size: [6, 3, 1], pivot: [0, 0, 0], from: [-3, -4, 6], base: '#e7d8c6',
      parent: 'head', paint: (p) => { p.px('front', 1, 1, '#6b4d40'); p.px('front', 4, 1, '#6b4d40'); } },
    { name: 'hornL', size: [1, 3, 1], pivot: [0, 0, 0], from: [4, 2, 2], base: '#ddd3bd', parent: 'head' },
    { name: 'hornR', size: [1, 3, 1], pivot: [0, 0, 0], from: [-5, 2, 2], base: '#ddd3bd', parent: 'head' },
    quad('legFL', 4, 6, 12, 4, '#553d2c'),
    quad('legFR', -4, 6, 12, 4, '#553d2c'),
    quad('legBL', 4, -6, 12, 4, '#553d2c'),
    quad('legBR', -4, -6, 12, 4, '#553d2c'),
  ];
}

function sheep(): PartDef[] {
  return [
    { name: 'body', size: [12, 10, 16], pivot: [0, 12, 0], from: [-6, 0, -8], base: '#e9e9e4', noise: 0.08 },
    { name: 'head', size: [6, 6, 7], pivot: [0, 18, 8], from: [-3, -3, 0], base: '#cbb89f',
      paint: (p) => {
        p.fill('top', '#ecece6', 0.08, 3);
        p.px('front', 0, 0, '#ecece6', 6, 1);
        p.px('front', 1, 2, '#2a2420'); p.px('front', 4, 2, '#2a2420');
        p.px('front', 2, 4, '#a58f78', 2, 1);
      } },
    { name: 'earL', size: [2, 1, 2], pivot: [0, 0, 0], from: [3, 1, 3], base: '#bba58c', parent: 'head' },
    { name: 'earR', size: [2, 1, 2], pivot: [0, 0, 0], from: [-5, 1, 3], base: '#bba58c', parent: 'head' },
    quad('legFL', 4, 5, 12, 4, '#cbb89f', (p) => { p.px('front', 0, 0, '#e9e9e4', 4, 4); p.px('left', 0, 0, '#e9e9e4', 4, 4); p.px('right', 0, 0, '#e9e9e4', 4, 4); p.px('back', 0, 0, '#e9e9e4', 4, 4); }),
    quad('legFR', -4, 5, 12, 4, '#cbb89f'),
    quad('legBL', 4, -5, 12, 4, '#cbb89f'),
    quad('legBR', -4, -5, 12, 4, '#cbb89f'),
  ];
}

function chicken(): PartDef[] {
  return [
    { name: 'body', size: [6, 6, 8], pivot: [0, 5, 0], from: [-3, 0, -4], base: '#f2f2ee' },
    { name: 'head', size: [4, 6, 3], pivot: [0, 9, 3], from: [-2, 0, 0], base: '#f4f4f0',
      paint: (p) => { p.px('front', 0, 2, '#1c1c1c'); p.px('front', 3, 2, '#1c1c1c'); } },
    { name: 'beak', size: [4, 2, 2], pivot: [0, 0, 0], from: [-2, 2, 3], base: '#f0a430', parent: 'head' },
    { name: 'wattle', size: [2, 2, 1], pivot: [0, 0, 0], from: [-1, 0, 3], base: '#d63a30', parent: 'head' },
    { name: 'wingL', size: [1, 4, 6], pivot: [3, 9, 0], from: [0, -4, -3], base: '#e6e6e0' },
    { name: 'wingR', size: [1, 4, 6], pivot: [-3, 9, 0], from: [-1, -4, -3], base: '#e6e6e0' },
    { name: 'legL', size: [1, 5, 1], pivot: [1.5, 5, 0], from: [-0.5, -5, -0.5], base: '#e89a2a' },
    { name: 'legR', size: [1, 5, 1], pivot: [-1.5, 5, 0], from: [-0.5, -5, -0.5], base: '#e89a2a' },
  ];
}

function humanoid(opts: {
  skin: string; shirt: string; pants: string; shoes: string; hair?: string; face: PartDef['paint'];
  armW?: number; legW?: number; extra?: PartDef[]; torso?: PartDef['paint'];
}): PartDef[] {
  const aw = opts.armW ?? 4, lw = opts.legW ?? 4;
  return [
    { name: 'body', size: [8, 12, 4], pivot: [0, 12, 0], from: [-4, 0, -2], base: opts.shirt, paint: opts.torso },
    { name: 'head', size: [8, 8, 8], pivot: [0, 24, 0], from: [-4, 0, -4], base: opts.skin, paint: opts.face },
    { name: 'armL', size: [aw, 12, aw], pivot: [4 + aw / 2, 22, 0], from: [-aw / 2, -10, -aw / 2], base: opts.skin,
      paint: (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 0, opts.shirt, aw, 4); } },
    { name: 'armR', size: [aw, 12, aw], pivot: [-4 - aw / 2, 22, 0], from: [-aw / 2, -10, -aw / 2], base: opts.skin },
    { name: 'legL', size: [lw, 12, lw], pivot: [2, 12, 0], from: [-lw / 2, -12, -lw / 2], base: opts.pants,
      paint: (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 10, opts.shoes, lw, 2); p.fill('bottom', opts.shoes, 0.05, 2); } },
    { name: 'legR', size: [lw, 12, lw], pivot: [-2, 12, 0], from: [-lw / 2, -12, -lw / 2], base: opts.pants },
    ...(opts.extra ?? []),
  ];
}

function shambler(): PartDef[] {
  return humanoid({
    skin: '#6f8a66', shirt: '#86704f', pants: '#3b3d4a', shoes: '#2b2a2a',
    face: (p) => {
      p.fill('top', '#56704e', 0.1, 9);
      p.px('front', 1, 3, '#1b2418', 2, 2); p.px('front', 5, 3, '#1b2418', 2, 2);
      p.px('front', 2, 3, '#c8d86a'); p.px('front', 5, 3, '#c8d86a');
      p.px('front', 2, 6, '#3a4a34', 4, 1);
      p.px('front', 0, 0, '#56704e', 8, 1);
    },
    torso: (p) => {
      p.px('front', 0, 9, '#6f8a66', 3, 3); p.px('front', 6, 8, '#6f8a66', 2, 4);
      p.px('front', 3, 2, '#5e4a33', 1, 8);
    },
  });
}

function skeleton(): PartDef[] {
  return humanoid({
    skin: '#d8d5c8', shirt: '#d8d5c8', pants: '#d8d5c8', shoes: '#bcb8aa', armW: 2, legW: 2,
    face: (p) => {
      p.fill('top', '#3a3346', 0.08, 5);
      p.fill('back', '#3a3346', 0.08, 6);
      p.px('left', 0, 0, '#3a3346', 8, 3); p.px('right', 0, 0, '#3a3346', 8, 3);
      p.px('front', 0, 0, '#3a3346', 8, 2);
      p.px('front', 1, 3, '#15121a', 2, 2); p.px('front', 5, 3, '#15121a', 2, 2);
      p.px('front', 3, 5, '#15121a', 2, 1);
      p.px('front', 2, 7, '#8f8b7e', 4, 1);
    },
    torso: (p) => {
      for (let y = 1; y < 9; y += 2) p.px('front', 1, y, '#8f8b7e', 6, 1);
      p.px('front', 3, 0, '#8f8b7e', 2, 12);
      p.px('back', 3, 0, '#8f8b7e', 2, 12);
    },
  });
}

function goat(): PartDef[] {
  const shag = (p: Parameters<NonNullable<PartDef['paint']>>[0]) => {
    for (const f of ['left', 'right', 'back'] as const) p.fill(f, '#d8d0bb', 0.1, 17);
    p.px('left', 0, 6, '#c2b99f', 14, 3); p.px('right', 0, 6, '#c2b99f', 14, 3);
  };
  return [
    { name: 'body', size: [8, 9, 14], pivot: [0, 11, 0], from: [-4, 0, -7], base: '#ddd6c2', noise: 0.08, paint: shag },
    { name: 'head', size: [6, 6, 7], pivot: [0, 17, 7], from: [-3, -2, 0], base: '#d6cfba',
      paint: (p) => {
        p.px('front', 0, 1, '#c79a2e', 2, 1); p.px('front', 4, 1, '#c79a2e', 2, 1);
        p.px('front', 1, 1, '#1e1a14'); p.px('front', 4, 1, '#1e1a14');
        p.px('front', 2, 4, '#8f866f', 2, 1);
      } },
    { name: 'beard', size: [2, 4, 1], pivot: [0, 0, 0], from: [-1, -5, 5], base: '#bdb296', parent: 'head' },
    { name: 'hornL', size: [1, 4, 2], pivot: [0, 0, 0], from: [1.5, 4, 1], base: '#7c7462', parent: 'head' },
    { name: 'hornR', size: [1, 4, 2], pivot: [0, 0, 0], from: [-2.5, 4, 1], base: '#7c7462', parent: 'head' },
    { name: 'earL', size: [3, 1, 2], pivot: [0, 0, 0], from: [3, 2, 2], base: '#c8bfa7', parent: 'head' },
    { name: 'earR', size: [3, 1, 2], pivot: [0, 0, 0], from: [-6, 2, 2], base: '#c8bfa7', parent: 'head' },
    quad('legFL', 2.5, 5, 11, 3, '#c9c1aa', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 9, '#4a4032', 3, 2); }),
    quad('legFR', -2.5, 5, 11, 3, '#c9c1aa', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 9, '#4a4032', 3, 2); }),
    quad('legBL', 2.5, -5, 11, 3, '#c9c1aa', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 9, '#4a4032', 3, 2); }),
    quad('legBR', -2.5, -5, 11, 3, '#c9c1aa', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 9, '#4a4032', 3, 2); }),
  ];
}

function rabbit(): PartDef[] {
  return [
    { name: 'body', size: [5, 5, 7], pivot: [0, 2, 0], from: [-2.5, 0, -3.5], base: '#9b7552', noise: 0.08,
      paint: (p) => { p.fill('bottom', '#e7dccb', 0.05, 3); p.px('front', 1, 2, '#e7dccb', 3, 3); } },
    { name: 'head', size: [4, 4, 4], pivot: [0, 6, 3], from: [-2, -1, 0], base: '#a27b57',
      paint: (p) => {
        p.px('front', 0, 1, '#1a120c'); p.px('front', 3, 1, '#1a120c');
        p.px('front', 1, 2, '#e9a8a8', 2, 1); p.px('front', 1, 3, '#e7dccb', 2, 1);
      } },
    { name: 'earL', size: [1, 5, 2], pivot: [0, 0, 0], from: [0.5, 3, 1], base: '#9b7552', parent: 'head', paint: (p) => p.px('front', 0, 1, '#e9a8a8', 1, 3) },
    { name: 'earR', size: [1, 5, 2], pivot: [0, 0, 0], from: [-1.5, 3, 1], base: '#9b7552', parent: 'head', paint: (p) => p.px('front', 0, 1, '#e9a8a8', 1, 3) },
    { name: 'tail', size: [2, 2, 1], pivot: [0, 0, 0], from: [-1, 2, -4.5], base: '#f2ede4', parent: 'body' },
    { name: 'legFL', size: [1, 2, 1], pivot: [1.5, 2, 3], from: [-0.5, -2, -0.5], base: '#8a6646' },
    { name: 'legFR', size: [1, 2, 1], pivot: [-1.5, 2, 3], from: [-0.5, -2, -0.5], base: '#8a6646' },
    { name: 'legBL', size: [2, 2, 4], pivot: [2, 2, -1.5], from: [-1, -2, -2], base: '#8a6646' },
    { name: 'legBR', size: [2, 2, 4], pivot: [-2, 2, -1.5], from: [-1, -2, -2], base: '#8a6646' },
  ];
}

function crawler(): PartDef[] {
  const shell = '#2f4b4d', stripe = '#4f7d72';
  const legs: PartDef[] = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const z = 3 - (i % 4) * 2;
    legs.push({ name: `leg${i}`, size: [14, 2, 2], pivot: [side * 3, 6, z], from: side > 0 ? [0, -1, -1] : [-14, -1, -1], base: '#23393a',
      paint: (p) => { p.px('top', side > 0 ? 12 : 0, 0, '#101c1c', 2, 2); } });
  }
  return [
    { name: 'abdomen', size: [10, 8, 11], pivot: [0, 6, -4], from: [-5, -2, -11], base: shell, noise: 0.06,
      paint: (p) => { p.px('top', 4, 1, stripe, 2, 9); p.px('top', 1, 5, stripe, 8, 1); p.px('back', 3, 2, stripe, 4, 3); } },
    { name: 'body', size: [6, 5, 6], pivot: [0, 6, 0], from: [-3, -2, -3], base: '#29403f' },
    { name: 'head', size: [7, 6, 6], pivot: [0, 6, 3], from: [-3.5, -2.5, 0], base: shell,
      paint: (p) => {
        p.px('front', 1, 1, '#f2b233', 2, 1); p.px('front', 4, 1, '#f2b233', 2, 1);
        p.px('front', 2, 3, '#f2b233'); p.px('front', 4, 3, '#f2b233');
        p.px('front', 1, 5, '#162524', 5, 1);
      } },
    ...legs,
  ];
}

/** Cinderling (2.0): a knee-high scamp of glowing coals with a flickering crest. */
function cinderling(): PartDef[] {
  const coal = '#2e2421', crack = '#ff8a2a', hot = '#ffd27a';
  const cracks = (p: Parameters<NonNullable<PartDef['paint']>>[0]) => {
    for (const f of ['front', 'back', 'left', 'right'] as const) {
      p.px(f, 1, 1, crack, 1, 2); p.px(f, 2, 3, crack, 2, 1); p.px(f, 4, 2, hot, 1, 1);
    }
    p.px('top', 1, 1, crack, 3, 1);
  };
  return [
    { name: 'body', size: [6, 6, 5], pivot: [0, 4, 0], from: [-3, 0, -2.5], base: coal, noise: 0.14, paint: cracks },
    { name: 'head', size: [6, 5, 5], pivot: [0, 10, 0.5], from: [-3, 0, -2.5], base: '#382b27', noise: 0.12,
      paint: (p) => {
        p.px('front', 1, 2, hot, 1, 1); p.px('front', 4, 2, hot, 1, 1);
        p.px('front', 1, 3, crack, 1, 1); p.px('front', 4, 3, crack, 1, 1);
        p.px('front', 2, 4, '#1a1311', 2, 1);
      } },
    { name: 'crest', size: [2, 3, 4], pivot: [0, 0, 0], from: [-1, 5, -2], base: crack, parent: 'head',
      paint: (p) => { p.fill('top', hot, 0.1, 4); p.px('front', 0, 0, hot, 2, 1); p.px('left', 0, 0, hot, 4, 1); p.px('right', 0, 0, hot, 4, 1); } },
    { name: 'armL', size: [2, 5, 2], pivot: [4, 9, 0], from: [-1, -5, -1], base: coal, paint: (p) => p.px('front', 0, 4, crack, 2, 1) },
    { name: 'armR', size: [2, 5, 2], pivot: [-4, 9, 0], from: [-1, -5, -1], base: coal, paint: (p) => p.px('front', 0, 4, crack, 2, 1) },
    { name: 'legL', size: [2, 4, 2], pivot: [1.5, 4, 0], from: [-1, -4, -1], base: '#251d1b' },
    { name: 'legR', size: [2, 4, 2], pivot: [-1.5, 4, 0], from: [-1, -4, -1], base: '#251d1b' },
  ];
}

/** Smoulderer (2.0): a tall, hooded walker caked in ash, with ember eyes and glowing seams. */
function smoulderer(): PartDef[] {
  const ashy = '#5f5856', robe = '#3f3937', seam = '#ff7a2a';
  return humanoid({
    skin: ashy, shirt: robe, pants: robe, shoes: '#2a2524',
    face: (p) => {
      p.fill('front', '#1d1919', 0.05, 31);
      p.px('front', 1, 3, '#ffcf6a', 2, 1); p.px('front', 5, 3, '#ffcf6a', 2, 1);
      p.px('front', 2, 4, seam, 1, 1); p.px('front', 5, 4, seam, 1, 1);
    },
    torso: (p) => {
      p.px('front', 3, 1, seam, 2, 1); p.px('front', 4, 2, seam, 1, 4); p.px('front', 2, 6, seam, 1, 3); p.px('front', 5, 7, seam, 1, 3);
      p.px('back', 3, 2, seam, 1, 5);
    },
    extra: [
      { name: 'hood', size: [9, 4, 9], pivot: [0, 0, 0], from: [-4.5, 6, -4.5], base: robe, parent: 'head', noise: 0.08,
        paint: (p) => { p.px('front', 0, 3, '#2b2625', 9, 1); } },
    ],
  });
}

function dustwalker(): PartDef[] {
  return humanoid({
    skin: '#b39d72', shirt: '#cdb685', pants: '#8f774a', shoes: '#5e4a2c',
    face: (p) => {
      p.fill('top', '#dccba1', 0.08, 21);
      p.fill('back', '#dccba1', 0.08, 22);
      p.px('left', 0, 0, '#dccba1', 8, 3); p.px('right', 0, 0, '#dccba1', 8, 3);
      p.px('front', 0, 0, '#dccba1', 8, 2);
      p.px('front', 1, 3, '#3a2e1c', 2, 2); p.px('front', 5, 3, '#3a2e1c', 2, 2);
      p.px('front', 2, 3, '#e8a83a'); p.px('front', 5, 3, '#e8a83a');
      p.px('front', 0, 6, '#dccba1', 8, 2);
    },
    torso: (p) => {
      for (let y = 1; y < 12; y += 3) p.px('front', 0, y, '#b19b6c', 8, 1);
      p.px('front', 2, 0, '#9c8659', 1, 12);
    },
  });
}

/**
 * Villagers: ORIGINAL townsfolk in knee-length tunics with a belt, arms at their
 * sides, and a hat or hood that shows their trade.
 */
function villager(look: VillagerLook): PartDef[] {
  const outfit: Record<VillagerLook, { skin: string; tunic: string; trim: string; pants: string; hair: string }> = {
    none: { skin: '#d9a47e', tunic: '#8b6a47', trim: '#6b4f33', pants: '#5c5a57', hair: '#5a3a22' },
    farmer: { skin: '#e2b08a', tunic: '#5f8a3c', trim: '#40602a', pants: '#6b4a2e', hair: '#7a4a24' },
    smith: { skin: '#c98f6a', tunic: '#6c6c70', trim: '#4a3424', pants: '#3a3a3e', hair: '#2e241e' },
    mason: { skin: '#dcae88', tunic: '#8f8f8a', trim: '#4d6a92', pants: '#5a5650', hair: '#8a8580' },
    scribe: { skin: '#e8c0a0', tunic: '#6b4a8f', trim: '#d8b04a', pants: '#3e2d52', hair: '#c8c4bc' },
    fletcher: { skin: '#d7a27a', tunic: '#7a5a3a', trim: '#3f6b3a', pants: '#4a4034', hair: '#a0522d' },
    mapmaker: { skin: '#e0b090', tunic: '#2f6670', trim: '#d8c48a', pants: '#3a3f48', hair: '#6a4a2a' },
  };
  const o = outfit[look];
  const extra: PartDef[] = [];
  const face = (p: FacePainterLike) => {
    p.fill('top', o.hair, 0.08, 31);
    p.fill('back', o.hair, 0.08, 32);
    p.px('back', 0, 6, o.skin, 8, 2);
    p.px('left', 0, 0, o.hair, 8, 3); p.px('right', 0, 0, o.hair, 8, 3);
    p.px('front', 0, 0, o.hair, 8, 1);
    p.px('front', 1, 2, o.hair, 2, 1); p.px('front', 5, 2, o.hair, 2, 1);          // brows
    p.px('front', 1, 3, '#ffffff', 2, 1); p.px('front', 5, 3, '#ffffff', 2, 1);    // eyes
    p.px('front', 2, 3, '#3a5a2a'); p.px('front', 5, 3, '#3a5a2a');
    p.px('front', 3, 4, shadeHex(o.skin, 0.85), 2, 2);                            // nose
    p.px('front', 1, 5, '#e89a8a'); p.px('front', 6, 5, '#e89a8a');                // cheeks
    p.px('front', 3, 6, '#8a4a3a', 2, 1);                                          // mouth
    if (look === 'smith') p.px('front', 1, 6, '#2e241e', 6, 2);                    // beard
    if (look === 'scribe') { p.px('front', 1, 3, '#caa84a', 2, 1); p.px('front', 5, 3, '#caa84a', 2, 1); p.px('front', 3, 3, '#caa84a', 2, 1); } // spectacles
    if (look === 'mapmaker') { p.px('front', 5, 2, '#c9a640', 3, 3); p.px('front', 6, 3, '#ffffff'); p.px('front', 7, 5, '#c9a640', 1, 2); } // monocle on a chain
  };
  const tunic = (p: FacePainterLike) => {
    p.px('front', 0, 7, o.trim, 8, 1); p.px('back', 0, 7, o.trim, 8, 1);            // belt
    p.px('left', 0, 7, o.trim, 4, 1); p.px('right', 0, 7, o.trim, 4, 1);
    p.px('front', 3, 7, '#c9a640', 2, 1);                                          // buckle
    p.px('front', 3, 0, shadeHex(o.tunic, 0.8), 2, 4);                              // collar
    if (look === 'smith') { p.px('front', 1, 1, '#4a3424', 6, 11); p.px('front', 1, 0, '#4a3424', 1, 1); p.px('front', 6, 0, '#4a3424', 1, 1); } // apron
    if (look === 'scribe') { p.px('front', 0, 0, o.trim, 1, 12); p.px('front', 7, 0, o.trim, 1, 12); }
    if (look === 'mason') { for (let x = 1; x < 7; x += 2) p.px('front', x, 8, '#6d6d68', 1, 2); } // tool belt
  };
  // knee-length skirt of the tunic, over the upper legs
  extra.push({ name: 'skirt', size: [9, 5, 5], pivot: [0, 12, 0], from: [-4.5, -5, -2.5], base: o.tunic, paint: (p) => {
    for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 4, shadeHex(o.tunic, 0.8), f === 'front' || f === 'back' ? 9 : 5, 1);
  } });
  if (look === 'farmer') {
    extra.push({ name: 'brim', size: [12, 1, 12], pivot: [0, 0, 0], from: [-6, 7, -6], base: '#d8b860', parent: 'head', noise: 0.12 });
    extra.push({ name: 'crown', size: [8, 3, 8], pivot: [0, 0, 0], from: [-4, 8, -4], base: '#e2c46e', parent: 'head', noise: 0.1,
      paint: (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 2, '#a0522d', 8, 1); } });
  } else if (look === 'smith') {
    extra.push({ name: 'cap', size: [8, 2, 8], pivot: [0, 0, 0], from: [-4, 8, -4], base: '#2e2a28', parent: 'head' });
  } else if (look === 'mason') {
    extra.push({ name: 'cap', size: [8, 2, 8], pivot: [0, 0, 0], from: [-4, 8, -4], base: '#4d6a92', parent: 'head' });
    extra.push({ name: 'peak', size: [6, 1, 3], pivot: [0, 0, 0], from: [-3, 8, 4], base: '#3c5476', parent: 'head' });
  } else if (look === 'scribe') {
    extra.push({ name: 'hood', size: [9, 4, 9], pivot: [0, 0, 0], from: [-4.5, 6, -4.5], base: o.tunic, parent: 'head',
      paint: (p) => { p.px('front', 0, 3, o.trim, 9, 1); } });
    extra.push({ name: 'hoodTip', size: [5, 3, 5], pivot: [0, 0, 0], from: [-2.5, 10, -3], base: o.tunic, parent: 'head' });
  } else if (look === 'mapmaker') {
    // a broad felt hat with a brass band, and a map case slung on the back
    extra.push({ name: 'brim', size: [10, 1, 10], pivot: [0, 0, 0], from: [-5, 7, -5], base: '#2b3a40', parent: 'head' });
    extra.push({ name: 'crown', size: [8, 3, 8], pivot: [0, 0, 0], from: [-4, 8, -4], base: '#34474e', parent: 'head',
      paint: (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 2, '#c9a640', 8, 1); } });
    extra.push({ name: 'mapCase', size: [3, 11, 3], pivot: [0, 24, -2], from: [-1.5, -12, -2], base: '#7a5230', parent: 'body',
      paint: (p) => { p.px('back', 0, 0, '#d8c48a', 3, 1); p.px('back', 0, 10, '#d8c48a', 3, 1); } });
  } else if (look === 'fletcher') {
    extra.push({ name: 'hood', size: [9, 3, 9], pivot: [0, 0, 0], from: [-4.5, 7, -4.5], base: o.trim, parent: 'head' });
    extra.push({ name: 'feather', size: [1, 5, 2], pivot: [0, 0, 0], from: [3, 9, -2], base: '#f4f4f0', parent: 'head',
      paint: (p) => { p.px('left', 0, 0, '#d63a30', 2, 1); p.px('right', 0, 0, '#d63a30', 2, 1); } });
    extra.push({ name: 'cape', size: [8, 10, 1], pivot: [0, 24, -2], from: [-4, -10, -1], base: o.trim, parent: 'body' });
  }
  return humanoid({ skin: o.skin, shirt: o.tunic, pants: o.pants, shoes: '#3e2a1a', face, torso: tunic, extra });
}

/** The Sentinel: an ORIGINAL mossy stone guardian with an amber heart-stone. */
function sentinel(): PartDef[] {
  const stone = '#8a8c86', dark = '#6d6f6a', moss = '#5f7d45', amber = '#f0a030';
  const mossy = (seed: number) => (p: FacePainterLike) => {
    const r = mulberryLike(seed);
    for (const f of ['front', 'back', 'left', 'right', 'top'] as const) for (let i = 0; i < 6; i++) p.px(f, Math.floor(r() * 10), Math.floor(r() * 14), moss, 2, 1 + Math.floor(r() * 2));
  };
  return [
    { name: 'body', size: [14, 18, 8], pivot: [0, 14, 0], from: [-7, 0, -4], base: stone, noise: 0.1,
      paint: (p) => {
        mossy(3)(p);
        p.px('front', 5, 5, '#b86a18', 4, 4); p.px('front', 6, 6, amber, 2, 2);                   // heart-stone
        p.px('front', 2, 2, dark, 10, 1); p.px('front', 3, 12, dark, 8, 1);
        for (let y = 3; y < 16; y += 4) { p.px('front', 1, y, '#c9902a'); p.px('front', 12, y, '#c9902a'); } // rune marks
      } },
    { name: 'head', size: [8, 9, 8], pivot: [0, 32, -1], from: [-4, 0, -4], base: stone, noise: 0.1,
      paint: (p) => {
        p.fill('top', moss, 0.15, 7);
        p.px('front', 0, 2, dark, 8, 2);                          // heavy brow
        p.px('front', 1, 4, '#b86a18', 2, 1); p.px('front', 5, 4, '#b86a18', 2, 1);
        p.px('front', 1, 4, amber); p.px('front', 6, 4, amber);   // glowing eyes
        p.px('front', 2, 7, dark, 4, 1);
      } },
    { name: 'armL', size: [5, 26, 5], pivot: [9.5, 30, 0], from: [-2.5, -26, -2.5], base: stone, noise: 0.1, paint: mossy(11) },
    { name: 'armR', size: [5, 26, 5], pivot: [-9.5, 30, 0], from: [-2.5, -26, -2.5], base: stone, noise: 0.1, paint: mossy(12) },
    { name: 'legL', size: [6, 14, 6], pivot: [3.5, 14, 0], from: [-3, -14, -3], base: dark, noise: 0.1, paint: mossy(13) },
    { name: 'legR', size: [6, 14, 6], pivot: [-3.5, 14, 0], from: [-3, -14, -3], base: dark, noise: 0.1, paint: mossy(14) },
  ];
}

type FacePainterLike = Parameters<NonNullable<PartDef['paint']>>[0];
/**
 * FELLHOUND: an original wild canine of the northern woods. Grey-brown coat with
 * a dark saddle and a pale ruff around the neck, amber eyes, a bushy tail with a
 * dark tip. A tamed hound wears a blue collar with a brass tag.
 */
function hound(collar: boolean): PartDef[] {
  const coat = '#7d7064', dark = '#4f463f', pale = '#cdbfa6';
  const parts: PartDef[] = [
    { name: 'body', size: [6, 6, 10], pivot: [0, 8, 0], from: [-3, 0, -5], base: coat, noise: 0.1,
      paint: (p) => {
        p.fill('top', dark, 0.12, 21);
        p.px('left', 0, 0, dark, 10, 2); p.px('right', 0, 0, dark, 10, 2);
        p.fill('bottom', pale, 0.08, 22);
      } },
    { name: 'ruff', size: [8, 7, 4], pivot: [0, 0, 0], from: [-4, -0.5, 2.5], base: pale, noise: 0.12, parent: 'body',
      paint: (p) => { p.px('top', 0, 0, '#b8aa90', 8, 2); } },
    { name: 'head', size: [6, 6, 5], pivot: [0, 13, 6], from: [-3, -2, 0], base: coat, noise: 0.08,
      paint: (p) => {
        p.px('front', 0, 2, '#d9a53a', 2, 1); p.px('front', 4, 2, '#d9a53a', 2, 1);
        p.px('front', 1, 2, '#1d1712'); p.px('front', 4, 2, '#1d1712');
        p.px('front', 0, 0, dark, 6, 1);
        p.px('top', 0, 0, dark, 6, 2);
      } },
    { name: 'snout', size: [3, 3, 3], pivot: [0, 0, 0], from: [-1.5, -2, 5], base: '#9a8c7a', parent: 'head',
      paint: (p) => { p.px('front', 0, 0, '#241e1a', 3, 1); p.px('top', 0, 2, '#241e1a', 3, 1); } },
    { name: 'earL', size: [2, 3, 1], pivot: [0, 0, 0], from: [1, 4, 1], base: dark, parent: 'head', paint: (p) => p.px('front', 0, 1, '#b39a8a', 2, 2) },
    { name: 'earR', size: [2, 3, 1], pivot: [0, 0, 0], from: [-3, 4, 1], base: dark, parent: 'head', paint: (p) => p.px('front', 0, 1, '#b39a8a', 2, 2) },
    { name: 'tail', size: [2, 2, 8], pivot: [0, 13, -5], from: [-1, -1, -8], base: coat, noise: 0.12,
      paint: (p) => { for (const f of ['top', 'left', 'right', 'bottom'] as const) p.px(f, 0, 0, dark, 2, 2); p.fill('back', dark, 0.05, 9); } },
    quad('legFL', 1.8, 3.5, 8, 2, '#6f6358', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 7, pale, 2, 1); }),
    quad('legFR', -1.8, 3.5, 8, 2, '#6f6358', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 7, pale, 2, 1); }),
    quad('legBL', 1.8, -3.5, 8, 2, '#6f6358', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 7, pale, 2, 1); }),
    quad('legBR', -1.8, -3.5, 8, 2, '#6f6358', (p) => { for (const f of ['front', 'back', 'left', 'right'] as const) p.px(f, 0, 7, pale, 2, 1); }),
  ];
  if (collar) {
    parts.push({ name: 'collar', size: [7, 2, 6], pivot: [0, 0, 0], from: [-3.5, -2.3, -0.5], base: '#3b6fc4', parent: 'head',
      paint: (p) => { p.px('front', 3, 1, '#e3b341', 1, 1); } });
    parts.push({ name: 'tag', size: [1, 1, 1], pivot: [0, 0, 0], from: [-0.5, -3.2, 5.2], base: '#e3b341', parent: 'head' });
  }
  return parts;
}

export function houndModel(tamed: boolean): BuiltModel {
  const key = tamed ? 'hound:tamed' : 'hound';
  let m = cache.get(key);
  if (m) return m;
  m = buildModel(hound(tamed), 64, 64, tamed ? 131 : 130);
  cache.set(key, m);
  return m;
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
}
function mulberryLike(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function villagerModel(look: VillagerLook): BuiltModel {
  const key = 'villager:' + look;
  let m = cache.get(key);
  if (m) return m;
  m = buildModel(villager(look), 64, 64, 77 + look.length);
  cache.set(key, m);
  return m;
}

export function playerParts(): PartDef[] {
  return humanoid({
    skin: '#e0b48f', shirt: '#3f7d4a', pants: '#4a4a55', shoes: '#5b3b22',
    face: (p) => {
      p.fill('top', '#8a3f22', 0.08, 11);
      p.fill('back', '#8a3f22', 0.08, 12);
      p.px('left', 0, 0, '#8a3f22', 8, 3); p.px('right', 0, 0, '#8a3f22', 8, 3);
      p.px('front', 0, 0, '#8a3f22', 8, 2);
      p.px('front', 1, 3, '#ffffff', 2, 1); p.px('front', 5, 3, '#ffffff', 2, 1);
      p.px('front', 2, 3, '#2d5d8f'); p.px('front', 5, 3, '#2d5d8f');
      p.px('front', 3, 5, '#c99c78', 2, 1);
      p.px('front', 2, 6, '#9a5a4a', 4, 1);
    },
    torso: (p) => {
      p.px('front', 0, 7, '#6b4a2a', 8, 1);
      p.px('front', 3, 7, '#c9a640', 2, 1);
      p.px('front', 3, 0, '#2f6039', 2, 7);
    },
  });
}

const cache = new Map<string, BuiltModel>();

export function mobModel(type: MobType): BuiltModel {
  let m = cache.get(type);
  if (m) return m;
  if (type === 'villager') return villagerModel('none');
  if (type === 'hound') return houndModel(false);
  const parts = { pig, cow, sheep, chicken, shambler, skeleton, goat, rabbit, crawler, dustwalker, sentinel, cinderling, smoulderer }[type]();
  m = buildModel(parts, 64, 64, type.length * 13);
  cache.set(type, m);
  return m;
}

export function playerModel(): BuiltModel {
  let m = cache.get('player');
  if (m) return m;
  m = buildModel(playerParts(), 64, 64, 99);
  cache.set('player', m);
  return m;
}
