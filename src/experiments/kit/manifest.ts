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
   * If the experiment has `scripts/experiments/<slug>/refresh.ts`, the scheduled refresh runs it
   * until this ISO time (then stops, so finished experiments cost nothing).
   */
  readonly refreshUntil?: string;
}

/** Declare a manifest (an identity function, for types and a single place to add checks). */
export const defineExperiment = (experiment: Experiment): Experiment => experiment;

/** The page an experiment lives at. */
export const experimentPath = (slug: string): string => `/experiments/${slug}/`;
