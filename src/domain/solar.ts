/**
 * Solar maths for the office's lighting: when the sun rises, sets, and drops to 6° above the
 * horizon (the start of evening golden hour), and where it sits on a sunrise→sunset arc.
 *
 * The algorithm is the compact one popularised by SunCalc (after the Astronomy Answers
 * formulas): accurate to a minute or two at mid-latitudes, which is plenty for "best light
 * tonight". Pure: the caller supplies the instant; nothing here reads the clock.
 */

/** Somewhere on Earth, in degrees (south and west negative), plus its IANA time zone. */
export type Place = {
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZone: string;
};

/**
 * A day's light. Near the poles the sun may never cross the horizon (or 6°) on a given day.
 */
export type Daylight =
  | {
      readonly _tag: 'Crossing';
      readonly sunrise: Date;
      readonly sunset: Date;
      /** Evening golden hour begins: the sun is 6° above the horizon. */
      readonly goldenHour: Date;
    }
  | { readonly _tag: 'NoCrossing' };

/** Where the sun is relative to a day's arc. */
export type SunPosition =
  | {
      readonly _tag: 'Up';
      /** 0 at sunrise, 1 at sunset. */
      readonly progress: number;
    }
  | {
      readonly _tag: 'Down';
      /** The end of the arc it is nearest: 0 before sunrise, 1 after sunset. */
      readonly edge: 0 | 1;
    };

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const J0 = 0.0009;
const OBLIQUITY = RAD * 23.4397;
/** Sunrise/sunset: the sun's upper limb on the horizon, with refraction. */
const HORIZON = -0.833 * RAD;
/** Golden hour starts when the sun is 6° up. */
const GOLDEN = 6 * RAD;

const toJulian = (date: Date): number => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * DAY_MS);

/**
 * Sunrise, sunset and the start of evening golden hour on the calendar day `date` falls on
 * in `place`'s time zone.
 *
 * @param date - Any instant on the day in question.
 * @param place - Where to compute for.
 * @returns The day's crossings, or `NoCrossing` during polar day or night.
 */
export function daylight(date: Date, place: Place): Daylight {
  // Anchor on the local day's solar noon so the nearest Julian cycle is the right day,
  // whatever the hour of `date`.
  const [y, m, d] = calendarDay(date, place.timeZone);
  const noonUtc = Date.UTC(y, m - 1, d, 12) - (place.longitude / 15) * 3_600_000;

  const lw = RAD * -place.longitude;
  const phi = RAD * place.latitude;
  const days = toJulian(new Date(noonUtc)) - J2000;
  const n = Math.round(days - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const equation = 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = J2000 + ds + equation;

  /** The evening instant the sun's altitude is `h`, or `undefined` if it never is. */
  const setsAt = (h: number): number | undefined => {
    const cosW = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return undefined;
    return J2000 + J0 + (Math.acos(cosW) + lw) / (2 * Math.PI) + n + equation;
  };

  const set = setsAt(HORIZON);
  const golden = setsAt(GOLDEN);
  if (set === undefined || golden === undefined) return { _tag: 'NoCrossing' };
  return {
    _tag: 'Crossing',
    sunrise: fromJulian(noon - (set - noon)),
    sunset: fromJulian(set),
    goldenHour: fromJulian(golden),
  };
}

/**
 * Where the sun is on the day's arc at `now`.
 *
 * @param now - The instant.
 * @param day - That day's light.
 * @returns `Up` with progress from sunrise (0) to sunset (1), or `Down` beside the nearer end.
 */
export function sunPosition(now: Date, day: Daylight): SunPosition {
  // Polar day or night: no arc to place the sun on.
  if (day._tag === 'NoCrossing') return { _tag: 'Down', edge: 0 };
  const progress =
    (now.valueOf() - day.sunrise.valueOf()) / (day.sunset.valueOf() - day.sunrise.valueOf());
  if (progress < 0) return { _tag: 'Down', edge: 0 };
  if (progress > 1) return { _tag: 'Down', edge: 1 };
  return { _tag: 'Up', progress };
}

/** The [year, month, day] `date` falls on in `timeZone`. */
function calendarDay(date: Date, timeZone: string): readonly [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return [part('year'), part('month'), part('day')];
}
