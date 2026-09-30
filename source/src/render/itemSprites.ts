/**
 * ORIGINAL 16x16 pixel-art item sprites, authored as character maps.
 * Material variants (wood/stone/iron tools, leather/iron armour, spawn eggs) share
 * one map and swap palettes.
 */
import { DYE_COLORS, DYE_RGB } from '../world/dyes';
export type RGBA = [number, number, number, number?];
export type Palette = Record<string, RGBA>;

export interface SpriteDef {
  map: string[];
  pal: Palette;
}

const O: RGBA = [34, 26, 20];           // outline
const H1: RGBA = [138, 100, 58];        // handle light
const H2: RGBA = [96, 68, 38];          // handle dark

export const MATERIALS: Record<string, [RGBA, RGBA, RGBA]> = {
  wooden: [[110, 80, 44], [158, 122, 72], [196, 160, 102]],
  stone: [[86, 86, 88], [124, 124, 126], [164, 164, 166]],
  iron: [[142, 142, 148], [198, 198, 204], [242, 242, 246]],
};

const PICKAXE = [
  '................',
  '....oooooooo....',
  '...oLLLLMMMMo...',
  '....ooooooMDDo..',
  '.........ohoMDo.',
  '........ohHooMDo',
  '.......ohHo..oDo',
  '......ohHo....oo',
  '.....ohHo.......',
  '....ohHo........',
  '...ohHo.........',
  '..ohHo..........',
  '.ohHo...........',
  'ohHo............',
  'oo..............',
  '................',
];
const AXE = [
  '................',
  '.......oooo.....',
  '......oLLMMo....',
  '.....oLLMMMDo...',
  '.....oLMMMDhHo..',
  '......oMDDohHo..',
  '.......oooohHo..',
  '........ohHoo...',
  '.......ohHo.....',
  '......ohHo......',
  '.....ohHo.......',
  '....ohHo........',
  '...ohHo.........',
  '..ohHo..........',
  '.oHo............',
  '..o.............',
];
const SHOVEL = [
  '................',
  '..........ooo...',
  '.........oLLMo..',
  '........oLLMMDo.',
  '........oLMMDDo.',
  '.........oMDDo..',
  '........ohooo...',
  '.......ohHo.....',
  '......ohHo......',
  '.....ohHo.......',
  '....ohHo........',
  '...ohHo.........',
  '..ohHo..........',
  '.ohHo...........',
  '.oo.............',
  '................',
];
const SWORD = [
  '................',
  '............ooo.',
  '...........oLLo.',
  '..........oLMDo.',
  '.........oLMDo..',
  '........oLMDo...',
  '.......oLMDo....',
  '..oo..oLMDo.....',
  '..oMooLMDo......',
  '...oMDMDo.......',
  '....oDDo........',
  '...ohoMMo.......',
  '..ohHo.oMo......',
  '.ohHo...oo......',
  '.ooo............',
  '................',
];

const HOE = [
  '................',
  '.......oooooo...',
  '......oLLLMMDo..',
  '.......oooohoDo.',
  '.........ohHooo.',
  '........ohHo....',
  '.......ohHo.....',
  '......ohHo......',
  '.....ohHo.......',
  '....ohHo........',
  '...ohHo.........',
  '..ohHo..........',
  '.ohHo...........',
  'ohHo............',
  'oo..............',
  '................',
];

function toolPal(mat: string): Palette {
  const [d, m, l] = MATERIALS[mat];
  return { o: O, L: l, M: m, D: d, h: H1, H: H2 };
}

const ARMOR_COLORS: Record<string, [RGBA, RGBA, RGBA]> = {
  leather: [[96, 58, 30], [138, 86, 46], [170, 112, 64]],
  iron: [[140, 140, 146], [194, 194, 200], [236, 236, 240]],
};
const HELMET = [
  '................',
  '................',
  '................',
  '....oooooooo....',
  '...oLLLLLLMMo...',
  '..oLMMMMMMMMDo..',
  '..oMMooooooMDo..',
  '..oMDo....oMDo..',
  '..oMDo....oMDo..',
  '..oooo....oooo..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const CHEST = [
  '................',
  '..oooo....oooo..',
  '.oLLMoooooooMDo.',
  '.oLMMMMLLMMMMDo.',
  '.oMMMMMMMMMMMDo.',
  '..ooMMMMMMMMoo..',
  '...oLMMMMMMDo...',
  '...oMMMMMMMDo...',
  '...oMMMMMMMDo...',
  '...oLMMMMMMDo...',
  '...oMMMMMMMDo...',
  '...oMMMMMMMDo...',
  '...oooooooooo...',
  '................',
  '................',
  '................',
];
const LEGS = [
  '................',
  '................',
  '...oooooooooo...',
  '...oLLLLMMMMo...',
  '...oLMMMMMMDo...',
  '...oMMMooMMDo...',
  '...oMMo..oMDo...',
  '...oMMo..oMDo...',
  '...oLMo..oMDo...',
  '...oMMo..oMDo...',
  '...oMMo..oMDo...',
  '...oMDo..oDDo...',
  '...oooo..oooo...',
  '................',
  '................',
  '................',
];
const BOOTS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '...oooo..oooo...',
  '...oLMo..oMDo...',
  '...oMMo..oMDo...',
  '...oMMo..oMDo...',
  '..oLMMo..oMMDo..',
  '..oMMDo..oMMDo..',
  '..ooooo..ooooo..',
  '................',
  '................',
  '................',
  '................',
];

const EGG = [
  '................',
  '................',
  '......oooo......',
  '.....oLLAAo.....',
  '....oLAAAAAo....',
  '....oAAsAAAo....',
  '...oAAAAAsAAo...',
  '...oAsAAAAAAo...',
  '...oAAAAsAAAo...',
  '...oAAAAAAsDo...',
  '...oAsAAAAADo...',
  '....oAAAsADo....',
  '....oAAAADDo....',
  '.....ooooooo....',
  '................',
  '................',
];

export const SPRITES: Record<string, SpriteDef> = {
  stick: {
    map: [
      '................', '................', '................', '...........oo...', '..........ohHo..',
      '.........ohHo...', '........ohHo....', '.......ohHo.....', '......ohHo......', '.....ohHo.......',
      '....ohHo........', '...ohHo.........', '...oHo..........', '....o...........', '................', '................',
    ],
    pal: { o: O, h: H1, H: H2 },
  },
  coal: {
    map: [
      '................', '................', '................', '.....oooo.......', '....oCKKKoo.....',
      '...oCKKKKKKo....', '...oKKCKKKKKo...', '..oKKKKKKCKKo...', '..oKCKKKKKKKKo..', '..oKKKKKCKKKKo..',
      '...oKKKKKKKKo...', '....oKKCKKKo....', '.....ooKKoo.....', '.......oo.......', '................', '................',
    ],
    pal: { o: [14, 14, 16], K: [40, 40, 44], C: [86, 86, 92] },
  },
  raw_iron: {
    map: [
      '................', '................', '................', '......ooo.......', '....ooRRRoo.....',
      '...oRLRRRDRo....', '...oRRRDRRRoo...', '..oRLRRRRLRDRo..', '..oRRRDRRRRRDo..', '..oRDRRRLRRDo...',
      '...oRRRRRRDo....', '....ooRRDDo.....', '......oooo......', '................', '................', '................',
    ],
    pal: { o: [70, 50, 40], R: [196, 150, 116], L: [228, 196, 164], D: [150, 104, 78] },
  },
  iron_ingot: {
    map: [
      '................', '................', '................', '................', '.....oooooooo...',
      '....oLLLLLLLMo..', '...oLLLLLLLMMo..', '..oooooooooMMo..', '..oLLLLLLLMoMo..', '..oLMMMMMMDoDo..',
      '..oMMMMMMMDoo...', '..oooooooooo....', '................', '................', '................', '................',
    ],
    pal: { o: [60, 60, 66], L: [240, 240, 244], M: [198, 198, 204], D: [140, 140, 148] },
  },
  flint: {
    map: [
      '................', '................', '.......oo.......', '......oLDo......', '.....oLDDDo.....',
      '....oLDDKDDo....', '....oDDKKDDo....', '...oLDKKDDDDo...', '...oDDDDKDDDo...', '...oDDKDDDDKo...',
      '....oDDDDDKo....', '.....oDDKDo.....', '......oooo......', '................', '................', '................',
    ],
    pal: { o: [20, 20, 22], L: [120, 120, 126], D: [70, 70, 76], K: [46, 46, 50] },
  },
  leather: {
    map: [
      '................', '................', '..oooo....oooo..', '..oLLMoooooMMo..', '...oLMMMMMMMMo..',
      '...oMMMLMMMMDo..', '..oMMMMMMMMMMDo.', '..oLMMMMMLMMMDo.', '..oMMMMMMMMMMDo.', '...oMMMMMMMMDo..',
      '...oMLMMMMMMDo..', '..oMMMooooMMDo..', '..oooo....oooo..', '................', '................', '................',
    ],
    pal: { o: [60, 34, 16], L: [176, 116, 66], M: [142, 88, 46], D: [106, 62, 30] },
  },
  feather: {
    map: [
      '................', '...........ooo..', '..........oWWWo.', '.........oWWGWo.', '........oWWGWWo.',
      '.......oWWGWWo..', '......oWWGWWo...', '.....oWWGWWo....', '.....oWGWWo.....', '....oWGWWo......',
      '....oGWWo.......', '...oGooo........', '..oGo...........', '.oGo............', '.oo.............', '................',
    ],
    pal: { o: [90, 90, 96], W: [244, 244, 246], G: [190, 190, 196] },
  },
  bone: {
    map: [
      '................', '...........oo...', '..........oWWo..', '.........oWWWWo.', '..........oWWo..',
      '.........oWWo...', '........oWWo....', '.......oWWo.....', '......oWWo......', '.....oWWo.......',
      '....oWWo........', '..oWWWo.........', '.oWWWWo.........', '..oWWo..........', '...oo...........', '................',
    ],
    pal: { o: [96, 92, 80], W: [236, 232, 214] },
  },
  string: {
    map: [
      '................', '................', '............oo..', '...........oWo..', '..........oWo...',
      '..........oWo...', '.........oWo....', '........oWo.....', '.......oWo......', '......oWo.......',
      '......oWo.......', '.....oWo........', '....oWo.........', '...oWo..........', '....o...........', '................',
    ],
    pal: { o: [120, 120, 126], W: [246, 246, 250] },
  },
  arrow: {
    map: [
      '................', '...........ooo..', '..........oLLo..', '..........oLMo..', '.........ohoo...',
      '........ohHo....', '.......ohHo.....', '......ohHo......', '.....ohHo.......', '....ohHo........',
      '..ooohHo........', '.oFWoHo.........', '.oWFWo..........', '..oWFo..........', '..ooo...........', '................',
    ],
    pal: { o: O, L: [220, 220, 224], M: [150, 150, 156], h: H1, H: H2, W: [240, 240, 240], F: [196, 60, 50] },
  },
  bow: {
    map: [
      '................', '.......ooooo....', '......ohhhHHo...', '.....oHoooooHo..', '.....oo.....oHo.',
      '....oS.......oHo', '....oS.......oHo', '...oS........ohH', '...oS........ohH', '..oS.........oHo',
      '..oS.........oHo', '.oS.........oHo.', '.oS........oHo..', '.oSoooooooHHo...', '..oHHhhhhHoo....', '...oooooooo.....',
    ],
    pal: { o: O, h: H1, H: H2, S: [230, 230, 230] },
  },
  apple: {
    map: [
      '................', '........o.......', '.......oHoLL....', '.......oHLLGo...', '....oooooooo....',
      '...oRRWRRRRRo...', '..oRWWRRRRRRRo..', '..oRWRRRRRRRRo..', '..oRRRRRRRRRDo..', '..oRRRRRRRRRDo..',
      '..oRRRRRRRRDDo..', '...oRRRRRRDDo...', '....oRRooRDo....', '.....oo..oo.....', '................', '................',
    ],
    pal: { o: [60, 12, 12], R: [214, 36, 36], D: [150, 20, 20], W: [255, 150, 150], H: H2, L: [96, 170, 60], G: [60, 120, 36] },
  },
};

// ---- 1.1 items
SPRITES.oak_door = {
  map: [
    '....oooooooo....', '....oLLLLLLo....', '....oLGGGGLo....', '....oLGLLGLo....', '....oLGGGGLo....',
    '....oLLLLLLo....', '....oMMMMMMo....', '....oLLLLLLo....', '....oLMLLMLo....', '....oLMLLMLo....',
    '....oLMLLMLo....', '....oLLLKLLo....', '....oLMLLMLo....', '....oLMLLMLo....', '....oLLLLLLo....', '....oooooooo....',
  ],
  pal: { o: [74, 52, 28], L: [172, 136, 86], M: [134, 100, 58], G: [196, 222, 236], K: [60, 60, 66] },
};
SPRITES.bed = {
  map: [
    '................', '................', '................', '................', '................',
    '.oo.........oo..', '.oWWoooooooooTo.', '.oWWWWTTTTTTTTo.', '.oWWWWTTTTTTTTo.', '.oooooooooooooo.',
    '.oBBBBBBBBBBBBo.', '.oBoooooooooBo..', '.oo.........oo..', '................', '................', '................',
  ],
  pal: { o: [52, 36, 20], W: [240, 238, 230], T: [46, 124, 132], B: [132, 98, 58] },
};
const BUCKET = [
  '................', '................', '....oooooooo....', '...o........o...', '..o..........o..',
  '..oooooooooooo..', '..oMLLLLLLLLDo..', '..oMLWWWWWWLDo..', '...oMLLLLLLDo...', '...oMLLLLLLDo...',
  '...oMLLLLLLDo...', '....oMLLLLDo....', '....oMLLLLDo....', '.....oooooo.....', '................', '................',
];
SPRITES.bucket = { map: BUCKET, pal: { o: [60, 60, 66], M: [150, 150, 158], L: [210, 210, 216], D: [120, 120, 128], W: [70, 70, 76] } };
SPRITES.water_bucket = { map: BUCKET, pal: { o: [60, 60, 66], M: [150, 150, 158], L: [210, 210, 216], D: [120, 120, 128], W: [60, 110, 214] } };
SPRITES.rune_shard = {
  map: [
    '................', '................', '.........oo.....', '........oLVo....', '.......oLVVDo...',
    '......oLVVVDo...', '.....oLVCVVDo...', '....oLVVVVDDo...', '....oVVVVVDo....', '...oLVVVVDDo....',
    '...oVVVCVDo.....', '....oVVVDo......', '.....oDDo.......', '......oo........', '................', '................',
  ],
  pal: { o: [40, 20, 70], L: [220, 196, 255], V: [150, 96, 236], D: [98, 60, 186], C: [150, 236, 255] },
};

// ---- 1.2 items
SPRITES.wheat_seeds = {
  map: [
    '................', '................', '................', '......o.........', '.....oSo...o....',
    '......o...oSo...', '...o.......o....', '..oSo...o.......', '...o...oSo......', '........o...o...',
    '.....o.....oSo..', '....oSo.....o...', '.....o..o.......', '.......oSo......', '........o.......', '................',
  ],
  pal: { o: [70, 96, 34], S: [150, 184, 72] },
};
SPRITES.wheat = {
  map: [
    '.........oo.....', '........oGGo....', '.......oGgGo....', '.......oGGgo..o.', '......oGgGo..oGo',
    '......oGGo..oGgo', '.....ooGo..oGGo.', '....oS.o..oGgo..', '...oS.....oGo...', '...S.....oSo....',
    '..oS....oS......', '.oS....oS.......', '.S....oS........', 'oS...oS.........', 'S...oS..........', '...S............',
  ],
  pal: { o: [120, 90, 30], G: [224, 190, 86], g: [190, 150, 58], S: [176, 150, 60] },
};
SPRITES.bread = {
  map: [
    '................', '................', '................', '................', '.....oooooo.....',
    '...ooLLLLLLoo...', '..oLLLlLLlLLDo..', '.oLLlLLlLLlLLDo.', '.oLLLLLLLLLLDDo.', '.oMLLLLLLLLLDDo.',
    '.oMMMLLLLLDDDDo.', '..oMMMMMDDDDDo..', '...oooooooooo...', '................', '................', '................',
  ],
  pal: { o: [80, 44, 16], L: [206, 150, 72], l: [236, 196, 128], M: [176, 118, 48], D: [150, 94, 36] },
};
SPRITES.carrot = {
  map: [
    '................', '..........g.g...', '...........gGg..', '.........gGGg...', '..........oGg...',
    '.........oOo....', '........oOOo....', '.......oOOOo....', '......oOOoO.....', '.....oOOOOo.....',
    '....oOoOOo......', '...oOOOOo.......', '...oOOOo........', '..oOOo..........', '..ooo...........', '................',
  ],
  pal: { o: [120, 50, 10], O: [236, 128, 36], g: [52, 120, 40], G: [86, 164, 60] },
};
SPRITES.bone_meal = {
  map: [
    '................', '................', '................', '................', '.......ooo......',
    '.....ooWWWoo....', '....oWWWwWWWo...', '...oWWwWWWWwWo..', '...oWWWWWwWWWo..', '..oWwWWWWWWWWWo.',
    '..oWWWWWwWWWwWo.', '..ooooooooooooo.', '................', '................', '................', '................',
  ],
  pal: { o: [150, 146, 130], W: [246, 244, 236], w: [214, 210, 196] },
};
SPRITES.amber = {
  map: [
    '................', '................', '......oooo......', '.....oLLAAo.....', '....oLAAAAAo....',
    '...oLAAaAAAAo...', '...oAAAAAAADo...', '..oLAAAAaAAADo..', '..oAAaAAAAADDo..', '..oAAAAAAADDDo..',
    '...oAAAAADDDo...', '...oAAADDDDo....', '....oADDDo......', '.....oooo.......', '................', '................',
  ],
  pal: { o: [110, 50, 8], L: [255, 226, 140], A: [240, 160, 40], a: [120, 70, 20], D: [196, 108, 20] },
};

function meat(name: string, raw: RGBA, dark: RGBA, fat: RGBA, bone = false): void {
  const map = bone
    ? ['................', '................', '...........oo...', '..........oWWo..', '.........oWWo...',
      '......oooWo.....', '....ooRRRRoo....', '...oRRLRRRRDo...', '..oRLRRRRRRRDo..', '..oRRRRRRRRRDo..',
      '..oRRRRRRRRRDo..', '...oRRRRRRRDo...', '....oRRRRDDo....', '.....oooooo.....', '................', '................']
    : ['................', '................', '................', '.....oooooo.....', '...ooFFRRRRoo...',
      '..oFFRRRLRRRRo..', '.oFRRRLRRRRRRDo.', '.oFRRRRRRRLRRDo.', '.oRRLRRRRRRRRDo.', '.oRRRRRRRRRRDDo.',
      '..oRRRRRLRRRDo..', '...ooRRRRRDDo...', '.....oooooooo...', '................', '................', '................'];
  SPRITES[name] = { map, pal: { o: [50, 20, 16], R: raw, D: dark, F: fat, L: [Math.min(255, raw[0] + 30), Math.min(255, raw[1] + 30), Math.min(255, raw[2] + 30)], W: [236, 232, 214] } };
}
meat('raw_porkchop', [232, 146, 146], [196, 104, 106], [250, 220, 214]);
meat('cooked_porkchop', [186, 124, 72], [132, 82, 44], [226, 190, 130]);
meat('raw_beef', [200, 50, 44], [150, 30, 28], [236, 196, 190]);
meat('steak', [140, 82, 46], [96, 54, 28], [190, 136, 90]);
meat('raw_mutton', [214, 72, 66], [160, 44, 40], [246, 236, 226]);
meat('cooked_mutton', [164, 96, 56], [112, 62, 34], [220, 200, 170]);
meat('raw_chicken', [240, 200, 180], [210, 160, 140], [250, 230, 214], true);
meat('cooked_chicken', [200, 140, 70], [150, 96, 44], [236, 190, 120], true);
meat('spoiled_flesh', [150, 110, 70], [100, 86, 46], [120, 140, 70]);
meat('raw_rabbit', [226, 150, 140], [190, 110, 104], [244, 214, 204], true);
meat('cooked_rabbit', [178, 116, 64], [128, 78, 40], [220, 180, 120], true);

for (const mat of ['wooden', 'stone', 'iron']) {
  SPRITES[`${mat}_pickaxe`] = { map: PICKAXE, pal: toolPal(mat) };
  SPRITES[`${mat}_axe`] = { map: AXE, pal: toolPal(mat) };
  SPRITES[`${mat}_shovel`] = { map: SHOVEL, pal: toolPal(mat) };
  SPRITES[`${mat}_sword`] = { map: SWORD, pal: toolPal(mat) };
  SPRITES[`${mat}_hoe`] = { map: HOE, pal: toolPal(mat) };
}
for (const mat of ['leather', 'iron']) {
  const [d, m, l] = ARMOR_COLORS[mat];
  const pal: Palette = { o: mat === 'leather' ? [50, 28, 12] : [60, 60, 66], L: l, M: m, D: d };
  SPRITES[`${mat}_helmet`] = { map: HELMET, pal };
  SPRITES[`${mat}_chestplate`] = { map: CHEST, pal };
  SPRITES[`${mat}_leggings`] = { map: LEGS, pal };
  SPRITES[`${mat}_boots`] = { map: BOOTS, pal };
}

// ---- 1.4 decoration items
const WOODPAL: Palette = { o: [66, 46, 24], L: [184, 146, 94], M: [140, 106, 62], D: [104, 76, 42] };
SPRITES.oak_fence = {
  map: [
    '................', '..oo........oo..', '.oLMo......oLMo.', '.oLMo......oLMo.', '.oLMooooooooLMo.',
    '.oLMLLLLLLLLLMo.', '.oLMMMMMMMMMMMo.', '.oLMooooooooLMo.', '.oLMo......oLMo.', '.oLMooooooooLMo.',
    '.oLMLLLLLLLLLMo.', '.oLMMMMMMMMMMMo.', '.oLMooooooooLMo.', '.oLMo......oLMo.', '.oDDo......oDDo.', '..oo........oo..',
  ],
  pal: WOODPAL,
};
SPRITES.oak_fence_gate = {
  map: [
    '................', '.oo..........oo.', 'oLMo........oLMo', 'oLMooooooooooLMo', 'oLMLLLLLLLLLLLMo',
    'oLMMMMMMMMMMMLMo', 'oLMooooooooooLMo', 'oLMo..oLMo..oLMo', 'oLMo..oLMo..oLMo', 'oLMooooooooooLMo',
    'oLMLLLLLLLLLLLMo', 'oLMMMMMMMMMMMLMo', 'oLMooooooooooLMo', 'oLMo........oLMo', 'oDDo........oDDo', '.oo..........oo.',
  ],
  pal: WOODPAL,
};
SPRITES.sign = {
  map: [
    '................', 'oooooooooooooooo', 'oLLLLLLLLLLLLLMo', 'oLKKKKKKKKKKLLMo', 'oLLLLLLLLLLLLLMo',
    'oLKKKKKKKKLLLLMo', 'oLLLLLLLLLLLLLMo', 'oLKKKKKKKKKKKLMo', 'oMMMMMMMMMMMMMMo', 'oooooooLMooooooo',
    '......oLMo......', '......oLMo......', '......oLMo......', '......oLMo......', '......oDDo......', '.......oo.......',
  ],
  pal: { ...WOODPAL, K: [70, 50, 30] },
};
SPRITES.lantern = {
  map: [
    '.......oo.......', '......o..o......', '......o..o......', '.....oooooo.....', '....oBBBBBBo....',
    '...oDDDDDDDDo...', '...oBGGGGGGBo...', '...oBGYYYYGBo...', '...oBGYWWYGBo...', '...oBGYWWYGBo...',
    '...oBGYYYYGBo...', '...oBGGGGGGBo...', '...oDDDDDDDDo...', '....oBBBBBBo....', '.....oooooo.....', '................',
  ],
  pal: { o: [60, 40, 16], B: [196, 150, 76], D: [120, 84, 36], G: [255, 196, 96], Y: [255, 226, 150], W: [255, 248, 222] },
};
SPRITES.flower_pot = {
  map: [
    '................', '......rrr.......', '.....rRRRr......', '.....rRyRr......', '.....rRRRr......',
    '......rrr.......', '.......g..l.....', '...l...g.ll.....', '....ll.gl.......', '...oooooooooo...',
    '...oPPPPPPPPo...', '...oDDDDDDDDo...', '....oPPPPPPo....', '....oPPPPPPo....', '.....oPPPPo.....', '......oooo......',
  ],
  pal: { o: [70, 34, 20], P: [176, 96, 64], D: [132, 66, 42], r: [150, 24, 24], R: [210, 48, 42], y: [250, 210, 70], g: [70, 128, 44], l: [96, 160, 58] },
};
SPRITES.painting = {
  map: [
    '................', 'oooooooooooooooo', 'oFFFFFFFFFFFFFFo', 'oFssssssssssYYFo', 'oFssssssssssYYFo',
    'oFssssssssssssFo', 'oFsssssgggssssFo', 'oFsssgggGGggssFo', 'oFgggGGGGGGgggFo', 'oFGGGGGGbbGGGGFo',
    'oFGGGGbbbbbbGGFo', 'oFbbbbbbbbbbbbFo', 'oFFFFFFFFFFFFFFo', 'oooooooooooooooo', '................', '................',
  ],
  pal: { o: [52, 34, 18], F: [150, 108, 58], s: [150, 196, 232], Y: [252, 214, 90], g: [96, 150, 70], G: [70, 122, 52], b: [58, 104, 170] },
};
const POUCH = [
  '................', '................', '......o..o......', '.......oo.......', '......oSSo......',
  '.....oLLLLo.....', '....oLCCCCDo....', '...oLCCCCCCDo...', '...oCCCCCCCDo...', '..oLCCCCCCCCDo..',
  '..oCCCCCCCCCDo..', '..oCCCCCCCCDDo..', '...oCCCCCCDDo...', '....oDDDDDDo....', '.....oooooo.....', '................',
];
for (const c of DYE_COLORS) {
  const [r, g, b] = DYE_RGB[c];
  const f = (k: number): RGBA => [Math.min(255, Math.round(r * k)), Math.min(255, Math.round(g * k)), Math.min(255, Math.round(b * k))];
  const light: RGBA = c === 'black' ? [72, 72, 84] : [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40)];
  SPRITES[`${c}_dye`] = { map: POUCH, pal: { o: c === 'black' ? [8, 8, 10] : f(0.45), C: f(1), L: light, D: f(0.72), S: [222, 202, 150] } };
}

export const EGG_COLORS: Record<string, [RGBA, RGBA]> = {
  pig: [[236, 160, 160], [196, 110, 116]],
  cow: [[84, 62, 44], [220, 220, 214]],
  sheep: [[232, 232, 228], [250, 196, 180]],
  chicken: [[240, 240, 236], [214, 60, 50]],
  shambler: [[70, 110, 90], [120, 90, 70]],
  skeleton: [[196, 196, 190], [90, 90, 90]],
  goat: [[226, 220, 204], [120, 110, 96]],
  rabbit: [[150, 112, 76], [236, 226, 210]],
  crawler: [[40, 70, 72], [232, 170, 40]],
  dustwalker: [[196, 170, 118], [120, 96, 60]],
  villager: [[120, 86, 60], [70, 120, 60]],
  sentinel: [[128, 130, 124], [232, 160, 40]],
  hound: [[112, 100, 88], [222, 206, 176]],
};
for (const [mob, [a, s]] of Object.entries(EGG_COLORS)) {
  const L: RGBA = [Math.min(255, a[0] + 30), Math.min(255, a[1] + 30), Math.min(255, a[2] + 30)];
  const D: RGBA = [Math.round(a[0] * 0.75), Math.round(a[1] * 0.75), Math.round(a[2] * 0.75)];
  SPRITES[`spawn_${mob}`] = { map: EGG, pal: { o: [30, 30, 30], A: a, s, L, D } };
}

// ---- 1.6 boats and fishing
SPRITES.boat = {
  map: [
    '................',
    '................',
    '...........oo...',
    '..........oHo...',
    '.........oHo....',
    '........oHo.....',
    '.......oHo......',
    '.o....oHo.....o.',
    '.oLooooooooooLo.',
    '.oLLLLLLLLLLLLo.',
    '..oMMMMMMMMMMo..',
    '..oMDMMMMMMDMo..',
    '...oDDDDDDDDo...',
    '....oooooooo....',
    '................',
    '................',
  ],
  pal: { o: [60, 40, 20], L: [190, 152, 98], M: [146, 110, 64], D: [106, 78, 44], H: [128, 96, 56] },
};
SPRITES.fishing_rod = {
  map: [
    '................',
    '.............oo.',
    '............oHWo',
    '...........oHo.W',
    '..........oHo..W',
    '.........oHo...G',
    '........oHo...GG',
    '.......oHo......',
    '......oHo.......',
    '.....oHo........',
    '....oKo.........',
    '...oKo..........',
    '..oKo...........',
    '.oKo............',
    '.oo.............',
    '................',
  ],
  pal: { o: O, H: H2, K: [70, 46, 24], W: [236, 236, 240], G: [150, 150, 158] },
};
function fish(name: string, back: RGBA, side: RGBA, belly: RGBA, fin: RGBA, bar: RGBA | null): void {
  SPRITES[name] = {
    map: [
    '................',
    '................',
    '................',
    '.....ooooo......',
    '....oBBBBBoo..oo',
    '...oBBBBBBBBooFo',
    '..oEBBXBBXBBBFFo',
    '.oSSSSXSSXSSSFFo',
    '.oSSSSXSSXSSSFFo',
    '..oWWWWWWWWWoFFo',
    '...oWWWWWWWoo.Fo',
    '....ooooooo...oo',
    '................',
    '................',
    '................',
    '................',
  ],
    pal: { o: [40, 36, 30], B: back, S: side, W: belly, F: fin, X: bar ?? side, E: [20, 20, 20] },
  };
}
fish('raw_trout', [92, 118, 96], [214, 150, 150], [236, 232, 220], [120, 140, 116], null);
fish('cooked_trout', [140, 96, 52], [196, 138, 82], [226, 196, 146], [120, 82, 44], null);
fish('raw_perch', [120, 140, 60], [206, 196, 96], [236, 232, 200], [226, 120, 50], [70, 82, 40]);
fish('cooked_perch', [138, 100, 50], [192, 150, 84], [228, 204, 150], [150, 92, 44], [110, 76, 40]);

/** Rasterises a sprite into RGBA pixels. */
export function spritePixels(name: string): Uint8ClampedArray {
  const def = SPRITES[name];
  const out = new Uint8ClampedArray(16 * 16 * 4);
  if (!def) {
    for (let i = 0; i < 256; i++) { const on = ((i & 15) >> 2 ^ (i >> 6)) & 1; out.set(on ? [250, 0, 220, 255] : [0, 0, 0, 255], i * 4); }
    return out;
  }
  def.map.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const c = def.pal[row[x]];
      if (!c) continue;
      const i = (y * 16 + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3] ?? 255;
    }
  });
  return out;
}
