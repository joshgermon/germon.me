import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { epochOf } from '~/experiments/ground-stop/domain/live';
import { decode } from '~/experiments/ground-stop/domain/observed-codec';
import { err, ok } from '~/experiments/ground-stop/lib/result';
import type { JobContext } from '~/lib/jobs';
import { getJson, memoryStorage, putJson } from '~/lib/storage';

import { KEYS, recordSky } from './recorder';
import type { SweepResult } from './sweep';

const sweepAt = (minute: number, lon: number): SweepResult => ({
  at: epochOf(minute),
  sightings: [{ id: 'abc123', callsign: 'DAL1', lat: 39, lon, altitude: 36000 }],
  partial: false,
  sources: ['adsb.lol'],
  faa: { updated: 'now', statuses: [] },
  trouble: '',
});

describe('recordSky', () => {
  it('follows flights across runs and stores the status, tracks, series and sweeps', async () => {
    const storage = memoryStorage();
    const context: JobContext = { scheduledAt: 0, storage, fetch, secret: () => null };
    // 2,000 minutes in is 14 Nov, 14:20 UTC; a reading from a week before is waiting.
    await putJson(storage, KEYS.series('2026-11-07'), [[2002 - 10_080, 4200, 12]]);

    for (const [minute, lon] of [
      [2000, -100],
      [2002, -99.6],
      [2004, -99.2],
    ] as const) {
      const done = await recordSky(context, () => Promise.resolve(ok(sweepAt(minute, lon))));
      expect(done._tag).toBe('ok');
    }

    const status = await getJson(
      storage,
      KEYS.status,
      z.object({ tracked: z.number(), usAirborne: z.number() }),
    );
    expect(status._tag === 'ok' && status.value).toEqual({ tracked: 1, usAirborne: 1 });

    const tracks = await storage.get(KEYS.tracks);
    const day = tracks._tag === 'ok' && tracks.value ? decode(gunzipSync(tracks.value)) : null;
    expect(day?._tag === 'Ok' && day.value.window).toEqual({ start: 2000, end: 2004 });
    expect(day?._tag === 'Ok' && day.value.tracks.count).toBe(1);
    expect(day?._tag === 'Ok' && day.value.series.usAirborneBaseline[2]).toBe(4200);

    const series = await getJson(storage, KEYS.series('2026-11-14'), z.array(z.array(z.number())));
    expect(series._tag === 'ok' && series.value).toEqual([
      [2000, 1, 0],
      [2002, 1, 0],
      [2004, 1, 0],
    ]);
    const sweeps = await storage.list(KEYS.sweeps('2026-11-14'));
    expect(sweeps._tag === 'ok' && sweeps.value).toHaveLength(3);
  });

  it('reports a failed sweep and leaves the record alone', async () => {
    const storage = memoryStorage();
    const failed = await recordSky({ scheduledAt: 0, storage, fetch, secret: () => null }, () =>
      Promise.resolve(err({ _tag: 'SweepFailed', trouble: 'adsb.lol RateLimited ×15' })),
    );
    expect(failed._tag === 'err' && failed.error.message).toContain('adsb.lol RateLimited ×15');
    const keys = await storage.list('');
    expect(keys._tag === 'ok' && keys.value).toEqual([]);
  });
});
