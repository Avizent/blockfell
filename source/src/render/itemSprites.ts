/**
 * ORIGINAL 16x16 pixel-art item sprites, authored as character maps.
 * Material variants (wood/stone/iron tools, leather/iron armour, spawn eggs) share
 * one map and swap palettes.
 */
import { DYE_COLORS, DYE_RGB } from '../world/dyes';
import { EFFECTS, potionItem, splashItem } from '../inventory/potions';
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
// lava bucket: the same bucket with a glowing orange surface (a bright fleck of molten yellow)
SPRITES.lava_bucket = {
  map: [
    '................', '................', '....oooooooo....', '...o........o...', '..o..........o..',
    '..oooooooooooo..', '..oMLLLLLLLLDo..', '..oMLRRYRRRLDo..', '...oMLLLLLLDo...', '...oMLLLLLLDo...',
    '...oMLLLLLLDo...', '....oMLLLLDo....', '....oMLLLLDo....', '.....oooooo.....', '................', '................',
  ],
  pal: { o: [60, 60, 66], M: [150, 150, 158], L: [210, 210, 216], D: [120, 120, 128], R: [232, 100, 22], Y: [255, 214, 96] },
};
// ---- 1.8: explorer maps - a parchment sheet with a coast, a dotted route and a mark for the goal
const MAP_SHEET = [
  '................', '..oooooooooooo..', '..oPPPPPPPPPPo..', '..oBBPPPPPPPPo..', '..oBBBPPPPPPPo..',
  '..oBBPPPrPPPPo..', '..oBPPPrPPPPPo..', '..oBBPrPPPPPPo..', '..oBBPPrPPPPPo..', '..oBPPPPrPPPPo..',
  '..oBBPPPPPrPPo..', '..oBBBPPPPPPPo..', '..oPPPPPPPPPPo..', '..oooooooooooo..', '................', '................',
];
const mapSprite = (mark: string[], markPal: Record<string, [number, number, number]>): SpriteDef => {
  const rows = MAP_SHEET.map((r) => r.split(''));
  mark.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') rows[3 + y][9 + x] = r[x]; });
  return {
    map: rows.map((r) => r.join('')),
    pal: { o: [112, 84, 52], P: [228, 212, 168], B: [146, 168, 172], r: [120, 84, 50], ...markPal },
  };
};
SPRITES.dungeon_map = mapSprite(['M.M', '.M.', 'M.M'], { M: [190, 36, 30] });
SPRITES.ruin_map = mapSprite(['WW.', 'W.W', 'WWW'], { W: [124, 104, 80] });
SPRITES.village_map = mapSprite(['.R.', 'RRR', 'HDH'], { R: [170, 70, 50], H: [222, 196, 140], D: [110, 76, 40] });

SPRITES.rune_shard = {
  map: [
    '................', '................', '.........oo.....', '........oLVo....', '.......oLVVDo...',
    '......oLVVVDo...', '.....oLVCVVDo...', '....oLVVVVDDo...', '....oVVVVVDo....', '...oLVVVVDDo....',
    '...oVVVCVDo.....', '....oVVVDo......', '.....oDDo.......', '......oo........', '................', '................',
  ],
  pal: { o: [40, 20, 70], L: [220, 196, 255], V: [150, 96, 236], D: [98, 60, 186], C: [150, 236, 255] },
};

// ---- 2.0 the Cinderdeep
SPRITES.ember = {
  map: [
    '................', '................', '.......oo.......', '......oYYo......', '.....oYWYAo.....',
    '....oYYYYAAo....', '....oAYYYAAo....', '...oYAAYAARRo...', '...oAAAAARRRo...', '...oRAAARRRDo...',
    '....oRRRRRDo....', '....oRRRDDDo....', '.....oDDDDo.....', '......oooo......', '................', '................',
  ],
  pal: { o: [90, 30, 14], W: [255, 252, 228], Y: [255, 226, 120], A: [255, 160, 50], R: [226, 92, 28], D: [160, 50, 20] },
};
SPRITES.fire_opal = {
  map: [
    '................', '................', '......oooo......', '....ooWWPPoo....', '...oWWPPPPGGo...',
    '..oWPPOOPPGGGo..', '..oWPOOOOPPGGo..', '..oPPOOROOPPGo..', '..oPPORRROPPPo..', '..oPPPORROPPDo..',
    '...oPPPOOPPDo...', '....oPPPPDDo....', '.....oDDDDo.....', '......oooo......', '................', '................',
  ],
  pal: { o: [96, 40, 30], W: [255, 248, 236], P: [250, 214, 196], O: [255, 150, 70], R: [232, 70, 50], G: [130, 224, 160], D: [208, 160, 150] },
};
SPRITES.cinder_charm = {
  map: [
    '................', '......cccc......', '.....c....c.....', '.....c....c.....', '......c..c......',
    '.......cc.......', '......oooo......', '.....oGPPGo.....', '....oGPOOPGo....', '....oPOROOPo....',
    '....oPORROPo....', '....oGPOOPGo....', '.....oGPPGo.....', '......oooo......', '................', '................',
  ],
  pal: { c: [70, 64, 70], o: [40, 34, 36], G: [190, 150, 70], P: [250, 214, 196], O: [255, 150, 70], R: [232, 70, 50] },
};

// ---- 2.0.1
SPRITES.glimmer_dust = {
  map: [
    '................', '................', '................', '.......W........', '................',
    '....W.....g.....', '.........gYg....', '......ggYYWYg...', '....gYYWYYYYYg..', '...gYYYYYgYYWYg.',
    '..gYWYYgYYYYYYYg', '..gggggggggggggg', '................', '................', '................', '................',
  ],
  pal: { W: [255, 255, 250], Y: [250, 222, 140], g: [196, 146, 70] },
};

// ---- 2.2 the Starhollow
SPRITES.star_lens = {
  map: [
    '................',
    '.....oooooo.....',
    '....oGGGGGGo....',
    '...oGLLLLLLGo...',
    '..oGLLWWLLLLGo..',
    '..oGLWWLLLLLGo..',
    '..oGLLLLOOLLGo..',
    '..oGLLLOROLLGo..',
    '..oGLLLLOOLLGo..',
    '..oGLLLLLLLLGo..',
    '...oGLLLLLLGo...',
    '....oGGGGGGo....',
    '.....oooooo.....',
    '................',
    '................',
    '................',
  ],
  pal: { o: [70, 50, 30], G: [222, 180, 80], L: [176, 150, 236], W: [250, 248, 255], O: [255, 140, 60], R: [255, 220, 150] },
};
SPRITES.star_scale = {
  map: [
    '................',
    '................',
    '......oooo......',
    '....ooSSSSoo....',
    '...oSSWWSSSSo...',
    '..oSSWSSSSPSSo..',
    '..oSSSSSPPSSSo..',
    '.oSSSSPPSSSSSSo.',
    '.oSSPPSSSSPPSSo.',
    '.oSSSSSSPPSSSSo.',
    '..oSSPPSSSSSSo..',
    '...oSSSSPPSSo...',
    '....ooSSSSoo....',
    '......oooo......',
    '................',
    '................',
  ],
  pal: { o: [90, 80, 70], S: [226, 220, 206], W: [255, 255, 255], P: [176, 156, 220] },
};
SPRITES.drift_silk = {
  map: [
    '................',
    '...........oo...',
    '.........ooBBo..',
    '.......ooBBWo...',
    '.....ooBBWBo....',
    '....oBBWBBo.....',
    '...oBWBBBo......',
    '..oBBBBBo.......',
    '..oBWBBBBo......',
    '...oBBBWBBo.....',
    '....ooBBBBBo....',
    '......ooBWBBo...',
    '........ooBBo...',
    '..........oo....',
    '................',
    '................',
  ],
  pal: { o: [90, 120, 170], B: [170, 220, 250], W: [240, 252, 255] },
};
SPRITES.star_wings = {
  map: [
    '................',
    '.oo..........oo.',
    'oWWo........oWWo',
    'oVVVo......oVVVo',
    'oVSVVo....oVVSVo',
    'oVVVVVo..oVVVVVo',
    'oVVSVVVooVVVSVVo',
    '.oVVVVVBBVVVVVo.',
    '.oVVVVSBBSVVVVo.',
    '..oVVVVBBVVVVo..',
    '..oVVSVooVSVVo..',
    '...oVVo..oVVo...',
    '...oVo....oVo...',
    '....o......o....',
    '................',
    '................',
  ],
  pal: { o: [40, 26, 70], W: [226, 220, 206], V: [100, 70, 160], S: [236, 230, 255], B: [200, 192, 176] },
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
// 2.1: Ashboar haunches - dark meat flecked with grey ash; roasted, an ember-orange glaze
meat('raw_ashboar', [168, 52, 50], [112, 34, 34], [150, 146, 140], true);
meat('roast_ashboar', [132, 70, 36], [86, 40, 22], [236, 132, 52], true);

/** 2.6: a 16x16 sprite grid drawn from cell lists (diagonal weapons), outlined automatically. */
function diagGrid(cells: [number, number, string][]): string[] {
  const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));
  for (const [x, y, c] of cells) if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c;
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (g[y][x] !== '.') continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < 16 && xx >= 0 && xx < 16 && g[yy][xx] !== '.') near = true; }
    if (near) out[y][x] = 'o';
  }
  return out.map((r) => r.join(''));
}
function spearCells(): [number, number, string][] {
  const c: [number, number, string][] = [];
  for (let i = 0; i <= 10; i++) c.push([1 + i, 14 - i, i % 2 ? 'h' : 'H']);   // the shaft
  const widths = [1, 3, 3, 1, 1];
  widths.forEach((w, a) => {
    for (let b = -(w - 1) / 2; b <= (w - 1) / 2; b++) c.push([10 + a + b, 5 - a + b, b < 0 ? 'L' : b === 0 ? 'M' : 'D']);
  });
  return c;
}
for (const mat of ['wooden', 'stone', 'iron']) SPRITES[`${mat}_spear`] = { map: diagGrid(spearCells()), pal: toolPal(mat) };
/** The crossbow: a stock running up and to the right, two curved arms across its front and a string; loaded, a bolt lies along it. */
function crossbowCells(loaded: 0 | 1 | 2): [number, number, string][] {
  const c: [number, number, string][] = [];
  for (let i = 0; i <= 8; i++) c.push([1 + i, 14 - i, i < 4 ? 'H' : 'h']);              // the stock, up to the bow
  for (let t = 0; t <= 8; t++) c.push([6 + t, 1 + t, 'S']);                             // the string, tip to tip
  const arms: [number, number][] = [[9, 8], [10, 9], [12, 9], [14, 9], [7, 6], [6, 3], [6, 1]];
  for (const [x, y] of arms) c.push([x, y, 'A']);
  c.push([11, 9, 'A'], [13, 9, 'A'], [7, 5, 'A'], [6, 2, 'A'], [7, 4, 'A']);
  if (loaded) { c.push([9, 6, 'R'], [10, 5, 'R'], [11, 4, loaded === 2 ? 'F' : 'T'], [12, 3, loaded === 2 ? 'F' : 'T']); }
  return c;
}
const CB_PAL = { o: O, H: H2, h: H1, A: [150, 150, 158] as RGBA, S: [240, 240, 240] as RGBA, R: [196, 160, 110] as RGBA, T: [200, 200, 208] as RGBA, F: [255, 150, 40] as RGBA };
SPRITES.crossbow = { map: diagGrid(crossbowCells(0)), pal: CB_PAL };
SPRITES.crossbow_loaded = { map: diagGrid(crossbowCells(1)), pal: CB_PAL };
SPRITES.crossbow_loaded_flame = { map: diagGrid(crossbowCells(2)), pal: CB_PAL };
// 2.7: the Saddle and the Ember Lure
SPRITES.saddle = {
  map: [
    '................', '................', '....oooooooo....', '...oLLLLLLLLo...', '..oLMMMMMMMMDo..',
    '.oLMMMMMMMMMMDo.', '.oMMMMMMMMMMMDo.', '.ooDDDDDDDDDDoo.', '.oBo.oooooo.oBo.', '.oDo........oDo.',
    '.oDo........oDo.', '.oGGo......oGGo.', '.oGoGo....oGoGo.', '..ooo......ooo..', '................', '................',
  ],
  pal: { o: [40, 24, 12], L: [178, 118, 68], M: [140, 86, 46], D: [100, 58, 28], B: [217, 180, 74], G: [170, 170, 178] },
};
SPRITES.ember_lure = {
  map: diagGrid([
    ...Array.from({ length: 9 }, (_, i): [number, number, string] => [1 + i, 14 - i, i % 2 ? 'h' : 'H']),
    [10, 5, 'h'], [11, 5, 'S'], [11, 6, 'S'], [12, 7, 'S'], [12, 8, 'S'], [12, 9, 'S'],
    [11, 10, 'F'], [12, 10, 'Y'], [13, 10, 'F'], [11, 11, 'F'], [12, 11, 'Y'], [13, 11, 'F'], [12, 12, 'F'],
  ]),
  pal: { o: O, H: H2, h: H1, S: [240, 240, 240], F: [240, 110, 30], Y: [255, 224, 100] },
};
// 2.8: Sporecap, Spore Stew and the Trident
SPRITES.sporecap = {
  map: [
    '................', '................', '................', '.....oooooo.....', '...ooCCCCCCoo...',
    '..oCCWCCCCWCCo..', '.oCCCCCCCCCCCDo.', '.oCCWCCCCCWCCDo.', '.ooDDDDDDDDDDoo.', '....ooSSSSoo....',
    '.....oSSSSo.....', '.....oSSSDo.....', '.....oSSSDo.....', '......oooo......', '................', '................',
  ],
  pal: { o: [44, 28, 52], C: [150, 96, 200], D: [104, 62, 150], W: [250, 240, 226], S: [226, 214, 190] },
};
SPRITES.spore_stew = {
  map: [
    '................', '................', '....G.G..G......', '...G.G..G.G.....', '..oooooooooooo..',
    '.oBPYPPYPPYPBo..', '.oBPPPYPPPPPBo..', '..oBBBBBBBBBo...', '..oBBDDDDDDBBo..', '..oBDDDDDDDBo...',
    '...oBDDDDDBo....', '....oBBBBBo.....', '.....oooooo.....', '................', '................', '................',
  ],
  pal: { o: [40, 26, 16], B: [150, 104, 62], D: [108, 70, 38], P: [170, 120, 220], Y: [130, 230, 220], G: [190, 240, 240] },
};
function tridentCells(): [number, number, string][] {
  const c: [number, number, string][] = [];
  for (let i = 0; i <= 10; i++) c.push([1 + i, 14 - i, i % 2 ? 'h' : 'H']);                  // the shaft
  for (const [x, y] of [[9, 2], [10, 3], [11, 4], [12, 5], [13, 6]]) c.push([x, y, 'M']);   // the cross-piece
  for (const [x, y] of [[12, 3], [13, 2], [14, 1], [15, 0], [10, 1], [11, 0], [14, 5], [15, 4]]) c.push([x, y, 'L']);   // the three prongs
  return c;
}
SPRITES.trident = { map: diagGrid(tridentCells()), pal: { o: O, H: H2, h: H1, M: [130, 226, 220], L: [190, 248, 244], D: [70, 160, 170] } };
// 2.8.1: the Spore Compass: an iron dial with a violet needle that points at the nearest Spore Isle
SPRITES.spore_compass = {
  map: [
    '................', '.....oooooo.....', '...ooIIIIIIoo...', '..oIIwwwwwwIIo..', '.oIIwwwVwwwwIIo.',
    '.oIwwwVVVwwwwIo.', '.oIwwwVVVVwwwIo.', '.oIwwwwVVVwwwIo.', '.oIwwwwwVVwwwIo.', '.oIwwwwwwEwwwIo.',
    '.oIIwwwwwwwwIIo.', '..oIIwwwwwwIIo..', '...ooIIIIIIoo...', '.....oooooo.....', '................', '................',
  ],
  pal: { o: [40, 40, 48], I: [190, 192, 200], w: [236, 226, 206], V: [150, 90, 210], E: [90, 60, 130] },
};
SPRITES.flame_arrow = {
  map: [
    '................', '...........ooo..', '..........oFFo..', '..........oFYo..', '.........ohoo...',
    '........ohHo....', '.......ohHo.....', '......ohHo......', '.....ohHo.......', '....ohHo........',
    '..ooohHo........', '.oFWoHo.........', '.oWFWo..........', '..oWFo..........', '..ooo...........', '................',
  ],
  pal: { o: O, F: [240, 120, 30], Y: [255, 214, 80], h: H1, H: H2, W: [240, 240, 240] },
};

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

/** 2.1: a leather armour piece in a dye colour (0xRRGGBB): the same drawing, re-coloured. */
export function dyedArmourPixels(id: string, color: number): Uint8ClampedArray {
  const def = SPRITES[id];
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const k = (f: number): RGBA => [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  const lift = (f: number): RGBA => [Math.round(r + (255 - r) * f), Math.round(g + (255 - g) * f), Math.round(b + (255 - b) * f)];
  const pal: Palette = { o: k(0.32), D: k(0.7), M: k(1), L: lift(0.28) };
  return def ? rasterise({ map: def.map, pal }) : spritePixels(id);
}

/** 2.1: an armour stand - a stone foot, a wooden post with a shoulder bar and hip bar, and a round head. */
SPRITES.armour_stand = {
  map: [
    '......oooo......',
    '.....oLLMMo.....',
    '.....oLMMDo.....',
    '......oooo......',
    '.......oMo......',
    '.ooooooLMDooooo.',
    '.oLLLLLLMMMMMDo.',
    '.ooDooooMDoooDo.',
    '..oDo..oMDo.oDo.',
    '..oo...oMDo..oo.',
    '.....ooLMDoo....',
    '.....oLMMMDo....',
    '.....oLoooDo....',
    '.....oMo.oDo....',
    '..ooooooooooooo.',
    '..oSSSSSSSSSSso.',
  ],
  pal: { o: [52, 36, 20], L: [200, 160, 104], M: [158, 120, 70], D: [108, 78, 44], S: [160, 160, 162], s: [104, 104, 108] },
};

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
  cinderling: [[60, 44, 40], [255, 150, 50]],
  smoulderer: [[96, 90, 88], [232, 86, 34]],
  ashboar: [[66, 60, 58], [242, 124, 44]],
  drifter: [[184, 226, 255], [168, 152, 246]],
  fox: [[216, 116, 44], [246, 240, 230]],
  snowpal: [[240, 244, 250], [200, 66, 58]],
  horse: [[140, 96, 60], [46, 32, 22]],
  lavastrider: [[96, 44, 44], [255, 138, 48]],
  sporecap: [[150, 96, 200], [226, 214, 190]],
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


// ---- 2.5: bottles and potions (ORIGINAL; the liquid colour is each effect's own)
const BOTTLE = [
  '................',
  '.....oooooo.....',
  '.....occcco.....',
  '.....occcco.....',
  '......oggo......',
  '......oggo......',
  '.....oggggo.....',
  '....oggLLggo....',
  '...ogLLLLLLgo...',
  '...ogLLLLLLgo...',
  '...ogLLLLLLgo...',
  '...ogLLLLLLgo...',
  '....ogLLLLgo....',
  '.....oggggo.....',
  '......oooo......',
  '................',
];
const SPLASH_BOTTLE = [
  '................',
  '..............s.',
  '.....oooooo..s..',
  '.....occcco.....',
  '......oggo......',
  '.....oggggo.....',
  '....oggLLggo....',
  '...ogLLLLLLgo...',
  '..ogLLLLLLLLgo..',
  '..ogLLLLLLLLgo..',
  '..ogLLLLLLLLgo..',
  '...ogLLLLLLgo...',
  '....ogLLLLgo....',
  '.....oggggo.....',
  '......oooo......',
  '................',
];
const GLASS: RGBA = [200, 224, 232, 160];
function bottle(id: string, map: string[], liquid: RGBA | null): void {
  const m = liquid ? map : map.map((r) => r.replace(/L/g, 'g'));
  SPRITES[id] = { map: m, pal: { o: [40, 48, 56], g: GLASS, c: [150, 110, 70], s: [255, 255, 255], L: liquid ?? GLASS } };
}
bottle('glass_bottle', BOTTLE, null);
bottle('water_bottle', BOTTLE, [70, 130, 230]);
for (const e of EFFECTS) {
  const lit: RGBA = [Math.min(255, e.rgb[0] + 30), Math.min(255, e.rgb[1] + 30), Math.min(255, e.rgb[2] + 30)];
  bottle(potionItem(e.id), BOTTLE, lit);
  bottle(splashItem(e.id), SPLASH_BOTTLE, lit);
}

/** Rasterises a sprite into RGBA pixels. */
export function spritePixels(name: string): Uint8ClampedArray {
  const def = SPRITES[name];
  if (!def) {
    const out = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i++) { const on = ((i & 15) >> 2 ^ (i >> 6)) & 1; out.set(on ? [250, 0, 220, 255] : [0, 0, 0, 255], i * 4); }
    return out;
  }
  return rasterise(def);
}

function rasterise(def: SpriteDef): Uint8ClampedArray {
  const out = new Uint8ClampedArray(16 * 16 * 4);
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


// ---- 2.4 tracks, carts and parties
// (the Party Bag and Party Hat use only the dye letters o D M L, so they can be dyed like leather)
SPRITES.minecart = {
  map: [
    '................',
    '................',
    '.oooooooooooooo.',
    '.oLLLLLLLLLLLLo.',
    '.oGGGGGGGGGGGGo.',
    '..oGGGGGGGGGGo..',
    '..oGMGGGGGGMGo..',
    '..oGGGGGGGGGGo..',
    '..oDDDDDDDDDDo..',
    '...oooooooooo...',
    '..oWWo....oWWo..',
    '.oWKKWo..oWKKWo.',
    '.oWKKWo..oWKKWo.',
    '..oWWo....oWWo..',
    '...oo......oo...',
    '................',
  ],
  pal: { o: [40, 40, 48], L: [214, 216, 226], G: [160, 162, 174], M: [96, 98, 110], D: [112, 114, 126], W: [88, 88, 98], K: [196, 198, 208] },
};
SPRITES.party_bag = {
  map: [
    '................',
    '....oo....oo....',
    '...oLLo..oLLo...',
    '....oLLooLLo....',
    '.....oLLLLo.....',
    '.....oDDDDo.....',
    '....oMMMMMMo....',
    '...oMMLLMMMMo...',
    '...oMLLMMMMDo...',
    '..oMMLMMMMMMDo..',
    '..oMMMMMLMMMDo..',
    '..oMMMMLLLMDDo..',
    '..oMMMMMLMMDDo..',
    '..oDMMMMMMDDDo..',
    '...oDDDDDDDDo...',
    '....oooooooo....',
  ],
  pal: { o: [86, 30, 60], D: [176, 48, 92], M: [226, 76, 120], L: [250, 168, 190] },
};
SPRITES.party_hat = {
  map: [
    '................',
    '.......LL.......',
    '......LLLL......',
    '.......oo.......',
    '......oMMo......',
    '......oLMo......',
    '.....oMMDMo.....',
    '.....oLMMDo.....',
    '....oMMLMMDo....',
    '....oDDDDDDo....',
    '...oMLMMMMDDo...',
    '...oMMMDDMMMo...',
    '..oMMLMMMMMDDo..',
    '..oDDDDDDDDDDo..',
    '..oooooooooooo..',
    '................',
  ],
  pal: { o: [60, 32, 100], D: [120, 60, 190], M: [168, 98, 232], L: [250, 214, 80] },
};
SPRITES.party_popper = {
  map: [
    '.R..G.....B.....',
    '...Y....P....R..',
    '.B....Y....G....',
    '....P.....Y.....',
    '..G...ooo..B....',
    '.....oRRRo..P...',
    '....oRYRRDo.....',
    '...oRRRBRDo.....',
    '...oRYRRRDo.....',
    '..oRRRRRDDo.....',
    '..oRRBRRDo......',
    '.oRRRRDDo.......',
    '.oRRRDDo........',
    '.oRDDDo.........',
    '.oooooo.........',
    '................',
  ],
  pal: { o: [60, 36, 36], R: [220, 60, 66], D: [160, 36, 46], Y: [250, 214, 70], B: [70, 130, 230], G: [100, 200, 100], P: [236, 120, 200] },
};
SPRITES.bunting = {
  map: [
    '................',
    '................',
    'SSSSSSSSSSSSSSSS',
    '..SSSSSSSSSSSS..',
    '.RRRR.YYYY.BBBB.',
    '..RR...YY...BB..',
    '................',
    '.GGGG..RRRR.....',
    '..GG....RR......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  pal: { S: [222, 220, 210], R: [214, 54, 58], Y: [246, 206, 54], B: [58, 108, 218], G: [104, 190, 60] },
};
SPRITES.cake = {
  map: [
    '.......R........',
    '.......Y........',
    '.......c........',
    '.......c........',
    '...oooooooooo...',
    '..oPPCPPCPPCPo..',
    '..oCCCCCCCCCCo..',
    '.oPCPPCPPCPPCPo.',
    '.ooooooooooooo..',
    '.oSSSSSSSSSSSo..',
    '.oJJJJJJJJJJJo..',
    '.oSSSSSSSSSSSo..',
    '.oDDDDDDDDDDDo..',
    '..ooooooooooo...',
    '................',
    '................',
  ],
  pal: { o: [110, 70, 50], P: [240, 142, 170], C: [252, 240, 220], S: [232, 184, 108], J: [196, 44, 66], D: [206, 150, 78], R: [255, 150, 40], Y: [255, 224, 90], c: [250, 244, 232] },
};

// ---- 2.3 snow day, pets and farm animals
SPRITES.snowball = {
  map: [
    '................',
    '................',
    '................',
    '................',
    '......oooo......',
    '....ooWWWWoo....',
    '...oWWWWWWLWo...',
    '...oWWLWWWWWo...',
    '..oWWWWWWWWWBo..',
    '..oWWWWWWLWWBo..',
    '...oWWWWWWWBo...',
    '...oBWWWWWBBo...',
    '....ooBBBBoo....',
    '......oooo......',
    '................',
    '................',
  ],
  pal: { o: [120, 136, 160], W: [250, 252, 255], L: [222, 232, 246], B: [196, 212, 232] },
};
SPRITES.shears = {
  map: [
    '................',
    '................',
    '..........oo....',
    '.........oSSo...',
    '........oSSo....',
    '..oo...oSSo.....',
    '.oSSo.oSSo......',
    '..oSSoSSo.......',
    '...oSSSo........',
    '....oSSo........',
    '...oRoSSo.......',
    '..oR.RoSSo......',
    '..oR..Ro.oo.....',
    '..oR..Ro........',
    '...oRRo.........',
    '....oo..........',
  ],
  pal: { o: [40, 40, 46], S: [214, 218, 226], R: [190, 58, 50] },
};
SPRITES.name_tag = {
  map: [
    '................',
    '................',
    '........SS......',
    '.......S..S.....',
    '......S....S....',
    '.....ooooooooo..',
    '....oTTTTTTTTTo.',
    '...oTTHTTTTTTTo.',
    '..oTTTTTTTTTTTo.',
    '..oTTTTKKKKKTTo.',
    '..oTTTTTTTTTTTo.',
    '...oTTTKKKTTTTo.',
    '....oTTTTTTTTTo.',
    '.....ooooooooo..',
    '................',
    '................',
  ],
  pal: { o: [92, 62, 34], T: [214, 176, 112], H: [92, 62, 34], K: [120, 86, 50], S: [236, 230, 214] },
};
SPRITES.sledge = {
  map: [
    '................',
    '................',
    '................',
    '................',
    '..R.............',
    '..RR............',
    '...RooooooooooH.',
    '...oPPPPPPPPPPo.',
    '...oLLLLLLLLLLo.',
    '....oPoooooPo...',
    '....oPo...oPo...',
    '.RRRRRRRRRRRRRR.',
    '.RDDDDDDDDDDDDR.',
    '..RR..........R.',
    '................',
    '................',
  ],
  pal: { o: [60, 40, 20], P: [176, 136, 84], L: [140, 104, 60], R: [200, 62, 50], D: [150, 40, 34], H: [222, 206, 160] },
};
