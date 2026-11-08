/**
 * Liquid tab bar: a glass capsule holding tabs, with a glass droplet marking
 * the active tab. Press anywhere on the bar and the droplet lifts (grows,
 * clears, refracts harder) and follows your finger 1:1, stretching with
 * velocity. Release and it projects your momentum to choose a tab, then
 * settles with a spring that inherits your release velocity.
 *
 * Markup:
 *   <nav class="ltb" data-orient="bottom|side">
 *     <liquid-glass class="ltb-bar" radius="pill">
 *       <div class="ltb-items">
 *         <a class="ltb-item" href="#work">…</a>
 *       </div>
 *       <liquid-glass class="ltb-drop" radius="pill"></liquid-glass>
 *     </liquid-glass>
 *   </nav>
 *
 * Emits `tabchange` (detail: { index, item }) on the nav. Scroll-spies any
 * `href="#id"` targets unless `data-spy="off"`.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from './spring';
import { nudgeLight } from './light';
import type { LiquidGlass } from './liquid-glass';

export function mountTabBar(nav: HTMLElement) {
  const bar = nav.querySelector<HTMLElement>('.ltb-bar')!;
  const items = [...nav.querySelectorAll<HTMLElement>('.ltb-item')];
  const drop = nav.querySelector<HTMLElement & Partial<LiquidGlass>>('.ltb-drop')!;
  const vertical = () => nav.dataset.orient === 'side';
  const reduced = prefersReducedMotion();

  let active = Math.max(0, items.findIndex((i) => i.getAttribute('aria-current') === 'page'));
  const pos = new Spring(0, { response: 0.38, damping: 0.82 });
  const lift = new Spring(0, { response: 0.3, damping: 0.75 });
  const stretch = new Spring(0, { response: 0.25, damping: 0.6 });

  const slot = (i: number) => {
    const b = bar.getBoundingClientRect();
    const r = items[i].getBoundingClientRect();
    return vertical()
      ? { c: r.top - b.top + r.height / 2, size: r.height, cross: r.width, off: r.left - b.left }
      : { c: r.left - b.left + r.width / 2, size: r.width, cross: r.height, off: r.top - b.top };
  };

  const apply = () => {
    const s = slot(active);
    const along = s.size;
    const l = lift.value;
    const st = Math.min(Math.abs(stretch.value) / 2500, 0.35);
    const scaleAlong = 1 + l * 0.18 + st;
    const scaleCross = 1 + l * 0.18 - st * 0.45;
    if (vertical()) {
      drop.style.width = `${s.cross}px`;
      drop.style.height = `${along}px`;
      drop.style.transform = `translate(${s.off}px, ${pos.value - along / 2}px) scale(${scaleCross}, ${scaleAlong})`;
    } else {
      drop.style.width = `${along}px`;
      drop.style.height = `${s.cross}px`;
      drop.style.transform = `translate(${pos.value - along / 2}px, ${s.off}px) scale(${scaleAlong}, ${scaleCross})`;
    }
    drop.style.setProperty('--lift', l.toFixed(3));
    if (drop.refractionScale !== undefined) drop.refractionScale = 1 + l * 0.9;
    // Magnify the tab under the droplet.
    items.forEach((it, i) => {
      const c = slot(i).c;
      const d = Math.abs(c - pos.value) / slot(i).size;
      it.style.setProperty('--near', Math.max(0, 1 - d).toFixed(3));
    });
    nudgeLight();
  };
  const loop = springLoop([pos, lift, stretch], apply);

  const select = (i: number, velocity = 0, emit = true) => {
    const changed = i !== active;
    active = i;
    items.forEach((it, j) => (j === i ? it.setAttribute('aria-current', 'page') : it.removeAttribute('aria-current')));
    if (reduced) pos.set(slot(i).c);
    else pos.to(slot(i).c, { velocity });
    loop.kick();
    if (emit && changed) nav.dispatchEvent(new CustomEvent('tabchange', { detail: { index: i, item: items[i] } }));
  };

  // Initial placement without animation.
  requestAnimationFrame(() => {
    pos.set(slot(active).c);
    apply();
    nav.dataset.ready = '';
  });
  new ResizeObserver(() => {
    pos.set(slot(active).c);
    apply();
  }).observe(bar);

  // Gesture -----------------------------------------------------------
  let dragging = false;
  let moved = false;
  let startP = 0;
  let grabOffset = 0;
  let hist: { p: number; t: number }[] = [];
  const coord = (e: PointerEvent) => {
    const b = bar.getBoundingClientRect();
    return vertical() ? e.clientY - b.top : e.clientX - b.left;
  };
  const bounds = () => [slot(0).c, slot(items.length - 1).c] as const;

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    const p = coord(e);
    startP = p;
    // Respect where the droplet was grabbed if pressing on it; otherwise jump to the finger.
    const onDrop = Math.abs(p - pos.value) < slot(active).size / 2;
    grabOffset = onDrop ? pos.value - p : 0;
    hist = [{ p, t: e.timeStamp }];
    bar.setPointerCapture(e.pointerId);
    lift.to(reduced ? 0 : 1);
    if (!onDrop) pos.to(p, { response: 0.28, damping: 0.85 });
    loop.kick();
  });

  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = coord(e);
    if (!moved && Math.abs(p - startP) < 6) return;
    moved = true;
    hist.push({ p, t: e.timeStamp });
    if (hist.length > 6) hist.shift();
    const [lo, hi] = bounds();
    let x = p + grabOffset;
    const span = hi - lo;
    if (x < lo) x = lo - rubberband(lo - x, span);
    if (x > hi) x = hi + rubberband(x - hi, span);
    const prev = pos.value;
    pos.set(x);
    const v = velocityOf(hist);
    stretch.to(0, { velocity: 0 });
    stretch.value = v;
    if (Math.abs(x - prev) > 0) loop.kick();
  });

  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    lift.to(0);
    const v = moved ? velocityOf(hist) : 0;
    const projected = moved ? pos.value + project(v, 0.99) : coord(e);
    let best = 0;
    let bestD = Infinity;
    items.forEach((_, i) => {
      const d = Math.abs(slot(i).c - projected);
      if (d < bestD) (bestD = d), (best = i);
    });
    pos.response = 0.38;
    pos.damping = moved ? 0.78 : 0.86;
    select(best, v);
    const href = items[best].getAttribute('href');
    if (href?.startsWith('#')) {
      const target = document.querySelector(href);
      target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', href);
    }
  };
  bar.addEventListener('pointerup', release);
  bar.addEventListener('pointercancel', release);

  // Links are driven by the gesture; keyboard still works through click.
  items.forEach((it, i) =>
    it.addEventListener('click', (e) => {
      if ((e as PointerEvent).detail !== 0) e.preventDefault(); // pointer click handled above
      else select(i);
    }),
  );

  // Scroll spy ---------------------------------------------------------
  if (nav.dataset.spy !== 'off') {
    const targets = items
      .map((it) => it.getAttribute('href'))
      .map((h) => (h?.startsWith('#') ? document.querySelector<HTMLElement>(h) : null));
    const io = new IntersectionObserver(
      (entries) => {
        if (dragging) return;
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const i = targets.indexOf(en.target as HTMLElement);
          if (i >= 0 && i !== active) select(i, 0);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    targets.forEach((t) => t && io.observe(t));
  }

  // Programmatic selection from page scripts that don't hold the API object.
  nav.addEventListener('ltb:select', (e) => select((e as CustomEvent<number>).detail, 0, false));

  return { select: (i: number) => select(i) };
}

function velocityOf(h: { p: number; t: number }[]) {
  if (h.length < 2) return 0;
  const a = h[0];
  const b = h[h.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? (b.p - a.p) / dt : 0;
}
