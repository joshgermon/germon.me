/**
 * What the Golden Hour card displays, from the solar reading: shared by the server render
 * (build date) and the client script (today), so both produce identical markup.
 */
import { arcPoint, clockTime, goldenHour, type Place } from '~/domain/solar';

/** Sydney, where the photos happen. */
export const sydney: Place = { latitude: -33.87, longitude: 151.21, timeZone: 'Australia/Sydney' };

/** The sun's arc in the card's SVG (viewBox `0 -4 120 50`): horizon at y = 40. */
export const arc = { x0: 6, x1: 114, y: 40, xc: 60, yc: -14 } as const;

/** The card's text and the sun's place on the arc. */
export type GoldenHourView = {
  /** `6:58` */
  readonly time: string;
  /** `pm` */
  readonly meridiem: string;
  /** `Best light tonight` / `Best light tomorrow` */
  readonly caption: string;
  readonly sunrise: string;
  readonly sunset: string;
  readonly sun: { readonly cx: number; readonly cy: number; readonly up: boolean };
};

const NONE = '—';

/**
 * Compute the card's content at `now`.
 *
 * @param now - The instant to describe.
 * @returns Display strings and the sun's coordinates.
 */
export function goldenHourView(now: Date, place: Place = sydney): GoldenHourView {
  const reading = goldenHour(now, place);
  const { next, sun } = reading;
  const at = (d: Date): string => clockTime(d, place.timeZone);
  const [time = NONE, meridiem = ''] =
    next._tag === 'Crossing' ? at(next.goldenHour).split(' ') : [NONE];
  const point = arcPoint(sun._tag === 'Up' ? sun.progress : sun.edge, arc);
  return {
    time,
    meridiem,
    caption: `Best light ${reading.when}`,
    sunrise: next._tag === 'Crossing' ? at(next.sunrise) : NONE,
    sunset: next._tag === 'Crossing' ? at(next.sunset) : NONE,
    // Below the horizon when down.
    sun: { cx: point.x, cy: sun._tag === 'Up' ? point.y : arc.y + 4, up: sun._tag === 'Up' },
  };
}
