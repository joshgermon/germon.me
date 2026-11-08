/**
 * The GitHub adapters against a fake `fetch` that answers like GitHub does: real `Response`s
 * with GitHub's status codes, headers and bodies.
 */
import { describe, expect, it } from 'vitest';

import * as Contributions from '~/domain/github/contributions';
import { Redacted } from '~/lib/redacted';
import { ProfileContributions } from './contributions-profile';
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

type FragmentDay = { date: string; label: string; level: number | string; id?: string };

/** The profile fragment's markup for `days`, drawn row by row like GitHub's grid. */
const fragment = (rows: ReadonlyArray<ReadonlyArray<FragmentDay>>) =>
  new Response(
    `<table class="ContributionCalendar-grid"><tbody>${rows
      .map(
        (row, r) =>
          `<tr>${row
            .map((d, c) => {
              const id = d.id ?? `contribution-day-component-${r}-${c}`;
              return `<td tabindex="0" data-ix="${c}" data-date="${d.date}" id="${id}" data-level="${d.level}" role="gridcell" class="ContributionCalendar-day"></td>
<tool-tip id="tooltip-${r}-${c}" for="${id}" popover="manual" class="sr-only">${d.label}</tool-tip>`;
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody></table>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );

describe('ProfileContributions', () => {
  it('reads the profile fragment into the domain type, in date order', async () => {
    // Row 0 holds Sundays, row 1 Mondays: the 1st and 8th, then the 2nd and 9th.
    const gh = fakeGitHub(() =>
      fragment([
        [
          { date: '2026-11-01', label: 'No contributions on November 1st.', level: 0 },
          { date: '2026-11-08', label: '1,204 contributions on November 8th.', level: 4 },
        ],
        [
          { date: '2026-11-02', label: '1 contribution on November 2nd.', level: 1 },
          { date: '2026-11-09', label: '3 contributions on November 9th.', level: 2 },
        ],
        [3, 4, 5, 6, 7].map((n) => ({
          date: `2026-11-0${n}`,
          label: `No contributions on November ${n}th.`,
          level: 0,
        })),
      ]),
    );
    const result = await new ProfileContributions(conn(gh.fetch), 'joshgermon').fetchCalendar();
    if (result._tag === 'err') throw result.error;
    const days = Contributions.days(result.value);
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ]);
    expect(Contributions.total(result.value)).toBe(1208);
    expect(days.map((d) => d.level)).toEqual([0, 1, 0, 0, 0, 0, 0, 4, 2]);
    expect(gh.seen[0]?.url).toBe('https://github.com/users/joshgermon/contributions');
  });

  it('never sends the token to github.com', async () => {
    const gh = fakeGitHub(() =>
      fragment([[{ date: '2026-11-01', label: 'No contributions on November 1st.', level: 0 }]]),
    );
    await new ProfileContributions(conn(gh.fetch, 'ghp_secret'), 'joshgermon').fetchCalendar();
    expect(new Headers(gh.seen[0]?.init.headers).has('Authorization')).toBe(false);
  });

  it('treats markup it does not recognise as a failure, not data', async () => {
    const cases: Array<[string, Response]> = [
      ['no days', new Response('<p>Not found</p>', { status: 200 })],
      [
        'unknown level',
        fragment([[{ date: '2026-11-01', label: 'No contributions on November 1st.', level: 7 }]]),
      ],
      [
        'unreadable count',
        fragment([[{ date: '2026-11-01', label: 'Some contributions', level: 1 }]]),
      ],
      [
        'gap between days',
        fragment([
          [
            { date: '2026-11-01', label: 'No contributions on November 1st.', level: 0 },
            { date: '2026-11-05', label: 'No contributions on November 5th.', level: 0 },
          ],
        ]),
      ],
    ];
    for (const [name, response] of cases) {
      const gh = fakeGitHub(() => response);
      const result = await new ProfileContributions(conn(gh.fetch), 'joshgermon').fetchCalendar();
      expect(result, name).toMatchObject({
        _tag: 'err',
        error: { _tag: 'GitHubResponseInvalid', source: 'contributions' },
      });
    }
  });

  it('classifies GitHub refusing the request', async () => {
    const gh = fakeGitHub(
      () => new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    );
    const result = await new ProfileContributions(conn(gh.fetch), 'joshgermon').fetchCalendar();
    expect(result).toMatchObject({ _tag: 'err', error: { _tag: 'GitHubRateLimited' } });
  });
});
