/**
 * Where notes live on the site. Safe to import from the browser (no content-collection access).
 */

/** The URL of a note's own page. */
export const notePath = (id: string): string => `/notes/${id}/`;

/** The URL of a note's rendered body (`{ html }`), fetched by the palette's reader. */
export const noteBodyPath = (id: string): string => `/notes/${id}.json`;
