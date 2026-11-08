/**
 * Defects — states that correct code can never reach. These throw; expected failures are
 * `Result` values instead (see `result.ts`).
 */

/**
 * Exhaustiveness check for tagged unions. TypeScript errors at the call site if a case is missing.
 *
 * @param unexpectedCase - The value that should have been narrowed to `never`.
 * @throws Always: reaching this is a defect.
 */
export function casesHandled(unexpectedCase: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(unexpectedCase)}`);
}

/**
 * Mark a branch the program's invariants make impossible.
 *
 * @param msg - What invariant was broken.
 * @throws Always: reaching this is a defect.
 */
export function shouldNeverHappen(msg = 'This should never happen'): never {
  throw new Error(msg);
}
