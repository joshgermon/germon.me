# germon.me — how this codebase works

Josh Germon's personal site: one page of bento widgets under a hero sentence, with a ⌘K command
palette as the only navigation. Astro 7 (static by default) + Svelte 5 islands + Tailwind v4,
deployed to Cloudflare Workers. Read this before adding anything.

## Commands

|                                        |                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                             | Dev server                                                                        |
| `pnpm check`                           | Everything CI checks: `astro check`, `svelte-check`, oxlint, vitest               |
| `pnpm test`                            | Vitest                                                                            |
| `pnpm format`                          | oxfmt (TS/Svelte) + prettier (`.astro`)                                           |
| `pnpm preview`                         | Production build served by `wrangler dev`                                         |
| `pnpm experiment:new <slug> "<Title>"` | Scaffold an experiment (src/experiments/AGENTS.md)                                |
| `pnpm experiment:og <slug>`            | Capture an experiment's link-preview image (after `pnpm build`)                   |
| `pnpm types`                           | Generate `worker-configuration.d.ts` (gitignored; runs on install and in `check`) |

## Layout

```txt
src/
  pages/            Routes. index.astro only *arranges* components.
  layouts/          BaseLayout: <head>, fonts, global CSS.
  components/
    ui/             Design-system primitives (Card, Icon, Kbd, Sheet…). No content, no data.
    shell/          Page chrome: Backdrop, TopBar, Toast.
    hero/           The hero sentence and its pills.
    palette/        The ⌘K command palette and its views.
    widgets/        One file (or folder) per bento widget.
    github/         Widgets fed by live GitHub data.
  site/             Content: who Josh is, career, commands. Change copy here, never in components.
  domain/           Pure logic (no I/O, no DOM, no Date.now): coffee slots, clocks, GitHub stats.
  application/      Operations that sequence effects through ports (e.g. GitHub activity, cached).
  adapters/         Translation to the outside world (GitHub API, R2). Raw external shapes stay here.
  lib/              Small shared infrastructure: Result, defects, Redacted, actions, ui-state,
                    storage (the blob-store port), jobs (scheduled work).
  styles/           tokens.css (design tokens) and global.css.
  content/notes/    Markdown notes (Astro content collection).
  experiments/      One-off experiments at /experiments/<slug>/ — see src/experiments/AGENTS.md.
  worker.ts         Worker entry / composition root: requests, and the cron tick that runs jobs.
```

## Rules

**Design system first.** Every colour, radius, shadow, font, size and easing comes from
`src/styles/tokens.css` via Tailwind utilities (`bg-surface`, `text-fg-muted`, `rounded-card`,
`ease-out-strong`, `text-caption`…). No hex values or magic numbers in components; add a token
instead. Nothing renders under 11px. Colour is reserved for things that mean something (brand
passes, sunlight, a green "up").

**Components.** Static by default: `.astro` renders HTML with zero JS. Reach for a Svelte island
only for real interactivity, hydrate it as late as possible (`client:visible`, then
`client:idle`; `client:load` only for above-the-fold interaction), and keep it small. Every
widget is a `ui/Card`. Islands share state only through `lib/ui-state.ts` (nanostores). Every
user intent — palette row, chip, pill, shortcut — is an `Action` run by `lib/actions.ts#perform`.

**Phones get sheets.** On phones (`phone:` variant, ≤680px) every overlay is the shared
`ui/Sheet.svelte`: grabber, drag to dismiss with velocity, rubber-band, scrim, Esc, focus trap.
No centred modals or popovers on phones.

**Motion** (Emil Kowalski): animate only `transform`/`opacity`; strong ease-out
(`ease-out-strong`) for UI, `ease-drawer` for sheets; under 300ms for UI; pressables use the
`pressable` utility; never animate keyboard-driven actions (the palette opens instantly from ⌘K);
gate hover behind the `hover:` variant (fine pointers only); respect `prefers-reduced-motion`.

**TypeScript** (see the coding-standards skill): strictest config, no `any`, no `!`, no casts
except `as const` (or a `// SAFETY:` comment). Expected failures are `Result` values with tagged
errors (`lib/result.ts`); throw only for defects (`lib/defects.ts`). Parse external data at the
adapter boundary with Zod into domain types. Model lifecycle states as tagged unions. Wrap secrets
in `Redacted`. Every exported symbol has JSDoc. No barrel files, no `utils.ts`.

**Content.** Career shows summaries only, never CV bullet points or metrics.

**Performance.** The home page is prerendered to static HTML, served from Cloudflare's edge
without running the Worker. CSS is inlined; fonts are self-hosted and subset; images go through
`astro:assets`. Any on-demand route must set an edge cache (`Astro.cache` / `context.cache`,
stale-while-revalidate) so the Worker rarely does real work.

**Storage and scheduled jobs.** The site has one store, the R2 bucket bound as `STORAGE`, used
only through the `Storage` port (`lib/storage.ts`) and always inside a namespace
(`namespaced(storage, 'experiments/<slug>')`), so no user can touch another's entries. The Worker
has one cron trigger, a tick every minute; work is a `Job` (`lib/jobs.ts`: a name, `everyMinutes`,
an optional `until`, and `run(context)` returning a `Result`). A job gets its owner's namespaced
storage and a `fetch`, and knows nothing about cron or Cloudflare. Never add a second cron
trigger or a job-specific `scheduled` branch: declare a job. Each run's outcome is logged and
stored at `<namespace>/jobs/<name>.json`.

## Tests

Vitest. Test domain modules directly (fast-check for parsers and calculations), application
services through their ports with in-memory adapters. Never `vi.mock` modules.
