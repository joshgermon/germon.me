/**
 * Blob storage as a port: keys to bytes, nothing else. The site has one store (an R2 bucket,
 * `adapters/r2-storage.ts`); every user of it works inside its own namespace (`namespaced`), so
 * the site and each experiment keep their entries apart and none can read or overwrite another's.
 * Tests use `memoryStorage`.
 */
import type { z } from 'zod';

import { err, ok, type Result } from './result';

/** The store could not be reached, or refused the operation. */
export class StorageUnavailable extends Error {
  readonly _tag = 'StorageUnavailable' as const;

  /**
   * @param key - The key (or prefix) being worked on.
   * @param cause - The underlying failure.
   */
  constructor(
    readonly key: string,
    override readonly cause: unknown,
  ) {
    super(`Storage unavailable: ${key}`);
  }
}

/** A stored value didn't have the shape its reader expected. */
export class StoredValueUnreadable extends Error {
  readonly _tag = 'StoredValueUnreadable' as const;

  /**
   * @param key - The key whose value couldn't be read.
   * @param cause - The parse failure.
   */
  constructor(
    readonly key: string,
    override readonly cause: unknown,
  ) {
    super(`Stored value unreadable: ${key}`);
  }
}

/** A key-to-bytes store. Keys are `/`-separated paths. */
export interface Storage {
  /** The bytes at `key`, or null when nothing is stored there. */
  readonly get: (
    key: string,
  ) => Promise<Result<Uint8Array<ArrayBuffer> | null, StorageUnavailable>>;
  /** Store bytes at `key`, replacing what was there. */
  readonly put: (
    key: string,
    bytes: Uint8Array,
    options?: { readonly contentType?: string },
  ) => Promise<Result<void, StorageUnavailable>>;
  /** Up to 1,000 keys that start with `prefix`, in order. */
  readonly list: (prefix: string) => Promise<Result<readonly string[], StorageUnavailable>>;
  /** Remove keys; ones that don't exist are ignored. */
  readonly remove: (keys: readonly string[]) => Promise<Result<void, StorageUnavailable>>;
}

/**
 * A view of `storage` confined to `namespace`: every key is stored under `<namespace>/`, and
 * listed keys come back without it.
 *
 * @param storage - The store to confine.
 * @param namespace - The owner's path, e.g. `experiments/ground-stop`.
 * @returns A store that can only see its own entries.
 */
export const namespaced = (storage: Storage, namespace: string): Storage => {
  const root = `${namespace.replace(/\/+$/, '')}/`;
  return {
    get: (key) => storage.get(root + key),
    put: (key, bytes, options) => storage.put(root + key, bytes, options),
    list: async (prefix) => {
      const keys = await storage.list(root + prefix);
      return keys._tag === 'err' ? keys : ok(keys.value.map((k) => k.slice(root.length)));
    },
    remove: (keys) => storage.remove(keys.map((k) => root + k)),
  };
};

/**
 * An in-memory store, for tests and for running without a bucket.
 *
 * @returns An empty store.
 */
export const memoryStorage = (): Storage => {
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    get: (key) => Promise.resolve(ok(entries.get(key) ?? null)),
    put: (key, bytes) => {
      entries.set(key, bytes.slice());
      return Promise.resolve(ok(undefined));
    },
    list: (prefix) =>
      Promise.resolve(ok([...entries.keys()].filter((k) => k.startsWith(prefix)).toSorted())),
    remove: (keys) => {
      for (const k of keys) entries.delete(k);
      return Promise.resolve(ok(undefined));
    },
  };
};

/**
 * Read a JSON value and parse it with a schema.
 *
 * @param storage - The store.
 * @param key - The key to read.
 * @param schema - What the value must look like.
 * @returns The parsed value, or null when nothing is stored there.
 */
export const getJson = async <T>(
  storage: Storage,
  key: string,
  schema: z.ZodType<T>,
): Promise<Result<T | null, StorageUnavailable | StoredValueUnreadable>> => {
  const bytes = await storage.get(key);
  if (bytes._tag === 'err') return bytes;
  if (bytes.value === null) return ok(null);
  try {
    const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes.value)));
    return parsed.success ? ok(parsed.data) : err(new StoredValueUnreadable(key, parsed.error));
  } catch (cause) {
    return err(new StoredValueUnreadable(key, cause));
  }
};

/**
 * Store a value as JSON.
 *
 * @param storage - The store.
 * @param key - The key to write.
 * @param value - Anything JSON can carry.
 * @returns Nothing, or why the store refused.
 */
export const putJson = (
  storage: Storage,
  key: string,
  value: unknown,
): Promise<Result<void, StorageUnavailable>> =>
  storage.put(key, new TextEncoder().encode(JSON.stringify(value)), {
    contentType: 'application/json',
  });
