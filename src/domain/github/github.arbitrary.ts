/**
 * fast-check arbitraries for the GitHub domain. Values are built through the modules' own
 * constructors, so tests never bypass an invariant.
 */
import * as fc from 'fast-check';

import * as CalendarDate from './calendar-date';
import * as Contributions from './contributions';
import type { Listing } from './repo';

const DAY_MS = 86_400_000;
const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2099, 11, 31);

/** Any calendar date between 2000 and 2099. */
export const calendarDate: fc.Arbitrary<CalendarDate.CalendarDate> = fc
  .integer({ min: MIN / DAY_MS, max: MAX / DAY_MS })
  .map((day) => CalendarDate.ofInstant(new Date(day * DAY_MS)));

/** A contribution level. */
export const level: fc.Arbitrary<Contributions.Level> = fc.constantFrom(0, 1, 2, 3, 4);

/** A valid calendar of 1–400 consecutive days. */
export const contributions: fc.Arbitrary<Contributions.Contributions> = fc
  .tuple(
    calendarDate,
    fc.array(fc.tuple(fc.nat({ max: 60 }), level), { minLength: 1, maxLength: 400 }),
  )
  .map(([start, raw]) => {
    const days = raw.map(([count, lvl], i) => ({
      date: CalendarDate.addDays(start, i),
      count,
      level: lvl,
    }));
    const made = Contributions.make(days);
    if (made._tag === 'err') throw made.error;
    return made.value;
  });

/** A repository listing with a plausible mix of forks, archived repos and missing fields. */
export const listing = (owner: string): fc.Arbitrary<Listing> =>
  fc.record({
    name: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    owner: fc.constantFrom(owner, owner.toUpperCase(), 'someone-else'),
    fork: fc.boolean(),
    archived: fc.boolean(),
    description: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
    language: fc.option(fc.constantFrom('Go', 'Rust', 'C', 'TypeScript'), { nil: null }),
    url: fc.constant('https://github.com/x/y'),
    stars: fc.nat({ max: 500 }),
    pushedAt: fc.date({ min: new Date(MIN), max: new Date(MAX), noInvalidDate: true }),
  });
