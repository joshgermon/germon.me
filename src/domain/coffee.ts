/**
 * "Grab a coffee": the next two working weeks as a tiny calendar of weekday mornings.
 *
 * The fortnight starts on this week's Monday (next Monday at the weekend) in the given time
 * zone. Days before today are past, today is shown but not bookable, and every later weekday
 * morning is open. Picking an open morning drafts an email.
 *
 * Pure: the caller supplies `now`; nothing here reads the clock.
 */
import { shouldNeverHappen } from '~/lib/defects';

/** A calendar date as `YYYY-MM-DD`, in the fortnight's time zone. */
export type IsoDate = string;

/** Whether a morning can still be booked. */
export type Availability = 'past' | 'today' | 'open';

/** One weekday morning in the fortnight. */
export type CoffeeDay = {
  readonly iso: IsoDate;
  /** Day of the month, e.g. `11`. */
  readonly dayOfMonth: number;
  /** `Wed 11 Nov` — buttons and subjects. */
  readonly short: string;
  /** `Wednesday 11 November` — sentences and labels. */
  readonly long: string;
  readonly availability: Availability;
};

/** An open morning: the only kind that can be picked. */
export type OpenDay = CoffeeDay & { readonly availability: 'open' };

/** Two working weeks, Monday to Friday, ten mornings in order. */
export type Fortnight = {
  /** `November`, or `Nov – Dec` when the fortnight spans two months. */
  readonly month: string;
  readonly days: ReadonlyArray<CoffeeDay>;
  /** The first open morning — the default pick. */
  readonly firstOpen: OpenDay;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = 5;
const WEEKS = 2;

/** The calendar date `now` falls on in `timeZone`. */
function dateIn(now: Date, timeZone: string): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Noon UTC on a calendar date: safe for day arithmetic and formatting in UTC. */
const noonOf = (iso: IsoDate): Date => new Date(`${iso}T12:00:00Z`);

const format = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  date.toLocaleDateString('en-AU', { timeZone: 'UTC', ...options }).replace(',', '');

const isOpen = (day: CoffeeDay): day is OpenDay => day.availability === 'open';

/**
 * The fortnight of weekday mornings around `now`.
 *
 * @param now - The current instant.
 * @param timeZone - IANA zone the mornings are in, e.g. `Australia/Sydney`.
 * @returns Ten weekday mornings with their availability and the default pick.
 */
export function fortnight(now: Date, timeZone: string): Fortnight {
  const today = dateIn(now, timeZone);
  const t = noonOf(today);
  const dow = t.getUTCDay(); // 0 = Sunday
  const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const monday = t.valueOf() + toMonday * DAY_MS;

  const days: CoffeeDay[] = [];
  for (let week = 0; week < WEEKS; week++) {
    for (let weekday = 0; weekday < WEEKDAYS; weekday++) {
      const date = new Date(monday + (week * 7 + weekday) * DAY_MS);
      const iso = date.toISOString().slice(0, 10);
      days.push({
        iso,
        dayOfMonth: date.getUTCDate(),
        short: format(date, { weekday: 'short', day: 'numeric', month: 'short' }),
        long: format(date, { weekday: 'long', day: 'numeric', month: 'long' }),
        availability: iso < today ? 'past' : iso === today ? 'today' : 'open',
      });
    }
  }

  // The second week always lies wholly after today, so an open morning always exists.
  const firstOpen = days.find(isOpen) ?? shouldNeverHappen('A fortnight always has open mornings');
  const first = format(new Date(monday), { month: 'long' });
  const last = format(new Date(monday + (7 + WEEKDAYS - 1) * DAY_MS), { month: 'long' });
  return {
    month: first === last ? first : `${first.slice(0, 3)} – ${last.slice(0, 3)}`,
    days,
    firstOpen,
  };
}

/**
 * Pick a morning by date, if it is open in this fortnight.
 *
 * @param f - The fortnight.
 * @param iso - The date to pick.
 * @returns The open morning, or `undefined` when the date is past, today, or not in the fortnight.
 */
export function pick(f: Fortnight, iso: IsoDate): OpenDay | undefined {
  return f.days.filter(isOpen).find((d) => d.iso === iso);
}

/**
 * The email that asks for a coffee on `day`.
 *
 * @param day - The picked morning.
 * @returns Subject and body for the draft.
 */
export function invitation(day: OpenDay): { readonly subject: string; readonly body: string } {
  return {
    subject: `Coffee? ${day.short}`,
    body: `Hi Josh,\n\nFree for a coffee on the morning of ${day.long}?\n\n`,
  };
}

/**
 * A `mailto:` link drafting the invitation — the no-JavaScript path for the Book button.
 *
 * @param email - Josh's address.
 * @param day - The picked morning.
 * @returns The `mailto:` URL.
 */
export function mailto(email: string, day: OpenDay): string {
  const { subject, body } = invitation(day);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
