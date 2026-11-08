/**
 * The facts pill previews show, gathered at build time by `Hero.astro` and handed to the
 * `HeroPills` island as props (so they must stay plain, serialisable data). Anything that
 * goes stale — the time, the next free morning, tonight's golden hour — is computed in the
 * browser instead.
 */
import type { Role } from '~/site/career';

/** A repository line in the Projects / Terminal previews. */
export type PreviewRepo = {
  readonly name: string;
  /** The primary language's dot colour (any CSS colour). */
  readonly color: string;
  /** ISO timestamp of the last push. */
  readonly pushedAt: string;
};

/** Everything the previews read. */
export type PreviewData = {
  readonly contact: { readonly name: string; readonly email: string; readonly avatar: string };
  readonly roles: ReadonlyArray<Role>;
  readonly notes: {
    readonly count: number;
    readonly latest: { readonly title: string; readonly date: string; readonly words: number };
  };
  readonly camera: { readonly body: string; readonly lens: string };
  readonly repos: ReadonlyArray<PreviewRepo>;
  readonly now: { readonly building: string; readonly learning: string };
};
