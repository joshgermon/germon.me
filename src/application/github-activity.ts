/**
 * The GitHub activity operation: fetch Josh's repos and contribution calendar side by side,
 * pick the repos worth showing, and say exactly what was and wasn't available.
 *
 * Partial failure is normal (no token → no calendar; a rate limit on one endpoint), so it is
 * a success with a list of what's degraded. Only "nothing at all" is an error.
 */
import * as Activity from '~/domain/github/activity';
import type { Contributions } from '~/domain/github/contributions';
import * as Repo from '~/domain/github/repo';
import type { GitHubSource, GitHubSourceError } from './github-errors';
import { shouldNeverHappen } from '~/lib/defects';
import { err, ok, type Result } from '~/lib/result';

/** Port: where the contribution calendar comes from. */
export type ContributionsSource = {
  /** Fetch the last year of contributions. Never rejects for expected failures. */
  fetchCalendar(): Promise<Result<Contributions, GitHubSourceError>>;
};

/** Port: where the repository list comes from. */
export type ReposSource = {
  /** List the account's repositories. Never rejects for expected failures. */
  listRepos(): Promise<Result<ReadonlyArray<Repo.Listing>, GitHubSourceError>>;
};

/** A part of the activity that couldn't be fetched, and why. */
export type Degradation = {
  readonly source: GitHubSource;
  readonly error: GitHubSourceError;
};

/** The activity, plus what (if anything) is missing from it. */
export type ActivityReport = {
  readonly activity: Activity.Activity;
  /** Empty when the activity is complete. */
  readonly degraded: ReadonlyArray<Degradation>;
};

/** Neither the repos nor the calendar could be fetched. */
export class GitHubActivityUnavailable extends Error {
  readonly _tag = 'GitHubActivityUnavailable' as const;

  /**
   * @param repos - Why the repos failed.
   * @param contributions - Why the calendar failed.
   */
  constructor(
    readonly repos: GitHubSourceError,
    readonly contributions: GitHubSourceError,
  ) {
    super(`GitHub activity unavailable: repos ${repos._tag}, contributions ${contributions._tag}`);
  }
}

/** Everything the service needs, supplied by the composition root. */
export type GitHubActivityDeps = {
  readonly contributions: ContributionsSource;
  readonly repos: ReposSource;
  /** Which repos make the list. */
  readonly showcase: Repo.ShowcasePolicy;
  /** The current instant (stamps the activity). */
  readonly now: () => Date;
};

/** Fetches and assembles Josh's GitHub activity. */
export class GitHubActivity {
  readonly #deps: GitHubActivityDeps;

  /** @param deps - Sources, showcase rules and clock. */
  constructor(deps: GitHubActivityDeps) {
    this.#deps = deps;
  }

  /**
   * Fetch both sources concurrently and assemble what came back.
   *
   * @returns The activity with any degraded parts listed, or `GitHubActivityUnavailable` when
   *   both sources failed.
   */
  async getActivity(): Promise<Result<ActivityReport, GitHubActivityUnavailable>> {
    const { contributions, repos, showcase, now } = this.#deps;
    const [calendar, listings] = await Promise.all([
      contributions.fetchCalendar(),
      repos.listRepos(),
    ]);

    const shown = listings._tag === 'ok' ? Repo.showcase(listings.value, showcase) : undefined;
    const known = calendar._tag === 'ok' ? calendar.value : undefined;
    const activity = Activity.fromParts(now(), { repos: shown, contributions: known });

    if (!activity) {
      if (listings._tag === 'err' && calendar._tag === 'err') {
        return err(new GitHubActivityUnavailable(listings.error, calendar.error));
      }
      // fromParts only returns undefined when both parts are missing, i.e. both failed.
      return shouldNeverHappen('Activity missing although a source succeeded');
    }

    const degraded: Degradation[] = [];
    if (listings._tag === 'err') degraded.push({ source: 'repos', error: listings.error });
    if (calendar._tag === 'err') degraded.push({ source: 'contributions', error: calendar.error });
    return ok({ activity, degraded });
  }
}
