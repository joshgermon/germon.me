/**
 * Sweep the community ADS-B networks' live APIs over the US, and read the FAA's airport status
 * feed alongside, into one `LiveSnapshot`. Runs on the Worker behind an edge cache
 * (pages/experiments/ground-stop/live.json.ts), so the networks see one sweep every couple of
 * minutes per Cloudflare location, however many people are watching.
 *
 * Each network allows about one request a second, so the sweep runs one paced lane per network
 * (≈15 requests each, ~17 s); a rate-limited request waits and retries once on the other lane's
 * network.
 */
import {
  queryPoint,
  type PointAircraft,
  type Provider,
} from '~/experiments/ground-stop/adapters/adsb-live';
import { fetchNasStatus } from '~/experiments/ground-stop/adapters/faa-nas';
import { AIRLINE_CALLSIGN, SWEEP, type LiveSnapshot } from '~/experiments/ground-stop/domain/live';
import { inUs } from '~/experiments/ground-stop/domain/us-area';

const RADIUS_NM = 250;
const GAP_MS = 1100;
const LANES: readonly Provider[] = ['adsb.lol', 'adsb.fi'];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const round = (x: number, places: number): number => Math.round(x * 10 ** places) / 10 ** places;

/** Take one snapshot; null when most of the sweep failed. */
export const liveSky = async (fetcher: typeof fetch): Promise<LiveSnapshot | null> => {
  const faa = fetchNasStatus(fetcher);
  const seen = new Map<string, PointAircraft>();
  const sources = new Set<Provider>();
  let failed = 0;
  let at = 0;

  const lane = async (provider: Provider, k: number): Promise<void> => {
    const other = LANES[(k + 1) % LANES.length] ?? provider;
    const points = SWEEP.filter((_, i) => i % LANES.length === k);
    for (const [i, p] of points.entries()) {
      if (i > 0) await sleep(GAP_MS);
      let r = await queryPoint(fetcher, provider, p.lat, p.lon, RADIUS_NM);
      let used = provider;
      if (r._tag === 'Err' && r.error._tag === 'RateLimited') {
        await sleep(2 * GAP_MS);
        r = await queryPoint(fetcher, other, p.lat, p.lon, RADIUS_NM);
        used = other;
      }
      if (r._tag === 'Err') {
        failed++;
        continue;
      }
      sources.add(used);
      at = Math.max(at, r.now);
      for (const a of r.aircraft)
        if (!a.onGround && AIRLINE_CALLSIGN.test(a.callsign)) seen.set(a.id, a);
    }
  };
  await Promise.all(LANES.map((provider, k) => lane(provider, k)));

  if (failed > SWEEP.length / 2) return null;
  const aircraft = [...seen.values()].map((a) => a.aircraft);
  return {
    at,
    usAirborne: aircraft.filter(([lat, lon]) => inUs(lat, lon)).length,
    aircraft: aircraft.map(
      ([lat, lon, alt, track, speed]) =>
        [
          round(lat, 3),
          round(lon, 3),
          Math.round(alt / 100) * 100,
          Math.round(track),
          Math.round(speed),
        ] as const,
    ),
    partial: failed > 0,
    sources: [...sources],
    faa: await faa,
  };
};
