import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { placePeek } from './placement';

const viewport = { width: 1440, height: 900 };
const card = { width: 264, height: 120 };

describe('placePeek', () => {
  it('sits below-right of the cursor when there is room', () => {
    expect(placePeek({ x: 400, y: 200 }, card, viewport)).toEqual({ x: 418, y: 224 });
  });

  it('flips left near the right edge and up near the bottom', () => {
    expect(placePeek({ x: 1300, y: 850 }, card, viewport)).toEqual({ x: 1018, y: 712 });
  });

  it('stays inside the viewport margins whenever the card fits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1440 }),
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 40, max: 600 }),
        fc.integer({ min: 40, max: 600 }),
        (x, y, width, height) => {
          const at = placePeek({ x, y }, { width, height }, viewport);
          expect(at.x).toBeGreaterThanOrEqual(12);
          expect(at.y).toBeGreaterThanOrEqual(12);
          expect(at.x + width).toBeLessThanOrEqual(viewport.width - 12);
          expect(at.y + height).toBeLessThanOrEqual(viewport.height - 12);
        },
      ),
    );
  });

  it('pins to the top-left margin when the card is bigger than the viewport', () => {
    expect(placePeek({ x: 50, y: 50 }, { width: 2000, height: 2000 }, viewport)).toEqual({
      x: 12,
      y: 12,
    });
  });
});
