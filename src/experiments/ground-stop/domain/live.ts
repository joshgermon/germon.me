/**
 * The live sky: one snapshot of the airline flights over and around the US right now, as the
 * live route sends it and the page draws it.
 */
import { DAY_START_UTC, type Minute } from './clock';

/** One aircraft now: position, feet, heading (degrees), ground speed (knots). */
export type LiveAircraft = readonly [
  lat: number,
  lon: number,
  alt: number,
  track: number,
  speed: number,
];

/** One airport's entry in the FAA's live status feed. */
export interface FaaStatus {
  readonly airport: string;
  readonly kind: 'GroundStop' | 'GroundDelay' | 'Delay' | 'Closure';
  /** The FAA's reason, e.g. "wind", "airport volume", "closed to diversions (capacity)". */
  readonly reason: string;
  /** Average and maximum delay, an end time, or when it reopens. */
  readonly detail: string;
}

/** A snapshot. */
export interface LiveSnapshot {
  /** Epoch milliseconds the data describes. */
  readonly at: number;
  /** Airline flights airborne over US territory (the same test as the baked series). */
  readonly usAirborne: number;
  readonly aircraft: readonly LiveAircraft[];
  /** True when some of the sweep's requests failed, so the picture is incomplete. */
  readonly partial: boolean;
  /** Which networks answered (for credit). */
  readonly sources: readonly string[];
  /** The FAA's airport status feed at the same moment, or null if it couldn't be read. */
  readonly faa: { readonly updated: string; readonly statuses: readonly FaaStatus[] } | null;
}

/** The app's clock minute for an epoch time. */
export const minuteOf = (epochMs: number): Minute => (epochMs - DAY_START_UTC) / 60_000;

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
