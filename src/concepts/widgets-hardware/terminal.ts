/**
 * The CRT terminal: a tiny shell with a handful of real commands, history,
 * tab-completion, and a self-typing boot sequence once it scrolls into view.
 */
import type { HwData } from './app';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - s.length));

export type Terminal = {
  run: (cmd: string, opts?: { typed?: boolean }) => Promise<void>;
  boot: () => void;
};

export function mountTerminal(root: HTMLElement, data: HwData, reduced: boolean, onKey: () => void): Terminal {
  const out = root.querySelector<HTMLElement>('[data-crt-out]')!;
  const input = root.querySelector<HTMLInputElement>('[data-crt-in]')!;
  const history: string[] = [];
  let hIndex = 0;
  let busy = false;

  const print = (html: string, cls = '') => {
    const p = document.createElement('div');
    if (cls) p.className = cls;
    p.innerHTML = html;
    out.append(p);
    out.scrollTop = out.scrollHeight;
    return p;
  };

  const projectLine = (p: HwData['projects'][number]) =>
    `<span class="hi">${pad(p.name, 24)}</span><span class="dim">${pad(p.lang, 11)}</span>`;

  const commands: Record<string, (args: string[]) => string | void> = {
    help: () =>
      [
        '<span class="hi">commands</span>',
        `  ${pad('whoami', 22)}<span class="dim">who is this</span>`,
        `  ${pad('ls projects', 22)}<span class="dim">side projects</span>`,
        `  ${pad('cat now', 22)}<span class="dim">what I’m up to</span>`,
        `  ${pad('cat career', 22)}<span class="dim">the short version</span>`,
        `  ${pad('open &lt;project&gt;', 22)}<span class="dim">details + link</span>`,
        `  ${pad('rq send GET /pets/1', 22)}<span class="dim">try rq</span>`,
        `  ${pad('contact', 22)}<span class="dim">say hi</span>`,
        `  ${pad('clear', 22)}<span class="dim">wipe the phosphor</span>`,
      ].join('\n'),
    whoami: () =>
      [
        `<span class="hi">${esc(data.profile.name)}</span> — ${esc(data.profile.title)}`,
        `<span class="dim">${esc(data.profile.location)}</span>`,
        esc(data.profile.tagline),
      ].join('\n'),
    ls: (a) => {
      const what = a[0] ?? '';
      if (what === '' || what.startsWith('proj')) return data.projects.map(projectLine).join('\n');
      if (what.startsWith('car')) return commands.cat(['career']) as string;
      return `ls: ${esc(what)}: No such file or directory`;
    },
    cat: (a) => {
      const f = (a[0] ?? '').replace(/\.(md|txt)$/, '');
      if (f === 'now')
        return Object.entries(data.profile.now)
          .map(([k, v]) => `<span class="dim">${pad(k, 10)}</span>${esc(v)}`)
          .join('\n');
      if (f === 'career')
        return data.career.map((r) => `<span class="dim">${pad(r.years, 14)}</span><span class="hi">${esc(r.title)}</span> · ${esc(r.company)}`).join('\n');
      const p = data.projects.find((x) => x.name === f);
      if (p) return commands.open([p.name]) as string;
      if (!f) return 'usage: cat now | career | &lt;project&gt;';
      return `cat: ${esc(f)}: No such file or directory`;
    },
    open: (a) => {
      const p = data.projects.find((x) => x.name === a[0]) ?? data.projects.find((x) => x.name.startsWith(a[0] ?? '¬'));
      if (!p) return `open: unknown project. try <span class="hi">ls projects</span>`;
      return [
        `<span class="hi">${esc(p.name)}</span> <span class="dim">· ${esc(p.lang)}</span>`,
        esc(p.blurb),
        `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.href.replace('https://', ''))} ↗</a>`,
      ].join('\n');
    },
    rq: (a) => {
      if (a[0] !== 'send') return 'usage: rq send GET /pets/1';
      const path = a[2] ?? '/pets/1';
      const id = Number(path.split('/').pop()) || 1;
      const pets = ['Mochi', 'Biscuit', 'Pixel', 'Noodle'];
      return [
        `<span class="dim">→ ${esc(a[1] ?? 'GET')} https://petstore.local${esc(path)}</span>`,
        `<span class="hi">200 OK</span>  <span class="dim">·  12ms  ·  application/json</span>`,
        `{ "id": ${id}, "name": "${pets[(id - 1) % pets.length]}", "tag": "cat" }`,
      ].join('\n');
    },
    contact: () =>
      [
        `<a href="mailto:${esc(data.profile.email)}">${esc(data.profile.email)}</a>`,
        ...data.profile.socials.map((s) => `<a href="${esc(s.href)}" target="_blank" rel="noopener">${pad(s.label, 10)}${esc(s.handle)}</a>`),
      ].join('\n'),
    sudo: () => 'nice try.',
    echo: (a) => esc(a.join(' ')),
    date: () => new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'short' }) + ' (Sydney)',
    clear: () => {
      out.innerHTML = '';
    },
  };
  commands.email = commands.contact;
  commands.projects = () => commands.ls(['projects']);
  commands.now = () => commands.cat(['now']);

  const exec = (line: string) => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) return;
    const fn = commands[cmd.toLowerCase()];
    if (cmd !== 'clear') print(esc(line), 'cmd');
    const res = fn ? fn(args) : `zsh: command not found: ${esc(cmd)} — try <span class="hi">help</span>`;
    if (typeof res === 'string') print(res);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async (cmd: string, { typed = true } = {}) => {
    if (busy) return;
    busy = true;
    if (typed && !reduced) {
      input.value = '';
      for (const ch of cmd) {
        input.value += ch;
        onKey();
        await sleep(24 + Math.random() * 40);
      }
      await sleep(140);
    }
    input.value = '';
    exec(cmd);
    history.push(cmd);
    hIndex = history.length;
    busy = false;
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      if (v.trim()) {
        exec(v);
        history.push(v);
      } else print('', 'cmd');
      hIndex = history.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hIndex = Math.max(0, hIndex - 1);
      input.value = history[hIndex] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      hIndex = Math.min(history.length, hIndex + 1);
      input.value = history[hIndex] ?? '';
    } else if (e.key === 'Tab') {
      const v = input.value;
      const words = ['help', 'whoami', 'ls projects', 'cat now', 'cat career', 'contact', 'clear', 'rq send GET /pets/1', ...data.projects.map((p) => `open ${p.name}`)];
      const m = words.find((w) => w.startsWith(v) && w !== v);
      if (v && m) {
        e.preventDefault();
        input.value = m;
      }
    } else if (e.key.length === 1) onKey();
  });
  root.addEventListener('pointerup', () => {
    if (!getSelection()?.toString()) input.focus({ preventScroll: true });
  });

  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    const crt = root.querySelector<HTMLElement>('[data-crt]') ?? root;
    if (!reduced) {
      crt.dataset.boot = '';
      delete crt.dataset.off;
    }
    print('<span class="dim">germon.me tty1 — phosphor warm. type <span class="hi">help</span> or press a cartridge →</span>');
    setTimeout(async () => {
      await run('whoami');
      await sleep(reduced ? 0 : 500);
      await run('ls projects');
    }, reduced ? 0 : 800);
  };

  return { run, boot };
}
