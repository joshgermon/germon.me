/**
 * The palette's command registry, built once per build from the notes and the GitHub snapshot.
 * It is served as its own static file (`pages/palette/[version].json.ts`), not inlined in the
 * home page: the registry is a quarter of the page's HTML and nobody needs it for first paint.
 * The file name carries a hash of its contents, so a page and its registry always match and the
 * file can be cached forever.
 */
import { loadActivitySnapshot } from '~/adapters/github/composition-root';
import { contributions, repos } from '~/domain/github/activity';
import { stats } from '~/domain/github/contributions';
import { buildCommands, type CommandRegistry } from '~/site/commands';
import { allNotes, summarise } from '~/site/notes';

/** The registry, its serialised form and the version it is published under. */
export type PaletteData = {
  readonly registry: CommandRegistry;
  readonly json: string;
  /** A hash of `json`; the file's name. */
  readonly version: string;
};

/** FNV-1a: a short, stable fingerprint of the registry for its file name (not security). */
const fingerprint = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const build = async (): Promise<PaletteData> => {
  const notes = (await allNotes()).map(summarise);
  const activity = await loadActivitySnapshot();
  const report = activity._tag === 'ok' ? activity.value.activity : undefined;
  const calendar = report ? contributions(report) : undefined;
  const registry = buildCommands({
    notes,
    repos: report ? repos(report) : undefined,
    stats: calendar ? stats(calendar) : undefined,
    now: new Date(),
  });
  const json = JSON.stringify(registry);
  return { registry, json, version: fingerprint(json) };
};

let built: Promise<PaletteData> | undefined;

/**
 * The palette data for this build. Memoised, so the page and the endpoint agree on one version.
 *
 * @returns The registry, its JSON and its version.
 */
export function loadPaletteData(): Promise<PaletteData> {
  built ??= build();
  return built;
}

/**
 * Where a registry version is served.
 *
 * @param version - The registry's fingerprint.
 * @returns The site-relative URL of its JSON.
 */
export function palettePath(version: string): string {
  return `/palette/${version}.json`;
}
