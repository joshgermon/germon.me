/**
 * A tiny shell that navigates the site.
 *  - Warp-style blocks: every command + its output is one block with a meta line.
 *  - Fish-style ghost autosuggestions (→ or End accepts), zsh-ish tab completion,
 *    ↑/↓ history, Ctrl+L / Ctrl+C / Ctrl+U, a blinking block cursor that goes
 *    hollow when the shell loses focus.
 *  - Side effects (scrolling to sections, opening the reader, the island) are
 *    emitted as `wl:*` events so the shell knows nothing about the page.
 */
import type { LiveData } from './types';

type Dir = { kind: 'dir'; name: string; children: Map<string, Node>; section?: string };
type File = { kind: 'file'; name: string; cat: () => string; open?: () => string; exec?: boolean };
type Node = Dir | File;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const emit = (name: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(name, { detail }));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mountShell(root: HTMLElement, data: LiveData) {
  const log = root.querySelector<HTMLElement>('[data-term-log]')!;
  const scroller = root.querySelector<HTMLElement>('[data-term-scroll]')!;
  const input = root.querySelector<HTMLInputElement>('[data-term-input]')!;
  const line = root.querySelector<HTMLElement>('[data-term-line]')!;
  const before = root.querySelector<HTMLElement>('[data-before]')!;
  const cur = root.querySelector<HTMLElement>('[data-cur]')!;
  const after = root.querySelector<HTMLElement>('[data-after]')!;
  const ghost = root.querySelector<HTMLElement>('[data-ghost]')!;
  const promptEl = root.querySelector<HTMLElement>('[data-prompt]')!;
  const cwdTitle = root.querySelector<HTMLElement>('[data-cwd-title]');
  const { profile, career, projects, photos, notes } = data;

  /* Filesystem ---------------------------------------------------------- */
  const dir = (name: string, section?: string): Dir => ({ kind: 'dir', name, children: new Map(), section });
  const add = (d: Dir, n: Node) => d.children.set(n.name, n);
  const home = dir('~', 'today');

  add(home, {
    kind: 'file',
    name: 'about.txt',
    cat: () =>
      `<span class="hl">${esc(profile.name)}</span> — ${esc(profile.title)}, ${esc(profile.location)}\n` +
      `${esc(profile.tagline)}\n\n<span class="dim">${esc(profile.intro)}</span>`,
  });

  const work = dir('work', 'work');
  career.forEach((r, i) => {
    const slug = `${r.years.slice(0, 4)}-${r.title.split(' ')[0].toLowerCase()}.md`;
    add(work, {
      kind: 'file',
      name: slug,
      cat: () => {
        emit('wl:role', i);
        return (
          `<span class="hl">${esc(r.title)}</span> <span class="dim">· ${esc(r.company)} · ${esc(r.years)}</span>\n` +
          `${esc(r.summary)}\n` +
          r.highlights.map((h) => `  <span class="ok">✓</span> ${esc(h)}`).join('\n') +
          `\n<span class="dim">${r.stack.map(esc).join(' · ')}</span>`
        );
      },
    });
  });
  add(home, work);

  const proj = dir('projects');
  projects.forEach((p) =>
    add(proj, {
      kind: 'file',
      name: p.name,
      exec: true,
      cat: () =>
        `<span class="hl">${esc(p.name)}</span> <span class="dim">(${esc(p.lang)})</span>\n${esc(p.blurb)}\n` +
        `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.href.replace('https://', ''))}</a>`,
      open: () => {
        window.open(p.href, '_blank', 'noopener');
        return `opening <a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.href.replace('https://', ''))}</a> …`;
      },
    }),
  );
  add(home, proj);

  const ph = dir('photos', 'weekend');
  photos.forEach((p, i) =>
    add(ph, {
      kind: 'file',
      name: p.file,
      cat: () => `<span class="dim">binary file — try</span> open photos/${esc(p.file)}`,
      open: () => {
        emit('wl:photo', i);
        emit('wl:nav', 'weekend');
        return `opening <span class="hl">${esc(p.caption)}</span> in the photo deck ↓`;
      },
    }),
  );
  add(home, ph);

  const nt = dir('notes', 'weekend');
  notes.forEach((n) =>
    add(nt, {
      kind: 'file',
      name: `${n.id}.md`,
      cat: () => {
        emit('wl:note', n.id);
        return (
          `<span class="dim"># ${esc(n.date)} · ${n.mins} min read</span>\n<span class="hl">${esc(n.headline)}</span>\n` +
          `<span class="dim">opening the reader …</span>`
        );
      },
    }),
  );
  add(home, nt);

  add(home, {
    kind: 'file',
    name: 'contact',
    exec: true,
    cat: () => contact(),
  });

  /* State ----------------------------------------------------------------- */
  let cwd: Dir = home;
  const parents = new Map<Dir, Dir>();
  for (const d of [work, proj, ph, nt]) parents.set(d, home);
  const pathOf = (d: Dir): string => (d === home ? '~' : `~/${d.name}`);
  const hist: string[] = [];
  let hIdx = -1;
  let draft = '';
  let busy = false;
  let skip = false; // a real keypress fast-forwards any typing animation
  let pending = ''; // …and what was typed meanwhile is kept, not swallowed
  let queued = 0;
  let touched = false;

  const resolve = (raw: string): Node | null => {
    let p = raw.trim();
    if (!p || p === '~' || p === '/') return home;
    let at: Dir = p.startsWith('~') || p.startsWith('/') ? home : cwd;
    p = p.replace(/^~\/?|^\//, '');
    const parts = p.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '.') continue;
      if (part === '..') {
        at = parents.get(at) ?? home;
        continue;
      }
      const next = at.children.get(part) ?? at.children.get(`${part}.md`) ?? fuzzy(at, part);
      if (!next) return null;
      if (next.kind === 'file') return i === parts.length - 1 ? next : null;
      at = next;
    }
    return at;
  };
  // "notes/01-09" or "photos/coast" should still find something.
  const fuzzy = (d: Dir, part: string) => {
    const hits = [...d.children.values()].filter((c) => c.name.toLowerCase().includes(part.toLowerCase()));
    return hits.length === 1 ? hits[0] : undefined;
  };

  const listing = (d: Dir) =>
    [...d.children.values()]
      .map((c) =>
        c.kind === 'dir'
          ? `<span class="d">${esc(c.name)}/</span>`
          : c.exec
            ? `<span class="x">${esc(c.name)}*</span>`
            : `<span>${esc(c.name)}</span>`,
      )
      .join('  ');

  const contact = () => {
    emit('wl:contact');
    return (
      `<span class="hl">${esc(profile.name)}</span> — always happy to talk platforms, DX or cameras.\n` +
      `  mail     <a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>\n` +
      profile.socials
        .map((s) => `  ${s.label.toLowerCase().padEnd(8)} <a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.handle)}</a>`)
        .join('\n')
    );
  };

  /* Commands ---------------------------------------------------------------- */
  type Out = string | { html: string; ok?: boolean };
  const commands: Record<string, { help: string; run: (args: string[]) => Out | Promise<Out>; hidden?: boolean }> = {
    help: {
      help: 'this list',
      run: () =>
        Object.entries(commands)
          .filter(([, c]) => !c.hidden)
          .map(([k, c]) => `  <span class="hl">${k.padEnd(9)}</span><span class="dim">${esc(c.help)}</span>`)
          .join('\n') +
        `\n\n<span class="dim">tab completes · ↑↓ history · → accepts a suggestion · ctrl+l clears</span>`,
    },
    whoami: {
      help: 'who is this guy',
      run: () =>
        `<span class="hl">${esc(profile.name)}</span> <span class="dim">·</span> ${esc(profile.title)} <span class="dim">·</span> ${esc(profile.location)}\n` +
        `${esc(profile.tagline)}`,
    },
    ls: {
      help: 'list a directory',
      run: (a) => {
        const flags = a.filter((x) => x.startsWith('-'));
        const target = a.find((x) => !x.startsWith('-'));
        const n = target ? resolve(target) : cwd;
        if (!n) return { html: `ls: ${esc(target!)}: No such file or directory`, ok: false };
        if (n.kind === 'file') return esc(n.name);
        if (n === nt || flags.some((f) => f.includes('l'))) return longListing(n);
        return listing(n);
      },
    },
    cd: {
      help: 'move around (and around the page)',
      run: (a) => {
        const n = resolve(a[0] ?? '~');
        if (!n) return { html: `cd: no such file or directory: ${esc(a[0])}`, ok: false };
        if (n.kind === 'file') return { html: `cd: not a directory: ${esc(a[0])}`, ok: false };
        cwd = n;
        renderPrompt();
        const sec = n.section;
        if (sec && sec !== 'today') {
          emit('wl:nav', sec);
          return `<span class="dim">→ jumped to</span> <span class="hl">${esc(n.name)}</span><span class="dim">. </span>cd ~<span class="dim"> to come back.</span>`;
        }
        if (n === home) emit('wl:nav', 'today');
        return n === proj ? `<span class="dim">${n.children.size} repos — </span>ls<span class="dim"> to list, </span>open &lt;name&gt;<span class="dim"> to visit</span>` : '';
      },
    },
    cat: {
      help: 'read a file — try cat notes/<tab>',
      run: (a) => {
        if (!a[0]) return { html: 'usage: cat &lt;file&gt;', ok: false };
        const n = resolve(a[0]);
        if (!n) return { html: `cat: ${esc(a[0])}: No such file or directory`, ok: false };
        if (n.kind === 'dir') return { html: `cat: ${esc(a[0])}: Is a directory`, ok: false };
        return n.cat();
      },
    },
    open: {
      help: 'open photos, notes, a project…',
      run: (a) => {
        const t = a[0] ?? '.';
        if (/^(github|gh)$/.test(t)) {
          window.open(profile.socials[0].href, '_blank', 'noopener');
          return `opening ${esc(profile.socials[0].handle)} …`;
        }
        const n = resolve(t) ?? (resolve(`projects/${t}`) as Node | null);
        if (!n) return { html: `open: ${esc(t)}: not found`, ok: false };
        if (n.kind === 'dir') {
          if (n.section) emit('wl:nav', n.section);
          if (n === ph) emit('wl:photo', -1);
          if (n === nt) emit('wl:note', notes[0].id);
          return n === home ? '' : `opening <span class="hl">${esc(n.name)}</span> ↓`;
        }
        return n.open ? n.open() : n.cat();
      },
    },
    contact: { help: 'say hi', run: () => contact() },
    neofetch: { help: 'system info, but it’s me', run: () => neofetch() },
    rq: { help: 'the thing I’m building', run: (a) => rq(a) },
    pwd: { help: 'where am I', run: () => esc(pathOf(cwd).replace('~', '/home/josh')) },
    history: { help: 'what you typed', run: () => hist.map((h, i) => `<span class="dim">${String(i + 1).padStart(4)}</span>  ${esc(h)}`).join('\n') || '<span class="dim">(empty)</span>' },
    date: {
      help: 'Sydney time',
      run: () =>
        new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    },
    clear: { help: 'clean slate', run: () => (log.innerHTML = '', '') },
    echo: { help: 'say it back', run: (a) => esc(a.join(' ')), hidden: true },
    sudo: { help: '', hidden: true, run: () => ({ html: 'josh is not in the sudoers file. This incident will be reported. 🙂', ok: false }) },
    exit: { help: '', hidden: true, run: () => 'nice try — there’s no leaving. <span class="dim">(try</span> contact<span class="dim">)</span>' },
    vim: { help: '', hidden: true, run: () => 'you’re already in my config. <span class="dim">:q to … oh.</span>' },
    nvim: { help: '', hidden: true, run: () => commands.vim.run([]) },
  };
  const cmdNames = Object.keys(commands);

  const longListing = (d: Dir) => {
    if (d === nt)
      return notes
        .map(
          (n) =>
            `<span class="dim">${n.date.padEnd(12)}</span> <button type="button" class="tl" data-run="cat notes/${n.id}">${n.id}.md</button>  <span class="dim">${esc(n.title)}</span>`,
        )
        .join('\n');
    return [...d.children.values()]
      .map((c) => `<span class="dim">${c.kind === 'dir' ? 'drwxr-xr-x' : c.exec ? '-rwxr-xr-x' : '-rw-r--r--'}  josh</span>  ${c.kind === 'dir' ? `<span class="d">${esc(c.name)}/</span>` : esc(c.name)}`)
      .join('\n');
  };

  const neofetch = () => {
    const art = [
      '                      ',
      '        /\\            ',
      '   /\\  /  \\    /\\     ',
      '  /  \\/    \\__/  \\    ',
      ' /   .  ~~~~~~~ .   \\  ',
      '~~~~~~~~      ~~~~~~~~',
      '   ~~~~~~~~~~~~~~~~   ',
    ];
    const info = [
      `<span class="hl">josh</span>@<span class="hl">germon.me</span>`,
      '<span class="dim">─────────────────</span>',
      `<span class="k">role</span>     ${esc(profile.title)}`,
      `<span class="k">host</span>     Sydney, AU <span class="dim">(AEDT)</span>`,
      `<span class="k">uptime</span>   9+ years shipping`,
      `<span class="k">packages</span> 41 repos <span class="dim">(github)</span>`,
      `<span class="k">shell</span>    zsh + neovim`,
      `<span class="k">stack</span>    TypeScript · Go · Rust`,
      `<span class="k">camera</span>   ${esc(profile.now.shooting)}`,
      `<span class="k">now</span>      building rq`,
    ];
    // Narrow shells (phones) drop the art rather than wrap it into soup.
    if (log.clientWidth < 600) return info.join('\n');
    const rows = Math.max(art.length, info.length);
    return (
      Array.from({ length: rows }, (_, i) => `<span class="art">${esc((art[i] ?? '').padEnd(24))}</span>  ${info[i] ?? ''}`).join('\n') +
      `\n${' '.repeat(26)}${['#1d1d1f', '#5b4636', '#a07a5a', '#d9b48f', '#efd9bf', '#9fb4c7', '#6f8aa3', '#f2f2f2'].map((c) => `<i class="sw" style="background:${c}"></i>`).join('')}`
    );
  };

  const rq = async (a: string[]) => {
    if (a[0] !== 'send') return `rq <span class="dim">— OpenAPI-native API client.</span> try <button type="button" class="tl" data-run="rq send petstore GET /pets/1">rq send petstore GET /pets/1</button>`;
    const path = a[3] ?? '/pets/1';
    await sleep(reduced() ? 0 : 360);
    const id = Number(path.split('/').pop()) || 1;
    const names = ['Mochi', 'Biscuit', 'Pixel', 'Noodle'];
    return (
      `<span class="ok">200 OK</span>  <span class="dim">·  ${10 + ((id * 7) % 20)}ms  ·  application/json</span>\n` +
      `{ <span class="k">"id"</span>: ${id}, <span class="k">"name"</span>: <span class="s">"${names[id % names.length]}"</span>, <span class="k">"tag"</span>: <span class="s">"cat"</span> }`
    );
  };

  /* Rendering ---------------------------------------------------------------- */
  const promptHTML = (path: string, ok = true) =>
    `<span class="pr-path">${esc(path)}</span><span class="pr-chev${ok ? '' : ' err'}">❯</span>`;
  let lastOk = true;
  const renderPrompt = () => {
    promptEl.innerHTML = promptHTML(pathOf(cwd), lastOk);
    if (cwdTitle) cwdTitle.textContent = pathOf(cwd);
  };

  const suggestion = (v: string) => {
    if (!v || input.selectionStart !== v.length) return '';
    const fromHist = [...hist].reverse().find((h) => h.startsWith(v) && h !== v);
    if (fromHist) return fromHist.slice(v.length);
    const pool = [
      ...cmdNames.filter((c) => !commands[c].hidden),
      'cd work',
      'cd photos',
      'cd notes',
      'ls projects',
      'open photos',
      'open rq',
      `cat notes/${notes[0].id}`,
      'rq send petstore GET /pets/1',
    ];
    const hit = pool.find((c) => c.startsWith(v) && c !== v);
    return hit ? hit.slice(v.length) : '';
  };

  const renderInput = () => {
    const v = input.value;
    const at = input.selectionStart ?? v.length;
    before.textContent = v.slice(0, at);
    cur.textContent = v[at] ?? ' ';
    after.textContent = v.slice(at + 1);
    ghost.textContent = suggestion(v);
    // Restart the blink so the cursor is solid while you type.
    cur.classList.remove('blink');
    void cur.offsetWidth;
    cur.classList.add('blink');
  };

  const scrollDown = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });

  const block = (cmd: string) => {
    const b = document.createElement('section');
    b.className = 'blk';
    const t = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    b.innerHTML =
      `<header class="blk-h"><button type="button" class="blk-cmd" data-reuse="${esc(cmd)}" title="Edit and re-run">${promptHTML(pathOf(cwd))}<span class="c">${esc(cmd)}</span></button>` +
      `<span class="blk-meta" data-meta>${t}</span></header><div class="blk-o"></div>`;
    log.append(b);
    log.querySelectorAll('.blk[data-last]').forEach((x) => x.removeAttribute('data-last'));
    b.setAttribute('data-last', '');
    return b;
  };

  const print = (b: HTMLElement, html: string, ok: boolean) => {
    const o = b.querySelector<HTMLElement>('.blk-o')!;
    if (!html) {
      o.remove();
    } else {
      const lines = html.split('\n');
      o.innerHTML = lines.map((l, i) => `<div class="ln" style="--d:${Math.min(i, 24) * 14}ms">${l || ' '}</div>`).join('');
    }
    if (!ok) b.classList.add('err');
  };

  const exec = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) {
      block('');
      scrollDown();
      return;
    }
    if (hist[hist.length - 1] !== cmd) hist.push(cmd);
    hIdx = -1;
    const [name, ...args] = cmd.split(/\s+/);
    if (name === 'clear') {
      log.innerHTML = '';
      emit('wl:cmd', { cmd, ok: true });
      return;
    }
    const b = block(cmd);
    const c = commands[name];
    const t0 = performance.now();
    let ok = true;
    let html = '';
    emit('wl:cmd', { cmd, ok: null });
    if (!c) {
      ok = false;
      const near = cmdNames.find((k) => !commands[k].hidden && (k.startsWith(name.slice(0, 2)) || name.startsWith(k)));
      html = `zsh: command not found: ${esc(name)}` + (near ? `\n<span class="dim">did you mean</span> <button type="button" class="tl" data-run="${near}">${near}</button><span class="dim">?</span>` : `\n<span class="dim">try</span> <button type="button" class="tl" data-run="help">help</button>`);
    } else {
      const out = await c.run(args);
      if (typeof out === 'string') html = out;
      else ((html = out.html), (ok = out.ok ?? true));
    }
    const ms = performance.now() - t0;
    print(b, html, ok);
    const meta = b.querySelector('[data-meta]');
    if (meta) meta.textContent = `${meta.textContent} · ${ms < 1 ? '<1' : Math.round(ms)}ms`;
    lastOk = ok;
    renderPrompt();
    scrollDown();
    emit('wl:cmd', { cmd, ok });
  };

  /* Typing (for chips + boot) ------------------------------------------------ */
  let typing: Promise<void> = Promise.resolve();
  const fast = () => skip || reduced();
  const typeAndRun = (cmd: string, speed = 1) => {
    queued++;
    typing = typing.then(async () => {
      busy = true;
      input.value = '';
      renderInput();
      if (!fast()) {
        for (let i = 1; i <= cmd.length && !skip; i++) {
          input.value = cmd.slice(0, i);
          input.setSelectionRange(i, i);
          renderInput();
          await sleep((14 + Math.random() * 26) / speed);
        }
        if (!skip) await sleep(140 / speed);
      }
      input.value = '';
      renderInput();
      await exec(cmd);
      busy = false;
      if (--queued === 0) {
        skip = false;
        if (pending) {
          input.value = pending;
          input.setSelectionRange(pending.length, pending.length);
          pending = '';
          renderInput();
        }
      }
    });
    return typing;
  };

  /* Tab completion ------------------------------------------------------------- */
  const complete = () => {
    const v = input.value;
    const at = input.selectionStart ?? v.length;
    const head = v.slice(0, at);
    const tokens = head.split(/\s+/);
    const word = tokens[tokens.length - 1];
    let cands: string[];
    let prefix = '';
    if (tokens.length === 1) {
      cands = cmdNames.filter((c) => !commands[c].hidden && c.startsWith(word));
    } else {
      const slash = word.lastIndexOf('/');
      prefix = slash >= 0 ? word.slice(0, slash + 1) : '';
      const base = slash >= 0 ? word.slice(slash + 1) : word;
      const d = prefix ? resolve(prefix) : cwd;
      if (!d || d.kind !== 'dir') return;
      const onlyDirs = tokens[0] === 'cd';
      cands = [...d.children.values()]
        .filter((c) => (!onlyDirs || c.kind === 'dir') && c.name.startsWith(base))
        .map((c) => c.name + (c.kind === 'dir' ? '/' : ''));
    }
    if (!cands.length) return;
    const common = cands.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
    const finished = cands.length === 1 && !common.endsWith('/') ? `${common} ` : common;
    const nextHead = head.slice(0, head.length - word.length) + prefix + (cands.length === 1 ? finished : common);
    if (nextHead !== head) {
      input.value = nextHead + v.slice(at);
      input.setSelectionRange(nextHead.length, nextHead.length);
      renderInput();
    } else if (cands.length > 1) {
      // Second tab: show candidates zsh-style, without running anything.
      const b = document.createElement('div');
      b.className = 'blk blk--cands';
      b.innerHTML = `<div class="blk-o"><div class="ln">${cands.map((c) => (c.endsWith('/') ? `<span class="d">${esc(c)}</span>` : esc(c))).join('  ')}</div></div>`;
      log.querySelector('.blk--cands')?.remove();
      log.append(b);
      scrollDown();
    }
  };

  /* Input wiring ---------------------------------------------------------------- */
  input.addEventListener('input', () => {
    log.querySelector('.blk--cands')?.remove();
    renderInput();
  });
  input.addEventListener('keydown', (e) => {
    if (busy) {
      e.preventDefault();
      skip = true;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) pending += e.key;
      return;
    }
    touched = true;
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      renderInput();
      log.querySelector('.blk--cands')?.remove();
      void exec(v);
    } else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
      // Only complete when there's something to complete — an empty prompt
      // lets Tab move focus on, so keyboard users are never trapped.
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!hist.length) return;
      e.preventDefault();
      if (hIdx === -1) draft = input.value;
      if (e.key === 'ArrowUp') hIdx = hIdx === -1 ? hist.length - 1 : Math.max(0, hIdx - 1);
      else hIdx = hIdx === -1 ? -1 : hIdx + 1;
      if (hIdx >= hist.length) hIdx = -1;
      input.value = hIdx === -1 ? draft : hist[hIdx];
      const n = input.value.length;
      input.setSelectionRange(n, n);
      renderInput();
    } else if ((e.key === 'ArrowRight' || e.key === 'End') && ghost.textContent && input.selectionStart === input.value.length) {
      e.preventDefault();
      input.value += ghost.textContent;
      const n = input.value.length;
      input.setSelectionRange(n, n);
      renderInput();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      log.innerHTML = '';
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      const b = block(input.value + '^C');
      b.querySelector('.blk-o')?.remove();
      input.value = '';
      renderInput();
      scrollDown();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      input.value = '';
      renderInput();
    } else {
      // Caret moves (←/→/Home) only show after the browser applies them.
      requestAnimationFrame(renderInput);
    }
  });
  input.addEventListener('select', renderInput);
  input.addEventListener('focus', () => root.setAttribute('data-focus', ''));
  input.addEventListener('blur', () => root.removeAttribute('data-focus'));

  // Click anywhere in the shell to type — but don't steal text selections, and on
  // touch only the prompt line summons the keyboard.
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const run = t.closest<HTMLElement>('[data-run]');
    if (run) {
      e.preventDefault();
      void typeAndRun(run.dataset.run!);
      return;
    }
    const reuse = t.closest<HTMLElement>('[data-reuse]');
    if (reuse) {
      input.value = reuse.dataset.reuse ?? '';
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      renderInput();
      return;
    }
    if (t.closest('a, button')) return;
    if (getSelection()?.toString()) return;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (!touch || line.contains(t)) input.focus({ preventScroll: true });
  });

  renderPrompt();
  renderInput();

  /* Boot ------------------------------------------------------------------------- */
  const bootLine = document.createElement('div');
  bootLine.className = 'boot';
  const last = new Date(Date.now() - 1000 * 60 * 60 * 19);
  bootLine.textContent = `Last login: ${last.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} on ttys001`;
  log.append(bootLine);

  const boot = async () => {
    await sleep(fast() ? 0 : 650);
    void typeAndRun('neofetch', 1.4);
    await typing;
    await sleep(fast() ? 0 : 320);
    if (!touched && !pending && !input.value) await typeAndRun('ls', 1.4);
    const hint = document.createElement('div');
    hint.className = 'boot boot--hint';
    hint.innerHTML = `<span class="dim">This shell is the site. Try</span> <button type="button" class="tl" data-run="help">help</button><span class="dim">, or tap a suggestion below.</span>`;
    log.append(hint);
    scrollDown();
  };

  return { run: typeAndRun, boot, focus: () => input.focus({ preventScroll: true }) };
}
