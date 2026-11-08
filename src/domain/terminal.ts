/**
 * The terminal widget's shell: a tiny, honest zsh. Parses a command line, evaluates it against
 * the facts about Josh, and returns what to print and do as a list of steps — the island
 * interprets them (typing, pauses, links, toasts). Also owns history recall and tab completion.
 *
 * Pure: the caller supplies `now` and the facts; nothing here touches the DOM or the clock.
 */

/** How a run of output text is coloured. */
export type Tone = 'plain' | 'strong' | 'dim' | 'accent' | 'warn' | 'ok' | 'error';

/** A run of output: text in a tone, or a link. */
export type Span =
  | { readonly _tag: 'Text'; readonly text: string; readonly tone: Tone }
  | { readonly _tag: 'Link'; readonly text: string; readonly href: string };

/** One printed line: the prompt with what was typed, or output. */
export type Line =
  | { readonly _tag: 'Echo'; readonly input: string }
  | { readonly _tag: 'Output'; readonly spans: ReadonlyArray<Span> };

/** Something the terminal asks the page to do. */
export type Effect =
  | { readonly _tag: 'OpenLink'; readonly href: string }
  | { readonly _tag: 'BrowseProjects' }
  | { readonly _tag: 'Toast'; readonly message: string };

/** One step of a command's run, in order. */
export type Step =
  | { readonly _tag: 'Print'; readonly line: Line }
  | { readonly _tag: 'Pause'; readonly ms: number }
  | { readonly _tag: 'Clear' }
  | { readonly _tag: 'Effect'; readonly effect: Effect };

/** A project `ls` lists and `open` opens. */
export type Project = {
  readonly name: string;
  readonly lang: string;
  readonly blurb: string;
  readonly href: string;
};

/** Everything the shell knows about Josh. */
export type Facts = {
  readonly name: string;
  readonly title: string;
  readonly company: string;
  readonly location: string;
  readonly timeZone: string;
  readonly email: string;
  /** One line on the current role. */
  readonly summary: string;
  /** `cat now`, in order, e.g. `building → AI tooling…`. */
  readonly now: ReadonlyArray<readonly [label: string, value: string]>;
  readonly socials: ReadonlyArray<{
    readonly label: string;
    readonly href: string;
    readonly handle: string;
  }>;
  /** The year Josh started shipping, for `neofetch`'s uptime. */
  readonly since: number;
  readonly camera: string;
  readonly projects: ReadonlyArray<Project>;
};

/** How wide the terminal is: narrow terminals skip project blurbs in `ls`. */
export type Width = 'wide' | 'narrow';

/** What a command runs against. */
export type Env = {
  readonly facts: Facts;
  readonly now: Date;
  readonly width: Width;
};

/** Command history and the ↑/↓ cursor into it. */
export type Session = {
  readonly history: ReadonlyArray<string>;
  /** `history.length` means "past the newest entry" (an empty line). */
  readonly cursor: number;
};

/** The result of pressing Tab. */
export type Completion =
  | { readonly _tag: 'Completed'; readonly value: string }
  | {
      readonly _tag: 'Ambiguous';
      readonly value: string;
      readonly candidates: ReadonlyArray<string>;
    };

/** The chips under the terminal. */
export const suggestions: ReadonlyArray<string> = [
  'help',
  'ls projects',
  'cat now',
  'neofetch',
  'sudo hire josh',
];

/** A fresh session with no history. */
export const emptySession: Session = { history: [], cursor: 0 };

const text = (t: string, tone: Tone = 'plain'): Span => ({ _tag: 'Text', text: t, tone });
const link = (t: string, href: string): Span => ({ _tag: 'Link', text: t, href });
const out = (...spans: ReadonlyArray<Span>): Step => ({
  _tag: 'Print',
  line: { _tag: 'Output', spans },
});
const pause = (ms: number): Step => ({ _tag: 'Pause', ms });
const effect = (e: Effect): Step => ({ _tag: 'Effect', effect: e });
const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(1, n - s.length));
const bare = (href: string): string => href.replace(/^https?:\/\//, '').replace(/^mailto:/, '');

/** The first sentence of a blurb, clipped to `n` characters. */
function firstSentence(blurb: string, n: number): string {
  const first = (blurb.split(/\. | — /)[0] ?? '').replace(/\.$/, '');
  return first.length > n ? `${first.slice(0, n - 1).trimEnd()}…` : first;
}

type Command = (
  args: ReadonlyArray<string>,
  env: Env,
  history: ReadonlyArray<string>,
) => ReadonlyArray<Step>;

const help: Command = () => [
  out(text('Available commands', 'strong')),
  ...(
    [
      ['whoami', 'who is this guy'],
      ['ls projects', 'things I build to learn'],
      ['cat now', 'what I’m up to'],
      ['open <name>', 'rq, github, linkedin…'],
      ['rq send', 'try my API client'],
      ['neofetch', 'system info, sort of'],
      ['contact', 'say hi'],
      ['history', 'what you’ve typed'],
      ['clear', '⌃L works too'],
    ] as const
  ).map(([cmd, what]) => out(text(`  ${pad(cmd, 16)}`), text(what, 'dim'))),
];

const whoami: Command = (_, { facts }) => [
  out(
    text(facts.name, 'strong'),
    text(` — ${facts.title} at ${facts.company} · ${facts.location}`),
  ),
  out(text(facts.summary, 'dim')),
];

const ls: Command = (args, { facts, width }) => {
  const [target] = args;
  if (target !== undefined && !target.startsWith('proj')) {
    return [out(text(`ls: ${target}: No such file or directory`, 'error'))];
  }
  const nameWidth = Math.max(0, ...facts.projects.map((p) => p.name.length)) + 3;
  return facts.projects.map((p) =>
    out(
      text(pad(`${p.name}/`, nameWidth), 'accent'),
      text(pad(p.lang, 12), 'warn'),
      ...(width === 'wide' ? [text(firstSentence(p.blurb, 46), 'dim')] : []),
    ),
  );
};

const cat: Command = (args, { facts }) => {
  const [file] = args;
  if (file === undefined || !file.startsWith('now')) {
    return [
      out(text(`cat: ${file ?? ''}: No such file — try `, 'error'), text('cat now', 'strong')),
    ];
  }
  return facts.now.map(([label, value]) => out(text(pad(label, 10), 'ok'), text(value)));
};

const open: Command = (args, { facts }) => {
  const name = (args[0] ?? '').toLowerCase();
  if (!name) return [out(text('usage: open <project|github|linkedin|x>', 'error'))];
  if (name === 'rq') {
    return [out(text('Opening rq…', 'dim')), pause(260), effect({ _tag: 'BrowseProjects' })];
  }
  const href =
    facts.projects.find((p) => p.name.toLowerCase().startsWith(name))?.href ??
    facts.socials.find((s) => s.label.toLowerCase() === name)?.href;
  if (!href) return [out(text(`open: ${name}: not found`, 'error'))];
  return [out(text('Opening ', 'dim'), link(bare(href), href)), effect({ _tag: 'OpenLink', href })];
};

const rq: Command = (args) => {
  if (args[0] !== 'send') {
    return [
      out(text('rq', 'strong'), text(' — OpenAPI-native API client')),
      out(text('  usage: ', 'dim'), text('rq send GET /pets/1')),
    ];
  }
  const method = (args[1] ?? 'GET').toUpperCase();
  const raw = args.slice(2).join(' ') || '/pets/1';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return [
    out(text(`→ ${method} https://petstore.example${path}`, 'dim')),
    pause(420),
    out(text('200 OK', 'ok'), text(' · 12ms · application/json', 'dim')),
    out(
      text('{ '),
      text('"id"', 'accent'),
      text(': 1, '),
      text('"name"', 'accent'),
      text(': '),
      text('"Mochi"', 'warn'),
      text(', '),
      text('"tag"', 'accent'),
      text(': '),
      text('"cat"', 'warn'),
      text(' }'),
    ),
  ];
};

const neofetch: Command = (_, { facts, now }) => {
  const logo = ['   ▗▄▄▄▄▖', '  ▐▌   ▐▌', '  ▐▌ ◉ ▐▌', '  ▐▌   ▐▌', '   ▝▀▀▀▀▘'];
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['OS', `${facts.location} (AEST/AEDT)`],
    ['Host', `${facts.title} @ ${facts.company}`],
    ['Uptime', `${now.getUTCFullYear() - facts.since} years shipping`],
    ['Shell', 'zsh + way too many aliases'],
    ['Editor', 'Neovim (config: never finished)'],
    ['Langs', 'TypeScript · Go · Rust · C'],
    ['Camera', facts.camera],
  ];
  return rows.map(([k, v], i) =>
    out(text(pad(logo[i] ?? '', 12), 'accent'), text(pad(k, 8), 'ok'), text(v)),
  );
};

const contact: Command = (_, { facts }) => [
  out(link(facts.email, `mailto:${facts.email}`)),
  out(
    ...facts.socials.flatMap((s, i) => [
      ...(i > 0 ? [text('   ')] : []),
      link(s.label.toLowerCase(), s.href),
      text(` ${s.handle}`, 'dim'),
    ]),
  ),
];

const sudo: Command = (args, { facts }) => {
  if (args.join(' ') !== 'hire josh') {
    return [out(text('josh is not in the sudoers file. This incident will be reported.', 'error'))];
  }
  return [
    out(text('[sudo] password for recruiter:', 'dim'), text(' ••••••••')),
    pause(520),
    out(
      text('✓ Permission granted.', 'ok'),
      text(' Say hi → '),
      link(facts.email, `mailto:${facts.email}`),
    ),
    effect({ _tag: 'Toast', message: 'Permission granted' }),
  ];
};

const date: Command = (_, { facts, now }) => [
  out(
    text(
      now.toLocaleString('en-AU', {
        timeZone: facts.timeZone,
        dateStyle: 'full',
        timeStyle: 'short',
      }),
    ),
    text(' AET', 'dim'),
  ),
];

const history: Command = (_, __, past) =>
  past.map((line, i) => out(text(`${String(i + 1).padStart(5)}  `, 'dim'), text(line)));

const say =
  (message: string, tone: Tone = 'dim'): Command =>
  () => [out(text(message, tone))];

const commands: ReadonlyMap<string, Command> = new Map(
  Object.entries({
    help,
    whoami,
    about: whoami,
    ls,
    cat,
    open,
    rq,
    neofetch,
    contact,
    email: contact,
    sudo,
    date,
    history,
    clear: () => [{ _tag: 'Clear' }],
    exit: say('logout… just kidding. There’s more to scroll.'),
    pwd: say('/Users/josh/sydney', 'plain'),
    echo: (args) => [out(text(args.join(' ')))],
    cd: say('You’re already home.'),
    vim: say('You can check out any time you like, but you can never leave.'),
    nvim: say('You can check out any time you like, but you can never leave.'),
  } satisfies Record<string, Command>),
);

/** Every command name, for completion. */
const names = [...commands.keys()];

/**
 * Run a command line: echo it, record it in history, and evaluate it.
 *
 * @param session - History before this line.
 * @param input - What was typed.
 * @param env - The facts, the current instant and the terminal's width.
 * @returns The new session and the steps to play.
 */
export function submit(
  session: Session,
  input: string,
  env: Env,
): { readonly session: Session; readonly steps: ReadonlyArray<Step> } {
  const line = input.trim();
  const echo: Step = { _tag: 'Print', line: { _tag: 'Echo', input: line } };
  if (!line) return { session: { ...session, cursor: session.history.length }, steps: [echo] };

  const past = [...session.history, line];
  const next: Session = { history: past, cursor: past.length };
  const [name = '', ...args] = line.split(/\s+/);
  // A Map, not an object: `constructor` or `__proto__` must be "command not found".
  const command = commands.get(name.toLowerCase());
  const steps = command
    ? command(args, env, past)
    : [out(text(`zsh: command not found: ${name}`, 'error'), text(' — try ', 'dim'), text('help'))];
  return { session: next, steps: [echo, ...steps] };
}

/**
 * Step through history with ↑ (older) or ↓ (newer).
 *
 * @param session - The current session.
 * @param direction - Which way to move.
 * @returns The moved session and the line to show (empty past the newest entry).
 */
export function recall(
  session: Session,
  direction: 'older' | 'newer',
): { readonly session: Session; readonly value: string } {
  const cursor = Math.max(
    0,
    Math.min(session.history.length, session.cursor + (direction === 'older' ? -1 : 1)),
  );
  return { session: { ...session, cursor }, value: session.history[cursor] ?? '' };
}

/**
 * Tab-complete a partial line: command names first, then each command's arguments.
 *
 * @param input - The line so far.
 * @param facts - For project and profile names.
 * @returns The completed line, or the line unchanged with the candidates to list.
 */
export function complete(input: string, facts: Facts): Completion {
  const parts = input.split(/\s+/);
  const [head = '', ...rest] = parts;
  if (rest.length === 0) {
    const hits = names.filter((n) => n.startsWith(head));
    const [only] = hits;
    if (hits.length === 1 && only !== undefined) return { _tag: 'Completed', value: `${only} ` };
    return hits.length > 1
      ? { _tag: 'Ambiguous', value: input, candidates: hits }
      : { _tag: 'Completed', value: input };
  }
  const pool =
    head === 'open'
      ? [...facts.projects.map((p) => p.name), ...facts.socials.map((s) => s.label.toLowerCase())]
      : head === 'ls'
        ? ['projects']
        : head === 'cat'
          ? ['now']
          : head === 'sudo'
            ? ['hire josh']
            : [];
  const last = rest.at(-1) ?? '';
  const hits = pool.filter((n) => n.startsWith(last));
  const [only] = hits;
  if (hits.length === 1 && only !== undefined) {
    return { _tag: 'Completed', value: [head, ...rest.slice(0, -1), only].join(' ') };
  }
  return hits.length > 1
    ? { _tag: 'Ambiguous', value: input, candidates: hits }
    : { _tag: 'Completed', value: input };
}

/**
 * The line printed when the terminal opens.
 *
 * @param now - The current instant.
 * @param timeZone - Josh's zone.
 * @returns `Last login: Sun, 8 Nov on ttys001`.
 */
export function greeting(now: Date, timeZone: string): Line {
  const day = now.toLocaleDateString('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return { _tag: 'Output', spans: [text(`Last login: ${day} on ttys001`, 'dim')] };
}

/** The hint printed after the intro. */
export const hint: Line = {
  _tag: 'Output',
  spans: [
    text('Type ', 'dim'),
    text('help', 'strong'),
    text(' — or tap a suggestion below.', 'dim'),
  ],
};
