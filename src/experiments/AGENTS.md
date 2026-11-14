# src/experiments — fun one-offs that live on germon.me

Each experiment is a self-contained folder that ships with the site at `/experiments/<slug>/`,
shares the site's design system, and can be deleted without touching anything else. Astro splits
JavaScript per route, and each experiment brings its own stylesheet, so nothing here reaches the
home page's bundle or CSS.

## Start one

```sh
pnpm experiment:new my-idea "My idea"   # scaffolds everything below; pnpm dev to see it
pnpm build && pnpm experiment:og my-idea  # link-preview image → public/experiments/my-idea/og.jpg
```

For the preview image, set the manifest's `image` to `/experiments/<slug>/og.jpg`. The capture opens
`/experiments/<slug>/?og` at 1200×630 (2×) and waits for `<html data-og-ready>` (10 s at most), so
an experiment can hide its controls under `?og` and mark itself ready once drawn. Extra query
parameters pass through (`pnpm experiment:og ground-stop m=low`).

## Where things go

| Path                                            | What                                                                                                      | Who may import it                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `src/styles/`, `src/components/ui/`, `src/lib/` | **The site's design system:** tokens, foundation CSS, Card/Icon/Kbd/Sheet, Result…                        | Site and every experiment               |
| `src/experiments/kit/`                          | **Shared by experiments:** `ExperimentLayout`, `base.css` (night, grain, pills), the manifest type        | Experiments (and the experiments index) |
| `src/experiments/registry.ts`                   | Every manifest, found automatically                                                                       | The site (index page)                   |
| `src/experiments/jobs.ts`                       | Every experiment's scheduled jobs, found automatically                                                    | The site (the Worker)                   |
| `src/experiments/<slug>/`                       | **Private** to one experiment: `experiment.ts` manifest, `styles/global.css`, components, domain, engine… | That experiment and its routes only     |
| `src/experiments/<slug>/jobs.ts`                | Optional. Exports `jobs`: work the Worker runs on a schedule, with storage of the experiment's own        | —                                       |
| `src/pages/experiments/<slug>/`                 | Thin routes: the page, plus any on-demand endpoints (`prerender = false`, edge-cached)                    | —                                       |
| `scripts/experiments/<slug>/`                   | Build-time scripts, run by hand (bake a data file, generate a mask); their output is committed            | —                                       |
| `public/experiments/<slug>/`                    | Static data files the experiment fetches                                                                  | —                                       |

`src/experiments/boundaries.test.ts` enforces the import column. To share something between two
experiments, move it into `kit/`; if the site wants it too, it belongs in the site's design system.

## Scheduled jobs and storage

An experiment that needs something done on a schedule (record a feed, refresh a cache) exports
`jobs` from its `jobs.ts`:

```ts
export const jobs: readonly Job[] = [
  defineJob({ name: 'record', everyMinutes: 5, until: '2027-01-01T00:00:00Z', run: (context) => … }),
];
```

`run` gets `{ scheduledAt, storage, fetch, secret }` and returns `jobDone('summary')` or
`jobFailed('why')` (`~/lib/jobs`). `storage` is the site's store confined to
`experiments/<slug>/`: an experiment chooses its own keys and formats and cannot see anyone
else's. `secret('NAME')` reads a Worker secret as a `Redacted` (null when unset). Routes reach the same entries with
`namespaced(r2Storage(env.STORAGE), experimentNamespace(slug))`. Keep the job's work in a function
that takes the context (and anything else it needs) so it can be tested with `memoryStorage()`.
Set `until` so a finished experiment stops costing anything. Try a job locally with `pnpm dev`
and `curl "localhost:4321/cdn-cgi/handler/scheduled?time=<epoch ms on a due minute>"`.

Use a job for anything that changes while the page is up. Data that is fixed (a past event) is
baked by a script in `scripts/experiments/<slug>/`, run by hand, and committed under
`public/experiments/<slug>/`. CI never fetches experiment data.

## Rules

- Follow the site's rules (root AGENTS.md): tokens over raw values, TypeScript standards, motion.
  Experiment-only tokens go in the experiment's own `styles/tokens.css`.
- `kit/base.css` adds two screen variants: `compact:` (narrower than 680px or shorter than 520px:
  any phone, either way up) and `short:` (shorter than 520px: phones in landscape). Design for
  both; landscape phones have about 390px of height.
- Each experiment's `styles/global.css` imports Tailwind with `source(none)` and scans only its own
  folder and the kit; the site's stylesheet skips `src/experiments` (`@source not`).
- On-demand endpoints set an edge cache, so the Worker rarely runs.
- Delete an experiment by removing its folders under `src/experiments/`, `src/pages/experiments/`,
  `scripts/experiments/` and `public/experiments/`. Its jobs stop with it; its stored entries
  stay under `experiments/<slug>/` in the bucket until deleted there.
