/**
 * The `client:settled` hydration directive (registered in astro.config.ts): hydrate an island
 * once it is in view (as `client:visible`) *and* the rest of the page has settled, so a heavy
 * island below the fold never competes with the page it sits on. Settled means the `load` event
 * has fired, every island that hydrates by itself (`client:load`, `client:idle`) has hydrated,
 * and the main thread has a long idle period. Until then the island's JavaScript isn't even
 * requested; scrolling to it early (or the palette scrolling to it) only queues it.
 *
 * Astro inlines this file into the page as a classic script, so it stays small and imports
 * nothing at runtime.
 */
import type { ClientDirective } from 'astro';

declare global {
  namespace Astro {
    interface ClientDirectives {
      /** Hydrate when visible, after the page has loaded and gone idle. */
      'client:settled'?: boolean;
    }
  }
}

/** Longest wait for the other islands, so one that fails to hydrate doesn't hold this back. */
const ISLANDS_CAP_MS = 10_000;
/** An idle period at least this long means nothing is waiting on the main thread. */
const QUIET_MS = 40;
/** Idle periods to try before accepting a short one (a page that is always animating). */
const QUIET_TRIES = 20;

const loaded = (): Promise<void> =>
  new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });

/** Islands that hydrate without the visitor doing anything, and haven't yet. */
const selfHydratingPending = (): boolean =>
  document.querySelector('astro-island[ssr]:is([client="load"], [client="idle"])') !== null;

const islandsHydrated = (): Promise<void> =>
  new Promise((resolve) => {
    if (!selfHydratingPending()) {
      resolve();
      return;
    }
    const done = (): void => {
      observer.disconnect();
      window.clearTimeout(cap);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (!selfHydratingPending()) done();
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['ssr'] });
    const cap = window.setTimeout(done, ISLANDS_CAP_MS);
  });

const quiet = (): Promise<void> =>
  new Promise((resolve) => {
    // Older Safari has no `requestIdleCallback` (the DOM types assume it everywhere).
    if (typeof Reflect.get(window, 'requestIdleCallback') !== 'function') {
      setTimeout(resolve, 200);
      return;
    }
    let tries = 0;
    const check = (deadline: IdleDeadline): void => {
      if (deadline.timeRemaining() >= QUIET_MS || ++tries >= QUIET_TRIES) resolve();
      else window.requestIdleCallback(check);
    };
    window.requestIdleCallback(check);
  });

/** Resolves the first time one of the island's children intersects the viewport. */
const visible = (el: HTMLElement): Promise<void> =>
  new Promise((resolve) => {
    // `astro-island` is `display: contents`, so observe its children (as `client:visible`).
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      resolve();
    });
    for (const child of el.children) observer.observe(child);
  });

const settledDirective: ClientDirective = (load, _options, el) => {
  const settled = loaded().then(islandsHydrated).then(quiet);
  void Promise.all([visible(el), settled]).then(async () => {
    const hydrate = await load();
    await hydrate();
  });
};

export default settledDirective;
