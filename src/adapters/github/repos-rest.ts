/**
 * Outbound adapter: an account's repositories from GitHub's REST API
 * (`GET /users/{user}/repos`). Works without a token (60 requests/hour per IP); with one,
 * the limit is the token's.
 */
import { z } from 'zod';

import type { ReposSource } from '~/application/github-activity';
import type { GitHubSourceError } from '~/application/github-errors';
import type { Listing } from '~/domain/github/repo';
import type { Result } from '~/lib/result';
import { map } from '~/lib/result';
import { requestJson, type GitHubConnection } from './github-http';

/** GitHub's repository object — only the fields the site reads. */
const RestRepository = z.object({
  name: z.string().min(1),
  owner: z.object({ login: z.string() }),
  fork: z.boolean(),
  archived: z.boolean(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  html_url: z.url(),
  stargazers_count: z.number().int().nonnegative(),
  pushed_at: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
});

const RestRepositories = z.array(RestRepository);

/** Lists a user's own repositories via REST. */
export class RestRepos implements ReposSource {
  readonly #conn: GitHubConnection;
  readonly #user: string;

  /**
   * @param conn - How to reach GitHub.
   * @param user - The account whose repos to list.
   */
  constructor(conn: GitHubConnection, user: string) {
    this.#conn = conn;
    this.#user = user;
  }

  /**
   * List the account's own repos, most recently pushed first (first 100).
   *
   * @returns The listings, or a classified GitHub failure.
   */
  async listRepos(): Promise<Result<ReadonlyArray<Listing>, GitHubSourceError>> {
    const url = `https://api.github.com/users/${encodeURIComponent(this.#user)}/repos?type=owner&sort=pushed&per_page=100`;
    const res = await requestJson(
      this.#conn,
      { source: 'repos', url, method: 'GET' },
      RestRepositories,
    );
    return map(res, (repos) =>
      repos.map((r): Listing => ({
        name: r.name,
        owner: r.owner.login,
        fork: r.fork,
        archived: r.archived,
        description: r.description,
        language: r.language,
        url: r.html_url,
        stars: r.stargazers_count,
        pushedAt: r.pushed_at,
      })),
    );
  }
}
