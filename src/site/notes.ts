/**
 * The notes collection, newest first, and the summary of each the palette and pages need.
 * Build-time only (reads the content collection).
 */
import { getCollection, type CollectionEntry } from 'astro:content';

import { plainText, preview, wordCount } from '~/domain/note-text';
import type { NoteSummary } from '~/site/commands';

/** A note entry from the content collection. */
export type NoteEntry = CollectionEntry<'notes'>;

/**
 * Every note, newest first.
 *
 * @returns The collection's entries sorted by date, descending.
 */
export async function allNotes(): Promise<ReadonlyArray<NoteEntry>> {
  const notes = await getCollection('notes');
  return notes.toSorted((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/**
 * What the palette shows for a note.
 *
 * @param note - The collection entry.
 * @returns Its headline, date, length, opening and searchable text.
 */
export function summarise(note: NoteEntry): NoteSummary {
  const body = note.body ?? '';
  return {
    id: note.id,
    title: note.data.excerpt,
    date: note.data.date,
    words: wordCount(body),
    preview: preview(body, 180),
    text: plainText(body),
  };
}
