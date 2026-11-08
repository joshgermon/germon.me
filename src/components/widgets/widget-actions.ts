/**
 * Progressive enhancement for the static widgets. Their links and buttons are real HTML
 * (`<a href>` works without JavaScript); with JavaScript, anything marked `data-perform` runs
 * through `perform` instead, so a click does exactly what the same palette command does.
 *
 * Markup contract (`data-perform` value → action):
 * - `link`        `<a href>` → `OpenLink` (new tab)
 * - `email`       → `SendEmail`
 * - `copy-email`  → `Copy` the address
 * - `notes`       → open the palette on Notes; with `data-note="<id>"`, reading that note
 * - `career`      → open the palette on Engineering; with `data-role="<id>"`, on that pass
 */
import { perform, type Action } from '~/lib/actions';
import { career, type Role } from '~/site/career';
import { profile } from '~/site/profile';

const isRoleId = (id: string | undefined): id is Role['id'] => career.some((r) => r.id === id);

/** Translate an element's `data-perform` markup into an action, if it names one. */
function actionFor(el: HTMLElement): Action | undefined {
  const { perform: kind, note, role } = el.dataset;
  switch (kind) {
    case 'link':
      return el instanceof HTMLAnchorElement ? { _tag: 'OpenLink', href: el.href } : undefined;
    case 'email':
      return { _tag: 'SendEmail' };
    case 'copy-email':
      return { _tag: 'Copy', text: profile.email, confirmation: 'Email copied' };
    case 'notes':
      return {
        _tag: 'OpenPalette',
        view: note ? { _tag: 'Notes', noteId: note, reading: true } : { _tag: 'Notes' },
      };
    case 'career':
      return {
        _tag: 'OpenPalette',
        view: isRoleId(role) ? { _tag: 'Career', roleId: role } : { _tag: 'Career' },
      };
    default:
      return undefined;
  }
}

/** Let modified and middle clicks keep the browser's own behaviour (new tab, download…). */
const plainClick = (e: MouseEvent): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

let wired = false;

/**
 * Route every `data-perform` click on the page through `perform`. Safe to call from each
 * widget's script: it installs one delegated listener, once.
 */
export function wireWidgetActions(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    if (!plainClick(e) || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>('[data-perform]');
    const action = el ? actionFor(el) : undefined;
    if (!action) return;
    e.preventDefault();
    perform(action);
  });
}

/**
 * ⌘C / Ctrl+C while the pointer is over `el` (and nothing is selected) copies Josh's email.
 *
 * @param el - The contact card.
 */
export function copyEmailOnHover(el: HTMLElement): void {
  let over = false;
  el.addEventListener('pointerenter', () => (over = true));
  el.addEventListener('pointerleave', () => (over = false));
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const editing =
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (!over || editing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return;
    if (getSelection()?.toString()) return;
    e.preventDefault();
    perform({ _tag: 'Copy', text: profile.email, confirmation: 'Email copied' });
  });
}
