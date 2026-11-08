/**
 * Worker entry and composition root.
 *
 * Static pages are served straight from assets by Cloudflare; this Worker only
 * runs for on-demand routes (`prerender = false`), which Astro renders and the
 * edge caches with stale-while-revalidate.
 */
import { handle } from '@astrojs/cloudflare/handler';

export default {
  fetch(request, env, context) {
    return handle(request, env, context);
  },
} satisfies ExportedHandler<Env>;
