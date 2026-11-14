import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { LIFT, STOP, at, formatClockShort, formatDuration, phaseAt } from './clock';

describe('clock', () => {
  it('pins the reported times', () => {
    expect(formatClockShort(STOP)).toBe('3:54 PM');
    expect(formatClockShort(LIFT)).toBe('8:16 PM');
    expect(formatDuration(LIFT - STOP)).toBe('4h 22m');
  });

  it('wraps past midnight into Saturday morning', () => {
    expect(formatClockShort(at(24, 5))).toBe('12:05 AM');
    expect(formatClockShort(at(12))).toBe('12:00 PM');
  });

  it('orders the phases', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1800 }), (m) => {
        const phase = phaseAt(m);
        expect(phase === 'before').toBe(m < STOP);
        expect(phase === 'reopened').toBe(m >= LIFT);
      }),
    );
  });
});
