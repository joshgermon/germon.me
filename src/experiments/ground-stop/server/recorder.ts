/**
 * The recorder job's work: sweep the sky, add it to the recorded sky, and store what the page
 * and the future need. Everything lives in this experiment's namespace of the site's store:
 *
 *   live/sky.bin                  The recorder's state: the last 90 minutes of every flight.
 *   live/tracks.bin.gz            The same as an `ObservedDay`, what `live.bin` serves.
 *   live/status.json              The latest `LiveStatus`, what `live.json` serves.
 *   series/<date>.json            Every sweep's reading that UTC day: [minute, airborne, take-offs].
 *                                 Kept for good; a week later it is the live view's comparison.
 *   sweeps/<date>/<hhmm>.json.gz  Each sweep as it was seen (and the FAA's list), for re-baking.
 *                                 Kept for `ARCHIVE_DAYS`.
 */
import { z } from 'zod';

import { epochOf, minuteOf, type LiveStatus } from '~/experiments/ground-stop/domain/live';
import { encode } from '~/experiments/ground-stop/domain/observed-codec';
import {
  EMPTY_SKY,
  baselineFrom,
  record,
  toObservedDay,
  type Baseline,
  type Reading,
  type Sky,
} from '~/experiments/ground-stop/domain/recorder';
import { decodeSky, encodeSky } from '~/experiments/ground-stop/domain/sky-codec';
import { jobDone, jobFailed, type JobContext, type JobFailed } from '~/lib/jobs';
import type { Result } from '~/lib/result';
import { getJson, putJson, type Storage } from '~/lib/storage';

import type { SweepResult } from './sweep';

/** Where things are kept, within the experiment's namespace. */
export const KEYS = {
  sky: 'live/sky.bin',
  tracks: 'live/tracks.bin.gz',
  status: 'live/status.json',
  series: (date: string): string => `series/${date}.json`,
  sweeps: (date: string): string => `sweeps/${date}/`,
} as const;

/** Raw sweeps are kept this long. */
export const ARCHIVE_DAYS = 14;
const DAY_MS = 86_400_000;
const WEEK: number = 7 * 24 * 60;

const Series = z.array(z.tuple([z.number(), z.number(), z.number()]));

const dateOf = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);
const gzip = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
const round = (x: number, places: number): number => Math.round(x * 10 ** places) / 10 ** places;

/** Readings stored for a UTC day (none when the day has no file or it can't be read). */
const readSeries = async (storage: Storage, date: string): Promise<Reading[]> => {
  const stored = await getJson(storage, KEYS.series(date), Series);
  return stored._tag === 'ok' && stored.value
    ? stored.value.map(([t, usAirborne, departures]) => ({ t, usAirborne, departures }))
    : [];
};

/** The readings taken a week before the sky's window. */
const weekBefore = async (storage: Storage, sky: Sky): Promise<Baseline> => {
  const dates = new Set([dateOf(epochOf(sky.since - WEEK)), dateOf(epochOf(sky.at - WEEK))]);
  const readings = (await Promise.all([...dates].map((d) => readSeries(storage, d)))).flat();
  return baselineFrom(readings, WEEK);
};

/**
 * Run one recording: sweep, follow, store.
 *
 * @param context - The job's storage and fetch.
 * @param sweep - How to sweep the sky (the real one is `server/sweep.ts`).
 * @returns A one-line summary, or why nothing was recorded.
 */
export const recordSky = async (
  { storage, fetch: fetcher }: JobContext,
  sweep: (fetcher: typeof fetch) => Promise<SweepResult | null>,
): Promise<Result<string, JobFailed>> => {
  const seen = await sweep(fetcher);
  if (!seen) return jobFailed('The live networks did not answer');

  // Unreachable storage must not be mistaken for "no record yet": that would wipe the tracks.
  const stored = await storage.get(KEYS.sky);
  if (stored._tag === 'err') return jobFailed('Could not read the recorded sky', stored.error);
  const decoded = stored.value ? decodeSky(stored.value) : null;
  const before = decoded?._tag === 'Ok' ? decoded.value : EMPTY_SKY;

  const t = Math.round(minuteOf(seen.at));
  const sky = record(before, { t, sightings: seen.sightings, partial: seen.partial });
  if (sky === before) return jobDone('Nothing newer than the last sweep');
  const reading = sky.readings.at(-1);
  const tracked = sky.flights.filter((f) => {
    const last = f.samples.at(-1);
    return last?.t === sky.at && last.altitude !== 'ground';
  }).length;
  const status: LiveStatus = {
    at: seen.at,
    usAirborne: reading?.usAirborne ?? 0,
    tracked,
    partial: seen.partial,
    sources: seen.sources,
    faa: seen.faa,
  };

  const day = toObservedDay(sky, await weekBefore(storage, sky));
  const tracks = await gzip(encode(day));
  const date = dateOf(seen.at);
  const series = await getJson(storage, KEYS.series(date), Series);
  const archive = await gzip(
    new TextEncoder().encode(
      JSON.stringify({
        at: seen.at,
        partial: seen.partial,
        sources: seen.sources,
        faa: seen.faa,
        aircraft: seen.sightings.map((s) => [
          s.id,
          s.callsign,
          round(s.lat, 4),
          round(s.lon, 4),
          s.altitude,
        ]),
      }),
    ),
  );
  const hhmm = new Date(seen.at).toISOString().slice(11, 16).replace(':', '');

  const writes = await Promise.all([
    storage.put(KEYS.sky, encodeSky(sky)),
    storage.put(KEYS.tracks, tracks),
    putJson(storage, KEYS.status, status),
    // Only extend a day's series we could read (or that doesn't exist yet).
    series._tag === 'err' && series.error._tag === 'StorageUnavailable'
      ? Promise.resolve(series)
      : putJson(storage, KEYS.series(date), [
          ...(series._tag === 'ok' ? (series.value ?? []) : []),
          [t, reading?.usAirborne ?? 0, reading?.departures ?? 0],
        ]),
    storage.put(`${KEYS.sweeps(date)}${hhmm}.json.gz`, archive),
  ]);
  const failed = writes.find((w) => w._tag === 'err');
  if (failed?._tag === 'err') return jobFailed('Could not store the recording', failed.error);

  // Yesterday's news is kept; the raw sweeps from over a fortnight ago are not.
  const old = await storage.list(KEYS.sweeps(dateOf(seen.at - (ARCHIVE_DAYS + 1) * DAY_MS)));
  if (old._tag === 'ok' && old.value.length > 0) await storage.remove(old.value);

  return jobDone(
    `${tracked} flights in the air, ${status.usAirborne} over the US, ${reading?.departures ?? 0} take-offs${seen.partial ? ' (partial sweep)' : ''}`,
  );
};
