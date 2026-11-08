/**
 * Which of the room's two baked lighting states to show: daylight while the sun is up where
 * Josh is, the lamp-lit evening bake otherwise. Pure: the caller supplies the instant.
 */
import { daylight, sunPosition, type Place } from '~/domain/solar';

/** The room's baked lighting states. */
export type Lighting = 'day' | 'evening';

/**
 * The lighting for `now` at `place`: `day` between sunrise and sunset, `evening` otherwise.
 * During polar day or night there is no crossing, and the room stays in its evening state.
 *
 * @param now - The instant.
 * @param place - Where the sun is read.
 * @returns The lighting state to show.
 */
export function lightingAt(now: Date, place: Place): Lighting {
  return sunPosition(now, daylight(now, place))._tag === 'Up' ? 'day' : 'evening';
}

/**
 * The other lighting state (the lamp switch).
 *
 * @param lighting - The current state.
 * @returns The opposite state.
 */
export function toggleLighting(lighting: Lighting): Lighting {
  return lighting === 'day' ? 'evening' : 'day';
}
