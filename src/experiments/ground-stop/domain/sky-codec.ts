/**
 * The recorded sky (domain/recorder.ts) as bytes, for the store. Little-endian, sequential:
 *   "GSS1" · int32 at · int32 since · uint32 flights · uint32 samples · uint16 readings
 *   readings × (int32 t · uint16 usAirborne · uint16 departures)
 *   flights × (8 ascii id · 8 ascii callsign · int32 departedAt (MIN = never) · uint16 samples)
 *   samples × (uint16 t − since · int16 lat×100 · int16 lon×100 · uint8 altitude)
 * Altitude: 0 = on the ground, 255 = unknown, otherwise ⌊feet / 250⌋ (at least 1).
 */
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';

import type { Sample } from './observed';
import type { DecodeError } from './observed-codec';
import type { Reading, Sky, TrackedFlight } from './recorder';

const MAGIC = 'GSS1';
const NEVER = -2147483648;
const HEADER = 22;
const READING = 8;
const FLIGHT = 22;
const SAMPLE = 7;

const altitudeByte = (a: Sample['altitude']): number =>
  a === 'ground' ? 0 : a === null ? 255 : Math.max(1, Math.min(254, Math.floor(a / 250)));
const altitudeOf = (b: number): Sample['altitude'] =>
  b === 0 ? 'ground' : b === 255 ? null : b * 250;

/** Encode a sky. Flights hold under 65,536 samples each, all within 65,535 minutes of `since`. */
export const encodeSky = (sky: Sky): Uint8Array => {
  const total = sky.flights.reduce((n, f) => n + f.samples.length, 0);
  const buf = new Uint8Array(
    HEADER + sky.readings.length * READING + sky.flights.length * FLIGHT + total * SAMPLE,
  );
  const v = new DataView(buf.buffer);
  const ascii = (s: string, at: number, width: number): void => {
    for (let k = 0; k < width; k++) buf[at + k] = (s.charCodeAt(k) || 32) & 0x7f;
  };
  ascii(MAGIC, 0, 4);
  v.setInt32(4, sky.at, true);
  v.setInt32(8, sky.since, true);
  v.setUint32(12, sky.flights.length, true);
  v.setUint32(16, total, true);
  v.setUint16(20, sky.readings.length, true);
  let o = HEADER;
  for (const r of sky.readings) {
    v.setInt32(o, r.t, true);
    v.setUint16(o + 4, Math.min(65535, r.usAirborne), true);
    v.setUint16(o + 6, Math.min(65535, r.departures), true);
    o += READING;
  }
  for (const f of sky.flights) {
    ascii(f.id, o, 8);
    ascii(f.callsign, o + 8, 8);
    v.setInt32(o + 16, f.departedAt ?? NEVER, true);
    v.setUint16(o + 20, f.samples.length, true);
    o += FLIGHT;
  }
  for (const f of sky.flights) {
    for (const s of f.samples) {
      v.setUint16(o, Math.max(0, Math.min(65535, Math.round(s.t - sky.since))), true);
      v.setInt16(o + 2, Math.round(s.lat * 100), true);
      v.setInt16(o + 4, Math.round(s.lon * 100), true);
      buf[o + 6] = altitudeByte(s.altitude);
      o += SAMPLE;
    }
  }
  return buf;
};

/** Decode a sky. */
export const decodeSky = (buf: Uint8Array): Result<Sky, DecodeError> => {
  if (buf.byteLength < HEADER || String.fromCharCode(...buf.subarray(0, 4)) !== MAGIC)
    return err({ _tag: 'BadMagic' });
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const at = v.getInt32(4, true);
  const since = v.getInt32(8, true);
  const flightCount = v.getUint32(12, true);
  const total = v.getUint32(16, true);
  const readingCount = v.getUint16(20, true);
  if (buf.byteLength < HEADER + readingCount * READING + flightCount * FLIGHT + total * SAMPLE)
    return err({ _tag: 'Truncated', at: buf.byteLength });
  const ascii = (from: number, width: number): string =>
    String.fromCharCode(...buf.subarray(from, from + width)).trim();
  let o = HEADER;
  const readings: Reading[] = [];
  for (let i = 0; i < readingCount; i++) {
    readings.push({
      t: v.getInt32(o, true),
      usAirborne: v.getUint16(o + 4, true),
      departures: v.getUint16(o + 6, true),
    });
    o += READING;
  }
  const heads: (Omit<TrackedFlight, 'samples'> & { readonly count: number })[] = [];
  let claimed = 0;
  for (let i = 0; i < flightCount; i++) {
    const departedAt = v.getInt32(o + 16, true);
    const count = v.getUint16(o + 20, true);
    claimed += count;
    heads.push({
      id: ascii(o, 8),
      callsign: ascii(o + 8, 8),
      departedAt: departedAt === NEVER ? null : departedAt,
      count,
    });
    o += FLIGHT;
  }
  if (claimed !== total) return err({ _tag: 'Truncated', at: buf.byteLength });
  const flights: TrackedFlight[] = heads.map(({ count, ...head }) => {
    const samples: Sample[] = [];
    for (let k = 0; k < count; k++) {
      samples.push({
        t: since + v.getUint16(o, true),
        lat: v.getInt16(o + 2, true) / 100,
        lon: v.getInt16(o + 4, true) / 100,
        altitude: altitudeOf(buf[o + 6] ?? 255),
      });
      o += SAMPLE;
    }
    return { ...head, samples };
  });
  return ok({ at, since, flights, readings });
};
