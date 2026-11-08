/**
 * Expected failures are values. A `Result` is either a success (`ok`) or a typed error (`err`);
 * callers must branch on `_tag` before reading `value` or `error`.
 */

/**
 * A successful or failed outcome.
 *
 * @template T - The success value.
 * @template E - The tagged error type.
 */
export type Result<T, E extends Error> =
  | { readonly _tag: 'ok'; readonly value: T }
  | { readonly _tag: 'err'; readonly error: E };

/**
 * Wrap a success value.
 *
 * @template T - The success value type.
 * @param value - The value to wrap.
 * @returns An `ok` result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { _tag: 'ok', value };
}

/**
 * Wrap a typed error.
 *
 * @template E - The error type.
 * @param error - The error to wrap.
 * @returns An `err` result.
 */
export function err<E extends Error>(error: E): Result<never, E> {
  return { _tag: 'err', error };
}

/**
 * Map the success value of a result, leaving errors untouched.
 *
 * @template T - The original success type.
 * @template U - The mapped success type.
 * @template E - The error type.
 * @param result - The result to map.
 * @param fn - Applied to the success value.
 * @returns The mapped result.
 */
export function map<T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result._tag === 'ok' ? ok(fn(result.value)) : result;
}
