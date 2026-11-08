import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { defaultCameraLimits } from '~/domain/office/orbit';
import { loadManifest, parseManifest } from './office-manifest';

/** The fields the exporter writes that the viewer reads, plus some it ignores. */
const exported = {
  version: 1,
  glb: '/office/office.glb',
  nodes: ['HS_Tele', 'HIT_Tele'],
  evening: { M_Room: '/office/bake/room_evening.webp' },
  cameraLimits: {
    note: 'keep the orbit inside',
    azimuthOffsetDeg: [-30, 30],
    elevationDeg: [12, 62],
    isoAzimuthDeg: 45,
    isoElevationDeg: 32,
  },
};

const respond = (body: unknown, status = 200): typeof fetch => {
  return async () => new Response(JSON.stringify(body), { status });
};

describe('parseManifest', () => {
  it('reads the camera envelope and evening bakes, ignoring everything else', () => {
    const res = parseManifest(exported);
    expect(res._tag).toBe('ok');
    if (res._tag !== 'ok') return;
    expect(res.value.cameraLimits).toEqual({ azimuthOffsetDeg: [-30, 30], elevationDeg: [12, 62] });
    expect(res.value.evening.get('M_Room')).toBe('/office/bake/room_evening.webp');
  });

  it('falls back to the export defaults when the envelope is missing', () => {
    const res = parseManifest({});
    expect(res._tag === 'ok' && res.value.cameraLimits).toEqual(defaultCameraLimits);
  });

  it('accepts any finite envelope', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.double({ noNaN: true, noDefaultInfinity: true }),
        ),
        (range) => {
          const res = parseManifest({ cameraLimits: { azimuthOffsetDeg: range } });
          expect(res._tag === 'ok' && res.value.cameraLimits.azimuthOffsetDeg).toEqual(range);
        },
      ),
    );
  });

  it('rejects anything that is not a manifest', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.array(fc.integer())),
        (junk) => {
          const res = parseManifest(junk);
          expect(res._tag === 'err' && res.error._tag).toBe('ManifestUnavailable');
        },
      ),
    );
    expect(parseManifest({ cameraLimits: { elevationDeg: [12] } })._tag).toBe('err');
  });
});

describe('loadManifest', () => {
  it('parses a served manifest', async () => {
    const res = await loadManifest('/office/manifest.json', respond(exported));
    expect(res._tag).toBe('ok');
  });

  it('classifies HTTP and network failures', async () => {
    const http = await loadManifest('/m.json', respond({}, 404));
    expect(http._tag === 'err' && http.error.reason).toBe('http');
    const network = await loadManifest('/m.json', async () => {
      throw new TypeError('offline');
    });
    expect(network._tag === 'err' && network.error.reason).toBe('network');
  });
});
