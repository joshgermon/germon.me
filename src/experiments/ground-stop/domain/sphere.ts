/**
 * Points on the unit sphere: the Fibonacci lattice the globe's dot matrix is drawn on, and the
 * latitude/longitude conversions everything else uses. Pure maths, no three.js.
 *
 * Axes match three.js: +Y is the north pole, longitude 0° faces +Z, east is +X.
 */

/** A point on the unit sphere. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A position on the Earth in degrees. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

const RAD = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** The unit vector for a latitude/longitude. */
export const toVec3 = ({ lat, lon }: LatLon): Vec3 => {
  const phi = lat * RAD;
  const lambda = lon * RAD;
  return {
    x: Math.cos(phi) * Math.sin(lambda),
    y: Math.sin(phi),
    z: Math.cos(phi) * Math.cos(lambda),
  };
};

/** The latitude/longitude of a unit vector. */
export const toLatLon = ({ x, y, z }: Vec3): LatLon => ({
  lat: Math.asin(Math.max(-1, Math.min(1, y))) / RAD,
  lon: Math.atan2(x, z) / RAD,
});

/** Point `i` of an `n`-point Fibonacci lattice: near-uniform spacing, no seams at the poles. */
export const latticePoint = (i: number, n: number): Vec3 => {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const theta = GOLDEN_ANGLE * i;
  return { x: r * Math.sin(theta), y, z: r * Math.cos(theta) };
};

/** Central angle between two unit vectors, in radians. */
export const angleBetween = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));

/** Great-circle distance in kilometres. */
export const distanceKm = (a: LatLon, b: LatLon): number =>
  angleBetween(toVec3(a), toVec3(b)) * EARTH_RADIUS_KM;

/** Mean Earth radius. */
export const EARTH_RADIUS_KM = 6371;

/** Spherical interpolation along the great circle from `a` to `b`, `t` in [0, 1]. */
export const slerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const omega = angleBetween(a, b);
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return { x: wa * a.x + wb * b.x, y: wa * a.y + wb * b.y, z: wa * a.z + wb * b.z };
};

/** Read bit `i` of a little-endian bitset. */
export const hasBit = (bits: Uint8Array, i: number): boolean =>
  ((bits[i >> 3] ?? 0) >> (i & 7)) % 2 === 1;
