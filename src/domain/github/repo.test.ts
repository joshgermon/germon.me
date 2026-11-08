import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { listing } from './github.arbitrary';
import * as Repo from './repo';

const OWNER = 'joshgermon';

const policy = (over: Partial<Repo.ShowcasePolicy> = {}): Repo.ShowcasePolicy => ({
  owner: OWNER,
  hidden: new Set(['secret']),
  hiddenPrefixes: ['advent-of-code'],
  blurbs: new Map(),
  limit: 7,
  ...over,
});

const base: Repo.Listing = {
  name: 'rq',
  owner: OWNER,
  fork: false,
  archived: false,
  description: 'A CLI. With more.',
  language: 'Go',
  url: 'https://github.com/joshgermon/rq',
  stars: 2,
  pushedAt: new Date('2026-10-19T15:20:11Z'),
};

describe('Repo.showcase', () => {
  it('only ever shows own, live, unhidden repos with a blurb, newest first, within the limit', () => {
    fc.assert(
      fc.property(
        fc.array(listing(OWNER), { maxLength: 40 }),
        fc.nat({ max: 10 }),
        (listings, limit) => {
          const shown = Repo.showcase(listings, policy({ limit }));
          expect(shown.length).toBeLessThanOrEqual(limit);
          for (const repo of shown) {
            const source = listings.find(
              (l) => l.name === repo.name && l.pushedAt === repo.pushedAt,
            );
            expect(source).toBeDefined();
            expect(source?.owner.toLowerCase()).toBe(OWNER);
            expect(source?.fork).toBe(false);
            expect(source?.archived).toBe(false);
            expect(repo.name).not.toBe('secret');
            expect(repo.name.startsWith('advent-of-code')).toBe(false);
            expect(repo.blurb.trim()).not.toBe('');
          }
          shown.forEach((r, i) => {
            const prev = shown[i - 1];
            if (prev) expect(prev.pushedAt.getTime()).toBeGreaterThanOrEqual(r.pushedAt.getTime());
          });
        },
      ),
    );
  });

  it('prefers hand-written blurbs and rescues repos with no description', () => {
    const shown = Repo.showcase(
      [base, { ...base, name: 'cubby', description: null, language: null }],
      policy({ blurbs: new Map([['cubby', 'Directory backups.']]) }),
    );
    expect(shown.map((r) => [r.name, r.blurb, r.language])).toEqual([
      ['rq', 'A CLI. With more.', 'Go'],
      ['cubby', 'Directory backups.', 'Other'],
    ]);
  });

  it('drops repos with only a blank description', () => {
    expect(Repo.showcase([{ ...base, description: '   ' }], policy())).toEqual([]);
  });
});

describe('Repo text', () => {
  it('cuts the tagline at the first sentence or em dash', () => {
    const [repo] = Repo.showcase([base], policy());
    expect(repo && Repo.tagline(repo)).toBe('A CLI');
    const [dash] = Repo.showcase([{ ...base, description: 'Backups — fast.' }], policy());
    expect(dash && Repo.tagline(dash)).toBe('Backups');
  });

  it('says recency quietly and in words', () => {
    const now = new Date('2026-11-08T00:00:00Z');
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect([0, 1, 5, 21, 210, 800].map((d) => Repo.recencyShort(ago(d), now))).toEqual([
      'today',
      '1d',
      '5d',
      '3w',
      '7mo',
      '2y',
    ]);
    expect([0, 1, 21, 400].map((d) => Repo.recencyLong(ago(d), now))).toEqual([
      'today',
      '1 day ago',
      '3 weeks ago',
      '1 year ago',
    ]);
  });

  it('never reports a negative age, even for pushes in the future', () => {
    fc.assert(
      fc.property(fc.date({ noInvalidDate: true }), fc.date({ noInvalidDate: true }), (a, b) => {
        expect(Repo.recencyShort(a, b)).toMatch(/^(today|\d+(d|w|mo|y))$/);
      }),
    );
  });
});
