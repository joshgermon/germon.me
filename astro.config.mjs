import { defineConfig } from 'astro/config';
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [svelte()],
  output: 'server',

  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
    maxDuration: 8,
  }),

  vite: {
    plugins: [tailwindcss()],
  },
});