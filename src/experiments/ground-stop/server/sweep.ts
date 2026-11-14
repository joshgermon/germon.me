/**
 * One sweep of the community ADS-B networks' live APIs over the US, with the FAA's airport
 * status feed read alongside.
 *
 * Each network allows about one request a second, so every network has its own pace, and two
 * lanes share the points: each asks whichever network is free soonest (its own on a tie), so
 * a healthy sweep splits evenly (~17 s). A failed request is retried once on the other network.
 * A network that refuses is asked less often for a while (its next turn moves back, further with
 * each refusal in a row), never dropped, so one network rate-limiting costs time, not coverage.
 * The sweep stops asking after `BUDGET_MS`; what it didn't reach counts as failed.
 */
import {
  queryPoint,
  type PointResult,
  type Provider,
} from '~/experiments/ground-stop/adapters/adsb-live';
import { fetchNasStatus } from '~/experiments/ground-stop/adapters/faa-nas';
import { AIRLINE_CALLSIGN, SWEEP, type FaaFeed } from '~/experiments/ground-stop/domain/live';
import type { Sighting } from '~/experiments/ground-stop/domain/recorder';
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';

const RADIUS_NM = 250;
const GAP_MS = 1100;
/** A refusing network waits this much longer per refusal in a row, up to the maximum. */
const BACKOFF_MS = 2500;
const MAX_BACKOFF_MS = 10_000;
/** Stop asking after this long, so a slow sweep still finishes inside its two minutes. */
const BUDGET_MS = 55_000;

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
  /** What went wrong along the way, for the log: e.g. "adsb.lol RateLimited ×4". Empty when clean. */
  readonly trouble: string;
}

/** Most of the sweep failed, so there is no picture of the sky. */
export interface SweepFailed {
  readonly _tag: 'SweepFailed';
  /** The failures by network and kind, e.g. "adsb.lol RateLimited ×15, adsb.fi Http 403 ×14". */
  readonly trouble: string;
}

/**
 * Sweep the sky once.
 *
 * @param fetcher - The `fetch` to use.
 * @returns What was seen, or why most of the sweep failed.
 */
export const sweepSky = async (
  fetcher: typeof fetch,
): Promise<Result<SweepResult, SweepFailed>> => {
  const faa = fetchNasStatus(fetcher);
  const seen = new Map<string, Sighting>();
  const sources = new Set<Provider>();
  const errors = new Map<string, number>();
  const deadline = Date.now() + BUDGET_MS;
  let answered = 0;
  let at = 0;

  // Each network's next free moment, and how many requests in a row it has failed.
  const free = new Map<Provider, number>();
  const strikes = new Map<Provider, number>();
  const turn = (p: Provider): number => Math.max(Date.now(), free.get(p) ?? 0);
  const ask = async (provider: Provider, lat: number, lon: number): Promise<PointResult | null> => {
    const mine = turn(provider);
    if (mine > deadline) return null;
    free.set(provider, mine + GAP_MS);
    const wait = mine - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await queryPoint(fetcher, provider, lat, lon, RADIUS_NM);
    if (r._tag === 'Ok') {
      strikes.set(provider, 0);
      sources.add(provider);
      return r;
    }
    const run = (strikes.get(provider) ?? 0) + 1;
    strikes.set(provider, run);
    // Ask a refusing network less often: its next turn moves back, further each time.
    free.set(
      provider,
      Math.max(free.get(provider) ?? 0, Date.now() + Math.min(MAX_BACKOFF_MS, run * BACKOFF_MS)),
    );
    const kind = `${provider} ${r.error._tag}${r.error._tag === 'Http' ? ` ${r.error.status}` : ''}`;
    errors.set(kind, (errors.get(kind) ?? 0) + 1);
    return r;
  };

  const queue = [...SWEEP];
  const lane = async (preferred: Provider, other: Provider): Promise<void> => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const first = turn(other) < turn(preferred) ? other : preferred;
      const second = first === preferred ? other : preferred;
      let r = await ask(first, p.lat, p.lon);
      if (r?._tag !== 'Ok') r = (await ask(second, p.lat, p.lon)) ?? r;
      if (r?._tag !== 'Ok') continue;
      answered++;
      at = Math.max(at, r.now);
      for (const a of r.aircraft) if (AIRLINE_CALLSIGN.test(a.callsign)) seen.set(a.id, a);
    }
  };
  await Promise.all([lane('adsb.lol', 'adsb.fi'), lane('adsb.fi', 'adsb.lol')]);

  const trouble = [...errors].map(([kind, n]) => `${kind} ×${n}`).join(', ');
  if (answered < SWEEP.length / 2) return err({ _tag: 'SweepFailed', trouble });
  return ok({
    at,
    sightings: [...seen.values()],
    partial: answered < SWEEP.length,
    sources: [...sources],
    faa: await faa,
    trouble,
  });
};
