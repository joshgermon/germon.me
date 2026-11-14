/**
 * Fetch and decode the baked day in the browser. The file is gzipped at rest; servers may or may
 * not add a Content-Encoding, so check the bytes and decompress only when needed.
 */
import {
  decode,
  type DecodeError,
  type ObservedDay,
} from '~/experiments/ground-stop/domain/observed-codec';
import { err, type Result } from '~/experiments/ground-stop/lib/result';

/** Why the day couldn't be loaded. */
export type LoadError =
  | DecodeError
  | { readonly _tag: 'Http'; readonly status: number }
  | { readonly _tag: 'Network' };

const gunzip = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Load `url` into an `ObservedDay`. */
export const loadDay = async (url: string): Promise<Result<ObservedDay, LoadError>> => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return err({ _tag: 'Network' });
  }
  if (!res.ok) return err({ _tag: 'Http', status: res.status });
  const raw = new Uint8Array(await res.arrayBuffer());
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? await gunzip(raw) : raw;
  return decode(bytes);
};
