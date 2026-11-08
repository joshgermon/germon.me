/**
 * The palette's command registry as JSON, prerendered under its content hash (see
 * `components/palette/palette-data.ts`). The palette island fetches it when it hydrates.
 */
import type { APIRoute, GetStaticPaths } from 'astro';

import { loadPaletteData } from '~/components/palette/palette-data';

export const getStaticPaths = (async () => {
  const { version } = await loadPaletteData();
  return [{ params: { version } }];
}) satisfies GetStaticPaths;

/** Serve this build's registry. */
export const GET: APIRoute = async () => {
  const { json } = await loadPaletteData();
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
