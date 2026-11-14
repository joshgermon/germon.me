/**
 * GLSL for the globe. Positions are computed on the GPU from per-flight attributes and the
 * clock, so scrubbing nine hours of traffic costs one uniform write per frame.
 */

/** Shared by every point material: round, soft-edged dots. */
const dotFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.32, d);
    gl_FragColor = vec4(vColor, vAlpha * edge);
  }
`;

/** The dot-matrix Earth: ocean, land, and the US, which turns red while it is stopped. */
export const landShader = {
  vertex: /* glsl */ `
    attribute float aKind;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform float uStop;
    uniform float uReopen;
    uniform float uClock;
    uniform vec3 uOcean;
    uniform vec3 uLand;
    uniform vec3 uUs;
    uniform vec3 uHeld;
    uniform vec3 uReleased;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * position);
      float facing = dot(n, normalize(-mv.xyz));
      float limb = smoothstep(0.0, 0.45, facing);
      float isUs = step(1.5, aKind);
      float isLand = step(0.5, aKind);
      // A slow shimmer across the stopped country, so it reads as live rather than painted.
      float shimmer = 0.75 + 0.25 * sin(uClock * 2.2 + position.x * 40.0 + position.y * 31.0);
      // The stopped country is a dim red, so the bright red queues stand out on top of it.
      vec3 us = mix(uUs, uHeld * 0.5, uStop * shimmer);
      us = mix(us, uReleased * 0.7, uReopen);
      vColor = isUs > 0.5 ? us : (isLand > 0.5 ? uLand : uOcean);
      vAlpha = (isLand > 0.5 ? 0.95 : 0.55) * limb;
      gl_PointSize = uSize * (isLand > 0.5 ? 1.0 : 0.8) * uPixelRatio / -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: dotFragment,
};

/** Flights: positions written by the CPU each time the clock moves (observed tracks). */
export const flightShader = {
  vertex: /* glsl */ `
    attribute float aKind;
    attribute float aAlpha;
    attribute float aScale;
    // Where a dot sits along its trail (0 at the aircraft, towards 1 at the tail), plus an
    // offset per flight so they don't all pulse together.
    attribute float aFlow;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform float uClock;
    // 1 on the live sky: a soft pulse runs up each trail towards the aircraft, the way it's
    // heading. 0 when the clock itself is what moves the flights.
    uniform float uFlow;
    uniform float uReduced;
    uniform vec3 uFlight;
    uniform vec3 uReleased;
    uniform vec3 uForeign;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vColor = aKind > 1.5 ? uForeign : (aKind > 0.5 ? uReleased : uFlight);
      // A crest travels up the trail to the aircraft: a narrow bright band, about once every
      // two seconds, so the eye reads which way the flight is going.
      float wave = 0.5 + 0.5 * sin(6.2832 * (uClock * 0.55 + aFlow));
      float crest = wave * wave * wave * wave;
      // Only the trail pulses (the aircraft's own dot has scale 1), and never under reduced motion.
      float flow = uFlow * (1.0 - uReduced) * step(aScale, 0.9);
      vAlpha = mix(aAlpha, aAlpha * 0.45 + 0.6 * crest, flow);
      float size = uSize * aScale * (1.0 + 0.3 * crest * flow);
      gl_PointSize = aAlpha > 0.0 ? size * uPixelRatio / -mv.z : 0.0;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: dotFragment,
};

/** Columns of dots rising from airports: departures waiting on the ground. */
export const stackShader = {
  vertex: /* glsl */ `
    attribute float aOn;
    attribute float aTop;
    attribute float aFocus;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform vec3 uHeld;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vColor = uHeld;
      vAlpha = aOn * (0.5 + 0.5 * max(aTop, aFocus));
      gl_PointSize = aOn * uSize * (1.0 + 0.35 * aFocus) * uPixelRatio / -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: dotFragment,
};

/**
 * Rings of dots in the tangent plane of a point on the globe. Each vertex knows its centre and
 * angle; the radius and opacity come from a ping that starts at `aStart` (sim minutes) or, for
 * the ARTCCs, repeats on the wall clock while the stop is on.
 */
export const ringShader = {
  vertex: /* glsl */ `
    attribute vec3 aCentre;
    attribute float aAngle;
    attribute float aStart;
    attribute float aPhase;
    uniform float uTime;
    uniform float uClock;
    uniform float uMode;
    uniform float uActive;
    uniform float uReduced;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform vec3 uColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec3 up = abs(aCentre.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 tx = normalize(cross(up, aCentre));
      vec3 ty = cross(aCentre, tx);
      float k;
      float alpha;
      if (uMode < 0.5) {
        // ARTCC sonar: repeating on the wall clock while the stop is on.
        k = uReduced > 0.5 ? 0.6 : fract(uClock * 0.4 + aPhase);
        alpha = uActive * (1.0 - k);
      } else {
        // Event ping: one expanding ring over 40 sim-minutes.
        float age = (uTime - aStart) / 40.0;
        k = uReduced > 0.5 ? 0.5 : clamp(age, 0.0, 1.0);
        alpha = (age >= 0.0 && age <= 1.0) ? (1.0 - age) : 0.0;
      }
      float r = 0.01 + 0.055 * k;
      vec3 p = normalize(aCentre + r * (cos(aAngle) * tx + sin(aAngle) * ty)) * 1.004;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vColor = uColor;
      vAlpha = alpha;
      gl_PointSize = alpha > 0.0 ? uSize * uPixelRatio / -mv.z : 0.0;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: dotFragment,
};

/** The thin atmosphere at the limb. */
export const atmosphereShader = {
  vertex: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: /* glsl */ `
    uniform vec3 uColor;
    uniform float uStrength;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(clamp(1.0 - abs(dot(vNormal, vView)), 0.0, 1.0), 4.0);
      gl_FragColor = vec4(uColor, rim * uStrength);
    }
  `,
};
