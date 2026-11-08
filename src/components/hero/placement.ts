/**
 * Where a pill's preview card sits relative to the cursor: below-right by default, flipped to
 * the other side of the cursor near the right or bottom edge, and always fully on screen.
 * Pure geometry.
 */

/** A point in viewport pixels. */
export type Point = { readonly x: number; readonly y: number };

/** A width and height in pixels. */
export type Size = { readonly width: number; readonly height: number };

/** Gap from cursor to card, and from card to viewport edge. */
const OFFSET = { x: 18, y: 24, flip: 18 } as const;
const MARGIN = 12;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * The card's top-left corner for a cursor position.
 *
 * @param cursor - Pointer position.
 * @param card - The card's size.
 * @param viewport - The viewport's size.
 * @returns The top-left corner, inside the viewport's margins whenever the card fits.
 */
export function placePeek(cursor: Point, card: Size, viewport: Size): Point {
  let x = cursor.x + OFFSET.x;
  let y = cursor.y + OFFSET.y;
  if (x + card.width > viewport.width - MARGIN) x = cursor.x - card.width - OFFSET.flip;
  if (y + card.height > viewport.height - MARGIN) y = cursor.y - card.height - OFFSET.flip;
  return {
    x: clamp(x, MARGIN, viewport.width - card.width - MARGIN),
    y: clamp(y, MARGIN, viewport.height - card.height - MARGIN),
  };
}
