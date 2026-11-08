/**
 * Outbound adapter: the contribution calendar from the fragment GitHub's profile page loads
 * its graph from (`github.com/users/<login>/contributions`). It needs no token and counts
 * exactly what the profile shows, including private contributions when the account's
 * "Include private contributions on my profile" setting is on — which the GraphQL API only
 * does for a token that can read those private repositories.
 *
 * The fragment is undocumented HTML. Each day is a cell with `data-date`, `data-level` and an
 * id; a `<tool-tip for="<id>">` beside it says "N contributions on …". If GitHub changes the
 * markup, parsing fails as `GitHubResponseInvalid` and the cards keep the build snapshot.
 */
import type { ContributionsSource } from '~/application/github-activity';
import { GitHubResponseInvalid, type GitHubSourceError } from '~/application/github-errors';
import * as CalendarDate from '~/domain/github/calendar-date';
import * as Contributions from '~/domain/github/contributions';
import { err, ok, type Result } from '~/lib/result';
import { requestPage, type GitHubConnection } from './github-http';

/** Attribute `name` of an opening tag, e.g. `attr('<td data-level="2">', 'data-level')`. */
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

const LEVELS: Record<string, Contributions.Level> = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4 };

/** "No contributions on …" → 0; "1,234 contributions on …" → 1234. */
const countFrom = (label: string): number | undefined => {
  const match = /^\s*(No|[\d,]+) contributions? on /.exec(label);
  if (!match?.[1]) return undefined;
  return match[1] === 'No' ? 0 : Number(match[1].replaceAll(',', ''));
};

const invalid = (detail: string): Result<never, GitHubSourceError> =>
  err(new GitHubResponseInvalid('contributions', detail));

/**
 * Parse the fragment's days, oldest first.
 *
 * @param html - The fragment's markup.
 * @returns The days, or why the markup isn't the calendar we know.
 */
function parseDays(html: string): Result<ReadonlyArray<Contributions.Day>, GitHubSourceError> {
  const counts = new Map<string, number>();
  for (const [, tag = '', label = ''] of html.matchAll(/(<tool-tip\b[^>]*>)([^<]*)<\/tool-tip>/g)) {
    const target = attr(tag, 'for');
    const count = countFrom(label);
    if (target !== undefined && count !== undefined) counts.set(target, count);
  }

  const days: Contributions.Day[] = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\sdata-date="[^"]*"[^>]*>/g)) {
    const id = attr(tag, 'id') ?? '';
    const date = CalendarDate.parse(attr(tag, 'data-date') ?? '');
    const level = LEVELS[attr(tag, 'data-level') ?? ''];
    const count = counts.get(id);
    if (date._tag === 'err' || level === undefined || count === undefined) {
      return invalid(`unreadable day ${id.slice(0, 40)}`);
    }
    days.push({ date: date.value, count, level });
  }
  if (days.length === 0) return invalid('no calendar days in the page');
  // The grid is drawn row by row (every Sunday, then every Monday…); the calendar is by date.
  return ok(days.toSorted((a, b) => CalendarDate.daysBetween(b.date, a.date)));
}

/** Reads a user's last year of contributions from their public profile. */
export class ProfileContributions implements ContributionsSource {
  readonly #conn: GitHubConnection;
  readonly #user: string;

  /**
   * @param conn - How to reach GitHub (no token needed or sent).
   * @param user - The account whose calendar to read.
   */
  constructor(conn: GitHubConnection, user: string) {
    this.#conn = conn;
    this.#user = user;
  }

  /**
   * Fetch the last year of contributions.
   *
   * @returns The calendar, or a classified GitHub failure.
   */
  async fetchCalendar(): Promise<Result<Contributions.Contributions, GitHubSourceError>> {
    const page = await requestPage(this.#conn, {
      source: 'contributions',
      url: `https://github.com/users/${encodeURIComponent(this.#user)}/contributions`,
      method: 'GET',
    });
    if (page._tag === 'err') return page;

    const days = parseDays(page.value);
    if (days._tag === 'err') return days;
    const calendar = Contributions.make(days.value);
    return calendar._tag === 'ok' ? ok(calendar.value) : invalid(calendar.error.message);
  }
}
