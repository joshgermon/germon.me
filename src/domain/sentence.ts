/**
 * A sentence for the word-by-word focus-pull: running text broken into words, with inline
 * "pills" (links) kept whole.
 *
 * Every word and pill gets an `index` so the reveal can stagger them in reading order.
 * Punctuation that starts a text run right after a pill ("Kodo" + ". I write") becomes the
 * pill's `tail`, rendered glued to it, so a line never begins with a lonely full stop.
 *
 * Pure and generic over what a pill carries.
 */

/** One piece of a sentence: plain text, or a pill. */
export type Segment<P> =
  | { readonly _tag: 'Text'; readonly text: string }
  | { readonly _tag: 'Pill'; readonly pill: P };

/** One revealable unit: a word, or a pill with any punctuation that follows it. */
export type Token<P> =
  | { readonly _tag: 'Word'; readonly text: string; readonly index: number }
  | { readonly _tag: 'Pill'; readonly pill: P; readonly tail: string; readonly index: number };

const LEADING_PUNCTUATION = /^([.,:;!?]+)\s*/;

/**
 * Split a sentence into words and pills, in reading order.
 *
 * @param segments - The sentence.
 * @returns Tokens indexed 0, 1, 2… in order.
 */
export function tokenize<P>(segments: ReadonlyArray<Segment<P>>): ReadonlyArray<Token<P>> {
  const tokens: Token<P>[] = [];
  for (const segment of segments) {
    if (segment._tag === 'Pill') {
      tokens.push({ _tag: 'Pill', pill: segment.pill, tail: '', index: tokens.length });
      continue;
    }
    let rest = segment.text;
    const last = tokens.at(-1);
    const punctuation = LEADING_PUNCTUATION.exec(rest);
    if (punctuation && last?._tag === 'Pill') {
      tokens[tokens.length - 1] = { ...last, tail: last.tail + (punctuation[1] ?? '') };
      rest = rest.slice(punctuation[0].length);
    }
    for (const word of rest.split(/\s+/)) {
      if (word) tokens.push({ _tag: 'Word', text: word, index: tokens.length });
    }
  }
  return tokens;
}
