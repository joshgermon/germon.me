/**
 * The latest sweep's status (domain/live.ts `LiveStatus`), as the recorder job stored it. The
 * Worker only reads the store; the edge caches the answer for a minute.
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
  const stored = await storage.get(KEYS.status);
  // Nothing recorded yet (or the store is unreachable): no content, and ask again soon.
  if (stored._tag === 'err' || stored.value === null) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  context.cache.set({ maxAge: 60, swr: 600, tags: ['ground-stop-live'] });
  return new Response(stored.value, { headers: { 'Content-Type': 'application/json' } });
};
