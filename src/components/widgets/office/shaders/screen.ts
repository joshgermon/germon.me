/**
 * Unlit screen material. Samples the screen texture taken from the exported material
 * (`emissiveMap` or `map`) and adds the sim "live" effect: a subtle shake, horizontal speed
 * streaks (stronger on the side screens) and brightness flicker.
 */
import * as THREE from 'three';

import { materialsOf, readNumber } from '../engine/scene-graph';
import { globalUniforms } from './material-patch';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uLive;      // 0..1
uniform float uStreak;    // side screens > centre
uniform float uBrightness;
varying vec2 vUv;

float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }

vec4 sampleMap( vec2 uv ) {
	return texture2D( uMap, clamp( uv, 0.001, 0.999 ) );
}

void main() {
	vec2 uv = vUv;
	float live = uLive;
	// shake: two detuned high-frequency wobbles
	float t = uTime;
	uv += live * vec2( sin( t * 37.0 ) * 0.0025 + sin( t * 61.0 ) * 0.0015, cos( t * 43.0 ) * 0.002 );

	vec4 col = sampleMap( uv );
	if ( live > 0.001 ) {
		// horizontal motion blur, strongest towards the outer edge of each frame
		float edge = abs( vUv.x - 0.5 ) * 2.0;
		float amount = live * uStreak * ( 0.25 + 0.75 * edge ) * 0.04;
		vec4 acc = col;
		for ( int i = 1; i <= 6; i++ ) {
			float o = float( i ) / 6.0 * amount;
			acc += sampleMap( uv + vec2( o, 0.0 ) );
			acc += sampleMap( uv - vec2( o, 0.0 ) );
		}
		col = mix( col, acc / 13.0, clamp( uStreak, 0.0, 1.0 ) );
		// brightness flicker
		float f = 1.0 + live * ( 0.06 * sin( t * 23.0 ) + 0.05 * ( hash( floor( t * 18.0 ) ) - 0.5 ) );
		col.rgb *= f;
	}
	gl_FragColor = vec4( col.rgb * uBrightness, 1.0 );
	#include <colorspace_fragment>
}
`;

/** A screen's live control. */
export type ScreenHandle = {
  readonly material: THREE.ShaderMaterial;
  /** 0 = still, 1 = racing. */
  readonly live: { value: number };
};

/** The screen image an exported material carries. */
function screenTexture(material: THREE.Material | undefined): THREE.Texture | null {
  if (material instanceof THREE.MeshStandardMaterial) return material.emissiveMap ?? material.map;
  if (material instanceof THREE.MeshBasicMaterial) return material.map;
  return null;
}

/**
 * Replace a screen mesh's material with the unlit screen shader.
 *
 * @param mesh - A `SCREEN_*` mesh.
 * @param streak - How strongly the "live" effect streaks (side screens > centre > desk).
 * @returns The screen's control, or `undefined` if the material has no image.
 */
export function applyScreenMaterial(mesh: THREE.Mesh, streak = 0): ScreenHandle | undefined {
  const [src] = materialsOf(mesh);
  const tex = screenTexture(src);
  if (!src || !tex) return undefined;
  const live = { value: 0 };
  const material = new THREE.ShaderMaterial({
    name: `Screen_${mesh.name}`,
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: tex },
      uTime: globalUniforms.uTime,
      uLive: live,
      uStreak: { value: streak },
      uBrightness: { value: readNumber(src.userData, 'screenBrightness') ?? 1 },
    },
    toneMapped: false,
  });
  mesh.material = material;
  return { material, live };
}
