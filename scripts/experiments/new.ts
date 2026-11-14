/**
 * Scaffolds a new experiment, following src/experiments/AGENTS.md:
 *
 *   pnpm experiment:new <slug> "<Title>"
 *
 * Creates src/experiments/<slug>/ (manifest, stylesheet, an island, an AGENTS.md) and the route
 * src/pages/experiments/<slug>/index.astro. It appears in the /experiments index automatically.
 */
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [slug, title = slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: pnpm experiment:new <slug> "<Title>"   (slug: lowercase-with-dashes)');
  process.exit(1);
}
const ROOT = join(import.meta.dirname, '..', '..');
const dir = join(ROOT, 'src', 'experiments', slug);
const page = join(ROOT, 'src', 'pages', 'experiments', slug);
if (existsSync(dir) || existsSync(page)) {
  console.error(`experiment "${slug}" already exists`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const name = slug.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
const files: Record<string, string> = {
  [join(dir, 'experiment.ts')]: `import { defineExperiment } from '~/experiments/kit/manifest';

/** ${title}. */
export const experiment = defineExperiment({
  slug: '${slug}',
  title: ${JSON.stringify(title)},
  description: 'One or two sentences about ${title}.',
  published: '${today}',
  status: 'live',
});
`,
  [join(dir, 'styles', 'global.css')]: `@import 'tailwindcss' source(none);
@source '../';
@source '../../kit';
@import '../../kit/base.css';
`,
  [join(dir, 'components', `${name}.svelte`)]: `<!--
  @component
  ${title}: the experiment's island.
-->
<script lang="ts">
  let count = $state(0);
</script>

<main class="relative z-10 grid min-h-dvh place-items-center p-gutter">
  <div class="max-w-(--container-page) text-center">
    <h1 class="text-lede font-lede">
      A new <button type="button" class="pill" onclick={() => count++}>experiment</button>, pressed {count} times.
    </h1>
  </div>
</main>
`,
  [join(dir, 'AGENTS.md')]: `# ${title}

What this experiment is, where its data comes from, and anything specific to working on it.
Follow src/experiments/AGENTS.md for what's shared and what's private.
`,
  [join(page, 'index.astro')]: `---
/** ${title} (src/experiments/${slug}). This route only arranges. */
import ${name} from '~/experiments/${slug}/components/${name}.svelte';
import { experiment } from '~/experiments/${slug}/experiment';
import ExperimentLayout from '~/experiments/kit/ExperimentLayout.astro';

import '~/experiments/${slug}/styles/global.css';
---

<ExperimentLayout {experiment}>
  <${name} client:load />
</ExperimentLayout>
`,
};
for (const [path, content] of Object.entries(files)) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}
symlinkSync('AGENTS.md', join(dir, 'CLAUDE.md'));
console.warn(`experiment: created ${slug} → /experiments/${slug}/ (pnpm dev to see it)`);
