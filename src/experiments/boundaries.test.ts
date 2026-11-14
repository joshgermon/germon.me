/**
 * The experiments' boundaries, enforced: what's shared is importable, what's private isn't.
 *
 * - An experiment (src/experiments/<slug>/) may import itself, the kit, and the site's shared
 *   layer: ~/components/ui, ~/lib, ~/styles. Never another experiment or other site internals.
 * - The kit may import the site's shared layer and ~/site/profile, never an experiment.
 * - The site may import the kit and the registry, never an experiment, except each experiment's
 *   own routes under src/pages/experiments/<slug>/.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? files(join(dir, d.name))
      : /\.(ts|svelte|astro)$/.test(d.name)
        ? [join(dir, d.name)]
        : [],
  );
const imports = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](~\/[^'"]+)['"]/g)].map(
    (m) => m[1] ?? '',
  );

const SHARED = ['~/components/ui/', '~/lib/', '~/styles/'];
const experimentOf = (path: string): string | null =>
  /^~\/experiments\/([^/]+)\//.exec(path)?.[1] ?? null;

describe('experiment boundaries', () => {
  for (const file of files(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/');
    const where = /^experiments\/([^/]+)\//.exec(rel)?.[1];
    const route = /^pages\/experiments\/([^/]+)\//.exec(rel)?.[1];
    const bad = imports(file).filter((spec) => {
      const target = experimentOf(spec);
      if (where === 'kit')
        return target !== null && target !== 'kit'
          ? true
          : !(
              target === 'kit' ||
              SHARED.some((s) => spec.startsWith(s)) ||
              spec === '~/site/profile'
            );
      if (where)
        return target !== null
          ? target !== where && target !== 'kit'
          : !SHARED.some((s) => spec.startsWith(s));
      if (route) return target !== null && target !== route && target !== 'kit';
      return target !== null && target !== 'kit' && spec !== '~/experiments/registry';
    });
    if (bad.length > 0) it(`${rel} stays inside its boundary`, () => expect(bad).toEqual([]));
  }
  it('checks something', () => expect(files(join(SRC, 'experiments')).length).toBeGreaterThan(0));
});
