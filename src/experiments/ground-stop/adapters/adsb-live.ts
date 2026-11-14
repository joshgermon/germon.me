/**
 * Community ADS-B networks' live point queries: every aircraft within up to 250 nm of a point,
 * now. Two networks with the same readsb-style API, so the sweep can split its requests between
 * them (each allows about one request a second):
 *
 * - adsb.lol: `https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}` → `{ now: ms, ac: [...] }` (ODbL)
 * - adsb.fi:  `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}` → `{ now: s, aircraft: [...] }`
 *
 * Parsed here with Zod; the raw shapes stay in this file.
 */
import { z } from 'zod';

import type { Sighting } from '~/experiments/ground-stop/domain/recorder';

/** A network the sweep can ask. */
export type Provider = 'adsb.lol' | 'adsb.fi';

const URLS: Readonly<Record<Provider, (lat: number, lon: number, nm: number) => string>> = {
  'adsb.lol': (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
  'adsb.fi': (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
};

const Aircraft = z.object({
  hex: z.string(),
  flight: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  alt_baro: z.union([z.number(), z.literal('ground')]).optional(),
});
const Body = z.object({
  now: z.number(),
  ac: z.array(z.unknown()).optional(),
  aircraft: z.array(z.unknown()).optional(),
});

/** Why a point query failed. */
export type LiveError =
  | {
      readonly _tag: 'RateLimited';
      /** How long the network asked us to wait (its `Retry-After`), if it said. */
      readonly retryAfterMs: number | null;
    }
  | { readonly _tag: 'Http'; readonly status: number }
  | { readonly _tag: 'Network' }
  | { readonly _tag: 'Shape' };

/** The result of one point query. */
export type PointResult =
  | { readonly _tag: 'Ok'; readonly now: number; readonly aircraft: Sighting[] }
  | { readonly _tag: 'Err'; readonly error: LiveError };

/** Read a response body into aircraft (exported for tests). Aircraft that don't parse are skipped. */
export const parsePoint = (json: unknown): PointResult => {
  const body = Body.safeParse(json);
  if (!body.success) return { _tag: 'Err', error: { _tag: 'Shape' } };
  // adsb.lol reports milliseconds, adsb.fi seconds.
  const now = body.data.now < 1e11 ? body.data.now * 1000 : body.data.now;
  const aircraft: Sighting[] = [];
  for (const raw of body.data.ac ?? body.data.aircraft ?? []) {
    const a = Aircraft.safeParse(raw);
    if (!a.success || a.data.lat === undefined || a.data.lon === undefined) continue;
    aircraft.push({
      id: a.data.hex,
      callsign: (a.data.flight ?? '').trim(),
      lat: a.data.lat,
      lon: a.data.lon,
      altitude: a.data.alt_baro ?? null,
    });
  }
  return { _tag: 'Ok', now, aircraft };
};

/** Query one point on one network. */
export const queryPoint = async (
  fetcher: typeof fetch,
  provider: Provider,
  lat: number,
  lon: number,
  nm: number,
): Promise<PointResult> => {
  let res: Response;
  try {
    res = await fetcher(URLS[provider](lat, lon, nm), {
      headers: { 'User-Agent': 'germon.me experiments (ground-stop)' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { _tag: 'Err', error: { _tag: 'Network' } };
  }
  if (res.status === 429) {
    const seconds = Number(res.headers.get('Retry-After'));
    return {
      _tag: 'Err',
      error: {
        _tag: 'RateLimited',
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
      },
    };
  }
  if (!res.ok) return { _tag: 'Err', error: { _tag: 'Http', status: res.status } };
  return parsePoint(await res.json().catch(() => null));
};
