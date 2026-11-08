import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rank, score, type Searchable } from './search';

const row = (title: string, keywords = ''): Searchable => ({ title, keywords });
const titles = (rows: ReadonlyArray<Searchable>): ReadonlyArray<string> => rows.map((r) => r.title);
const id = (r: Searchable): Searchable => r;

const commands = [
  row('Browse Notes', 'read writing blog posts'),
  row('Browse Engineering', 'career work history jobs'),
  row('Email Josh', 'contact hire message mail'),
  row('Copy Email Address', 'clipboard contact'),
  row('Open GitHub', 'code repos profile'),
  row('Go to Photography', 'angela photographer camera website'),
];

describe('score', () => {
  it('matches everything for an empty or blank query', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.constantFrom('', ' ', '  \t'), (t, k, q) => {
        expect(score(q, row(t, k))).toBe(1);
      }),
    );
  });

  it('ignores case and surrounding space', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (t) => {
        expect(score(` ${t.toUpperCase()} `, row(t))).toBe(score(t, row(t)));
      }),
    );
  });

  it('always matches a row by its own title', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
        (t) => {
          expect(score(t, row(t))).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('ranks exact > prefix > word prefix > contains > keywords > in-order letters', () => {
    const q = 'note';
    expect(score(q, row('Note'))).toBeGreaterThan(score(q, row('Notes')));
    expect(score(q, row('Notes'))).toBeGreaterThan(score(q, row('Browse Notes')));
    expect(score(q, row('Browse Notes'))).toBeGreaterThan(score(q, row('Footnotes')));
    expect(score(q, row('Footnotes'))).toBeGreaterThan(score(q, row('Writing', 'note')));
    expect(score(q, row('Writing', 'note'))).toBeGreaterThan(score(q, row('No Tea')));
    expect(score(q, row('No Tea'))).toBeGreaterThan(0);
  });

  it('needs every word of a multi-word query', () => {
    expect(score('email copy', row('Copy Email Address'))).toBeGreaterThan(0);
    expect(score('email zebra', row('Copy Email Address'))).toBe(0);
  });
});

describe('rank', () => {
  it('returns a subset of the rows, without duplicates', () => {
    fc.assert(
      fc.property(fc.string(), (q) => {
        const out = rank(commands, q, id);
        expect(new Set(out).size).toBe(out.length);
        for (const r of out) expect(commands).toContain(r);
      }),
    );
  });

  it('keeps the natural order for an empty query', () => {
    expect(rank(commands, '', id)).toEqual(commands);
  });

  it('puts the obvious answer first', () => {
    expect(titles(rank(commands, 'email', id))).toEqual(['Email Josh', 'Copy Email Address']);
    expect(titles(rank(commands, 'gh', id))[0]).toBe('Open GitHub');
    expect(titles(rank(commands, 'contact', id))).toEqual(['Email Josh', 'Copy Email Address']);
    expect(titles(rank(commands, 'photos', id))).toEqual([]);
    expect(titles(rank(commands, 'photo', id))).toEqual(['Go to Photography']);
  });
});
