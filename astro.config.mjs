import { defineConfig } from 'astro/config';
import fonts from 'astro-fonts-next';
import netlify from '@astrojs/netlify/edge-functions';

import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  integrations: [fonts({
    url: 'https://fonts.googleapis.com/css2?family=Manrope&family=Space+Grotesk:wght@500&display=swap'
  }), svelte()],
  vite: {
    ssr: {
      external: ["svgo"]
    }
  },
  experimental: {
    integrations: true
  },
  adapter: netlify()
});