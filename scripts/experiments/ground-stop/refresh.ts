/**
 * Bakes the real sky: adsb.lol's ADS-B snapshots for the ground stop and for the same Friday a
 * week earlier, into public/experiments/ground-stop/observed.bin.gz (domain/observed-codec.ts).
 * The window runs from 2 p.m. ET to the latest half-hour adsb.lol has published (capped at
 * WINDOW_LIMIT), so running it again later extends the evening.
 *
 *   pnpm experiments:refresh   # every experiment's refresh (CI runs this on a schedule)
 *   pnpm tsx scripts/experiments/ground-stop/refresh.ts
 *
 * Source: adsb.lol globe_history heatmaps (ODbL 1.0). The baked file is a derived database and
 * is published under the same licence; the page credits adsb.lol. Airports: OurAirports (public
 * domain). US outline: data/us-raster.ts (Natural Earth, public domain).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { readHeatmap } from '../../../src/experiments/ground-stop/adapters/adsb-heatmap';
import {
  parseAirports,
  type AirportRecord,
} from '../../../src/experiments/ground-stop/adapters/ourairports';
import {
  BASELINE_OFFSET_MS,
  DAY_START_UTC,
  STOP,
  WINDOW_LIMIT,
  WINDOW_START,
  at,
} from '../../../src/experiments/ground-stop/domain/clock';
import {
  airborneStretches,
  movements,
  perMinute,
  shortfall,
  simplify,
  type Movement,
  type Sample,
  type Track,
} from '../../../src/experiments/ground-stop/domain/observed';
import {
  encode,
  toTable,
  type ObservedAirport,
} from '../../../src/experiments/ground-stop/domain/observed-codec';
import type { LatLon } from '../../../src/experiments/ground-stop/domain/sphere';
import { inUs } from '../../../src/experiments/ground-stop/domain/us-area';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CACHE = join(ROOT, '.cache');
const OUT_DIR = join(ROOT, 'public', 'experiments', 'ground-stop');
const OUT = join(OUT_DIR, 'observed.bin.gz');
const UA = 'Mozilla/5.0 (compatible; groundstop-viz)';
/** Airline-style callsigns (three-letter ICAO designator + flight number): airliners and cargo. */
const AIRLINE = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;
const TOLERANCE_KM = 6;
const AIRPORT_RADIUS_KM = 25;
const SHORTFALL_AIRPORTS = 40;
const MUST_INCLUDE = ['ORD', 'MDW', 'BOS', 'LAX', 'SFO', 'SEA', 'SAN', 'EWR', 'MSP', 'DFW', 'ATL'];

/** Fetch once into the cache (curl honours the system's proxy). False if it isn't published yet. */
const download = (url: string, path: string): boolean => {
  if (existsSync(path)) return true;
  try {
    execFileSync('curl', ['-sSf', '--max-time', '300', '-A', UA, '-o', `${path}.part`, url], {
      stdio: 'pipe',
    });
    renameSync(`${path}.part`, path);
    return true;
  } catch {
    rmSync(`${path}.part`, { force: true });
    return false;
  }
};

/** The half-hour files covering [from, to] ms, plus the one before (to learn callsigns). */
const halfHours = (from: number, to: number): { readonly date: string; readonly n: string }[] => {
  const out: { date: string; n: string }[] = [];
  for (let t = from - 30 * 60_000; t <= to; t += 30 * 60_000) {
    const d = new Date(Math.floor(t / 1_800_000) * 1_800_000);
    const date = d.toISOString().slice(0, 10).replaceAll('-', '/');
    const n = String(d.getUTCHours() * 2 + (d.getUTCMinutes() >= 30 ? 1 : 0)).padStart(2, '0');
    if (!out.some((x) => x.date === date && x.n === n)) out.push({ date, n });
  }
  return out;
};

// ── Airports and the US outline ──────────────────────────────────────────────────────────────
mkdirSync(join(CACHE, 'adsb'), { recursive: true });
mkdirSync(join(CACHE, 'ourairports'), { recursive: true });
const airportsCsv = join(CACHE, 'ourairports', 'airports.csv');
if (!download('https://davidmegginson.github.io/ourairports-data/airports.csv', airportsCsv))
  throw new Error('OurAirports: download failed');
const airports = parseAirports(readFileSync(airportsCsv, 'utf8'));
const usAirports = airports.filter((a) => a.country === 'US');

const grid = new Map<string, AirportRecord[]>();
const cell = (lat: number, lon: number): string => `${Math.floor(lat)},${Math.floor(lon)}`;
for (const a of usAirports) {
  const k = cell(a.lat, a.lon);
  grid.set(k, [...(grid.get(k) ?? []), a]);
}
const km = (a: LatLon, b: LatLon): number => {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const usAirportNear = (p: LatLon): string | null => {
  let best: AirportRecord | null = null;
  let bestKm = AIRPORT_RADIUS_KM;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const a of grid.get(cell(p.lat + i, p.lon + j)) ?? []) {
        const d = km(p, a);
        if (d < bestKm) {
          bestKm = d;
          best = a;
        }
      }
  return best?.code ?? null;
};

// ── How far the published data reaches ──────────────────────────────────────────────────────
const fileFor = (date: string, n: string): { readonly path: string; readonly url: string } => ({
  path: join(CACHE, 'adsb', `${date.replaceAll('/', '-')}_${n}.bin.ttf`),
  url: `https://adsb.lol/globe_history/${date}/heatmap/${n}.bin.ttf`,
});
/** The last minute covered by published half-hours, from the start, up to the limit. */
const reach = (dayStart: number): number => {
  let end = WINDOW_START - 1;
  for (const { date, n } of halfHours(
    dayStart + WINDOW_START * 60_000,
    dayStart + WINDOW_LIMIT * 60_000,
  )) {
    const file = fileFor(date, n);
    if (!download(file.url, file.path)) break;
    const [y, mo, d] = date.split('/').map(Number);
    const halfStart = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1) + Number(n) * 1_800_000;
    end = Math.max(end, Math.round((halfStart - dayStart) / 60_000) + 29);
  }
  return Math.min(end, WINDOW_LIMIT);
};
const eventReach = reach(DAY_START_UTC);
const baselineReach = reach(DAY_START_UTC - BASELINE_OFFSET_MS);
const WINDOW = { start: WINDOW_START, end: Math.min(eventReach, baselineReach) } as const;
if (WINDOW.end <= WINDOW.start + 60)
  throw new Error('adsb.lol: not enough published data for the window');
console.warn(`window: ${WINDOW.start}–${WINDOW.end} (minutes ET)`);

// ── One day's pass over the snapshots ────────────────────────────────────────────────────────
interface Day {
  readonly samples: Map<number, Sample[]>;
  readonly usAirborne: Uint16Array;
}

const readDay = (offsetMs: number, keepSamples: boolean): Day => {
  const dayStart = DAY_START_UTC - offsetMs;
  const from = dayStart + WINDOW.start * 60_000;
  const to = dayStart + WINDOW.end * 60_000;
  const L = WINDOW.end - WINDOW.start + 1;
  const usAirborne = new Uint16Array(L);
  const samples = new Map<number, Sample[]>();
  const callsigns = new Map<number, string>();
  for (const { date, n } of halfHours(from, to)) {
    const { path, url } = fileFor(date, n);
    if (!download(url, path)) throw new Error(`adsb.lol: missing ${url}`);
    const result = readHeatmap(gunzipSync(readFileSync(path)), callsigns, 60_000, (ms, p) => {
      if (ms < from || ms > to || !p.callsign || !AIRLINE.test(p.callsign)) return;
      const t = Math.round((ms - dayStart) / 60_000);
      if (p.altitude !== 'ground' && inUs(p.lat, p.lon))
        usAirborne[t - WINDOW.start] = (usAirborne[t - WINDOW.start] ?? 0) + 1;
      if (!keepSamples && p.altitude === 'ground') return;
      const list = samples.get(p.id);
      const s: Sample = { t, lat: p.lat, lon: p.lon, altitude: p.altitude };
      if (list) list.push(s);
      else samples.set(p.id, [s]);
    });
    if (result._tag === 'Err') throw new Error(`${path}: ${result.error._tag}`);
    console.warn(`read ${date} ${n}: ${result.value.snapshots} snapshots`);
  }
  return { samples, usAirborne };
};

const departuresOf = (day: Day): Movement[] =>
  [...day.samples.values()].flatMap((s) => movements(s, usAirportNear).departures);

// ── Bake ─────────────────────────────────────────────────────────────────────────────────────
const event = readDay(0, true);
const baseline = readDay(BASELINE_OFFSET_MS, true);
const eventDepartures = departuresOf(event);
const baselineDepartures = departuresOf(baseline);

const tracks: Track[] = [];
for (const samples of event.samples.values()) {
  const departedAt = new Set(movements(samples, usAirportNear).departures.map((d) => d.t));
  for (const stretch of airborneStretches(samples)) {
    if (stretch.length < 3) continue;
    const first = stretch[0];
    if (!first) continue;
    const touchesUs = stretch.some((p) => inUs(p.lat, p.lon));
    const fromUsAfterStop =
      first.t >= STOP && [...departedAt].some((t) => Math.abs(t - first.t) <= 5);
    tracks.push({
      kind: !touchesUs ? 'foreign' : fromUsAfterStop ? 'released' : 'us',
      points: simplify(stretch, TOLERANCE_KM),
    });
  }
}

const count = (ms: readonly Movement[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const d of ms) m.set(d.airport, (m.get(d.airport) ?? 0) + 1);
  return m;
};
const large = new Set(usAirports.filter((a) => a.size === 'large').map((a) => a.code));
const ranked = [...count(baselineDepartures)]
  .filter(([code]) => large.has(code))
  .toSorted((a, b) => b[1] - a[1])
  .map(([code]) => code);
const chosen = [...new Set([...MUST_INCLUDE, ...ranked])].slice(0, SHORTFALL_AIRPORTS);
const chosenAirports: ObservedAirport[] = chosen.flatMap((code) => {
  const a = usAirports.find((x) => x.code === code);
  return a ? [{ code, lat: a.lat, lon: a.lon }] : [];
});
const L = WINDOW.end - WINDOW.start + 1;
const fromIndex = at(15) - WINDOW.start;
const shortfalls = new Uint16Array(chosenAirports.length * L);
chosenAirports.forEach((a, k) => {
  const perAirport = (ms: readonly Movement[]): Uint16Array =>
    perMinute(
      ms.filter((d) => d.airport === a.code).map((d) => d.t),
      WINDOW.start,
      WINDOW.end,
    );
  shortfalls.set(
    shortfall(perAirport(baselineDepartures), perAirport(eventDepartures), fromIndex),
    k * L,
  );
});

const bytes = encode({
  window: WINDOW,
  airports: chosenAirports,
  series: {
    length: L,
    usAirborne: event.usAirborne,
    usAirborneBaseline: baseline.usAirborne,
    departures: perMinute(
      eventDepartures.map((d) => d.t),
      WINDOW.start,
      WINDOW.end,
    ),
    departuresBaseline: perMinute(
      baselineDepartures.map((d) => d.t),
      WINDOW.start,
      WINDOW.end,
    ),
    shortfall: shortfalls,
  },
  tracks: toTable(tracks.toSorted((a, b) => (a.points[0]?.t ?? 0) - (b.points[0]?.t ?? 0))),
});
mkdirSync(OUT_DIR, { recursive: true });
const gz = gzipSync(bytes, { level: 9 });
writeFileSync(OUT, gz);
const points = tracks.reduce((n, t) => n + t.points.length, 0);
console.warn(
  `observed: ${tracks.length} tracks, ${points} points, ${eventDepartures.length} departures (baseline ${baselineDepartures.length}); ${(bytes.byteLength / 1e6).toFixed(2)} MB raw, ${(gz.byteLength / 1e6).toFixed(2)} MB gzip`,
);
