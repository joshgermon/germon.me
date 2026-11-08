/**
 * One `onBeforeCompile` patch shared by every material in the room, so the number of shader
 * programs stays small. Depending on options it adds:
 *
 * - the evening crossfade: mixes the day bake (`map` or `lightMap`) with an evening bake,
 * - highlight / glow: a brightness lift for hover, the lamp shade and the amp jewel,
 * - wind: vertex sway for plant leaves, growing with height above the pot.
 */
import * as THREE from 'three';

import { readString } from '../engine/scene-graph';

/** Uniforms every patched material shares. */
export const globalUniforms = {
  /** Seconds of animation (frozen under reduced motion). */
  uTime: { value: 0 },
  /** 0 = day, 1 = evening. */
  uEvening: { value: 0 },
};

/** Where a material's baked light lives: `map` (unlit room) or `lightMap` (PBR heroes). */
export type BakeTarget = 'map' | 'lightMap' | null;

/** What to patch in. */
export type PatchOptions = {
  readonly bake?: BakeTarget;
  readonly wind?: { readonly baseY: number; readonly height: number; readonly seed: number };
};

/** One patched material's own uniforms. */
export type PatchedUniforms = {
  readonly uHighlight: { value: number };
  readonly uGlow: { value: number };
  readonly uGlowColor: { value: THREE.Color };
  readonly uEveningMap?: { value: THREE.Texture | null };
};

const patches = new WeakMap<THREE.Material, PatchedUniforms>();

/** Materials that can carry a baked map or light map. */
type Baked = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
const isBaked = (m: THREE.Material): m is Baked =>
  m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshStandardMaterial;

/**
 * Decide whether a material's bake lives in `map` (unlit/basic) or `lightMap` (PBR hero).
 *
 * @param material - Any material from the model.
 * @returns The bake's slot, or `null` if it has none.
 */
export function detectBakeTarget(material: THREE.Material): BakeTarget {
  const declared = readString(material.userData, 'bakeTarget');
  if (declared === 'map' || declared === 'lightMap') return declared;
  if (material instanceof THREE.MeshStandardMaterial && material.lightMap) return 'lightMap';
  if (isBaked(material) && material.map) return 'map';
  return null;
}

/**
 * The texture in a material's bake slot.
 *
 * @param material - Any material.
 * @param bake - The slot.
 * @returns The day bake, if any.
 */
export function bakeTexture(material: THREE.Material, bake: BakeTarget): THREE.Texture | null {
  if (!isBaked(material)) return null;
  if (bake === 'map') return material.map;
  if (bake === 'lightMap') return material.lightMap;
  return null;
}

const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( uEveningMap, vMapUv ), uEvening );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const WIND_VERTEX = /* glsl */ `
  #include <begin_vertex>
  {
    vec4 wp = modelMatrix * vec4( transformed, 1.0 );
    float h = clamp( ( wp.y - uWindBaseY ) / uWindHeight, 0.0, 1.0 );
    float h2 = h * h;
    float t = uTime + uWindSeed * 17.0;
    // layered slow sway (whole plant) + gusts
    vec2 sway = vec2(
      sin( t * 0.9 + wp.y * 1.7 ) * 0.6 + sin( t * 2.1 + wp.x * 3.0 ) * 0.25,
      cos( t * 0.7 + wp.y * 1.3 ) * 0.5 + sin( t * 1.7 + wp.z * 2.6 ) * 0.2
    ) * ( 0.012 + 0.018 * h ) * h2;
    // small leaf flutter, decorrelated per vertex region
    float phase = dot( wp.xyz, vec3( 23.1, 17.7, 31.3 ) );
    float flutter = sin( t * 7.3 + phase ) * 0.0035 * h;
    vec3 disp = vec3( sway.x + flutter, flutter * 0.6, sway.y - flutter * 0.5 );
    // world-space displacement back to object space (rotation + uniform scale)
    mat3 m3 = mat3( modelMatrix );
    float s2 = max( dot( m3[ 0 ], m3[ 0 ] ), 1e-6 );
    transformed += ( transpose( m3 ) * disp ) / s2;
  }`;

/**
 * Patch a material (once; a second call returns the first patch's uniforms).
 *
 * @param material - The material to patch in place.
 * @param options - Which features to add.
 * @returns The material's own uniforms.
 */
export function patchMaterial(
  material: THREE.Material,
  options: PatchOptions = {},
): PatchedUniforms {
  const existing = patches.get(material);
  if (existing) return existing;

  const bake = options.bake ?? null;
  const day = bakeTexture(material, bake);
  const useBake = bake !== null && day !== null;
  const wind = options.wind;

  const uniforms: PatchedUniforms = {
    uHighlight: { value: 0 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
    ...(useBake ? { uEveningMap: { value: day } } : {}),
  };
  const windUniforms = wind
    ? {
        uWindBaseY: { value: wind.baseY },
        uWindHeight: { value: Math.max(0.05, wind.height) },
        uWindSeed: { value: wind.seed },
      }
    : {};

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, windUniforms, globalUniforms);
    const header = [
      'uniform float uHighlight;',
      'uniform float uGlow;',
      'uniform vec3 uGlowColor;',
      'uniform float uEvening;',
      useBake ? 'uniform sampler2D uEveningMap;' : '',
    ].join('\n');
    let frag = `${header}\n${shader.fragmentShader}`;
    if (useBake && bake === 'map') {
      frag = frag.replace('#include <map_fragment>', MAP_FRAGMENT);
    } else if (useBake && bake === 'lightMap') {
      const chunk = THREE.ShaderChunk.lights_fragment_maps
        .replace(
          'texture2D( lightMap, vLightMapUv )',
          'mix( texture2D( lightMap, vLightMapUv ), texture2D( uEveningMap, vLightMapUv ), uEvening )',
        )
        // The baked light map already holds all diffuse light (direct + bounce): the environment
        // map only adds specular reflections, not a second helping of diffuse irradiance.
        .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');
      frag = frag.replace('#include <lights_fragment_maps>', chunk);
    }
    frag = frag.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
  outgoingLight = outgoingLight * ( 1.0 + 0.28 * uHighlight ) + vec3( 0.035 ) * uHighlight + uGlowColor * uGlow;
  #include <opaque_fragment>`,
    );
    shader.fragmentShader = frag;
    if (wind) {
      shader.vertexShader = `uniform float uTime;\nuniform float uWindBaseY;\nuniform float uWindHeight;\nuniform float uWindSeed;\n${shader.vertexShader.replace('#include <begin_vertex>', WIND_VERTEX)}`;
    }
  };

  const key = `office:${useBake ? bake : 'none'}:${wind ? 'wind' : ''}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  patches.set(material, uniforms);
  return uniforms;
}

/**
 * Swap in an evening bake once it has loaded.
 *
 * @param material - A patched material.
 * @param texture - Its evening bake.
 */
export function setEveningTexture(material: THREE.Material, texture: THREE.Texture): void {
  const patch = patches.get(material);
  if (patch?.uEveningMap) patch.uEveningMap.value = texture;
}
