/**
 * Inbound adapter: the office export's `manifest.json` (written by the Blender exporter next to
 * `office.glb`). Parsed with Zod at this boundary into the domain's `OfficeManifest`; the raw
 * shape never leaves this file. Every field is optional on the wire: a missing envelope falls
 * back to the export's defaults.
 */
// zod/mini, like the palette registry's adapter: the two share zod's core in one chunk, so the
// office adds nothing to what the palette already loads (full zod would pull ~40 kB more into
// that shared chunk, on every page load).
import * as z from 'zod/mini';

import type { OfficeManifest } from '~/domain/office/manifest';
import { defaultCameraLimits } from '~/domain/office/orbit';
import { err, ok, type Result } from '~/lib/result';

// Zod 4's z.number() already rejects Infinity and NaN.
const Range = z.tuple([z.number(), z.number()]);

/** The manifest's shape — only the fields the viewer reads. */
const RawManifest = z.object({
  cameraLimits: z.optional(
    z.object({
      azimuthOffsetDeg: z.optional(Range),
      elevationDeg: z.optional(Range),
    }),
  ),
  evening: z.optional(z.record(z.string(), z.string().check(z.minLength(1)))),
});

/** The manifest couldn't be fetched, or wasn't the expected shape. */
export class ManifestUnavailable extends Error {
  readonly _tag = 'ManifestUnavailable' as const;

  /**
   * @param reason - `http` (bad status), `network` (no response) or `shape` (unexpected JSON).
   * @param cause - The underlying failure.
   */
  constructor(
    readonly reason: 'http' | 'network' | 'shape',
    override readonly cause: unknown,
  ) {
    super(`Office manifest unavailable (${reason})`);
  }
}

/**
 * Parse a manifest's JSON.
 *
 * @param json - The decoded `manifest.json`.
 * @returns The domain manifest, or `ManifestUnavailable` (`shape`) if it doesn't match.
 */
export function parseManifest(json: unknown): Result<OfficeManifest, ManifestUnavailable> {
  const parsed = RawManifest.safeParse(json);
  if (!parsed.success) return err(new ManifestUnavailable('shape', parsed.error));
  const { cameraLimits, evening } = parsed.data;
  return ok({
    cameraLimits: {
      azimuthOffsetDeg: cameraLimits?.azimuthOffsetDeg ?? defaultCameraLimits.azimuthOffsetDeg,
      elevationDeg: cameraLimits?.elevationDeg ?? defaultCameraLimits.elevationDeg,
    },
    evening: new Map(Object.entries(evening ?? {})),
  });
}

/**
 * Fetch and parse the manifest.
 *
 * @param url - Where `manifest.json` is served.
 * @param fetcher - `fetch`, or a stand-in.
 * @returns The domain manifest, or why it couldn't be read.
 */
export async function loadManifest(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<OfficeManifest, ManifestUnavailable>> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (cause) {
    return err(new ManifestUnavailable('network', cause));
  }
  if (!res.ok) return err(new ManifestUnavailable('http', res.status));
  try {
    const json: unknown = await res.json();
    return parseManifest(json);
  } catch (cause) {
    return err(new ManifestUnavailable('shape', cause));
  }
}
