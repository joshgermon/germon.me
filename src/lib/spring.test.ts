import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { project, rubberband, Spring } from './spring';

const settle = (s: Spring): number => {
  let frames = 0;
  while (s.step(1 / 60) && frames < 600) frames++;
  return frames;
};

describe('Spring', () => {
  it('settles exactly on its target', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.double({ min: 0.2, max: 1, noNaN: true }),
        (from, to, damping) => {
          const s = new Spring(from, { response: 0.4, damping });
          s.to(to);
          const frames = settle(s);
          expect(frames).toBeLessThan(600);
          expect(s.value).toBe(to);
          expect(s.velocity).toBe(0);
        },
      ),
    );
  });

  it('never overshoots when critically damped', () => {
    const s = new Spring(0, { response: 0.4, damping: 1 });
    s.to(100);
    while (s.step(1 / 60)) expect(s.value).toBeLessThanOrEqual(100.01);
  });

  it('keeps its velocity when retargeted mid-flight (interruptible)', () => {
    const s = new Spring(0, { response: 0.4, damping: 1 });
    s.to(100);
    s.step(1 / 60);
    const v = s.velocity;
    s.to(-100);
    expect(s.velocity).toBe(v);
  });
});

describe('rubberband', () => {
  it('resists: smaller than the overshoot, same sign, never past the dimension', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5000, max: 5000, noNaN: true }).filter((x) => Math.abs(x) > 1e-6),
        fc.double({ min: 1, max: 2000, noNaN: true }),
        (overshoot, dimension) => {
          const r = rubberband(overshoot, dimension);
          expect(Math.sign(r)).toBe(Math.sign(overshoot));
          expect(Math.abs(r)).toBeLessThan(Math.abs(overshoot));
          expect(Math.abs(r)).toBeLessThan(dimension);
        },
      ),
    );
  });
});

describe('project', () => {
  it('projects further for faster flicks, in the flick direction', () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeGreaterThan(project(500));
    expect(project(-800)).toBeLessThan(0);
  });
});
