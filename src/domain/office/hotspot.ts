/**
 * The office's hotspots: the objects in the 3D room you can point at. Each id matches an
 * `HS_<id>` group (and an `HIT_<id>` collider) in `public/office/office.glb`; a hotspot whose
 * node is missing from the model is simply skipped by the viewer.
 */

/** Every hotspot, in the order the room lists them. */
export const hotspotIds = [
  'Monitor',
  'Sim',
  'Tele',
  'Acoustic',
  'Amp',
  'Jersey',
  'Ferrari',
  'Helmet',
  'Books',
  'Lamp',
  'Ball',
  'Hoop',
] as const;

/** One object in the office. */
export type HotspotId = (typeof hotspotIds)[number];

/**
 * Narrow a node-name suffix to a hotspot id.
 *
 * @param name - e.g. `Tele` from `HS_Tele`.
 * @returns Whether `name` is a known hotspot.
 */
export function isHotspotId(name: string): name is HotspotId {
  return hotspotIds.some((id) => id === name);
}
