import type { TerrainGenerator } from '../world/TerrainGenerator';
import type { MapTarget } from '../inventory/ItemStack';
import { SEA_LEVEL } from '../world/constants';
import * as Bm from '../world/BiomeSystem';
import { toWorld } from '../world/Villages';

/**
 * EXPLORER MAPS (1.8): a top-down picture of the land round a map's target, drawn
 * like ink and wash on parchment. It is worked out from the world generator (the
 * same terrain the game builds), so it is right even where the player has never
 * been: biomes, hills (shaded from the north-west), water, villages and their
 * streets, with a red cross on the target.
 */
export const MAP_PX = 128;          // canvas size
export const MAP_SCALE = 2;         // blocks per pixel (the map covers 256 x 256 blocks)

type RGB = [number, number, number];
const BIOME_RGB: Record<number, RGB> = {
  [Bm.BIOME_OCEAN]: [86, 120, 150], [Bm.BIOME_BEACH]: [220, 204, 150], [Bm.BIOME_PLAINS]: [128, 166, 84],
  [Bm.BIOME_FOREST]: [74, 120, 62], [Bm.BIOME_DESERT]: [222, 200, 136], [Bm.BIOME_MOUNTAINS]: [138, 136, 128],
  [Bm.BIOME_SNOWY]: [232, 236, 236], [Bm.BIOME_RIVER]: [86, 120, 150], [Bm.BIOME_BIRCH]: [110, 150, 80],
  [Bm.BIOME_TAIGA]: [70, 104, 80], [Bm.BIOME_BADLANDS]: [186, 110, 62],
};
const PARCHMENT: RGB = [226, 210, 168];
const INK: RGB = [92, 66, 40];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const cache = new Map<string, HTMLCanvasElement>();

/** The map picture for a target (cached: drawing one reads 16,000 terrain columns). */
export function mapImage(gen: TerrainGenerator, t: MapTarget): HTMLCanvasElement {
  const key = `${gen.seed}:${t.x},${t.z}`;
  let c = cache.get(key);
  if (c) return c;
  c = drawMap(gen, t.x, t.z);
  cache.set(key, c);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return c;
}

function drawMap(gen: TerrainGenerator, cx: number, cz: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_PX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(MAP_PX, MAP_PX);
  const x0 = cx - (MAP_PX / 2) * MAP_SCALE, z0 = cz - (MAP_PX / 2) * MAP_SCALE;
  const heights = new Float32Array(MAP_PX * MAP_PX);
  const biomes = new Uint8Array(MAP_PX * MAP_PX);
  const tmp = { height: 0, biome: 0, mountain: 0, river: 0 };
  for (let py = 0; py < MAP_PX; py++) for (let px = 0; px < MAP_PX; px++) {
    const col = gen.column(x0 + px * MAP_SCALE, z0 + py * MAP_SCALE, tmp);
    heights[py * MAP_PX + px] = col.height;
    biomes[py * MAP_PX + px] = col.biome;
  }
  for (let py = 0; py < MAP_PX; py++) for (let px = 0; px < MAP_PX; px++) {
    const i = py * MAP_PX + px;
    const h = heights[i];
    let c: RGB;
    if (h < SEA_LEVEL) {
      c = mix([96, 132, 160], [52, 80, 118], Math.min(1, (SEA_LEVEL - h) / 24));
      // a drawn shoreline where water meets land
      const land = (q: number) => q >= 0 && q < heights.length && heights[q] >= SEA_LEVEL;
      if ((px > 0 && land(i - 1)) || (px < MAP_PX - 1 && land(i + 1)) || land(i - MAP_PX) || land(i + MAP_PX)) c = mix(c, INK, 0.5);
    } else {
      c = BIOME_RGB[biomes[i]] ?? BIOME_RGB[Bm.BIOME_PLAINS];
      // hill shading: lit from the north-west
      const hn = py > 0 && px > 0 ? heights[i - MAP_PX - 1] : h;
      const f = Math.max(0.72, Math.min(1.25, 1 + (h - hn) * 0.06));
      c = [c[0] * f, c[1] * f, c[2] * f];
      // contour lines every 16 blocks of height
      if (py > 0 && Math.floor(h / 16) !== Math.floor(heights[i - MAP_PX] / 16)) c = mix(c, INK, 0.35);
    }
    c = mix(c, PARCHMENT, 0.38);   // washed out, like watercolour on parchment
    img.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  // villages: streets and houses
  const vp = gen.villages;
  if (vp) {
    const seen = new Set<string>();
    for (const [qx, qz] of [[x0, z0], [x0 + 256, z0], [x0, z0 + 256], [x0 + 256, z0 + 256], [cx, cz]]) {
      for (const plan of vp.near(qx, qz, 160)) {
        if (seen.has(plan.id)) continue;
        seen.add(plan.id);
        ctx.fillStyle = 'rgb(176,146,98)';
        for (const k of plan.paths.keys()) {
          const [x, z] = k.split(',').map(Number);
          ctx.fillRect(Math.floor((x - x0) / MAP_SCALE), Math.floor((z - z0) / MAP_SCALE), 1, 1);
        }
        ctx.fillStyle = 'rgb(120,74,46)';
        for (const b of plan.buildings) {
          if (b.kind === 'lamp') continue;
          const [ax, az] = toWorld(b, 0, 0), [bx, bz] = toWorld(b, b.w - 1, b.d - 1);
          const mx = Math.min(ax, bx), mz = Math.min(az, bz);
          ctx.fillRect(Math.floor((mx - x0) / MAP_SCALE), Math.floor((mz - z0) / MAP_SCALE), Math.max(1, Math.ceil((Math.abs(ax - bx) + 1) / MAP_SCALE)), Math.max(1, Math.ceil((Math.abs(az - bz) + 1) / MAP_SCALE)));
        }
      }
    }
  }
  // the red cross on the target
  ctx.strokeStyle = 'rgb(180,30,26)';
  ctx.lineWidth = 2;
  const m = MAP_PX / 2;
  ctx.beginPath();
  ctx.moveTo(m - 4, m - 4); ctx.lineTo(m + 4, m + 4);
  ctx.moveTo(m + 4, m - 4); ctx.lineTo(m - 4, m + 4);
  ctx.stroke();
  // a frame
  ctx.strokeStyle = 'rgb(112,84,52)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, MAP_PX - 2, MAP_PX - 2);
  return canvas;
}

/** Compass direction name for a direction in the world (north = -z). */
export function compassName(dx: number, dz: number): string {
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;           // 0 = north, 90 = east
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[((Math.round(a / 45) % 8) + 8) % 8];
}
