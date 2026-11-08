/**
 * The command palette's registry: every command, grouped the way the palette shows them, plus
 * the rows inside its Notes, Engineering and Projects views. Built once at build time from
 * typed inputs (notes, GitHub activity) — nothing here fetches — and handed to the palette
 * island as plain data. Change palette copy here, never in components.
 *
 * Every row runs an `Action` (↵) and optionally a second one (⌘↵).
 */
import type { IconName } from '~/components/ui/icons';
import type { Stats } from '~/domain/github/contributions';
import { recencyLong, recencyShort, type Repo } from '~/domain/github/repo';
import type { Action } from '~/lib/actions';
import { career, tenureYears, type Role } from '~/site/career';
import { languageColor } from '~/site/languages';
import { profile, social } from '~/site/profile';

/** A note, as the palette needs it. */
export type NoteSummary = {
  /** Collection id, also the slug of `/notes/<id>`. */
  readonly id: string;
  /** The note's one-line headline (its `excerpt`). */
  readonly title: string;
  readonly date: Date;
  readonly words: number;
  /** The opening of the prose, for the "Read Latest Note" detail. */
  readonly preview: string;
  /** Plain-text body, for search. */
  readonly text: string;
};

/** What the registry is built from. */
export type CommandInputs = {
  /** Every note, newest first. */
  readonly notes: ReadonlyArray<NoteSummary>;
  /** Showcased repos, newest push first; `undefined` when GitHub didn't serve them. */
  readonly repos: ReadonlyArray<Repo> | undefined;
  /** Contribution numbers; `undefined` when GitHub didn't serve the calendar. */
  readonly stats: Stats | undefined;
  /** The build instant (for "pushed 3 weeks ago"). */
  readonly now: Date;
};

/** The square at the start of a row (and the top of its detail). */
export type Glyph =
  | { readonly _tag: 'Icon'; readonly name: IconName; readonly ghost?: boolean }
  | { readonly _tag: 'Brand'; readonly bg: string; readonly src: string; readonly avatar: boolean }
  | { readonly _tag: 'Language'; readonly color: string | undefined };

/** The right-hand end of a row. */
export type Trailing =
  /** ⌥1–⌥5 on the suggestions. */
  | { readonly _tag: 'Keys'; readonly keys: ReadonlyArray<string> }
  | {
      readonly _tag: 'Text';
      readonly text: string;
      /** A count badge before the text, e.g. 24 notes. */
      readonly count?: number;
      /** GitHub stars before the text. */
      readonly stars?: number;
      /** Tooltip. */
      readonly hint?: string;
    };

/** A value only the browser can know (it depends on today). */
export type LiveValue = 'nextFreeMorning' | 'goldenHour' | 'sunset';

/** One "Information" row in a detail pane. */
export type MetaRow = {
  readonly label: string;
  readonly value: string | { readonly _tag: 'Live'; readonly key: LiveValue };
};

/** What the right-hand pane shows for the selected row. */
export type Detail =
  | {
      readonly _tag: 'Info';
      readonly glyph: Glyph;
      readonly title: string;
      readonly mono?: boolean;
      readonly description: string;
      readonly meta: ReadonlyArray<MetaRow>;
    }
  /** The serif reader; the body is fetched from `/notes/<id>.json` when shown. */
  | { readonly _tag: 'Note'; readonly noteId: string; readonly dateLine: string }
  | {
      readonly _tag: 'Pass';
      readonly role: Role;
      readonly description: string;
      readonly meta: ReadonlyArray<MetaRow>;
    };

/** A labelled action. */
export type Run = { readonly label: string; readonly action: Action };

/** One palette row. */
export type Command = {
  /** Unique across the whole registry; also the row's DOM id. */
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Set in monospace (repo names). */
  readonly mono?: boolean;
  readonly glyph: Glyph;
  /** Extra words that find this row (subtitle and synonyms; the title is always searched). */
  readonly keywords: string;
  /** ↵ */
  readonly primary: Run;
  /** ⌘↵ */
  readonly secondary?: Run;
  readonly trailing: Trailing;
  readonly detail: Detail;
};

/** A titled group of rows. */
export type Section = {
  readonly heading: string;
  readonly commands: ReadonlyArray<Command>;
};

/** A view the palette can push, like a Raycast extension. */
export type ViewSpec = {
  /** Breadcrumb and footer title. */
  readonly title: string;
  readonly placeholder: string;
  readonly section: Section;
};

/** Everything the palette shows. */
export type CommandRegistry = {
  /** ⌥1–⌥5, shown only while the query is empty. */
  readonly suggestions: Section;
  /** Navigate, Contact, System. */
  readonly groups: ReadonlyArray<Section>;
  readonly views: {
    readonly Notes: ViewSpec;
    readonly Career: ViewSpec;
    readonly Projects: ViewSpec;
  };
};

const icon = (name: IconName): Glyph => ({ _tag: 'Icon', name });
const live = (key: LiveValue): MetaRow['value'] => ({ _tag: 'Live', key });
const row = (label: string, value: string): MetaRow => ({ label, value });
const info = (
  glyph: Glyph,
  title: string,
  description: string,
  meta: ReadonlyArray<MetaRow>,
): Detail => ({ _tag: 'Info', glyph, title, description, meta });
const kind = (text: string, count?: number): Trailing =>
  count === undefined ? { _tag: 'Text', text } : { _tag: 'Text', text, count };
const bare = (href: string): string => href.replace(/^https?:\/\//, '');
const thousands = (n: number): string => n.toLocaleString('en-AU');

const dateIn = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  // Note dates are calendar dates (midnight UTC); format them in UTC so they never shift.
  date.toLocaleDateString('en-AU', { timeZone: 'UTC', ...options });
const shortDate = (date: Date): string =>
  dateIn(date, { day: 'numeric', month: 'short', year: 'numeric' });

const COPIED = 'Copied to Clipboard';

/**
 * Build the palette's registry.
 *
 * @param input - Notes and GitHub activity, gathered by the caller at build time.
 * @returns Suggestions, the root groups and the three views.
 */
export function buildCommands(input: CommandInputs): CommandRegistry {
  const { notes, repos, stats, now } = input;
  const [latest] = notes;
  const email = profile.email;
  const github = social('github');
  const linkedin = social('linkedin');
  const x = social('x');
  const kodo = career.find((r) => r.id === 'kodo') ?? career[0];
  const { camera } = profile;

  const sendEmail: Action = { _tag: 'SendEmail' };
  const copyEmail: Action = { _tag: 'Copy', text: email, confirmation: COPIED };
  const notesView: Action = { _tag: 'OpenPalette', view: { _tag: 'Notes' } };
  const careerView: Action = { _tag: 'OpenPalette', view: { _tag: 'Career' } };
  const projectsView: Action = { _tag: 'OpenPalette', view: { _tag: 'Projects' } };
  const coffeeMeta = [
    row('When', 'Weekday mornings'),
    row('Where', 'Sydney CBD'),
    { label: 'Next free', value: live('nextFreeMorning') },
  ];

  /* Suggestions (⌥1–⌥5) ------------------------------------------------------------------- */
  const suggested: ReadonlyArray<Omit<Command, 'trailing'>> = [
    ...(latest
      ? [
          {
            id: 's-read',
            title: 'Read Latest Note',
            subtitle: latest.title,
            glyph: icon('note'),
            keywords: latest.title,
            primary: {
              label: 'Read Note',
              action: {
                _tag: 'OpenPalette',
                view: { _tag: 'Notes', noteId: latest.id, reading: true },
              },
            },
            secondary: { label: 'All Notes', action: notesView },
            detail: info(icon('note'), 'Read Latest Note', latest.preview, [
              row('Title', latest.title),
              row('Published', shortDate(latest.date)),
              row('Length', `${latest.words} words`),
            ]),
          } satisfies Omit<Command, 'trailing'>,
        ]
      : []),
    {
      id: 's-email',
      title: 'Email Josh',
      subtitle: email,
      glyph: icon('mail'),
      keywords: `${email} contact`,
      primary: { label: 'Open Mail', action: sendEmail },
      secondary: { label: 'Copy Email', action: copyEmail },
      detail: info(
        icon('mail'),
        'Email Josh',
        'Inbox is open: platforms, AI tooling, developer experience, or a camera recommendation. Usually replies within a day.',
        [row('To', email), row('Based in', profile.location)],
      ),
    },
    {
      id: 's-work',
      title: 'View Engineering Work',
      subtitle: `${career.length} roles`,
      glyph: icon('wallet'),
      keywords: 'career passes',
      primary: { label: 'Open Passes', action: careerView },
      secondary: {
        label: `Open ${kodo?.company ?? 'Kodo'} Pass`,
        action: { _tag: 'OpenPalette', view: { _tag: 'Career', roleId: 'kodo' } },
      },
      detail: info(
        icon('wallet'),
        'View Engineering Work',
        'Four roles, startup to enterprise — one pass each, in the company’s own colours.',
        career.map((r) => row(r.company, tenureYears(r.tenure))),
      ),
    },
    {
      id: 's-github',
      title: 'Open GitHub',
      subtitle: github.handle,
      glyph: icon('github'),
      keywords: `${github.handle} code`,
      primary: { label: 'Open in Browser', action: { _tag: 'OpenLink', href: github.href } },
      secondary: { label: 'Browse Projects', action: projectsView },
      detail: info(
        icon('github'),
        'Open GitHub',
        'Repos, stars and the occasional half-finished idea.',
        [
          row('Profile', bare(github.href)),
          row('Last push', repos?.[0] ? recencyLong(repos[0].pushedAt, now) : '—'),
        ],
      ),
    },
    {
      id: 's-coffee',
      title: 'Book a Coffee',
      subtitle: 'Pick a weekday morning',
      glyph: icon('coffee'),
      keywords: 'meet chat',
      primary: { label: 'Pick a Morning', action: { _tag: 'PickCoffee' } },
      secondary: { label: 'Ask for the Next Free Morning', action: { _tag: 'AskForCoffee' } },
      detail: info(
        icon('coffee'),
        'Book a Coffee',
        'Two weeks of weekday mornings in Sydney. Pick one and it drafts the email — or a call from anywhere.',
        coffeeMeta,
      ),
    },
  ];
  const suggestions: Section = {
    heading: 'Suggestions',
    commands: suggested.map((c, i) => ({
      ...c,
      trailing: { _tag: 'Keys', keys: ['⌥', String(i + 1)] },
    })),
  };

  /* Navigate ------------------------------------------------------------------------------ */
  const languages = [...new Set((repos ?? []).map((r) => r.language))].slice(0, 3);
  const navigate: Section = {
    heading: 'Navigate',
    commands: [
      {
        id: 'c-notes',
        title: 'Browse Notes',
        glyph: icon('folder'),
        keywords: 'read writing blog posts',
        primary: { label: 'Open Notes', action: notesView },
        secondary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'notes' } },
        trailing: kind('View', notes.length),
        detail: info(
          icon('folder'),
          'Browse Notes',
          'Short notes, mostly about software and the things around it.',
          [
            row('Notes', String(notes.length)),
            ...(latest
              ? [row('Latest', latest.title), row('Updated', shortDate(latest.date))]
              : []),
          ],
        ),
      },
      {
        id: 'c-career',
        title: 'Browse Engineering',
        glyph: icon('wallet'),
        keywords: 'career work history jobs roles passes cv resume kodo nib jala freelance',
        primary: { label: 'Open Passes', action: careerView },
        secondary: {
          label: 'Show Widget',
          action: { _tag: 'ShowWidget', widget: 'engineering' },
        },
        trailing: kind('View', career.length),
        detail: info(
          icon('wallet'),
          'Browse Engineering',
          'Every role as a pass.',
          career.map((r) => row(r.company, r.title)),
        ),
      },
      ...(kodo
        ? [
            {
              id: 'c-kodo',
              title: `View ${kodo.company} Pass`,
              subtitle: kodo.title,
              glyph: icon('wallet'),
              keywords: `${kodo.title} career current job work engineering`,
              primary: {
                label: 'Open Pass',
                action: { _tag: 'OpenPalette', view: { _tag: 'Career', roleId: kodo.id } },
              },
              trailing: kind('View'),
              detail: info(icon('wallet'), `View ${kodo.company} Pass`, kodo.summary, [
                row('Since', kodo.tenure.start),
                row('Formerly', kodo.formerly ?? '—'),
              ]),
            } satisfies Command,
          ]
        : []),
      {
        id: 'c-projects',
        title: 'Browse Projects',
        glyph: icon('code'),
        keywords: 'repos side open source github code',
        primary: { label: 'Open Projects', action: projectsView },
        secondary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'projects' } },
        trailing: kind('View', repos?.length),
        detail: info(
          icon('code'),
          'Browse Projects',
          languages.length > 0
            ? `Things I build to learn — lately ${languages.join(', ')}. Live from GitHub, most recently pushed first.`
            : 'Things I build to learn. Live from GitHub, most recently pushed first.',
          (repos ?? []).slice(0, 4).map((r) => row(r.name, recencyLong(r.pushedAt, now))),
        ),
      },
      {
        id: 'w-now',
        title: 'Go to Now',
        subtitle: 'What I’m up to',
        glyph: icon('sparkles'),
        keywords: 'building learning shooting current',
        primary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'now' } },
        trailing: kind('Widget'),
        detail: info(icon('sparkles'), 'Go to Now', 'A /now page, as a widget.', [
          row('Building', profile.now.building),
          row('Learning', profile.now.learning),
          row('Shooting', profile.now.shooting),
        ]),
      },
      {
        id: 'w-golden',
        title: 'Go to Golden Hour',
        subtitle: `${camera.body} · 35mm f/1.4 GM`,
        glyph: icon('sunMax'),
        keywords: 'sunset photography light sun camera sony lens shooting photos',
        primary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'golden' } },
        trailing: kind('Widget'),
        detail: info(
          icon('sunMax'),
          'Go to Golden Hour',
          `When I’m not shipping, I’m usually on the coast with the ${camera.body} and ${camera.lens}, waiting for the sun to drop below 6°.`,
          [
            { label: 'Golden hour', value: live('goldenHour') },
            { label: 'Sunset', value: live('sunset') },
            row('Body', camera.body),
            row('Lens', camera.lens),
          ],
        ),
      },
      {
        id: 'w-terminal',
        title: 'Go to Terminal',
        subtitle: 'An honest little zsh',
        glyph: icon('terminal'),
        keywords: 'shell cli command zsh',
        primary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'terminal' } },
        secondary: { label: 'Run help', action: { _tag: 'RunInTerminal', command: 'help' } },
        trailing: kind('Widget'),
        detail: info(
          icon('terminal'),
          'Go to Terminal',
          'Type help. Tab completes, ↑ ↓ for history, ⌃L clears.',
          [row('Shell', 'zsh'), row('Try', 'sudo hire josh')],
        ),
      },
      {
        id: 'w-commits',
        title: 'Go to Commits',
        subtitle: 'A year on GitHub',
        glyph: icon('chart'),
        keywords: 'stocks chart contributions github activity',
        primary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'commits' } },
        trailing: kind('Widget'),
        detail: info(
          icon('chart'),
          'Go to Commits',
          'Real numbers, fetched when the site was built.',
          stats
            ? [
                row('This year', thousands(stats.total)),
                row('Last 30 days', thousands(stats.last30)),
                row('Busiest week', thousands(stats.busiestWeek)),
              ]
            : [],
        ),
      },
      {
        id: 'w-github',
        title: 'Go to Contributions',
        subtitle: 'Heatmap',
        glyph: icon('github'),
        keywords: 'github graph heatmap activity',
        primary: {
          label: 'Show Widget',
          action: { _tag: 'ShowWidget', widget: 'contributions' },
        },
        secondary: { label: 'Open GitHub', action: { _tag: 'OpenLink', href: github.href } },
        trailing: kind('Widget'),
        detail: info(
          icon('github'),
          'Go to Contributions',
          'Day-job platforms, plus weekend side projects.',
          stats
            ? [row('Contributions', thousands(stats.total)), row('Streak', `${stats.streak} days`)]
            : [],
        ),
      },
    ],
  };

  /* Contact ------------------------------------------------------------------------------- */
  const contact: Section = {
    heading: 'Contact',
    commands: [
      {
        id: 'c-email',
        title: 'Email Josh',
        subtitle: email,
        glyph: icon('mail'),
        keywords: `${email} contact hire message mail`,
        primary: { label: 'Open Mail', action: sendEmail },
        secondary: { label: 'Copy Email', action: copyEmail },
        trailing: kind('Command'),
        detail: info(icon('mail'), 'Email Josh', 'Usually replies within a day.', [
          row('To', email),
        ]),
      },
      {
        id: 'c-copy',
        title: 'Copy Email Address',
        glyph: icon('copy'),
        keywords: 'clipboard contact',
        primary: { label: 'Copy to Clipboard', action: copyEmail },
        trailing: kind('Command'),
        detail: info(icon('copy'), 'Copy Email Address', 'Straight to your clipboard.', [
          row('Email', email),
        ]),
      },
      {
        id: 'c-coffee',
        title: 'Book a Coffee',
        subtitle: 'Sydney CBD',
        glyph: icon('coffee'),
        keywords: 'meet chat calendar availability',
        primary: { label: 'Pick a Morning', action: { _tag: 'PickCoffee' } },
        secondary: { label: 'Ask for the Next Free Morning', action: { _tag: 'AskForCoffee' } },
        trailing: kind('Command'),
        detail: info(
          icon('coffee'),
          'Book a Coffee',
          'Weekday mornings in Sydney, or a call from anywhere.',
          coffeeMeta,
        ),
      },
      {
        id: 'c-github',
        title: 'Open GitHub',
        subtitle: github.handle,
        glyph: icon('github'),
        keywords: `${github.handle} code repos profile`,
        primary: { label: 'Open in Browser', action: { _tag: 'OpenLink', href: github.href } },
        secondary: {
          label: 'Copy Link',
          action: { _tag: 'Copy', text: github.href, confirmation: COPIED },
        },
        trailing: kind('Link'),
        detail: info(
          icon('github'),
          'Open GitHub',
          'Repos, stars and the occasional half-finished idea.',
          [row('Profile', bare(github.href))],
        ),
      },
      {
        id: 'c-linkedin',
        title: 'Open LinkedIn',
        subtitle: linkedin.handle,
        glyph: icon('linkedin'),
        keywords: `${linkedin.handle} profile cv network`,
        primary: { label: 'Open in Browser', action: { _tag: 'OpenLink', href: linkedin.href } },
        trailing: kind('Link'),
        detail: info(icon('linkedin'), 'Open LinkedIn', 'The formal version.', [
          row('Profile', bare(linkedin.href)),
        ]),
      },
      {
        id: 'c-x',
        title: 'Open X',
        subtitle: x.handle,
        glyph: icon('x'),
        keywords: `${x.handle} twitter social`,
        primary: { label: 'Open in Browser', action: { _tag: 'OpenLink', href: x.href } },
        trailing: kind('Link'),
        detail: info(icon('x'), 'Open X', 'Occasionally.', [row('Profile', bare(x.href))]),
      },
    ],
  };

  /* System -------------------------------------------------------------------------------- */
  const terminal = (
    id: string,
    command: string,
    keywords: string,
    description: string,
  ): Command => ({
    id,
    title: command,
    subtitle: 'Run in Terminal',
    glyph: icon('terminal'),
    keywords: `run in terminal ${keywords}`,
    primary: { label: 'Run in Terminal', action: { _tag: 'RunInTerminal', command } },
    trailing: kind('Terminal'),
    detail: info(icon('terminal'), command, description, [row('Command', command)]),
  });
  const system: Section = {
    heading: 'System',
    commands: [
      terminal('c-whoami', 'whoami', 'about bio shell', 'The short version, typed out for you.'),
      terminal('c-hire', 'sudo hire josh', 'job recruit', 'Requires a password. Probably.'),
    ],
  };

  /* Views --------------------------------------------------------------------------------- */
  const noteRows: ReadonlyArray<Command> = notes.map((n) => ({
    id: `note-${n.id}`,
    title: n.title,
    glyph: { _tag: 'Icon', name: 'note', ghost: true },
    keywords: n.text.slice(0, 200),
    primary: {
      label: 'Read Note',
      action: { _tag: 'OpenPalette', view: { _tag: 'Notes', noteId: n.id, reading: true } },
    },
    secondary: { label: 'Show Widget', action: { _tag: 'ShowWidget', widget: 'notes' } },
    trailing: {
      _tag: 'Text',
      text: dateIn(n.date, { day: 'numeric', month: 'short', year: '2-digit' }),
    },
    detail: {
      _tag: 'Note',
      noteId: n.id,
      dateLine: `${dateIn(n.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '')} · ${n.words} words`,
    },
  }));

  const passRows: ReadonlyArray<Command> = career.map((r) => ({
    id: `role-${r.id}`,
    title: r.company,
    subtitle: r.title,
    glyph: {
      _tag: 'Brand',
      bg: r.brand.bg,
      src: r.brand.mark,
      avatar: r.brand.logo._tag === 'avatar',
    },
    keywords: `${r.title} ${r.kind} ${r.formerly ?? ''} career`,
    primary: {
      label: `Visit ${r.brand.site}`,
      action: { _tag: 'OpenLink', href: `https://${r.brand.site}` },
    },
    secondary: { label: 'Email Josh', action: sendEmail },
    trailing: { _tag: 'Text', text: tenureYears(r.tenure) },
    detail: {
      _tag: 'Pass',
      role: r,
      description: r.summary,
      meta: [
        row('Company', r.formerly ? `${r.company} (formerly ${r.formerly})` : r.company),
        row('Type', r.kind),
        row('Dates', `${r.tenure.start} – ${r.tenure._tag === 'Current' ? 'Now' : r.tenure.end}`),
        row('Stack', r.stack.join(', ')),
      ],
    },
  }));

  const projectRows: ReadonlyArray<Command> = (repos ?? []).map((p) => {
    const glyph: Glyph = { _tag: 'Language', color: languageColor(p.language) };
    const pushed = recencyLong(p.pushedAt, now);
    return {
      id: `proj-${p.name}`,
      title: p.name,
      subtitle: p.language,
      mono: true,
      glyph,
      keywords: `${p.language} ${p.blurb}`,
      primary: { label: 'Open on GitHub', action: { _tag: 'OpenLink', href: p.url } },
      secondary: {
        label: 'Open from Terminal',
        action: { _tag: 'RunInTerminal', command: `open ${p.name}` },
      },
      trailing: {
        _tag: 'Text',
        text: recencyShort(p.pushedAt, now),
        hint: `Updated ${pushed}`,
        ...(p.stars > 0 ? { stars: p.stars } : {}),
      },
      detail: {
        _tag: 'Info',
        glyph,
        title: p.name,
        mono: true,
        description: p.blurb,
        meta: [
          row('Language', p.language),
          row('Last push', pushed),
          ...(p.stars > 0 ? [row('Stars', String(p.stars))] : []),
          row('Repository', bare(p.url)),
        ],
      },
    };
  });

  return {
    suggestions,
    groups: [navigate, contact, system],
    views: {
      Notes: {
        title: 'Notes',
        placeholder: 'Filter notes…',
        section: { heading: 'Notes', commands: noteRows },
      },
      Career: {
        title: 'Engineering',
        placeholder: 'Filter roles…',
        section: { heading: 'Passes', commands: passRows },
      },
      Projects: {
        title: 'Projects',
        placeholder: 'Filter projects…',
        section: { heading: 'Projects · recently pushed', commands: projectRows },
      },
    },
  };
}
