/**
 * The recorded sky: the last 90 minutes of flights as a gzipped `ObservedDay` (the same format
 * as the baked evening), as the recorder job stored it. Edge-cached for a minute.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { r2Storage } from '~/adapters/r2-storage';
import { experiment } from '~/experiments/ground-stop/experiment';
import { KEYS } from '~/experiments/ground-stop/server/recorder';
import { experimentNamespace } from '~/experiments/kit/manifest';
import { namespaced } from '~/lib/storage';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const storage = namespaced(r2Storage(env.STORAGE), experimentNamespace(experiment.slug));
  const stored = await storage.get(KEYS.tracks);
  // Nothing recorded yet (or the store is unreachable): no content, and ask again soon.
  if (stored._tag === 'err' || stored.value === null) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  context.cache.set({ maxAge: 60, swr: 600, tags: ['ground-stop-live'] });
  // Gzipped at rest and sent as it is: the page checks the bytes (lib/load-day.ts).
  return new Response(stored.value, { headers: { 'Content-Type': 'application/octet-stream' } });
};
