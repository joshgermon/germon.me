import { describe, expect, it } from 'vitest';

import { defineJob, isDue, jobDone, jobFailed, runDue, type JobRunner } from './jobs';
import { z } from 'zod';

import { getJson, memoryStorage, namespaced } from './storage';

const MINUTE = 60_000;
const runner = (): JobRunner => ({
  storage: memoryStorage(),
  fetch,
  secret: () => null,
  now: () => 0,
});

const write = (name: string) =>
  defineJob({
    name,
    everyMinutes: 1,
    run: async ({ storage }) => {
      await storage.put('state', new Uint8Array([1]));
      const keys = await storage.list('');
      return jobDone(keys._tag === 'ok' ? keys.value.join(',') : 'x');
    },
  });

describe('isDue', () => {
  const job = defineJob({ name: 'j', everyMinutes: 5, run: () => Promise.resolve(jobDone('')) });
  it('runs on the minutes its interval divides', () => {
    expect(isDue(job, 10 * MINUTE)).toBe(true);
    expect(isDue(job, 11 * MINUTE)).toBe(false);
  });
  it('stops after until', () => {
    const ended = { ...job, until: '1970-01-01T00:07:00Z' };
    expect(isDue(ended, 5 * MINUTE)).toBe(true);
    expect(isDue(ended, 10 * MINUTE)).toBe(false);
  });
});

describe('runDue', () => {
  it('gives each job only its own namespace', async () => {
    const r = runner();
    const outcomes = await runDue(
      [
        { namespace: 'a', job: write('one') },
        { namespace: 'b', job: write('two') },
      ],
      0,
      r,
    );
    expect(outcomes.map((o) => o.summary)).toEqual(['state', 'state']);
    const all = await r.storage.list('');
    expect(all._tag === 'ok' && all.value).toEqual([
      'a/jobs/one.json',
      'a/state',
      'b/jobs/two.json',
      'b/state',
    ]);
  });

  it('keeps going when a job fails or throws, and records each outcome', async () => {
    const r = runner();
    const outcomes = await runDue(
      [
        {
          namespace: 'a',
          job: defineJob({
            name: 'throws',
            everyMinutes: 1,
            run: () => Promise.reject(new Error('boom')),
          }),
        },
        {
          namespace: 'a',
          job: defineJob({
            name: 'fails',
            everyMinutes: 1,
            run: () => Promise.resolve(jobFailed('source down')),
          }),
        },
        {
          namespace: 'a',
          job: defineJob({
            name: 'works',
            everyMinutes: 1,
            run: () => Promise.resolve(jobDone('fine')),
          }),
        },
        {
          namespace: 'a',
          job: defineJob({
            name: 'not-due',
            everyMinutes: 7,
            run: () => Promise.resolve(jobDone('')),
          }),
        },
      ],
      MINUTE,
      r,
    );
    expect(outcomes.map((o) => [o.job, o.status, o.summary])).toEqual([
      ['a/throws', 'crashed', 'boom'],
      ['a/fails', 'failed', 'source down'],
      ['a/works', 'ok', 'fine'],
    ]);
    const stored = await getJson(
      namespaced(r.storage, 'a'),
      'jobs/fails.json',
      z.object({ status: z.string() }),
    );
    expect(stored._tag === 'ok' && stored.value).toEqual({ status: 'failed' });
  });
});
