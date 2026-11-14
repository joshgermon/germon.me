import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SKY,
  KEEP,
  baselineFrom,
  record,
  toObservedDay,
  type Sighting,
  type Sky,
} from './recorder';
import { decodeSky, encodeSky } from './sky-codec';

// Kansas, heading east; and a spot on the ground at Denver.
const cruising = (id: string, lon: number): Sighting => ({
  id,
  callsign: 'SWA100',
  lat: 39,
  lon,
  altitude: 35000,
});
const at = (id: string, altitude: Sighting['altitude']): Sighting => ({
  id,
  callsign: 'UAL200',
  lat: 39.86,
  lon: -104.67,
  altitude,
});

const run = (sweeps: readonly (readonly [number, readonly Sighting[]])[]): Sky =>
  sweeps.reduce((sky, [t, sightings]) => record(sky, { t, sightings }), EMPTY_SKY);

describe('record', () => {
  it('follows an aircraft from sweep to sweep', () => {
    const sky = run([
      [1000, [cruising('a', -100)]],
      [1002, [cruising('a', -99.6)]],
      [1004, [cruising('a', -99.2)]],
    ]);
    expect(sky.flights).toHaveLength(1);
    expect(sky.flights[0]?.samples.map((s) => s.t)).toEqual([1000, 1002, 1004]);
    expect(sky.readings.map((r) => r.usAirborne)).toEqual([1, 1, 1]);
    expect([sky.since, sky.at]).toEqual([1000, 1004]);
  });

  it('counts a take-off once, when ground turns to a climb', () => {
    const sky = run([
      [1000, [at('b', 'ground')]],
      [1002, [at('b', 'ground')]],
      [1004, [at('b', 4000)]],
      [1006, [at('b', 9000)]],
    ]);
    expect(sky.readings.map((r) => r.departures)).toEqual([0, 0, 1, 0]);
    expect(sky.flights[0]?.departedAt).toBe(1004);
    // The wait on the ground is one sample, not one per sweep.
    expect(sky.flights[0]?.samples.map((s) => s.altitude)).toEqual(['ground', 4000, 9000]);
  });

  it('ignores a sweep that is not newer, and forgets what is older than it keeps', () => {
    const first = run([[1000, [cruising('a', -100)]]]);
    expect(record(first, { t: 1000, sightings: [] })).toBe(first);
    const later = record(first, { t: 1000 + KEEP + 10, sightings: [cruising('c', -90)] });
    expect(later.flights.map((f) => f.id)).toEqual(['c']);
    expect(later.since).toBe(1010);
    expect(later.readings).toHaveLength(1);
  });

  it('does not record a dip when a partial sweep misses a flight', () => {
    const first = run([[1000, [cruising('a', -100), cruising('d', -95)]]]);
    const partial = record(first, { t: 1002, sightings: [cruising('a', -99.6)], partial: true });
    const whole = record(first, { t: 1002, sightings: [cruising('a', -99.6)] });
    expect(partial.readings.at(-1)?.usAirborne).toBe(2);
    expect(whole.readings.at(-1)?.usAirborne).toBe(1);
  });
});

describe('toObservedDay', () => {
  const sky = run([
    [1000, [cruising('a', -100), at('b', 'ground')]],
    [1002, [cruising('a', -99.6), at('b', 3000)]],
    [1004, [cruising('a', -99.2), at('b', 8000)]],
  ]);

  it('draws each airborne stretch as a track over the recorded window', () => {
    const day = toObservedDay(sky);
    expect(day.window).toEqual({ start: 1000, end: 1004 });
    expect(day.tracks.count).toBe(2);
    expect([...day.series.usAirborne]).toEqual([1, 1, 2, 2, 2]);
    expect([...day.series.departures]).toEqual([0, 0, 1, 0, 0]);
    expect([...day.series.usAirborneBaseline]).toEqual([0, 0, 0, 0, 0]);
  });

  it('compares with readings from a week earlier, counting their take-offs once', () => {
    const week = 10_080;
    const day = toObservedDay(
      sky,
      baselineFrom([{ t: 1002 - week, usAirborne: 40, departures: 3 }], week),
    );
    expect([...day.series.usAirborneBaseline]).toEqual([40, 40, 40, 40, 40]);
    expect([...day.series.departuresBaseline].reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('sky codec', () => {
  const sighting = fc.record({
    id: fc.stringMatching(/^[0-9a-f]{6}$/),
    callsign: fc.stringMatching(/^[A-Z]{3}\d{1,4}$/),
    lat: fc.integer({ min: -8000, max: 8000 }).map((x) => x / 100),
    lon: fc.integer({ min: -17900, max: 17900 }).map((x) => x / 100),
    altitude: fc.oneof(
      fc.constant<'ground'>('ground'),
      fc.constant(null),
      fc.integer({ min: 1, max: 180 }).map((x) => x * 250),
    ),
  });

  it('round-trips a recorded sky', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uniqueArray(sighting, { selector: (s) => s.id }), { maxLength: 6 }),
        (sweeps) => {
          const sky = run(sweeps.map((s, i) => [2000 + i * 2, s] as const));
          if (sky === EMPTY_SKY) return;
          const back = decodeSky(encodeSky(sky));
          expect(back._tag === 'Ok' && back.value).toEqual(sky);
        },
      ),
    );
  });

  it('rejects other bytes', () => {
    expect(decodeSky(new Uint8Array(40))._tag).toBe('Err');
  });
});
