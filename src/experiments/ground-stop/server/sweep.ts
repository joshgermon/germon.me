/**
 * One sweep of the live sky, with the FAA's airport status feed read alongside.
 *
 * With OpenSky credentials, the sweep is one request: every aircraft in a box around the US
 * (adapters/opensky.ts). Without them, or when OpenSky fails, it falls back to the community
 * ADS-B networks' point queries, 30 circles that tile the country:
 *
 * Each network allows about one request a second, so every network has its own pace, and two
 * lanes share the points: each asks whichever network is free soonest (its own on a tie), so
 * a healthy sweep splits evenly (~17 s). A failed request is retried once on the other network,
 * and a point both refuse goes to the back of the queue for another go.
 * A network that refuses is asked less often for a while (its next turn moves back, further with
 * each refusal in a row), never dropped, so one network rate-limiting costs time, not coverage.
 * A network that answers 403 has blocked where the sweep runs from (adsb.fi does this to
 * Cloudflare), so it isn't asked again that sweep and the other carries every point.
 * The sweep stops asking after `BUDGET_MS`; what it didn't reach counts as failed.
 */
import {
  queryPoint,
  type PointResult,
  type Provider,
} from '~/experiments/ground-stop/adapters/adsb-live';
import { fetchNasStatus } from '~/experiments/ground-stop/adapters/faa-nas';
import {
  fetchStates,
  type OpenSkyCredentials,
  type StateBox,
} from '~/experiments/ground-stop/adapters/opensky';
import { AIRLINE_CALLSIGN, SWEEP, type FaaFeed } from '~/experiments/ground-stop/domain/live';
import type { Sighting } from '~/experiments/ground-stop/domain/recorder';
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';

/** The lower 48, Alaska and Hawaii, and the sky around them. Over 400 sq°, so 4 credits a sweep. */
const OPENSKY_BOX: StateBox = { south: 17, north: 72, west: -180, east: -65 };
const RADIUS_NM = 250;
const GAP_MS = 1100;
/** A refusing network waits this much longer per refusal in a row, up to the maximum. */
const BACKOFF_MS = 2500;
const MAX_BACKOFF_MS = 10_000;
/** Stop asking after this long, so a slow sweep on one network still finishes inside its two minutes. */
const BUDGET_MS = 85_000;
/** How many times a point is put to the networks before the sweep gives up on it. */
const MAX_TRIES = 3;

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
 * @param opensky - OpenSky API credentials, or null to use the community networks only.
 * @returns What was seen, or why most of the sweep failed.
 */
export const sweepSky = async (
  fetcher: typeof fetch,
  opensky: OpenSkyCredentials | null,
): Promise<Result<SweepResult, SweepFailed>> => {
  const faa = fetchNasStatus(fetcher);
  if (!opensky) return sweepNetworks(fetcher, faa, '');
  const states = await fetchStates(fetcher, opensky, OPENSKY_BOX);
  if (states._tag === 'Err') {
    const e = states.error;
    return sweepNetworks(
      fetcher,
      faa,
      `OpenSky ${e._tag}${e._tag === 'Http' ? ` ${e.status}` : ''}`,
    );
  }
  return ok({
    at: states.value.now,
    sightings: states.value.aircraft.filter((a) => AIRLINE_CALLSIGN.test(a.callsign)),
    partial: false,
    sources: ['OpenSky'],
    faa: await faa,
    trouble: '',
  });
};

/** The fallback: the community networks' point queries. `before` is trouble already met. */
const sweepNetworks = async (
  fetcher: typeof fetch,
  faa: Promise<FaaFeed | null>,
  before: string,
): Promise<Result<SweepResult, SweepFailed>> => {
  const seen = new Map<string, Sighting>();
  const sources = new Set<Provider>();
  const errors = new Map<string, number>();
  const deadline = Date.now() + BUDGET_MS;
  let answered = 0;
  let at = 0;

  // Each network's next free moment, and how many requests in a row it has failed.
  const free = new Map<Provider, number>();
  const strikes = new Map<Provider, number>();
  const blocked = new Set<Provider>();
  const turn = (p: Provider): number => Math.max(Date.now(), free.get(p) ?? 0);
  const ask = async (provider: Provider, lat: number, lon: number): Promise<PointResult | null> => {
    const mine = turn(provider);
    if (blocked.has(provider) || mine > deadline) return null;
    free.set(provider, mine + GAP_MS);
    const wait = mine - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await queryPoint(fetcher, provider, lat, lon, RADIUS_NM);
    if (r._tag === 'Ok') {
      strikes.set(provider, 0);
      sources.add(provider);
      return r;
    }
    if (r.error._tag === 'Http' && r.error.status === 403) blocked.add(provider);
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

  // A point that fails goes to the back of the queue, to be asked again if there's time.
  const queue = SWEEP.map((p) => ({ ...p, tries: 0 }));
  const lane = async (preferred: Provider, other: Provider): Promise<void> => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const first =
        blocked.has(preferred) || (!blocked.has(other) && turn(other) < turn(preferred))
          ? other
          : preferred;
      const second = first === preferred ? other : preferred;
      let r = await ask(first, p.lat, p.lon);
      if (r?._tag !== 'Ok') r = (await ask(second, p.lat, p.lon)) ?? r;
      if (r?._tag !== 'Ok') {
        if (r !== null && p.tries + 1 < MAX_TRIES) queue.push({ ...p, tries: p.tries + 1 });
        continue;
      }
      answered++;
      at = Math.max(at, r.now);
      for (const a of r.aircraft) if (AIRLINE_CALLSIGN.test(a.callsign)) seen.set(a.id, a);
    }
  };
  await Promise.all([lane('adsb.lol', 'adsb.fi'), lane('adsb.fi', 'adsb.lol')]);

  const trouble = [before, ...[...errors].map(([kind, n]) => `${kind} ×${n}`)]
    .filter(Boolean)
    .join(', ');
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
