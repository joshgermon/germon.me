/**
 * Scheduling for minute-resolution clocks (the top bar's "2:44 pm in Sydney"). Formatting
 * lives with the other wall-clock maths in `solar.ts#clockTime`.
 *
 * Pure: the caller supplies the instant.
 */

/**
 * Milliseconds until the next minute begins — when a minute-resolution clock should next tick.
 *
 * @param now - The current instant.
 * @returns A delay in `(0, 60000]`.
 */
export function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.valueOf() % 60_000);
}
