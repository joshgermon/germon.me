# 1. GitHub data freshness: prerendered snapshot + edge-cached server islands

- Status: accepted
- Date: 2026-11-08

## Context

The home page shows three widgets fed by GitHub: Projects (recently pushed repos), Commits
(cumulative contributions) and Contributions (the year heatmap). The page is prerendered and
served from Cloudflare's edge without running the Worker, and it should stay that way: it's the
whole site's first paint.

Build-time data alone goes stale between deploys ("pushed 3 weeks ago" that is really 3 months).
We want the numbers to refresh about once a day, ISR/stale-while-revalidate style, without:

- an empty state or layout shift while fresh data loads,
- hitting GitHub per visitor (unauthenticated REST is 60 requests/hour per IP, and Workers share
  egress IPs),
- a second copy of the widget templates in client-side JavaScript.

Astro 7.3 gives us route caching (`cache: { provider: cacheCloudflare() }`): an on-demand route
calls `Astro.cache.set({ maxAge, swr, tags })` and the Cloudflare provider emits
`Cloudflare-CDN-Cache-Control` and `Cache-Tag`, which the Workers cache honours (the adapter
writes `cache.enabled: true` into the generated `wrangler.json`).

## Options

1. **Scheduled rebuilds** (cron deploy). Simple, but a full build and deploy a day to change a
   few numbers, and freshness depends on CI.
2. **`/api/github.json` (on-demand, cached) + a client script** that patches the widgets. One
   request per page view, but every widget needs a second renderer in the browser (or must
   become a fully hydrated island that ships its data), and the two renders can drift.
3. **Server islands** (`server:defer`) whose fallback is the build-time render. Chosen.

## Decision

Each GitHub card (`components/github/GitHubCard.astro`) renders:

```astro
<GitHubLive server:defer {widget} class={cls}>
  <GitHubView slot="fallback" {widget} activity={buildSnapshot} class={cls} />
</GitHubLive>
```

- **Fallback = build snapshot.** `GitHubView` renders into the static HTML from
  `loadActivitySnapshot()` (memoised per build), so first paint is complete.
- **Island = same view, live data.** `GitHubLive.astro` runs on the Worker at
  `/_server-islands/GitHubLive?…`, calls `loadLiveActivity()` and renders the _same_ view
  component. Astro swaps it in place of the fallback; identical markup means no layout shift.
- **Edge cache.** On success the island sets `Astro.cache.set({ maxAge: 1 day, swr: 7 days,
  tags: ['github'] })`: fresh for a day, then served stale for up to a week while one background
  request revalidates. GitHub sees roughly one request per widget per day per cache.
- **Graceful degradation.** If the widget's data isn't available live, the island answers
  `503` (cached 10 minutes, or a day when GitHub rejected the token). Astro's island loader
  only replaces the fallback on a `200 text/html`, so visitors keep the build snapshot.
- **`astro dev` renders the snapshot only** (no island): dev has no edge cache, so a live island
  would call GitHub on every reload. `pnpm preview` (wrangler dev) and production run islands.
- **Layers.** Domain (`domain/github/*`: `Contributions`, `Repo`, `Activity`) is pure;
  `application/github-activity.ts` owns the partial-failure policy over two ports;
  `adapters/github/*` are the REST and profile-fragment adapters (see ADR 0002) plus the composition root that reads
  `GITHUB_TOKEN` from `astro:env/server` (build env at build time, Worker secret at runtime).

## Consequences

- No new endpoint or client data contract; the only JS added is what the widgets already need
  (chart scrub, heatmap tooltip, "View" button).
- Three island requests per page view (one per card), all edge-cached; on a cache miss each
  island fetches both GitHub sources. Acceptable at this traffic; if it matters, give the
  service a per-widget selection.
- Island URLs embed encrypted props, so they change every deploy: the first visitor after a
  deploy warms the cache, and the fresh build snapshot covers that request.
- Purge early with the `github` cache tag (`Astro.cache.invalidate({ tags: ['github'] })` or the
  Cloudflare dashboard).
- Recency labels ("3w") can be up to a day (+ swr) old. Fine for a quiet label.

## Alternatives checked for reuse

There were no existing GitHub adapters or services in this codebase; the prototype's
`repos.ts`/`github.ts` were build-time-only scripts with inline fetches and swallowed errors.
Their filtering rules live on in `Repo.showcase` and `site/projects.ts`.
