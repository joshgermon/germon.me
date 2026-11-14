/**
 * The live sky as JSON, on demand: a fresh sweep of adsb.lol, edge-cached for two minutes and
 * served stale for ten while it revalidates (so the Worker rarely does the work).
 */
import type { APIRoute } from 'astro';

import { liveSky } from '~/experiments/ground-stop/server/live-sky';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const snapshot = await liveSky(fetch);
  if (!snapshot) {
    return new Response(JSON.stringify({ error: 'adsb.lol unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  context.cache.set({ maxAge: 120, swr: 600, tags: ['ground-stop-live'] });
  return new Response(JSON.stringify(snapshot), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};
