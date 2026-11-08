/**
 * Captures the share card (`/og`, see components/og/OgCard.astro) as the link-preview assets:
 *
 * - `public/og.jpg` — the card at rest (the last frame). JPEG, because the film grain makes a
 *   PNG four times the size for no visible gain.
 * - `public/og.mp4` — the card's entrance, frame by frame, as a small looping H.264 video.
 *
 * Run `pnpm og` after changing the hero sentence or the card. It builds the site, serves
 * `dist/client`, opens the page once in headless Chrome, pauses every animation and steps them
 * through time, so each frame is exact rather than a screen recording. Needs Google Chrome (or
 * `CHROME_PATH`) and ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

import { chromium } from 'playwright-core';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist', 'client');
const WIDTH = 1200;
const HEIGHT = 630;
const FPS = 30;
/** How long the finished card holds before the video loops. */
const HOLD_MS = 1400;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Serve the static build on a free port. */
function serve(): Promise<{ origin: string; close: () => void }> {
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
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

const { origin, close } = await serve();
const browser = await chromium.launch({
  headless: true,
  ...(process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' }),
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});
const frames = mkdtempSync(join(tmpdir(), 'og-frames-'));

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(`${origin}/og/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Freeze every animation at its start and measure the whole timeline.
  const endMs = await page.evaluate(() => {
    let end = 0;
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
      end = Math.max(end, Number(animation.effect?.getComputedTiming().endTime ?? 0));
    }
    return end;
  });
  const total = Math.ceil(((endMs + HOLD_MS) / 1000) * FPS);
  const card = page.locator('[data-og]');

  for (let frame = 0; frame < total; frame++) {
    const t = (frame / FPS) * 1000;
    await page.evaluate((time) => {
      for (const animation of document.getAnimations()) animation.currentTime = time;
    }, t);
    await card.screenshot({ path: join(frames, `${String(frame).padStart(4, '0')}.png`) });
  }
  await card.screenshot({ path: join(ROOT, 'public', 'og.jpg'), type: 'jpeg', quality: 90 });

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(FPS),
      '-i',
      join(frames, '%04d.png'),
      // H.264 in yuv420p plays everywhere link previews do; faststart lets it begin at once.
      '-c:v',
      'libx264',
      '-preset',
      'veryslow',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      join(ROOT, 'public', 'og.mp4'),
    ],
    { stdio: 'inherit' },
  );
  const kb = (file: string): number => Math.round(statSync(join(ROOT, 'public', file)).size / 1024);
  console.warn(
    `og.jpg ${kb('og.jpg')} KB · og.mp4 ${kb('og.mp4')} KB (${total} frames, ${(total / FPS).toFixed(1)}s)`,
  );
} finally {
  await browser.close();
  close();
  rmSync(frames, { recursive: true, force: true });
}
