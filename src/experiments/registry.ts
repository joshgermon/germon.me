/**
 * Every experiment, found from its `experiment.ts` manifest. Add a folder and it appears; delete
 * it and it's gone.
 */
import type { Experiment } from './kit/manifest';

const manifests = import.meta.glob<{ readonly experiment: Experiment }>('./*/experiment.ts', {
  eager: true,
});

/** All experiments, newest first. */
export const experiments: readonly Experiment[] = Object.values(manifests)
  .map((m) => m.experiment)
  .toSorted((a, b) => b.published.localeCompare(a.published));
