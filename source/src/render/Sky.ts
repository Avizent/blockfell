import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Sky dome (gradient + sunrise/sunset glow), original pixel-art sun and moon,
 * stars and a scrolling blocky cloud layer. Everything follows the camera.
 */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  private cloudTex: THREE.CanvasTexture;
  cloudsEnabled = true;

  constructor() {
    this.group.name = 'sky';
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlowStrength: { value: 0 },
        uVoid: { value: new THREE.Color(0.05, 0.05, 0.1) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunDir;
        uniform float uGlowStrength; uniform vec3 uVoid;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.45, h));
          float toward = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
          float glow = pow(toward, 3.0) * (1.0 - smoothstep(0.0, 0.5, abs(h))) * uGlowStrength;
          col = mix(col, uGlow, glow);
          col = mix(col, uVoid, smoothstep(-0.55, -0.95, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), this.domeMat);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.sun = this.billboard(pixelSun(), 60);
    this.moon = this.billboard(pixelMoon(), 44);
    this.group.add(this.sun, this.moon);

    const rng = mulberry32(1234);
    const pos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th)).multiplyScalar(350);
      if (v.y > -40) pos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: true, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -99;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.cloudTex = cloudTexture();
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.cloudTex }, uOffset: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(1, 1, 1) },
        uFogColor: { value: new THREE.Color() }, uFar: { value: 300 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying float vDist;
        uniform vec2 uOffset;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vUv = wp.xz / 768.0 + uOffset;
          vec4 mv = viewMatrix * wp;
          vDist = length(mv.xz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uFogColor; uniform float uFar;
        varying vec2 vUv; varying float vDist;
        void main() {
          float a = texture2D(uMap, vUv).a;
          if (a < 0.5) discard;
          float fade = 1.0 - smoothstep(uFar * 0.45, uFar, vDist);
          gl_FragColor = vec4(mix(uFogColor, uColor, 0.35 + 0.65 * fade), 0.8 * fade);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cg = new THREE.PlaneGeometry(1400, 1400);
    cg.rotateX(-Math.PI / 2);
    this.clouds = new THREE.Mesh(cg, this.cloudMat);
    this.clouds.renderOrder = 2;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }

  private billboard(tex: THREE.Texture, size: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending }),
    );
    m.renderOrder = -98;
    m.frustumCulled = false;
    return m;
  }

  update(camPos: THREE.Vector3, s: SkyState, timeSeconds: number, viewDistance: number): void {
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    const u = this.domeMat.uniforms;
    u.uZenith.value.copy(s.zenith);
    u.uHorizon.value.copy(s.horizon);
    u.uGlow.value.copy(s.glow);
    u.uGlowStrength.value = s.glowStrength;
    u.uSunDir.value.copy(s.sunDir);
    u.uVoid.value.copy(s.horizon).multiplyScalar(0.25);

    const place = (m: THREE.Mesh, dir: THREE.Vector3) => {
      m.position.copy(camPos).addScaledVector(dir, 300);
      m.lookAt(camPos);
    };
    place(this.sun, s.sunDir);
    place(this.moon, s.moonDir);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = s.clear;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = 0.95 * s.clear;
    this.sun.visible = this.moon.visible = s.clear > 0.02;
    this.starMat.opacity = s.starAlpha;
    this.stars.visible = s.starAlpha > 0.01;
    this.stars.rotation.z = s.angle;

    this.clouds.visible = this.cloudsEnabled;
    this.clouds.position.set(camPos.x, 150, camPos.z);
    this.cloudMat.uniforms.uOffset.value.set(timeSeconds * 0.0016, 0);
    this.cloudMat.uniforms.uColor.value.copy(s.cloudColor);
    this.cloudMat.uniforms.uFogColor.value.copy(s.horizon);
    this.cloudMat.uniforms.uFar.value = Math.max(220, viewDistance * 2.2);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) {
        const mm = mat as THREE.MeshBasicMaterial;
        mm.map?.dispose();
        mat.dispose();
      }
    });
    this.cloudTex.dispose();
  }
}

export interface SkyState {
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  glowStrength: number;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  starAlpha: number;
  angle: number;
  cloudColor: THREE.Color;
  /** 1 = clear sky, 0 = fully overcast (sun, moon and stars hidden). */
  clear: number;
}

function pixelCanvas(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Original sun: a bright square core with a stepped halo. */
function pixelSun(): THREE.Texture {
  return pixelCanvas(32, (ctx) => {
    ctx.fillStyle = 'rgba(255,200,90,0.25)'; ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = 'rgba(255,220,120,0.55)'; ctx.fillRect(7, 7, 18, 18);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(10, 10, 12, 12);
    ctx.fillStyle = '#fffbe6'; ctx.fillRect(12, 12, 8, 8);
  });
}

/** Original moon: pale disc-square with craters. */
function pixelMoon(): THREE.Texture {
  return pixelCanvas(32, (ctx) => {
    ctx.fillStyle = 'rgba(160,180,220,0.18)'; ctx.fillRect(6, 6, 20, 20);
    ctx.fillStyle = '#dfe6f2'; ctx.fillRect(10, 9, 12, 14); ctx.fillRect(9, 10, 14, 12);
    ctx.fillStyle = '#b9c3d6'; ctx.fillRect(12, 12, 3, 3); ctx.fillRect(18, 17, 2, 2); ctx.fillRect(16, 11, 2, 2); ctx.fillRect(12, 19, 2, 2);
  });
}

function cloudTexture(): THREE.CanvasTexture {
  // 64x64 cells, each cell = 12 blocks in the sky; two octaves of tileable value noise
  const size = 64;
  const rng = mulberry32(777);
  const octave = (cells: number) => {
    const grid = Float32Array.from({ length: cells * cells }, () => rng());
    const step = size / cells;
    return (x: number, y: number) => {
      const gx = x / step, gy = y / step;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const v = (a: number, b: number) => grid[((b + cells) % cells) * cells + ((a + cells) % cells)];
      return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
    };
  };
  const o1 = octave(16), o2 = octave(32);
  const t = pixelCanvas(size, (ctx) => {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = o1(x, y) * 0.65 + o2(x, y) * 0.35;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = n > 0.56 ? 255 : 0;
    }
    ctx.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
