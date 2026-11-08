/**
 * A calendar day (`YYYY-MM-DD`) with no time or zone — what GitHub's contribution calendar
 * counts in. Arithmetic runs in UTC so results never depend on the machine's time zone.
 */
import { shouldNeverHappen } from '~/lib/defects';
import { err, ok, type Result } from '~/lib/result';

declare const brand: unique symbol;

/** A parsed `YYYY-MM-DD` date that names a real calendar day. */
export type CalendarDate = string & { readonly [brand]: 'CalendarDate' };

/** The input was not a real `YYYY-MM-DD` day. */
export class InvalidCalendarDate extends Error {
  readonly _tag = 'InvalidCalendarDate' as const;

  /** @param input - The rejected input. */
  constructor(readonly input: string) {
    super(`Not a calendar date: ${JSON.stringify(input.slice(0, 32))}`);
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A short English month name, as GitHub labels its calendar. */
export type MonthName = (typeof MONTHS)[number];

const DAY_MS = 86_400_000;

const toUtc = (date: CalendarDate): number => Date.parse(`${date}T00:00:00Z`);

const fromUtc = (ms: number): CalendarDate =>
  // SAFETY: `toISOString` always yields `YYYY-MM-DDT…`; its date part is a real calendar day.
  new Date(ms).toISOString().slice(0, 10) as CalendarDate;

/**
 * Parse a `YYYY-MM-DD` string, rejecting impossible days such as `2026-02-30`.
 *
 * @param input - The untrusted string.
 * @returns The calendar date, or `InvalidCalendarDate`.
 */
export function parse(input: string): Result<CalendarDate, InvalidCalendarDate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return err(new InvalidCalendarDate(input));
  const ms = Date.parse(`${input}T00:00:00Z`);
  if (Number.isNaN(ms)) return err(new InvalidCalendarDate(input));
  const roundTrip = fromUtc(ms);
  return roundTrip === input ? ok(roundTrip) : err(new InvalidCalendarDate(input));
}

/**
 * The calendar day an instant falls on, in UTC.
 *
 * @param instant - Any instant.
 * @returns Its UTC calendar day.
 */
export function ofInstant(instant: Date): CalendarDate {
  return fromUtc(instant.getTime());
}

/**
 * Move a date by whole days.
 *
 * @param date - The starting day.
 * @param days - Days to add (negative to go back).
 * @returns The resulting day.
 */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/**
 * Whole days from `from` to `to` (negative when `to` is earlier).
 *
 * @param from - The earlier day.
 * @param to - The later day.
 * @returns The signed day difference.
 */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/**
 * Day of the week, Sunday = 0 … Saturday = 6 (GitHub's calendar rows).
 *
 * @param date - The day.
 * @returns Its weekday index.
 */
export function weekday(date: CalendarDate): number {
  return new Date(toUtc(date)).getUTCDay();
}

/**
 * The month a day falls in.
 *
 * @param date - The day.
 * @returns Its short English month name.
 */
export function month(date: CalendarDate): MonthName {
  // getUTCMonth is always 0–11, so the lookup cannot miss.
  return (
    MONTHS[new Date(toUtc(date)).getUTCMonth()] ?? shouldNeverHappen('Month index out of range')
  );
}

/**
 * Format as "3 Nov", the way the site talks about recent days.
 *
 * @param date - The day.
 * @returns Day of month and short month.
 */
export function formatShort(date: CalendarDate): string {
  return `${new Date(toUtc(date)).getUTCDate()} ${month(date)}`;
}
