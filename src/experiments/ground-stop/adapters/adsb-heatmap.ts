/**
 * Reads readsb "heatmap" files: the half-hour snapshots adsb.lol publishes under
 * `globe_history/YYYY/MM/DD/heatmap/NN.bin.ttf` (ODbL). The raw format stays in this file.
 *
 * Layout (readsb globe_index.c, `struct heatEntry`, little-endian, 16 bytes each), after gunzip:
 *   - an index of N entries (`index[0].hex` = N), then entries;
 *   - a slice marker (`hex == 0x0e7f7c9d`) per snapshot: timestamp ms = (lat << 32) | uint32(lon),
 *     `alt` = interval in ms;
 *   - an info entry when `lat & (1 << 30)`: low bits squawk, `lon..gs` = 8-byte callsign;
 *   - otherwise a position: `hex & 0xffffff` ICAO (bit 24: non-ICAO), lat/lon × 1e6,
 *     alt × 25 ft (−123 on the ground, −124 unknown), gs × 0.1 kt.
 */
import { err, ok, type Result } from '~/experiments/ground-stop/lib/result';

/** One aircraft's position in a snapshot. */
export interface Position {
  /** 24-bit ICAO address (bit 24 set for non-ICAO addresses). */
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  /** Feet, `'ground'`, or `null` when unknown. */
  readonly altitude: number | 'ground' | null;
  /** Last callsign seen for this aircraft, if any. */
  readonly callsign: string | null;
}

/** Why a file couldn't be read. */
export type HeatmapError =
  | { readonly _tag: 'Truncated'; readonly bytes: number }
  | { readonly _tag: 'BadIndex'; readonly slices: number };

const SLICE_MARKER = 0x0e7f7c9d;
const ENTRY = 16;
const decoder = new TextDecoder('latin1');

/**
 * Visit the positions in snapshots whose timestamp is a multiple of `everyMs`. Callsigns carry
 * across calls in `callsigns` (keyed by aircraft id), so pass the same map for consecutive files.
 */
export const readHeatmap = (
  bytes: Uint8Array,
  callsigns: Map<number, string>,
  everyMs: number,
  visit: (at: number, position: Position) => void,
): Result<{ readonly snapshots: number }, HeatmapError> => {
  if (bytes.byteLength % ENTRY !== 0 || bytes.byteLength < ENTRY) {
    return err({ _tag: 'Truncated', bytes: bytes.byteLength });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = bytes.byteLength / ENTRY;
  const slices = view.getInt32(0, true);
  if (slices <= 0 || slices >= entries) return err({ _tag: 'BadIndex', slices });

  let at = 0;
  let take = false;
  let snapshots = 0;
  for (let i = slices; i < entries; i++) {
    const o = i * ENTRY;
    const hex = view.getInt32(o, true);
    const lat = view.getInt32(o + 4, true);
    const lon = view.getInt32(o + 8, true);
    if (hex === SLICE_MARKER) {
      at = lat * 2 ** 32 + (lon >>> 0);
      take = at % everyMs === 0;
      if (take) snapshots++;
      continue;
    }
    const id = hex & 0x1ffffff;
    if ((lat & (1 << 30)) !== 0) {
      const callsign = decoder
        .decode(bytes.subarray(o + 8, o + 16))
        .replaceAll('\0', '')
        .trim();
      if (callsign) callsigns.set(id, callsign);
      continue;
    }
    if (!take) continue;
    const alt = view.getInt16(o + 12, true);
    visit(at, {
      id,
      lat: lat / 1e6,
      lon: lon / 1e6,
      altitude: alt === -123 ? 'ground' : alt === -124 ? null : alt * 25,
      callsign: callsigns.get(id) ?? null,
    });
  }
  return ok({ snapshots });
};
