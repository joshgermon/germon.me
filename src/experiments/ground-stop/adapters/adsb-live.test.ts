import { describe, expect, it } from 'vitest';

import { parsePoint } from './adsb-live';

const plane = {
  hex: 'abe80e',
  flight: 'SWA3323 ',
  alt_baro: 34000,
  gs: 464.4,
  track: 291.2,
  lat: 39.1,
  lon: -98.2,
};

describe('live point responses', () => {
  it('reads adsb.lol (ms, ac) and adsb.fi (s, aircraft) alike', () => {
    const lol = parsePoint({ now: 1794633527501, ac: [plane] });
    const fi = parsePoint({ now: 1794634562.0, aircraft: [plane, { hex: 'nopos' }] });
    expect(lol._tag === 'Ok' && lol.now).toBe(1794633527501);
    expect(fi._tag === 'Ok' && fi.now).toBe(1794634562000);
    expect(fi._tag === 'Ok' && fi.aircraft).toEqual([
      {
        id: 'abe80e',
        callsign: 'SWA3323',
        onGround: false,
        aircraft: [39.1, -98.2, 34000, 291.2, 464.4],
      },
    ]);
  });

  it('rejects bodies that are not point responses', () => {
    expect(parsePoint({ error: 'nope' })._tag).toBe('Err');
  });
});
