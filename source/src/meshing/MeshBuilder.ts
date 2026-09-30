/**
 * Growable vertex/index buffers for one chunk mesh.
 *
 * Vertex format (14 bytes, three separate attributes):
 *   position : Int16 x3  chunk-local position in 1/16 block units (so water surfaces
 *              at 14/16 height and torch models are exact)
 *   aUv      : Int16 x2  texture coordinates in 1/16 block units. Large greedy quads
 *              get UVs > 1 and tile via hardware REPEAT on the texture array.
 *   aData    : Uint8 x4  [texture layer, face | ao << 3, sky light * 4, block light * 4]
 */
export interface MeshBuffers {
  position: Int16Array;
  uv: Int16Array;
  data: Uint8Array;
  index: Uint16Array | Uint32Array;
}

export class MeshBuilder {
  pos: Int16Array;
  uv: Int16Array;
  data: Uint8Array;
  idx: Uint32Array;
  vc = 0;
  ic = 0;

  constructor(cap = 16384) {
    this.pos = new Int16Array(cap * 3);
    this.uv = new Int16Array(cap * 2);
    this.data = new Uint8Array(cap * 4);
    this.idx = new Uint32Array(Math.ceil(cap * 1.5));
  }

  reset(): void {
    this.vc = 0;
    this.ic = 0;
  }

  private grow(): void {
    const cap = (this.pos.length / 3) * 2;
    const p = new Int16Array(cap * 3); p.set(this.pos); this.pos = p;
    const u = new Int16Array(cap * 2); u.set(this.uv); this.uv = u;
    const d = new Uint8Array(cap * 4); d.set(this.data); this.data = d;
    const i = new Uint32Array(Math.ceil(cap * 1.5)); i.set(this.idx); this.idx = i;
  }

  /** Appends one vertex; returns its index. */
  vertex(x: number, y: number, z: number, s: number, t: number, layer: number, faceAo: number, sky: number, blk: number): number {
    if (this.vc * 3 + 3 > this.pos.length) this.grow();
    const v = this.vc++;
    const p3 = v * 3, p2 = v * 2, p4 = v * 4;
    this.pos[p3] = x; this.pos[p3 + 1] = y; this.pos[p3 + 2] = z;
    this.uv[p2] = s; this.uv[p2 + 1] = t;
    this.data[p4] = layer; this.data[p4 + 1] = faceAo; this.data[p4 + 2] = sky; this.data[p4 + 3] = blk;
    return v;
  }

  /** Two triangles over 4 vertices given counter-clockwise; `flip` uses the 1-3 diagonal. */
  quad(v0: number, flip: boolean): void {
    if (this.ic + 6 > this.idx.length) this.grow();
    const i = this.idx;
    let c = this.ic;
    if (!flip) {
      i[c++] = v0; i[c++] = v0 + 1; i[c++] = v0 + 2;
      i[c++] = v0; i[c++] = v0 + 2; i[c++] = v0 + 3;
    } else {
      i[c++] = v0 + 1; i[c++] = v0 + 2; i[c++] = v0 + 3;
      i[c++] = v0 + 1; i[c++] = v0 + 3; i[c++] = v0;
    }
    this.ic = c;
  }

  /** Copies the used range into exact-size arrays (transferable to the main thread). */
  finish(): MeshBuffers | null {
    if (this.ic === 0) return null;
    const n = this.vc;
    return {
      position: this.pos.slice(0, n * 3),
      uv: this.uv.slice(0, n * 2),
      data: this.data.slice(0, n * 4),
      index: n <= 65535 ? Uint16Array.from(this.idx.subarray(0, this.ic)) : this.idx.slice(0, this.ic),
    };
  }
}
