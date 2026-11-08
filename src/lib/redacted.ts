/**
 * A secret that can't leak by accident: it prints as `<redacted>` in logs, errors and JSON.
 * Unwrap only inside the Adapter that needs the raw value.
 *
 * @template T - The wrapped secret's type.
 */
export class Redacted<T> {
  readonly #value: T;

  private constructor(value: T) {
    this.#value = value;
  }

  /**
   * Wrap a secret at the boundary where it enters the program.
   *
   * @template T - The secret's type.
   * @param value - The raw secret.
   * @returns The wrapped secret.
   */
  static make<T>(value: T): Redacted<T> {
    return new Redacted(value);
  }

  /**
   * Read the raw secret. Call only where it is sent to its destination.
   *
   * @returns The raw secret.
   */
  unwrap(): T {
    return this.#value;
  }

  /**
   * Render safely.
   *
   * @returns The placeholder `<redacted>`.
   */
  toString(): string {
    return '<redacted>';
  }

  /**
   * Serialise safely.
   *
   * @returns The placeholder `<redacted>`.
   */
  toJSON(): string {
    return '<redacted>';
  }
}
