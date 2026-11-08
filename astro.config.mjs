import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://germon.me',
  output: 'static',
  devToolbar: { enabled: false },
  redirects: { '/concepts': '/' },
});
