/**
 * Worker entry and composition root.
 *
 * Static pages are served straight from assets by Cloudflare; this Worker only
 * runs for on-demand routes (`prerender = false`), which Astro renders and the
 * edge caches with stale-while-revalidate, and for the cron tick, which runs the
 * scheduled jobs that are due (`lib/jobs.ts`).
 */
import { handle } from '@astrojs/cloudflare/handler';

import { r2Storage } from '~/adapters/r2-storage';
import { experimentJobs } from '~/experiments/jobs';
import { runDue } from '~/lib/jobs';
import { Redacted } from '~/lib/redacted';

export default {
  fetch(request, env, context) {
    return handle(request, env, context);
  },
  scheduled(controller, env, context) {
    context.waitUntil(
      runDue(experimentJobs, controller.scheduledTime, {
        storage: r2Storage(env.STORAGE),
        fetch,
        // Secrets are wrapped the moment they leave the environment.
        secret: (name) => {
          const value: unknown = Reflect.get(env, name);
          return typeof value === 'string' && value !== '' ? Redacted.make(value) : null;
        },
        now: Date.now,
      }).then((outcomes) => {
        for (const o of outcomes)
          (o.status === 'ok' ? console.warn : console.error)(
            `job ${o.job}: ${o.status} in ${o.milliseconds} ms: ${o.summary}`,
          );
      }),
    );
  },
} satisfies ExportedHandler<Env>;
