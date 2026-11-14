/**
 * Expected failures as values. Throw only for defects; anything a caller should handle is a
 * `Result` with a tagged error.
 */

/** Success or a tagged failure. */
export type Result<A, E extends { readonly _tag: string }> =
  | { readonly _tag: 'Ok'; readonly value: A }
  | { readonly _tag: 'Err'; readonly error: E };

/** Wrap a value. */
export const ok = <A>(value: A): { readonly _tag: 'Ok'; readonly value: A } => ({
  _tag: 'Ok',
  value,
});

/** Wrap a failure. */
export const err = <E extends { readonly _tag: string }>(
  error: E,
): { readonly _tag: 'Err'; readonly error: E } => ({
  _tag: 'Err',
  error,
});
