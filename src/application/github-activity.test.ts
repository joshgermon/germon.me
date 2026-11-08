import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as Activity from '~/domain/github/activity';
import type { Contributions } from '~/domain/github/contributions';
import { contributions } from '~/domain/github/github.arbitrary';
import type { Listing, ShowcasePolicy } from '~/domain/github/repo';
import { err, ok, type Result } from '~/lib/result';
import { GitHubActivity, type ContributionsSource, type ReposSource } from './github-activity';
import {
  GitHubRateLimited,
  GitHubUnauthorized,
  GitHubUnavailable,
  type GitHubSourceError,
} from './github-errors';

const NOW = new Date('2026-11-08T03:00:00Z');
const POLICY: ShowcasePolicy = {
  owner: 'joshgermon',
  hidden: new Set(),
  hiddenPrefixes: [],
  blurbs: new Map(),
  limit: 7,
};
const LISTING: Listing = {
  name: 'rq',
  owner: 'joshgermon',
  fork: false,
  archived: false,
  description: 'A CLI.',
  language: 'Go',
  url: 'https://github.com/joshgermon/rq',
  stars: 0,
  pushedAt: new Date('2026-10-19T15:20:11Z'),
};

/** In-memory sources that answer with fixed results. */
const calendarSource = (r: Result<Contributions, GitHubSourceError>): ContributionsSource => ({
  fetchCalendar: async () => r,
});
const reposSource = (r: Result<ReadonlyArray<Listing>, GitHubSourceError>): ReposSource => ({
  listRepos: async () => r,
});

const service = (c: ContributionsSource, r: ReposSource) =>
  new GitHubActivity({ contributions: c, repos: r, showcase: POLICY, now: () => NOW });

const sample = fc.sample(contributions, { numRuns: 1, seed: 7 })[0];

describe('GitHubActivity.getActivity', () => {
  it('is complete when both sources answer', async () => {
    if (!sample) throw new Error('no sample');
    const result = await service(
      calendarSource(ok(sample)),
      reposSource(ok([LISTING])),
    ).getActivity();
    if (result._tag === 'err') throw result.error;
    expect(result.value.degraded).toEqual([]);
    expect(result.value.activity._tag).toBe('Complete');
    expect(result.value.activity.asOf).toEqual(NOW);
    expect(Activity.repos(result.value.activity)?.map((r) => r.name)).toEqual(['rq']);
  });

  it('still serves repos when there is no token for the calendar', async () => {
    const missing = new GitHubUnauthorized('contributions', 'missing-token');
    const result = await service(
      calendarSource(err(missing)),
      reposSource(ok([LISTING])),
    ).getActivity();
    if (result._tag === 'err') throw result.error;
    expect(result.value.activity._tag).toBe('ReposOnly');
    expect(Activity.contributions(result.value.activity)).toBeUndefined();
    expect(result.value.degraded).toEqual([{ source: 'contributions', error: missing }]);
  });

  it('still serves the calendar when the repo list is rate limited', async () => {
    if (!sample) throw new Error('no sample');
    const limited = new GitHubRateLimited('repos', undefined);
    const result = await service(
      calendarSource(ok(sample)),
      reposSource(err(limited)),
    ).getActivity();
    if (result._tag === 'err') throw result.error;
    expect(result.value.activity._tag).toBe('ContributionsOnly');
    expect(result.value.degraded.map((d) => d.error._tag)).toEqual(['GitHubRateLimited']);
  });

  it('fails only when both sources fail, keeping both reasons', async () => {
    const down = new GitHubUnavailable('repos', 502, undefined);
    const missing = new GitHubUnauthorized('contributions', 'missing-token');
    const result = await service(
      calendarSource(err(missing)),
      reposSource(err(down)),
    ).getActivity();
    expect(result).toMatchObject({
      _tag: 'err',
      error: { _tag: 'GitHubActivityUnavailable', repos: down, contributions: missing },
    });
  });
});
