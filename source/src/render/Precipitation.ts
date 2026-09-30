import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * RAIN, SNOW AND LIGHTNING
 * ------------------------
 * Precipitation is drawn as one camera-facing vertical quad per block column
 * around the player (radius R), from where the rain lands (the top of the
 * highest solid or water block, so roofs and overhangs keep the rain off) up
 * above the camera. A scrolling procedural texture makes the streaks or flakes
 * move. Everything is two draw calls (rain and snow) and the geometry is rebuilt
 * only when the player moves to another block or a few times a second.
 * Lightning bolts are short-lived jagged strips of additive quads.
 */
export const PRECIP_NONE = 0, PRECIP_RAIN = 1, PRECIP_SNOW = 2;

export interface PrecipSource {
  /** 0 none (dry), 1 rain, 2 snow. */
  precipAt(x: number, z: number): number;
  /** y of the block the rain lands on (highest solid or water block), or -1. */
  rainTop(x: number, z: number): number;
  isLoaded(x: number, z: number): boolean;
}

const R = 10;
const MAX_COLS = (2 * R + 1) * (2 * R + 1);

function streakTexture(snow: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(snow ? 51 : 17);
  if (snow) {
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rng() * 61), y = Math.floor(rng() * 125);
      const s = rng() < 0.3 ? 3 : 2;
      ctx.fillStyle = `rgba(255,255,255,${0.8 + rng() * 0.2})`;
      ctx.fillRect(x, y, s, s);
    }
  } else {
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(rng() * 63), y = Math.floor(rng() * 128), len = 6 + Math.floor(rng() * 10);
      for (let k = 0; k < len; k++) {
        ctx.fillStyle = `rgba(190,210,255,${(0.35 + 0.55 * (k / len)).toFixed(2)})`;
        ctx.fillRect(x, (y + k) % 128, 1, 1);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

class ColumnLayer {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private pos: Float32Array;
  private side: Float32Array;
  private seed: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(snow: boolean) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_COLS * 4 * 3);
    this.side = new Float32Array(MAX_COLS * 4);
    this.seed = new Float32Array(MAX_COLS * 4);
    const idx = new Uint16Array(MAX_COLS * 6);
    for (let i = 0; i < MAX_COLS; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3;
    }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: streakTexture(snow) },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uLight: { value: 1 },
        uCam: { value: new THREE.Vector3() },
        uSnow: { value: snow ? 1 : 0 },
      },
      vertexShader: /* glsl */`
        attribute float aSide; attribute float aSeed;
        uniform vec3 uCam; uniform float uTime; uniform float uSnow;
        varying vec2 vUv; varying float vFade;
        void main() {
          vec3 p = position;
          vec2 d = normalize(uCam.xz - p.xz + vec2(0.0001, 0.0));
          vec2 right = vec2(-d.y, d.x);
          p.xz += right * aSide;
          // rain: long streaks racing down; snow: square flakes drifting and swaying
          float speed = uSnow > 0.5 ? 0.25 : 1.35;
          float tile = uSnow > 0.5 ? 2.0 : 16.0;
          vUv = vec2(aSide + 0.5 + (uSnow > 0.5 ? sin(uTime * 0.9 + aSeed * 6.0) * 0.12 : 0.0), p.y / tile + uTime * speed + aSeed);
          float dist = length(uCam.xz - position.xz);
          vFade = smoothstep(0.8, 2.2, dist) * (1.0 - smoothstep(4.0, 10.5, dist)) * (1.0 - smoothstep(10.0, 18.0, abs(p.y - uCam.y)));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform float uAlpha; uniform float uLight;
        varying vec2 vUv; varying float vFade;
        void main() {
          vec4 t = texture2D(uTex, vUv);
          float a = t.a * uAlpha * vFade;
          if (a < 0.02) discard;
          gl_FragColor = vec4(t.rgb * uLight, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  private n = 0;
  begin(): void { this.n = 0; }
  push(x: number, z: number, y0: number, y1: number, seed: number): void {
    if (this.n >= MAX_COLS) return;
    const v = this.n * 4;
    const P = this.pos, S = this.side, D = this.seed;
    const put = (k: number, y: number, s: number) => {
      P[(v + k) * 3] = x; P[(v + k) * 3 + 1] = y; P[(v + k) * 3 + 2] = z;
      S[v + k] = s; D[v + k] = seed;
    };
    put(0, y0, -0.5); put(1, y0, 0.5); put(2, y1, -0.5); put(3, y1, 0.5);
    this.n++;
  }
  end(): void {
    this.geo.setDrawRange(0, this.n * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSide') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSeed') as THREE.BufferAttribute).needsUpdate = true;
  }
  get count(): number { return this.n; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mat.uniforms.uTex.value as THREE.Texture).dispose();
    this.mat.dispose();
  }
}

interface Bolt { group: THREE.Group; age: number; life: number }

export class Precipitation {
  private rain = new ColumnLayer(false);
  private snow = new ColumnLayer(true);
  private lastCell = '';
  private rebuildTimer = 0;
  private bolts: Bolt[] = [];
  private boltMat = new THREE.MeshBasicMaterial({ color: 0xe8ecff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private glowMat = new THREE.MeshBasicMaterial({ color: 0x8f9cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  /** Columns under rain / snow in the last rebuild (for tests and the debug screen). */
  stats = { rain: 0, snow: 0 };

  constructor(private scene: THREE.Scene) {
    scene.add(this.rain.mesh, this.snow.mesh);
  }

  /** Where the rain is falling right around the camera. */
  private rebuild(src: PrecipSource, cam: THREE.Vector3): void {
    const cx = Math.floor(cam.x), cz = Math.floor(cam.z), cy = cam.y;
    this.rain.begin(); this.snow.begin();
    const top = Math.floor(cy) + 18;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R || d2 === 0) continue;
      const x = cx + dx, z = cz + dz;
      if (!src.isLoaded(x, z)) continue;
      const kind = src.precipAt(x, z);
      if (kind === PRECIP_NONE) continue;
      const land = src.rainTop(x, z) + 1;
      const y0 = Math.max(land, Math.floor(cy) - 12);
      if (y0 >= top) continue;
      const seed = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 1000 / 1000;
      (kind === PRECIP_SNOW ? this.snow : this.rain).push(x + 0.5, z + 0.5, y0, top, seed);
    }
    this.rain.end(); this.snow.end();
    this.stats = { rain: this.rain.count, snow: this.snow.count };
  }

  /** Per frame: intensity 0..1, light 0..1 (sky brightness), time in seconds. */
  update(src: PrecipSource, cam: THREE.Vector3, intensity: number, light: number, time: number, dt: number): void {
    const on = intensity > 0.01;
    this.rain.mesh.visible = this.snow.mesh.visible = on;
    if (on) {
      const cell = Math.floor(cam.x) + ',' + Math.floor(cam.z) + ',' + Math.floor(cam.y / 4);
      this.rebuildTimer -= dt;
      if (cell !== this.lastCell || this.rebuildTimer <= 0) {
        this.lastCell = cell;
        this.rebuildTimer = 0.35;
        this.rebuild(src, cam);
      }
      for (const L of [this.rain, this.snow]) {
        const u = L.mat.uniforms;
        u.uTime.value = time;
        u.uAlpha.value = Math.min(1, intensity) * (L === this.snow ? 0.95 : 0.7);
        u.uLight.value = 0.35 + 0.65 * light;
        u.uCam.value.copy(cam);
      }
    } else {
      this.lastCell = '';
      this.stats = { rain: 0, snow: 0 };
    }
    // lightning bolts fade out
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      const k = b.age / b.life;
      b.group.visible = k < 0.25 || (k > 0.4 && k < 0.6) || (k > 0.75 && k < 0.85);
      if (b.age >= b.life) {
        b.group.removeFromParent();
        this.bolts.splice(i, 1);
      }
    }
  }

  /** A jagged bolt of lightning from the clouds down to (x, y, z). */
  bolt(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const segs: [number, number, number][] = [];
    let px = x, py = y, pz = z;
    const topY = Math.max(y + 60, 150);
    segs.push([px, py, pz]);
    while (py < topY) {
      px += (rng() - 0.5) * 3.2; pz += (rng() - 0.5) * 3.2; py += 3 + rng() * 5;
      segs.push([px, Math.min(py, topY), pz]);
    }
    const addSeg = (a: [number, number, number], b: [number, number, number], w: number) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      for (const [mat, width] of [[this.boltMat, w], [this.glowMat, w * 4]] as const) {
        const m = new THREE.Mesh(this.boxGeo, mat);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.scale.set(width, len, width);
        m.lookAt(b[0], b[1], b[2]);
        m.rotateX(Math.PI / 2);
        m.frustumCulled = false;
        m.renderOrder = 4;
        group.add(m);
      }
    };
    for (let i = 0; i + 1 < segs.length; i++) addSeg(segs[i], segs[i + 1], 0.32);
    // a couple of branches
    for (let k = 0; k < 2; k++) {
      const start = segs[2 + Math.floor(rng() * Math.max(1, segs.length - 4))];
      if (!start) continue;
      let b = start;
      for (let i = 0; i < 3; i++) {
        const n: [number, number, number] = [b[0] + (rng() - 0.5) * 5, b[1] - 2 - rng() * 4, b[2] + (rng() - 0.5) * 5];
        addSeg(b, n, 0.18);
        b = n;
      }
    }
    this.scene.add(group);
    this.bolts.push({ group, age: 0, life: 0.55 });
  }

  get boltCount(): number { return this.bolts.length; }

  dispose(): void {
    this.rain.dispose();
    this.snow.dispose();
    for (const b of this.bolts) b.group.removeFromParent();
    this.bolts.length = 0;
    this.boltMat.dispose();
    this.glowMat.dispose();
    this.boxGeo.dispose();
  }
}
