/**
 * Plain-text views of a note's Markdown, for search keywords, previews and reading length.
 * Approximate on purpose: it strips the syntax a note actually uses (headings, links, images,
 * emphasis, code ticks, quotes, list bullets) rather than parsing CommonMark.
 */

/**
 * The note's prose as one line of plain text, headings dropped.
 *
 * @param markdown - The note's source.
 * @returns Words separated by single spaces.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^#.*$/gm, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How many words the note's prose has.
 *
 * @param markdown - The note's source.
 * @returns The word count (0 for an empty note).
 */
export function wordCount(markdown: string): number {
  const text = plainText(markdown);
  return text ? text.split(' ').length : 0;
}

/**
 * The opening of the note, cut at a word boundary with an ellipsis when it runs on.
 *
 * @param markdown - The note's source.
 * @param max - The longest preview, in characters (excluding the ellipsis).
 * @returns At most `max` characters of prose, plus `…` if anything was cut.
 */
export function preview(markdown: string, max: number): string {
  const text = plainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
