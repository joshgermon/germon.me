import { describe, expect, it } from 'vitest';

import { parseStates } from './opensky';

// icao24, callsign, country, time_position, last_contact, lon, lat, baro (m), on_ground, …
const row = (over: Record<number, unknown> = {}): unknown[] => {
  const base: unknown[] = [
    'A1B2C3',
    'UAL123  ',
    'United States',
    1000,
    1000,
    -98.2,
    39.1,
    10668,
    false,
  ];
  for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
  return base;
};

describe('OpenSky states', () => {
  it('reads rows into sightings: feet, trimmed callsigns, lower-case addresses', () => {
    const parsed = parseStates({ time: 1000, states: [row()] });
    expect(parsed._tag === 'Ok' && parsed.value).toEqual({
      now: 1_000_000,
      aircraft: [{ id: 'a1b2c3', callsign: 'UAL123', lat: 39.1, lon: -98.2, altitude: 35000 }],
    });
  });

  it('marks aircraft on the ground and keeps unknown altitudes unknown', () => {
    const parsed = parseStates({
      time: 1000,
      states: [row({ 8: true }), row({ 0: 'bbbbbb', 7: null })],
    });
    expect(parsed._tag === 'Ok' && parsed.value.aircraft.map((a) => a.altitude)).toEqual([
      'ground',
      null,
    ]);
  });

  it('skips rows with no position or a stale one', () => {
    const parsed = parseStates({
      time: 1000,
      states: [row({ 5: null }), row({ 3: 900 }), row({ 1: null })],
    });
    expect(parsed._tag === 'Ok' && parsed.value.aircraft.map((a) => a.callsign)).toEqual(['']);
  });

  it('accepts an empty sky and rejects other bodies', () => {
    expect(parseStates({ time: 1000, states: null })._tag).toBe('Ok');
    expect(parseStates({ error: 'nope' })._tag).toBe('Err');
  });
});
