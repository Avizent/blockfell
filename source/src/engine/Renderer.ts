import * as THREE from 'three';
import { TextureAtlas } from '../meshing/TextureAtlas';
import { createChunkMaterials, createWorldUniforms, WorldUniforms } from '../render/ChunkMaterial';
import { Sky } from '../render/Sky';

THREE.ColorManagement.enabled = false;

/**
 * Owns the WebGL context, the world scene/camera and the first-person overlay
 * scene (hand/held item, drawn after clearing depth so it never clips into blocks).
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly overlayScene = new THREE.Scene();
  readonly overlayCamera: THREE.PerspectiveCamera;
  readonly atlas: TextureAtlas;
  readonly uniforms: WorldUniforms;
  readonly materials: { opaque: THREE.RawShaderMaterial; water: THREE.RawShaderMaterial };
  readonly sky = new Sky();
  // Entity/item lighting: fixed-direction key light + ambient (x PI because three.js
  // uses physically based light units). Day/night and caves are applied per object
  // from the voxel light level, exactly like block faces.
  readonly sunLight = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
  readonly ambientLight = new THREE.AmbientLight(0xffffff, 0.58 * Math.PI);
  readonly overlaySun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
  readonly overlayAmbient = new THREE.AmbientLight(0xffffff, 0.62 * Math.PI);
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  lastDrawCalls = 0;
  lastTriangles = 0;

  constructor(container: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;
    this.gl.info.autoReset = false;
    this.canvas = this.gl.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
    this.overlayCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.atlas = new TextureAtlas();
    this.uniforms = createWorldUniforms();
    this.uniforms.uAtlas.value = this.atlas.array;
    this.materials = createChunkMaterials(this.uniforms);

    this.scene.add(this.sky.group);
    this.scene.add(this.sunLight, this.sunLight.target, this.ambientLight);
    this.overlayScene.add(this.overlaySun, this.overlayAmbient);
    this.overlaySun.position.set(-0.4, 1, 0.8);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  resize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.aspect = w / h;
    this.overlayCamera.updateProjectionMatrix();
  };

  setPixelRatio(r: number): void {
    this.pixelRatio = r;
    this.resize();
  }

  render(withOverlay: boolean): void {
    const gl = this.gl;
    gl.info.reset();
    gl.setClearColor(this.uniforms.uFogColor.value, 1);
    gl.clear(true, true, false);
    gl.render(this.scene, this.camera);
    if (withOverlay) {
      gl.clearDepth();
      gl.render(this.overlayScene, this.overlayCamera);
    }
    this.lastDrawCalls = gl.info.render.calls;
    this.lastTriangles = gl.info.render.triangles;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.sky.dispose();
    this.materials.opaque.dispose();
    this.materials.water.dispose();
    this.atlas.dispose();
    this.gl.dispose();
    this.canvas.remove();
  }
}
