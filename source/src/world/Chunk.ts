import * as THREE from 'three';
import { CHUNK_SIZE } from './constants';

/**
 * One 16x128x16 column of voxel data plus the render state derived from it.
 * `blocks` is the source of truth; the meshes are disposable caches rebuilt from it.
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  blocks: Uint16Array;
  /** Packed (sky << 4 | block) light from the latest mesh build; null until meshed. */
  light: Uint8Array | null = null;

  /** Incremented on every change that affects appearance. */
  version = 1;
  /** Version of the data the current mesh was built from (0 = never meshed). */
  meshedVersion = 0;
  meshInFlight = false;
  meshQueued = false;
  /** Set by player edits: remesh before anything else. */
  urgent = false;
  /** Set by edits: the next mesh job also checks whether neighbours' lighting changed. */
  checkNeighborLight = false;
  pendingNeighborCheck = false;
  /** After a failed mesh job, do not retry before this time (ms). */
  retryAt = 0;

  opaqueMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  readonly bounds = new THREE.Box3();
  minY = 0;
  maxY = 0;
  vertexCount = 0;
  triangleCount = 0;

  constructor(cx: number, cz: number, blocks: Uint16Array) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = blocks;
  }

  get needsMesh(): boolean {
    return this.version !== this.meshedVersion;
  }

  markDirty(urgent = false): void {
    this.version++;
    if (urgent) this.urgent = true;
  }

  setBounds(minY: number, maxY: number): void {
    this.minY = minY;
    this.maxY = maxY;
    const x = this.cx * CHUNK_SIZE, z = this.cz * CHUNK_SIZE;
    this.bounds.min.set(x, minY, z);
    this.bounds.max.set(x + CHUNK_SIZE, Math.max(maxY, minY + 1), z + CHUNK_SIZE);
  }

  disposeMeshes(): void {
    for (const m of [this.opaqueMesh, this.waterMesh]) {
      if (m) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
    this.opaqueMesh = null;
    this.waterMesh = null;
    this.vertexCount = 0;
    this.triangleCount = 0;
  }
}
