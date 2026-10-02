import { hash4, mulberry32 } from '../core/rng';

/**
 * ORIGINAL NAMES for villagers and villages, built from syllables so every
 * villager has a stable name from its own random seed (nothing extra to save).
 */
const FIRST = [
  'Bran', 'Ald', 'Mer', 'Tov', 'Wil', 'Ost', 'Hal', 'Cor', 'Fen', 'Ys', 'Eda', 'Mar', 'Tam', 'Rho', 'Bel', 'Gar',
  'Lin', 'Sef', 'Dor', 'Ama', 'Ner', 'Oda', 'Pel', 'Quil', 'Ros', 'Ulf', 'Wen', 'Ari', 'Bry', 'Cae', 'Hew', 'Ivo',
  'Jor', 'Kel', 'Lor', 'Mab', 'Nim', 'Orr', 'Pip', 'Sab', 'Tib', 'Una', 'Vey', 'Wyn', 'Ead', 'Gwen', 'Hob', 'Isa',
];
const END = [
  'noc', 'win', 'ric', 'a', 'ella', 'ard', 'o', 'wen', 'ith', 'an', 'ia', 'mund', 'ry', 'is', 'eth', 'ora',
  'ald', 'ina', 'ek', 'ette', 'el', 'on', 'yn', 'ard', 'isa', 'ot', 'umb', 'ys',
];

/** A villager's name, from its seed: "Brannoc", "Edaella", "Tovric"... */
export function villagerName(seed: number): string {
  const r = mulberry32(hash4(seed, 0x6e61, 0x6d65, 7));
  const a = FIRST[Math.floor(r() * FIRST.length)];
  let b = END[Math.floor(r() * END.length)];
  // no doubled letters across the join ("Ama" + "a")
  if (a[a.length - 1] === b[0]) b = b.slice(1) || 'n';
  return a + b;
}

const V_FIRST = ['Mill', 'Oak', 'Ash', 'Thorn', 'Brook', 'Stone', 'Fern', 'Wheat', 'Elder', 'Holly', 'Copper', 'Amber', 'Briar', 'Hazel', 'Willow', 'Marsh', 'Sand', 'Pine', 'Frost', 'Red'];
const V_END = ['brook', 'hollow', 'field', 'ford', 'stead', 'wick', 'combe', 'ley', 'dale', 'mere', 'bury', 'ton', 'well', 'gate', 'thorpe', 'holm'];

/** A village's name, from the world seed and its id: "Millbrook", "Ashcombe"... */
export function villageName(worldSeed: number, id: string): string {
  let h = 0;
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  const r = mulberry32(hash4(worldSeed, h, 0x7611, 3));
  const a = V_FIRST[Math.floor(r() * V_FIRST.length)];
  let b = V_END[Math.floor(r() * V_END.length)];
  if (a.toLowerCase().endsWith(b.slice(0, 2))) b = V_END[(V_END.indexOf(b) + 1) % V_END.length];
  return a + b;
}
