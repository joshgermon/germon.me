/**
 * What every overlay (the palette window, any phone sheet) needs from the page: the page stops
 * scrolling underneath, Tab stays inside, and focus goes back where it was afterwards. Overlays
 * can stack (a sheet over the palette), so the scroll lock is reference-counted.
 */

let locks = 0;

/**
 * Freeze page scrolling (`data-scroll-lock` on <html>) until the returned release is called.
 * Releasing twice is harmless.
 *
 * @returns A function that releases this lock.
 */
export function lockScroll(): () => void {
  locks++;
  document.documentElement.setAttribute('data-scroll-lock', '');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.documentElement.removeAttribute('data-scroll-lock');
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab / Shift+Tab cycling inside `container`. Call from a `keydown` handler.
 *
 * @param event - The keydown event (ignored unless it is Tab).
 * @param container - The overlay's window.
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
  event.preventDefault();
  if (items.length === 0) {
    container.focus({ preventScroll: true });
    return;
  }
  const active = document.activeElement;
  const i = items.findIndex((el) => el === active);
  const n = items.length;
  const at = i < 0 ? (event.shiftKey ? n - 1 : 0) : (i + (event.shiftKey ? -1 : 1) + n) % n;
  items[at]?.focus({ preventScroll: true });
}

/**
 * Remember what had focus so it can be restored when the overlay closes.
 *
 * @returns Restores focus to the remembered element if it is still in the document.
 */
export function rememberFocus(): () => void {
  const el = document.activeElement;
  return () => {
    if (el instanceof HTMLElement && el !== document.body && document.contains(el)) {
      el.focus({ preventScroll: true });
    }
  };
}

let lastInput: 'pointer' | 'keyboard' = 'keyboard';
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (lastInput = 'pointer'), { capture: true });
  window.addEventListener('keydown', () => (lastInput = 'keyboard'), { capture: true });
}

/**
 * Whether the most recent input was a pointer. Keyboard-driven overlays open and close
 * instantly (no animation); pointer-driven ones may animate.
 */
export const lastInputWasPointer = (): boolean => lastInput === 'pointer';
