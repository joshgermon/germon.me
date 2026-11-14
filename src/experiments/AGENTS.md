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

| Path                                            | What                                                                                                                    | Who may import it                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `src/styles/`, `src/components/ui/`, `src/lib/` | **The site's design system:** tokens, foundation CSS, Card/Icon/Kbd/Sheet, Result…                                      | Site and every experiment               |
| `src/experiments/kit/`                          | **Shared by experiments:** `ExperimentLayout`, `base.css` (night, grain, pills), the manifest type                      | Experiments (and the experiments index) |
| `src/experiments/registry.ts`                   | Every manifest, found automatically                                                                                     | The site (index page)                   |
| `src/experiments/<slug>/`                       | **Private** to one experiment: `experiment.ts` manifest, `styles/global.css`, components, domain, engine…               | That experiment and its routes only     |
| `src/pages/experiments/<slug>/`                 | Thin routes: the page, plus any on-demand endpoints (`prerender = false`, edge-cached)                                  | —                                       |
| `scripts/experiments/<slug>/`                   | Build-time scripts. A `refresh.ts` here runs before every deploy and every 30 min (until the manifest's `refreshUntil`) | —                                       |
| `public/experiments/<slug>/`                    | Static data files the experiment fetches                                                                                | —                                       |

`src/experiments/boundaries.test.ts` enforces the import column. To share something between two
experiments, move it into `kit/`; if the site wants it too, it belongs in the site's design system.

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
  `scripts/experiments/` and `public/experiments/`.
