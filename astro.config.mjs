import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/edge-functions';
import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  adapter: netlify(),
  output: 'server'
});