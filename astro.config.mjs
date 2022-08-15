import { defineConfig } from 'astro/config';
import fonts from 'astro-fonts-next';
import svelte from "@astrojs/svelte";

import prefetch from "@astrojs/prefetch";

// https://astro.build/config
export default defineConfig({
  integrations: [fonts({
    url: 'https://fonts.googleapis.com/css2?family=Manrope&family=Space+Grotesk:wght@500&display=swap'
  }), svelte(), prefetch()]
});