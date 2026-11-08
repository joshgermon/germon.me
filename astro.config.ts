import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://germon.me',
  // Pages prerender to static assets by default; only routes that opt out
  // (`export const prerender = false`) run on the Worker.
  output: 'static',
  adapter: cloudflare({
    prerenderEnvironment: 'node',
    // Every image is known at build time, so optimise once with sharp and ship files.
    imageService: 'compile',
  }),
  integrations: [svelte(), sitemap()],
  // Nothing uses sessions; leaving them on makes the adapter add a KV binding.
  session: false,
  // Stale-while-revalidate at Cloudflare's edge for on-demand routes (GitHub data).
  cache: { provider: cacheCloudflare() },
  build: {
    // One small stylesheet: inline it so first paint waits on no extra request.
    inlineStylesheets: 'always',
  },
  prefetch: { defaultStrategy: 'hover' },
  // Self-hosted, subset fonts with metric-matched fallbacks: no third-party origin on first paint.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: ['400 600'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Newsreader',
      cssVariable: '--font-newsreader',
      weights: ['400 500'],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      weights: ['400 500'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
  env: {
    schema: {
      // Read-only token for GitHub's GraphQL API (contribution calendar). Optional: without it the
      // site falls back to public REST data and a build-time snapshot.
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
