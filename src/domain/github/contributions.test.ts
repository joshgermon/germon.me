import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as CalendarDate from './calendar-date';
import * as Contributions from './contributions';
import { calendarDate, contributions, level } from './github.arbitrary';

const date = (s: string): CalendarDate.CalendarDate => {
  const parsed = CalendarDate.parse(s);
  if (parsed._tag === 'err') throw parsed.error;
  return parsed.value;
};

/** Build a calendar from counts starting on `start`, failing the test if it's invalid. */
const fromCounts = (start: string, counts: ReadonlyArray<number>): Contributions.Contributions => {
  const made = Contributions.make(
    counts.map((count, i) => ({
      date: CalendarDate.addDays(date(start), i),
      count,
      level: count > 0 ? 1 : 0,
    })),
  );
  if (made._tag === 'err') throw made.error;
  return made.value;
};

describe('Contributions.make', () => {
  it('rejects an empty calendar', () => {
    expect(Contributions.make([])).toMatchObject({ _tag: 'err', error: { reason: 'empty' } });
  });

  it('rejects gaps, repeats and reordering', () => {
    fc.assert(
      fc.property(
        calendarDate,
        fc.integer({ min: -5, max: 5 }).filter((n) => n !== 1),
        level,
        (d, step, l) => {
          const result = Contributions.make([
            { date: d, count: 1, level: l },
            { date: CalendarDate.addDays(d, step), count: 1, level: l },
          ]);
          expect(result).toMatchObject({ _tag: 'err', error: { reason: 'not-consecutive' } });
        },
      ),
    );
  });

  it('rejects negative or fractional counts', () => {
    for (const count of [-1, 1.5, Number.NaN]) {
      expect(Contributions.make([{ date: date('2026-01-01'), count, level: 0 }])).toMatchObject({
        _tag: 'err',
        error: { reason: 'bad-count' },
      });
    }
  });
});

describe('Contributions.weeks', () => {
  it('lays every day out exactly once, in order, in 7-cell Sunday-first columns', () => {
    fc.assert(
      fc.property(contributions, (c) => {
        const ws = Contributions.weeks(c);
        expect(ws.every((w) => w.cells.length === 7)).toBe(true);
        const laidOut = ws.flatMap((w) =>
          w.cells.flatMap((cell) => (cell._tag === 'Day' ? [cell.date] : [])),
        );
        expect(laidOut).toEqual(Contributions.days(c).map((d) => d.date));
        for (const w of ws) {
          w.cells.forEach((cell, row) => {
            if (cell._tag === 'Day') expect(CalendarDate.weekday(cell.date)).toBe(row);
          });
        }
      }),
    );
  });

  it('labels the first column and every month change', () => {
    fc.assert(
      fc.property(contributions, (c) => {
        const ws = Contributions.weeks(c);
        const labels = Contributions.monthLabels(ws);
        expect(labels).toHaveLength(ws.length);
        expect(labels[0]).toBe(ws[0] && CalendarDate.month(ws[0].from));
        labels.forEach((label, i) => {
          const prev = ws[i - 1];
          const cur = ws[i];
          if (i > 0 && prev && cur) {
            expect(label !== '').toBe(
              CalendarDate.month(prev.from) !== CalendarDate.month(cur.from),
            );
          }
        });
      }),
    );
  });
});

describe('Contributions stats', () => {
  it('the cumulative series is non-decreasing and ends at the total', () => {
    fc.assert(
      fc.property(contributions, (c) => {
        const series = Contributions.cumulative(Contributions.weeks(c));
        series.forEach((p, i) => {
          const prev = series[i - 1];
          if (prev) expect(p.total).toBeGreaterThanOrEqual(prev.total);
        });
        expect(series.at(-1)?.total).toBe(Contributions.total(c));
      }),
    );
  });

  it('bounds last-30, streak and busiest week', () => {
    fc.assert(
      fc.property(contributions, (c) => {
        const s = Contributions.stats(c);
        expect(s.last30).toBeLessThanOrEqual(s.total);
        expect(s.busiestWeek).toBeLessThanOrEqual(s.total);
        expect(s.streak).toBeLessThanOrEqual(
          Math.min(Contributions.days(c).length, Math.max(s.total, 0)),
        );
      }),
    );
  });

  it('counts the streak back from today, forgiving an empty today', () => {
    expect(Contributions.streak(fromCounts('2026-11-01', [1, 0, 2, 3, 1]))).toBe(3);
    expect(Contributions.streak(fromCounts('2026-11-01', [1, 0, 2, 3, 0]))).toBe(2);
    expect(Contributions.streak(fromCounts('2026-11-01', [1, 2, 0, 0]))).toBe(0);
    expect(Contributions.streak(fromCounts('2026-11-01', [0]))).toBe(0);
  });

  it('sums the trailing window', () => {
    const c = fromCounts(
      '2026-01-01',
      Array.from({ length: 40 }, () => 1),
    );
    expect(Contributions.recent(c, 30)).toBe(30);
    expect(Contributions.recent(c, 0)).toBe(0);
    expect(Contributions.total(c)).toBe(40);
  });

  it('maps GitHub level names', () => {
    expect(Contributions.levelFromName('NONE')).toBe(0);
    expect(Contributions.levelFromName('FOURTH_QUARTILE')).toBe(4);
    expect(Contributions.levelFromName('FIFTH_QUARTILE')).toBeUndefined();
  });
});
