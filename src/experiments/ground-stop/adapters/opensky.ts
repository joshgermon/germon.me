/**
 * The OpenSky Network's live state vectors: every aircraft in a lat/lon box, in one request.
 *
 * - Token: OAuth2 client credentials, `POST auth.opensky-network.org/…/token` → `access_token`
 *   (good for 30 minutes).
 * - States: `GET opensky-network.org/api/states/all?lamin&lomin&lamax&lomax` →
 *   `{ time: s, states: [[icao24, callsign, …, longitude, latitude, baro_altitude (m), on_ground, …]] }`.
 *   A box over 400 square degrees costs 4 of a standard account's 4,000 daily credits.
 *
 * Parsed here with Zod; the raw shapes and the credentials' raw values stay in this file.
 */
import { z } from 'zod';

import type { Sighting } from '~/experiments/ground-stop/domain/recorder';
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';
import type { Redacted } from '~/lib/redacted';

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const STATES_URL = 'https://opensky-network.org/api/states/all';
const USER_AGENT = 'germon.me experiments (ground-stop)';
const FEET_PER_METRE = 3.28084;
/** A position older than this (seconds) is where the aircraft was, not where it is. */
const STALE_AFTER_S = 60;

/** An OpenSky API client's credentials (from the account page). */
export interface OpenSkyCredentials {
  readonly clientId: string;
  readonly clientSecret: Redacted<string>;
}

/** A lat/lon box to ask about. */
export interface StateBox {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

/** Why OpenSky couldn't be read. */
export type OpenSkyError =
  | { readonly _tag: 'Unauthorized' }
  | { readonly _tag: 'RateLimited' }
  | { readonly _tag: 'Http'; readonly status: number }
  | { readonly _tag: 'Network' }
  | { readonly _tag: 'Shape' };

/** What a box held. */
export interface OpenSkyStates {
  /** Epoch milliseconds the states describe. */
  readonly now: number;
  readonly aircraft: Sighting[];
}

const Token = z.object({ access_token: z.string().min(1) });
const Body = z.object({ time: z.number(), states: z.array(z.array(z.unknown())).nullable() });
const State = z.object({
  icao24: z.string().min(1),
  callsign: z.string().nullable(),
  timePosition: z.number().nullable(),
  longitude: z.number(),
  latitude: z.number(),
  baroAltitude: z.number().nullable(),
  onGround: z.boolean(),
});

/** Read a states response into sightings (exported for tests). Rows without a fresh position are skipped. */
export const parseStates = (json: unknown): Result<OpenSkyStates, OpenSkyError> => {
  const body = Body.safeParse(json);
  if (!body.success) return err({ _tag: 'Shape' });
  const aircraft: Sighting[] = [];
  for (const row of body.data.states ?? []) {
    const s = State.safeParse({
      icao24: row[0],
      callsign: row[1],
      timePosition: row[3],
      longitude: row[5],
      latitude: row[6],
      baroAltitude: row[7],
      onGround: row[8],
    });
    if (!s.success) continue;
    if (s.data.timePosition !== null && body.data.time - s.data.timePosition > STALE_AFTER_S)
      continue;
    aircraft.push({
      id: s.data.icao24.trim().toLowerCase(),
      callsign: (s.data.callsign ?? '').trim(),
      lat: s.data.latitude,
      lon: s.data.longitude,
      altitude: s.data.onGround
        ? 'ground'
        : s.data.baroAltitude === null
          ? null
          : Math.round(s.data.baroAltitude * FEET_PER_METRE),
    });
  }
  return ok({ now: body.data.time * 1000, aircraft });
};

const failure = (status: number): OpenSkyError =>
  status === 401 || status === 403
    ? { _tag: 'Unauthorized' }
    : status === 429
      ? { _tag: 'RateLimited' }
      : { _tag: 'Http', status };

/** Fetch every aircraft in a box: a token, then the states. */
export const fetchStates = async (
  fetcher: typeof fetch,
  credentials: OpenSkyCredentials,
  box: StateBox,
): Promise<Result<OpenSkyStates, OpenSkyError>> => {
  try {
    const auth = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret.unwrap(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!auth.ok) return err(failure(auth.status));
    const token = Token.safeParse(await auth.json().catch(() => null));
    if (!token.success) return err({ _tag: 'Shape' });

    const query = new URLSearchParams({
      lamin: String(box.south),
      lomin: String(box.west),
      lamax: String(box.north),
      lomax: String(box.east),
    });
    const res = await fetcher(`${STATES_URL}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token.data.access_token}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return err(failure(res.status));
    return parseStates(await res.json().catch(() => null));
  } catch {
    return err({ _tag: 'Network' });
  }
};
