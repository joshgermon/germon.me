/**
 * Which of Josh's GitHub repos the site shows, and how they're described. The list itself is
 * live from GitHub (see `adapters/github/composition-root.ts`); this is the editorial layer.
 */
import type { ShowcasePolicy } from '~/domain/github/repo';
import { profile } from '~/site/profile';

/** The showcase rules: own repos, newest push first, these hidden, these blurbs preferred. */
export const projectShowcase: ShowcasePolicy = {
  owner: profile.githubUser,
  hidden: new Set(['germon.me', 'nvim-config', 'dev-env', 'ziglings']),
  hiddenPrefixes: ['advent-of-code'],
  limit: 7,
  // Hand-written blurbs win over GitHub's descriptions (and rescue repos that have none).
  blurbs: new Map([
    [
      'rq',
      'A streamlined CLI for testing APIs straight from OpenAPI/Swagger specs. Edit and send requests without leaving the terminal.',
    ],
    ['bksd', 'An automated backup daemon. Set it, forget it, sleep better.'],
    ['cubby', 'Directory backups with a hand-rolled copy engine (cubcopy) underneath.'],
    ['tiny-http', 'An HTTP/1.1 server written from scratch on unix sockets.'],
    ['monkey-interpreter', 'A tree-walking interpreter for the Monkey language.'],
    ['retried-ts', 'A minimal, type-safe async retry utility.'],
    [
      'metro-parking-notifier',
      'Pings me when the station car park is filling up on office days. Peak staff-engineering.',
    ],
  ]),
};
