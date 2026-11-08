import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { daylight, sunPosition, type Place } from '~/domain/solar';
import { lightingAt, toggleLighting } from './lighting';

const sydney: Place = { latitude: -33.87, longitude: 151.21, timeZone: 'Australia/Sydney' };
const svalbard: Place = { latitude: 78.22, longitude: 15.65, timeZone: 'Arctic/Longyearbyen' };

const instant = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2100-01-01T00:00:00Z'),
  noInvalidDate: true,
});

describe('lightingAt', () => {
  it('is daylight at Sydney noon and evening at Sydney midnight', () => {
    expect(lightingAt(new Date('2026-11-08T12:00:00+11:00'), sydney)).toBe('day');
    expect(lightingAt(new Date('2026-11-08T00:30:00+11:00'), sydney)).toBe('evening');
    expect(lightingAt(new Date('2026-06-21T12:00:00+10:00'), sydney)).toBe('day');
    expect(lightingAt(new Date('2026-06-21T18:00:00+10:00'), sydney)).toBe('evening');
  });

  it('switches at sunrise and sunset', () => {
    const day = daylight(new Date('2026-11-08T03:00:00Z'), sydney);
    if (day._tag !== 'Crossing') throw new Error('Sydney always has a crossing');
    const minute = 60_000;
    expect(lightingAt(new Date(day.sunrise.valueOf() - minute), sydney)).toBe('evening');
    expect(lightingAt(new Date(day.sunrise.valueOf() + minute), sydney)).toBe('day');
    expect(lightingAt(new Date(day.sunset.valueOf() - minute), sydney)).toBe('day');
    expect(lightingAt(new Date(day.sunset.valueOf() + minute), sydney)).toBe('evening');
  });

  it('is daylight exactly when the sun is up', () => {
    fc.assert(
      fc.property(instant, (now) => {
        const up = sunPosition(now, daylight(now, sydney))._tag === 'Up';
        expect(lightingAt(now, sydney)).toBe(up ? 'day' : 'evening');
      }),
    );
  });

  it('stays in the evening state when the sun never crosses the horizon', () => {
    expect(lightingAt(new Date('2026-12-21T12:00:00Z'), svalbard)).toBe('evening');
  });
});

describe('toggleLighting', () => {
  it('is its own inverse', () => {
    fc.assert(
      fc.property(fc.constantFrom('day' as const, 'evening' as const), (l) => {
        expect(toggleLighting(l)).not.toBe(l);
        expect(toggleLighting(toggleLighting(l))).toBe(l);
      }),
    );
  });
});
