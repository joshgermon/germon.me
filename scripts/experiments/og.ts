/**
 * Captures an experiment's link-preview image: opens `/experiments/<slug>/?og` from the static
 * build in headless Chrome at 1200×630 (2×), waits for the page to mark itself ready
 * (`<html data-og-ready>`; after 10 s it shoots anyway), and saves
 * `public/experiments/<slug>/og.jpg`. Point the manifest's `image` at it.
 *
 *   pnpm build && pnpm experiment:og <slug> [extra query, e.g. "m=drain"]
 *
 * Needs Google Chrome (or CHROME_PATH). WebGL runs on SwiftShader, so 3D pages render headless.
 */
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from 'playwright-core';

import { OG_SIZE } from '../../src/experiments/kit/manifest';

const [slug, extra = ''] = process.argv.slice(2);
if (!slug) {
  console.error('usage: pnpm experiment:og <slug> [query]');
  process.exit(1);
}
const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist', 'client');
const OUT = join(ROOT, 'public', 'experiments', slug, 'og.jpg');
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  let file = join(DIST, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

const browser = await chromium.launch({
  headless: true,
  ...(process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' }),
  args: [
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: OG_SIZE.width, height: OG_SIZE.height },
    deviceScaleFactor: OG_SIZE.scale,
    reducedMotion: 'reduce',
  });
  const query = ['og', extra].filter(Boolean).join('&');
  await page.goto(`${origin}/experiments/${slug}/?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('html[data-og-ready]', { timeout: 10_000 }).catch(() => {
    console.warn('og: page never marked itself ready; capturing anyway');
  });
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 86 });
  console.warn(`og: ${OUT} (${Math.round(statSync(OUT).size / 1024)} KB)`);
} finally {
  await browser.close();
  server.close();
}
