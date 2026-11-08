import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  frame,
  normaliseFreeArea,
  toScreen,
  wholeView,
  ZOOM,
  type Extent,
  type FreeArea,
} from './framing';

const EPS = 1e-6;

const coord = fc.double({ min: -10, max: 10, noNaN: true });
const size = fc.double({ min: 0.05, max: 6, noNaN: true });
const extent: fc.Arbitrary<Extent> = fc
  .record({ x: coord, y: coord, w: size, h: size })
  .map(({ x, y, w, h }) => ({ minX: x, maxX: x + w, minY: y, maxY: y + h }));
const fraction = fc.double({ min: 0, max: 1, noNaN: true });
const free: fc.Arbitrary<FreeArea> = fc.record({
  x0: fraction,
  x1: fraction,
  y0: fraction,
  y1: fraction,
});
const view = fc.record({
  width: fc.double({ min: 2, max: 20, noNaN: true }),
  height: fc.double({ min: 2, max: 20, noNaN: true }),
});
const fill = fc.double({ min: 0.2, max: 1, noNaN: true });

describe('normaliseFreeArea', () => {
  it('is ordered, inside the view and never empty', () => {
    fc.assert(
      fc.property(free, (f) => {
        const n = normaliseFreeArea(f);
        expect(n.x0).toBeGreaterThanOrEqual(0);
        expect(n.x1).toBeLessThanOrEqual(1 + EPS);
        expect(n.x1 - n.x0).toBeGreaterThanOrEqual(0.1 - EPS);
        expect(n.y1 - n.y0).toBeGreaterThanOrEqual(0.1 - EPS);
      }),
    );
  });
});

describe('frame', () => {
  it('puts the object’s centre in the middle of the free area', () => {
    fc.assert(
      fc.property(extent, view, free, fill, (e, v, f, k) => {
        const framing = frame(e, v, f, { fill: k });
        const area = normaliseFreeArea(f);
        const centre = toScreen({ x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2 }, framing, v);
        expect(centre.x).toBeCloseTo((area.x0 + area.x1) / 2, 6);
        expect(centre.y).toBeCloseTo((area.y0 + area.y1) / 2, 6);
      }),
    );
  });

  it('fits the object inside its share of the free area unless clamped to the minimum zoom', () => {
    fc.assert(
      fc.property(extent, view, free, fill, (e, v, f, k) => {
        const framing = frame(e, v, f, { fill: k, maxZoom: 100 });
        if (framing.zoom <= ZOOM.min + EPS) return;
        const area = normaliseFreeArea(f);
        expect(((e.maxX - e.minX) * framing.zoom) / v.width).toBeLessThanOrEqual(
          (area.x1 - area.x0) * k + EPS,
        );
        expect(((e.maxY - e.minY) * framing.zoom) / v.height).toBeLessThanOrEqual(
          (area.y1 - area.y0) * k + EPS,
        );
      }),
    );
  });

  it('keeps the zoom between the minimum and the hotspot’s maximum', () => {
    fc.assert(
      fc.property(
        extent,
        view,
        free,
        fill,
        fc.double({ min: 1, max: 10, noNaN: true }),
        (e, v, f, k, max) => {
          const { zoom } = frame(e, v, f, { fill: k, maxZoom: max });
          expect(zoom).toBeGreaterThanOrEqual(ZOOM.min);
          expect(zoom).toBeLessThanOrEqual(Math.max(ZOOM.min, max));
        },
      ),
    );
  });

  it('honours a fixed zoom', () => {
    expect(
      frame({ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { width: 6, height: 6 }, wholeView, {
        fill: 0.7,
        zoom: 3.2,
      }).zoom,
    ).toBe(3.2);
  });

  it('aims at the object’s centre when nothing covers the view', () => {
    const f = frame({ minX: 1, maxX: 2, minY: -1, maxY: 0 }, { width: 6, height: 4 }, wholeView, {
      fill: 0.5,
    });
    expect(f.x).toBeCloseTo(1.5);
    expect(f.y).toBeCloseTo(-0.5);
  });

  it('shifts the aim right when a panel covers the right of the view', () => {
    const e = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 };
    const f = frame(e, { width: 8, height: 4 }, { x0: 0, x1: 0.6, y0: 0, y1: 1 }, { fill: 0.5 });
    // The object sits left of centre, so the camera aims right of it.
    expect(f.x).toBeGreaterThan(0);
  });
});
