import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { tokenize, type Segment, type Token } from './sentence';

const text = (t: string): Segment<string> => ({ _tag: 'Text', text: t });
const pill = (p: string): Segment<string> => ({ _tag: 'Pill', pill: p });

/** Read tokens back as the sentence a person would see. */
const read = (tokens: ReadonlyArray<Token<string>>): string =>
  tokens.map((t) => (t._tag === 'Word' ? t.text : `[${t.pill}]${t.tail}`)).join(' ');

/** Characters only: whitespace and pill brackets removed. */
const squash = (v: string): string => v.replace(/[\s[\]]/g, '');

describe('tokenize', () => {
  it('glues punctuation after a pill onto the pill', () => {
    const tokens = tokenize([
      text('in'),
      pill('Sydney'),
      text('. I write'),
      pill('notes'),
      text(', take'),
    ]);
    expect(read(tokens)).toBe('in [Sydney]. I write [notes], take');
    expect(tokens.find((t) => t._tag === 'Pill' && t.pill === 'Sydney')).toMatchObject({
      tail: '.',
    });
  });

  it('keeps leading punctuation as a word when no pill precedes it', () => {
    expect(read(tokenize([text('. Hello')]))).toBe('. Hello');
  });

  it('accepts a text run that is only punctuation', () => {
    expect(read(tokenize([pill('Jala'), text('.'), pill('Lately')]))).toBe('[Jala]. [Lately]');
  });

  const word = fc.stringMatching(/^[A-Za-z’]{1,8}$/);
  const segments = fc.array(
    fc.oneof(
      fc.array(word, { minLength: 1, maxLength: 5 }).map((ws) => text(ws.join(' '))),
      fc
        .tuple(fc.constantFrom('.', ',', ';'), fc.array(word, { maxLength: 3 }))
        .map(([p, ws]) => text(`${p} ${ws.join(' ')}`)),
      word.map(pill),
    ),
    { maxLength: 12 },
  );

  it('indexes tokens 0…n-1 in order', () => {
    fc.assert(
      fc.property(segments, (s) => {
        tokenize(s).forEach((t, i) => expect(t.index).toBe(i));
      }),
    );
  });

  it('loses no characters and keeps every pill', () => {
    fc.assert(
      fc.property(segments, (s) => {
        const original = s.map((x) => (x._tag === 'Text' ? x.text : x.pill)).join('');
        const tokens = tokenize(s);
        expect(squash(read(tokens))).toBe(squash(original));
        expect(tokens.filter((t) => t._tag === 'Pill').length).toBe(
          s.filter((x) => x._tag === 'Pill').length,
        );
      }),
    );
  });

  it('never produces an empty word', () => {
    fc.assert(
      fc.property(segments, (s) => {
        for (const t of tokenize(s)) if (t._tag === 'Word') expect(t.text).not.toBe('');
      }),
    );
  });
});
