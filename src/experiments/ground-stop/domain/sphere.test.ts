import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { angleBetween, latticePoint, slerp, toLatLon, toVec3 } from './sphere';

const latLon = fc.record({
  lat: fc.double({ min: -89, max: 89, noNaN: true }),
  lon: fc.double({ min: -179, max: 179, noNaN: true }),
});
const length = (v: { x: number; y: number; z: number }): number => Math.hypot(v.x, v.y, v.z);

describe('sphere', () => {
  it('round-trips latitude and longitude', () => {
    fc.assert(
      fc.property(latLon, (p) => {
        const back = toLatLon(toVec3(p));
        expect(back.lat).toBeCloseTo(p.lat, 9);
        expect(back.lon).toBeCloseTo(p.lon, 9);
      }),
    );
  });

  it('slerp stays on the sphere and hits both ends', () => {
    fc.assert(
      fc.property(latLon, latLon, fc.double({ min: 0, max: 1, noNaN: true }), (a, b, t) => {
        const va = toVec3(a);
        const vb = toVec3(b);
        expect(length(slerp(va, vb, t))).toBeCloseTo(1, 9);
        expect(angleBetween(slerp(va, vb, 0), va)).toBeLessThan(1e-6);
        if (angleBetween(va, vb) < Math.PI - 1e-3)
          expect(angleBetween(slerp(va, vb, 1), vb)).toBeLessThan(1e-6);
      }),
    );
  });

  it('puts every lattice point on the unit sphere', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200_000 }), fc.nat(), (n, i) => {
        expect(length(latticePoint(i % n, n))).toBeCloseTo(1, 9);
      }),
    );
  });
});
