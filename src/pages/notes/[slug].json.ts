/**
 * A note's rendered body as JSON (`{ html }`), prerendered for every note. The palette's reader
 * fetches it on demand so the home page doesn't carry every note's HTML.
 */
import type { APIRoute, GetStaticPaths } from 'astro';

import { allNotes } from '~/site/notes';

export const getStaticPaths = (async () => {
  const notes = await allNotes();
  return notes.map((note) => ({
    params: { slug: note.id },
    props: { html: note.rendered?.html ?? '' },
  }));
}) satisfies GetStaticPaths;

/** Serve the prerendered body. */
export const GET: APIRoute = ({ props }) => {
  const html: unknown = props['html'];
  return new Response(JSON.stringify({ html: typeof html === 'string' ? html : '' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
