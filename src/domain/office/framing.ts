/**
 * Framing a close-up with an orthographic camera: how far to zoom so an object fills a share
 * of the part of the view nothing covers (beside the detail panel, between the object list and
 * the panel), and where to aim so the object sits in the middle of that free part. Works on
 * the object's extent projected onto the camera's right/up axes, in world units. Pure.
 */

/** An object's projected extent on the camera plane (right = +x, up = +y), in world units. */
export type Extent = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};

/**
 * The uncovered part of the view, as fractions of its width (`x0`→`x1`, from the left) and
 * height (`y0`→`y1`, from the top).
 */
export type FreeArea = {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
};

/** The whole view. */
export const wholeView: FreeArea = { x0: 0, x1: 1, y0: 0, y1: 1 };

/** How a hotspot wants to be framed. */
export type FrameSpec = {
  /** Share of the free area the object should fill, 0–1. */
  readonly fill: number;
  /** Upper bound for the derived zoom (1 = the whole room). */
  readonly maxZoom?: number;
  /** A fixed zoom instead of the derived one (for objects whose extent misleads). */
  readonly zoom?: number;
};

/** Where to aim (on the camera plane) and how far to zoom. */
export type Framing = {
  readonly zoom: number;
  /** The camera target's coordinates on the camera plane, in world units. */
  readonly x: number;
  readonly y: number;
};

/** Zoom bounds: never closer than this to "whole room", never further than this by default. */
export const ZOOM = { min: 1.2, max: 4.5 } as const;
/** Smallest extent considered, so a degenerate object can't ask for infinite zoom. */
const MIN_EXTENT = 0.02;
/** Smallest free share considered, so a covered view still frames something. */
const MIN_FREE = 0.1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** One axis of a free area: ordered, inside 0–1, at least `MIN_FREE` wide. */
const span = (a: number, b: number): readonly [number, number] => {
  const lo = clamp(Math.min(a, b), 0, 1);
  const hi = clamp(Math.max(a, b), 0, 1);
  if (hi - lo >= MIN_FREE) return [lo, hi];
  const mid = clamp((lo + hi) / 2, MIN_FREE / 2, 1 - MIN_FREE / 2);
  return [mid - MIN_FREE / 2, mid + MIN_FREE / 2];
};

/**
 * Sanitise a free area: inside the view, ordered, and at least `MIN_FREE` in each direction.
 *
 * @param area - A measured free area.
 * @returns A usable free area.
 */
export function normaliseFreeArea(area: FreeArea): FreeArea {
  const [x0, x1] = span(area.x0, area.x1);
  const [y0, y1] = span(area.y0, area.y1);
  return { x0, x1, y0, y1 };
}

/**
 * Frame an object.
 *
 * @param extent - The object's projected extent.
 * @param view - The camera's visible width and height at zoom 1, in world units.
 * @param free - The uncovered part of the view.
 * @param spec - The hotspot's framing.
 * @returns The zoom, and the target that puts the object's centre in the middle of `free`.
 */
export function frame(
  extent: Extent,
  view: { readonly width: number; readonly height: number },
  free: FreeArea,
  spec: FrameSpec,
): Framing {
  const area = normaliseFreeArea(free);
  const objW = Math.max(MIN_EXTENT, extent.maxX - extent.minX);
  const objH = Math.max(MIN_EXTENT, extent.maxY - extent.minY);
  const fill = clamp(spec.fill, 0.05, 1);
  const fit = Math.min(
    (view.width * (area.x1 - area.x0) * fill) / objW,
    (view.height * (area.y1 - area.y0) * fill) / objH,
  );
  const zoom = spec.zoom ?? clamp(fit, ZOOM.min, Math.max(ZOOM.min, spec.maxZoom ?? ZOOM.max));
  // The free area's centre, as an offset from the view's centre, in world units at this zoom.
  const dx = ((area.x0 + area.x1) / 2 - 0.5) * (view.width / zoom);
  const dy = (0.5 - (area.y0 + area.y1) / 2) * (view.height / zoom);
  return {
    zoom,
    x: (extent.minX + extent.maxX) / 2 - dx,
    y: (extent.minY + extent.maxY) / 2 - dy,
  };
}

/**
 * Where a camera-plane point lands on screen, as fractions of the view (0,0 top-left).
 *
 * @param point - A point on the camera plane, in world units.
 * @param framing - The camera's target and zoom.
 * @param view - The camera's visible width and height at zoom 1.
 * @returns The point's position as fractions of the view.
 */
export function toScreen(
  point: { readonly x: number; readonly y: number },
  framing: Framing,
  view: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  return {
    x: 0.5 + ((point.x - framing.x) * framing.zoom) / view.width,
    y: 0.5 - ((point.y - framing.y) * framing.zoom) / view.height,
  };
}
