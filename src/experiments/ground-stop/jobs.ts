/**
 * Ground stop's scheduled jobs (run by the Worker's cron tick; see ~/lib/jobs).
 */
import { SWEEP_EVERY } from '~/experiments/ground-stop/domain/live';
import { recordSky } from '~/experiments/ground-stop/server/recorder';
import { sweepSky } from '~/experiments/ground-stop/server/sweep';
import { defineJob, type Job } from '~/lib/jobs';

/** This experiment's jobs. */
export const jobs: readonly Job[] = [
  defineJob({
    name: 'record-sky',
    everyMinutes: SWEEP_EVERY,
    // The live view runs for a month after the event; then the page is the baked evening alone.
    until: '2026-12-13T05:00:00Z',
    // OpenSky (adapters/opensky.ts) times out from Cloudflare's network, so the Worker sweeps
    // the community networks only. A collector running elsewhere could pass credentials.
    run: (context) => recordSky(context, (fetcher) => sweepSky(fetcher, null)),
  }),
];
