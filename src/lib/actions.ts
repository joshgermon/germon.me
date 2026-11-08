/**
 * Everything a user can *do* — from a palette row, an action chip, a hero pill or a keyboard
 * shortcut — is an `Action`. `perform` is the single place those effects happen, so every
 * entry point behaves identically.
 */
import { fortnight, mailto, type OpenDay } from '~/domain/coffee';
import type { HotspotId } from '~/domain/office/hotspot';
import { casesHandled } from '~/lib/defects';
import { lastInputWasPointer } from '~/lib/overlay';
import {
  $coffeeRequest,
  $officeRequest,
  $palette,
  $terminalRequest,
  $toast,
  type PaletteView,
  type WidgetId,
} from '~/lib/ui-state';
import { profile } from '~/site/profile';

/** A user intent. */
export type Action =
  | { readonly _tag: 'OpenPalette'; readonly view: PaletteView }
  | { readonly _tag: 'ShowWidget'; readonly widget: WidgetId }
  | { readonly _tag: 'OpenLink'; readonly href: string }
  | { readonly _tag: 'SendEmail'; readonly subject?: string }
  | { readonly _tag: 'Copy'; readonly text: string; readonly confirmation: string }
  | { readonly _tag: 'PickCoffee' }
  /** Draft an email asking for the next free weekday morning (no picking). */
  | { readonly _tag: 'AskForCoffee' }
  /** Draft an email asking for coffee on a morning picked in the coffee widget. */
  | { readonly _tag: 'BookCoffee'; readonly day: OpenDay }
  | { readonly _tag: 'RunInTerminal'; readonly command: string }
  /**
   * Bring the office into view and activate one of its objects: look at it (open its panel),
   * switch the lamp, or take a shot. From the keyboard the camera cuts; from a pointer it glides.
   */
  | { readonly _tag: 'LookAt'; readonly target: HotspotId };

let seq = 0;

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll a widget into view and briefly highlight it.
 *
 * @param widget - The widget to reveal.
 */
export function showWidget(widget: WidgetId): void {
  const el = document.getElementById(widget);
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  el.setAttribute('data-flash', '');
  window.setTimeout(() => el.removeAttribute('data-flash'), 1200);
}

/**
 * Show a short confirmation.
 *
 * @param message - What happened, e.g. "Email copied".
 */
export function toast(message: string): void {
  $toast.set({ message, seq: ++seq });
}

/**
 * Carry out an action. Closes the palette first unless the action opens a palette view.
 *
 * @param action - The intent to perform.
 */
export function perform(action: Action): void {
  if (action._tag !== 'OpenPalette') $palette.set({ _tag: 'Closed' });

  switch (action._tag) {
    case 'OpenPalette':
      $palette.set({ _tag: 'Open', view: action.view });
      return;
    case 'ShowWidget':
      showWidget(action.widget);
      return;
    case 'OpenLink':
      window.open(action.href, '_blank', 'noopener');
      return;
    case 'SendEmail': {
      const subject = action.subject ? `?subject=${encodeURIComponent(action.subject)}` : '';
      window.location.href = `mailto:${profile.email}${subject}`;
      return;
    }
    case 'Copy':
      void navigator.clipboard.writeText(action.text).then(
        () => toast(action.confirmation),
        () => toast('Couldn’t copy — select it instead'),
      );
      return;
    case 'PickCoffee':
      showWidget('coffee');
      $coffeeRequest.set({ seq: ++seq });
      return;
    case 'AskForCoffee':
      window.location.href = mailto(
        profile.email,
        fortnight(new Date(), profile.timeZone).firstOpen,
      );
      return;
    case 'BookCoffee':
      window.location.href = mailto(profile.email, action.day);
      return;
    case 'RunInTerminal':
      showWidget('terminal');
      $terminalRequest.set({ command: action.command, seq: ++seq });
      return;
    case 'LookAt':
      showWidget('office');
      $officeRequest.set({ target: action.target, instant: !lastInputWasPointer(), seq: ++seq });
      return;
    default:
      casesHandled(action);
  }
}
