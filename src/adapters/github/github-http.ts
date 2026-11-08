/**
 * The HTTP mechanics shared by the GitHub adapters: headers, a timeout, and classifying
 * every way a request can go wrong into the application's GitHub errors. Raw `Response`s
 * never leave this module; callers get parsed JSON, page text, or a tagged error.
 */
import type { z } from 'zod';

import {
  GitHubRateLimited,
  GitHubResponseInvalid,
  GitHubUnauthorized,
  GitHubUnavailable,
  type GitHubSource,
  type GitHubSourceError,
} from '~/application/github-errors';
import type { Redacted } from '~/lib/redacted';
import { err, ok, type Result } from '~/lib/result';

/** The subset of `fetch` the adapters use; inject a fake in tests. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** How an adapter reaches GitHub. */
export type GitHubConnection = {
  /** `globalThis.fetch` in production. */
  readonly fetch: Fetch;
  /** Read-only token for the REST API (raises its rate limit). Never sent to github.com pages. */
  readonly token: Redacted<string> | undefined;
  /** Abort a request after this long. */
  readonly timeoutMs: number;
};

/** One request to send. */
export type GitHubRequest = {
  readonly source: GitHubSource;
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly body?: string;
};

const rateLimitReset = (res: Response): Date | undefined => {
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000);
  const retryAfter = Number(res.headers.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? new Date(Date.now() + retryAfter * 1000)
    : undefined;
};

const classifyStatus = (source: GitHubSource, res: Response): GitHubSourceError => {
  const limited =
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')));
  if (limited) return new GitHubRateLimited(source, rateLimitReset(res));
  if (res.status === 401 || res.status === 403) return new GitHubUnauthorized(source);
  return new GitHubUnavailable(source, res.status, undefined);
};

/** Send a request; the response if it was 2xx, otherwise the classified failure. */
async function send(
  conn: GitHubConnection,
  req: GitHubRequest,
  headers: Headers,
): Promise<Result<Response, GitHubSourceError>> {
  // GitHub rejects requests without a User-Agent; Workers' fetch doesn't send one.
  headers.set('User-Agent', 'germon.me');
  if (req.body !== undefined) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await conn.fetch(req.url, {
      method: req.method,
      headers,
      ...(req.body === undefined ? {} : { body: req.body }),
      signal: AbortSignal.timeout(conn.timeoutMs),
    });
  } catch (cause) {
    return err(new GitHubUnavailable(req.source, undefined, cause));
  }
  return res.ok ? ok(res) : err(classifyStatus(req.source, res));
}

/**
 * Send a request to GitHub's REST API (with the token, when there is one) and parse the
 * JSON body with `schema`.
 *
 * @template S - The response schema.
 * @param conn - How to reach GitHub.
 * @param req - What to send.
 * @param schema - The expected response shape.
 * @returns The parsed body, or the classified failure. Never rejects.
 */
export async function requestJson<S extends z.ZodType>(
  conn: GitHubConnection,
  req: GitHubRequest,
  schema: S,
): Promise<Result<z.output<S>, GitHubSourceError>> {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (conn.token) headers.set('Authorization', `Bearer ${conn.token.unwrap()}`);
  const res = await send(conn, req, headers);
  if (res._tag === 'err') return res;

  let json: unknown;
  try {
    json = await res.value.json();
  } catch {
    return err(new GitHubResponseInvalid(req.source, 'body is not JSON'));
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first
      ? `${first.path.join('.') || '(root)'}: ${first.message}`
      : 'schema mismatch';
    return err(new GitHubResponseInvalid(req.source, where));
  }
  return ok(parsed.data);
}

/**
 * Fetch a public github.com page as text. Never sends the token: pages are public, and the
 * token is only meant for the API.
 *
 * @param conn - How to reach GitHub.
 * @param req - What to fetch.
 * @returns The body text, or the classified failure. Never rejects.
 */
export async function requestPage(
  conn: GitHubConnection,
  req: GitHubRequest,
): Promise<Result<string, GitHubSourceError>> {
  const res = await send(conn, req, new Headers({ Accept: 'text/html' }));
  if (res._tag === 'err') return res;
  try {
    return ok(await res.value.text());
  } catch (cause) {
    return err(new GitHubUnavailable(req.source, undefined, cause));
  }
}
