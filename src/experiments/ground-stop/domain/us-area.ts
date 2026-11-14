/**
 * "Is this point over the United States?", answered from a baked 0.2° grid (data/us-raster.ts).
 * Pure and cheap, so the bake script and the live route on the Worker count the same way.
 */
import { US_RASTER } from '~/experiments/ground-stop/data/us-raster';

/** A lat/lon box the grid covers. */
export interface Box {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

/** Grid cell size, in degrees. */
export const US_CELL = 0.2;

/** The lower 48, Alaska and Hawaii. */
export const US_BOXES: readonly Box[] = [
  { south: 17, north: 50, west: -126, east: -65 },
  { south: 50, north: 72, west: -180, east: -129 },
  { south: 18, north: 23, west: -161, east: -154 },
];

const decode = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bitsets = US_RASTER.map(decode);

/** Whether a point is over US territory (to the grid's ≈20 km resolution). */
export const inUs = (lat: number, lon: number): boolean =>
  US_BOXES.some((box, k) => {
    if (lat < box.south || lat >= box.north || lon < box.west || lon >= box.east) return false;
    const cols = Math.round((box.east - box.west) / US_CELL);
    const i =
      Math.floor((lat - box.south) / US_CELL) * cols + Math.floor((lon - box.west) / US_CELL);
    return (((bitsets[k]?.[i >> 3] ?? 0) >> (i & 7)) & 1) === 1;
  });
