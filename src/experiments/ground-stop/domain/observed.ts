/**
 * Observed traffic: turning per-aircraft position samples (from ADS-B, via the adsb.lol
 * adapter) into airborne tracks, take-offs and landings, and the per-minute series the HUD and
 * globe draw. Pure: airports and "is this in the US" come in as functions.
 */
import type { Minute } from './clock';
import { angleBetween, slerp, toLatLon, toVec3, EARTH_RADIUS_KM, type LatLon } from './sphere';

/** One position report, resampled to the minute. */
export interface Sample extends LatLon {
  readonly t: Minute;
  /** Feet; `'ground'` on the ground; `null` when the transponder didn't say. */
  readonly altitude: number | 'ground' | null;
}

/** A point on an airborne track. */
export interface TrackPoint extends LatLon {
  readonly t: Minute;
  /** Feet (0 when unknown). */
  readonly alt: number;
}

/** How a track is drawn: in the US system before the stop, after it began, or elsewhere. */
export type TrackKind = 'us' | 'released' | 'foreign';

/** One continuous stretch of flight. */
export interface Track {
  readonly points: readonly TrackPoint[];
  readonly kind: TrackKind;
}

/** A take-off or landing at an airport. */
export interface Movement {
  readonly t: Minute;
  readonly airport: string;
}

/** Below this, an aircraft counts as on or leaving the runway. */
export const RUNWAY_FT = 2500;
/** Coverage gaps longer than this split a track rather than drawing a guessed line. */
export const MAX_GAP = 20;

const low = (s: Sample): boolean =>
  s.altitude === 'ground' || (s.altitude !== null && s.altitude < RUNWAY_FT);

/** Split an aircraft's samples into airborne stretches, breaking on the ground and at gaps. */
export const airborneStretches = (samples: readonly Sample[]): TrackPoint[][] => {
  const out: TrackPoint[][] = [];
  let current: TrackPoint[] = [];
  let last: Sample | null = null;
  for (const s of samples) {
    const gap = last !== null && s.t - last.t > MAX_GAP;
    if (s.altitude === 'ground' || gap) {
      if (current.length >= 2) out.push(current);
      current = [];
    }
    if (s.altitude !== 'ground')
      current.push({ t: s.t, lat: s.lat, lon: s.lon, alt: s.altitude ?? 0 });
    last = s;
  }
  if (current.length >= 2) out.push(current);
  return out;
};

/** Where a point would be at `t` if it flew the great circle between `a` and `b` at constant speed. */
const between = (a: TrackPoint, b: TrackPoint, t: Minute): LatLon => {
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return toLatLon(slerp(toVec3(a), toVec3(b), f));
};

const errorKm = (p: LatLon, q: LatLon): number =>
  angleBetween(toVec3(p), toVec3(q)) * EARTH_RADIUS_KM;

/**
 * Drop points that the great circle between their neighbours already predicts (in space and
 * time) to within `toleranceKm`: Douglas–Peucker, parameterised by time so playback speed is
 * kept. Never leaves more than `maxSpan` minutes between kept points.
 */
export const simplify = (
  points: readonly TrackPoint[],
  toleranceKm: number,
  maxSpan = 240,
): TrackPoint[] => {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [i, j] = range;
    const a = points[i];
    const b = points[j];
    if (!a || !b || j - i < 2) continue;
    let worst = -1;
    let worstAt = -1;
    for (let k = i + 1; k < j; k++) {
      const p = points[k];
      if (!p) continue;
      const e = errorKm(p, between(a, b, p.t));
      if (e > worst) {
        worst = e;
        worstAt = k;
      }
    }
    if (worstAt >= 0 && (worst > toleranceKm || b.t - a.t > maxSpan)) {
      keep[worstAt] = 1;
      stack.push([i, worstAt], [worstAt, j]);
    }
  }
  return points.filter((_, k) => keep[k] === 1);
};

/** A second take-off by the same aircraft sooner than this is circuit training, not a flight. */
export const MIN_TURNAROUND = 45;

/**
 * Take-offs and landings: a climb through RUNWAY_FT (or a ground-to-air step) near an airport,
 * between samples no more than five minutes apart. Repeat take-offs within MIN_TURNAROUND
 * minutes (touch-and-goes) count once.
 */
export const movements = (
  samples: readonly Sample[],
  airportNear: (p: LatLon) => string | null,
): { readonly departures: Movement[]; readonly arrivals: Movement[] } => {
  const departures: Movement[] = [];
  const arrivals: Movement[] = [];
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1];
    const s = samples[i];
    if (!p || !s || s.t - p.t > 5) continue;
    if (low(p) && !low(s) && s.altitude !== null) {
      const airport = airportNear(p);
      const previous = departures.at(-1);
      if (airport && (!previous || s.t - previous.t >= MIN_TURNAROUND))
        departures.push({ t: s.t, airport });
    } else if (!low(p) && low(s) && p.altitude !== null) {
      const airport = airportNear(s);
      if (airport) arrivals.push({ t: s.t, airport });
    }
  }
  return { departures, arrivals };
};

/** Count events per minute over `[start, end]`. */
export const perMinute = (times: readonly Minute[], start: Minute, end: Minute): Uint16Array => {
  const out = new Uint16Array(end - start + 1);
  for (const t of times) {
    const i = Math.round(t) - start;
    if (i >= 0 && i < out.length) out[i] = Math.min(65535, (out[i] ?? 0) + 1);
  }
  return out;
};

/**
 * Departures an airport has lost against a baseline day, accumulated from `from`: at each
 * minute, the baseline's departures since `from` minus the observed ones, floored at zero.
 */
export const shortfall = (
  baseline: Uint16Array,
  observed: Uint16Array,
  fromIndex: number,
): Uint16Array => {
  const out = new Uint16Array(observed.length);
  let sum = 0;
  for (let i = 0; i < observed.length; i++) {
    if (i >= fromIndex) sum += (baseline[i] ?? 0) - (observed[i] ?? 0);
    out[i] = Math.max(0, Math.min(65535, Math.round(sum)));
  }
  return out;
};

/** Sum of the `width` values ending at `i` (a trailing window, e.g. departures in 15 minutes). */
export const trailing = (series: Uint16Array, i: number, width: number): number => {
  let sum = 0;
  for (let k = Math.max(0, i - width + 1); k <= i; k++) sum += series[k] ?? 0;
  return sum;
};
