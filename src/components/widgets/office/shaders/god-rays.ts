/**
 * Additive god-ray material for the `FX_LightShaft_*` prisms.
 *
 * Each shaft gets a per-vertex `aAlong` attribute (0 at the window end, 1 at the far end),
 * computed from the prism's own geometry: the window end is the higher end of the shaft,
 * since sunlight slants down from the window into the room.
 */
import * as THREE from 'three';

import { materialsOf } from '../engine/scene-graph';
import { globalUniforms } from './material-patch';

const vertexShader = /* glsl */ `
attribute float aAlong;
varying float vAlong;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
	vAlong = aAlong;
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorld = wp.xyz;
	vNormalW = normalize( mat3( modelMatrix ) * normal );
	// orthographic camera: view direction is constant, taken from the camera matrix
	vViewDir = normalize( vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] ) );
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
uniform vec3 uAxis;
varying float vAlong;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewDir;

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y );
}

void main() {
	// fade away from the window, soft at both ends
	float along = clamp( vAlong, 0.0, 1.0 );
	float fade = pow( 1.0 - along, 1.6 ) * smoothstep( 0.0, 0.08, along );

	// soften the prism's hard edges: faces seen edge-on contribute less
	float facing = abs( dot( normalize( vNormalW ), vViewDir ) );
	float edge = smoothstep( 0.05, 0.6, facing );

	// slow scrolling shimmer across the shaft (coordinates perpendicular to its axis)
	vec3 side = normalize( cross( uAxis, vec3( 0.0, 1.0, 0.0 ) ) + vec3( 1e-4 ) );
	float u = dot( vWorld, side ) * 9.0;
	float v = dot( vWorld, uAxis ) * 1.5;
	float n = noise( vec2( u + uTime * 0.12, v - uTime * 0.05 ) ) * 0.6
	        + noise( vec2( u * 2.3 - uTime * 0.07, v * 2.0 + uTime * 0.03 ) ) * 0.4;
	float shimmer = 0.7 + 0.45 * n;

	float a = fade * edge * shimmer * uIntensity;
	gl_FragColor = vec4( uColor * a, a );
	#include <colorspace_fragment>
}
`;

/** A shaft's live controls. */
export type GodRayHandle = {
  readonly material: THREE.ShaderMaterial;
  readonly intensity: { value: number };
  readonly baseIntensity: number;
};

/** Compute aAlong for a shaft mesh and return its axis (world space, window → floor). */
function prepareGeometry(mesh: THREE.Mesh): THREE.Vector3 {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const world = Array.from({ length: n }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld),
  );
  // split the vertices into a top and bottom half by height and use their centroids
  const sortedY = world.map((p) => p.y).toSorted((a, b) => a - b);
  const midY = sortedY[Math.floor(n / 2)] ?? 0;
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  let nt = 0;
  let nb = 0;
  for (const p of world) {
    if (p.y >= midY) {
      top.add(p);
      nt++;
    } else {
      bottom.add(p);
      nb++;
    }
  }
  if (nt) top.divideScalar(nt);
  if (nb) bottom.divideScalar(nb);
  const axis = bottom.clone().sub(top);
  if (axis.lengthSq() < 1e-8) axis.set(0, -1, 0);
  axis.normalize();

  let min = Infinity;
  let max = -Infinity;
  const proj = new Float32Array(n);
  world.forEach((p, i) => {
    const d = p.dot(axis);
    proj[i] = d;
    if (d < min) min = d;
    if (d > max) max = d;
  });
  const range = Math.max(1e-5, max - min);
  proj.forEach((d, i) => {
    proj[i] = (d - min) / range;
  });
  geo.setAttribute('aAlong', new THREE.BufferAttribute(proj, 1));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return axis;
}

/**
 * Replace a shaft prism's material with the god-ray shader.
 *
 * @param mesh - An `FX_LightShaft_*` mesh.
 * @param baseIntensity - Daylight intensity (dimmed in the evening).
 * @returns The shaft's controls.
 */
export function applyGodRays(mesh: THREE.Mesh, baseIntensity = 0.6): GodRayHandle {
  const axis = prepareGeometry(mesh);
  const intensity = { value: baseIntensity };
  const material = new THREE.ShaderMaterial({
    name: 'GodRays',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: globalUniforms.uTime,
      uIntensity: intensity,
      uColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
      uAxis: { value: axis },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const old = materialsOf(mesh);
  mesh.material = material;
  old.forEach((m) => m.dispose());
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  return { material, intensity, baseIntensity };
}
