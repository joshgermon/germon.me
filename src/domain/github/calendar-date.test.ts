import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as CalendarDate from './calendar-date';
import { calendarDate } from './github.arbitrary';

describe('CalendarDate', () => {
  it('round-trips every real day through parse', () => {
    fc.assert(
      fc.property(calendarDate, (d) => {
        const parsed = CalendarDate.parse(d);
        expect(parsed).toEqual({ _tag: 'ok', value: d });
      }),
    );
  });

  it('rejects impossible and malformed days', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '20260101', '', 'tomorrow']) {
      expect(CalendarDate.parse(bad)._tag).toBe('err');
    }
  });

  it('addDays and daysBetween are inverse', () => {
    fc.assert(
      fc.property(calendarDate, fc.integer({ min: -2000, max: 2000 }), (d, n) => {
        expect(CalendarDate.daysBetween(d, CalendarDate.addDays(d, n))).toBe(n);
      }),
    );
  });

  it('weekday advances by one each day', () => {
    fc.assert(
      fc.property(calendarDate, (d) => {
        expect(CalendarDate.weekday(CalendarDate.addDays(d, 1))).toBe(
          (CalendarDate.weekday(d) + 1) % 7,
        );
      }),
    );
  });

  it('formats short dates and knows its weekdays', () => {
    const d = CalendarDate.parse('2026-11-08');
    if (d._tag === 'err') throw d.error;
    expect(CalendarDate.formatShort(d.value)).toBe('8 Nov');
    expect(CalendarDate.weekday(d.value)).toBe(0); // a Sunday
    expect(CalendarDate.month(d.value)).toBe('Nov');
  });
});
