/**
 * The terminal widget: a tiny, honest zsh. Type, tab-complete, ↑/↓ history,
 * ⌃L to clear — or tap a suggestion chip and watch it type itself.
 */
import { prefersReducedMotion } from '@/lib/glass';

type Data = {
  projects: { name: string; lang: string; href: string; blurb: string }[];
  profile: {
    name: string;
    title: string;
    email: string;
    tagline: string;
    now: Record<string, string>;
    socials: { label: string; href: string; handle: string }[];
  };
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - s.length));
const short = (s: string, n: number) => {
  const first = s.split(/\. | — /)[0].replace(/\.$/, '');
  return n <= 0 ? '' : first.length > n ? first.slice(0, n - 1).trimEnd() + '…' : first;
};

export function terminal(data: Data, hooks: { openSheet: (name: string, from: HTMLElement) => void; toast: (t: string) => void }) {
  const w = document.querySelector<HTMLElement>('#terminal');
  if (!w) return;
  const body = w.querySelector<HTMLElement>('[data-term-body]')!;
  const out = w.querySelector<HTMLElement>('[data-term-out]')!;
  const input = w.querySelector<HTMLInputElement>('[data-term-in]')!;
  const mirror = w.querySelector<HTMLElement>('[data-term-mirror]')!;
  const reduced = prefersReducedMotion();
  const history: string[] = [];
  let hIndex = 0;
  let busy = false;

  const PS = '<span class="t-u">josh@sydney</span> <span class="t-d">~</span> <span class="t-pct">%</span> ';
  const print = (html: string) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    out.append(d);
    body.scrollTop = body.scrollHeight;
  };
  const renderMirror = () => {
    const v = input.value;
    const at = input.selectionStart ?? v.length;
    const ch = v[at] ?? ' ';
    mirror.innerHTML = `${esc(v.slice(0, at))}<span class="t-caret">${esc(ch)}</span>${esc(v.slice(at + 1))}`;
  };

  const projects = data.projects;
  const p = data.profile;
  const commands: Record<string, (args: string[]) => void | Promise<void>> = {
    help: () =>
      print(
        [
          '<span class="t-b">Available commands</span>',
          `  ${pad('whoami', 16)}<span class="t-dim">who is this guy</span>`,
          `  ${pad('ls projects', 16)}<span class="t-dim">things I build to learn</span>`,
          `  ${pad('cat now', 16)}<span class="t-dim">what I’m up to</span>`,
          `  ${esc(pad('open <name>', 16))}<span class="t-dim">rq, bksd, github, linkedin…</span>`,
          `  ${pad('rq send', 16)}<span class="t-dim">try my API client</span>`,
          `  ${pad('neofetch', 16)}<span class="t-dim">system info, sort of</span>`,
          `  ${pad('contact', 16)}<span class="t-dim">say hi</span>`,
          `  ${pad('clear', 16)}<span class="t-dim">⌃L works too</span>`,
        ].join('\n'),
      ),
    whoami: () =>
      print(
        `<span class="t-b">${esc(p.name)}</span> — ${esc(p.title)} at ${esc((p as { company?: string }).company ?? 'Kodo')} · Sydney, AU\n<span class="t-dim">${esc(p.tagline)}</span>`,
      ),
    ls: (args) => {
      if (args[0] && !/^proj/.test(args[0])) return print(`<span class="t-err">ls: ${esc(args[0])}: No such file or directory</span>`);
      const width = Math.max(...projects.map((x) => x.name.length)) + 3;
      print(
        projects
          .map((x) => `<span class="t-acc">${esc(pad(x.name + '/', width))}</span><span class="t-warn">${esc(pad(x.lang, 12))}</span><span class="t-dim">${esc(short(x.blurb, w.clientWidth > 640 ? 46 : 0))}</span>`)
          .join('\n'),
      );
    },
    cat: (args) => {
      if (!args[0] || !/^now/.test(args[0])) return print(`<span class="t-err">cat: ${esc(args[0] ?? '')}: No such file — try <span class="t-b">cat now</span></span>`);
      print(
        Object.entries(p.now)
          .map(([k, v]) => `<span class="t-ok">${esc(pad(k, 10))}</span>${esc(v)}`)
          .join('\n'),
      );
    },
    open: (args) => {
      const name = (args[0] ?? '').toLowerCase();
      if (!name) return print('<span class="t-err">usage: open &lt;project|github|linkedin|x&gt;</span>');
      if (name === 'rq') {
        print('<span class="t-dim">Opening rq…</span>');
        setTimeout(() => hooks.openSheet('rq', w), 260);
        return;
      }
      const proj = projects.find((x) => x.name.toLowerCase().startsWith(name));
      const social = p.socials.find((s) => s.label.toLowerCase() === name);
      const href = proj?.href ?? social?.href;
      if (!href) return print(`<span class="t-err">open: ${esc(name)}: not found</span>`);
      print(`<span class="t-dim">Opening</span> <a href="${esc(href)}" target="_blank" rel="noopener">${esc(href.replace('https://', ''))}</a>`);
      window.open(href, '_blank', 'noopener');
    },
    rq: async (args) => {
      if (args[0] !== 'send') {
        print(`<span class="t-b">rq</span> 0.9.0 — OpenAPI-native API client\n  <span class="t-dim">usage:</span> rq send GET /pets/1`);
        return;
      }
      const path = args.slice(2).join(' ') || '/pets/1';
      const method = (args[1] ?? 'GET').toUpperCase();
      print(`<span class="t-dim">→ ${esc(method)} https://petstore.example${esc(path.startsWith('/') ? path : '/' + path)}</span>`);
      await new Promise((r) => setTimeout(r, reduced ? 0 : 420));
      print(
        `<span class="t-ok">200 OK</span> <span class="t-dim">· 12ms · application/json</span>\n{ <span class="t-acc">"id"</span>: 1, <span class="t-acc">"name"</span>: <span class="t-warn">"Mochi"</span>, <span class="t-acc">"tag"</span>: <span class="t-warn">"cat"</span> }`,
      );
    },
    neofetch: () => {
      const rows = [
        ['OS', 'Sydney, Australia (AEST/AEDT)'],
        ['Host', `${p.title} @ ${(p as { company?: string }).company ?? 'Kodo'}`],
        ['Uptime', `${new Date().getFullYear() - 2018} years shipping`],
        ['Shell', 'zsh + way too many aliases'],
        ['Editor', 'Neovim (config: never finished)'],
        ['Langs', 'TypeScript · Go · Rust · C'],
        ['Camera', p.now.shooting ?? 'Sony A7 IV'],
      ];
      const logo = ['   ▗▄▄▄▄▖', '  ▐▌   ▐▌', '  ▐▌ ◉ ▐▌', '  ▐▌   ▐▌', '   ▝▀▀▀▀▘', '', ''];
      print(rows.map(([k, v], i) => `<span class="t-acc">${esc(pad(logo[i] ?? '', 12))}</span><span class="t-ok">${esc(pad(k, 8))}</span>${esc(v)}`).join('\n'));
    },
    contact: () =>
      print(
        `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>\n` +
          p.socials.map((s) => `<a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label.toLowerCase())}</a> <span class="t-dim">${esc(s.handle)}</span>`).join('   '),
      ),
    sudo: async (args) => {
      if (args.join(' ') !== 'hire josh') return print('<span class="t-err">josh is not in the sudoers file. This incident will be reported.</span>');
      print('<span class="t-dim">[sudo] password for recruiter:</span> ••••••••');
      await new Promise((r) => setTimeout(r, reduced ? 0 : 520));
      print(`<span class="t-ok">✓ Permission granted.</span> Say hi → <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
      hooks.toast('Permission granted');
    },
    date: () => print(new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'short' }) + ' <span class="t-dim">AET</span>'),
    clear: () => {
      out.innerHTML = '';
    },
    exit: () => print('<span class="t-dim">logout… just kidding. There’s more to scroll.</span>'),
    pwd: () => print('/Users/josh/sydney'),
    echo: (args) => print(esc(args.join(' '))),
  };
  commands.email = commands.contact;
  commands.about = commands.whoami;
  commands.cd = () => print('<span class="t-dim">You’re already home.</span>');
  commands.vim = commands.nvim = () => print('<span class="t-dim">You can check out any time you like, but you can never leave.</span>');
  const names = Object.keys(commands);

  const run = async (raw: string) => {
    const line = raw.trim();
    print(PS + esc(line));
    if (!line) return;
    history.push(line);
    hIndex = history.length;
    const [cmd, ...args] = line.split(/\s+/);
    const fn = commands[cmd.toLowerCase()];
    if (!fn) {
      print(`<span class="t-err">zsh: command not found: ${esc(cmd)}</span> <span class="t-dim">— try</span> help`);
      return;
    }
    busy = true;
    try {
      await fn(args);
    } finally {
      busy = false;
    }
  };

  const complete = (v: string) => {
    const parts = v.split(/\s+/);
    if (parts.length === 1) {
      const hits = names.filter((n) => n.startsWith(parts[0]));
      if (hits.length === 1) return hits[0] + ' ';
      if (hits.length > 1) print(PS + esc(v) + '\n' + hits.join('  '));
      return v;
    }
    const last = parts[parts.length - 1];
    const pool = parts[0] === 'open' ? [...projects.map((x) => x.name), ...p.socials.map((s) => s.label.toLowerCase())] : parts[0] === 'ls' ? ['projects'] : parts[0] === 'cat' ? ['now'] : [];
    const hits = pool.filter((n) => n.startsWith(last));
    if (hits.length === 1) parts[parts.length - 1] = hits[0];
    return parts.join(' ');
  };

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (busy) return;
      const v = input.value;
      input.value = '';
      renderMirror();
      await run(v);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hIndex = Math.max(0, Math.min(history.length, hIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hIndex] ?? '';
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      input.value = complete(input.value);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.innerHTML = '';
    }
    requestAnimationFrame(renderMirror);
  });
  for (const ev of ['input', 'select', 'keyup', 'click'] as const) input.addEventListener(ev, renderMirror);
  input.addEventListener('focus', () => w.setAttribute('data-focus', ''));
  input.addEventListener('blur', () => w.removeAttribute('data-focus'));
  body.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    if (getSelection()?.toString()) return;
    input.focus({ preventScroll: true });
  });

  // Self-typing, for the chips and the intro.
  const typeAndRun = async (cmd: string) => {
    if (busy) return;
    busy = true;
    input.value = '';
    for (let i = 1; i <= cmd.length; i++) {
      input.value = cmd.slice(0, i);
      renderMirror();
      if (!reduced) await new Promise((r) => setTimeout(r, 34 + Math.random() * 46));
    }
    if (!reduced) await new Promise((r) => setTimeout(r, 220));
    input.value = '';
    renderMirror();
    busy = false;
    await run(cmd);
  };
  w.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => b.addEventListener('click', () => typeAndRun(b.dataset.cmd!)));
  w.querySelector('[data-term-open]')?.addEventListener('click', () => hooks.openSheet('rq', w));

  print('<span class="t-dim">Last login: ' + new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' on ttys001</span>');
  renderMirror();
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(async () => {
        await typeAndRun('whoami');
        if (innerWidth > 680) {
          await new Promise((r) => setTimeout(r, reduced ? 0 : 500));
          await typeAndRun('ls projects');
        }
        print('<span class="t-hint">Type <span class="t-b">help</span> — or tap a suggestion below.</span>');
      }, reduced ? 0 : 500);
    },
    { threshold: 0.5 },
  );
  io.observe(w);
}
