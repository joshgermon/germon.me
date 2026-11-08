import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Tests cover pure modules (domain/, application/ with in-memory adapters), so they run in plain
 * Node without Astro's Vite pipeline — only the `~/` alias is needed.
 */
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
