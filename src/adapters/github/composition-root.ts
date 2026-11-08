/**
 * Composition root for GitHub activity: reads the token, builds the concrete adapters and
 * hands them to the application service. Components and routes import from here and never
 * construct adapters themselves.
 *
 * Two entry points, matching the two moments data is fetched (see docs/adr/0001):
 * - `loadActivitySnapshot` — at build time, for the prerendered HTML and the palette.
 *   Memoised so one build makes one round of requests however many components ask.
 * - `loadLiveActivity` — at request time, inside the edge-cached server islands.
 */
import { GITHUB_TOKEN } from 'astro:env/server';

import {
  GitHubActivity,
  type ActivityReport,
  type GitHubActivityUnavailable,
} from '~/application/github-activity';
import { Redacted } from '~/lib/redacted';
import type { Result } from '~/lib/result';
import { projectShowcase } from '~/site/projects';
import { profile } from '~/site/profile';
import { GraphQLContributions } from './contributions-graphql';
import type { GitHubConnection } from './github-http';
import { RestRepos } from './repos-rest';

/** What loading GitHub activity yields: the report, or why nothing could be fetched. */
export type ActivityResult = Result<ActivityReport, GitHubActivityUnavailable>;

/** An empty or whitespace token means "not configured", same as unset. */
const parseToken = (raw: string | undefined): Redacted<string> | undefined => {
  const token = raw?.trim();
  return token ? Redacted.make(token) : undefined;
};

const createService = (): GitHubActivity => {
  const conn: GitHubConnection = {
    fetch: (input, init) => fetch(input, init),
    token: parseToken(GITHUB_TOKEN),
    timeoutMs: 8_000,
  };
  return new GitHubActivity({
    contributions: new GraphQLContributions(conn, profile.githubUser),
    repos: new RestRepos(conn, profile.githubUser),
    showcase: projectShowcase,
    now: () => new Date(),
  });
};

/** Log what's missing with safe fields only (error tags and sources, never the token). */
const logDegradation = (moment: 'build' | 'live', result: ActivityResult): void => {
  if (result._tag === 'err') {
    console.warn(`[github:${moment}] unavailable`, {
      repos: result.error.repos._tag,
      contributions: result.error.contributions._tag,
    });
    return;
  }
  for (const { source, error } of result.value.degraded) {
    // A missing token is a configuration choice, not an incident.
    if (error._tag === 'GitHubUnauthorized' && error.reason === 'missing-token') continue;
    console.warn(`[github:${moment}] ${source} degraded`, {
      error: error._tag,
      message: error.message,
    });
  }
};

let snapshot: Promise<ActivityResult> | undefined;

/**
 * GitHub activity as of the build. Call only while prerendering (or in `astro dev`): the
 * result is memoised for the life of the process.
 *
 * @returns The build-time activity report, or why nothing could be fetched.
 */
export function loadActivitySnapshot(): Promise<ActivityResult> {
  snapshot ??= createService()
    .getActivity()
    .then((result) => {
      logDegradation('build', result);
      return result;
    });
  return snapshot;
}

/**
 * Fresh GitHub activity, fetched now. Call from on-demand routes that set an edge cache, so
 * GitHub sees roughly one request per cache period rather than one per visitor.
 *
 * @returns The current activity report, or why nothing could be fetched.
 */
export async function loadLiveActivity(): Promise<ActivityResult> {
  const result = await createService().getActivity();
  logDegradation('live', result);
  return result;
}
