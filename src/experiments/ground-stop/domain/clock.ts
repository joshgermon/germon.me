/**
 * Time on the day of the ground stop. Everything in the app counts minutes since midnight
 * Eastern time on Friday 13 November 2026 (EST, UTC−5), so 1215 is 8:15 p.m. ET and 1500 is
 * 1:00 a.m. Saturday.
 */

/** Minutes since 00:00 ET on 13 Nov 2026. */
export type Minute = number;

/** The minute for an Eastern-time clock reading on the day (`at(15, 54)` → 954). */
export const at = (hour: number, minute = 0): Minute => hour * 60 + minute;

/** ATCSCC ADVZY 111, NATIONAL GROUND STOP: sent 20:54Z, 3:54 p.m. ET. */
export const STOP: Minute = at(15, 54);

/** ATCSCC ADVZY 005, CNX NATIONWIDE GROUND STOP: event time 01:16Z, 8:16 p.m. ET. */
export const LIFT: Minute = at(20, 16);

/** The globe starts at 2:00 p.m. ET; the baked file says where it ends (the latest data). */
export const WINDOW_START: Minute = at(14);

/** The bake stops extending the window here: 8 a.m. ET Saturday, once the backlog has cleared. */
export const WINDOW_LIMIT: Minute = at(32);

/** 00:00 ET on 13 Nov 2026, as epoch milliseconds (05:00 UTC). */
export const DAY_START_UTC = Date.UTC(2026, 10, 13, 5);

/** The comparison day: the same Friday evening one week earlier. */
export const BASELINE_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

/** Hours and minutes between two minutes, e.g. "4h 21m". */
export const formatDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
};

/** A 12-hour clock reading, e.g. "3:54" and "PM". */
export const formatClock = (
  minute: Minute,
): { readonly time: string; readonly meridiem: 'AM' | 'PM' } => {
  const total = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { time: `${h12}:${String(m).padStart(2, '0')}`, meridiem: h24 < 12 ? 'AM' : 'PM' };
};

/** "3:54 PM", the way the timeline and story label times. */
export const formatClockShort = (minute: Minute): string => {
  const { time, meridiem } = formatClock(minute);
  return `${time} ${meridiem}`;
};

/** The phase of the day at a minute. */
export type Phase = 'before' | 'stopped' | 'reopened';

/** Which phase a minute falls in. */
export const phaseAt = (minute: Minute): Phase =>
  minute < STOP ? 'before' : minute < LIFT ? 'stopped' : 'reopened';
