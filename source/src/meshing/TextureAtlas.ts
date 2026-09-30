import * as THREE from 'three';
import { generateBlockTextures, PixelTex, TEX } from './textures';
import { TEXTURE_NAMES } from './textureNames';

/**
 * TEXTURE ATLAS
 * -------------
 * All block textures are packed into a single atlas image (a 16-column grid of
 * 16x16 tiles). The same tiles are uploaded as ONE WebGL2 texture array
 * (DataArrayTexture), one layer per tile, which every chunk shares through a
 * single material. The layer form is used on the GPU because greedy-merged quads
 * need their texture to repeat across the quad: with a texture array the hardware
 * REPEAT wrap mode does that without bleeding into neighbouring tiles, and each
 * layer gets correct mipmaps.
 */
export class TextureAtlas {
  readonly textures: Map<string, PixelTex>;
  readonly atlasCanvas: HTMLCanvasElement;
  readonly array: THREE.DataArrayTexture;
  readonly columns = 16;

  constructor() {
    this.textures = generateBlockTextures();
    const n = TEXTURE_NAMES.length;
    const rows = Math.ceil(n / this.columns);
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = this.columns * TEX;
    this.atlasCanvas.height = rows * TEX;
    const ctx = this.atlasCanvas.getContext('2d')!;
    const data = new Uint8Array(TEX * TEX * 4 * n);
    TEXTURE_NAMES.forEach((name, layer) => {
      const t = this.textures.get(name)!;
      data.set(t.d, layer * TEX * TEX * 4);
      const img = new ImageData(new Uint8ClampedArray(t.d), TEX, TEX);
      ctx.putImageData(img, (layer % this.columns) * TEX, Math.floor(layer / this.columns) * TEX);
    });
    const arr = new THREE.DataArrayTexture(data, TEX, TEX, n);
    arr.format = THREE.RGBAFormat;
    arr.type = THREE.UnsignedByteType;
    arr.magFilter = THREE.NearestFilter;
    arr.minFilter = THREE.NearestMipmapLinearFilter;
    arr.generateMipmaps = true;
    arr.wrapS = THREE.RepeatWrapping;
    arr.wrapT = THREE.RepeatWrapping;
    arr.colorSpace = THREE.NoColorSpace;
    arr.needsUpdate = true;
    this.array = arr;
  }

  get(name: string): PixelTex {
    return this.textures.get(name) ?? this.textures.get('missing')!;
  }

  /** Returns a canvas containing one tile (for icons, particles, UI). */
  tileCanvas(name: string, scale = 1): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = TEX * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const src = document.createElement('canvas');
    src.width = src.height = TEX;
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.get(name).d), TEX, TEX), 0, 0);
    ctx.drawImage(src, 0, 0, TEX * scale, TEX * scale);
    return c;
  }

  dispose(): void {
    this.array.dispose();
  }
}
