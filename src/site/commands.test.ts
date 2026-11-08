import { describe, expect, it } from 'vitest';

import { showcase, type Listing } from '~/domain/github/repo';
import { buildCommands, type Command, type CommandRegistry, type NoteSummary } from './commands';
import { office } from './office';

const now = new Date('2026-11-08T03:00:00Z');

const note = (id: string, date: string): NoteSummary => ({
  id,
  title: `Note ${id}`,
  date: new Date(date),
  words: 120,
  preview: 'The opening…',
  text: 'The opening words of the note',
});

const listing = (name: string, pushed: string, stars = 0): Listing => ({
  name,
  owner: 'joshgermon',
  fork: false,
  archived: false,
  description: `${name} does things.`,
  language: 'Go',
  url: `https://github.com/joshgermon/${name}`,
  stars,
  pushedAt: new Date(pushed),
});

const repos = showcase(
  [listing('rq', '2026-10-20T00:00:00Z', 3), listing('bksd', '2026-06-01T00:00:00Z')],
  {
    owner: 'joshgermon',
    hidden: new Set(),
    hiddenPrefixes: [],
    blurbs: new Map(),
    limit: 7,
  },
);

const notes = [note('03-09-22', '2022-09-03'), note('02-09-22', '2022-09-02')];
const stats = { total: 1234, last30: 56, streak: 4, busiestWeek: 78 };

const all = (r: CommandRegistry): ReadonlyArray<Command> => [
  ...r.suggestions.commands,
  ...r.groups.flatMap((g) => g.commands),
  ...Object.values(r.views).flatMap((v) => v.section.commands),
];

describe('buildCommands', () => {
  const registry = buildCommands({ notes, repos, stats, now });

  it('gives every row a unique id', () => {
    const ids = all(registry).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leads with five suggestions bound to ⌥1–⌥5', () => {
    expect(registry.suggestions.commands.map((c) => c.trailing)).toEqual(
      [1, 2, 3, 4, 5].map((n) => ({ _tag: 'Keys', keys: ['⌥', String(n)] })),
    );
  });

  it('groups the root as Navigate, Office, Contact, System — with no backdrop command', () => {
    expect(registry.groups.map((g) => g.heading)).toEqual([
      'Navigate',
      office.title,
      'Contact',
      'System',
    ]);
    expect(all(registry).some((c) => /backdrop/i.test(`${c.title} ${c.keywords}`))).toBe(false);
  });

  it('opens the latest note straight into the reader', () => {
    expect(registry.suggestions.commands[0]?.primary.action).toEqual({
      _tag: 'OpenPalette',
      view: { _tag: 'Notes', noteId: '03-09-22', reading: true },
    });
  });

  it('formats note dates as calendar dates, whatever the build machine’s zone', () => {
    const [first] = registry.views.Notes.section.commands;
    expect(first?.detail).toEqual({
      _tag: 'Note',
      noteId: '03-09-22',
      dateLine: 'Saturday 3 September 2022 · 120 words',
    });
  });

  it('lists projects newest first with stars and recency', () => {
    const rows = registry.views.Projects.section.commands;
    expect(rows.map((r) => r.title)).toEqual(['rq', 'bksd']);
    expect(rows[0]?.trailing).toEqual({
      _tag: 'Text',
      text: '3w',
      hint: 'Updated 3 weeks ago',
      stars: 3,
    });
  });

  it('degrades without GitHub: no project rows, no invented numbers', () => {
    const offline = buildCommands({ notes, repos: undefined, stats: undefined, now });
    expect(offline.views.Projects.section.commands).toEqual([]);
    const commits = offline.groups[0]?.commands.find((c) => c.id === 'w-commits');
    expect(commits?.detail._tag === 'Info' && commits.detail.meta).toEqual([]);
  });
});

describe('office commands', () => {
  const registry = buildCommands({ notes, repos, stats, now });
  const officeGroup = registry.groups.find((g) => g.heading === office.title);

  it('looks at each listed object through a LookAt action', () => {
    const actions = officeGroup?.commands.map((c) => c.primary.action) ?? [];
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action._tag).toBe('LookAt');
    expect(actions).toContainEqual({ _tag: 'LookAt', target: 'Lamp' });
  });

  it('never shows placeholder copy in the palette', () => {
    for (const c of officeGroup?.commands ?? []) {
      expect(c.detail._tag === 'Info' && c.detail.description).not.toMatch(/todo/i);
    }
  });
});
