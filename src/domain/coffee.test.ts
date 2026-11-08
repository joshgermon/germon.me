import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fortnight, invitation, mailto, pick } from './coffee';

const SYDNEY = 'Australia/Sydney';
const instant = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2100-01-01T00:00:00Z'),
  noInvalidDate: true,
});
const zone = fc.constantFrom(SYDNEY, 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati');

describe('fortnight', () => {
  it('is ten weekday mornings, Monday to Friday, two weeks in a row', () => {
    fc.assert(
      fc.property(instant, zone, (now, tz) => {
        const { days } = fortnight(now, tz);
        expect(days).toHaveLength(10);
        days.forEach((d, i) => {
          const date = new Date(`${d.iso}T12:00:00Z`);
          expect(date.getUTCDay()).toBe((i % 5) + 1);
          expect(d.dayOfMonth).toBe(date.getUTCDate());
        });
        const first = days[0];
        const sixth = days[5];
        expect(first && sixth && Date.parse(sixth.iso) - Date.parse(first.iso)).toBe(
          7 * 86_400_000,
        );
      }),
    );
  });

  it('orders availability: past, then at most one today, then open', () => {
    fc.assert(
      fc.property(instant, zone, (now, tz) => {
        const states = fortnight(now, tz)
          .days.map((d) => d.availability)
          .join(' ');
        expect(states).toMatch(/^(past )*(today )?(open ?)+$/);
      }),
    );
  });

  it('always offers the second week, and defaults to the first open morning', () => {
    fc.assert(
      fc.property(instant, zone, (now, tz) => {
        const f = fortnight(now, tz);
        expect(f.days.slice(5).every((d) => d.availability === 'open')).toBe(true);
        expect(f.firstOpen).toEqual(f.days.find((d) => d.availability === 'open'));
      }),
    );
  });

  it('uses the date in Sydney, not UTC', () => {
    // 14:00 UTC on Sunday 8 Nov is 01:00 on Monday 9 Nov in Sydney (AEDT).
    const f = fortnight(new Date('2026-11-08T14:00:00Z'), SYDNEY);
    expect(f.days[0]).toMatchObject({ iso: '2026-11-09', availability: 'today' });
    expect(f.firstOpen).toMatchObject({ iso: '2026-11-10', short: 'Tue 10 Nov' });

    // The same instant in UTC is still Sunday: the fortnight starts tomorrow and it is all open.
    const utc = fortnight(new Date('2026-11-08T14:00:00Z'), 'UTC');
    expect(utc.days.every((d) => d.availability === 'open')).toBe(true);
    expect(utc.firstOpen.iso).toBe('2026-11-09');
  });

  it('names the month, or both months when the fortnight spans two', () => {
    expect(fortnight(new Date('2026-11-04T00:00:00Z'), SYDNEY).month).toBe('November');
    expect(fortnight(new Date('2026-11-25T00:00:00Z'), SYDNEY).month).toBe('Nov – Dec');
  });

  it('formats short and long labels', () => {
    const day = fortnight(new Date('2026-11-08T14:00:00Z'), SYDNEY).days[2];
    expect(day).toMatchObject({ short: 'Wed 11 Nov', long: 'Wednesday 11 November' });
  });
});

describe('pick', () => {
  it('only accepts open mornings in the fortnight', () => {
    fc.assert(
      fc.property(instant, zone, (now, tz) => {
        const f = fortnight(now, tz);
        for (const d of f.days) {
          expect(pick(f, d.iso)?.iso).toBe(d.availability === 'open' ? d.iso : undefined);
        }
        expect(pick(f, '1999-01-01')).toBeUndefined();
      }),
    );
  });
});

describe('invitation', () => {
  it('drafts the subject and body, and round-trips through mailto', () => {
    const f = fortnight(new Date('2026-11-08T14:00:00Z'), SYDNEY);
    const day = pick(f, '2026-11-11');
    expect(day).toBeDefined();
    if (!day) return;
    expect(invitation(day).subject).toBe('Coffee? Wed 11 Nov');
    const url = new URL(mailto('josh@example.com', day));
    expect(url.pathname).toBe('josh@example.com');
    expect(url.searchParams.get('subject')).toBe('Coffee? Wed 11 Nov');
    expect(url.searchParams.get('body')).toContain('Wednesday 11 November');
  });
});
