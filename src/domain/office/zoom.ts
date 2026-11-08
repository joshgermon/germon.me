/**
 * Manual zoom for the office camera: pinch, ⌘/Ctrl-scroll and the card's zoom buttons nudge
 * the orthographic zoom within a short range above the view the camera last settled on (the
 * home view or a close-up), never below it. Pure.
 */

/** How far past the settled view a visitor may zoom, as a multiple of its zoom. */
export const MAX_ZOOM_RATIO = 1.5;

/** One press of a zoom button, as a multiplier. */
export const ZOOM_STEP = 1.25;

/**
 * The zoom after a nudge, kept within `[base, base × maxRatio]`.
 *
 * @param current - The camera's zoom now.
 * @param base - The zoom of the view the camera last settled on.
 * @param factor - The multiplier asked for (above 1 zooms in).
 * @param maxRatio - The ceiling, as a multiple of `base`.
 * @returns The clamped zoom.
 */
export function nudgeZoom(
  current: number,
  base: number,
  factor: number,
  maxRatio: number = MAX_ZOOM_RATIO,
): number {
  const lo = Math.max(Number.MIN_VALUE, base);
  const hi = lo * Math.max(1, maxRatio);
  const next = current * (Number.isFinite(factor) && factor > 0 ? factor : 1);
  return Math.min(hi, Math.max(lo, next));
}

/**
 * The multiplier for a wheel or trackpad-pinch event's vertical delta (pixels; negative is
 * "in"). Exponential, so a fast pinch and many slow ones end in the same place.
 *
 * @param deltaY - `WheelEvent.deltaY`, normalised to pixels.
 * @returns The zoom multiplier.
 */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.01);
}

/**
 * Where a zoom sits within its range, 0 at the settled view and 1 at the ceiling (for
 * enabling the zoom buttons).
 *
 * @param zoom - The camera's zoom now.
 * @param base - The zoom of the settled view.
 * @param maxRatio - The ceiling, as a multiple of `base`.
 * @returns The position in the range, clamped to 0–1.
 */
export function zoomProgress(
  zoom: number,
  base: number,
  maxRatio: number = MAX_ZOOM_RATIO,
): number {
  if (base <= 0 || maxRatio <= 1) return 0;
  return Math.min(1, Math.max(0, Math.log(zoom / base) / Math.log(maxRatio)));
}
