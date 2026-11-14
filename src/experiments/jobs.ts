/**
 * Every experiment's scheduled jobs, found from its `jobs.ts` (which exports `jobs`). Each
 * experiment's jobs get storage confined to `experiments/<slug>/`, so experiments can't see each
 * other's entries or the site's. The Worker runs these on its cron tick (src/worker.ts).
 */
import type { Job, OwnedJob } from '~/lib/jobs';

import { experimentNamespace } from './kit/manifest';

const modules = import.meta.glob<{ readonly jobs: readonly Job[] }>('./*/jobs.ts', {
  eager: true,
});

/** All experiments' jobs, each owned by its experiment's namespace. */
export const experimentJobs: readonly OwnedJob[] = Object.entries(modules).flatMap(
  ([path, module]) => {
    const slug = /^\.\/([^/]+)\//.exec(path)?.[1];
    return slug ? module.jobs.map((job) => ({ namespace: experimentNamespace(slug), job })) : [];
  },
);
