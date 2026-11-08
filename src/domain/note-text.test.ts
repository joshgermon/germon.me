import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { plainText, preview, wordCount } from './note-text';

const note = `# 03-09-22
## This got me thinking

The article (and **all** of [Alex's](https://example.com) articles) is _great_.

- one \`password123\`
- two

> quoted
`;

describe('plainText', () => {
  it('drops headings and Markdown syntax, keeping the words', () => {
    expect(plainText(note)).toBe(
      "The article (and all of Alex's articles) is great. one password123 two quoted",
    );
  });

  it('never leaves runs of whitespace or syntax characters', () => {
    fc.assert(
      fc.property(fc.string(), (md) => {
        const text = plainText(md);
        expect(text).not.toMatch(/\s{2}|^\s|\s$|[*_`>]/);
      }),
    );
  });
});

describe('wordCount', () => {
  it('counts prose words only', () => {
    expect(wordCount(note)).toBe(13);
    expect(wordCount('')).toBe(0);
    expect(wordCount('# Only a heading')).toBe(0);
  });
});

describe('preview', () => {
  it('returns short prose unchanged', () => {
    expect(preview('Hello there.', 50)).toBe('Hello there.');
  });

  it('never exceeds the limit, and marks a cut with an ellipsis', () => {
    fc.assert(
      fc.property(fc.lorem({ maxCount: 80 }), fc.integer({ min: 10, max: 200 }), (md, max) => {
        const p = preview(md, max);
        const full = plainText(md);
        if (full.length <= max) expect(p).toBe(full);
        else {
          expect(p.endsWith('…')).toBe(true);
          expect(p.length).toBeLessThanOrEqual(max + 1);
          expect(full.startsWith(p.slice(0, -1))).toBe(true);
        }
      }),
    );
  });
});
