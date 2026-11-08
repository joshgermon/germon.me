/**
 * The GitHub adapters against a fake `fetch` that answers like GitHub does: real `Response`s
 * with GitHub's status codes, headers and bodies.
 */
import { describe, expect, it } from 'vitest';

import * as Contributions from '~/domain/github/contributions';
import { Redacted } from '~/lib/redacted';
import { GraphQLContributions } from './contributions-graphql';
import type { Fetch, GitHubConnection } from './github-http';
import { RestRepos } from './repos-rest';

type Seen = { url: string; init: RequestInit };

/** A fake GitHub: records requests and answers with `respond`. */
const fakeGitHub = (respond: (seen: Seen) => Response | Promise<Response>) => {
  const seen: Seen[] = [];
  const fetch: Fetch = async (url, init) => {
    seen.push({ url, init });
    return respond({ url, init });
  };
  return { fetch, seen };
};

const conn = (fetch: Fetch, token?: string): GitHubConnection => ({
  fetch,
  token: token === undefined ? undefined : Redacted.make(token),
  timeoutMs: 1_000,
});

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const restRepo = {
  name: 'rq',
  owner: { login: 'joshgermon' },
  fork: false,
  archived: false,
  description: 'A CLI.',
  language: 'Go',
  html_url: 'https://github.com/joshgermon/rq',
  stargazers_count: 3,
  pushed_at: '2026-10-19T15:20:11Z',
  extra_field_we_ignore: true,
};

describe('RestRepos', () => {
  it('lists repos without a token and parses them into listings', async () => {
    const gh = fakeGitHub(() => json([restRepo]));
    const result = await new RestRepos(conn(gh.fetch), 'joshgermon').listRepos();
    expect(result).toEqual({
      _tag: 'ok',
      value: [
        {
          name: 'rq',
          owner: 'joshgermon',
          fork: false,
          archived: false,
          description: 'A CLI.',
          language: 'Go',
          url: 'https://github.com/joshgermon/rq',
          stars: 3,
          pushedAt: new Date('2026-10-19T15:20:11Z'),
        },
      ],
    });
    expect(gh.seen[0]?.url).toContain('/users/joshgermon/repos');
    expect(new Headers(gh.seen[0]?.init.headers).has('authorization')).toBe(false);
    expect(new Headers(gh.seen[0]?.init.headers).get('user-agent')).toBe('germon.me');
  });

  it('sends the token when there is one', async () => {
    const gh = fakeGitHub(() => json([]));
    await new RestRepos(conn(gh.fetch, 'tok'), 'joshgermon').listRepos();
    expect(new Headers(gh.seen[0]?.init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('classifies failures', async () => {
    const cases: Array<[Response | Error, string]> = [
      [
        new Response('', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1794112278' },
        }),
        'GitHubRateLimited',
      ],
      [new Response('', { status: 429 }), 'GitHubRateLimited'],
      [new Response('', { status: 401 }), 'GitHubUnauthorized'],
      [new Response('', { status: 502 }), 'GitHubUnavailable'],
      [new TypeError('network down'), 'GitHubUnavailable'],
      [new Response('<html>', { status: 200 }), 'GitHubResponseInvalid'],
      [json([{ ...restRepo, pushed_at: 'yesterday' }]), 'GitHubResponseInvalid'],
    ];
    for (const [answer, tag] of cases) {
      const gh = fakeGitHub(() => {
        if (answer instanceof Error) throw answer;
        return answer;
      });
      const result = await new RestRepos(conn(gh.fetch), 'joshgermon').listRepos();
      expect(result, tag).toMatchObject({ _tag: 'err', error: { _tag: tag, source: 'repos' } });
    }
  });

  it('reads the rate limit reset time', async () => {
    const gh = fakeGitHub(
      () =>
        new Response('', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1794112278' },
        }),
    );
    const result = await new RestRepos(conn(gh.fetch), 'joshgermon').listRepos();
    expect(result).toMatchObject({ error: { resetAt: new Date(1794112278 * 1000) } });
  });
});

const day = (date: string, contributionCount: number, contributionLevel: string) => ({
  date,
  contributionCount,
  contributionLevel,
});

const calendarBody = (weeks: ReadonlyArray<ReadonlyArray<ReturnType<typeof day>>>) => ({
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: { weeks: weeks.map((contributionDays) => ({ contributionDays })) },
      },
    },
  },
});

describe('GraphQLContributions', () => {
  it('needs a token and does not call GitHub without one', async () => {
    const gh = fakeGitHub(() => json({}));
    const result = await new GraphQLContributions(conn(gh.fetch), 'joshgermon').fetchCalendar();
    expect(result).toMatchObject({
      _tag: 'err',
      error: { _tag: 'GitHubUnauthorized', reason: 'missing-token' },
    });
    expect(gh.seen).toHaveLength(0);
  });

  it('parses the calendar into the domain type', async () => {
    const gh = fakeGitHub(() =>
      json(
        calendarBody([
          [day('2026-11-01', 0, 'NONE'), day('2026-11-02', 4, 'SECOND_QUARTILE')],
          [day('2026-11-03', 9, 'FOURTH_QUARTILE')],
        ]),
      ),
    );
    const result = await new GraphQLContributions(
      conn(gh.fetch, 'tok'),
      'joshgermon',
    ).fetchCalendar();
    if (result._tag === 'err') throw result.error;
    expect(Contributions.total(result.value)).toBe(13);
    expect(Contributions.days(result.value).map((d) => d.level)).toEqual([0, 2, 4]);
    const body: unknown = JSON.parse(String(gh.seen[0]?.init.body));
    expect(body).toMatchObject({ variables: { login: 'joshgermon' } });
  });

  it('treats GraphQL errors and odd payloads as failures, not data', async () => {
    const cases: Array<[unknown, string]> = [
      [{ errors: [{ type: 'RATE_LIMITED', message: 'slow down' }] }, 'GitHubRateLimited'],
      [
        { data: { user: null }, errors: [{ type: 'NOT_FOUND', message: 'nope' }] },
        'GitHubResponseInvalid',
      ],
      [{ data: { user: null } }, 'GitHubResponseInvalid'],
      [
        calendarBody([[day('2026-11-01', 1, 'NONE'), day('2026-11-05', 1, 'NONE')]]),
        'GitHubResponseInvalid',
      ],
      [calendarBody([[day('2026-11-01', 1, 'SIXTH_QUARTILE')]]), 'GitHubResponseInvalid'],
      [calendarBody([]), 'GitHubResponseInvalid'],
    ];
    for (const [payload, tag] of cases) {
      const gh = fakeGitHub(() => json(payload));
      const result = await new GraphQLContributions(
        conn(gh.fetch, 'tok'),
        'joshgermon',
      ).fetchCalendar();
      expect(result, tag).toMatchObject({
        _tag: 'err',
        error: { _tag: tag, source: 'contributions' },
      });
    }
  });

  it('reports a rejected token', async () => {
    const gh = fakeGitHub(() => new Response('', { status: 401 }));
    const result = await new GraphQLContributions(
      conn(gh.fetch, 'bad'),
      'joshgermon',
    ).fetchCalendar();
    expect(result).toMatchObject({
      _tag: 'err',
      error: { _tag: 'GitHubUnauthorized', reason: 'rejected' },
    });
  });

  it('never leaks the token into errors', async () => {
    const gh = fakeGitHub(() => new Response('', { status: 401 }));
    const result = await new GraphQLContributions(
      conn(gh.fetch, 'ghp_secret'),
      'joshgermon',
    ).fetchCalendar();
    expect(JSON.stringify(result)).not.toContain('ghp_secret');
    expect(String(result._tag === 'err' ? result.error.message : '')).not.toContain('ghp_secret');
  });
});
