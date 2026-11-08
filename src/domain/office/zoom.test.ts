import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MAX_ZOOM_RATIO, nudgeZoom, wheelFactor, zoomProgress } from './zoom';

const zoom = fc.double({ min: 0.2, max: 8, noNaN: true });
const factor = fc.double({ min: 0.05, max: 20, noNaN: true });

describe('nudgeZoom', () => {
  it('never leaves [base, base × ratio]', () => {
    fc.assert(
      fc.property(zoom, zoom, factor, (current, base, f) => {
        const next = nudgeZoom(current, base, f);
        expect(next).toBeGreaterThanOrEqual(base);
        expect(next).toBeLessThanOrEqual(base * MAX_ZOOM_RATIO * (1 + 1e-12));
      }),
    );
  });

  it('applies the factor when there is room', () => {
    expect(nudgeZoom(1, 1, 1.25)).toBeCloseTo(1.25);
    expect(nudgeZoom(1.5, 1, 0.9)).toBeCloseTo(1.35);
  });

  it('ignores nonsense factors', () => {
    expect(nudgeZoom(1.2, 1, Number.NaN)).toBe(1.2);
    expect(nudgeZoom(1.2, 1, -3)).toBe(1.2);
  });
});

describe('wheelFactor', () => {
  it('zooms in for negative deltas and composes multiplicatively', () => {
    expect(wheelFactor(-10)).toBeGreaterThan(1);
    expect(wheelFactor(10)).toBeLessThan(1);
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: -200, max: 200, noNaN: true }),
        (a, b) => {
          expect(wheelFactor(a) * wheelFactor(b)).toBeCloseTo(wheelFactor(a + b), 9);
        },
      ),
    );
  });
});

describe('zoomProgress', () => {
  it('is 0 at the settled view and 1 at the ceiling', () => {
    expect(zoomProgress(2, 2)).toBe(0);
    expect(zoomProgress(2 * MAX_ZOOM_RATIO, 2)).toBeCloseTo(1);
  });
});
