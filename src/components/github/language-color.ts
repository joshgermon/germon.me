/**
 * The colour token for a repo's language dot. Languages without their own token share
 * `lang-other`. Returns a CSS `var()` so components set it as `--c` and never hold hex values.
 */
const tokens: Readonly<Record<string, string>> = {
  Go: '--color-lang-go',
  Rust: '--color-lang-rust',
  C: '--color-lang-c',
  'C++': '--color-lang-cpp',
  TypeScript: '--color-lang-typescript',
};

/**
 * The CSS colour for a language.
 *
 * @param language - GitHub's language name, e.g. `TypeScript`.
 * @returns A `var(--color-lang-…)` reference.
 */
export function languageColor(language: string): string {
  return `var(${tokens[language] ?? '--color-lang-other'})`;
}
