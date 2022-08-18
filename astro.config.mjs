import { defineConfig } from 'astro/config';
import svelte from "@astrojs/svelte";
import prefetch from "@astrojs/prefetch";

import netlify from "@astrojs/netlify/edge-functions";

// https://astro.build/config
export default defineConfig({
  integrations: [svelte(), prefetch({
    throttle: 5
  })],
  experimental: {
    integrations: true,
  },
  adapter: netlify(),
  output: 'server'
});