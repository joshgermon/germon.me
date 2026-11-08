import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  clampOrbit,
  closeUpOrbit,
  defaultCameraLimits,
  easeInOutCubic,
  orbitRange,
  swayAzimuth,
  swayCenter,
  type CameraLimits,
  type Orbit,
} from './orbit';

const DEG = Math.PI / 180;
const EPS = 1e-9;

/** The iso view the room was designed for: 45° azimuth, 32° up. */
const home: Orbit = { theta: 45 * DEG, phi: (90 - 32) * DEG };

const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
const polar = fc.double({ min: 0.01, max: Math.PI - 0.01, noNaN: true });
const orbit = fc.record({ theta: angle, phi: polar });
const limits: fc.Arbitrary<CameraLimits> = fc.record({
  azimuthOffsetDeg: fc.tuple(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -90, max: 90, noNaN: true }),
  ),
  elevationDeg: fc.tuple(
    fc.double({ min: 1, max: 89, noNaN: true }),
    fc.double({ min: 1, max: 89, noNaN: true }),
  ),
});
const slack = fc.double({ min: 0, max: Math.PI / 2, noNaN: true });

describe('orbitRange', () => {
  it('keeps the export envelope: ±30° around home, 12–62° elevation', () => {
    const r = orbitRange(home, defaultCameraLimits, Math.PI);
    expect(r.minTheta).toBeCloseTo(15 * DEG);
    expect(r.maxTheta).toBeCloseTo(75 * DEG);
    expect(r.minPhi).toBeCloseTo(28 * DEG);
    expect(r.maxPhi).toBeCloseTo(78 * DEG);
  });

  it('narrows the polar range to the slack around home', () => {
    const r = orbitRange(home, defaultCameraLimits, 7 * DEG);
    expect(r.minPhi).toBeCloseTo(home.phi - 7 * DEG);
    expect(r.maxPhi).toBeCloseTo(home.phi + 7 * DEG);
  });

  it('is never inverted and never leaves the elevation envelope', () => {
    fc.assert(
      fc.property(orbit, limits, slack, (h, l, s) => {
        const r = orbitRange(h, l, s);
        const [e0, e1] = [Math.min(...l.elevationDeg), Math.max(...l.elevationDeg)];
        expect(r.minTheta).toBeLessThanOrEqual(r.maxTheta);
        expect(r.minPhi).toBeLessThanOrEqual(r.maxPhi + EPS);
        expect(r.minPhi).toBeGreaterThanOrEqual((90 - e1) * DEG - EPS);
        expect(r.maxPhi).toBeLessThanOrEqual((90 - e0) * DEG + EPS);
      }),
    );
  });
});

describe('clampOrbit', () => {
  it('always lands inside the range, and leaves inside points alone', () => {
    fc.assert(
      fc.property(orbit, orbit, limits, slack, (o, h, l, s) => {
        const r = orbitRange(h, l, s);
        const c = clampOrbit(o, r);
        expect(c.theta).toBeGreaterThanOrEqual(r.minTheta - EPS);
        expect(c.theta).toBeLessThanOrEqual(r.maxTheta + EPS);
        expect(c.phi).toBeGreaterThanOrEqual(r.minPhi - EPS);
        expect(c.phi).toBeLessThanOrEqual(r.maxPhi + EPS);
        expect(clampOrbit(c, r)).toEqual(c);
      }),
    );
  });
});

describe('closeUpOrbit', () => {
  it('stays within the kept slack of home', () => {
    const keep = { theta: 8 * DEG, phi: 3 * DEG };
    const range = orbitRange(home, defaultCameraLimits, 7 * DEG);
    fc.assert(
      fc.property(orbit, (o) => {
        const c = closeUpOrbit(o, home, keep, range);
        expect(Math.abs(c.theta - home.theta)).toBeLessThanOrEqual(keep.theta + EPS);
        expect(Math.abs(c.phi - home.phi)).toBeLessThanOrEqual(keep.phi + EPS);
      }),
    );
  });
});

describe('sway', () => {
  it('starts at its centre and never exceeds the amplitude', () => {
    fc.assert(
      fc.property(angle, fc.double({ min: 0, max: 1000, noNaN: true }), (c, t) => {
        expect(swayAzimuth(c, 5 * DEG, 10, 0)).toBeCloseTo(c, 12);
        expect(Math.abs(swayAzimuth(c, 5 * DEG, 10, t) - c)).toBeLessThanOrEqual(5 * DEG + EPS);
      }),
    );
  });

  it('centres so the whole sway stays inside the range', () => {
    const range = orbitRange(home, defaultCameraLimits, 7 * DEG);
    fc.assert(
      fc.property(angle, (theta) => {
        const c = swayCenter(theta, 5 * DEG, range);
        expect(c - 5 * DEG).toBeGreaterThanOrEqual(range.minTheta - EPS);
        expect(c + 5 * DEG).toBeLessThanOrEqual(range.maxTheta + EPS);
      }),
    );
  });
});

describe('easeInOutCubic', () => {
  it('runs 0→1 monotonically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(easeInOutCubic(lo)).toBeLessThanOrEqual(easeInOutCubic(hi) + EPS);
        },
      ),
    );
  });
});
