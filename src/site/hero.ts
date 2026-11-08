/**
 * The hero: one sentence introducing Josh, whose outline "pills" are commands, and the five
 * suggested actions under it. Change the copy here, never in components.
 *
 * Every pill names the widget it brings forward on hover, what its preview shows, and the
 * `Action` a click performs. Every chip has its `Action` and its ⌥-number shortcut.
 */
import type { IconName } from '~/components/ui/icons';
import { shouldNeverHappen } from '~/lib/defects';
import type { Action } from '~/lib/actions';
import type { WidgetId } from '~/lib/ui-state';
import type { Segment } from '~/domain/sentence';
import { career, type Role } from '~/site/career';
import { social } from '~/site/profile';

/** What a pill's preview card shows (desktop: beside the cursor; phone: in a sheet). */
export type Preview =
  | { readonly _tag: 'Contact' }
  | { readonly _tag: 'Pass'; readonly role: Role['id'] }
  | { readonly _tag: 'Coffee' }
  | { readonly _tag: 'LatestNote' }
  | { readonly _tag: 'GoldenHour' }
  | { readonly _tag: 'Projects' }
  | { readonly _tag: 'Terminal' }
  | { readonly _tag: 'Now' };

/** A small mark before a pill's word: Josh's Memoji, or an employer's brand colour. */
export type PillMark =
  | { readonly _tag: 'Avatar' }
  | { readonly _tag: 'Dot'; readonly color: string };

/** One serif-italic pill in the sentence. */
export type Pill = {
  /** Stable key, unique within the sentence. */
  readonly id: string;
  /** The word in the sentence. */
  readonly label: string;
  readonly mark?: PillMark;
  /** The widget that comes forward while the pill is hovered (and the no-JS link target). */
  readonly widget: WidgetId;
  readonly preview: Preview;
  /** Phone sheet title. */
  readonly title: string;
  /** Phone sheet button, e.g. "Open Kodo pass". */
  readonly cta: string;
  readonly action: Action;
};

/** One suggested action under the sentence. */
export type Chip = {
  readonly label: string;
  readonly icon: IconName;
  /** The digit of its ⌥ shortcut, 1–5. */
  readonly key: 1 | 2 | 3 | 4 | 5;
  readonly action: Action;
};

/** What the hero needs to know that only the build does. */
export type HeroContext = {
  /** The newest note's collection id. */
  readonly latestNoteId: string;
};

const role = (id: Role['id']): Role =>
  career.find((r) => r.id === id) ?? shouldNeverHappen(`Unknown role ${id}`);

const text = (t: string): Segment<Pill> => ({ _tag: 'Text', text: t });
const pill = (p: Pill): Segment<Pill> => ({ _tag: 'Pill', pill: p });

const passPill = (id: Role['id'], label: string, color: string): Segment<Pill> =>
  pill({
    id,
    label,
    mark: { _tag: 'Dot', color },
    widget: 'engineering',
    preview: { _tag: 'Pass', role: id },
    title: role(id).company,
    cta: `Open ${label} pass`,
    action: { _tag: 'OpenPalette', view: { _tag: 'Career', roleId: id } },
  });

const josh: Pill = {
  id: 'josh',
  label: 'Josh',
  mark: { _tag: 'Avatar' },
  widget: 'contact',
  preview: { _tag: 'Contact' },
  title: 'Josh Germon',
  cta: 'Show contact',
  action: { _tag: 'ShowWidget', widget: 'contact' },
};

const sydney: Pill = {
  id: 'sydney',
  label: 'Sydney',
  widget: 'coffee',
  preview: { _tag: 'Coffee' },
  title: 'Grab a coffee',
  cta: 'Pick a morning',
  action: { _tag: 'PickCoffee' },
};

const notes = (ctx: HeroContext): Pill => ({
  id: 'notes',
  label: 'notes',
  widget: 'notes',
  preview: { _tag: 'LatestNote' },
  title: 'Notes',
  cta: 'Read the latest note',
  action: { _tag: 'OpenPalette', view: { _tag: 'Notes', noteId: ctx.latestNoteId, reading: true } },
});

const photos: Pill = {
  id: 'photos',
  label: 'photos',
  widget: 'golden',
  preview: { _tag: 'GoldenHour' },
  title: 'Golden hour',
  cta: 'Show golden hour',
  action: { _tag: 'ShowWidget', widget: 'golden' },
};

const tools: Pill = {
  id: 'tools',
  label: 'tools',
  widget: 'projects',
  preview: { _tag: 'Projects' },
  title: 'Projects',
  cta: 'Browse projects',
  action: { _tag: 'OpenPalette', view: { _tag: 'Projects' } },
};

const terminal: Pill = {
  id: 'terminal',
  label: 'terminal',
  widget: 'terminal',
  preview: { _tag: 'Terminal' },
  title: 'Terminal',
  cta: 'Open the terminal',
  action: { _tag: 'RunInTerminal', command: 'help' },
};

const lately: Pill = {
  id: 'now',
  label: 'Lately',
  widget: 'now',
  preview: { _tag: 'Now' },
  title: 'Now',
  cta: 'Show now',
  action: { _tag: 'ShowWidget', widget: 'now' },
};

/**
 * The sentence, in reading order.
 *
 * @param ctx - Build-time facts (the latest note).
 * @returns Text runs and pills; `domain/sentence#tokenize` splits it for the reveal.
 */
export function heroSentence(ctx: HeroContext): ReadonlyArray<Segment<Pill>> {
  return [
    text('I’m'),
    pill(josh),
    text('Germon, founding engineer at'),
    passPill('kodo', 'Kodo', role('kodo').brand.bg),
    text('in'),
    pill(sydney),
    text('. I write'),
    pill(notes(ctx)),
    text(', take'),
    pill(photos),
    text('and build small'),
    pill(tools),
    text('in the'),
    pill(terminal),
    text('. Previously at'),
    // nib's pass is green; its dot borrows the logo's lighter green so it reads on black.
    passPill('nib', 'nib', role('nib').brand.label),
    text('and'),
    passPill('jala', 'Jala', role('jala').brand.fg),
    text('.'),
    pill(lately),
    text(', AI tooling and the platforms under it.'),
  ];
}

/**
 * The share card's sentence (`components/og`): who Josh is and what he builds, without
 * employers or side projects — a link preview should introduce him, not list things.
 *
 * @returns Text runs and pills, like `heroSentence`.
 */
export function shareSentence(): ReadonlyArray<Segment<Pill>> {
  return [
    text('I’m'),
    pill(josh),
    text('Germon, a software engineer in'),
    pill(sydney),
    text('. I build products, platforms and AI tooling.'),
  ];
}

/**
 * The five suggested actions under the sentence (also the palette's empty-state suggestions).
 *
 * @param ctx - Build-time facts (the latest note).
 * @returns The chips, in ⌥1–⌥5 order.
 */
export function heroChips(ctx: HeroContext): ReadonlyArray<Chip> {
  return [
    {
      key: 1,
      label: 'Read latest note',
      icon: 'note',
      action: {
        _tag: 'OpenPalette',
        view: { _tag: 'Notes', noteId: ctx.latestNoteId, reading: true },
      },
    },
    { key: 2, label: 'Email Josh', icon: 'mail', action: { _tag: 'SendEmail' } },
    {
      key: 3,
      label: 'View engineering work',
      icon: 'wallet',
      action: { _tag: 'OpenPalette', view: { _tag: 'Career' } },
    },
    {
      key: 4,
      label: 'Open GitHub',
      icon: 'github',
      action: { _tag: 'OpenLink', href: social('github').href },
    },
    { key: 5, label: 'Book a coffee', icon: 'coffee', action: { _tag: 'PickCoffee' } },
  ];
}
