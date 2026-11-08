/**
 * Bento · Combo — the one bottom sheet. On a phone (≤680px) every overlay on
 * the page is this: the ⌘K palette and its views, pill previews, the coffee
 * confirmation and the backdrop picker. Same physics everywhere:
 *  - a grabber + header you can drag; release with velocity projection
 *    (fling down to dismiss, or past half its height)
 *  - rubber-band when pulled up past the top
 *  - spring settle (interruptible: grab it mid-flight)
 *  - scrim tap / Esc close it; Tab stays inside
 *  - prefers-reduced-motion: no travel, just appear / disappear
 */
import { Spring, springLoop, rubberband, project } from '@/lib/glass/spring';

export const PHONE = 680;
export const isPhone = () => innerWidth <= PHONE;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Opts = {
  root: HTMLElement;
  win: HTMLElement;
  /** Drag zones (grabber, header). */
  handles: HTMLElement[];
  /** The palette manages its own Esc / Tab / scrim; plain sheets don't. */
  managed?: boolean;
  onClose?: () => void;
};

export type Sheet = {
  open: (focus?: HTMLElement | null) => void;
  close: (after?: () => void) => void;
  isOpen: () => boolean;
};

const stack: Sheet[] = [];

export function sheet(o: Opts): Sheet {
  const { root, win } = o;
  const scrim = root.querySelector<HTMLElement>('[data-sh-scrim]');
  const y = new Spring(0, { response: 0.42, damping: 0.9 });
  let open = false;
  let h = 1;
  let lastFocus: HTMLElement | null = null;
  let after: (() => void) | undefined;

  const finish = () => {
    if (root.hidden) return;
    loop.stop();
    root.hidden = true;
    root.dataset.state = '';
    win.style.transform = '';
    if (scrim) scrim.style.opacity = '';
    const cb = after;
    after = undefined;
    if (cb) cb();
    else if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  };

  const apply = () => {
    win.style.transform = `translate3d(0,${y.value.toFixed(2)}px,0)`;
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y.value / h)));
    if (!open && y.value >= h - 0.5) finish();
  };
  const loop = springLoop([y], apply);

  const api: Sheet = {
    isOpen: () => open,
    open(focus) {
      if (open) return;
      open = true;
      after = undefined;
      lastFocus = document.activeElement as HTMLElement;
      const fresh = root.hidden;
      root.hidden = false;
      root.dataset.state = 'open';
      document.documentElement.classList.add('sh-lock');
      h = Math.max(1, win.offsetHeight);
      stack.push(api);
      if (reduced()) {
        y.set(0);
        apply();
      } else {
        // Already mid-close? Retarget from where it is (interruptible).
        if (fresh) y.set(h);
        y.to(0, { response: 0.42, damping: 0.9 });
        apply();
        loop.kick();
      }
      (focus ?? win).focus({ preventScroll: true });
    },
    close(cb) {
      if (!open) return;
      open = false;
      after = cb;
      root.dataset.state = 'closing';
      stack.splice(stack.indexOf(api), 1);
      if (!stack.length) document.documentElement.classList.remove('sh-lock');
      o.onClose?.();
      (document.activeElement as HTMLElement | null)?.blur?.();
      h = Math.max(1, win.offsetHeight);
      if (reduced()) return finish();
      y.to(h + 12, { response: 0.34, damping: 1 });
      loop.kick();
    },
  };

  /* Drag ------------------------------------------------------------------- */
  let sy = -1;
  let from = 0;
  let ly = 0;
  let lt = 0;
  let vel = 0;
  const down = (e: PointerEvent) => {
    if (!open || e.button > 0 || (e.target as HTMLElement).closest('input, button, a')) return;
    sy = e.clientY;
    from = y.value;
    ly = e.clientY;
    lt = performance.now();
    vel = 0;
    loop.stop();
    h = Math.max(1, win.offsetHeight);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (sy < 0) return;
    const d = from + e.clientY - sy;
    y.set(d < 0 ? rubberband(d, h) : d);
    const now = performance.now();
    const v = ((e.clientY - ly) / Math.max(1, now - lt)) * 1000;
    vel = vel * 0.6 + v * 0.4;
    ly = e.clientY;
    lt = now;
    apply();
  };
  const up = () => {
    if (sy < 0) return;
    sy = -1;
    if (performance.now() - lt > 90) vel = 0; // held still before letting go
    const landing = y.value + project(vel);
    if (reduced()) {
      if (landing > h * 0.5) api.close();
      else {
        y.set(0);
        apply();
      }
      return;
    }
    if (landing > h * 0.5 || vel > 1100) {
      api.close();
      y.to(h + 12, { velocity: vel, response: 0.34, damping: 1 });
    } else y.to(0, { velocity: vel, response: 0.42, damping: 0.86 });
    loop.kick();
  };
  for (const el of o.handles) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  if (!o.managed) {
    scrim?.addEventListener('click', () => api.close());
    root.querySelectorAll('[data-sh-close]').forEach((b) => b.addEventListener('click', () => api.close()));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        api.close();
      } else if (e.key === 'Tab') {
        const f = [...win.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]')].filter((x) => x.offsetParent);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
  }
  return api;
}
