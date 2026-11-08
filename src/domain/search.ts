/**
 * Command-palette filtering: does a row match what was typed, and how well. Raycast-style
 * forgiveness — word prefixes, keywords, and as a last resort the letters in order ("brnt" →
 * "Browse Notes") — ranked so the obvious answer is first.
 */

/** What a row is searched by. */
export type Searchable = {
  readonly title: string;
  /** Extra words: subtitle, synonyms, body text. */
  readonly keywords: string;
};

/** How well a row matches, best first. `0` means no match. */
const SCORE = {
  exact: 100,
  titlePrefix: 80,
  wordPrefix: 60,
  titleContains: 45,
  allTokens: 30,
  inOrder: 10,
} as const;

const normalise = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Whether every character of `needle` appears in `hay`, in order. */
const subsequence = (hay: string, needle: string): boolean => {
  let i = 0;
  for (const c of hay) if (c === needle[i]) i++;
  return i === needle.length;
};

/**
 * Score one row against a query.
 *
 * @param query - What was typed (any case and spacing).
 * @param item - The row's title and keywords.
 * @returns 0 for no match, higher for better matches; every row scores 1 for an empty query.
 */
export function score(query: string, item: Searchable): number {
  const q = normalise(query);
  if (!q) return 1;
  const title = normalise(item.title);
  if (title === q) return SCORE.exact;
  if (title.startsWith(q)) return SCORE.titlePrefix;
  if (title.split(/[\s\-_./·]+/).some((w) => w.startsWith(q))) return SCORE.wordPrefix;
  if (title.includes(q)) return SCORE.titleContains;
  const hay = `${title} ${normalise(item.keywords)}`;
  const tokens = q.split(' ');
  if (tokens.every((t) => hay.includes(t))) {
    // Prefer rows whose title carries more of the query.
    return SCORE.allTokens + tokens.filter((t) => title.includes(t)).length;
  }
  const compact = q.replace(/ /g, '');
  if (compact.length > 1 && subsequence(title.replace(/ /g, ''), compact)) return SCORE.inOrder;
  return 0;
}

/**
 * Keep the rows that match `query`, best first; ties keep their original order.
 *
 * @param items - Rows in their natural order.
 * @param query - What was typed.
 * @param by - How to search a row.
 * @returns The matching rows, ranked.
 */
export function rank<T>(
  items: ReadonlyArray<T>,
  query: string,
  by: (item: T) => Searchable,
): ReadonlyArray<T> {
  return items
    .map((item, i) => ({ item, i, s: score(query, by(item)) }))
    .filter((r) => r.s > 0)
    .toSorted((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
