# Ground stop — /experiments/ground-stop/

The FAA's nationwide ground stop on Friday 13 November 2026 (3:54–8:16 p.m. ET), shown with real
flight data on a dot-matrix globe and compared with the previous Friday. One screen: a headline
sentence whose pills jump to moments, a moment card (← →), readouts, clickable airport columns, a
timeline with live mode, and ⌘K. One Svelte island draws the three.js globe. The page is static;
one on-demand route (`live.json`) runs on the Worker. Follow src/experiments/AGENTS.md and the
site's rules; this file covers what is specific to this experiment.

## Data

- **History** (`scripts/experiments/ground-stop/refresh.ts`): downloads adsb.lol's half-hour
  `globe_history` heatmaps (ODbL) into `.cache/` for 2 p.m. ET up to the latest published
  half-hour (capped at `WINDOW_LIMIT`, 8 a.m. Saturday), and the same hours a week earlier, then
  bakes `public/experiments/ground-stop/observed.bin.gz`. CI runs it before each deploy and every
  30 minutes until the manifest's `refreshUntil`, so the evening grows on its own.
- **Live** (`src/pages/experiments/ground-stop/live.json.ts`): queries 30 points across the US
  on adsb.lol and adsb.fi (about one request a second each, so ~17 s per sweep) and reads the
  FAA's NAS Status feed. Edge-cached for two minutes. The page polls it every two minutes; past
  the baked data, the globe shows the live aircraft.
- `data/us-raster.ts` (`pnpm tsx scripts/experiments/ground-stop/us-raster.ts`) is the "over the
  US" test both use, so live and baked counts agree. `data/land-mask.ts` is the globe's dots.

## Layout

```txt
src/experiments/ground-stop/
  experiment.ts        Manifest (title, dates, refreshUntil).
  site/moments.ts      All copy: the moments and the headline sentence.
  adapters/            adsb-heatmap.ts (readsb binary), adsb-live.ts + faa-nas.ts (live feeds),
                       ourairports.ts (CSV, Zod).
  domain/              Pure: clock, sphere, ARTCCs, events + sources, observed.ts (tracks,
                       simplification, take-offs, shortfall), observed-codec.ts, live.ts,
                       us-area.ts, day-stats.ts. Tested with vitest + fast-check.
  server/live-sky.ts   The live sweep (runs on the Worker).
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

**The baked file is the seam.** Any other source (BTS, OpenSky) should bake into the same
`ObservedDay` shape; components and the engine only read that.

**Interaction, not scrolling.** Every intent (pill, moment dot, ← →, ⌘K row, airport click,
scrub, play) is an `Action` handled by `perform` in GroundStop.svelte.

**The engine reads tokens.** Scene colours are `@theme static` tokens in `styles/tokens.css`,
read at runtime by `engine/palette.ts`. The backdrop is the kit's `night` + `grain`.

**Colour means the same as on the site.** Red (accent) is stopped: the country, the centres,
departures lost. Green (up) is moving again. Everything else is ink on the night.

**Licence.** Flight data © adsb.lol contributors (ODbL 1.0) and adsb.fi. Keep the credits in
About. The baked file is a derived database and stays under ODbL.
