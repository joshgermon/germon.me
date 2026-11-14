/**
 * Runs every experiment's data refresh: `scripts/experiments/<slug>/refresh.ts`, for experiments
 * whose manifest `refreshUntil` hasn't passed. CI runs this before each deploy and on a schedule
 * (.github/workflows/experiments-refresh.yml); it writes `refreshed=<slugs>` to GITHUB_OUTPUT so
 * the schedule only builds and deploys when something ran.
 *
 *   pnpm experiments:refresh
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Experiment } from '../../src/experiments/kit/manifest';

const SCRIPTS = import.meta.dirname;
const EXPERIMENTS = join(SCRIPTS, '..', '..', 'src', 'experiments');

const refreshed: string[] = [];
for (const slug of readdirSync(SCRIPTS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)) {
  const script = join(SCRIPTS, slug, 'refresh.ts');
  const manifest = join(EXPERIMENTS, slug, 'experiment.ts');
  if (!existsSync(script) || !existsSync(manifest)) continue;
  const mod: { readonly experiment?: Experiment } = await import(manifest);
  const until = mod.experiment?.refreshUntil;
  if (until && Date.now() > Date.parse(until)) {
    console.warn(`refresh: ${slug} finished (refreshUntil ${until}), skipping`);
    continue;
  }
  console.warn(`refresh: ${slug}`);
  execFileSync('pnpm', ['exec', 'tsx', script], { stdio: 'inherit' });
  refreshed.push(slug);
}
const out = process.env['GITHUB_OUTPUT'];
if (out) appendFileSync(out, `refreshed=${refreshed.join(',')}\n`);
console.warn(`refresh: ${refreshed.length ? refreshed.join(', ') : 'nothing to do'}`);
