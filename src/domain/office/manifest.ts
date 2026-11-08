/**
 * What the viewer needs from the exporter's `manifest.json`, in domain terms. The adapter
 * (`adapters/office-manifest.ts`) parses the raw file into this.
 */
import type { CameraLimits } from './orbit';

/** The parts of the office export's manifest the viewer reads. */
export type OfficeManifest = {
  /** The orbit envelope the model was culled for; the camera must never leave it. */
  readonly cameraLimits: CameraLimits;
  /**
   * The evening light-map URL per material name, for materials whose glTF extras don't carry
   * their own `bakeEvening`.
   */
  readonly evening: ReadonlyMap<string, string>;
};
