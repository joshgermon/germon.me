/**
 * Fetches a note's rendered HTML for the palette's reader from the prerendered
 * `/notes/<id>.json` (see `pages/notes/[slug].json.ts`). Each body is fetched at most once per
 * page view; a failed fetch is forgotten so the next attempt retries.
 */
import * as z from 'zod/mini';

import { err, ok, type Result } from '~/lib/result';
import { noteBodyPath } from '~/site/notes-paths';

/** The body couldn't be loaded (offline, a stale deploy, a malformed response). */
export class NoteBodyUnavailable extends Error {
  readonly _tag = 'NoteBodyUnavailable' as const;

  /**
   * @param noteId - The note that failed.
   * @param reason - What went wrong, for logs.
   */
  constructor(
    readonly noteId: string,
    readonly reason: string,
  ) {
    super(`Note ${noteId} unavailable: ${reason}`);
  }
}

const NoteBody = z.object({ html: z.string() });

const cache = new Map<string, Promise<Result<string, NoteBodyUnavailable>>>();

const fetchBody = async (id: string): Promise<Result<string, NoteBodyUnavailable>> => {
  let response: Response;
  try {
    response = await fetch(noteBodyPath(id));
  } catch {
    return err(new NoteBodyUnavailable(id, 'network'));
  }
  if (!response.ok) return err(new NoteBodyUnavailable(id, `HTTP ${response.status}`));
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return err(new NoteBodyUnavailable(id, 'not JSON'));
  }
  const parsed = NoteBody.safeParse(json);
  return parsed.success
    ? ok(parsed.data.html)
    : err(new NoteBodyUnavailable(id, 'unexpected shape'));
};

/**
 * The rendered HTML of a note (trusted: it is our own build output).
 *
 * @param id - The note's collection id.
 * @returns The HTML, or why it couldn't be loaded.
 */
export function loadNoteBody(id: string): Promise<Result<string, NoteBodyUnavailable>> {
  const cached = cache.get(id);
  if (cached) return cached;
  const pending = fetchBody(id).then((result) => {
    if (result._tag === 'err') cache.delete(id);
    return result;
  });
  cache.set(id, pending);
  return pending;
}
