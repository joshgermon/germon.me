/**
 * Fetches the palette's command registry from its prerendered, versioned JSON file (see
 * `components/palette/palette-data.ts`). The file is this deploy's own build output, so the
 * shape is checked at the top level only; a failed fetch leaves the palette closed.
 */
import * as z from 'zod/mini';

import { err, ok, type Result } from '~/lib/result';
import type { CommandRegistry } from '~/site/commands';

/** The registry couldn't be loaded (offline, a mid-deploy request, a malformed response). */
export class PaletteRegistryUnavailable extends Error {
  readonly _tag = 'PaletteRegistryUnavailable' as const;

  /** @param reason - What went wrong, for logs. */
  constructor(readonly reason: string) {
    super(`Palette registry unavailable: ${reason}`);
  }
}

const Envelope = z.object({
  suggestions: z.object({ commands: z.array(z.unknown()) }),
  groups: z.array(z.unknown()),
  views: z.object({ Notes: z.unknown(), Career: z.unknown(), Projects: z.unknown() }),
});

/**
 * Load the registry.
 *
 * @param src - The versioned registry URL the page was built with.
 * @returns The registry, or why it couldn't be loaded. Never rejects.
 */
export async function loadPaletteRegistry(
  src: string,
): Promise<Result<CommandRegistry, PaletteRegistryUnavailable>> {
  let response: Response;
  try {
    response = await fetch(src);
  } catch {
    return err(new PaletteRegistryUnavailable('network'));
  }
  if (!response.ok) return err(new PaletteRegistryUnavailable(`HTTP ${response.status}`));
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return err(new PaletteRegistryUnavailable('not JSON'));
  }
  if (!Envelope.safeParse(json).success)
    return err(new PaletteRegistryUnavailable('unexpected shape'));
  // SAFETY: the file is `JSON.stringify(buildCommands(...))` from this same build, fetched by
  // its content hash, so it is exactly a `CommandRegistry`; the envelope check above guards
  // against serving the wrong file.
  return ok(json as CommandRegistry);
}
