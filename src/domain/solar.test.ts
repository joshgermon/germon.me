import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { daylight, sunPosition, type Place } from './solar';

const sydney: Place = { latitude: -33.87, longitude: 151.21, timeZone: 'Australia/Sydney' };
const svalbard: Place = { latitude: 78.22, longitude: 15.65, timeZone: 'Arctic/Longyearbyen' };

const MIN = 60_000;
const instant = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2100-01-01T00:00:00Z'),
  noInvalidDate: true,
});

function crossing(date: Date, place: Place) {
  const day = daylight(date, place);
  if (day._tag !== 'Crossing') throw new Error(`Expected a crossing on ${date.toISOString()}`);
  return day;
}

describe('daylight', () => {
  it('matches published Sydney times to within a few minutes', () => {
    // Geoscience Australia: 21 Dec 2026 sunrise 05:41, sunset 20:05 (AEDT).
    const summer = crossing(new Date('2026-12-21T03:00:00Z'), sydney);
    expect(
      Math.abs(summer.sunrise.valueOf() - Date.parse('2026-12-21T05:41:00+11:00')),
    ).toBeLessThan(4 * MIN);
    expect(
      Math.abs(summer.sunset.valueOf() - Date.parse('2026-12-21T20:05:00+11:00')),
    ).toBeLessThan(4 * MIN);

    // 21 Jun 2026 sunrise 07:00, sunset 16:54 (AEST).
    const winter = crossing(new Date('2026-06-21T03:00:00Z'), sydney);
    expect(
      Math.abs(winter.sunrise.valueOf() - Date.parse('2026-06-21T07:00:00+10:00')),
    ).toBeLessThan(4 * MIN);
    expect(
      Math.abs(winter.sunset.valueOf() - Date.parse('2026-06-21T16:54:00+10:00')),
    ).toBeLessThan(4 * MIN);
  });

  it('computes the local day, whatever the hour', () => {
    // 23:30 and 00:30 Sydney time on 8 Nov both describe 8 Nov's light.
    const late = crossing(new Date('2026-11-08T12:30:00Z'), sydney);
    const early = crossing(new Date('2026-11-07T13:30:00Z'), sydney);
    expect(late).toEqual(early);
    // Sydney's 8 Nov sunset is a little before 19:30 local (08:30 UTC).
    expect(late.sunset.getUTCHours()).toBe(8);
  });

  it('orders sunrise, golden hour and sunset in Sydney on every day', () => {
    fc.assert(
      fc.property(instant, (date) => {
        const day = crossing(date, sydney);
        expect(day.sunrise < day.goldenHour).toBe(true);
        expect(day.goldenHour < day.sunset).toBe(true);
        const golden = day.sunset.valueOf() - day.goldenHour.valueOf();
        expect(golden).toBeGreaterThan(20 * MIN);
        expect(golden).toBeLessThan(60 * MIN);
      }),
    );
  });

  it('has no crossing in polar summer or winter', () => {
    expect(daylight(new Date('2026-06-21T12:00:00Z'), svalbard)._tag).toBe('NoCrossing');
    expect(daylight(new Date('2026-12-21T12:00:00Z'), svalbard)._tag).toBe('NoCrossing');
  });
});

describe('sunPosition', () => {
  it('is up between sunrise and sunset and down otherwise', () => {
    const day = crossing(new Date('2026-11-08T03:00:00Z'), sydney);
    const mid = new Date((day.sunrise.valueOf() + day.sunset.valueOf()) / 2);
    const up = sunPosition(mid, day);
    expect(up._tag === 'Up' && up.progress).toBeCloseTo(0.5, 5);
    expect(sunPosition(new Date(day.sunrise.valueOf() - MIN), day)).toEqual({
      _tag: 'Down',
      edge: 0,
    });
    expect(sunPosition(new Date(day.sunset.valueOf() + MIN), day)).toEqual({
      _tag: 'Down',
      edge: 1,
    });
    expect(sunPosition(mid, { _tag: 'NoCrossing' })._tag).toBe('Down');
  });
});
