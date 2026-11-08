/**
 * The desk: a camera over a 4400×2800 walnut world, lit by one lamp.
 *
 *  - Drag the desk → pan 1:1, rubber-band past the edges, momentum on release.
 *  - Drag an object → lifts (shadow grows and softens), follows the finger,
 *    tilts with velocity; throw it and it slides to its projected rest point.
 *  - Click an object → the camera leans in to frame it (click again, click the
 *    desk or press Esc to sit back).
 *  - The lamp follows the pointer with a little lag; every object's shadow is
 *    cast away from it, computed in the object's own rotated frame.
 *  - Tabs (and the letter's contents list) fly the camera between regions.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass/spring';
import { nudgeLight } from '@/lib/glass/light';
import type { LiquidGlass } from '@/lib/glass/liquid-glass';

const W = 4400;
const H = 2800;

type Region = 'about' | 'work' | 'projects' | 'photos' | 'notes';
const ORDER: Region[] = ['about', 'work', 'projects', 'photos', 'notes'];
const REGIONS: Record<Region, { d: [number, number]; m: [number, number] }> = {
  about: { d: [2205, 1455], m: [2195, 1518] },
  work: { d: [1090, 1420], m: [990, 1450] },
  projects: { d: [3625, 1470], m: [3215, 1500] },
  photos: { d: [2250, 545], m: [1705, 600] },
  notes: { d: [2225, 2350], m: [1690, 2330] },
};

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

type Obj = {
  el: HTMLElement;
  x: Spring;
  y: Spring;
  r: Spring;
  lift: Spring;
  // cached layout (world px, un-transformed)
  left: number;
  top: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
};

export function initDesk() {
  const vp = document.querySelector<HTMLElement>('.dk-viewport')!;
  const desk = vp.querySelector<HTMLElement>('.dk-desk')!;
  const lampEl = document.querySelector<HTMLElement>('.dk-lamp');
  const hint = document.querySelector<HTMLElement>('.dk-hint');
  const reduced = prefersReducedMotion();
  const isMobile = () => innerWidth < 640;
  const TAB_SPACE = () => (isMobile() ? 96 : 100);

  // Camera ------------------------------------------------------------
  const baseZoom = () =>
    isMobile() ? innerWidth / 470 : clamp(Math.min(innerWidth / 1530, innerHeight / 960), 0.55, 1.2);
  const zs = new Spring(baseZoom(), { response: 0.6, damping: 1 });
  const breath = new Spring(1, { response: 0.5, damping: 1 });
  const cx = new Spring(0, { response: 0.6, damping: 1 });
  const cy = new Spring(0, { response: 0.6, damping: 1 });
  const zoom = () => zs.value * breath.value;

  const limits = (z = zs.value) => {
    const hw = innerWidth / 2 / z;
    const hh = innerHeight / 2 / z;
    const pad = 30;
    const lo = (half: number, size: number) => (size + pad * 2 > half * 2 ? half - pad : size / 2);
    const hi = (half: number, size: number) => (size + pad * 2 > half * 2 ? size - half + pad : size / 2);
    return { x0: lo(hw, W), x1: hi(hw, W), y0: lo(hh, H), y1: hi(hh, H) + TAB_SPACE() / z };
  };
  const clampCam = (x: number, y: number, z = zs.value) => {
    const l = limits(z);
    return [clamp(x, l.x0, l.x1), clamp(y, l.y0, l.y1)] as const;
  };

  const applyCam = () => {
    const z = zoom();
    desk.style.transform = `translate3d(${innerWidth / 2 - cx.value * z}px, ${innerHeight / 2 - cy.value * z}px, 0) scale(${z})`;
    nudgeLight();
    queueShadows();
  };
  const camLoop = springLoop([cx, cy, zs, breath], applyCam);
  const regionCenter = (r: Region) => (isMobile() ? REGIONS[r].m : REGIONS[r].d);
  const dismissHint = () => hint?.classList.add('gone');

  const moveCam = (tx: number, ty: number, tz: number, opts: { breathe?: boolean; velocity?: [number, number] } = {}) => {
    const [x, y] = clampCam(tx, ty, tz);
    if (reduced) {
      zs.set(tz);
      cx.set(x);
      cy.set(y);
      applyCam();
      return;
    }
    const dist = Math.hypot(x - cx.value, y - cy.value);
    zs.to(tz, { response: 0.65, damping: 1 });
    cx.to(x, { response: 0.7, damping: 1, velocity: opts.velocity?.[0] });
    cy.to(y, { response: 0.7, damping: 1, velocity: opts.velocity?.[1] });
    // A short pull-back on long flights, like a camera rising off the desk.
    if (opts.breathe && dist > 600) {
      breath.to(0.88, { response: 0.35, damping: 1 });
      setTimeout(() => breath.to(1, { response: 0.6, damping: 1 }), 260);
    }
    camLoop.kick();
  };

  const fly = (r: Region) => {
    dismissHint();
    unfocus(false);
    moveCam(...regionCenter(r), baseZoom(), { breathe: true });
    syncTab(...regionCenter(r));
  };

  const nearestRegion = (x: number, y: number) => {
    let best: Region = 'about';
    let bd = Infinity;
    for (const r of ORDER) {
      const [rx, ry] = regionCenter(r);
      const d = Math.hypot(rx - x, ry - y);
      if (d < bd) (bd = d), (best = r);
    }
    return best;
  };

  // Tab bar -------------------------------------------------------------
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
  function syncTab(x: number, y: number) {
    if (!nav) return;
    const i = ORDER.indexOf(nearestRegion(x, y));
    if (i !== currentTab()) nav.dispatchEvent(new CustomEvent('ltb:select', { detail: i }));
  }
  desk.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => fly(b.dataset.go as Region)),
  );

  // Lamp + shadows ------------------------------------------------------
  // The lamp hangs above-left by default; with a mouse it follows the pointer
  // (lagging like a heavy arm), but only part-way so shadows never flip wildly.
  const lampHome = () => [innerWidth * 0.18, -innerHeight * 0.25] as const;
  const lx = new Spring(lampHome()[0], { response: 0.9, damping: 1 });
  const ly = new Spring(lampHome()[1], { response: 0.9, damping: 1 });
  const lampLoop = springLoop([lx, ly], () => {
    if (lampEl) {
      lampEl.style.setProperty('--lx', `${((lx.value / innerWidth) * 100).toFixed(2)}%`);
      lampEl.style.setProperty('--ly', `${((ly.value / innerHeight) * 100).toFixed(2)}%`);
    }
    queueShadows();
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const [hx, hy] = lampHome();
    const tx = hx + (e.clientX - hx) * 0.55;
    const ty = hy + (e.clientY - hy) * 0.45;
    if (reduced) {
      lx.set(tx);
      ly.set(ty);
    } else {
      lx.to(tx);
      ly.to(ty);
    }
    lampLoop.kick();
  });

  const objs: Obj[] = [];
  const mat = desk.querySelector<HTMLElement>('.dk-mat');
  let shadowRaf = 0;
  function queueShadows() {
    if (!shadowRaf) shadowRaf = requestAnimationFrame(updateShadows);
  }
  function shadowFor(wx: number, wy: number, rotDeg: number) {
    const z = zoom();
    const sx = innerWidth / 2 + (wx - cx.value) * z;
    const sy = innerHeight / 2 + (wy - cy.value) * z;
    const dx = sx - lx.value;
    const dy = sy - ly.value;
    const d = Math.hypot(dx, dy);
    // Shadow length grows with distance from the lamp, saturating (lamp height ~ 700px).
    const k = 1.25 / (d + 700);
    let vx = dx * k;
    let vy = dy * k;
    if (rotDeg) {
      const a = (-rotDeg * Math.PI) / 180;
      [vx, vy] = [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)];
    }
    return [vx, vy] as const;
  }
  function updateShadows() {
    shadowRaf = 0;
    const z = zoom();
    const viewL = cx.value - innerWidth / 2 / z - 400;
    const viewR = cx.value + innerWidth / 2 / z + 400;
    const viewT = cy.value - innerHeight / 2 / z - 400;
    const viewB = cy.value + innerHeight / 2 / z + 400;
    for (const o of objs) {
      const wx = o.left + o.w / 2 + o.x.value;
      const wy = o.top + o.h / 2 + o.y.value;
      if (wx < viewL || wx > viewR || wy < viewT || wy > viewB) continue;
      const [vx, vy] = shadowFor(wx, wy, o.r.value);
      if (Math.abs(vx - o.sx) < 0.004 && Math.abs(vy - o.sy) < 0.004) continue;
      o.sx = vx;
      o.sy = vy;
      o.el.style.setProperty('--sx', vx.toFixed(3));
      o.el.style.setProperty('--sy', vy.toFixed(3));
    }
    if (mat) {
      const [vx, vy] = shadowFor(mat.offsetLeft + mat.offsetWidth / 2, mat.offsetTop + mat.offsetHeight / 2, 0);
      mat.style.setProperty('--sx', vx.toFixed(3));
      mat.style.setProperty('--sy', vy.toFixed(3));
    }
  }

  // Focus: lean in to read ----------------------------------------------
  let focused: Obj | null = null;
  let beforeFocus: [number, number, number] | null = null;
  function focus(o: Obj) {
    dismissHint();
    if (!focused) beforeFocus = [cx.target, cy.target, zs.target];
    focused?.el.classList.remove('focused');
    focused = o;
    o.el.classList.add('focused');
    const top = 24;
    const bottom = TAB_SPACE() + 16;
    const side = isMobile() ? 14 : 48;
    const availW = innerWidth - side * 2;
    const availH = innerHeight - top - bottom;
    const base = baseZoom();
    // Rotation inflates the bounding box a touch.
    const a = (Math.abs(o.r.value) * Math.PI) / 180;
    const bw = o.w * Math.cos(a) + o.h * Math.sin(a);
    const bh = o.w * Math.sin(a) + o.h * Math.cos(a);
    const fitW = availW / bw;
    const fitH = availH / bh;
    // Prefer fitting the whole object; tall sheets fit to width and anchor at the top.
    let z = Math.min(fitW, fitH);
    let tall = false;
    if (z < base * 1.15 && fitW > fitH) {
      z = Math.min(fitW, base * 1.6);
      tall = true;
    }
    z = clamp(z, base * 0.8, base * 2.4);
    const wx = o.left + o.w / 2 + o.x.value;
    let wy = o.top + o.h / 2 + o.y.value;
    // Centre within the space above the tab bar.
    const offsetY = (bottom - top) / 2 / z;
    if (tall) wy = o.top + o.y.value - top / z + innerHeight / 2 / z - 10 / z;
    else wy += offsetY;
    moveCam(wx, wy, z);
  }
  function unfocus(animate = true) {
    if (!focused) return;
    focused.el.classList.remove('focused');
    focused = null;
    if (animate && beforeFocus) moveCam(beforeFocus[0], beforeFocus[1], baseZoom());
    beforeFocus = null;
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') unfocus();
  });

  // Layout -------------------------------------------------------------
  const measure = () => {
    for (const o of objs) {
      o.left = o.el.offsetLeft;
      o.top = o.el.offsetTop;
      o.w = o.el.offsetWidth;
      o.h = o.el.offsetHeight;
    }
  };
  let wasMobile = isMobile();
  const layout = (initial = false) => {
    measure();
    const z = baseZoom();
    if (initial) {
      const hash = location.hash.replace('#to-', '') as Region;
      const start = ORDER.includes(hash) ? hash : 'about';
      zs.set(z);
      const [x, y] = clampCam(...regionCenter(start), z);
      cx.set(x);
      cy.set(y);
      if (start !== 'about') nav?.dispatchEvent(new CustomEvent('ltb:select', { detail: ORDER.indexOf(start) }));
    } else {
      if (wasMobile !== isMobile()) {
        objs.forEach((o) => {
          const r = parseFloat(getComputedStyle(o.el).getPropertyValue('--rot')) || 0;
          o.r.set(r);
          o.el.dataset.r = String(r);
        });
        focused = null;
      }
      if (!focused) zs.set(z);
      const [x, y] = clampCam(cx.value, cy.value);
      cx.set(x);
      cy.set(y);
    }
    wasMobile = isMobile();
    lx.set(lampHome()[0]);
    ly.set(lampHome()[1]);
    applyCam();
    objs.forEach((o) => apply(o));
    updateShadows();
  };

  // Pan gesture --------------------------------------------------------
  let pan: { id: number; sx: number; sy: number; cx: number; cy: number; hist: Sample[]; moved: boolean } | null = null;
  const softClamp = (v: number, lo: number, hi: number, span: number) =>
    v < lo ? lo - rubberband(lo - v, span) : v > hi ? hi + rubberband(v - hi, span) : v;

  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('.dk-obj, a, button')) return;
    camLoop.stop();
    breath.set(1);
    zs.set(zs.value);
    pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: cx.value, cy: cy.value, hist: [], moved: false };
    pushSample(pan.hist, e);
    vp.setPointerCapture(e.pointerId);
    vp.classList.add('panning');
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pushSample(pan.hist, e);
    if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 4) {
      pan.moved = true;
      dismissHint();
    }
    const z = zoom();
    const l = limits();
    cx.set(softClamp(pan.cx - (e.clientX - pan.sx) / z, l.x0, l.x1, innerWidth / z));
    cy.set(softClamp(pan.cy - (e.clientY - pan.sy) / z, l.y0, l.y1, innerHeight / z));
    applyCam();
  });
  const endPan = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id) return;
    const v = velocity(pan.hist);
    const moved = pan.moved;
    pan = null;
    vp.classList.remove('panning');
    if (!moved && focused) {
      unfocus();
      return;
    }
    const z = zoom();
    const vx = -v.x / z;
    const vy = -v.y / z;
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
    if (!focused) syncTab(tx, ty);
  };
  vp.addEventListener('pointerup', endPan);
  vp.addEventListener('pointercancel', endPan);

  // Wheel / trackpad: two-finger pan, pinch (ctrl+wheel) zooms about the cursor.
  let wheelSync = 0;
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dismissHint();
      camLoop.stop();
      breath.set(1);
      const z0 = zs.value;
      if (e.ctrlKey) {
        const base = baseZoom();
        const z1 = clamp(z0 * Math.exp(-e.deltaY * 0.01), base * 0.5, base * 2.6);
        const px = e.clientX - innerWidth / 2;
        const py = e.clientY - innerHeight / 2;
        zs.set(z1);
        cx.set(cx.value + px / z0 - px / z1);
        cy.set(cy.value + py / z0 - py / z1);
      } else {
        zs.set(z0);
        const k = e.deltaMode === 1 ? 16 : 1;
        cx.set(cx.value + (e.deltaX * k) / z0);
        cy.set(cy.value + (e.deltaY * k) / z0);
      }
      const [x, y] = clampCam(cx.value, cy.value);
      cx.set(x);
      cy.set(y);
      applyCam();
      clearTimeout(wheelSync);
      wheelSync = window.setTimeout(() => !focused && syncTab(cx.value, cy.value), 140);
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    const step = 240 / zs.value;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || (e.target as Element)?.closest?.('input, textarea')) return;
    e.preventDefault();
    const [tx, ty] = clampCam(cx.target + d[0], cy.target + d[1]);
    cx.to(tx, { response: 0.45, damping: 1 });
    cy.to(ty, { response: 0.45, damping: 1 });
    camLoop.kick();
    syncTab(tx, ty);
  });

  // Objects --------------------------------------------------------------
  let zTop = 10;
  function apply(o: Obj) {
    const l = o.lift.value;
    o.el.style.transform = `translate(${o.x.value}px, ${o.y.value}px) rotate(${o.r.value}deg) scale(${1 + l * 0.035})`;
    o.el.style.setProperty('--lift', l.toFixed(3));
  }

  desk.querySelectorAll<HTMLElement>('.dk-obj').forEach((el, i) => {
    el.style.zIndex = String(10 + i);
    zTop = Math.max(zTop, 10 + i);
    const r0 = parseFloat(getComputedStyle(el).getPropertyValue('--rot')) || 0;
    const o: Obj = {
      el,
      x: new Spring(0, { response: 0.5, damping: 0.85 }),
      y: new Spring(0, { response: 0.5, damping: 0.85 }),
      r: new Spring(r0, { response: 0.5, damping: 0.6 }),
      lift: new Spring(0, { response: 0.24, damping: 0.86 }),
      left: 0,
      top: 0,
      w: 0,
      h: 0,
      sx: 9,
      sy: 9,
    };
    el.style.setProperty('--e', el.dataset.e ?? '2');
    objs.push(o);
    makeThrowable(o);
  });

  function makeThrowable(o: Obj) {
    const { el, x, y, r, lift } = o;
    const glass = el.tagName === 'LIQUID-GLASS' ? (el as unknown as LiquidGlass) : null;
    const loop = springLoop([x, y, r, lift], () => {
      apply(o);
      if (glass) {
        glass.refractionScale = 1 + lift.value * 0.4;
        nudgeLight();
      }
      queueShadows();
    });

    let g: { id: number; sx: number; sy: number; ox: number; oy: number; hist: Sample[]; dragging: boolean; base: number } | null = null;
    let suppressClick = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      el.style.zIndex = String(++zTop);
      g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: x.value, oy: y.value, hist: [], dragging: false, base: r.target };
      pushSample(g.hist, e);
      // Feedback on press: the object rises off the desk.
      if (!(e.target as Element).closest('a, button')) lift.to(reduced ? 0 : 0.55);
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
        lift.to(reduced ? 0 : 1);
        dismissHint();
      }
      const z = zoom();
      x.set(g.ox + dx / z);
      y.set(g.oy + dy / z);
      const v = velocity(g.hist);
      r.to(g.base + clamp(v.x * 0.003, -7, 7), { response: 0.25, damping: 1 });
      loop.kick();
    });
    const end = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const wasDragging = g.dragging;
      const base = g.base;
      const v = velocity(g.hist);
      const onControl = !!(e.target as Element).closest?.('a, button');
      g = null;
      el.classList.remove('dragging');
      lift.to(0, { response: 0.32, damping: 0.78 });
      if (wasDragging) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        const z = zoom();
        const vx = v.x / z;
        const vy = v.y / z;
        const tx = clamp(x.value + project(vx, 0.992), -o.left - o.w * 0.3, W - o.left - o.w * 0.7);
        const ty = clamp(y.value + project(vy, 0.992), -o.top - o.h * 0.3, H - o.top - o.h * 0.7);
        const thrown = Math.hypot(vx, vy) > 300;
        x.to(tx, { velocity: vx, response: 0.55, damping: thrown ? 0.8 : 1 });
        y.to(ty, { velocity: vy, response: 0.55, damping: thrown ? 0.8 : 1 });
        // A throw spins it a little; it comes to rest at a new, natural angle.
        const spin = thrown ? clamp(vx * 0.004, -10, 10) : 0;
        r.to(base + spin, { response: 0.6, damping: thrown ? 0.55 : 0.8, velocity: clamp(vx * 0.02, -120, 120) });
        if (focused === o) unfocus(false);
      } else if (e.type === 'pointerup' && !onControl && !glass) {
        // A click: lean in (or back out).
        if (focused === o) unfocus();
        else focus(o);
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

  // Go ------------------------------------------------------------------
  layout(true);
  addEventListener('resize', () => layout());
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    measure();
    updateShadows();
  });
  desk.querySelectorAll('img').forEach((img) => img.addEventListener('load', () => measure(), { once: true }));
}
