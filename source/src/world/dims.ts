/**
 * DIMENSIONS (1.10)
 * -----------------
 * A world can hold more than one landscape. Each dimension has its own chunks,
 * block entities and creatures (saved separately, see SaveManager), while time,
 * players and settings belong to the world. 1.10 has only the overworld; the
 * id list already names the Cinderdeep (2.0) so saves and files are ready for it.
 */
export type DimId = 'overworld' | 'cinderdeep' | 'starhollow';
export const OVERWORLD: DimId = 'overworld';
export const DIM_IDS: readonly DimId[] = ['overworld', 'cinderdeep', 'starhollow'];
export const DIM_NAMES: Record<DimId, string> = { overworld: 'the Overworld', cinderdeep: 'the Cinderdeep', starhollow: 'the Starhollow' };

export function isDimId(v: unknown): v is DimId {
  return typeof v === 'string' && (DIM_IDS as readonly string[]).includes(v);
}

/**
 * How the player comes into a dimension (2.0): through a Deepgate near (x, z) - the
 * same spot in the other landscape (one block there is one block here) - or back
 * on the surface after dying in the Cinderdeep.
 */
export type Arrival = { kind: 'gate'; x: number; z: number; gate?: 'deep' | 'star' } | { kind: 'respawn' }
  /** 2.2: back home at the bed or spawn point without dying (after the End screen, or caught falling from the Starhollow). */
  | { kind: 'home'; note?: string };
