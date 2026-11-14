import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decode, encode, toTable, type ObservedDay } from './observed-codec';
import type { Track } from './observed';

const start = 840;
const end = 900;
const L = end - start + 1;

const trackArb = fc
  .record({
    first: fc.integer({ min: start, max: end - 10 }),
    kind: fc.constantFrom('us' as const, 'released' as const, 'foreign' as const),
    pts: fc.array(
      fc.record({
        dt: fc.integer({ min: 1, max: 3 }),
        lat: fc.double({ min: -80, max: 80, noNaN: true }),
        lon: fc.double({ min: -180, max: 179.99, noNaN: true }),
        alt: fc.integer({ min: 0, max: 45000 }),
      }),
      { minLength: 2, maxLength: 3 },
    ),
  })
  .map(({ first, kind, pts }): Track => {
    let t = first;
    return {
      kind,
      points: pts.map((p, i) => ({
        t: (t += i === 0 ? 0 : p.dt),
        lat: p.lat,
        lon: p.lon,
        alt: p.alt,
      })),
    };
  });

const series = (seed: number) => Uint16Array.from({ length: L }, (_, i) => (i * 7 + seed) % 3000);

describe('observed codec', () => {
  it('round-trips within its quantisation', () => {
    fc.assert(
      fc.property(fc.array(trackArb, { maxLength: 20 }), (tracks) => {
        const day: ObservedDay = {
          window: { start, end },
          airports: [{ code: 'ATL', lat: 33.64, lon: -84.43 }],
          series: {
            length: L,
            usAirborne: series(1),
            usAirborneBaseline: series(2),
            departures: series(3),
            departuresBaseline: series(4),
            shortfall: series(5),
          },
          tracks: toTable(tracks),
        };
        const back = decode(encode(day));
        expect(back._tag).toBe('Ok');
        if (back._tag !== 'Ok') return;
        const d = back.value;
        expect(d.window).toEqual(day.window);
        expect(d.airports[0]?.code).toBe('ATL');
        expect(Array.from(d.series.shortfall)).toEqual(Array.from(day.series.shortfall));
        expect(Array.from(d.tracks.offsets)).toEqual(Array.from(day.tracks.offsets));
        expect(Array.from(d.tracks.kind)).toEqual(Array.from(day.tracks.kind));
        day.tracks.t.forEach((t, i) => {
          expect(d.tracks.t[i]).toBe(t);
          expect(Math.abs((d.tracks.lat[i] ?? 0) - (day.tracks.lat[i] ?? 0))).toBeLessThanOrEqual(
            0.0051,
          );
          const dl = Math.abs((d.tracks.lon[i] ?? 0) - (day.tracks.lon[i] ?? 0));
          expect(Math.min(dl, 360 - dl)).toBeLessThanOrEqual(0.0051);
          expect(Math.abs((d.tracks.alt[i] ?? 0) - (day.tracks.alt[i] ?? 0))).toBeLessThanOrEqual(
            125,
          );
        });
      }),
      { numRuns: 60 },
    );
  });

  it('rejects files that are not baked days', () => {
    expect(decode(new Uint8Array(40))._tag).toBe('Err');
  });
});
