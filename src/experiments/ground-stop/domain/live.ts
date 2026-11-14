/**
 * The live sky, as the page reads it. A scheduled job (jobs.ts) sweeps the live networks every
 * `SWEEP_EVERY` minutes and records what it sees; the page gets a small status (`live.json`)
 * and the recorded flights as an `ObservedDay` (`live.bin`).
 */
import { DAY_START_UTC, type Minute } from './clock';

/**
 * Minutes between sweeps. adsb.lol allows a Worker about 12 requests every 75 seconds or so, and
 * a sweep is 30, so one sweep takes about three minutes.
 */
export const SWEEP_EVERY = 4;

/** A status older than this isn't "live" any more (the recorder has stopped or is failing). */
export const STALE_AFTER_MS = 15 * 60_000;

/** One airport's entry in the FAA's live status feed. */
export interface FaaStatus {
  readonly airport: string;
  readonly kind: 'GroundStop' | 'GroundDelay' | 'Delay' | 'Closure';
  /** The FAA's reason, e.g. "wind", "airport volume", "closed to diversions (capacity)". */
  readonly reason: string;
  /** Average and maximum delay, an end time, or when it reopens. */
  readonly detail: string;
}

/** The FAA's airport status feed at one moment. */
export interface FaaFeed {
  readonly updated: string;
  readonly statuses: readonly FaaStatus[];
}

/** What the latest sweep found. */
export interface LiveStatus {
  /** Epoch milliseconds the data describes. */
  readonly at: number;
  /** Airline flights airborne over US territory (the same test as the baked series). */
  readonly usAirborne: number;
  /** Flights the recorder is following in the air right now. */
  readonly tracked: number;
  /** True when some of the sweep's requests failed, so the picture is incomplete. */
  readonly partial: boolean;
  /** Which networks answered (for credit). */
  readonly sources: readonly string[];
  /** The FAA's airport status feed at the same moment, or null if it couldn't be read. */
  readonly faa: FaaFeed | null;
}

/** The app's clock minute for an epoch time. */
export const minuteOf = (epochMs: number): Minute => (epochMs - DAY_START_UTC) / 60_000;

/** The epoch time of a clock minute. */
export const epochOf = (minute: Minute): number => DAY_START_UTC + minute * 60_000;

/** Airline-style callsigns (three-letter ICAO designator + flight number): airliners and cargo. */
export const AIRLINE_CALLSIGN = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;

/** Where to look from: 250 nm circles that tile the lower 48, plus Alaska and Hawaii. */
export const SWEEP: readonly { readonly lat: number; readonly lon: number }[] = [
  ...[27, 33, 39, 45].flatMap((lat) =>
    [-122, -115.5, -109, -102.5, -96, -89.5, -83, -76.5, -70].map((lon) => ({ lat, lon })),
  ),
  { lat: 61, lon: -150 },
  { lat: 57, lon: -135 },
  { lat: 21, lon: -157 },
];
