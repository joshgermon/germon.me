/**
 * A year of GitHub contributions: one count per day, contiguous and in order, plus the
 * projections the widgets show — the heatmap's week columns and month labels, totals, the
 * current streak and the weekly cumulative series behind the "stock" chart.
 *
 * Construct only through `make`, which enforces the invariants every projection relies on.
 */
import * as CalendarDate from './calendar-date';
import { err, ok, type Result } from '~/lib/result';

type CalendarDate = CalendarDate.CalendarDate;

declare const brand: unique symbol;

/** GitHub's five-step intensity: 0 is no contributions, 4 is the busiest quartile. */
export type Level = 0 | 1 | 2 | 3 | 4;

/** One day of the calendar. */
export type Day = {
  readonly date: CalendarDate;
  /** Contributions that day; a non-negative integer. */
  readonly count: number;
  readonly level: Level;
};

/**
 * A non-empty run of consecutive days, oldest first. Opaque: build it with `make`.
 */
export type Contributions = {
  readonly days: ReadonlyArray<Day>;
  readonly [brand]: 'Contributions';
};

/** A heatmap cell: a real day, or padding before the first / after the last day. */
export type Cell = ({ readonly _tag: 'Day' } & Day) | { readonly _tag: 'Pad' };

/** One heatmap column: Sunday → Saturday. */
export type Week = {
  /** The first real day in the column (the calendar can start or end mid-week). */
  readonly from: CalendarDate;
  readonly cells: ReadonlyArray<Cell>;
  /** Contributions that week. */
  readonly total: number;
};

/** A point on the cumulative chart: contributions so far by the end of a week. */
export type CumulativePoint = {
  readonly from: CalendarDate;
  readonly total: number;
};

/** The headline numbers. */
export type Stats = {
  /** Contributions across the whole calendar. */
  readonly total: number;
  /** Contributions in the last 30 days. */
  readonly last30: number;
  /** Consecutive active days up to today (or yesterday — today may not have started). */
  readonly streak: number;
  /** The most contributions in a single week. */
  readonly busiestWeek: number;
};

/** Why a set of days is not a valid calendar. */
export class InvalidContributions extends Error {
  readonly _tag = 'InvalidContributions' as const;

  /**
   * @param reason - Which invariant failed.
   * @param at - The offending day, when there is one.
   */
  constructor(
    readonly reason: 'empty' | 'not-consecutive' | 'bad-count',
    readonly at?: string,
  ) {
    super(`Invalid contribution calendar: ${reason}${at ? ` at ${at}` : ''}`);
  }
}

/**
 * Build a calendar from days, oldest first.
 *
 * @param input - The days, which must be non-empty, consecutive and have non-negative integer counts.
 * @returns The calendar, or `InvalidContributions` naming the broken invariant.
 */
export function make(input: ReadonlyArray<Day>): Result<Contributions, InvalidContributions> {
  if (input.length === 0) return err(new InvalidContributions('empty'));
  let previous: Day | undefined;
  for (const day of input) {
    if (!Number.isInteger(day.count) || day.count < 0) {
      return err(new InvalidContributions('bad-count', day.date));
    }
    if (previous && CalendarDate.daysBetween(previous.date, day.date) !== 1) {
      return err(new InvalidContributions('not-consecutive', day.date));
    }
    previous = day;
  }
  // SAFETY: TypeScript cannot express the brand; the loop above checked every invariant.
  return ok({ days: input } as Contributions);
}

/**
 * Map GitHub's level names to steps. Unknown names are not levels.
 *
 * @param name - e.g. `FIRST_QUARTILE`.
 * @returns The level, or `undefined` for an unknown name.
 */
export function levelFromName(name: string): Level | undefined {
  switch (name) {
    case 'NONE':
      return 0;
    case 'FIRST_QUARTILE':
      return 1;
    case 'SECOND_QUARTILE':
      return 2;
    case 'THIRD_QUARTILE':
      return 3;
    case 'FOURTH_QUARTILE':
      return 4;
    default:
      return undefined;
  }
}

/**
 * Every day, oldest first.
 *
 * @param c - The calendar.
 * @returns Its days.
 */
export function days(c: Contributions): ReadonlyArray<Day> {
  return c.days;
}

const sum = (xs: ReadonlyArray<number>): number => xs.reduce((a, b) => a + b, 0);

/**
 * Total contributions across the calendar.
 *
 * @param c - The calendar.
 * @returns The sum of every day's count.
 */
export function total(c: Contributions): number {
  return sum(c.days.map((d) => d.count));
}

/**
 * Contributions over the most recent `n` days of the calendar.
 *
 * @param c - The calendar.
 * @param n - How many trailing days to sum.
 * @returns The sum.
 */
export function recent(c: Contributions, n: number): number {
  return n <= 0 ? 0 : sum(c.days.slice(-n).map((d) => d.count));
}

/**
 * The run of consecutive active days ending on the calendar's last day. An empty last day
 * (today, not yet coded) does not break the streak.
 *
 * @param c - The calendar.
 * @returns The streak length in days.
 */
export function streak(c: Contributions): number {
  let run = 0;
  for (let i = c.days.length - 1; i >= 0; i--) {
    const count = c.days[i]?.count ?? 0;
    if (count > 0) run++;
    else if (i < c.days.length - 1) break;
  }
  return run;
}

/**
 * The heatmap columns: Sunday → Saturday, padded at both ends so every column has 7 cells.
 *
 * @param c - The calendar.
 * @returns Week columns, oldest first.
 */
export function weeks(c: Contributions): ReadonlyArray<Week> {
  const first = c.days[0];
  if (!first) return [];
  const pad: Cell = { _tag: 'Pad' };
  const cells: Cell[] = [
    ...Array.from({ length: CalendarDate.weekday(first.date) }, () => pad),
    ...c.days.map((d): Cell => ({ _tag: 'Day', ...d })),
  ];
  while (cells.length % 7 !== 0) cells.push(pad);

  const out: Week[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const column = cells.slice(i, i + 7);
    const real = column.flatMap((cell) => (cell._tag === 'Day' ? [cell] : []));
    const start = real[0];
    // Every column holds at least one real day: padding never fills a whole week.
    if (!start) continue;
    out.push({ from: start.date, cells: column, total: sum(real.map((d) => d.count)) });
  }
  return out;
}

/**
 * A label for each week column: the month's name where a new month starts, else `''`.
 * The first column is always labelled.
 *
 * @param ws - The week columns from `weeks`.
 * @returns One label per column.
 */
export function monthLabels(ws: ReadonlyArray<Week>): ReadonlyArray<string> {
  return ws.map((w, i) => {
    const prev = ws[i - 1];
    const m = CalendarDate.month(w.from);
    return !prev || CalendarDate.month(prev.from) !== m ? m : '';
  });
}

/**
 * Running total of contributions, one point per week — the line on the commits chart.
 *
 * @param ws - The week columns from `weeks`.
 * @returns Cumulative totals, oldest first; the last point equals `total`.
 */
export function cumulative(ws: ReadonlyArray<Week>): ReadonlyArray<CumulativePoint> {
  let running = 0;
  return ws.map((w) => {
    running += w.total;
    return { from: w.from, total: running };
  });
}

/**
 * The headline numbers for widgets and the palette.
 *
 * @param c - The calendar.
 * @returns Total, last 30 days, streak and busiest week.
 */
export function stats(c: Contributions): Stats {
  return {
    total: total(c),
    last30: recent(c, 30),
    streak: streak(c),
    busiestWeek: Math.max(0, ...weeks(c).map((w) => w.total)),
  };
}
