/**
 * ~120 drifting dust motes inside `FX_DustVolume`'s bounding box. All motion runs in the
 * vertex shader so the CPU only updates a couple of uniforms per frame.
 */
import * as THREE from 'three';

import { globalUniforms } from './material-patch';

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uPointScale;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
attribute vec4 aSeed; // xyz = start position in the box (0..1), w = random
varying float vTwinkle;
void main() {
	float t = uTime;
	float r = aSeed.w;
	vec3 p = aSeed.xyz;
	// slow downward drift with wrap, plus lazy lateral wandering
	p.y = fract( p.y - t * ( 0.004 + 0.006 * r ) );
	p.x += sin( t * ( 0.11 + 0.07 * r ) + r * 40.0 ) * 0.04;
	p.z += cos( t * ( 0.09 + 0.05 * r ) + r * 23.0 ) * 0.04;
	vec3 world = uBoxMin + p * uBoxSize;
	vec4 mv = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mv;
	// fade near the wrap boundaries so motes don't pop
	float edge = smoothstep( 0.0, 0.08, p.y ) * smoothstep( 1.0, 0.92, p.y );
	vTwinkle = edge * ( 0.55 + 0.45 * sin( t * ( 0.8 + r * 1.6 ) + r * 61.0 ) );
	gl_PointSize = uPointScale * ( 0.6 + 0.8 * r );
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vTwinkle;
void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = length( c );
	float a = smoothstep( 0.5, 0.0, d );
	a *= a * vTwinkle * uIntensity;
	if ( a < 0.003 ) discard;
	gl_FragColor = vec4( uColor * a, a );
	#include <colorspace_fragment>
}
`;

/** The motes and their live controls. */
export type DustHandle = {
  readonly points: THREE.Points;
  readonly intensity: { value: number };
  readonly baseIntensity: number;
  /** Call on resize/zoom: device pixels per world metre. */
  setScale(pxPerMetre: number): void;
  dispose(): void;
};

/**
 * Scatter motes through a box.
 *
 * @param box - The dust volume, in world space.
 * @param count - How many motes.
 * @param baseIntensity - Daylight brightness (dimmed in the evening).
 * @returns The motes, ready to add to the scene.
 */
export function createDust(box: THREE.Box3, count = 120, baseIntensity = 0.85): DustHandle {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = Math.random();
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = Math.random();
    seeds[i * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  // position is required by three for bounding volumes; the shader uses aSeed instead
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

  const size = box.getSize(new THREE.Vector3());
  const intensity = { value: baseIntensity };
  const pointScale = { value: 3 };
  const material = new THREE.ShaderMaterial({
    name: 'Dust',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: globalUniforms.uTime,
      uPointScale: pointScale,
      uBoxMin: { value: box.min.clone() },
      uBoxSize: { value: size },
      uColor: { value: new THREE.Color(1.0, 0.9, 0.72) },
      uIntensity: intensity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'FX_Dust';
  points.frustumCulled = false;
  points.renderOrder = 11;

  return {
    points,
    intensity,
    baseIntensity,
    setScale(pxPerMetre: number) {
      // motes are ~6 mm across
      pointScale.value = THREE.MathUtils.clamp(pxPerMetre * 0.006, 1.5, 9);
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
