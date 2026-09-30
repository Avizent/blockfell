import * as THREE from 'three';
import { LAVA_LAYER } from '../meshing/textureNames';

/**
 * Shared shader for every chunk mesh. One material for all opaque/cutout geometry,
 * one for water; both read the same texture array and the same lighting uniforms,
 * so the whole world is drawn with at most two draw calls per chunk.
 *
 * Light model: baked per-vertex sky light and block light (0..15, smoothly
 * interpolated) plus ambient occlusion and a fixed per-face shade. Sky light is
 * scaled by the day/night uniform at draw time, so time of day never requires
 * remeshing.
 */
export interface WorldUniforms {
  [k: string]: THREE.IUniform;
  uAtlas: THREE.IUniform<THREE.DataArrayTexture | null>;
  uDaylight: THREE.IUniform<number>;
  uSkyColor: THREE.IUniform<THREE.Color>;
  uTorchColor: THREE.IUniform<THREE.Color>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunStrength: THREE.IUniform<number>;
  uAmbient: THREE.IUniform<number>;
  uGamma: THREE.IUniform<number>;
  uWaterFrame: THREE.IUniform<number>;
  uLavaFrame: THREE.IUniform<number>;
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uAtlas: { value: null },
    uDaylight: { value: 1 },
    uSkyColor: { value: new THREE.Color(1, 1, 1) },
    uTorchColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uFogColor: { value: new THREE.Color(0.7, 0.82, 1.0) },
    uFogNear: { value: 80 },
    uFogFar: { value: 128 },
    uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
    uSunStrength: { value: 1 },
    uAmbient: { value: 0.045 },
    uGamma: { value: 0.5 },
    uWaterFrame: { value: 0 },
    uLavaFrame: { value: 0 },
  };
}

const vertex = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uSunDir;
uniform float uSunStrength;
uniform float uWaterFrame;
uniform float uLavaFrame;
in vec3 position;
in vec2 aUv;
in vec4 aData;
out vec2 vUv;
flat out float vLayer;
out float vShade;
out vec2 vLight;
out float vDist;

const vec3 NORMALS[7] = vec3[](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,1,0));
const float FACE_SHADE[7] = float[](0.6, 0.6, 1.0, 0.5, 0.8, 0.8, 0.92);
const float AO_CURVE[4] = float[](0.46, 0.66, 0.84, 1.0);

void main() {
  vec4 mv = modelViewMatrix * vec4(position / 16.0, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = aUv / 16.0;
  int face = int(mod(aData.y, 8.0) + 0.5);
  int ao = int(floor(aData.y / 8.0) + 0.5);
#ifdef WATER
  vLayer = aData.x + uWaterFrame;
#else
  // lava surfaces carry the first lava frame; animate them
  vLayer = abs(aData.x - LAVA_LAYER) < 0.5 ? aData.x + uLavaFrame : aData.x;
#endif
  float sun = face < 6 ? max(dot(NORMALS[face], uSunDir), 0.0) : 0.5;
  vShade = FACE_SHADE[face] * AO_CURVE[ao] * (0.93 + 0.1 * sun * uSunStrength);
  vLight = aData.zw / 60.0;
  vDist = length(mv.xyz);
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uDaylight;
uniform vec3 uSkyColor;
uniform vec3 uTorchColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAmbient;
uniform float uGamma;
in vec2 vUv;
flat in float vLayer;
in float vShade;
in vec2 vLight;
in float vDist;
out vec4 fragColor;

float curve(float l) {
  // reference-game style brightness curve; uGamma blends "moody" -> "bright"
  float moody = l / (3.0 - 2.0 * l);
  return mix(moody, sqrt(l), uGamma * 0.6);
}

void main() {
  vec4 tex = texture(uAtlas, vec3(vUv, vLayer));
#ifndef WATER
  if (tex.a < 0.5) discard;
#endif
  vec3 light = max(uSkyColor * curve(vLight.x * uDaylight), uTorchColor * curve(vLight.y));
  light = max(light, vec3(uAmbient));
  vec3 col = tex.rgb * light * vShade;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog);
#ifdef WATER
  fragColor = vec4(col, mix(tex.a, 1.0, fog));
#else
  fragColor = vec4(col, 1.0);
#endif
}
`;

export function createChunkMaterials(uniforms: WorldUniforms): { opaque: THREE.RawShaderMaterial; water: THREE.RawShaderMaterial } {
  const opaque = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { LAVA_LAYER: LAVA_LAYER.toFixed(1) },
    side: THREE.FrontSide,
  });
  const water = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { WATER: 1, LAVA_LAYER: LAVA_LAYER.toFixed(1) },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { opaque, water };
}
