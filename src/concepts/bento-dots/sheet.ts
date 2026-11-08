/**
 * Detail sheets — adapted from Widgets · System. The sheet grows out of the
 * tapped card on springs (position + size), cross-fading from a snapshot of
 * the card to the full content. Drag down (or flick) to dismiss, Esc or the
 * scrim to close; it shrinks back into the card it came from.
 */
import { Spring, springLoop, project, rubberband } from '@/lib/glass';

type Rect = { x: number; y: number; w: number; h: number };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

export type Sheets = { open: (from: HTMLElement, name: string) => void };

export function sheets(reduced: boolean, onContent: (name: string, root: HTMLElement) => void): Sheets | null {
  const sheet = $('.sh');
  const scrim = $('.sh-scrim');
  if (!sheet || !scrim) return null;
  const mini = $('.sh-mini', sheet)!;
  const full = $('.sh-full', sheet)!;
  const scroller = $('.sh-scroll', sheet)!;
  const grab = $('.sh-grab', sheet)!;
  const closeBtn = $('.sh-close', sheet)!;

  const openCfg = { response: 0.5, damping: 0.86 };
  const x = new Spring(0, openCfg);
  const y = new Spring(0, openCfg);
  const w = new Spring(0, openCfg);
  const h = new Spring(0, openCfg);
  const p = new Spring(0, { response: 0.42, damping: 1 });
  let origin: HTMLElement | null = null;
  let from: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let state: 'closed' | 'open' | 'closing' = 'closed';
  let dragY = 0;
  let contentH = 0;

  const mobile = () => innerWidth < 681;
  const sheetWidth = () => (mobile() ? innerWidth : Math.min(640, innerWidth - 64));
  const measure = (width: number) => {
    full.style.width = `${width}px`;
    full.style.height = 'auto';
    scroller.style.flex = 'none';
    contentH = full.scrollHeight;
    full.style.height = '';
    scroller.style.flex = '';
  };
  const targetRect = (): Rect => {
    const vw = innerWidth;
    const vh = innerHeight;
    if (mobile()) {
      const hh = Math.min(vh - 48, Math.max(320, contentH + 8));
      return { x: 0, y: vh - hh, w: vw, h: hh };
    }
    const ww = sheetWidth();
    const hh = Math.min(vh - 96, 780, Math.max(320, contentH + 4));
    return { x: (vw - ww) / 2, y: Math.max(48, (vh - hh) / 2), w: ww, h: hh };
  };
  const rectOf = (el: HTMLElement): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const apply = () => {
    const pv = clamp(p.value, 0, 1);
    sheet.style.left = `${x.value}px`;
    sheet.style.top = `${y.value + dragY}px`;
    sheet.style.width = `${Math.max(1, w.value)}px`;
    sheet.style.height = `${Math.max(1, h.value)}px`;
    mini.style.opacity = String(clamp(1 - pv / 0.35, 0, 1));
    mini.style.transform = `scale(${Math.min(w.value / from.w, h.value / from.h)})`;
    full.style.opacity = String(clamp((pv - 0.28) / 0.5, 0, 1));
    full.style.transform = `translateY(${(1 - pv) * 20}px)`;
    scrim.style.opacity = String(pv * (1 - clamp(dragY / 600, 0, 0.8)));
  };
  const loop = springLoop([x, y, w, h, p], () => {
    apply();
    if (state === 'closing' && p.value < 0.002 && Math.abs(w.value - from.w) < 0.5 && Math.abs(h.value - from.h) < 0.5) finishClose();
  });

  const finishClose = () => {
    state = 'closed';
    sheet.hidden = true;
    scrim.hidden = true;
    origin?.removeAttribute('data-hidden');
    origin?.focus({ preventScroll: true });
    origin = null;
    document.documentElement.style.overflow = '';
  };

  const openFrom = (el: HTMLElement, name = el.dataset.sheet) => {
    const tpl = $<HTMLTemplateElement>(`template[data-sheet-for="${name}"]`);
    if (!tpl || !name) return;
    if (state === 'closing' && origin === el) {
      state = 'open';
      const t = targetRect();
      x.to(t.x, openCfg);
      y.to(t.y, openCfg);
      w.to(t.w, openCfg);
      h.to(t.h, openCfg);
      p.to(1);
      loop.kick();
      return;
    }
    if (state !== 'closed') finishClose();
    origin = el;
    from = rectOf(el);
    sheet.style.borderRadius = '';
    mini.innerHTML = '';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.removeAttribute('data-sheet');
    clone.removeAttribute('data-hidden');
    clone.querySelectorAll('input, [id]').forEach((n) => (n.tagName === 'INPUT' ? n.remove() : n.removeAttribute('id')));
    clone.style.cssText = `width:${from.w}px;height:${from.h}px;`;
    mini.style.width = `${from.w}px`;
    mini.style.height = `${from.h}px`;
    mini.style.transformOrigin = '0 0';
    mini.append(clone);
    scroller.innerHTML = '';
    scroller.append(tpl.content.cloneNode(true));
    onContent(name, scroller);
    scroller.scrollTop = 0;
    sheet.hidden = false;
    sheet.style.visibility = 'hidden';
    measure(sheetWidth());
    sheet.style.visibility = '';
    const t = targetRect();
    full.style.width = `${t.w}px`;
    for (const s of [x, y, w, h]) Object.assign(s, openCfg);
    x.set(from.x);
    y.set(from.y);
    w.set(from.w);
    h.set(from.h);
    p.set(0);
    dragY = 0;
    scrim.hidden = false;
    el.setAttribute('data-hidden', '');
    document.documentElement.style.overflow = 'hidden';
    state = 'open';
    apply();
    if (reduced) {
      x.set(t.x);
      y.set(t.y);
      w.set(t.w);
      h.set(t.h);
      p.set(1);
      apply();
    } else {
      x.to(t.x);
      y.to(t.y);
      w.to(t.w);
      h.to(t.h);
      p.to(1);
      loop.kick();
    }
    sheet.setAttribute('aria-label', el.getAttribute('aria-label') ?? 'Details');
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 60);
  };

  const close = (velocity = 0) => {
    if (state !== 'open' || !origin) return;
    state = 'closing';
    from = rectOf(origin);
    const cfg = { response: 0.42, damping: 0.92 };
    y.value += dragY;
    dragY = 0;
    x.to(from.x, cfg);
    y.to(from.y, { ...cfg, velocity });
    w.to(from.w, cfg);
    h.to(from.h, cfg);
    p.to(0);
    if (reduced) {
      finishClose();
      return;
    }
    loop.kick();
  };

  for (const el of $$('[data-sheet]')) {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, button, .cm-chart, .wl-slot:not([data-front])')) return;
      openFrom(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFrom(el);
      }
    });
  }
  scrim.addEventListener('click', () => close());
  closeBtn.addEventListener('click', () => close());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Drag to dismiss (the grabber on phones; the content when it's scrolled to the top).
  let dragging = false;
  let startY = 0;
  let hist: { y: number; t: number }[] = [];
  const begin = (e: PointerEvent) => {
    if (state !== 'open') return;
    if ((e.target as HTMLElement).closest('a, button, summary, input')) return;
    if (e.currentTarget === scroller && (scroller.scrollTop > 0 || e.pointerType !== 'mouse')) return;
    dragging = true;
    startY = e.clientY - dragY;
    hist = [{ y: e.clientY, t: e.timeStamp }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    dragY = dy >= 0 ? dy : -rubberband(-dy, 400);
    hist.push({ y: e.clientY, t: e.timeStamp });
    if (hist.length > 6) hist.shift();
    apply();
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const a = hist[0];
    const b = hist[hist.length - 1];
    const dt = (b.t - a.t) / 1000;
    const v = dt > 0 ? (b.y - a.y) / dt : 0;
    if (dragY + project(v, 0.99) > h.value * 0.3 || v > 900) close(v);
    else {
      y.value += dragY;
      dragY = 0;
      y.to(targetRect().y, { velocity: v, response: 0.4, damping: 0.8 });
      loop.kick();
    }
  };
  for (const el of [grab, scroller]) {
    el.addEventListener('pointerdown', begin);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  addEventListener('resize', () => {
    if (state !== 'open') return;
    measure(sheetWidth());
    const t = targetRect();
    x.set(t.x);
    y.set(t.y);
    w.set(t.w);
    h.set(t.h);
    full.style.width = `${t.w}px`;
    apply();
  });

  return { open: (el, name) => openFrom(el, name) };
}
