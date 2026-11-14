/**
 * The globe's colours, read from the design tokens at runtime so the scene and the HUD can never
 * drift apart (tokens.css declares them `@theme static`, so they're always emitted).
 */
import type { Palette } from './globe';

const TOKENS = {
  ocean: '--color-globe-ocean',
  oceanDot: '--color-globe-ocean-dot',
  land: '--color-globe-land',
  us: '--color-globe-us',
  flight: '--color-flight',
  foreign: '--color-flight-foreign',
  held: '--color-held',
  released: '--color-released',
  atmosphere: '--color-atmosphere',
} as const satisfies Record<keyof Palette, `--color-${string}`>;

/** Resolve every palette token on an element (usually the root). */
export const readPalette = (root: Element): Palette => {
  const style = getComputedStyle(root);
  const read = (token: string): string => style.getPropertyValue(token).trim();
  return {
    ocean: read(TOKENS.ocean),
    oceanDot: read(TOKENS.oceanDot),
    land: read(TOKENS.land),
    us: read(TOKENS.us),
    flight: read(TOKENS.flight),
    foreign: read(TOKENS.foreign),
    held: read(TOKENS.held),
    released: read(TOKENS.released),
    atmosphere: read(TOKENS.atmosphere),
  };
};
