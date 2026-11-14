import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  airborneStretches,
  movements,
  shortfall,
  simplify,
  type Sample,
  type TrackPoint,
} from './observed';
import { angleBetween, EARTH_RADIUS_KM, slerp, toLatLon, toVec3 } from './sphere';

const sample = (t: number, altitude: Sample['altitude']): Sample => ({
  t,
  lat: 33.64,
  lon: -84.43,
  altitude,
});

const point = fc.record({
  lat: fc.double({ min: -60, max: 70, noNaN: true }),
  lon: fc.double({ min: -179, max: 179, noNaN: true }),
  alt: fc.integer({ min: 0, max: 41000 }),
});
const track = fc
  .array(point, { minLength: 2, maxLength: 60 })
  .map((ps) => ps.map((p, i): TrackPoint => ({ ...p, t: 900 + i })));

const positionAt = (pts: readonly TrackPoint[], t: number) => {
  const j = pts.findIndex((p) => p.t >= t);
  const b = pts[j];
  const a = pts[Math.max(0, j - 1)];
  if (!a || !b) throw new Error('out of range');
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return toLatLon(slerp(toVec3(a), toVec3(b), f));
};

describe('simplify', () => {
  it('keeps both ends and never strays further than the tolerance at the dropped minutes', () => {
    fc.assert(
      fc.property(track, fc.double({ min: 1, max: 50, noNaN: true }), (pts, tol) => {
        const kept = simplify(pts, tol);
        expect(kept[0]).toBe(pts[0]);
        expect(kept.at(-1)).toBe(pts.at(-1));
        for (const p of pts) {
          const q = positionAt(kept, p.t);
          expect(angleBetween(toVec3(p), toVec3(q)) * EARTH_RADIUS_KM).toBeLessThanOrEqual(
            tol + 1e-6,
          );
        }
      }),
      { numRuns: 80 },
    );
  });

  it('collapses a steady great-circle flight to its ends', () => {
    const a = toVec3({ lat: 40.6, lon: -73.8 });
    const b = toVec3({ lat: 33.9, lon: -118.4 });
    const pts = Array.from({ length: 120 }, (_, i): TrackPoint => ({
      ...toLatLon(slerp(a, b, i / 119)),
      t: 1000 + i,
      alt: 35000,
    }));
    expect(simplify(pts, 2)).toHaveLength(2);
  });
});

describe('airborneStretches', () => {
  it('breaks on the ground and at coverage gaps', () => {
    const stretches = airborneStretches([
      sample(0, 3000),
      sample(1, 4000),
      sample(2, 'ground'),
      sample(3, 5000),
      sample(4, 6000),
      sample(40, 7000),
      sample(41, 7000),
    ]);
    expect(stretches.map((x) => x.map((p) => p.t))).toEqual([
      [0, 1],
      [3, 4],
      [40, 41],
    ]);
  });
});

describe('movements', () => {
  it('finds a climb through the runway altitude near an airport, and a descent', () => {
    const { departures, arrivals } = movements(
      [sample(0, 'ground'), sample(1, 1200), sample(2, 4000), sample(30, 3000), sample(31, 900)],
      () => 'ATL',
    );
    expect(departures).toEqual([{ t: 2, airport: 'ATL' }]);
    expect(arrivals).toEqual([{ t: 31, airport: 'ATL' }]);
  });
});

describe('movements, touch-and-goes', () => {
  it('counts circuit training once', () => {
    const circuits = [
      sample(0, 'ground'),
      sample(1, 3000),
      sample(8, 1000),
      sample(9, 3000),
      sample(16, 900),
      sample(17, 3200),
    ];
    expect(movements(circuits, () => 'DAB').departures).toHaveLength(1);
  });
});

describe('shortfall', () => {
  it('accumulates the baseline minus observed from the start index, never below zero', () => {
    const base = Uint16Array.from([5, 5, 5, 5, 5]);
    const seen = Uint16Array.from([5, 0, 0, 9, 9]);
    expect(Array.from(shortfall(base, seen, 1))).toEqual([0, 5, 10, 6, 2]);
  });
});
