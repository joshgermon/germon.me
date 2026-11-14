# Ground stop — /experiments/ground-stop/

The FAA's nationwide ground stop on Friday 13 November 2026 (3:54–8:16 p.m. ET), shown with real
flight data on a dot-matrix globe and compared with the previous Friday. One screen: a headline
sentence whose pills jump to moments, a moment card (← →), readouts, clickable airport columns, a
timeline with a live stretch, and ⌘K. One Svelte island draws the three.js globe. The page is
static; a scheduled job records the live sky and two on-demand routes (`live.json`, `live.bin`)
serve what it stored. Follow src/experiments/AGENTS.md and the
site's rules; this file covers what is specific to this experiment.

## Data

- **The evening** (`scripts/experiments/ground-stop/bake.ts`, run by hand): downloads adsb.lol's
  half-hour `globe_history` heatmaps (ODbL) into `.cache/` for 2 p.m. ET up to the latest
  published half-hour (capped at `WINDOW_LIMIT`, 8 a.m. Saturday), and the same hours a week
  earlier, then bakes `public/experiments/ground-stop/observed.bin.gz`, which is committed.
- **Live** (`jobs.ts` → `server/recorder.ts`): every 4 minutes the `record-sky` job sweeps the
  sky (`server/sweep.ts`), reads the FAA's NAS Status feed, and adds the sweep to the
  recorded sky (`domain/recorder.ts`): each aircraft is followed by its ICAO address from sweep
  to sweep, so live flights have real tracks and take-offs are counted the way the bake counts
  them. It stores, under `experiments/ground-stop/` in the site's bucket:
  - `live/sky.bin`: the recorder's state, the last 90 minutes of every flight (`sky-codec.ts`);
  - `live/tracks.bin.gz`: that as an `ObservedDay`, served by `live.bin`;
  - `live/status.json`: the latest `LiveStatus` (counts, FAA list), served by `live.json`;
  - `series/<date>.json`: every sweep's reading, kept for good; a week on, it is the live
    view's "last week" comparison;
  - `sweeps/<date>/<hhmm>.json.gz`: each raw sweep, kept 14 days, for re-baking.
    The sweep asks adsb.lol 30 point queries (`adapters/adsb-live.ts`). What each source does
    when asked from a Worker (measured 14 Nov 2026):
  - adsb.lol answers, allowing a burst of about a dozen requests and then `429` with
    `Retry-After`: about 12 requests every 75 s or so, sustained. The sweep waits as told,
    so its 30 points take about three minutes, which is why it runs every 4.
  - adsb.fi sits behind Cloudflare and answers Workers `403`; it is asked once and skipped.
  - The OpenSky Network (`adapters/opensky.ts`, one request for the whole box) times out from
    Cloudflare's network, so the job doesn't use it. It works from elsewhere: a collector
    outside Cloudflare could pass credentials to `sweepSky`.
  - airplanes.live and adsb.one refuse unannounced clients. Don't work around a block; ask.
    The page polls `live.json` and loads `live.bin` when there is something newer. The job's
    `until` ends the recording; a status older than 15 minutes is not shown as live.
- `data/us-raster.ts` (`pnpm tsx scripts/experiments/ground-stop/us-raster.ts`) is the "over the
  US" test both use, so live and baked counts agree. `data/land-mask.ts` is the globe's dots.

## Layout

```txt
src/experiments/ground-stop/
  experiment.ts        Manifest (title, dates, preview image).
  jobs.ts              Scheduled jobs: record-sky.
  site/moments.ts      All copy: the moments and the headline sentence.
  adapters/            adsb-heatmap.ts (readsb binary), opensky.ts + adsb-live.ts + faa-nas.ts (live),
                       ourairports.ts (CSV, Zod).
  domain/              Pure: clock, sphere, ARTCCs, events + sources, observed.ts (tracks,
                       simplification, take-offs, shortfall), observed-codec.ts, recorder.ts
                       (following flights between sweeps), sky-codec.ts, live.ts, us-area.ts,
                       day-stats.ts. Tested with vitest + fast-check.
  server/              sweep.ts (one sweep of the live networks), recorder.ts (the job's work).
  engine/              three.js: globe.ts (scene + API), shaders.ts, palette.ts (tokens).
  components/          GroundStop.svelte (the island, with `perform`), Sentence, MomentCard,
                       Readouts, Chart, AirportCard, Palette, About, Timeline.
  styles/              global.css (Tailwind, scoped to this folder + kit), tokens.css.
  lib/                 result.ts, load-day.ts.
  data/                Generated: land-mask.ts, us-raster.ts. Do not edit.
```

## Rules

**Real or labelled.** Every number on screen is either measured from the baked ADS-B data (and
compared like-for-like with the week before) or a reported figure that names its source in
`domain/events.ts`. Prefer the FAA Command Center's advisories for times. Never invent a time.

**`ObservedDay` is the seam.** The baked evening and the recorded live sky are both
`ObservedDay`s; components and the engine only read that. Any other source (BTS, OpenSky) should
produce the same shape.

**Two stretches of time.** The clock runs over the baked evening, then (after a break where
nothing was recorded) the live stretch: the recorder's window. `setTime` steps over the break;
the timeline draws it.

**Small screens.** On `compact:` screens the globe comes first: the sentence and readouts are
hidden, the moment card collapses to one line (tap to expand), and the timeline slims down.
`layout` in GroundStop.svelte (desktop, portrait, landscape) sets the globe's framing and is
recomputed on resize and rotate.

**Links.** `?m=<moment id>` opens on a moment (the address updates as you move between them).
`?og` is the link-preview composition: no controls, no live polling.

**Interaction, not scrolling.** Every intent (pill, moment dot, ← →, ⌘K row, airport click,
scrub, play) is an `Action` handled by `perform` in GroundStop.svelte.

**The engine reads tokens.** Scene colours are `@theme static` tokens in `styles/tokens.css`,
read at runtime by `engine/palette.ts`. The backdrop is the kit's `night` + `grain`.

**Colour means the same as on the site.** Red (accent) is stopped: the country, the centres,
departures lost. Green (up) is moving again. Everything else is ink on the night.

**Licence.** Flight data © adsb.lol contributors (ODbL 1.0), adsb.fi and the OpenSky Network. Keep the credits in
About. The baked file is a derived database and stays under ODbL.
