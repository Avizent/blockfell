import {
  AIR, BEDROCK, CULL_GROUP, CULL_SAME, FACE_LAYER, FLUID_LEVEL, IS_LAVA, IS_OPAQUE, IS_WATER, MODEL, NEIGHBOR_LIGHT, RENDER,
  RENDER_CROSS, RENDER_CUBE, RENDER_LIQUID, RENDER_MODEL, RENDER_TORCH, RENDER_WALL_TORCH, TOP_ROT, getBlock,
  CONNECT, CONNECT_MODEL, CONNECT_PANE, MODEL_CROSS, MODEL_FACES, PANE_EDGE_LAYER, connectMask,
} from '../world/BlockRegistry';
import { CHUNK_VOLUME, WORLD_HEIGHT } from '../world/constants';
import { computeLight, PAD, PLANE, PVOL, PW, PY, pIndex } from './Lighting';
import { MeshBuffers, MeshBuilder } from './MeshBuilder';
import { LAVA_LAYER, WATER_LAYER } from './textureNames';

/**
 * CHUNK MESHING
 * =============
 * Converts voxel data into renderable geometry. The world itself is only block ids;
 * this module derives an optimised mesh from them:
 *
 *  1. Hidden-face elimination: a face is emitted only if the neighbouring cell in
 *     that direction does not hide it (an opaque cube hides everything; glass hides
 *     glass; water hides water). Neighbour lookups use the padded 3x3 volume, so
 *     faces on chunk borders are culled against the adjacent chunk correctly.
 *
 *  2. Per-vertex ambient occlusion and smooth lighting are computed for each visible
 *     face (0fps / reference-game style: 2 side cells + 1 corner cell per vertex).
 *
 *  3. GREEDY MESHING: for each of the 6 directions and each slice, visible faces are
 *     written into a 2D mask keyed by everything that affects their appearance
 *     (texture layer, AO, light, liquid flags). Runs of identical keys are grown
 *     first along U, then along V, into maximal rectangles, each emitted as ONE
 *     quad. Textures tile across merged quads because UVs are in block units and
 *     the texture array uses REPEAT wrapping. A face is only mergeable if its four
 *     corner values are identical; faces with a lighting/AO gradient are emitted
 *     individually so merging never changes the image.
 *
 *  Output: one opaque/cutout mesh + one translucent (water) mesh per chunk. Lava is
 *  a liquid too (same surface shapes as water) but opaque and self-lit, so it goes
 *  into the opaque mesh with full block light and an animated texture layer.
 */

export interface MeshStats {
  visibleFaces: number;   // faces surviving hidden-face elimination
  quads: number;          // quads after greedy merging
  vertices: number;
  lightMs: number;
  meshMs: number;
}

export interface MeshResult {
  opaque: MeshBuffers | null;
  water: MeshBuffers | null;
  light: Uint8Array;              // packed (sky << 4 | block) for the centre chunk
  minY: number;
  maxY: number;
  stats: MeshStats;
  lightChanged: number[];         // neighbour slots (0..8) whose border lighting changed
}

// Directions: axis a (0=x,1=y,2=z), sign, tangent axes (u, v) and whether the (u,v,n)
// basis is left-handed (then the vertex order is reversed to stay counter-clockwise).
interface Dir { a: number; s: number; u: number; v: number; reverse: boolean }
const DIRS: Dir[] = [
  { a: 0, s: 1, u: 2, v: 1, reverse: true },   // +X east
  { a: 0, s: -1, u: 2, v: 1, reverse: false }, // -X west
  { a: 1, s: 1, u: 0, v: 2, reverse: true },   // +Y up
  { a: 1, s: -1, u: 0, v: 2, reverse: false }, // -Y down
  { a: 2, s: 1, u: 0, v: 1, reverse: false },  // +Z south
  { a: 2, s: -1, u: 0, v: 1, reverse: true },  // -Z north
];
const AXIS_STEP = [1, PLANE, PW];

const padded = new Uint8Array(PVOL);
const sky = new Uint8Array(PVOL);
const blk = new Uint8Array(PVOL);
const opaqueB = new MeshBuilder(32768);
const waterB = new MeshBuilder(8192);
const maskA = new Int32Array(16 * WORLD_HEIGHT);
const maskB = new Int32Array(16 * WORLD_HEIGHT);
const maskC = new Int32Array(16 * WORLD_HEIGHT);
const cornerAo = new Int32Array(4);
const cornerSky = new Int32Array(4);
const cornerBlk = new Int32Array(4);
const coord = [0, 0, 0];

/** Copies the 3x3 chunk neighbourhood (index (dz+1)*3 + (dx+1)) into the padded volume. */
function fillPadded(chunks: Uint8Array[]): void {
  // bottom guard row: solid; top guard row: air
  padded.fill(BEDROCK, 0, PLANE);
  padded.fill(AIR, (PY - 1) * PLANE, PVOL);
  for (let dz = 0; dz < 3; dz++) {
    for (let dx = 0; dx < 3; dx++) {
      const src = chunks[dz * 3 + dx];
      const colOff = dx * 16;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const dstRow = (y + 1) * PLANE + dz * 16 * PW + colOff;
        let s = y << 8;
        for (let z = 0; z < 16; z++) {
          let d = dstRow + z * PW;
          // plain loop: avoids allocating a subarray view per row
          for (let x = 0; x < 16; x++) padded[d++] = src[s++];
        }
      }
    }
  }
}

/** Uv for a vertex (1/16 units) so textures are upright and never mirrored on any face. */
function uvFor(face: number, x: number, y: number, z: number, out: number[]): void {
  switch (face) {
    case 0: out[0] = -z; out[1] = -y; break;
    case 1: out[0] = z; out[1] = -y; break;
    case 2: out[0] = x; out[1] = z; break;
    case 3: out[0] = x; out[1] = -z; break;
    case 4: out[0] = x; out[1] = -y; break;
    default: out[0] = -x; out[1] = -y; break;
  }
}

const uvTmp = [0, 0];
const vtx = new Int32Array(12);

/**
 * Emits one quad for face `f` covering (u0..u0+w, v0..v0+h) on slice `sl`.
 * `lowerTop` shortens the top edge by 2/16 (water surface).
 */
function emitQuad(b: MeshBuilder, f: number, sl: number, u0: number, v0: number, w: number, h: number,
  layer: number, ao: Int32Array, sk: Int32Array, bl: Int32Array, lowerTop: boolean, uniform: boolean): void {
  const d = DIRS[f];
  const plane = (d.s > 0 ? sl + 1 : sl) * 16 - (lowerTop && d.a === 1 ? 2 : 0);
  const U0 = u0 * 16, U1 = (u0 + w) * 16;
  const V0 = v0 * 16;
  let V1 = (v0 + h) * 16;
  if (lowerTop && d.v === 1) V1 -= 2;
  // corners (u,v): 0=(U0,V0) 1=(U1,V0) 2=(U1,V1) 3=(U0,V1)
  const us = [U0, U1, U1, U0], vs = [V0, V0, V1, V1];
  for (let c = 0; c < 4; c++) {
    const o = c * 3;
    vtx[o + d.a] = plane;
    vtx[o + d.u] = us[c];
    vtx[o + d.v] = vs[c];
  }
  const order = d.reverse ? [0, 3, 2, 1] : [0, 1, 2, 3];
  const base = b.vc;
  for (let k = 0; k < 4; k++) {
    const c = order[k];
    const o = c * 3;
    uvFor(f, vtx[o], vtx[o + 1], vtx[o + 2], uvTmp);
    b.vertex(vtx[o], vtx[o + 1], vtx[o + 2], uvTmp[0], uvTmp[1], layer, f | (ao[c] << 3), sk[c], bl[c]);
  }
  let flip = false;
  if (!uniform) {
    // choose the diagonal joining the more similar corners (removes AO anisotropy)
    const val = (c: number) => ao[c] * 80 + sk[c] + bl[c];
    const a0 = val(order[0]), a1 = val(order[1]), a2 = val(order[2]), a3 = val(order[3]);
    flip = Math.abs(a0 - a2) > Math.abs(a1 - a3);
  }
  b.quad(base, flip);
}

/**
 * Computes AO + smooth light for the 4 corners of the face of the block at padded index
 * `pi` facing direction f. Returns merge flags: bit 0 = values constant along U
 * (c0==c1, c3==c2), bit 1 = constant along V (c0==c3, c1==c2). A face may only be
 * merged along an axis on which its lighting does not vary, which keeps greedy
 * meshing pixel-identical to per-block faces.
 */
function faceCorners(pi: number, f: number): number {
  const d = DIRS[f];
  const front = pi + d.s * AXIS_STEP[d.a];
  const du = AXIS_STEP[d.u], dv = AXIS_STEP[d.v];
  const fs = sky[front], fb = blk[front];
  for (let c = 0; c < 4; c++) {
    const su = c === 1 || c === 2 ? du : -du;
    const sv = c >= 2 ? dv : -dv;
    const s1 = front + su, s2 = front + sv, cc = front + su + sv;
    const o1 = IS_OPAQUE[padded[s1]], o2 = IS_OPAQUE[padded[s2]], oc = IS_OPAQUE[padded[cc]];
    cornerAo[c] = o1 && o2 ? 0 : 3 - o1 - o2 - oc;
    let ss = fs, sb = fb, n = 1;
    if (!o1) { ss += sky[s1]; sb += blk[s1]; n++; }
    if (!o2) { ss += sky[s2]; sb += blk[s2]; n++; }
    if (!oc && !(o1 && o2)) { ss += sky[cc]; sb += blk[cc]; n++; }
    cornerSky[c] = Math.round((ss * 4) / n);
    cornerBlk[c] = Math.round((sb * 4) / n);
  }
  const a = cornerAo, s = cornerSky, b = cornerBlk;
  const u = a[0] === a[1] && a[3] === a[2] && s[0] === s[1] && s[3] === s[2] && b[0] === b[1] && b[3] === b[2];
  const v = a[0] === a[3] && a[1] === a[2] && s[0] === s[3] && s[1] === s[2] && b[0] === b[3] && b[1] === b[2];
  return (u ? 1 : 0) | (v ? 2 : 0);
}

const uniAo = new Int32Array(4), uniSky = new Int32Array(4), uniBlk = new Int32Array(4);

/**
 * Slabs and stairs block light (so a slab roof casts shade) but must not render
 * black: like the reference game they take the brightest light of the cells around
 * them. Done once after lighting, for the centre chunk plus a 1-cell ring.
 */
const nlIdx: number[] = [];
const nlVal: number[] = [];
function applyNeighborLight(): void {
  nlIdx.length = 0; nlVal.length = 0;
  for (let y = 1; y < PY - 1; y++) {
    for (let z = PAD - 1; z <= PAD + 16; z++) {
      let i = y * PLANE + z * PW + PAD - 1;
      for (let x = PAD - 1; x <= PAD + 16; x++, i++) {
        if (!NEIGHBOR_LIGHT[padded[i]]) continue;
        let sk = sky[i + PLANE], bl = blk[i + PLANE];
        for (const o of [1, -1, PW, -PW]) { if (sky[i + o] > sk) sk = sky[i + o]; if (blk[i + o] > bl) bl = blk[i + o]; }
        nlIdx.push(i); nlVal.push((sk << 4) | bl);
      }
    }
  }
  for (let k = 0; k < nlIdx.length; k++) { sky[nlIdx[k]] = nlVal[k] >> 4; blk[nlIdx[k]] = nlVal[k] & 15; }
}

// ---- water surface heights (1/16 units): sources 14, flowing water lower with distance
function fluidHeight(id: number): number {
  const l = FLUID_LEVEL[id];
  if (l <= 0 || l >= 8) return 14;
  return Math.max(2, Math.round((14 * (8 - l)) / 8));
}
const waterH = new Int32Array(4); // NW, NE, SE, SW
/**
 * Corner heights shared by the (up to) four water cells around each corner: the
 * highest of them, or a full block if any has water directly above. Every cell
 * computes a shared corner identically, so neighbouring surfaces always meet.
 */
function waterCorners(pi: number, kind: Uint8Array = IS_WATER): boolean {
  const cells = [[-1, -PW, -1 - PW], [1, -PW, 1 - PW], [1, PW, 1 + PW], [-1, PW, -1 + PW]];
  for (let c = 0; c < 4; c++) {
    let h = -1;
    for (const o of [0, cells[c][0], cells[c][1], cells[c][2]]) {
      const n = pi + o;
      const id = padded[n];
      if (!kind[id]) continue;
      if (kind[padded[n + PLANE]]) { h = 16; break; }
      const hh = fluidHeight(id);
      if (hh > h) h = hh;
    }
    waterH[c] = h;
  }
  // flat surfaces at the standard heights go through the greedy mesher
  return waterH[0] === waterH[1] && waterH[1] === waterH[2] && waterH[2] === waterH[3] && (waterH[0] === 14 || waterH[0] === 16);
}

export function meshChunk(chunks: Uint8Array[], greedy: boolean, prevLight: (Uint8Array | null)[] | null): MeshResult {
  const t0 = performance.now();
  fillPadded(chunks);
  computeLight(padded, sky, blk);
  applyNeighborLight();
  const t1 = performance.now();

  opaqueB.reset();
  waterB.reset();
  const center = chunks[4];
  let minY = WORLD_HEIGHT, maxY = -1;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    const s = y << 8;
    for (let i = 0; i < 256; i++) if (center[s + i] !== AIR) { if (y < minY) minY = y; maxY = y; break; }
  }
  let visibleFaces = 0, quads = 0;

  if (maxY >= 0) {
    for (let f = 0; f < 6; f++) {
      const d = DIRS[f];
      const dn = d.s * AXIS_STEP[d.a];
      const vIsY = d.v === 1;
      const slLo = d.a === 1 ? minY : 0, slHi = d.a === 1 ? maxY : 15;
      const vLo = vIsY ? minY : 0;
      const dimU = 16, dimV = vIsY ? maxY - minY + 1 : 16;
      for (let sl = slLo; sl <= slHi; sl++) {
        // ---- build mask for this slice
        let any = false;
        for (let iv = 0; iv < dimV; iv++) {
          for (let iu = 0; iu < dimU; iu++) {
            const m = iu + iv * dimU;
            maskA[m] = 0;
            coord[d.a] = sl; coord[d.u] = iu; coord[d.v] = iv + vLo;
            const pi = pIndex(coord[0], coord[1], coord[2]);
            const b = padded[pi];
            if (b === AIR) continue;
            const r = RENDER[b];
            const nb = padded[pi + dn];
            if (r === RENDER_CUBE) {
              if (IS_OPAQUE[nb] || (CULL_SAME[b] && nb === b)) continue;
              visibleFaces++;
              const layer = FACE_LAYER[b * 6 + f];
              const merge = faceCorners(pi, f);
              if (merge !== 0 && greedy) {
                const a = cornerAo, sk = cornerSky, bl = cornerBlk;
                maskA[m] = 1 | (layer << 1) | ((a[0] | (a[1] << 2) | (a[2] << 4) | (a[3] << 6)) << 9) | (merge << 19);
                maskB[m] = sk[0] | (sk[1] << 6) | (sk[2] << 12) | (sk[3] << 18);
                maskC[m] = bl[0] | (bl[1] << 6) | (bl[2] << 12) | (bl[3] << 18);
                any = true;
              } else {
                emitQuad(opaqueB, f, sl, coord[d.u], coord[d.v], 1, 1, layer, cornerAo, cornerSky, cornerBlk, false, merge === 3);
                quads++;
              }
            } else if (r === RENDER_LIQUID) {
              const lava = IS_LAVA[b] === 1;
              const kind = lava ? IS_LAVA : IS_WATER;
              if (kind[nb] || IS_OPAQUE[nb]) continue;
              visibleFaces++;
              // sloped (flowing) surfaces are emitted per block by emitSlopedWater
              if (!waterCorners(pi, kind)) continue;
              const lowered = f !== 3 && waterH[0] === 14 ? 1 : 0;
              const front = pi + dn;
              const s4 = sky[front] * 4, b4 = lava ? 60 : blk[front] * 4;
              const layer = lava ? LAVA_LAYER : WATER_LAYER;
              if (greedy) {
                maskA[m] = 1 | (layer << 1) | (0xff << 9) | (3 << 19) | ((lava ? 0 : 1) << 21) | (lowered << 22);
                maskB[m] = s4 | (s4 << 6) | (s4 << 12) | (s4 << 18);
                maskC[m] = b4 | (b4 << 6) | (b4 << 12) | (b4 << 18);
                any = true;
              } else {
                uniAo.fill(3); uniSky.fill(s4); uniBlk.fill(b4);
                emitQuad(lava ? opaqueB : waterB, f, sl, coord[d.u], coord[d.v], 1, 1, layer, uniAo, uniSky, uniBlk, lowered === 1, true);
                quads++;
              }
            }
          }
        }
        if (!any) continue;
        // ---- greedy merge
        for (let iv = 0; iv < dimV; iv++) {
          let iu = 0;
          while (iu < dimU) {
            const m = iu + iv * dimU;
            const ka = maskA[m];
            if (ka === 0) { iu++; continue; }
            const kb = maskB[m], kc = maskC[m];
            const canU = (ka >> 19) & 1, canV = (ka >> 20) & 1;
            let w = 1;
            if (canU) while (iu + w < dimU && maskA[m + w] === ka && maskB[m + w] === kb && maskC[m + w] === kc) w++;
            let h = 1;
            if (canV) {
              outer: while (iv + h < dimV) {
                const row = m + h * dimU;
                for (let k = 0; k < w; k++) {
                  if (maskA[row + k] !== ka || maskB[row + k] !== kb || maskC[row + k] !== kc) break outer;
                }
                h++;
              }
            }
            for (let hh = 0; hh < h; hh++) maskA.fill(0, m + hh * dimU, m + hh * dimU + w);
            const layer = (ka >> 1) & 255;
            const aoBits = (ka >> 9) & 255;
            const isWater = (ka >> 21) & 1;
            const lowered = ((ka >> 22) & 1) === 1;
            for (let c = 0; c < 4; c++) {
              uniAo[c] = (aoBits >> (c * 2)) & 3;
              uniSky[c] = (kb >> (c * 6)) & 63;
              uniBlk[c] = (kc >> (c * 6)) & 63;
            }
            emitQuad(isWater ? waterB : opaqueB, f, sl, iu, iv + vLo, w, h, layer, uniAo, uniSky, uniBlk, lowered, true);
            quads++;
            iu += w;
          }
        }
      }
    }
    quads += emitSpecialModels(minY, maxY);
    quads += emitSlopedWater(minY, maxY);
  }

  // ---- light snapshot for the centre chunk (entity/hand lighting on the main thread)
  const light = new Uint8Array(CHUNK_VOLUME);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < 16; z++) {
      const pi = pIndex(0, y, z);
      const li = (y << 8) | (z << 4);
      for (let x = 0; x < 16; x++) light[li + x] = (sky[pi + x] << 4) | blk[pi + x];
    }
  }

  const lightChanged: number[] = [];
  if (prevLight) {
    for (let slot = 0; slot < 9; slot++) {
      const prev = prevLight[slot];
      if (slot === 4 || !prev) continue;
      if (bandChanged(slot, prev)) lightChanged.push(slot);
    }
  }

  const opaque = opaqueB.finish();
  const water = waterB.finish();
  const t2 = performance.now();
  return {
    opaque, water, light, minY: Math.max(0, minY), maxY: Math.max(0, maxY + 1),
    stats: {
      visibleFaces, quads, vertices: opaqueB.vc + waterB.vc, lightMs: t1 - t0, meshMs: t2 - t1,
    },
    lightChanged,
  };
}

/**
 * After a block edit the centre chunk is re-lit, but the change may spill into
 * neighbours. Light entering a neighbour must cross the 2-block band next to the
 * shared border, and the band is fully inside the padded volume (so its new values
 * are exact). If no band cell changed, the neighbour's lighting is unaffected and it
 * is NOT remeshed.
 */
function bandChanged(slot: number, prev: Uint8Array): boolean {
  const dx = (slot % 3) - 1, dz = Math.floor(slot / 3) - 1;
  const xs = dx === 0 ? [0, 15] : dx > 0 ? [0, 1] : [14, 15];
  const zs = dz === 0 ? [0, 15] : dz > 0 ? [0, 1] : [14, 15];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = zs[0]; z <= zs[1]; z++) {
      for (let x = xs[0]; x <= xs[1]; x++) {
        const pi = pIndex(x + dx * 16, y, z + dz * 16);
        const v = (sky[pi] << 4) | blk[pi];
        if (v !== prev[(y << 8) | (z << 4) | x]) return true;
      }
    }
  }
  return false;
}

/** Cross-shaped plants and torches (not greedy-mergeable, emitted per block). */
function emitSpecialModels(minY: number, maxY: number): number {
  let n = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const pi = pIndex(x, y, z);
        const b = padded[pi];
        const r = RENDER[b];
        if (r === RENDER_MODEL) { n += emitModel(b, pi, x, y, z); continue; }
        if (r !== RENDER_CROSS && r !== RENDER_TORCH && r !== RENDER_WALL_TORCH) continue;
        const s4 = sky[pi] * 4, b4 = blk[pi] * 4;
        const layer = FACE_LAYER[b * 6];
        const X = x * 16, Y = y * 16, Z = z * 16;
        if (r === RENDER_WALL_TORCH) {
          n += emitTorch(X, Y, Z, layer, s4, b4, WALL_TURNS[getBlock(b).facing ?? 'n']);
        } else if (r === RENDER_CROSS) {
          const data = 6 | (3 << 3);
          const planes = [[1, 1, 15, 15], [1, 15, 15, 1]];
          for (const [ax, az, bx, bz] of planes) {
            for (let side = 0; side < 2; side++) {
              const v = opaqueB.vc;
              const p = side === 0
                ? [[ax, az, 0], [bx, bz, 16]]
                : [[bx, bz, 0], [ax, az, 16]];
              opaqueB.vertex(X + p[0][0], Y, Z + p[0][1], 0, 16, layer, data, s4, b4);
              opaqueB.vertex(X + p[1][0], Y, Z + p[1][1], 16, 16, layer, data, s4, b4);
              opaqueB.vertex(X + p[1][0], Y + 16, Z + p[1][1], 16, 0, layer, data, s4, b4);
              opaqueB.vertex(X + p[0][0], Y + 16, Z + p[0][1], 0, 0, layer, data, s4, b4);
              opaqueB.quad(v, false);
              n++;
            }
          }
        } else {
          n += emitTorch(X, Y, Z, layer, s4, b4);
        }
      }
    }
  }
  return n;
}

const WALL_TURNS: Record<string, number> = { n: 0, e: 1, s: 2, w: 3 };

/**
 * Torch model. `wall` >= 0 leans it out of a wall: the canonical wall torch sits
 * against the south side of its cell and tilts north; other facings are rotated.
 */
function emitTorch(X: number, Y: number, Z: number, layer: number, s4: number, b4: number, wall = -1): number {
  const x0 = X + 7, x1 = X + 9, z0 = Z + 7, z1 = Z + 9, y0 = Y, y1 = Y + 10;
  const B = opaqueB;
  const put = (face: number, pts: number[][], uvs: number[][]) => {
    const v = B.vc;
    for (let k = 0; k < 4; k++) {
      let [px, py, pz] = pts[k];
      if (wall >= 0) {
        const ly = py - Y;
        let lx = px - X, lz = pz - Z + 6.5 - ly * 0.4;
        py = Y + ly + 3.5;
        for (let t = 0; t < wall; t++) { const ox = lx; lx = 16 - lz; lz = ox; }
        px = X + lx; pz = Z + lz;
      }
      B.vertex(Math.round(px), Math.round(py), Math.round(pz), uvs[k][0], uvs[k][1], layer, face | (3 << 3), s4, b4);
    }
    B.quad(v, false);
  };
  const sideUv = [[7, 16], [9, 16], [9, 6], [7, 6]];
  put(4, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], sideUv);  // +Z
  put(5, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], sideUv);  // -Z
  put(0, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], sideUv);  // +X
  put(1, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], sideUv);  // -X
  put(2, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[7, 8], [9, 8], [9, 6], [7, 6]]); // top
  put(3, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[7, 16], [9, 16], [9, 14], [7, 14]]); // bottom
  return 6;
}

// ------------------------------------------------------------------ box models
const boxCorner = new Int32Array(12);
/**
 * Emits one face of an axis-aligned box (absolute 1/16 coordinates), with the same
 * corner order and winding as the cube faces so culling and shading match.
 */
function emitBoxFace(Bld: MeshBuilder, f: number, lo: number[], hi: number[], layer: number, s4: number, b4: number,
  rot: number, bx: number, bz: number): void {
  const d = DIRS[f];
  const plane = d.s > 0 ? hi[d.a] : lo[d.a];
  const us = [lo[d.u], hi[d.u], hi[d.u], lo[d.u]], vs = [lo[d.v], lo[d.v], hi[d.v], hi[d.v]];
  for (let c = 0; c < 4; c++) {
    const o = c * 3;
    boxCorner[o + d.a] = plane; boxCorner[o + d.u] = us[c]; boxCorner[o + d.v] = vs[c];
  }
  const order = d.reverse ? [0, 3, 2, 1] : [0, 1, 2, 3];
  const base = Bld.vc;
  for (let k = 0; k < 4; k++) {
    const o = order[k] * 3;
    let ux = boxCorner[o], uz = boxCorner[o + 2];
    if (rot && d.a === 1) {
      // rotate the texture on top/bottom faces (beds point in different directions)
      let lx = ux - bx, lz = uz - bz;
      for (let t = 0; t < rot; t++) { const ox = lx; lx = lz; lz = 16 - ox; }
      ux = bx + lx; uz = bz + lz;
    }
    uvFor(f, ux, boxCorner[o + 1], uz, uvTmp);
    Bld.vertex(boxCorner[o], boxCorner[o + 1], boxCorner[o + 2], uvTmp[0], uvTmp[1], layer, f | (3 << 3), s4, b4);
  }
  Bld.quad(base, false);
}

const lo = [0, 0, 0], hi = [0, 0, 0];
/**
 * Box models. Fences and glass panes (CONNECT) pick their arms from the four
 * neighbouring cells, read from the padded volume so connections across chunk
 * borders are exact. Faces on the cell boundary are culled against opaque
 * neighbours and against touching blocks of the same cull group.
 */
function emitModel(b: number, pi: number, x: number, y: number, z: number): number {
  const k = CONNECT[b];
  const m = k ? CONNECT_MODEL[k][connectMask(b, padded[pi - PW], padded[pi + 1], padded[pi + PW], padded[pi - 1])] : MODEL[b];
  let n = 0;
  const cross = MODEL_CROSS[b];
  if (cross) n += emitSmallCross(x, y, z, pi, cross);
  if (!m) return n;
  const rot = TOP_ROT[b];
  const group = CULL_GROUP[b];
  const isBed = group >= 0 && getBlock(b).shape === 'bed';
  const faces = MODEL_FACES[b];
  for (let i = 0; i < m.length; i += 6) {
    lo[0] = x * 16 + m[i]; lo[1] = y * 16 + m[i + 1]; lo[2] = z * 16 + m[i + 2];
    hi[0] = x * 16 + m[i + 3]; hi[1] = y * 16 + m[i + 4]; hi[2] = z * 16 + m[i + 5];
    for (let f = 0; f < 6; f++) {
      const d = DIRS[f];
      const local = d.s > 0 ? m[i + 3 + d.a] : m[i + d.a];
      const boundary = d.s > 0 ? local === 16 : local === 0;
      const np = pi + d.s * AXIS_STEP[d.a];
      const nb = padded[np];
      if (boundary) {
        if (IS_OPAQUE[nb]) continue;
        if (group >= 0 && CULL_GROUP[nb] === group && (nb === b || d.a === 1 || isBed)) continue;
      }
      let layer = FACE_LAYER[b * 6 + f];
      if (faces && faces[i + f] >= 0) layer = faces[i + f];
      // glass panes: the narrow sides and the top show the pane edge, not the glass
      if (k === CONNECT_PANE && (d.a === 1 || m[i + 3 + d.u] - m[i + d.u] <= 2)) layer = PANE_EDGE_LAYER;
      // light from the cell the face looks into (the block's own, neighbour-lit value if that is solid)
      const lp = IS_OPAQUE[nb] ? pi : np;
      emitBoxFace(opaqueB, f, lo, hi, layer, sky[lp] * 4, blk[lp] * 4, rot, x * 16, z * 16);
      n++;
    }
  }
  return n;
}

/** A plant standing in a flower pot: a smaller cross, two double-sided planes. */
function emitSmallCross(x: number, y: number, z: number, pi: number, c: Int16Array): number {
  const [layer, a, bb, y0, y1] = c;
  const X = x * 16, Y = y * 16, Z = z * 16;
  const s4 = sky[pi] * 4, b4 = blk[pi] * 4;
  const data = 6 | (3 << 3);
  let n = 0;
  for (const [ax, az, bx, bz] of [[a, a, bb, bb], [a, bb, bb, a]]) {
    for (let side = 0; side < 2; side++) {
      const v = opaqueB.vc;
      const p0 = side === 0 ? [ax, az] : [bx, bz], p1 = side === 0 ? [bx, bz] : [ax, az];
      opaqueB.vertex(X + p0[0], Y + y0, Z + p0[1], 0, 16, layer, data, s4, b4);
      opaqueB.vertex(X + p1[0], Y + y0, Z + p1[1], 16, 16, layer, data, s4, b4);
      opaqueB.vertex(X + p1[0], Y + y1, Z + p1[1], 16, 0, layer, data, s4, b4);
      opaqueB.vertex(X + p0[0], Y + y1, Z + p0[1], 0, 0, layer, data, s4, b4);
      opaqueB.quad(v, false);
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------ flowing water and lava
/** Water and lava cells whose surface is not flat are emitted here, one quad per visible face. */
function emitSlopedWater(minY: number, maxY: number): number {
  let n = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const pi = pIndex(x, y, z);
        const id = padded[pi];
        const lava = IS_LAVA[id] === 1;
        if (!lava && !IS_WATER[id]) continue;
        const kind = lava ? IS_LAVA : IS_WATER;
        if (waterCorners(pi, kind)) continue;
        const [hNW, hNE, hSE, hSW] = waterH;
        const X = x * 16, Y = y * 16, Z = z * 16;
        const Bld = lava ? opaqueB : waterB;
        const layer = lava ? LAVA_LAYER : WATER_LAYER;
        for (let f = 0; f < 6; f++) {
          const d = DIRS[f];
          const np = pi + d.s * AXIS_STEP[d.a];
          const nb = padded[np];
          if (kind[nb] || IS_OPAQUE[nb]) continue;
          const s4 = sky[np] * 4, b4 = lava ? 60 : blk[np] * 4;
          let pts: number[][];
          switch (f) {
            case 2: pts = [[X, Y + hNW, Z], [X, Y + hSW, Z + 16], [X + 16, Y + hSE, Z + 16], [X + 16, Y + hNE, Z]]; break;
            case 3: pts = [[X, Y, Z], [X + 16, Y, Z], [X + 16, Y, Z + 16], [X, Y, Z + 16]]; break;
            case 0: pts = [[X + 16, Y, Z], [X + 16, Y + hNE, Z], [X + 16, Y + hSE, Z + 16], [X + 16, Y, Z + 16]]; break;
            case 1: pts = [[X, Y, Z], [X, Y, Z + 16], [X, Y + hSW, Z + 16], [X, Y + hNW, Z]]; break;
            case 4: pts = [[X, Y, Z + 16], [X + 16, Y, Z + 16], [X + 16, Y + hSE, Z + 16], [X, Y + hSW, Z + 16]]; break;
            default: pts = [[X, Y, Z], [X, Y + hNW, Z], [X + 16, Y + hNE, Z], [X + 16, Y, Z]]; break;
          }
          const base = Bld.vc;
          for (const p of pts) {
            uvFor(f, p[0], p[1], p[2], uvTmp);
            Bld.vertex(p[0], p[1], p[2], uvTmp[0], uvTmp[1], layer, f | (3 << 3), s4, b4);
          }
          Bld.quad(base, false);
          n++;
        }
      }
    }
  }
  return n;
}

export { PAD };
