/**
 * The baked day: tracks and series in one compact binary file (`public/data/observed.bin.gz`),
 * written by scripts/observed.ts and read by the page at build time and in the browser.
 *
 * Little-endian, sequential (no alignment):
 *   "GSD1" · int32 start · int32 end · uint32 tracks · uint32 points · uint16 airports
 *   airports × (4 ascii · float32 lat · float32 lon)
 *   series, each `end − start + 1` uint16: usAirborne, usAirborneBaseline, departures,
 *     departuresBaseline, then shortfall × airports
 *   tracks × (uint16 points · uint16 first minute − start · uint8 kind)
 *   points: uint8 Δminutes · int16 Δlat×100 · int16 Δlon×100 (wrapped) · uint8 alt/250 ft
 * Deltas restart at each track. Columns are grouped per field so gzip finds the runs.
 */
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';

import type { Minute } from './clock';
import type { Track, TrackKind } from './observed';

/** An airport with a shortfall series. */
export interface ObservedAirport {
  readonly code: string;
  readonly lat: number;
  readonly lon: number;
}

/** Per-minute series over the window, index 0 = `window.start`. */
export interface ObservedSeries {
  readonly length: number;
  /** Airline aircraft airborne over the US (adsb.lol coverage). */
  readonly usAirborne: Uint16Array;
  /** The same, a week earlier. */
  readonly usAirborneBaseline: Uint16Array;
  /** Take-offs from US airports per minute. */
  readonly departures: Uint16Array;
  /** The same, a week earlier. */
  readonly departuresBaseline: Uint16Array;
  /** Departures behind the baseline, per airport: `airports.length` rows of `length`. */
  readonly shortfall: Uint16Array;
}

/** Tracks as flat columns, ready for the renderer: track i spans points offsets[i]..offsets[i+1]. */
export interface TrackTable {
  readonly count: number;
  readonly offsets: Uint32Array;
  /** 0 = us, 1 = released, 2 = foreign. */
  readonly kind: Uint8Array;
  readonly t: Float32Array;
  readonly lat: Float32Array;
  readonly lon: Float32Array;
  readonly alt: Float32Array;
}

/** Everything the page shows from observed data. */
export interface ObservedDay {
  readonly window: { readonly start: Minute; readonly end: Minute };
  readonly airports: readonly ObservedAirport[];
  readonly series: ObservedSeries;
  readonly tracks: TrackTable;
}

/** Why a file couldn't be decoded. */
export type DecodeError =
  | { readonly _tag: 'BadMagic' }
  | { readonly _tag: 'Truncated'; readonly at: number };

const MAGIC = 'GSD1';
const KINDS: readonly TrackKind[] = ['us', 'released', 'foreign'];

/** Lay tracks out as columns. */
export const toTable = (tracks: readonly Track[]): TrackTable => {
  const total = tracks.reduce((n, tr) => n + tr.points.length, 0);
  const table = {
    count: tracks.length,
    offsets: new Uint32Array(tracks.length + 1),
    kind: new Uint8Array(tracks.length),
    t: new Float32Array(total),
    lat: new Float32Array(total),
    lon: new Float32Array(total),
    alt: new Float32Array(total),
  };
  let p = 0;
  tracks.forEach((tr, i) => {
    table.offsets[i] = p;
    table.kind[i] = KINDS.indexOf(tr.kind);
    for (const pt of tr.points) {
      table.t[p] = pt.t;
      table.lat[p] = pt.lat;
      table.lon[p] = pt.lon;
      table.alt[p] = pt.alt;
      p++;
    }
  });
  table.offsets[tracks.length] = p;
  return table;
};

const wrap = (d: number, half: number): number =>
  ((((d + half) % (2 * half)) + 2 * half) % (2 * half)) - half;

/** Encode a day. Tracks must have under 65,536 points and fit the window. */
export const encode = (day: ObservedDay): Uint8Array<ArrayBuffer> => {
  const { window, airports, series, tracks } = day;
  const L = series.length;
  const size =
    4 +
    4 +
    4 +
    4 +
    4 +
    2 +
    airports.length * 12 +
    (4 + airports.length) * L * 2 +
    tracks.count * 5 +
    tracks.t.length * 6;
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  let o = 0;
  for (const c of MAGIC) buf[o++] = c.charCodeAt(0);
  v.setInt32(o, window.start, true);
  v.setInt32(o + 4, window.end, true);
  v.setUint32(o + 8, tracks.count, true);
  v.setUint32(o + 12, tracks.t.length, true);
  v.setUint16(o + 16, airports.length, true);
  o += 18;
  for (const a of airports) {
    for (let k = 0; k < 4; k++) buf[o + k] = a.code.charCodeAt(k) || 32;
    v.setFloat32(o + 4, a.lat, true);
    v.setFloat32(o + 8, a.lon, true);
    o += 12;
  }
  for (const s of [
    series.usAirborne,
    series.usAirborneBaseline,
    series.departures,
    series.departuresBaseline,
    series.shortfall,
  ]) {
    for (const x of s) {
      v.setUint16(o, x, true);
      o += 2;
    }
  }
  const { offsets } = tracks;
  for (let i = 0; i < tracks.count; i++) {
    const from = offsets[i] ?? 0;
    v.setUint16(o, (offsets[i + 1] ?? 0) - from, true);
    v.setUint16(o + 2, Math.round(tracks.t[from] ?? 0) - window.start, true);
    buf[o + 4] = tracks.kind[i] ?? 0;
    o += 5;
  }
  const n = tracks.t.length;
  const dt = o;
  const dlat = dt + n;
  const dlon = dlat + n * 2;
  const alt = dlon + n * 2;
  for (let i = 0; i < tracks.count; i++) {
    const from = offsets[i] ?? 0;
    const to = offsets[i + 1] ?? 0;
    let pt = 0;
    let plat = 0;
    let plon = 0;
    for (let p = from; p < to; p++) {
      const t = Math.round(tracks.t[p] ?? 0);
      const lat = Math.round((tracks.lat[p] ?? 0) * 100);
      const lon = Math.round((tracks.lon[p] ?? 0) * 100);
      buf[dt + p] = p === from ? 0 : Math.min(255, t - pt);
      v.setInt16(dlat + p * 2, p === from ? lat : lat - plat, true);
      v.setInt16(dlon + p * 2, p === from ? lon : wrap(lon - plon, 18000), true);
      buf[alt + p] = Math.max(0, Math.min(255, Math.round((tracks.alt[p] ?? 0) / 250)));
      pt = t;
      plat = lat;
      plon = lon;
    }
  }
  return buf;
};

/** Decode a day. */
export const decode = (buf: Uint8Array): Result<ObservedDay, DecodeError> => {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 22 || String.fromCharCode(...buf.subarray(0, 4)) !== MAGIC)
    return err({ _tag: 'BadMagic' });
  const start = v.getInt32(4, true);
  const end = v.getInt32(8, true);
  const count = v.getUint32(12, true);
  const n = v.getUint32(16, true);
  const airportCount = v.getUint16(20, true);
  const L = end - start + 1;
  let o = 22;
  const need = o + airportCount * 12 + (4 + airportCount) * L * 2 + count * 5 + n * 6;
  if (buf.byteLength < need) return err({ _tag: 'Truncated', at: buf.byteLength });

  const airports: ObservedAirport[] = [];
  for (let i = 0; i < airportCount; i++) {
    const code = String.fromCharCode(...buf.subarray(o, o + 4)).trim();
    airports.push({ code, lat: v.getFloat32(o + 4, true), lon: v.getFloat32(o + 8, true) });
    o += 12;
  }
  const read = (len: number): Uint16Array => {
    const out = new Uint16Array(len);
    for (let i = 0; i < len; i++) out[i] = v.getUint16(o + i * 2, true);
    o += len * 2;
    return out;
  };
  const series: ObservedSeries = {
    length: L,
    usAirborne: read(L),
    usAirborneBaseline: read(L),
    departures: read(L),
    departuresBaseline: read(L),
    shortfall: read(L * airportCount),
  };
  const offsets = new Uint32Array(count + 1);
  const kind = new Uint8Array(count);
  const first = new Uint16Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    offsets[i] = total;
    total += v.getUint16(o, true);
    first[i] = v.getUint16(o + 2, true);
    kind[i] = buf[o + 4] ?? 0;
    o += 5;
  }
  offsets[count] = total;
  const t = new Float32Array(n);
  const lat = new Float32Array(n);
  const lon = new Float32Array(n);
  const alt = new Float32Array(n);
  const dt = o;
  const dlat = dt + n;
  const dlon = dlat + n * 2;
  const da = dlon + n * 2;
  for (let i = 0; i < count; i++) {
    const from = offsets[i] ?? 0;
    const to = offsets[i + 1] ?? 0;
    let pt = start + (first[i] ?? 0);
    let plat = 0;
    let plon = 0;
    for (let p = from; p < to; p++) {
      pt += p === from ? 0 : (buf[dt + p] ?? 0);
      plat += v.getInt16(dlat + p * 2, true);
      plon =
        p === from
          ? v.getInt16(dlon + p * 2, true)
          : wrap(plon + v.getInt16(dlon + p * 2, true), 18000);
      t[p] = pt;
      lat[p] = plat / 100;
      lon[p] = plon / 100;
      alt[p] = (buf[da + p] ?? 0) * 250;
    }
  }
  return ok({
    window: { start, end },
    airports,
    series,
    tracks: { count, offsets, kind, t, lat, lon, alt },
  });
};
