import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { experiments } from './registry';

describe('experiments registry', () => {
  it('finds each experiment, with a slug that matches its folder and a page to live on', () => {
    expect(experiments.length).toBeGreaterThan(0);
    const slugs = new Set<string>();
    for (const e of experiments) {
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
      expect(slugs.has(e.slug)).toBe(false);
      slugs.add(e.slug);
      expect(existsSync(join(import.meta.dirname, e.slug, 'experiment.ts'))).toBe(true);
      expect(
        existsSync(join(import.meta.dirname, '..', 'pages', 'experiments', e.slug, 'index.astro')),
      ).toBe(true);
      expect(Number.isNaN(Date.parse(e.published))).toBe(false);
    }
  });
});
