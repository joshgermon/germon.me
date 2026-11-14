/**
 * Headline numbers from an observed day, for the sentence and the moments. Computed at build
 * time from the same file the globe draws, so the words always agree with the picture.
 */
import { LIFT, STOP, at, type Minute } from './clock';
import type { ObservedDay } from './observed-codec';
import { trailing } from './observed';

/** The figures the copy quotes. */
export interface DayStats {
  /** Airliners airborne over the US at a minute (and a week earlier). */
  readonly airborne: (m: Minute) => { readonly now: number; readonly lastWeek: number };
  /** Departures from US airports in the 15 minutes to a minute (and a week earlier). */
  readonly departures15: (m: Minute) => { readonly now: number; readonly lastWeek: number };
  /** The emptiest the US sky got after the stop, and when. */
  readonly low: { readonly at: Minute; readonly airborne: number };
  /** The busiest 15 minutes for departures after the reopening, and when it ended. */
  readonly surge: { readonly at: Minute; readonly departures: number };
  /** Departures during the stop, against the same span a week earlier. */
  readonly duringStop: { readonly now: number; readonly lastWeek: number };
  /** The most departures any one airport fell behind, and the total behind at its peak. */
  readonly behind: {
    readonly peakAt: Minute;
    readonly total: number;
    readonly worst: readonly { readonly code: string; readonly behind: number }[];
  };
  readonly window: { readonly start: Minute; readonly end: Minute };
}

/** Summarise a day. */
export const statsOf = (day: ObservedDay): DayStats => {
  const { series, window, airports } = day;
  const i = (m: Minute): number =>
    Math.max(0, Math.min(series.length - 1, Math.round(m - window.start)));
  const airborne = (m: Minute) => ({
    now: series.usAirborne[i(m)] ?? 0,
    lastWeek: series.usAirborneBaseline[i(m)] ?? 0,
  });
  const departures15 = (m: Minute) => ({
    now: trailing(series.departures, i(m), 15),
    lastWeek: trailing(series.departuresBaseline, i(m), 15),
  });

  // Smooth a little: single minutes of patchy coverage shouldn't set the record.
  const smooth = (m: Minute): number =>
    (airborne(m - 1).now + airborne(m).now + airborne(m + 1).now) / 3;
  let low = { at: STOP, airborne: Number.POSITIVE_INFINITY };
  for (let m = STOP; m <= Math.min(window.end, LIFT + 60); m++) {
    const v = smooth(m);
    if (v < low.airborne) low = { at: m, airborne: v };
  }
  let surge = { at: LIFT, departures: 0 };
  for (let m = LIFT; m <= window.end; m++) {
    const v = departures15(m).now;
    if (v > surge.departures) surge = { at: m, departures: v };
  }
  const sum = (s: Uint16Array, from: Minute, to: Minute): number => {
    let n = 0;
    for (let m = i(from); m < i(to); m++) n += s[m] ?? 0;
    return n;
  };
  let peak = { at: STOP, total: 0 };
  for (let m = 0; m < series.length; m++) {
    let total = 0;
    for (let a = 0; a < airports.length; a++) total += series.shortfall[a * series.length + m] ?? 0;
    if (total > peak.total) peak = { at: window.start + m, total };
  }
  const worst = airports
    .map((a, k) => {
      let max = 0;
      for (let m = 0; m < series.length; m++)
        max = Math.max(max, series.shortfall[k * series.length + m] ?? 0);
      return { code: a.code, behind: max };
    })
    .toSorted((x, y) => y.behind - x.behind)
    .slice(0, 5);

  return {
    airborne,
    departures15,
    low: { at: low.at, airborne: Math.round(low.airborne) },
    surge,
    duringStop: {
      now: sum(series.departures, STOP, LIFT),
      lastWeek: sum(series.departuresBaseline, STOP, LIFT),
    },
    behind: { peakAt: peak.at, total: peak.total, worst },
    window,
  };
};

/** Before the stop: the reference minute for "a normal Friday". */
export const NORMAL_AT: Minute = at(15);
