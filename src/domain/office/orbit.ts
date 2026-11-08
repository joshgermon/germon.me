/**
 * Orbit maths for the office camera. The camera circles a target on a sphere described by
 * three.js `Spherical` angles: `theta` (azimuth about +Y) and `phi` (polar angle from +Y, so
 * elevation = 90° − phi), both in radians. The exported model only has faces that can be seen
 * from inside its `CameraLimits`, so every camera position — dragged, swaying or tweening —
 * goes through `clampOrbit`. Pure.
 */

const DEG = Math.PI / 180;

/**
 * The orbit envelope the model was exported (and culled) for.
 */
export type CameraLimits = {
  /** Azimuth range relative to the home (`CAM_Iso`) view, in degrees. */
  readonly azimuthOffsetDeg: readonly [number, number];
  /** Absolute elevation range above the horizon, in degrees. */
  readonly elevationDeg: readonly [number, number];
};

/** The export's envelope when `manifest.json` doesn't say: ±30° around home, 12–62° up. */
export const defaultCameraLimits: CameraLimits = {
  azimuthOffsetDeg: [-30, 30],
  elevationDeg: [12, 62],
};

/** A direction on the orbit sphere, in radians. */
export type Orbit = { readonly theta: number; readonly phi: number };

/** The allowed angles, in radians. */
export type OrbitRange = {
  readonly minTheta: number;
  readonly maxTheta: number;
  readonly minPhi: number;
  readonly maxPhi: number;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ordered = ([a, b]: readonly [number, number]): readonly [number, number] =>
  a <= b ? [a, b] : [b, a];

/**
 * The range the camera may move in: the export's azimuth envelope around `home`, and its
 * elevation envelope narrowed to `polarSlack` either side of home (vertical drags only nudge).
 *
 * @param home - The designed (and baked) view.
 * @param limits - The export's envelope.
 * @param polarSlack - How far, in radians, the polar angle may stray from home.
 * @returns The allowed angles; never inverted, even when home lies outside the limits.
 */
export function orbitRange(home: Orbit, limits: CameraLimits, polarSlack: number): OrbitRange {
  const [a0, a1] = ordered(limits.azimuthOffsetDeg);
  const [e0, e1] = ordered(limits.elevationDeg);
  const lowestPhi = (90 - e1) * DEG;
  const highestPhi = (90 - e0) * DEG;
  const slack = Math.max(0, polarSlack);
  const minPhi = Math.max(lowestPhi, home.phi - slack);
  const maxPhi = Math.min(highestPhi, home.phi + slack);
  // Home outside the envelope: pin to the envelope's nearest edge.
  const pinned = clamp(home.phi, lowestPhi, highestPhi);
  return {
    minTheta: home.theta + a0 * DEG,
    maxTheta: home.theta + a1 * DEG,
    minPhi: minPhi <= maxPhi ? minPhi : pinned,
    maxPhi: minPhi <= maxPhi ? maxPhi : pinned,
  };
}

/**
 * Pull a direction back inside the allowed range.
 *
 * @param orbit - Any direction.
 * @param range - The allowed angles.
 * @returns The nearest allowed direction (unchanged if already inside).
 */
export function clampOrbit(orbit: Orbit, range: OrbitRange): Orbit {
  return {
    theta: clamp(orbit.theta, range.minTheta, range.maxTheta),
    phi: clamp(orbit.phi, range.minPhi, range.maxPhi),
  };
}

/**
 * The direction a close-up is framed from: the home angle the room was designed for, keeping
 * a little of wherever the visitor has orbited to so the move feels related.
 *
 * @param current - Where the camera is now.
 * @param home - The designed view.
 * @param keep - How much of the visitor's orbit to keep, per angle, in radians.
 * @param range - The allowed angles.
 * @returns The close-up's direction.
 */
export function closeUpOrbit(current: Orbit, home: Orbit, keep: Orbit, range: OrbitRange): Orbit {
  return clampOrbit(
    {
      theta: home.theta + clamp(current.theta - home.theta, -keep.theta, keep.theta),
      phi: home.phi + clamp(current.phi - home.phi, -keep.phi, keep.phi),
    },
    range,
  );
}

/**
 * The idle sway: a slow sine about `center`, easing in over its first two seconds.
 *
 * @param center - The azimuth to sway about.
 * @param amplitude - Peak deflection, in radians.
 * @param period - Seconds per full sway.
 * @param t - Seconds since the sway began.
 * @returns The azimuth at `t`.
 */
export function swayAzimuth(center: number, amplitude: number, period: number, t: number): number {
  const ramp = clamp(t / 2, 0, 1);
  return center + ramp * amplitude * Math.sin((2 * Math.PI * t) / period);
}

/**
 * A sway centre that keeps the whole sway inside the azimuth range.
 *
 * @param theta - Where the camera is now.
 * @param amplitude - The sway's peak deflection, in radians.
 * @param range - The allowed angles.
 * @returns The centre to sway about.
 */
export function swayCenter(theta: number, amplitude: number, range: OrbitRange): number {
  const lo = range.minTheta + amplitude;
  const hi = range.maxTheta - amplitude;
  return lo <= hi ? clamp(theta, lo, hi) : (range.minTheta + range.maxTheta) / 2;
}

/**
 * Symmetric cubic ease for camera glides (slow out, slow in).
 *
 * @param t - Progress, 0–1.
 * @returns Eased progress, 0–1.
 */
export function easeInOutCubic(t: number): number {
  const u = clamp(t, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}
