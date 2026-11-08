/**
 * The ways a GitHub source can fail, in the application's terms. Outbound adapters classify
 * HTTP failures and unreadable responses into these; the activity service decides what each one means.
 */

/** Which GitHub source failed. */
export type GitHubSource = 'contributions' | 'repos';

/** GitHub refused the request's credentials (a revoked or expired token). */
export class GitHubUnauthorized extends Error {
  readonly _tag = 'GitHubUnauthorized' as const;

  /** @param source - The source that was refused. */
  constructor(readonly source: GitHubSource) {
    super(`GitHub ${source}: token rejected`);
  }
}

/** GitHub's rate limit is exhausted. */
export class GitHubRateLimited extends Error {
  readonly _tag = 'GitHubRateLimited' as const;

  /**
   * @param source - The limited source.
   * @param resetAt - When GitHub says the limit resets, if it said.
   */
  constructor(
    readonly source: GitHubSource,
    readonly resetAt: Date | undefined,
  ) {
    super(`GitHub ${source}: rate limited${resetAt ? ` until ${resetAt.toISOString()}` : ''}`);
  }
}

/** GitHub could not be reached, timed out, or failed on its side. */
export class GitHubUnavailable extends Error {
  readonly _tag = 'GitHubUnavailable' as const;

  /**
   * @param source - The unreachable source.
   * @param status - The HTTP status, when there was a response.
   * @param cause - The underlying failure.
   */
  constructor(
    readonly source: GitHubSource,
    readonly status: number | undefined,
    override readonly cause: unknown,
  ) {
    super(`GitHub ${source}: unavailable${status ? ` (HTTP ${status})` : ''}`);
  }
}

/** GitHub answered with something that isn't the shape we rely on. */
export class GitHubResponseInvalid extends Error {
  readonly _tag = 'GitHubResponseInvalid' as const;

  /**
   * @param source - The source whose response was invalid.
   * @param detail - A safe summary of what didn't match.
   */
  constructor(
    readonly source: GitHubSource,
    readonly detail: string,
  ) {
    super(`GitHub ${source}: unexpected response (${detail})`);
  }
}

/** Any expected failure of a GitHub source. */
export type GitHubSourceError =
  | GitHubUnauthorized
  | GitHubRateLimited
  | GitHubUnavailable
  | GitHubResponseInvalid;
