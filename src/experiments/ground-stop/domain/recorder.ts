/**
 * The recorder: following flights from one sweep of the live networks to the next. A sweep says
 * where every airline aircraft is now; `record` adds that to the `Sky` (each aircraft's samples
 * over the last `KEEP` minutes, plus a reading per sweep), and `toObservedDay` turns the sky into
 * the same `ObservedDay` shape the baked evening has, so the page draws recorded flights exactly
 * as it draws the baked ones: real tracks, take-offs counted the same way.
 *
 * Pure: time comes in with the sweep.
 */
import type { Minute } from './clock';
import {
  MIN_TURNAROUND,
  airborneStretches,
  movements,
  simplify,
  type Sample,
  type Track,
} from './observed';
import { toTable, type ObservedDay } from './observed-codec';
import { inUs } from './us-area';

/** How much of the recent past the sky keeps, in minutes. */
export const KEEP: Minute = 90;
/** After a partial sweep, a flight seen this recently still counts as in the air. */
const PARTIAL_GRACE: Minute = 5;
/** The same simplification the bake uses. */
const TOLERANCE_KM = 6;

/** One aircraft as one sweep saw it. */
export interface Sighting {
  /** The aircraft's ICAO address (hex). */
  readonly id: string;
  readonly callsign: string;
  readonly lat: number;
  readonly lon: number;
  /** Feet; `'ground'` on the ground; `null` when the transponder didn't say. */
  readonly altitude: number | 'ground' | null;
}

/** Everything one sweep saw. */
export interface Sweep {
  /** The minute the sweep describes. */
  readonly t: Minute;
  readonly sightings: readonly Sighting[];
  /** Some of the sky wasn't looked at (a network failed), so absences mean nothing. */
  readonly partial?: boolean;
}

/** One aircraft being followed. */
export interface TrackedFlight {
  readonly id: string;
  readonly callsign: string;
  /** Its last take-off from the US, if the recorder saw one. */
  readonly departedAt: Minute | null;
  /** Oldest first. A run of ground samples is kept as its latest one. */
  readonly samples: readonly Sample[];
}

/** What one sweep measured. */
export interface Reading {
  readonly t: Minute;
  /** Airline flights airborne over US territory. */
  readonly usAirborne: number;
  /** Take-offs from the US seen since the sweep before. */
  readonly departures: number;
}

/** The recorded sky: the last `KEEP` minutes of every followed flight. */
export interface Sky {
  /** The latest sweep's minute. */
  readonly at: Minute;
  /** The earliest minute the record covers. */
  readonly since: Minute;
  readonly flights: readonly TrackedFlight[];
  readonly readings: readonly Reading[];
}

/** A sky with nothing in it yet (the first sweep starts the record). */
export const EMPTY_SKY: Sky = { at: Number.NEGATIVE_INFINITY, since: 0, flights: [], readings: [] };

const usGround = (p: { readonly lat: number; readonly lon: number }): string | null =>
  inUs(p.lat, p.lon) ? 'US' : null;

/**
 * Add a sweep to the sky. A sweep no newer than the sky's latest changes nothing.
 *
 * @param sky - The record so far.
 * @param sweep - What was just seen.
 * @param keep - How many minutes of the past to keep.
 * @returns The new record.
 */
export const record = (sky: Sky, sweep: Sweep, keep: Minute = KEEP): Sky => {
  const t = Math.round(sweep.t);
  if (t <= sky.at) return sky;
  const fresh = sky.flights.length === 0 && sky.readings.length === 0;
  const since = Math.max(fresh ? t : sky.since, t - keep);
  const seen = new Map(sweep.sightings.map((s) => [s.id, s]));
  let departures = 0;

  const follow = (flight: TrackedFlight | null, s: Sighting): TrackedFlight => {
    const sample: Sample = { t, lat: s.lat, lon: s.lon, altitude: s.altitude };
    const before = flight?.samples ?? [];
    const last = before.at(-1);
    let departedAt = flight?.departedAt ?? null;
    if (
      last &&
      movements([last, sample], usGround).departures.length > 0 &&
      (departedAt === null || t - departedAt >= MIN_TURNAROUND)
    ) {
      departedAt = t;
      departures++;
    }
    // Sitting on the ground: remember only where it is now.
    const kept =
      last?.altitude === 'ground' && s.altitude === 'ground' ? before.slice(0, -1) : before;
    return {
      id: s.id,
      callsign: s.callsign || (flight?.callsign ?? ''),
      departedAt,
      samples: [...kept.filter((x) => x.t >= since), sample],
    };
  };

  const flights: TrackedFlight[] = [];
  for (const flight of sky.flights) {
    const s = seen.get(flight.id);
    if (s) {
      seen.delete(flight.id);
      flights.push(follow(flight, s));
      continue;
    }
    const samples = flight.samples.filter((x) => x.t >= since);
    if (samples.length > 0) flights.push({ ...flight, samples });
  }
  for (const s of seen.values()) flights.push(follow(null, s));

  // A partial sweep misses aircraft that are still up there: count the ones seen in the last few
  // minutes too, rather than record a dip that never happened.
  const recent = sweep.partial === true ? t - PARTIAL_GRACE : t;
  const reading: Reading = {
    t,
    usAirborne: flights.filter((f) => {
      const last = f.samples.at(-1);
      return (
        last !== undefined &&
        last.t >= recent &&
        last.altitude !== 'ground' &&
        inUs(last.lat, last.lon)
      );
    }).length,
    departures,
  };
  return {
    at: t,
    since,
    flights,
    readings: [...sky.readings.filter((r) => r.t >= since), reading],
  };
};

/** The same measurements a week earlier, when the recorder has them. */
export interface Baseline {
  /** A reading within a few minutes of `t`, or null. */
  readonly at: (t: Minute) => Reading | null;
}

/** No comparison yet. */
export const NO_BASELINE: Baseline = { at: () => null };

/**
 * A baseline from readings recorded a week (or any offset) earlier.
 *
 * @param readings - The earlier readings, any order.
 * @param offset - How many minutes earlier they were taken (a week is 10,080).
 * @returns A lookup by the present minute.
 */
export const baselineFrom = (readings: readonly Reading[], offset: Minute): Baseline => {
  const byMinute = new Map(readings.map((r) => [Math.round(r.t), r]));
  return {
    at: (t) => {
      const m = Math.round(t) - offset;
      for (const d of [0, -1, 1, -2, 2]) {
        const r = byMinute.get(m + d);
        if (r) return r;
      }
      return null;
    },
  };
};

/**
 * The recorded sky as an `ObservedDay`: tracks for every airborne stretch, and per-minute series
 * over the recorded window (readings carried forward between sweeps). There are no airports or
 * shortfall; the baseline series are zero where there is nothing to compare with.
 *
 * @param sky - The record (must hold at least one sweep).
 * @param baseline - Readings from a week earlier.
 * @returns The day, with `window` = the recorded minutes.
 */
export const toObservedDay = (sky: Sky, baseline: Baseline = NO_BASELINE): ObservedDay => {
  const window = { start: Math.ceil(sky.since), end: Math.round(sky.at) };
  const length = Math.max(1, window.end - window.start + 1);
  const usAirborne = new Uint16Array(length);
  const usAirborneBaseline = new Uint16Array(length);
  const departures = new Uint16Array(length);
  const departuresBaseline = new Uint16Array(length);
  const readings = sky.readings.toSorted((a, b) => a.t - b.t);
  let k = 0;
  let current = readings[0]?.usAirborne ?? 0;
  let counted: Reading | null = null;
  for (let i = 0; i < length; i++) {
    const m = window.start + i;
    while (k < readings.length && (readings[k]?.t ?? 0) <= m) {
      const r = readings[k++];
      if (!r) continue;
      current = r.usAirborne;
      departures[i] = Math.min(65535, (departures[i] ?? 0) + r.departures);
    }
    usAirborne[i] = Math.min(65535, current);
    const then = baseline.at(m);
    usAirborneBaseline[i] = Math.min(65535, then?.usAirborne ?? 0);
    // Each earlier reading's take-offs count once, at the first minute that finds it.
    if (then && then !== counted) {
      departuresBaseline[i] = Math.min(65535, then.departures);
      counted = then;
    }
  }

  const tracks: Track[] = [];
  for (const flight of sky.flights) {
    for (const stretch of airborneStretches(flight.samples)) {
      tracks.push({
        kind: stretch.some((p) => inUs(p.lat, p.lon)) ? 'us' : 'foreign',
        points: simplify(stretch, TOLERANCE_KM),
      });
    }
  }
  return {
    window,
    airports: [],
    series: {
      length,
      usAirborne,
      usAirborneBaseline,
      departures,
      departuresBaseline,
      shortfall: new Uint16Array(0),
    },
    tracks: toTable(tracks.toSorted((a, b) => (a.points[0]?.t ?? 0) - (b.points[0]?.t ?? 0))),
  };
};
