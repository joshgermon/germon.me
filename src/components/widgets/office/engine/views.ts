/**
 * How each object is framed in close-up (domain/office/framing). `fill` is the share of the
 * uncovered view the object fills; the amp's group includes a long cable across the floor, so
 * it takes a fixed zoom instead.
 */
import type { FrameSpec } from '~/domain/office/framing';
import type { HotspotId } from '~/domain/office/hotspot';

/** Close-up framing per object; objects without one (lamp, ball) never get a close-up. */
export const closeUps: Readonly<Partial<Record<HotspotId, FrameSpec>>> = {
  Monitor: { fill: 0.62 },
  Sim: { fill: 0.88 },
  Tele: { fill: 0.72 },
  Acoustic: { fill: 0.72 },
  Amp: { fill: 0.7, zoom: 3.2 },
  Jersey: { fill: 0.7 },
  Ferrari: { fill: 0.86 },
  Helmet: { fill: 0.5, maxZoom: 6 },
  Books: { fill: 0.5, maxZoom: 6 },
};
