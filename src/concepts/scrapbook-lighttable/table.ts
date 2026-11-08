/**
 * The light table: a camera over a graphite work surface.
 *
 *  - Drag empty surface → pan 1:1, rubber-band past the edges, release projects
 *    momentum and settles on a critically damped spring.
 *  - Drag an object → lifts on press, follows the finger, tilts with velocity,
 *    thrown objects travel to their projected rest point with a little wobble.
 *    Objects dropped on the lit panel switch to "on-light" (no cast shadow,
 *    paper glows); objects dropped on the graphite cast a shadow again.
 *  - Tabs fly the camera between regions (with a small zoom-out breath).
 *  - The loupe holds a live, magnified clone of the table under a liquid-glass
 *    lens, so it really magnifies (in every browser) and the glass bends the
 *    magnified image at the rim.
 *  - Mobile: the same objects re-flow into one long column (measured, not
 *    hand-placed), the panel stretches to hold the lit ones.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass/spring';
import { nudgeLight } from '@/lib/glass/light';

type Region = 'about' | 'work' | 'projects' | 'photos' | 'notes';
const ORDER: Region[] = ['about', 'work', 'projects', 'photos', 'notes'];
const DESKTOP = {
  W: 3900,
  H: 2620,
  panel: { x: 596, y: 256, w: 2088, h: 1638, bezel: 44 },
  regions: {
    about: [1080, 760],
    work: [1496, 2196],
    projects: [1290, 1510],
    photos: [2290, 900],
    notes: [3110, 760],
  } as Record<Region, [number, number]>,
};
const MAG = 2.3;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type Sample = { x: number; y: number; t: number };
const velocity = (h: Sample[]) => {
  if (h.length < 2) return { x: 0, y: 0 };
  const a = h[0];
  const b = h[h.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0 || performance.now() - b.t > 80) return { x: 0, y: 0 };
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
};
const pushSample = (h: Sample[], e: PointerEvent) => {
  h.push({ x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() });
  while (h.length > 2 && h[h.length - 1].t - h[0].t > 90) h.shift();
};

export function initTable() {
  const vp = document.querySelector<HTMLElement>('.lt-viewport')!;
  const desk = vp.querySelector<HTMLElement>('.lt-desk')!;
  const panel = desk.querySelector<HTMLElement>('.lt-panel')!;
  const hint = document.querySelector<HTMLElement>('.lt-hint');
  const reduced = prefersReducedMotion();
  const isMobile = () => innerWidth < 700;

  // World ---------------------------------------------------------------
  let W = DESKTOP.W;
  let H = DESKTOP.H;
  let panelRect = { ...DESKTOP.panel };
  let regions: Record<Region, [number, number]> = { ...DESKTOP.regions };

  const items = [...desk.querySelectorAll<HTMLElement>('.lt-item')];
  const mirrors = new Map<HTMLElement, () => void>();

  // Camera ----------------------------------------------------------------
  let zoom = 1;
  const computeZoom = () =>
    isMobile() ? innerWidth / 540 : clamp(Math.min(innerWidth / 1660, innerHeight / 1030), 0.55, 1.1);
  const breath = new Spring(1, { response: 0.5, damping: 1 });
  const cx = new Spring(0, { response: 0.6, damping: 1 });
  const cy = new Spring(0, { response: 0.6, damping: 1 });

  const limits = () => {
    const hw = innerWidth / 2 / zoom;
    const hh = innerHeight / 2 / zoom;
    const pad = 40;
    const lo = (half: number, size: number) => (size + pad * 2 > half * 2 ? half - pad : size / 2);
    const hi = (half: number, size: number) => (size + pad * 2 > half * 2 ? size - half + pad : size / 2);
    return { x0: lo(hw, W), x1: hi(hw, W), y0: lo(hh, H), y1: hi(hh, H) + 70 / zoom };
  };
  const clampCam = (x: number, y: number) => {
    const l = limits();
    return [clamp(x, l.x0, l.x1), clamp(y, l.y0, l.y1)] as const;
  };

  let onCamera: () => void = () => {};
  const camState = () => {
    const z = zoom * breath.value;
    return { z, tx: innerWidth / 2 - cx.value * z, ty: innerHeight / 2 - cy.value * z };
  };
  const applyCam = () => {
    const { z, tx, ty } = camState();
    desk.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
    onCamera();
  };
  const camLoop = springLoop([cx, cy, breath], applyCam);

  const dismissHint = () => hint?.classList.add('gone');

  const fly = (r: Region) => {
    dismissHint();
    const [tx, ty] = clampCam(...regions[r]);
    if (reduced) {
      cx.set(tx);
      cy.set(ty);
      applyCam();
      return;
    }
    const dist = Math.hypot(tx - cx.value, ty - cy.value);
    cx.to(tx, { response: 0.75, damping: 1 });
    cy.to(ty, { response: 0.75, damping: 1 });
    if (dist > 500) {
      breath.to(0.9, { response: 0.38, damping: 1 });
      setTimeout(() => breath.to(1, { response: 0.65, damping: 1 }), 280);
    }
    camLoop.kick();
  };

  const nearestRegion = (x: number, y: number) => {
    let best: Region = 'about';
    let bd = Infinity;
    for (const r of ORDER) {
      const [rx, ry] = regions[r];
      const d = Math.hypot(rx - x, ry - y);
      if (d < bd) (bd = d), (best = r);
    }
    return best;
  };

  // Tab bar ---------------------------------------------------------------
  const nav = document.querySelector<HTMLElement>('.ltb');
  const tabItems = nav ? [...nav.querySelectorAll<HTMLElement>('.ltb-item')] : [];
  const currentTab = () => Math.max(0, tabItems.findIndex((t) => t.getAttribute('aria-current') === 'page'));
  if (nav) {
    nav.addEventListener('pointerup', () => fly(ORDER[currentTab()]));
    tabItems.forEach((t, i) =>
      t.addEventListener('click', (e) => {
        e.preventDefault();
        if ((e as MouseEvent).detail === 0) fly(ORDER[i]);
      }),
    );
  }
  const syncTab = (x: number, y: number) => {
    if (!nav) return;
    const i = ORDER.indexOf(nearestRegion(x, y));
    if (i !== currentTab()) nav.dispatchEvent(new CustomEvent('ltb:select', { detail: i }));
  };

  // Mobile flow layout -------------------------------------------------------
  const flowMobile = () => {
    const colW = 460;
    const WM = 620;
    const gap = 30;
    const groups = new Map<number, HTMLElement[]>();
    for (const el of items) {
      const k = parseFloat(el.dataset.m || '999');
      groups.set(k, [...(groups.get(k) ?? []), el]);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    let y = 150;
    let panelTop = 0;
    let panelBottom = 0;
    let inPanel = false;
    const bezel = 30;
    for (const k of keys) {
      const row = groups.get(k)!;
      const lit = k < 40; // the first stretch of the column sits on the panel
      if (lit && !inPanel) {
        inPanel = true;
        panelTop = y - 40;
      }
      if (!lit && inPanel) {
        inPanel = false;
        panelBottom = y - gap + 40;
        y += 150;
      }
      const widths = row.map((el) => el.offsetWidth);
      const total = widths.reduce((a, b) => a + b, 0) + (row.length - 1) * 20;
      let x = (WM - Math.min(total, colW)) / 2;
      let rowH = 0;
      row.forEach((el, i) => {
        const jitter = row.length === 1 ? ((k * 37) % 3) * 8 - 8 : 0;
        el.style.left = `${Math.round(x + jitter)}px`;
        el.style.top = `${Math.round(y)}px`;
        x += widths[i] + 20;
        rowH = Math.max(rowH, el.offsetHeight);
      });
      y += rowH + gap;
    }
    if (inPanel) panelBottom = y - gap + 40;
    W = WM;
    H = y + 120;
    const px = (WM - colW) / 2 - 30;
    panelRect = { x: px - bezel, y: panelTop - bezel, w: colW + 60 + bezel * 2, h: panelBottom - panelTop + bezel * 2, bezel };
    const top = (sel: string) => {
      const el = desk.querySelector<HTMLElement>(sel);
      return el ? el.offsetTop : 0;
    };
    const hh = innerHeight / 2 / zoom;
    const at = (sel: string): [number, number] => [WM / 2, top(sel) - 110 / zoom + hh];
    regions = {
      about: [WM / 2, 0],
      work: at('[data-region="work"]'),
      projects: at('[data-region="projects"]'),
      photos: at('[data-region="photos"]'),
      notes: at('[data-region="notes"]'),
    };
  };

  const applyWorld = () => {
    desk.style.width = `${W}px`;
    desk.style.height = `${H}px`;
    Object.assign(panel.style, {
      left: `${panelRect.x}px`,
      top: `${panelRect.y}px`,
      width: `${panelRect.w}px`,
      height: `${panelRect.h}px`,
    });
    panel.style.setProperty('--bezel', `${panelRect.bezel}px`);
  };

  const layoutWorld = () => {
    if (isMobile()) {
      flowMobile();
    } else {
      for (const el of items) {
        el.style.left = '';
        el.style.top = '';
      }
      W = DESKTOP.W;
      H = DESKTOP.H;
      panelRect = { ...DESKTOP.panel };
      regions = { ...DESKTOP.regions };
    }
    applyWorld();
  };

  let wasMobile = isMobile();
  const layout = (initial = false) => {
    zoom = computeZoom();
    layoutWorld();
    if (initial) {
      const hash = location.hash.replace('#to-', '') as Region;
      const start = ORDER.includes(hash) ? hash : 'about';
      const [x, y] = clampCam(...regions[start]);
      cx.set(x);
      cy.set(y);
      if (start !== 'about') nav?.dispatchEvent(new CustomEvent('ltb:select', { detail: ORDER.indexOf(start) }));
    } else {
      const flipped = wasMobile !== isMobile();
      const [x, y] = flipped ? clampCam(...regions[ORDER[currentTab()]]) : clampCam(cx.value, cy.value);
      cx.set(x);
      cy.set(y);
    }
    wasMobile = isMobile();
    applyCam();
  };

  // Pan ---------------------------------------------------------------------
  let pan: { id: number; sx: number; sy: number; cx: number; cy: number; hist: Sample[] } | null = null;
  const softClamp = (v: number, lo: number, hi: number, span: number) =>
    v < lo ? lo - rubberband(lo - v, span) : v > hi ? hi + rubberband(v - hi, span) : v;

  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('.lt-item, a, button')) return;
    camLoop.stop();
    breath.set(1);
    pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: cx.value, cy: cy.value, hist: [] };
    pushSample(pan.hist, e);
    vp.setPointerCapture(e.pointerId);
    vp.classList.add('panning');
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pushSample(pan.hist, e);
    if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 4) dismissHint();
    const l = limits();
    cx.set(softClamp(pan.cx - (e.clientX - pan.sx) / zoom, l.x0, l.x1, innerWidth / zoom));
    cy.set(softClamp(pan.cy - (e.clientY - pan.sy) / zoom, l.y0, l.y1, innerHeight / zoom));
    applyCam();
  });
  const endPan = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id) return;
    const v = velocity(pan.hist);
    pan = null;
    vp.classList.remove('panning');
    const vx = -v.x / zoom;
    const vy = -v.y / zoom;
    const [tx, ty] = clampCam(cx.value + project(vx, 0.996), cy.value + project(vy, 0.996));
    if (reduced) {
      cx.set(tx);
      cy.set(ty);
      applyCam();
    } else {
      cx.to(tx, { velocity: vx, response: 0.7, damping: 1 });
      cy.to(ty, { velocity: vy, response: 0.7, damping: 1 });
      camLoop.kick();
    }
    syncTab(tx, ty);
  };
  vp.addEventListener('pointerup', endPan);
  vp.addEventListener('pointercancel', endPan);

  let wheelSync = 0;
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dismissHint();
      camLoop.stop();
      breath.set(1);
      if (e.ctrlKey) {
        const before = zoom;
        const base = computeZoom();
        zoom = clamp(zoom * Math.exp(-e.deltaY * 0.01), base * 0.55, base * 1.8);
        const px = e.clientX - innerWidth / 2;
        const py = e.clientY - innerHeight / 2;
        cx.set(cx.value + px / before - px / zoom);
        cy.set(cy.value + py / before - py / zoom);
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        cx.set(cx.value + (e.deltaX * k) / zoom);
        cy.set(cy.value + (e.deltaY * k) / zoom);
      }
      const [x, y] = clampCam(cx.value, cy.value);
      cx.set(x);
      cy.set(y);
      applyCam();
      clearTimeout(wheelSync);
      wheelSync = window.setTimeout(() => syncTab(cx.value, cy.value), 140);
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    const step = 220 / zoom;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || (e.target as Element)?.closest?.('input, textarea')) return;
    e.preventDefault();
    const [tx, ty] = clampCam(cx.target + d[0], cy.target + d[1]);
    cx.to(tx, { response: 0.45, damping: 1 });
    cy.to(ty, { response: 0.45, damping: 1 });
    camLoop.kick();
    syncTab(tx, ty);
  });

  // Objects -----------------------------------------------------------------
  let zTop = 10;
  items.forEach((el, i) => {
    el.style.zIndex = String(10 + i);
    zTop = Math.max(zTop, 10 + i);
    makeThrowable(el);
  });

  const insidePanel = (x: number, y: number) => {
    const b = panelRect.bezel;
    return x > panelRect.x + b && x < panelRect.x + panelRect.w - b && y > panelRect.y + b && y < panelRect.y + panelRect.h - b;
  };

  function makeThrowable(el: HTMLElement) {
    const baseR = parseFloat(el.dataset.r || '0');
    const x = new Spring(0, { response: 0.5, damping: 0.82 });
    const y = new Spring(0, { response: 0.5, damping: 0.82 });
    const r = new Spring(baseR, { response: 0.5, damping: 0.5 });
    const lift = new Spring(0, { response: 0.22, damping: 0.85 });

    const apply = () => {
      el.style.transform = `translate(${x.value}px, ${y.value}px) rotate(${r.value}deg) scale(${1 + lift.value * 0.04})`;
      el.style.setProperty('--lift', lift.value.toFixed(3));
      mirrors.get(el)?.();
    };
    const loop = springLoop([x, y, r, lift], apply);

    let g: { id: number; sx: number; sy: number; ox: number; oy: number; hist: Sample[]; dragging: boolean } | null = null;
    let suppressClick = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as Element).closest('button')) return;
      e.stopPropagation();
      el.style.zIndex = String(++zTop);
      g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: x.value, oy: y.value, hist: [], dragging: false };
      pushSample(g.hist, e);
      lift.to(reduced ? 0 : 1);
      loop.kick();
    });
    el.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      pushSample(g.hist, e);
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.dragging) {
        if (Math.hypot(dx, dy) < 5) return;
        g.dragging = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        dismissHint();
      }
      x.set(g.ox + dx / zoom);
      y.set(g.oy + dy / zoom);
      const v = velocity(g.hist);
      r.to(baseR + clamp(v.x * 0.004, -8, 8), { response: 0.25, damping: 1 });
      loop.kick();
    });
    const end = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const wasDragging = g.dragging;
      const v = velocity(g.hist);
      g = null;
      el.classList.remove('dragging');
      lift.to(0, { response: 0.35, damping: 0.8 });
      if (wasDragging) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        const vx = v.x / zoom;
        const vy = v.y / zoom;
        const left = el.offsetLeft;
        const top = el.offsetTop;
        const tx = clamp(x.value + project(vx, 0.992), -left - el.offsetWidth * 0.4, W - left - el.offsetWidth * 0.6);
        const ty = clamp(y.value + project(vy, 0.992), -top - el.offsetHeight * 0.4, H - top - el.offsetHeight * 0.6);
        const thrown = Math.hypot(vx, vy) > 300;
        x.to(tx, { velocity: vx, response: 0.55, damping: thrown ? 0.78 : 1 });
        y.to(ty, { velocity: vy, response: 0.55, damping: thrown ? 0.78 : 1 });
        r.to(baseR, { response: 0.6, damping: thrown ? 0.34 : 0.7, velocity: clamp(-vx * 0.03, -160, 160) });
        // Where it lands decides how it's lit.
        const lit = insidePanel(left + tx + el.offsetWidth / 2, top + ty + el.offsetHeight / 2);
        el.classList.toggle('on-light', lit);
      }
      loop.kick();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'click',
      (e) => {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }

  // Light switch + meter ------------------------------------------------------
  const sw = desk.querySelector<HTMLButtonElement>('.lt-switch');
  sw?.addEventListener('click', () => {
    const on = sw.getAttribute('aria-pressed') !== 'true';
    sw.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('lt-off', !on);
    if (on && !reduced) {
      document.body.classList.add('lt-flicker');
      setTimeout(() => document.body.classList.remove('lt-flicker'), 520);
    }
    mirrorAll();
  });
  const meter = desk.querySelector<HTMLElement>('.meter');
  meter?.querySelector('[data-meas]')?.addEventListener('click', () => {
    meter.classList.remove('measuring');
    void meter.offsetWidth;
    meter.classList.add('measuring');
    setTimeout(() => meter.classList.remove('measuring'), 900);
  });

  // Loupe -----------------------------------------------------------------------
  const loupe = document.querySelector<HTMLElement>('.lt-loupe');
  const view = loupe?.querySelector<HTMLElement>('.lp-view');
  const lens = loupe?.querySelector<HTMLElement>('.lp-lens');
  let clone: HTMLElement | null = null;
  let mirrorAll = () => {};

  const buildClone = () => {
    if (!view) return;
    clone = desk.cloneNode(true) as HTMLElement;
    clone.classList.add('is-clone');
    clone.setAttribute('aria-hidden', 'true');
    clone.inert = true;
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
    view.replaceChildren(clone);
    const cloneItems = [...clone.querySelectorAll<HTMLElement>('.lt-item')];
    mirrors.clear();
    items.forEach((el, i) => {
      const c = cloneItems[i];
      if (!c) return;
      mirrors.set(el, () => {
        c.style.transform = el.style.transform;
        c.style.zIndex = el.style.zIndex;
        c.style.setProperty('--lift', el.style.getPropertyValue('--lift'));
        c.className = el.className;
      });
    });
    mirrorAll = () => mirrors.forEach((m) => m());
    mirrorAll();
  };

  if (loupe && view && lens) {
    const lx = new Spring(0, { response: 0.4, damping: 0.8 });
    const ly = new Spring(0, { response: 0.4, damping: 0.8 });
    const lift = new Spring(0, { response: 0.25, damping: 0.8 });
    const size = () => loupe.offsetWidth;

    const syncView = () => {
      if (!clone) return;
      const s = lens.offsetWidth;
      const { z, tx, ty } = camState();
      const ox = s / 2 + MAG * (tx - lx.value);
      const oy = s / 2 + MAG * (ty - ly.value);
      clone.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${MAG * z})`;
    };
    const apply = () => {
      const s = size();
      loupe.style.transform = `translate(${lx.value - s / 2}px, ${ly.value - s / 2}px) scale(${1 + lift.value * 0.06})`;
      loupe.style.setProperty('--lift', lift.value.toFixed(3));
      syncView();
      nudgeLight();
    };
    onCamera = syncView;
    const loop = springLoop([lx, ly, lift], apply);
    const keepIn = (px: number, py: number) => {
      const s = size();
      return [clamp(px, s * 0.3, innerWidth - s * 0.3), clamp(py, s * 0.3, innerHeight - s * 0.3)] as const;
    };

    let touched = false;
    const park = () => {
      if (touched) return;
      // Rest the lens on the hero transparency, half over the edge print.
      const hero = desk.querySelector<HTMLElement>('.tranny-67 .rebate');
      let px = innerWidth * 0.62;
      let py = innerHeight * 0.62;
      if (hero) {
        const b = hero.getBoundingClientRect();
        if (b.width) {
          px = b.left + b.width * (isMobile() ? 0.62 : 0.7);
          py = b.top + b.height * (isMobile() ? 0.62 : 0.34);
        }
      }
      const [x, y] = keepIn(px, py);
      lx.set(x);
      ly.set(y);
      apply();
      loupe.dataset.placed = '';
    };

    let g: { id: number; ox: number; oy: number; hist: Sample[] } | null = null;
    loupe.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      touched = true;
      g = { id: e.pointerId, ox: lx.value - e.clientX, oy: ly.value - e.clientY, hist: [] };
      pushSample(g.hist, e);
      loupe.setPointerCapture(e.pointerId);
      loupe.classList.add('dragging');
      lift.to(reduced ? 0 : 1);
      dismissHint();
      loop.kick();
    });
    loupe.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      pushSample(g.hist, e);
      lx.set(e.clientX + g.ox);
      ly.set(e.clientY + g.oy);
      loop.kick();
    });
    const end = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const v = velocity(g.hist);
      g = null;
      loupe.classList.remove('dragging');
      lift.to(0);
      const [tx, ty] = keepIn(lx.value + project(v.x, 0.99), ly.value + project(v.y, 0.99));
      const thrown = Math.hypot(v.x, v.y) > 300;
      if (reduced) {
        lx.set(tx);
        ly.set(ty);
      } else {
        lx.to(tx, { velocity: v.x, damping: thrown ? 0.75 : 1 });
        ly.to(ty, { velocity: v.y, damping: thrown ? 0.75 : 1 });
      }
      loop.kick();
    };
    loupe.addEventListener('pointerup', end);
    loupe.addEventListener('pointercancel', end);

    // Keyboard: the loupe is focusable; arrows nudge it.
    loupe.tabIndex = 0;
    loupe.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const [tx, ty] = keepIn(lx.target + d[0], ly.target + d[1]);
      lx.to(tx);
      ly.to(ty);
      loop.kick();
    });

    layout(true);
    buildClone();
    syncView();
    park();
    // Re-park once webfonts settle the cover's layout (unless it's been picked up).
    (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(park, 60));
    let resizeT = 0;
    addEventListener('resize', () => {
      layout();
      clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        buildClone();
        const [x, y] = keepIn(lx.value, ly.value);
        lx.set(x);
        ly.set(y);
        apply();
      }, 120);
    });
  } else {
    layout(true);
    addEventListener('resize', () => layout());
  }
}
