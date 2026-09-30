import * as THREE from 'three';
import { World } from '../world/World';
import { ChunkManager } from '../world/ChunkManager';
import { DayNightSystem } from '../systems/DayNightSystem';
import type { Renderer } from './Renderer';
import type { WorkerPool } from '../workers/WorkerPool';

/**
 * Title-screen background: a real generated world rendered by the game engine,
 * with the camera slowly panning around a fixed viewpoint.
 */
export class MenuPanorama {
  private world: World;
  private chunks: ChunkManager;
  private dayNight = new DayNightSystem();
  private angle = 0.4;
  private center: THREE.Vector3;
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();

  constructor(private renderer: Renderer, pool: WorkerPool, seed = 20240611) {
    this.world = new World(seed, true);
    this.chunks = new ChunkManager(this.world, pool, renderer.materials, 5);
    renderer.scene.add(this.chunks.group);
    const s = this.world.generator.findSpawn();
    // float above the tallest terrain/trees nearby so the camera never sits inside leaves
    let top = s.y;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      top = Math.max(top, this.world.generator.column(Math.floor(s.x) + dx, Math.floor(s.z) + dz).height);
    }
    this.center = new THREE.Vector3(s.x, top + 10, s.z);
    this.dayNight.time = 1600;
  }

  get ready(): boolean {
    return this.chunks.readiness(this.center.x, this.center.z, 3).ready > 20;
  }

  frame(dt: number): void {
    const r = this.renderer;
    this.angle += dt * 0.035;
    const cam = r.camera;
    cam.position.copy(this.center);
    cam.rotation.set(-0.12, this.angle, 0, 'YXZ');
    if (cam.fov !== 70) { cam.fov = 70; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.dayNight.update(0);
    const L = this.dayNight.light;
    const u = r.uniforms;
    u.uDaylight.value = L.daylight;
    u.uSkyColor.value.copy(L.skyTint);
    u.uFogColor.value.copy(L.fog);
    u.uSunDir.value.copy(this.dayNight.sky.sunDir);
    u.uFogFar.value = 5 * 16;
    u.uFogNear.value = 5 * 16 * 0.55;
    r.sky.update(cam.position, this.dayNight.sky, performance.now() / 1000, 80);
    this.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.chunks.update(this.center.x, this.center.z, this.frustum);
    r.render(false);
  }

  dispose(): void {
    this.chunks.dispose();
  }
}
