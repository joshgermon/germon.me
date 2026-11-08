/**
 * State shared between islands (palette, hero pills, widgets). Each island is its own
 * Svelte root, so cross-island state lives in tiny nanostores atoms — Svelte reads them
 * with `$store` like any store. Keep this to genuinely shared state; anything local to one
 * island stays inside it.
 */
import { atom } from 'nanostores';

import type { Role } from '~/site/career';

/** Every widget on the page; each is a `Card` whose `id` matches. */
export type WidgetId =
  | 'notes'
  | 'engineering'
  | 'now'
  | 'coffee'
  | 'golden'
  | 'contact'
  | 'terminal'
  | 'projects'
  | 'commits'
  | 'contributions';

/** What the command palette is showing. */
export type PaletteView =
  | { readonly _tag: 'Root' }
  /** `noteId` selects a note; `reading` opens it straight into the full-width reader. */
  | { readonly _tag: 'Notes'; readonly noteId?: string; readonly reading?: boolean }
  | { readonly _tag: 'Career'; readonly roleId?: Role['id'] }
  | { readonly _tag: 'Projects' };

/** The palette is either closed or open on a view. */
export type PaletteState =
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'Open'; readonly view: PaletteView };

/** The command palette (desktop window / phone sheet). */
export const $palette = atom<PaletteState>({ _tag: 'Closed' });

/** Which career pass sits at the front of the Engineering stack. */
export const $frontRole = atom<Role['id']>('kodo');

/** A request for the coffee widget to start picking a morning (bumps `seq` each time). */
export const $coffeeRequest = atom<{ readonly seq: number } | null>(null);

/** A command for the terminal widget to type and run (bumps `seq` each time). */
export const $terminalRequest = atom<{ readonly command: string; readonly seq: number } | null>(
  null,
);

/** A short confirmation shown as a toast/HUD, e.g. "Email copied". */
export const $toast = atom<{ readonly message: string; readonly seq: number } | null>(null);
