/**
 * Whether this browser should get the live 3D room or keep the still poster: no WebGL2, a
 * Save-Data request, or a weak device (under 2 GB of memory, or 2 cores or fewer) keep the poster.
 */

/** What the office card can show here. */
export type Capability =
  | { readonly _tag: 'Live' }
  | { readonly _tag: 'Poster'; readonly reason: 'save-data' | 'weak-device' | 'no-webgl2' };

/** A non-standard navigator number (`deviceMemory`), if the browser exposes it. */
const navigatorNumber = (key: string): number | undefined => {
  const value: unknown = Reflect.get(navigator, key);
  return typeof value === 'number' && value > 0 ? value : undefined;
};

/** `navigator.connection.saveData`, where supported. */
const saveData = (): boolean => {
  const connection: unknown = Reflect.get(navigator, 'connection');
  return (
    typeof connection === 'object' &&
    connection !== null &&
    Reflect.get(connection, 'saveData') === true
  );
};

const hasWebGL2 = (): boolean => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
};

/**
 * Decide what to show. Cheap checks first; the WebGL2 probe creates (and frees) a context.
 *
 * @returns `Live`, or `Poster` with the reason.
 */
export function detectCapability(): Capability {
  if (saveData()) return { _tag: 'Poster', reason: 'save-data' };
  const memory = navigatorNumber('deviceMemory');
  const cores = navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : undefined;
  if ((memory !== undefined && memory < 2) || (cores !== undefined && cores <= 2)) {
    return { _tag: 'Poster', reason: 'weak-device' };
  }
  if (!hasWebGL2()) return { _tag: 'Poster', reason: 'no-webgl2' };
  return { _tag: 'Live' };
}
