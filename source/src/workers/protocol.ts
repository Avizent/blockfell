import type { MeshBuffers } from '../meshing/MeshBuilder';
import type { MeshStats } from '../meshing/ChunkMesher';
import type { GeneratedContainer, GeneratedSpawner } from '../world/TerrainGenerator';

export type WorkerRequest =
  | { type: 'gen'; id: number; seed: number; structures: boolean; version: number; cx: number; cz: number }
  | {
    type: 'mesh'; id: number; cx: number; cz: number; version: number; greedy: boolean;
    chunks: Uint8Array[]; prevLight: (Uint8Array | null)[] | null;
  };

export type WorkerResponse =
  | { type: 'gen'; id: number; cx: number; cz: number; blocks: Uint8Array; containers: GeneratedContainer[]; spawners: GeneratedSpawner[]; ms: number }
  | {
    type: 'mesh'; id: number; cx: number; cz: number; version: number;
    opaque: MeshBuffers | null; water: MeshBuffers | null; light: Uint8Array;
    minY: number; maxY: number; stats: MeshStats; lightChanged: number[];
  }
  | { type: 'error'; id: number; message: string };
