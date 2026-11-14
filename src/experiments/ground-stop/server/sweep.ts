/**
 * One sweep of the community ADS-B networks' live APIs over the US, with the FAA's airport
 * status feed read alongside.
 *
 * Each network allows about one request a second, so every network has its own pace and the
 * points are shared between two lanes, one preferring each network (≈15 requests each, ~17 s).
 * A request that fails is retried once on the other network; a network that fails twice running
 * is rested for the remainder of the sweep and the other carries every point (~35 s), so one
 * network being down or rate-limiting costs time, not coverage.
 */
import {
  queryPoint,
  type PointResult,
  type Provider,
} from '~/experiments/ground-stop/adapters/adsb-live';
import { fetchNasStatus } from '~/experiments/ground-stop/adapters/faa-nas';
import { AIRLINE_CALLSIGN, SWEEP, type FaaFeed } from '~/experiments/ground-stop/domain/live';
import type { Sighting } from '~/experiments/ground-stop/domain/recorder';

const RADIUS_NM = 250;
const GAP_MS = 1100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** What a sweep brought back. */
export interface SweepResult {
  /** Epoch milliseconds the networks said the data describes. */
  readonly at: number;
  /** Every airline aircraft seen, on the ground or in the air, once each. */
  readonly sightings: readonly Sighting[];
  /** True when some requests failed. */
  readonly partial: boolean;
  readonly sources: readonly string[];
  readonly faa: FaaFeed | null;
}

/**
 * Sweep the sky once.
 *
 * @param fetcher - The `fetch` to use.
 * @returns What was seen, or null when most of the sweep failed.
 */
export const sweepSky = async (fetcher: typeof fetch): Promise<SweepResult | null> => {
  const faa = fetchNasStatus(fetcher);
  const seen = new Map<string, Sighting>();
  const sources = new Set<Provider>();
  let failed = 0;
  let at = 0;

  // Each network's next free moment, and how many requests in a row it has failed.
  const free = new Map<Provider, number>();
  const strikes = new Map<Provider, number>();
  const rested = (p: Provider): boolean => (strikes.get(p) ?? 0) >= 2;
  const ask = async (provider: Provider, lat: number, lon: number): Promise<PointResult> => {
    const now = Date.now();
    const turn = Math.max(now, free.get(provider) ?? 0);
    free.set(provider, turn + GAP_MS);
    if (turn > now) await sleep(turn - now);
    const r = await queryPoint(fetcher, provider, lat, lon, RADIUS_NM);
    strikes.set(provider, r._tag === 'Err' ? (strikes.get(provider) ?? 0) + 1 : 0);
    if (r._tag === 'Ok') sources.add(provider);
    return r;
  };

  const queue = [...SWEEP];
  const lane = async (preferred: Provider, other: Provider): Promise<void> => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const first = rested(preferred) && !rested(other) ? other : preferred;
      const second = first === preferred ? other : preferred;
      let r = await ask(first, p.lat, p.lon);
      if (r._tag === 'Err' && !rested(second)) r = await ask(second, p.lat, p.lon);
      if (r._tag === 'Err') {
        failed++;
        continue;
      }
      at = Math.max(at, r.now);
      for (const a of r.aircraft) if (AIRLINE_CALLSIGN.test(a.callsign)) seen.set(a.id, a);
    }
  };
  await Promise.all([lane('adsb.lol', 'adsb.fi'), lane('adsb.fi', 'adsb.lol')]);

  if (failed > SWEEP.length / 2) return null;
  return {
    at,
    sightings: [...seen.values()],
    partial: failed > 0,
    sources: [...sources],
    faa: await faa,
  };
};
