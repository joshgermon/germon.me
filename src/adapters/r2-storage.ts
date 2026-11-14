/**
 * The site's blob store on Cloudflare R2: the `Storage` port over an `R2Bucket` binding. R2's
 * shapes and exceptions stay in this file.
 */
import { err, ok } from '~/lib/result';
import { StorageUnavailable, type Storage } from '~/lib/storage';

/**
 * Wrap a bucket binding.
 *
 * @param bucket - The R2 binding (`env.STORAGE`).
 * @returns The bucket as a `Storage`.
 */
export const r2Storage = (bucket: R2Bucket): Storage => ({
  get: async (key) => {
    try {
      const object = await bucket.get(key);
      return ok(object ? new Uint8Array(await object.arrayBuffer()) : null);
    } catch (cause) {
      return err(new StorageUnavailable(key, cause));
    }
  },
  put: async (key, bytes, options) => {
    try {
      await bucket.put(
        key,
        bytes,
        options?.contentType ? { httpMetadata: { contentType: options.contentType } } : {},
      );
      return ok(undefined);
    } catch (cause) {
      return err(new StorageUnavailable(key, cause));
    }
  },
  list: async (prefix) => {
    try {
      const listed = await bucket.list({ prefix, limit: 1000 });
      return ok(listed.objects.map((o) => o.key));
    } catch (cause) {
      return err(new StorageUnavailable(prefix, cause));
    }
  },
  remove: async (keys) => {
    try {
      if (keys.length > 0) await bucket.delete([...keys]);
      return ok(undefined);
    } catch (cause) {
      return err(new StorageUnavailable(keys[0] ?? '', cause));
    }
  },
});
