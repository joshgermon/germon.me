/**
 * The gallery wall: a camera that walks along one long wall.
 *
 *  - Drag anywhere → pan 1:1 (rubber-band past the ends); release projects
 *    momentum and settles on a critically damped spring carrying the velocity.
 *  - Tap/click a work → "walk up to it": the camera springs in until the work
 *    fills the space beside a solid label card. Prev/next walks the hang.
 *  - Tabs are rooms; long flights pull the camera back a little mid-walk.
 *  - The camera centre is published as --cx/--cy on the world, which drives
 *    box-frame parallax and the reflection sweeping across each glazing.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass/spring';
import { nudgeLight } from '@/lib/glass/light';
import type { LiquidGlass } from '@/lib/glass/liquid-glass';

type Room = { id: string; label: string; x0: number; x1: number; cx: number; mcx: number };
type Sample = { x: number; y: number; t: number };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const REST_Y = 720;

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

export function initWall() {
  const vp = document.querySelector<HTMLElement>('.gw-viewport')!;
  const world = vp.querySelector<HTMLElement>('.gw-world')!;
  const hint = document.querySelector<HTMLElement>('.gw-hint');
  const card = document.querySelector<HTMLElement>('.gw-card')!;
  const nav = document.querySelector<HTMLElement>('.ltb');
  const hero = world.querySelector<HTMLElement & Partial<LiquidGlass>>('.dia-glass');
  const W = Number(world.dataset.w);
  const H = Number(world.dataset.h);
  const reduced = prefersReducedMotion();
  const isMobile = () => innerWidth < 700;

  const rooms: Room[] = [...document.querySelectorAll<HTMLElement>('.gw-room')].map((el) => ({
    id: el.dataset.room!,
    label: (el.getAttribute('aria-label') ?? '').replace(',', ' ·'),
    x0: Number(el.dataset.x0),
    x1: Number(el.dataset.x1),
    cx: Number(el.dataset.cx),
    mcx: Number(el.dataset.mcx),
  }));
  const pieces = [...world.querySelectorAll<HTMLElement>('.gw-piece')];

  // Camera ------------------------------------------------------------------
  let current = -1; // index of the work we've walked up to
  let userZoom = 1;
  const baseZoom = () =>
    isMobile() ? innerWidth / 640 : clamp(Math.min(innerHeight / 1270, innerWidth / 2250), 0.42, 1.1);
  let z0 = baseZoom();
  const cx = new Spring(0, { response: 0.6, damping: 1 });
  const cy = new Spring(REST_Y, { response: 0.6, damping: 1 });
  const cz = new Spring(z0, { response: 0.6, damping: 1 });

  const limits = (z = z0 * userZoom) => {
    const hw = innerWidth / 2 / z;
    const hh = innerHeight / 2 / z;
    const padX = -20;
    const x0 = W + padX * 2 > hw * 2 ? hw - padX : W / 2;
    const x1 = W + padX * 2 > hw * 2 ? W - hw + padX : W / 2;
    // Never let the tab bar hide the floor line; never show above the ceiling slot.
    const bottomUI = 90 / z;
    const y0 = H > hh * 2 ? hh : H / 2 + 20;
    const y1 = H + bottomUI > hh * 2 ? H - hh + bottomUI : H / 2 + 20;
    return { x0, x1, y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
  };
  const clampCam = (x: number, y: number, z?: number) => {
    const l = limits(z);
    return [clamp(x, l.x0, l.x1), clamp(y, l.y0, l.y1)] as const;
  };

  const apply = () => {
    const z = cz.value;
    world.style.transform = `translate3d(${(innerWidth / 2 - cx.value * z).toFixed(2)}px, ${(innerHeight / 2 - cy.value * z).toFixed(2)}px, 0) scale(${z.toFixed(4)})`;
    world.style.setProperty('--cx', cx.value.toFixed(1));
    world.style.setProperty('--cy', cy.value.toFixed(1));
    // While zooming IN, let the compositor scale the existing (lower-res) raster and re-raster crisp
    // once settled. Never while zooming out: that would pin a high-res raster over a growing area.
    const zooming = cz.target > cz.value + 1e-3 && (world.style.willChange === 'transform' || cz.value <= z0 * userZoom * 1.05);
    if (zooming !== (world.style.willChange === 'transform')) world.style.willChange = zooming ? 'transform' : '';
    nudgeLight();
  };
  const loop = springLoop([cx, cy, cz], apply);
  const go = (x: number, y: number, z: number, response = 0.7, vx?: number, vy?: number) => {
    if (reduced) {
      cx.set(x);
      cy.set(y);
      cz.set(z);
      apply();
      return;
    }
    cx.to(x, { response, damping: 1, velocity: vx });
    cy.to(y, { response, damping: 1, velocity: vy });
    cz.to(z, { response: response * 1.05, damping: 1 });
    loop.kick();
  };

  const dismissHint = () => hint?.classList.add('gone');

  // Rooms / tab bar ------------------------------------------------------------
  const tabItems = nav ? [...nav.querySelectorAll<HTMLElement>('.ltb-item')] : [];
  const currentTab = () => Math.max(0, tabItems.findIndex((t) => t.getAttribute('aria-current') === 'page'));
  const roomAt = (x: number) => Math.max(0, rooms.findIndex((r) => x >= r.x0 && x < r.x1));
  const syncTab = (x: number) => {
    if (!nav) return;
    const i = roomAt(x);
    if (i !== currentTab()) nav.dispatchEvent(new CustomEvent('ltb:select', { detail: i }));
  };

  const fly = (i: number) => {
    dismissHint();
    if (current >= 0) stepBack(false);
    const r = rooms[i];
    const z = z0 * userZoom;
    const [tx, ty] = clampCam(isMobile() ? r.mcx : r.cx, REST_Y, z);
    const dist = Math.abs(tx - cx.value);
    history.replaceState(null, '', `#to-${r.id}`);
    if (reduced) return go(tx, ty, z);
    // Pure translation: re-rastering the wall at a new scale mid-flight is what drops frames.
    go(tx, ty, z, 0.75 + Math.min(dist / 20000, 0.4));
  };
  if (nav) {
    nav.addEventListener('pointerup', () => fly(currentTab()));
    tabItems.forEach((t, i) =>
      t.addEventListener('click', (e) => {
        e.preventDefault();
        if ((e as MouseEvent).detail === 0) fly(i);
      }),
    );
  }
  document.querySelectorAll<HTMLElement>('[data-fly]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = rooms.findIndex((r) => r.id === b.dataset.fly);
      nav?.dispatchEvent(new CustomEvent('ltb:select', { detail: i }));
      fly(i);
    }),
  );

  // Layout ----------------------------------------------------------------------
  let stops: number[] = [];
  const measure = () => {
    stops = [...world.querySelectorAll<HTMLElement>('.gw-title, .gw-panel, .gw-end, .gw-piece:not(.gw-sheet):not(.gw-object)')]
      .map((el) => el.offsetLeft + el.offsetWidth / 2)
      .sort((a, b) => a - b);
    for (const p of pieces) {
      p.style.setProperty('--fx', String(p.offsetLeft + p.offsetWidth / 2));
      p.style.setProperty('--fy', String(p.offsetTop + p.offsetHeight / 2));
    }
  };
  const layout = (initial = false) => {
    z0 = baseZoom();
    measure();
    if (initial) {
      const hash = location.hash.replace('#to-', '');
      const i = Math.max(0, rooms.findIndex((r) => r.id === hash));
      const [x, y] = clampCam(isMobile() ? rooms[i].mcx : rooms[i].cx, REST_Y, z0);
      cx.set(x);
      cy.set(y);
      cz.set(z0);
      if (i) nav?.dispatchEvent(new CustomEvent('ltb:select', { detail: i }));
    } else if (current >= 0) {
      walkUp(current, true);
      return;
    } else {
      const [x, y] = clampCam(cx.value, cy.value);
      cx.set(x);
      cy.set(y);
      cz.set(z0 * userZoom);
    }
    apply();
  };
  layout(true);
  addEventListener('resize', () => layout());
  document.fonts?.ready.then(() => measure());

  // Walk-up ----------------------------------------------------------------------
  const roomName = card.querySelector<HTMLElement>('.cd-room')!;
  const tomb = card.querySelector<HTMLElement>('.cd-tomb')!;
  const more = card.querySelector<HTMLElement>('.cd-more')!;
  const count = card.querySelector<HTMLElement>('.cd-count')!;
  const scroller = card.querySelector<HTMLElement>('.cd-scroll')!;

  const fillCard = (el: HTMLElement, i: number) => {
    const x = el.offsetLeft + el.offsetWidth / 2;
    roomName.textContent = rooms[roomAt(x)].label;
    const label = el.querySelector<HTMLElement>(':scope > .gw-label');
    const tombTpl = el.querySelector<HTMLTemplateElement>(':scope > template.gw-tomb');
    tomb.replaceChildren();
    if (tombTpl) tomb.append(tombTpl.content.cloneNode(true));
    else if (label) tomb.innerHTML = label.innerHTML;
    const tpl = el.querySelector<HTMLTemplateElement>(':scope > template.gw-more');
    more.replaceChildren();
    if (tpl) more.append(tpl.content.cloneNode(true));
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(pieces.length).padStart(2, '0')}`;
    scroller.scrollTop = 0;
  };

  function walkUp(i: number, instant = false) {
    const el = pieces[i];
    if (!el) return;
    dismissHint();
    const prev = current;
    current = i;
    const mobile = isMobile();
    const cardW = mobile ? 0 : card.offsetWidth + 32;
    const sheetH = mobile ? Math.min(innerHeight * 0.44, 420) + 12 : 0;
    const availW = innerWidth - cardW - (mobile ? 36 : 140);
    const availH = innerHeight - sheetH - (mobile ? 64 : 210);
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const z = clamp(Math.min(availW / bw, availH / bh), z0 * (mobile ? 0.8 : 1.05), mobile ? 2.6 : 2.4);
    const sx = mobile ? innerWidth / 2 : (innerWidth - cardW) / 2 + 8;
    const sy = mobile ? (innerHeight - sheetH) / 2 + 6 : (innerHeight - 90) / 2 + 4;
    const tx = el.offsetLeft + bw / 2 + (innerWidth / 2 - sx) / z;
    const ty = el.offsetTop + bh / 2 + (innerHeight / 2 - sy) / z;
    if (instant) {
      cx.set(tx);
      cy.set(ty);
      cz.set(z);
      apply();
    } else {
      go(tx, ty, z, prev >= 0 ? 0.65 : 0.8);
    }
    if (prev !== i) fillCard(el, i);
    card.classList.add('open');
    card.setAttribute('aria-hidden', 'false');
    document.body.classList.add('walked');
    if (hero && el.classList.contains('gw-diasec')) hero.refractionScale = 1.3;
    else if (hero) hero.refractionScale = 1;
    syncTab(el.offsetLeft + bw / 2);
  }

  function stepBack(move = true) {
    if (current < 0) return;
    const el = pieces[current];
    current = -1;
    card.classList.remove('open');
    card.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('walked');
    if (hero) hero.refractionScale = 1;
    if (!move) return;
    const z = z0 * userZoom;
    const [tx, ty] = clampCam(el.offsetLeft + el.offsetWidth / 2, REST_Y, z);
    go(tx, ty, z, 0.75);
    el.querySelector<HTMLElement>('.gw-hit')?.focus({ preventScroll: true });
  }

  card.querySelector('.cd-close')!.addEventListener('click', () => stepBack());
  card.querySelector('.cd-prev')!.addEventListener('click', () => walkUp((current - 1 + pieces.length) % pieces.length));
  card.querySelector('.cd-next')!.addEventListener('click', () => walkUp((current + 1) % pieces.length));

  // Keyboard users: Enter/Space on a work's button.
  pieces.forEach((p, i) => {
    const hit = p.querySelector<HTMLElement>('.gw-hit');
    hit?.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) walkUp(i);
    });
    hit?.addEventListener('focus', () => {
      if (current >= 0 || !hit.matches(':focus-visible')) return;
      const [tx, ty] = clampCam(p.offsetLeft + p.offsetWidth / 2, REST_Y);
      go(tx, ty, z0 * userZoom, 0.6);
      syncTab(tx);
    });
  });

  // Pan gesture -----------------------------------------------------------------
  let pan: { id: number; sx: number; sy: number; lx: number; ly: number; hist: Sample[]; moved: boolean; piece: number } | null = null;
  const softClamp = (v: number, lo: number, hi: number, span: number) =>
    v < lo ? lo - rubberband(lo - v, span) : v > hi ? hi + rubberband(v - hi, span) : v;

  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('a, button:not(.gw-hit)')) return;
    const pieceEl = (e.target as Element).closest<HTMLElement>('.gw-piece');
    pan = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      hist: [],
      moved: false,
      piece: pieceEl ? pieces.indexOf(pieceEl) : -1,
    };
    pushSample(pan.hist, e);
  });
  vp.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') world.style.setProperty('--ptr', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    if (!pan || e.pointerId !== pan.id) return;
    pushSample(pan.hist, e);
    if (!pan.moved) {
      if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) < 6) return;
      pan.moved = true;
      pan.lx = e.clientX;
      pan.ly = e.clientY;
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('panning');
      dismissHint();
      loop.stop();
      if (current >= 0) {
        // Stepping away from a work: release the zoom while the finger keeps panning.
        stepBack(false);
        cz.to(z0 * userZoom, { response: 0.55, damping: 1 });
      }
    }
    const z = cz.value;
    const l = limits(z);
    const x = cx.value - (e.clientX - pan.lx) / z;
    const y = cy.value - (e.clientY - pan.ly) / z;
    pan.lx = e.clientX;
    pan.ly = e.clientY;
    // Rubber-band relative to the unclamped finger position.
    cx.set(softClamp(x, l.x0 - 1e-3, l.x1 + 1e-3, innerWidth / z));
    cy.set(softClamp(y, l.y0, l.y1, innerHeight / z));
    if (cz.value !== cz.target) {
      cz.step(1 / 60);
    }
    apply();
  });
  const endPan = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id) return;
    const p = pan;
    pan = null;
    vp.classList.remove('panning');
    if (!p.moved) {
      if (e.type === 'pointercancel') return;
      if (p.piece >= 0) walkUp(p.piece);
      else if (current >= 0) stepBack();
      return;
    }
    const v = velocity(p.hist);
    const z = z0 * userZoom;
    const vx = -v.x / cz.value;
    const vy = -v.y / cz.value;
    let [tx, ty] = clampCam(cx.value + project(vx, 0.996), cy.value + project(vy, 0.99), z);
    // On phones a swipe walks from one work (or wall text) to the next, like stepping along a gallery.
    if (isMobile()) {
      let best = tx;
      let bd = Infinity;
      for (const s of stops) {
        const d = Math.abs(s - tx);
        if (d < bd) (bd = d), (best = s);
      }
      if (bd < 420) tx = clampCam(best, ty, z)[0];
    }
    go(tx, ty, z, 0.75, vx, vy);
    syncTab(tx);
  };
  vp.addEventListener('pointerup', endPan);
  vp.addEventListener('pointercancel', endPan);

  // Wheel / trackpad: two-finger pan; pinch (ctrl+wheel) zooms about the cursor.
  let wheelSync = 0;
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dismissHint();
      loop.stop();
      if (current >= 0) stepBack(false);
      if (e.ctrlKey) {
        const before = cz.value;
        userZoom = clamp(userZoom * Math.exp(-e.deltaY * 0.01), 0.6, 2.2);
        const z = z0 * userZoom;
        const px = e.clientX - innerWidth / 2;
        const py = e.clientY - innerHeight / 2;
        cx.set(cx.value + px / before - px / z);
        cy.set(cy.value + py / before - py / z);
        cz.set(z);
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        // Vertical wheel walks along the wall too — it's the natural axis here.
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 || e.shiftKey ? e.deltaX || e.deltaY : e.deltaY;
        const dy = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 ? e.deltaY : 0;
        cz.set(z0 * userZoom);
        cx.set(cx.value + (dx * k) / cz.value);
        cy.set(cy.value + (dy * k) / cz.value);
      }
      const [x, y] = clampCam(cx.value, cy.value, cz.value);
      cx.set(x);
      cy.set(y);
      apply();
      clearTimeout(wheelSync);
      wheelSync = window.setTimeout(() => syncTab(cx.value), 140);
    },
    { passive: false },
  );

  // Keyboard ------------------------------------------------------------------------
  addEventListener('keydown', (e) => {
    if ((e.target as Element)?.closest?.('input, textarea')) return;
    if (current >= 0) {
      if (e.key === 'Escape') stepBack();
      else if (e.key === 'ArrowRight') walkUp((current + 1) % pieces.length);
      else if (e.key === 'ArrowLeft') walkUp((current - 1 + pieces.length) % pieces.length);
      else return;
      e.preventDefault();
      return;
    }
    const step = 320 / cz.value;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step / 2], ArrowDown: [0, step / 2] } as Record<string, number[]>)[e.key];
    if (!d) return;
    e.preventDefault();
    dismissHint();
    const [tx, ty] = clampCam(cx.target + d[0], cy.target + d[1]);
    go(tx, ty, z0 * userZoom, 0.45);
    syncTab(tx);
  });
}
