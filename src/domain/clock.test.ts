import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { msUntilNextMinute } from './clock';

describe('msUntilNextMinute', () => {
  it('waits a whole minute when exactly on the minute', () => {
    expect(msUntilNextMinute(new Date('2026-11-08T03:44:00Z'))).toBe(60_000);
  });

  it('lands exactly on the next minute boundary', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4e12 }), (t) => {
        const wait = msUntilNextMinute(new Date(t));
        expect(wait).toBeGreaterThan(0);
        expect(wait).toBeLessThanOrEqual(60_000);
        expect((t + wait) % 60_000).toBe(0);
      }),
    );
  });
});
