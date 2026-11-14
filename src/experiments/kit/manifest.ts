/**
 * What every experiment declares about itself, in `src/experiments/<slug>/experiment.ts`. The
 * registry finds these automatically, so the experiments index (and anything else that lists
 * experiments) never needs editing when one is added or deleted.
 */

/** Whether an experiment is current, or kept only as a record. */
export type ExperimentStatus = 'live' | 'archived';

/** An experiment's manifest. */
export interface Experiment {
  /** The folder name and URL segment: `/experiments/<slug>/`. */
  readonly slug: string;
  readonly title: string;
  /** One or two sentences, for the index and link previews. */
  readonly description: string;
  /** ISO date it went up. */
  readonly published: string;
  readonly status: ExperimentStatus;
  /**
   * The link-preview image (1200×630 CSS px, captured at 2×), usually made by
   * `pnpm experiment:og <slug>` into `public/experiments/<slug>/og.jpg`.
   */
  readonly image?: { readonly path: string; readonly alt: string };
}

/** Link-preview images are this size in CSS pixels (Open Graph's recommended 1.91:1). */
export const OG_SIZE = { width: 1200, height: 630, scale: 2 } as const;

/** Declare a manifest (an identity function, for types and a single place to add checks). */
export const defineExperiment = (experiment: Experiment): Experiment => experiment;

/** The page an experiment lives at. */
export const experimentPath = (slug: string): string => `/experiments/${slug}/`;

/** An experiment's corner of the site's store (`~/lib/storage`): its jobs and routes use this. */
export const experimentNamespace = (slug: string): string => `experiments/${slug}`;
