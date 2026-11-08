/**
 * Bento · Combo — the command palette (from bento-command), the page's one
 * navigation idea. Raycast semantics:
 *  - type to filter; ↑ ↓ (or ⌃N ⌃P) to move; ↵ runs the primary action,
 *    ⌘↵ the secondary one; esc clears → goes back → closes; ⌫ on empty goes back.
 *  - empty, it leads with Suggestions (⌥1–⌥5); typing filters every command
 *    plus the notes, passes and projects inside.
 *  - views push like extensions (Notes, Engineering, Projects) with list + detail;
 *    notes open in Editorial's serif reader.
 * Desktop: the window grows out of the slim "What would you like to do?" pill in
 * the top bar. Phone: the shared bottom sheet.
 */
import { Spring, springLoop } from '@/lib/glass/spring';
import { sheet, isPhone } from './sheet';

type Hooks = {
  hud: (text: string) => void;
  jump: (id: string) => void;
  term: (cmd: string) => void;
  bg: () => string;
  coffee: (how: 'pick' | 'mail') => void;
  email: string;
  links: Record<string, string>;
};

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];

export function palette(hooks: Hooks) {
  const root = $('[data-pal]');
  const win = $('.pal-win', root);
  const input = $<HTMLInputElement>('[data-q]', root);
  const list = $('[data-list]', root);
  const body = $('[data-body]', root);
  const hl = $('[data-hl]', root);
  const back = $<HTMLButtonElement>('[data-back]', root);
  const crumb = $('[data-crumb]', root);
  const empty = $('[data-empty]', root);
  const footTitle = $('[data-foot-title]', root);
  const footPrimary = $('[data-foot-primary]', root);
  const footAlt = $('[data-foot-alt]', root);
  const footAltBtn = $<HTMLButtonElement>('[data-run="alt"]', root);
  const footSep = $('[data-foot-sep]', root);
  const bar = $('[data-bar]');
  const sections = $$('.pal-sec', list);
  const details = new Map($$('[data-detail]', root).map((d) => [d.dataset.detail!, d]));
  const echoes = $$('[data-q-echo]', root);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = isPhone;

  let isOpen = false;
  let view = 'root';
  let reading = false;
  let visible: HTMLElement[] = [];
  let sel: HTMLElement | null = null;
  let shownDetail: HTMLElement | null = null;
  let lastFocus: HTMLElement | null = null;
  let closeTimer = 0;

  // Phone: the palette *is* the shared sheet.
  const sh = sheet({
    root,
    win,
    handles: [$('[data-grab]', root), $('.pal-head', root)],
    managed: true,
    onClose: () => {
      isOpen = false;
      document.documentElement.classList.remove('pal-open');
      input.blur();
    },
  });

  /* Spring highlight ---------------------------------------------------- */
  const hy = new Spring(0, { response: 0.26, damping: 0.86 });
  const hh = new Spring(36, { response: 0.26, damping: 1 });
  const hlLoop = springLoop([hy, hh], () => {
    hl.style.transform = `translate3d(0,${hy.value.toFixed(2)}px,0)`;
    hl.style.height = `${hh.value.toFixed(2)}px`;
  });
  let snapNext = true;
  const moveHighlight = (opt: HTMLElement | null) => {
    if (!opt) {
      hl.style.opacity = '0';
      return;
    }
    hl.style.opacity = '1';
    const y = opt.offsetTop;
    const h = opt.offsetHeight;
    if (snapNext || reduced) {
      hy.set(y);
      hh.set(h);
      hl.style.transform = `translate3d(0,${y}px,0)`;
      hl.style.height = `${h}px`;
      snapNext = false;
      return;
    }
    hy.to(y);
    hh.to(h);
    hlLoop.kick();
  };

  /* Filtering ------------------------------------------------------------- */
  const subseq = (hay: string, q: string) => {
    let i = 0;
    for (const c of hay) if (c === q[i]) i++;
    return i === q.length;
  };
  const matches = (opt: HTMLElement, q: string) => {
    if (!q) return true;
    const kw = (opt.dataset.kw ?? '').toLowerCase();
    if (kw === '*') return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.every((t) => kw.includes(t))) return true;
    const title = (opt.querySelector('b')?.textContent ?? '').toLowerCase().replace(/\s+/g, '');
    return q.length > 1 && subseq(title, q.replace(/\s+/g, ''));
  };

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    echoes.forEach((e) => (e.textContent = input.value.trim()));
    visible = [];
    for (const s of sections) {
      const v = s.dataset.view!;
      const show = view === 'root' ? (v === 'root' ? (s.hasAttribute('data-empty-only') ? !q : true) : !!q) : v === view;
      let any = false;
      for (const o of $$('[role="option"]', s)) {
        const ok = show && (v === 'fallback' ? !!q : matches(o, q));
        o.hidden = !ok;
        if (ok) {
          visible.push(o);
          any = true;
        }
      }
      s.hidden = !any;
    }
    const real = visible.filter((o) => !o.id.startsWith('fb-'));
    empty.hidden = !!real.length || !!visible.length;
    select(real[0] ?? visible[0] ?? null);
    list.scrollTop = 0;
  };

  /* Selection + detail ------------------------------------------------------ */
  const select = (opt: HTMLElement | null, scroll = true) => {
    if (sel === opt && opt) return;
    sel?.setAttribute('aria-selected', 'false');
    sel = opt;
    if (opt) {
      opt.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', opt.id);
    } else input.removeAttribute('aria-activedescendant');
    moveHighlight(opt);
    if (opt && scroll) {
      const sec = opt.parentElement!;
      const isFirst = sec.querySelector('[role="option"]:not([hidden])') === opt;
      const top = isFirst ? sec.offsetTop : opt.offsetTop;
      const bottom = opt.offsetTop + opt.offsetHeight;
      if (top < list.scrollTop + 4) list.scrollTop = Math.max(0, top - 4);
      else if (bottom > list.scrollTop + list.clientHeight - 4) list.scrollTop = bottom - list.clientHeight + 6;
    }
    const d = opt ? details.get(opt.id) ?? null : null;
    if (d !== shownDetail) {
      if (shownDetail) shownDetail.hidden = true;
      if (d) {
        d.hidden = false;
        d.parentElement!.scrollTop = 0;
      }
      shownDetail = d;
    }
    const alt = opt?.dataset.alt;
    footPrimary.textContent = reading && opt?.dataset.act === 'read' ? 'Back to List' : opt?.dataset.label ?? 'Open';
    footAlt.textContent = opt?.dataset.altLabel ?? '';
    footAltBtn.hidden = footSep.hidden = !alt;
    footPrimary.parentElement!.toggleAttribute('disabled', !opt);
  };

  const move = (dir: 1 | -1) => {
    if (!visible.length) return;
    const i = sel ? visible.indexOf(sel) : -1;
    select(visible[Math.max(0, Math.min(visible.length - 1, i + dir))]);
  };

  /* Views ----------------------------------------------------------------- */
  const setView = (v: string, selectId?: string) => {
    view = v;
    setReading(false);
    const sec = sections.find((s) => s.dataset.view === v);
    input.value = '';
    input.placeholder = sec?.dataset.ph ?? 'What would you like to do?';
    back.hidden = v === 'root';
    $('[data-search-ic]', root).hidden = v !== 'root';
    crumb.hidden = v === 'root';
    crumb.textContent = sec?.dataset.title ?? '';
    footTitle.textContent = v === 'root' ? 'Josh Germon' : sec?.dataset.title ?? '';
    root.dataset.view = v;
    snapNext = true;
    filter();
    if (selectId) {
      const o = document.getElementById(selectId);
      if (o && visible.includes(o)) {
        snapNext = true;
        select(o);
      }
    }
  };

  const setReading = (on: boolean) => {
    reading = on;
    body.classList.toggle('is-reading', on);
    root.toggleAttribute('data-reading', on);
    back.hidden = view === 'root' && !on;
    $('[data-search-ic]', root).hidden = !back.hidden;
    if (sel) {
      const s = sel;
      sel = null;
      select(s, false);
    }
  };

  /* Open / close ------------------------------------------------------------ */
  // Desktop: the window opens where the pill is and grows out of it.
  const place = () => {
    if (phone()) {
      ['--top', '--left', '--w', '--ox'].forEach((p) => win.style.removeProperty(p));
      return;
    }
    const r = bar.getBoundingClientRect();
    const w = Math.min(760, innerWidth - 32);
    const left = (innerWidth - w) / 2;
    win.style.setProperty('--w', `${w}px`);
    win.style.setProperty('--left', `${left}px`);
    win.style.setProperty('--top', `${Math.max(10, r.top - 6)}px`);
    win.style.setProperty('--ox', `${r.left + r.width / 2 - left}px`);
  };

  const open = (opts: { view?: string; select?: string; q?: string } = {}) => {
    clearTimeout(closeTimer);
    if (!isOpen) {
      lastFocus = document.activeElement as HTMLElement;
      place();
      isOpen = true;
      document.documentElement.classList.add('pal-open');
      if (phone()) {
        root.dataset.mode = 'sheet';
        setView(opts.view ?? 'root', opts.select);
        sh.open(!opts.view || opts.view === 'root' ? input : win);
      } else {
        root.dataset.mode = 'pop';
        root.hidden = false;
        void win.offsetWidth;
        root.dataset.state = 'open';
      }
    }
    setView(opts.view ?? 'root', opts.select);
    if (opts.q) {
      input.value = opts.q;
      filter();
    }
    // On a phone, only pop the keyboard for the root search — reading a pass shouldn't.
    if (!phone() || (opts.view ?? 'root') === 'root') input.focus({ preventScroll: true });
    else win.focus({ preventScroll: true });
  };

  const close = (restore = true) => {
    if (!isOpen) return;
    if (root.dataset.mode === 'sheet') return sh.close(restore ? undefined : () => {});
    isOpen = false;
    root.dataset.state = 'closing';
    document.documentElement.classList.remove('pal-open');
    input.blur();
    closeTimer = window.setTimeout(() => {
      root.hidden = true;
      root.dataset.state = '';
    }, reduced ? 0 : 140);
    if (restore && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  };

  /* Actions --------------------------------------------------------------- */
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked (insecure context) — the HUD still confirms intent */
    }
  };

  /** Run an action string. Shared by the palette, the bento and the hero pills. */
  const perform = (act: string | undefined, q = '') => {
    if (!act) return;
    const i = act.indexOf(':');
    const kind = i < 0 ? act : act.slice(0, i);
    const arg = i < 0 ? '' : act.slice(i + 1);
    switch (kind) {
      case 'view': {
        // `view:notes@note-x!` → open straight into the reader.
        const read = arg.endsWith('!');
        const [v, id] = arg.replace(/!$/, '').split('@');
        if (isOpen) setView(v, id);
        else open({ view: v, select: id });
        // A phone has no side pane: deep links open straight into the detail.
        if (id && (read || phone())) setReading(true);
        return;
      }
      case 'read':
        setReading(!reading);
        return;
      case 'jump':
        close(false);
        hooks.jump(arg);
        return;
      case 'coffee':
        // Pick a morning: the card on desktop, the sheet on a phone.
        close(false);
        hooks.coffee(arg === 'mail' ? 'mail' : 'pick');
        return;
      case 'mail': {
        const subject = arg || q;
        close();
        location.href = `mailto:${hooks.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
        return;
      }
      case 'copy': {
        const text = arg === 'email' ? hooks.email : hooks.links[arg] ?? arg;
        close();
        copy(text).then(() => hooks.hud('Copied to Clipboard'));
        return;
      }
      case 'href':
        close();
        window.open(arg, '_blank', 'noopener');
        return;
      case 'bg': {
        const name = hooks.bg();
        hooks.hud(`Backdrop: ${name}`);
        const sub = $('[data-bg-now]', root);
        if (sub) sub.textContent = name;
        return;
      }
      case 'term': {
        const cmd = arg || q;
        close(false);
        hooks.term(cmd);
        return;
      }
    }
  };

  const runSelected = (alt: boolean) => {
    if (!sel) return;
    if (reading && !alt && sel.dataset.act === 'read') return setReading(false);
    perform(alt ? sel.dataset.alt : sel.dataset.act, input.value.trim());
  };

  /* Events ---------------------------------------------------------------- */
  input.addEventListener('input', () => {
    if (reading) setReading(false);
    filter();
  });

  root.addEventListener('keydown', (e) => {
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    if (k === 'ArrowDown' || (e.ctrlKey && (k === 'n' || k === 'j'))) {
      e.preventDefault();
      move(1);
    } else if (k === 'ArrowUp' || (e.ctrlKey && (k === 'p' || k === 'k'))) {
      e.preventDefault();
      move(-1);
    } else if (k === 'Enter' && !e.isComposing) {
      if (document.activeElement !== input && document.activeElement !== win) return;
      e.preventDefault();
      runSelected(mod);
    } else if (k === 'Escape') {
      e.preventDefault();
      if (reading) setReading(false);
      else if (input.value) {
        input.value = '';
        filter();
      } else if (view !== 'root') setView('root');
      else close();
    } else if (k === 'Backspace' && !input.value && view !== 'root' && document.activeElement === input) {
      e.preventDefault();
      setView('root');
    } else if (k === 'Tab') {
      const f = $$<HTMLElement>('input, button:not([hidden]):not([disabled])', win).filter((x) => x.offsetParent);
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  });

  let px = -1;
  let py = -1;
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.clientX === px && e.clientY === py) return;
    px = e.clientX;
    py = e.clientY;
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (o && o !== sel) select(o, false);
  });
  list.addEventListener('click', (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (!o) return;
    select(o, false);
    if (phone() && details.has(o.id) && view !== 'root') return setReading(true);
    runSelected(false);
  });
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', () => close()));
  back.addEventListener('click', () => {
    if (reading) setReading(false);
    else setView('root');
    if (!phone()) input.focus({ preventScroll: true });
  });
  $('[data-run="primary"]', root).addEventListener('click', () => runSelected(false));
  footAltBtn.addEventListener('click', () => runSelected(true));
  addEventListener('resize', () => isOpen && root.dataset.mode === 'pop' && place());

  return { open, close, perform, isOpen: () => isOpen };
}
