import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  complete,
  emptySession,
  greeting,
  recall,
  submit,
  type Env,
  type Facts,
  type Line,
  type Session,
  type Step,
} from './terminal';

const facts: Facts = {
  name: 'Joshua Germon',
  title: 'Founding Engineer',
  company: 'Kodo',
  location: 'Sydney, Australia',
  timeZone: 'Australia/Sydney',
  email: 'josh@example.com',
  summary: 'Early engineer at an ad-tech startup.',
  now: [
    ['building', 'AI tooling'],
    ['learning', 'Rust'],
    ['shooting', 'Sony A7 IV · 35mm f/1.4 GM'],
  ],
  socials: [
    { label: 'GitHub', href: 'https://github.com/josh', handle: '@josh' },
    { label: 'LinkedIn', href: 'https://linkedin.com/in/josh', handle: 'in/josh' },
  ],
  since: 2018,
  camera: 'Sony A7 IV · 35mm f/1.4 GM',
  projects: [
    {
      name: 'rq',
      lang: 'Go',
      blurb: 'A streamlined CLI for testing APIs. More here.',
      href: 'https://github.com/josh/rq',
    },
    {
      name: 'retried-ts',
      lang: 'TypeScript',
      blurb: 'A retry utility',
      href: 'https://github.com/josh/retried-ts',
    },
  ],
};
const env: Env = { facts, now: new Date('2026-11-08T03:44:00Z'), width: 'wide' };

/** Everything a run prints, as plain text lines (echoes prefixed with `% `). */
const printed = (steps: ReadonlyArray<Step>): string[] =>
  steps.flatMap((s) => (s._tag === 'Print' ? [render(s.line)] : []));
const render = (line: Line): string =>
  line._tag === 'Echo' ? `% ${line.input}` : line.spans.map((s) => s.text).join('');
const run = (input: string, session: Session = emptySession) => submit(session, input, env);

describe('submit', () => {
  it('echoes the line first, then the output', () => {
    expect(printed(run('whoami').steps)).toEqual([
      '% whoami',
      'Joshua Germon — Founding Engineer at Kodo · Sydney, Australia',
      'Early engineer at an ad-tech startup.',
    ]);
  });

  it('lists projects, with blurbs only when wide', () => {
    expect(printed(run('ls projects').steps).slice(1)).toEqual([
      'rq/          Go          A streamlined CLI for testing APIs',
      'retried-ts/  TypeScript  A retry utility',
    ]);
    const narrow = submit(emptySession, 'ls', { ...env, width: 'narrow' });
    expect(printed(narrow.steps).slice(1)).toEqual([
      'rq/          Go          ',
      'retried-ts/  TypeScript  ',
    ]);
    expect(printed(run('ls secrets').steps)[1]).toBe('ls: secrets: No such file or directory');
  });

  it('cats now without any reading list', () => {
    const lines = printed(run('cat now').steps).slice(1);
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).not.toMatch(/reading/i);
    expect(lines[2]).toBe('shooting  Sony A7 IV · 35mm f/1.4 GM');
  });

  it('opens projects and profiles as links, and rq as the projects view', () => {
    expect(run('open retried').steps).toContainEqual({
      _tag: 'Effect',
      effect: { _tag: 'OpenLink', href: 'https://github.com/josh/retried-ts' },
    });
    expect(run('open linkedin').steps).toContainEqual({
      _tag: 'Effect',
      effect: { _tag: 'OpenLink', href: 'https://linkedin.com/in/josh' },
    });
    expect(run('open rq').steps).toContainEqual({
      _tag: 'Effect',
      effect: { _tag: 'BrowseProjects' },
    });
    expect(printed(run('open nope').steps)[1]).toBe('open: nope: not found');
  });

  it('grants sudo hire josh after a pause, with a toast', () => {
    const steps = run('sudo hire josh').steps;
    expect(steps.map((s) => s._tag)).toEqual(['Print', 'Print', 'Pause', 'Print', 'Effect']);
    expect(steps.at(-1)).toEqual({
      _tag: 'Effect',
      effect: { _tag: 'Toast', message: 'Permission granted' },
    });
    expect(printed(run('sudo rm -rf /').steps)[1]).toMatch(/not in the sudoers file/);
  });

  it('reports neofetch facts from the profile', () => {
    const lines = printed(run('neofetch').steps).join('\n');
    expect(lines).toContain('8 years shipping');
    expect(lines).toContain('Founding Engineer @ Kodo');
    expect(lines).toContain('Sony A7 IV · 35mm f/1.4 GM');
  });

  it('clears', () => {
    expect(run('clear').steps).toContainEqual({ _tag: 'Clear' });
  });

  it('reports unknown commands', () => {
    expect(printed(run('make coffee').steps)[1]).toBe('zsh: command not found: make — try help');
    expect(printed(run('constructor').steps)[1]).toBe(
      'zsh: command not found: constructor — try help',
    );
    expect(printed(run('__proto__').steps)[1]).toBe('zsh: command not found: __proto__ — try help');
  });

  it('records history, which the history command lists', () => {
    let session = emptySession;
    for (const line of ['whoami', '  ', 'ls projects']) session = run(line, session).session;
    expect(session.history).toEqual(['whoami', 'ls projects']);
    expect(printed(run('history', session).steps).slice(1)).toEqual([
      '    1  whoami',
      '    2  ls projects',
      '    3  history',
    ]);
  });

  it('never throws, whatever is typed', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const { steps } = run(input);
        expect(steps[0]).toEqual({ _tag: 'Print', line: { _tag: 'Echo', input: input.trim() } });
      }),
    );
  });
});

describe('recall', () => {
  const session: Session = { history: ['a', 'b', 'c'], cursor: 3 };

  it('walks back through history and forward to an empty line', () => {
    const up1 = recall(session, 'older');
    const up2 = recall(up1.session, 'older');
    expect([up1.value, up2.value]).toEqual(['c', 'b']);
    const down = recall(recall(up2.session, 'newer').session, 'newer');
    expect(down.value).toBe('');
  });

  it('keeps the cursor within history', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('older' as const, 'newer' as const)), (moves) => {
        const end = moves.reduce((s, m) => recall(s, m).session, session);
        expect(end.cursor).toBeGreaterThanOrEqual(0);
        expect(end.cursor).toBeLessThanOrEqual(3);
      }),
    );
  });
});

describe('complete', () => {
  it('completes a unique command with a trailing space', () => {
    expect(complete('neo', facts)).toEqual({ _tag: 'Completed', value: 'neofetch ' });
  });

  it('lists candidates when ambiguous', () => {
    expect(complete('c', facts)).toEqual({
      _tag: 'Ambiguous',
      value: 'c',
      candidates: ['cat', 'contact', 'clear', 'cd'],
    });
  });

  it('completes arguments', () => {
    expect(complete('ls p', facts)).toEqual({ _tag: 'Completed', value: 'ls projects' });
    expect(complete('cat n', facts)).toEqual({ _tag: 'Completed', value: 'cat now' });
    expect(complete('open ret', facts)).toEqual({ _tag: 'Completed', value: 'open retried-ts' });
    expect(complete('sudo h', facts)).toEqual({ _tag: 'Completed', value: 'sudo hire josh' });
  });

  it('leaves unknown input alone', () => {
    expect(complete('zz', facts)).toEqual({ _tag: 'Completed', value: 'zz' });
  });
});

describe('greeting', () => {
  it('shows the last login in Sydney', () => {
    expect(render(greeting(env.now, facts.timeZone))).toBe('Last login: Sun, 8 Nov on ttys001');
  });
});
