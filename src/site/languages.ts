/**
 * Programming-language colours for project dots (GitHub's, nudged to read on near-black).
 * Unknown languages get no colour; callers fall back to a neutral token.
 */
const colors: Readonly<Record<string, string>> = {
  Go: '#00add8',
  Rust: '#de8a5a',
  C: '#8e9bab',
  'C++': '#f34b7d',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Zig: '#ec915c',
  Python: '#3572a5',
  Lua: '#6c7ff0',
  Svelte: '#ff3e00',
};

/**
 * The dot colour for a language.
 *
 * @param language - GitHub's language name, e.g. `TypeScript`.
 * @returns A CSS colour, or `undefined` for languages without one.
 */
export const languageColor = (language: string): string | undefined => colors[language];
