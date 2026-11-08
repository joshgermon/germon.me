/**
 * Outbound adapter: the contribution calendar from GitHub's GraphQL API
 * (`user.contributionsCollection.contributionCalendar`). GraphQL always needs a token, so
 * without one this answers `GitHubUnauthorized('missing-token')` without calling GitHub.
 */
import { z } from 'zod';

import type { ContributionsSource } from '~/application/github-activity';
import {
  GitHubRateLimited,
  GitHubResponseInvalid,
  GitHubUnauthorized,
  type GitHubSourceError,
} from '~/application/github-errors';
import * as CalendarDate from '~/domain/github/calendar-date';
import * as Contributions from '~/domain/github/contributions';
import { err, ok, type Result } from '~/lib/result';
import { requestJson, type GitHubConnection } from './github-http';

const QUERY = /* GraphQL */ `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

const CalendarDay = z.object({
  date: z.string(),
  contributionCount: z.number().int().nonnegative(),
  contributionLevel: z.string(),
});

/** GitHub's GraphQL envelope for the query above. `data` is null when the query failed. */
const CalendarResponse = z.object({
  data: z
    .object({
      user: z
        .object({
          contributionsCollection: z.object({
            contributionCalendar: z.object({
              weeks: z.array(z.object({ contributionDays: z.array(CalendarDay) })),
            }),
          }),
        })
        .nullable(),
    })
    .nullish(),
  errors: z.array(z.object({ type: z.string().optional(), message: z.string() })).optional(),
});

/** Reads a user's last year of contributions via GraphQL. */
export class GraphQLContributions implements ContributionsSource {
  readonly #conn: GitHubConnection;
  readonly #user: string;

  /**
   * @param conn - How to reach GitHub (needs a token).
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
    if (!this.#conn.token) return err(new GitHubUnauthorized('contributions', 'missing-token'));

    const res = await requestJson(
      this.#conn,
      {
        source: 'contributions',
        url: 'https://api.github.com/graphql',
        method: 'POST',
        body: JSON.stringify({ query: QUERY, variables: { login: this.#user } }),
      },
      CalendarResponse,
    );
    if (res._tag === 'err') return res;

    const { data, errors } = res.value;
    if (errors?.some((e) => e.type === 'RATE_LIMITED')) {
      return err(new GitHubRateLimited('contributions', undefined));
    }
    if (errors?.length) {
      return err(
        new GitHubResponseInvalid('contributions', `GraphQL error ${errors[0]?.type ?? ''}`.trim()),
      );
    }
    if (!data?.user) return err(new GitHubResponseInvalid('contributions', 'user not found'));

    const days: Contributions.Day[] = [];
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const raw of week.contributionDays) {
        const date = CalendarDate.parse(raw.date);
        const level = Contributions.levelFromName(raw.contributionLevel);
        if (date._tag === 'err' || level === undefined) {
          return err(
            new GitHubResponseInvalid('contributions', `bad day ${raw.date.slice(0, 16)}`),
          );
        }
        days.push({ date: date.value, count: raw.contributionCount, level });
      }
    }
    const calendar = Contributions.make(days);
    return calendar._tag === 'ok'
      ? ok(calendar.value)
      : err(new GitHubResponseInvalid('contributions', calendar.error.message));
  }
}
