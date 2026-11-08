/**
 * A single shared "light source" that follows the pointer. Every registered
 * glass surface gets CSS variables describing where the light is relative to
 * its own centre, so specular rims and prism fringes swing toward the cursor.
 *
 *   --lg-angle  deg, direction from the element centre to the light
 *   --lg-lx/ly  unit vector of the same
 *   --lg-near   0..1, how close the light is (brightens the rim)
 *
 * On touch devices with no hover the light sits top-left and drifts with scroll.
 */

const els = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
let io: IntersectionObserver | null = null;
let px = -1;
let py = -1;
let hasPointer = false;
let raf = 0;
let started = false;

function frame() {
  raf = 0;
  const vw = innerWidth;
  const vh = innerHeight;
  // Default light: above-left of the viewport, nudged by scroll for touch users.
  const lx = hasPointer ? px : vw * 0.2;
  const ly = hasPointer ? py : -vh * 0.3 + (scrollY % vh) * 0.15;
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = lx - cx;
    const dy = ly - cy;
    const d = Math.hypot(dx, dy) || 1;
    const near = Math.max(0, 1 - d / Math.max(600, Math.max(r.width, r.height) * 1.5));
    el.style.setProperty('--lg-angle', `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`);
    el.style.setProperty('--lg-lx', (dx / d).toFixed(3));
    el.style.setProperty('--lg-ly', (dy / d).toFixed(3));
    el.style.setProperty('--lg-near', near.toFixed(3));
    // Pointer position in element space, for local glints.
    el.style.setProperty('--lg-px', `${(((lx - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty('--lg-py', `${(((ly - r.top) / r.height) * 100).toFixed(1)}%`);
  }
}

export function requestLightFrame() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function start() {
  if (started) return;
  started = true;
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      hasPointer = true;
      px = e.clientX;
      py = e.clientY;
      requestLightFrame();
    },
    { passive: true },
  );
  addEventListener('scroll', requestLightFrame, { passive: true });
  addEventListener('resize', requestLightFrame, { passive: true });
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target as HTMLElement);
      else visible.delete(e.target as HTMLElement);
    }
    requestLightFrame();
  });
  for (const el of els) io.observe(el);
}

export function registerLight(el: HTMLElement) {
  els.add(el);
  start();
  io?.observe(el);
}

export function unregisterLight(el: HTMLElement) {
  els.delete(el);
  visible.delete(el);
  io?.unobserve(el);
}

/** Elements that move on their own (draggable lenses, tab droplets) call this each frame. */
export function nudgeLight() {
  requestLightFrame();
}
