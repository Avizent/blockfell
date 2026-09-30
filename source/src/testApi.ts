import { rollCatch } from './entities/Fishing';
import { checkForUpdate, BUILD_ID } from './engine/offline';
import { engine } from './engine/Engine';
import { ui } from './ui/uiStore';
import * as B from './world/BlockRegistry';
import { meshChunk } from './meshing/ChunkMesher';
import { chunkKeyNum } from './world/constants';
import * as THREE from 'three';
import { recipes } from './crafting/recipes';
import { ITEMS, getItem } from './inventory/ItemRegistry';
import { MOTIFS } from './render/paintingArt';

/**
 * Automation hooks used by the QA scripts (headless browsers cannot use pointer
 * lock). Exposed as window.__bf. Not required for normal play.
 */
export function exposeTestApi(): void {
  const api = {
    engine,
    ui,
    /** Offline copy: look for a newer build now (tests), and this build's id. */
    checkUpdate: (force = true) => checkForUpdate(force),
    buildId: BUILD_ID,
    B,
    get game() { return engine.game; },
    allowUnlocked(on = true) { engine.input.allowUnlocked = on; engine.updateFocus(); },
    state() {
      const g = engine.game;
      const s = ui.get();
      return {
        screen: s.screen, overlay: s.overlay, locked: s.locked,
        player: g ? { x: g.player.x, y: g.player.y, z: g.player.z, yaw: g.player.yaw, pitch: g.player.pitch, health: g.player.health, food: g.player.food, onGround: g.player.onGround, flying: g.player.flying, mode: g.player.gameMode, sprinting: g.player.sprinting, sneaking: g.player.sneaking, xp: g.player.xpLevel } : null,
        fps: engine.loop.fps,
        chunks: g ? { ...g.chunks.stats } : null,
        drawCalls: engine.renderer.lastDrawCalls,
        triangles: engine.renderer.lastTriangles,
        target: g?.target ? { x: g.target.x, y: g.target.y, z: g.target.z, block: B.getBlock(g.target.block).key, face: g.target.face } : null,
      };
    },
    look(yaw: number, pitch: number) { const g = engine.game; if (g) { g.player.yaw = yaw; g.player.pitch = pitch; } },
    inventory() { return engine.game?.inventory.slots.map((s, i) => (s ? `${i}:${s.id}x${s.count}` : null)).filter(Boolean); },
    /** Counts scene objects to prove there is no per-voxel mesh. */
    sceneAudit() {
      const g = engine.game;
      let meshes = 0, chunkMeshes = 0, verts = 0;
      engine.renderer.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          meshes++;
          if (o.name.startsWith('chunk ')) { chunkMeshes++; verts += ((o as THREE.Mesh).geometry.getAttribute('position')?.count ?? 0); }
        }
      });
      return { meshes, chunkMeshes, loadedChunks: g?.world.chunks.size ?? 0, chunkVertices: verts, geometries: engine.renderer.gl.info.memory.geometries };
    },
    /** Meshes one loaded chunk synchronously in both modes to compare output sizes. */
    meshCompare(cx: number, cz: number) {
      const g = engine.game;
      if (!g) return null;
      const chunks: Uint8Array[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = g.world.chunks.get(chunkKeyNum(cx + dx, cz + dz));
        if (!c) return null;
        chunks.push(c.blocks.slice());
      }
      const naive = meshChunk(chunks.map((c) => c.slice()), false, null);
      const greedy = meshChunk(chunks, true, null);
      // count faces a "one mesh per cube, all six faces" approach would need
      let solid = 0;
      const blocks = chunks[4];
      for (let i = 0; i < blocks.length; i++) if (blocks[i] !== B.AIR) solid++;
      return {
        nonAirBlocks: solid,
        allFacesQuads: solid * 6,
        culledQuads: naive.stats.quads,
        greedyQuads: greedy.stats.quads,
        greedyVertices: greedy.stats.vertices,
        naiveMs: naive.stats.meshMs + naive.stats.lightMs,
        greedyMs: greedy.stats.meshMs + greedy.stats.lightMs,
      };
    },
    /**
     * Independent brute-force count of visible cube faces in a chunk, using the
     * world (cross-chunk) block lookups; must equal the mesher's own count.
     */
    bruteForceFaces(cx: number, cz: number) {
      const g = engine.game;
      if (!g) return -1;
      const w = g.world;
      const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      let faces = 0;
      for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const wx = cx * 16 + x, wz = cz * 16 + z;
        const b = w.getBlock(wx, y, wz);
        const r = B.RENDER[b];
        if (r !== B.RENDER_CUBE && r !== B.RENDER_LIQUID) continue;
        for (const [dx, dy, dz] of N) {
          const ny = y + dy;
          const n = ny < 0 ? B.BEDROCK : ny >= 128 ? B.AIR : w.getBlock(wx + dx, ny, wz + dz);
          if (r === B.RENDER_CUBE) { if (B.IS_OPAQUE[n] || (B.CULL_SAME[b] && n === b)) continue; }
          else if (n === b || B.IS_OPAQUE[n]) continue;
          faces++;
        }
      }
      return faces;
    },
    meshStatsFor(cx: number, cz: number) {
      const g = engine.game;
      if (!g) return null;
      const chunks: Uint8Array[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = g.world.chunks.get(chunkKeyNum(cx + dx, cz + dz));
        if (!c) return null;
        chunks.push(c.blocks.slice());
      }
      return meshChunk(chunks, true, null).stats;
    },
    chunkInfo(cx: number, cz: number) {
      const c = engine.game?.world.chunks.get(chunkKeyNum(cx, cz));
      return c ? { version: c.version, meshedVersion: c.meshedVersion, verts: c.vertexCount } : null;
    },
    setBlock(x: number, y: number, z: number, key: string) {
      const b = B.blockByKey(key) ?? B.blockByKey(key + ':s');
      return engine.game?.world.setBlock(x, y, z, b ? b.id : 0, 'player');
    },
    /** Points the camera at the centre of a block (or a given face offset). */
    aimAt(x: number, y: number, z: number) {
      const g = engine.game;
      if (!g) return;
      const p = g.player;
      const dx = x - p.x, dy = y - p.eyeY, dz = z - p.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    findBlock(key: string, radius = 8) {
      const g = engine.game;
      if (!g) return null;
      const id = B.blockByKey(key)?.id;
      const p = g.player;
      let best: number[] | null = null, bd = 1e9;
      for (let y = -4; y <= 8; y++) for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) {
        const bx = Math.floor(p.x) + x, by = Math.floor(p.y) + y, bz = Math.floor(p.z) + z;
        if (g.world.getBlock(bx, by, bz) !== id) continue;
        const d = Math.hypot(bx + 0.5 - p.x, by + 0.5 - p.eyeY, bz + 0.5 - p.z);
        if (d < bd) { bd = d; best = [bx, by, bz]; }
      }
      return best ? { x: best[0], y: best[1], z: best[2], d: bd } : null;
    },
    give(id: string, count = 1) { engine.game?.inventory.add({ id, count }); },
    /** Result of a crafting grid (row-major item ids or null) of the given width. */
    craft(grid: (string | null)[], width = 3) {
      const r = recipes.match(grid.map((id) => (id ? { id, count: 1 } : null)), width);
      return r ? { ...r.result } : null;
    },
    /** Fishing: a line's catch (r in 0..1 picks from the loot table), and hurrying the next bite. */
    rollCatch(r?: number) { return rollCatch(r); },
    hurryBite() { const b = engine.game?.bobber; if (b) { b.wait = 1; } return !!b; },
    /** 1.7: dungeons and lava lakes the generator makes within `r` chunks of the player (pure: regenerates chunks). */
    dungeons(r = 6) {
      const g = engine.game;
      if (!g) return [];
      const pcx = Math.floor(g.player.x / 16), pcz = Math.floor(g.player.z / 16);
      const out: { x: number; y: number; z: number; mob: string; chests: { x: number; y: number; z: number }[] }[] = [];
      for (let cx = pcx - r; cx <= pcx + r; cx++) for (let cz = pcz - r; cz <= pcz + r; cz++) {
        const res = g.world.generator.generateChunk(cx, cz);
        for (const s of res.spawners) out.push({ ...s, chests: res.containers.filter((c) => c.loot === 'dungeon').map((c) => ({ x: c.x, y: c.y, z: c.z })) });
      }
      const px = g.player.x, pz = g.player.z;
      return out.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    },
    lavaLakes(r = 6) {
      const g = engine.game;
      if (!g) return [];
      const pcx = Math.floor(g.player.x / 16), pcz = Math.floor(g.player.z / 16);
      const out: { x: number; y: number; z: number; cells: number }[] = [];
      for (let cx = pcx - r; cx <= pcx + r; cx++) for (let cz = pcz - r; cz <= pcz + r; cz++) {
        const b = g.world.generator.generateChunk(cx, cz).blocks;
        let n = 0, top = -1, tx = 0, tz = 0;
        for (let i = 0; i < b.length; i++) {
          if (!B.IS_LAVA[b[i]] || (i >> 8) <= 11) continue;
          n++;
          if ((i >> 8) > top || ((i >> 8) === top && ((i & 15) === 7 || ((i >> 4) & 15) === 7))) { top = i >> 8; tx = i & 15; tz = (i >> 4) & 15; }
        }
        if (n) out.push({ x: cx * 16 + tx, y: top, z: cz * 16 + tz, cells: n });
      }
      const px = g.player.x, pz = g.player.z;
      return out.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    },
    spawnerInfo() {
      const g = engine.game;
      if (!g) return null;
      return { known: [...g.spawners.known.values()], spawned: g.spawners.spawned, figures: g.spawnerFigures.count };
    },
    motifs() { return MOTIFS.map((m) => ({ id: m.id, title: m.title, w: m.w, h: m.h })); },
    items() { return ITEMS.map((i) => ({ id: i.id, name: i.name, category: i.category, block: i.block })); },
    item(id: string) { const d = getItem(id); return { id: d.id, name: d.name, category: d.category, smelt: d.smelt ?? null, block: d.block }; },
    getBlock(x: number, y: number, z: number) { return B.getBlock(engine.game?.world.getBlock(x, y, z) ?? 0).key; },
  };
  (window as unknown as Record<string, unknown>).__bf = api;
}
