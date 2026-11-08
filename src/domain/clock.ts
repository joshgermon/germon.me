/**
 * Wall-clock maths for minute-resolution clocks (the top bar's "2:44 pm in Sydney", the coffee
 * preview's local time): formatting a time and scheduling the next tick.
 *
 * Pure: the caller supplies the instant.
 */

/**
 * A wall-clock time in `timeZone`, e.g. `6:58 pm`.
 *
 * @param date - The instant.
 * @param timeZone - IANA zone.
 * @returns The lower-case 12-hour time.
 */
export function clockTime(date: Date, timeZone: string): string {
  return date
    .toLocaleTimeString('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, ' ')
    .toLowerCase();
}

/**
 * Milliseconds until the next minute begins — when a minute-resolution clock should next tick.
 *
 * @param now - The current instant.
 * @returns A delay in `(0, 60000]`.
 */
export function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.valueOf() % 60_000);
}
