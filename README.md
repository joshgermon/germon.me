# germon.me

Josh Germon's personal site: one page of bento widgets under a hero sentence, with a ⌘K command
palette as the only navigation. Notes, career passes, a terminal, golden hour in Sydney, and live
GitHub activity.

Astro 7 (prerendered) + Svelte 5 islands + Tailwind v4, deployed to Cloudflare Workers. How the
code is organised and the rules it follows are in [AGENTS.md](./AGENTS.md); architectural
decisions are in [docs/adr](./docs/adr).

## Setup

Requires Node ≥ 22.12 and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # optional: add a GitHub token (see below)
pnpm dev
```

## Scripts

| Command        | What it does                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`     | Dev server with hot reload                                                                             |
| `pnpm build`   | Production build into `dist/`                                                                          |
| `pnpm preview` | Build, then serve it with `wrangler dev` (the real Worker runtime, edge cache headers, server islands) |
| `pnpm check`   | Everything CI runs: `astro check`, `svelte-check`, oxlint, Vitest                                      |
| `pnpm test`    | Vitest (domain and application tests)                                                                  |
| `pnpm format`  | oxfmt + prettier                                                                                       |
| `pnpm types`   | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc`                                  |
| `pnpm deploy`  | Build and deploy with your local Wrangler login (CI normally does this)                                |

## GitHub data and the `GITHUB_TOKEN`

The Projects, Commits and Contributions widgets show live GitHub data:

- **At build time** the page is prerendered with a snapshot, so it's complete on first paint.
- **At request time** each widget is a server island that re-renders with fresh data, cached at
  Cloudflare's edge for a day and served stale-while-revalidate for a week. GitHub sees about one
  request per widget per day. See [ADR 0001](./docs/adr/0001-github-data-freshness.md).

`GITHUB_TOKEN` is optional, but recommended:

|                                            | Without a token                                                                                           | With a token        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------- |
| Projects (REST)                            | Works; 60 requests/hour per IP                                                                            | 5,000 requests/hour |
| Commits + Contributions (GraphQL calendar) | Not available: the cards show the build snapshot, or a quiet placeholder if the build had no token either | Live                |

### Create the token

A fine-grained personal access token that can only read public data:

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** →
   Generate new token.
2. Name it e.g. `germon.me public data`, pick an expiry (and a reminder to rotate it).
3. **Repository access: Public repositories (read-only).** Add no permissions — public data and
   the contribution calendar need none.
4. Generate and copy it.

### Set it

- **Local dev and `pnpm preview`:** put it in `.dev.vars` (git-ignored):
  `GITHUB_TOKEN=github_pat_…`. `astro dev` and `astro build` also read it from the environment
  (`GITHUB_TOKEN=… pnpm build`).
- **Production Worker (runtime):** `pnpm exec wrangler secret put GITHUB_TOKEN`. The deploy
  workflow also uploads it as a Worker secret on each deploy (never as a plain var).
- **CI (build-time snapshot):** add a repository secret named `GH_PUBLIC_DATA_TOKEN`; the
  workflows pass it to `pnpm build` as `GITHUB_TOKEN`.

The token is read through `astro:env/server` (declared in `astro.config.ts`), wrapped in
`Redacted` and only unwrapped inside the GitHub adapters when calling `fetch`. It never reaches
the browser, logs or errors.

To refresh GitHub data before the day is up, purge the `github` cache tag in the Cloudflare
dashboard (Caching → Purge → Custom purge → Tag).

## Deploying

Cloudflare Workers, via GitHub Actions in [`.github/workflows`](./.github/workflows):

- `ci.yml` — on pull requests: `pnpm check` and a build.
- `preview.yml` — on pull requests labelled `preview`: uploads a preview version and comments its
  URL.
- `deploy.yml` — on pushes to `master`: check, build, deploy (with `GITHUB_TOKEN` as a Worker
  secret).

Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and optionally
`GH_PUBLIC_DATA_TOKEN`.

Static pages are served straight from Workers static assets; the Worker (`src/worker.ts`) only
runs for on-demand routes such as the GitHub server islands, whose responses are edge-cached.
