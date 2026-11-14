/**
 * Scheduled jobs. The Worker has one cron trigger, a tick every minute (wrangler.jsonc); a job
 * says how often it wants to run and the runner starts the ones that are due. Jobs know nothing
 * about cron expressions, Cloudflare, or each other: each gets a `JobContext` with the tick's
 * time, a `fetch`, and a `Storage` confined to its owner's namespace. One job failing or
 * throwing never stops another.
 *
 * Declare a job with `defineJob`, export it from the owner's `jobs.ts`, and it runs (experiments:
 * `src/experiments/<slug>/jobs.ts`, found by `src/experiments/jobs.ts`).
 */
import { err, ok, type Result } from './result';
import { namespaced, putJson, type Storage } from './storage';

/** A job couldn't do its work this time (a source was down, storage refused). */
export class JobFailed extends Error {
  readonly _tag = 'JobFailed' as const;

  /**
   * @param reason - What went wrong, for the log.
   * @param cause - The underlying failure, if there was one.
   */
  constructor(
    readonly reason: string,
    override readonly cause?: unknown,
  ) {
    super(reason);
  }
}

/** What a job is given each time it runs. */
export interface JobContext {
  /** The tick this run belongs to, epoch milliseconds (on the minute). */
  readonly scheduledAt: number;
  /** The owner's own corner of the site's store. */
  readonly storage: Storage;
  readonly fetch: typeof fetch;
}

/** One piece of scheduled work. */
export interface Job {
  /** Unique within its owner; names the job in logs and in its stored outcome. */
  readonly name: string;
  /** Run when the minute since the epoch divides by this: 1 is every tick, 60 is hourly. */
  readonly everyMinutes: number;
  /** Stop running after this ISO time, so finished work costs nothing. */
  readonly until?: string;
  /** Do the work. Return a one-line summary, or why it couldn't be done. */
  readonly run: (context: JobContext) => Promise<Result<string, JobFailed>>;
}

/** A job and the namespace its storage is confined to. */
export interface OwnedJob {
  /** The owner's path in the store, e.g. `experiments/ground-stop`. */
  readonly namespace: string;
  readonly job: Job;
}

/** How one run went. Also stored at `<namespace>/jobs/<name>.json`. */
export interface JobOutcome {
  /** `<namespace>/<name>`. */
  readonly job: string;
  readonly scheduledAt: number;
  /** `failed` is an expected failure the job reported; `crashed` is a defect it threw. */
  readonly status: 'ok' | 'failed' | 'crashed';
  readonly summary: string;
  readonly milliseconds: number;
}

/**
 * Declare a job (an identity function, for types and a single place to add checks).
 *
 * @param job - The job.
 * @returns The same job.
 */
export const defineJob = (job: Job): Job => job;

/**
 * Whether a job should run on a tick.
 *
 * @param job - The job.
 * @param scheduledAt - The tick, epoch milliseconds.
 * @returns True when the tick is one of the job's and its `until` hasn't passed.
 */
export const isDue = (job: Job, scheduledAt: number): boolean => {
  if (job.until !== undefined && scheduledAt > Date.parse(job.until)) return false;
  const every = Math.max(1, Math.round(job.everyMinutes));
  return Math.floor(scheduledAt / 60_000) % every === 0;
};

/** What the runner needs from the outside world. */
export interface JobRunner {
  /** The whole store; each job sees only its namespace. */
  readonly storage: Storage;
  readonly fetch: typeof fetch;
  /** The wall clock, for timing runs. */
  readonly now: () => number;
}

const runOne = async (
  { namespace, job }: OwnedJob,
  scheduledAt: number,
  runner: JobRunner,
): Promise<JobOutcome> => {
  const storage = namespaced(runner.storage, namespace);
  const started = runner.now();
  let result: Result<string, JobFailed> | { readonly _tag: 'crashed'; readonly error: unknown };
  try {
    result = await job.run({ scheduledAt, storage, fetch: runner.fetch });
  } catch (error) {
    result = { _tag: 'crashed', error };
  }
  const outcome: JobOutcome = {
    job: `${namespace}/${job.name}`,
    scheduledAt,
    status: result._tag === 'ok' ? 'ok' : result._tag === 'err' ? 'failed' : 'crashed',
    summary:
      result._tag === 'ok'
        ? result.value
        : result.error instanceof Error
          ? result.error.message
          : String(result.error),
    milliseconds: runner.now() - started,
  };
  // The record is a convenience; losing it must not turn a good run into a bad one.
  await putJson(storage, `jobs/${job.name}.json`, outcome);
  return outcome;
};

/**
 * Run every job that is due on a tick, side by side.
 *
 * @param jobs - All the jobs there are.
 * @param scheduledAt - The tick, epoch milliseconds.
 * @param runner - Storage, fetch and a clock.
 * @returns How each due job went.
 */
export const runDue = (
  jobs: readonly OwnedJob[],
  scheduledAt: number,
  runner: JobRunner,
): Promise<JobOutcome[]> =>
  Promise.all(
    jobs.filter(({ job }) => isDue(job, scheduledAt)).map((j) => runOne(j, scheduledAt, runner)),
  );

/**
 * Turn a failed `Result` from a dependency into a `JobFailed`, keeping the cause.
 *
 * @param reason - What the job was doing.
 * @param cause - The dependency's error.
 * @returns An `err` result a job can return.
 */
export const jobFailed = (reason: string, cause?: unknown): Result<never, JobFailed> =>
  err(new JobFailed(reason, cause));

/**
 * A finished run.
 *
 * @param summary - One line for the log.
 * @returns An `ok` result a job can return.
 */
export const jobDone = (summary: string): Result<string, never> => ok(summary);
