/**
 * Bento · Combo — page glue.
 *  - Editorial: the backdrop switcher, the sentence's pills (hover → preview +
 *    the widget comes forward), the pass-switching wallet, the coffee fortnight.
 *  - Command: the palette and its shortcuts, HUD, terminal, golden hour, commits.
 *  - One sheet: on a phone, every overlay is the shared bottom sheet.
 */
import { terminal } from '@/concepts/widgets-system/terminal';
import { dots, type DotField } from './dots';
import { fortnight, coffeeGrid, coffeeHref, type CoffeeDay } from './coffee';
import { palette } from './palette';
import { sheet, isPhone } from './sheet';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const TZ = 'Australia/Sydney';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reducedQ = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Data = {
  weekly: number[];
  weekStarts: string[];
  projects: { name: string; lang: string; href: string; blurb: string }[];
  profile: {
    name: string;
    title: string;
    company: string;
    email: string;
    tagline: string;
    now: Record<string, string>;
    socials: { label: string; href: string; handle: string }[];
  };
};

export function boot() {
  const data = JSON.parse($('#cb-data').textContent!) as Data;
  const reduced = reducedQ();
  const email = data.profile.email;

  /* HUD ---------------------------------------------------------------------- */
  const hudEl = $('[data-hud]');
  let hudT = 0;
  const hud = (text: string) => {
    $('[data-hud-t]', hudEl).textContent = text;
    hudEl.removeAttribute('data-on');
    void hudEl.offsetWidth;
    hudEl.setAttribute('data-on', '');
    clearTimeout(hudT);
    hudT = window.setTimeout(() => hudEl.removeAttribute('data-on'), 1700);
  };

  /* Jump to a widget: scroll it to centre, then a brief hairline flash -------- */
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    el.classList.add('in');
    el.removeAttribute('data-flash');
    void el.offsetWidth;
    setTimeout(() => el.setAttribute('data-flash', ''), reduced ? 0 : 260);
    setTimeout(() => el.removeAttribute('data-flash'), 1600);
    const focusable = el.querySelector<HTMLElement>('[aria-pressed="true"]') ?? el.querySelector<HTMLElement>('.bx-open, input, a, button');
    focusable?.focus({ preventScroll: true });
  };

  /* The shared panel sheet (phone): previews, coffee, backdrop ----------------- */
  const panelRoot = $('[data-sheet="panel"]');
  const panelWin = $('.sh-win', panelRoot);
  const panel = sheet({ root: panelRoot, win: panelWin, handles: $$('[data-sh-drag]', panelRoot) });
  const panelTitle = $('[data-sh-title]', panelRoot);
  const panelFoot = $('[data-sh-foot]', panelRoot);
  const panelCta = $<HTMLButtonElement>('[data-sh-cta]', panelRoot);
  let panelAct: (() => void) | null = null;
  const openPanel = (kind: 'peek' | 'coffee' | 'bg', title: string, cta?: { label: string; run: () => void }) => {
    $$('[data-panel]', panelRoot).forEach((p) => (p.hidden = p.dataset.panel !== kind));
    panelTitle.textContent = title;
    panelFoot.hidden = !cta;
    panelAct = cta?.run ?? null;
    if (cta) $('span', panelCta).textContent = cta.label;
    panel.open(cta ? panelCta : null);
  };
  panelCta.addEventListener('click', () => {
    const run = panelAct;
    panel.close(() => run?.());
  });

  /* Backdrop (Editorial) ------------------------------------------------------ */
  const bg = backdrop(openPanel);

  /* Terminal --------------------------------------------------------------- */
  const proxy = $<HTMLButtonElement>('[data-term-proxy]');
  const term = (cmd: string) => {
    jump('terminal');
    setTimeout(() => {
      proxy.dataset.cmd = cmd;
      proxy.click();
      $<HTMLInputElement>('[data-term-in]').focus({ preventScroll: true });
    }, reduced ? 0 : 420);
  };

  /* Coffee (Editorial's fortnight, in a Command card; a sheet on a phone) -------- */
  const cf = coffee(email, (day) =>
    openPanel('coffee', 'Grab a coffee', { label: `Email Josh · ${day().short}`, run: () => (location.href = coffeeHref(email, day())) }),
  );

  const links: Record<string, string> = Object.fromEntries(data.profile.socials.map((s) => [s.label.toLowerCase(), s.href]));
  const pal = palette({
    hud,
    jump,
    term,
    bg: bg.cycle,
    coffee: (how) => {
      if (how === 'mail') location.href = coffeeHref(email, cf.picked());
      else if (isPhone()) cf.sheet();
      else jump('coffee');
    },
    email,
    links,
  });
  const suggestions = $$('[data-sugg]').map((b) => b.dataset.act!);

  const wal = wallet(pal.perform);
  pills(wal, pal.perform, openPanel);
  reveal();

  // Every [data-act] on the page (outside the palette) routes through the palette.
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (t && !t.closest('[data-pal]') && !t.hasAttribute('data-pill')) {
      e.preventDefault();
      pal.perform(t.dataset.act);
    }
    if ((e.target as HTMLElement).closest('[data-open]')) pal.open();
  });

  /* Global shortcuts (Command) -------------------------------------------------- */
  const editable = (el: Element | null) => !!el && el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  let hoverContact = false;
  const contact = $('#contact');
  contact.addEventListener('pointerenter', () => (hoverContact = true));
  contact.addEventListener('pointerleave', () => (hoverContact = false));

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (panel.isOpen()) return;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (pal.isOpen()) pal.close();
      else pal.open();
      return;
    }
    if (e.altKey && !mod && /^Digit[1-5]$/.test(e.code)) {
      const a = editable(document.activeElement) && !pal.isOpen() ? null : suggestions[Number(e.code.slice(5)) - 1];
      if (a) {
        e.preventDefault();
        pal.perform(a);
      }
      return;
    }
    if (pal.isOpen() || editable(document.activeElement)) return;
    if (mod && e.key.toLowerCase() === 'c' && hoverContact && !getSelection()?.toString()) {
      e.preventDefault();
      navigator.clipboard?.writeText(email).then(() => hud('Copied to Clipboard'));
      return;
    }
    if (e.key === '/' && !mod) {
      e.preventDefault();
      pal.open();
      return;
    }
    if (!mod && !e.altKey && e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
      e.preventDefault();
      pal.open({ q: e.key });
    }
  });

  /* Top bar: scrim once scrolled, a Sydney clock ---------------------------------- */
  const top = $('[data-top]');
  const onScroll = () => top.toggleAttribute('data-scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  $('[data-totop]').addEventListener('click', (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
  const clock = () =>
    $$('[data-syd-now]').forEach(
      (el) => (el.textContent = new Date().toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ')),
    );
  clock();
  setInterval(clock, 30_000);

  terminal(data, { openSheet: () => pal.open({ view: 'projects' }), toast: hud });
  golden();
  commits(data);
}

/* Backdrop switcher (Editorial) ---------------------------------------------- */
const BACKDROPS = ['dunes', 'dusk', 'night', 'black', 'dots'] as const;
type Backdrop = (typeof BACKDROPS)[number];
const LABEL: Record<Backdrop, string> = { dunes: 'Dunes', dusk: 'Dusk', night: 'Night', black: 'Black', dots: 'Dots' };
const isBackdrop = (v: unknown): v is Backdrop => BACKDROPS.includes(v as Backdrop);
export const DEFAULT_BG: Backdrop = 'dusk';

function backdrop(openPanel: (kind: 'bg', title: string) => void) {
  const root = document.documentElement;
  const canvas = $<HTMLCanvasElement>('canvas.cb-dots');
  const label = $('[data-bgs-label]');
  const picks = $$<HTMLButtonElement>('[data-bg-pick]');
  let field: DotField | null = null;
  let cur: Backdrop = DEFAULT_BG;
  const apply = (id: Backdrop) => {
    cur = id;
    root.dataset.bg = id;
    if (id === 'dots' && canvas) field ??= dots(canvas, reducedQ());
    field?.play(id === 'dots');
    picks.forEach((b) => {
      const on = b.dataset.bgPick === id;
      b.setAttribute('aria-checked', String(on));
      if (b.closest('.bgs')) b.tabIndex = on ? 0 : -1;
    });
    if (label) label.textContent = LABEL[id];
    $$('[data-bg-now]').forEach((el) => (el.textContent = LABEL[id]));
  };
  const choose = (id: Backdrop) => {
    apply(id);
    try {
      localStorage.setItem('cb-bg', id);
    } catch {
      /* private mode: just don't remember */
    }
  };
  const initial = root.dataset.bg;
  apply(isBackdrop(initial) ? initial : DEFAULT_BG);
  picks.forEach((b) => {
    b.addEventListener('click', () => choose(b.dataset.bgPick as Backdrop));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const group = picks.filter((p) => p.parentElement === b.parentElement);
      const next = group[(group.indexOf(b) + d + group.length) % group.length];
      choose(next.dataset.bgPick as Backdrop);
      next.focus();
    });
  });
  // Phone: one compact button → the sheet.
  $('[data-bgs-open]')?.addEventListener('click', () => openPanel('bg', 'Backdrop'));
  return {
    cycle: () => {
      const next = BACKDROPS[(BACKDROPS.indexOf(cur) + 1) % BACKDROPS.length];
      choose(next);
      return LABEL[next];
    },
  };
}

/* Cards stagger in as they arrive (Editorial's reveal, Command's motion) -------- */
function reveal() {
  const cards = $$('.grid > .bx');
  if (reducedQ() || !('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      const hits = entries
        .filter((e) => e.isIntersecting)
        .map((e) => e.target as HTMLElement)
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return ra.top - rb.top || ra.left - rb.left;
        });
      hits.forEach((c, i) => {
        c.style.setProperty('--d', `${i * 55}ms`);
        c.classList.add('in');
        io.unobserve(c);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -4% 0px' },
  );
  // Let the sentence land first.
  setTimeout(() => cards.forEach((c) => io.observe(c)), 650);
}

/* Pills (Editorial): hover → preview follows the cursor + its widget comes forward;
   click → the palette (or the widget). Phone: tap → a preview sheet. ------------- */
function pills(wal: ReturnType<typeof wallet>, perform: (act: string) => void, openPanel: (kind: 'peek', title: string, cta: { label: string; run: () => void }) => void) {
  const peek = $('[data-peek]');
  const inner = $('[data-peek-in]');
  const sheetPeek = $('[data-panel="peek"]');
  const list = $$<HTMLAnchorElement>('[data-pill]');
  let shownKey = '';
  let lit: HTMLElement | null = null;
  let tx = -999;
  let ty = -999;
  let x = -999;
  let y = -999;
  let raf = 0;
  let visible = false;

  const loop = () => {
    const k = reducedQ() ? 1 : 0.24;
    x += (tx - x) * k;
    y += (ty - y) * k;
    peek.style.setProperty('--px', `${x.toFixed(1)}px`);
    peek.style.setProperty('--py', `${y.toFixed(1)}px`);
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  const target = (cx: number, cy: number, jumpTo = false) => {
    const w = inner.offsetWidth || 264;
    const h = inner.offsetHeight || 120;
    let nx = cx + 18;
    let ny = cy + 24;
    if (nx + w > innerWidth - 12) nx = cx - w - 18;
    if (ny + h > innerHeight - 12) ny = cy - h - 18;
    tx = clamp(nx, 12, innerWidth - w - 12);
    ty = clamp(ny, 12, innerHeight - h - 12);
    if (jumpTo) {
      x = tx;
      y = ty;
    }
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const content = (key: string) => $(`[data-peek-for="${key}"]`)?.innerHTML ?? '';
  const show = (pill: HTMLAnchorElement) => {
    const key = pill.dataset.pill!;
    if (key !== shownKey) {
      inner.innerHTML = content(key);
      inner.toggleAttribute('data-pass', !!inner.querySelector('.bp'));
      if (visible) {
        inner.removeAttribute('data-swap');
        void inner.offsetWidth;
        inner.setAttribute('data-swap', '');
      }
      shownKey = key;
    }
    list.forEach((p) => p.toggleAttribute('data-on', p === pill));
    peek.setAttribute('data-on', '');
    visible = true;
    const w = $(`[data-w="${pill.dataset.to}"]`);
    if (lit && lit !== w) lit.removeAttribute('data-lit');
    lit = w;
    if (w) {
      w.setAttribute('data-lit', '');
      document.body.setAttribute('data-lit', '');
    }
    if (pill.dataset.pass) wal.set(+pill.dataset.pass);
  };
  const hide = () => {
    peek.removeAttribute('data-on');
    visible = false;
    list.forEach((p) => p.removeAttribute('data-on'));
    lit?.removeAttribute('data-lit');
    lit = null;
    document.body.removeAttribute('data-lit');
  };

  for (const pill of list) {
    pill.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || isPhone()) return;
      const wasHidden = !visible;
      show(pill);
      target(e.clientX, e.clientY, wasHidden);
    });
    pill.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && visible) target(e.clientX, e.clientY);
    });
    pill.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
    pill.addEventListener('focus', () => {
      if (!pill.matches(':focus-visible') || isPhone()) return;
      show(pill);
      const r = pill.getBoundingClientRect();
      target(r.left - 18, r.bottom - 12, true);
    });
    pill.addEventListener('blur', hide);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      hide();
      const act = pill.dataset.act!;
      if (pill.dataset.pass) wal.set(+pill.dataset.pass);
      if (isPhone()) {
        // Touch: the preview becomes a sheet, with the action as its button.
        sheetPeek.innerHTML = content(pill.dataset.pill!);
        openPanel('peek', pill.dataset.title ?? pill.textContent!.trim(), { label: pill.dataset.cta ?? 'Open', run: () => perform(act) });
        return;
      }
      perform(act);
    });
  }
  addEventListener('scroll', () => {
    if (visible && !document.activeElement?.matches('[data-pill]')) hide();
  }, { passive: true });
}

/* Wallet (Editorial's switching stack, Command's passes) ------------------------- */
function wallet(perform: (act: string) => void) {
  const slots = $$('.wal-slot');
  const infos = $$('.wal-info');
  const tabs = $$<HTMLButtonElement>('.wal-tabs [data-wal-pick]');
  const n = slots.length;
  let front = 0;
  const set = (i: number) => {
    front = ((i % n) + n) % n;
    slots.forEach((s, j) => {
      const d = (j - front + n) % n;
      s.style.setProperty('--depth', String(d));
      s.toggleAttribute('data-front', d === 0);
    });
    infos.forEach((el, j) => (el.hidden = j !== front));
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === front)));
  };
  set(0);
  // Front pass → open it in the palette; a pass behind → bring it forward.
  $$<HTMLButtonElement>('.wal-hit').forEach((b) =>
    b.addEventListener('click', () => {
      const i = +b.dataset.walPick!;
      if (i === front) perform(`view:career@role-${i}`);
      else set(i);
    }),
  );
  tabs.forEach((t) => t.addEventListener('click', () => set(+t.dataset.walPick!)));
  return { set };
}

/* Coffee: a fortnight of weekday mornings. Card + (phone) sheet share one pick. --- */
function coffee(email: string, openSheet: (day: () => CoffeeDay) => void) {
  const grids = $$('[data-cf-grid]');
  const { days, first, month } = fortnight();
  let picked = first;
  grids.forEach((g) => (g.innerHTML = coffeeGrid(days, first.iso)));
  $$('[data-cf-month]').forEach((m) => (m.textContent = month));
  const ctas = $$<HTMLAnchorElement>('[data-cf-cta]');
  const pick = (iso: string) => {
    const d = days.find((x) => x.iso === iso && x.state === 'open');
    if (!d) return false;
    picked = d;
    $$('[data-cf-day]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cfDay === iso)));
    $$('[data-cf-pick]').forEach((el) => (el.textContent = d.short));
    $$('[data-cf-long]').forEach((el) => (el.textContent = d.long));
    ctas.forEach((c) => (c.href = coffeeHref(email, d)));
    const btn = $('[data-sh-cta] span');
    if (btn && $('[data-panel="coffee"]:not([hidden])')) btn.textContent = `Email Josh · ${d.short}`;
    return true;
  };
  pick(first.iso);
  const sheetOpen = () => openSheet(() => picked);
  grids.forEach((g) =>
    g.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cf-day]');
      if (!b || !pick(b.dataset.cfDay!)) return;
      // On a phone, picking in the card confirms in a sheet.
      if (isPhone() && !g.closest('[data-sheet]')) sheetOpen();
    }),
  );
  ctas.forEach((c) =>
    c.addEventListener('click', (e) => {
      if (!isPhone()) return;
      e.preventDefault();
      sheetOpen();
    }),
  );
  return { picked: () => picked, sheet: sheetOpen };
}

/* Golden hour (SunCalc-style solar maths for Sydney) ------------------------ */
function sunTimes(date: Date, lat = -33.87, lon = 151.21) {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const toJ = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJ = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
  const e = rad * 23.4397;
  const d = toJ(date) - J2000;
  const lw = rad * -lon;
  const phi = rad * lat;
  const J0 = 0.0009;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const at = (h: number) => {
    const w = Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    return J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  };
  const Jset = at(-0.833 * rad);
  const Jgold = at(6 * rad);
  return { sunrise: fromJ(Jnoon - (Jset - Jnoon)), sunset: fromJ(Jset), golden: fromJ(Jgold) };
}

function golden() {
  const now = new Date();
  const t = sunTimes(now);
  const f = (d: Date) => d.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toLowerCase();
  const g = f(t.golden);
  const [time, ap] = g.split(' ');
  const big = $('[data-golden]');
  if (big) big.innerHTML = `${time}<small>${ap ?? ''}</small>`;
  $$('[data-golden-text]').forEach((el) => (el.textContent = g));
  $$('[data-sunset]').forEach((el) => (el.textContent = f(t.sunset)));
  $$('[data-sunrise]').forEach((el) => (el.textContent = f(t.sunrise)));
  const m1 = $('[data-meta="Golden hour"]');
  const m2 = $('[data-meta="Sunset"]');
  if (m1) m1.textContent = g;
  if (m2) m2.textContent = f(t.sunset);
  // The sun along its arc (Editorial), sunrise → sunset.
  const sun = $<SVGCircleElement>('.gd-sun');
  if (sun) {
    const k = (now.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
    const u = clamp(k, 0, 1);
    const x = (1 - u) ** 2 * 6 + 2 * (1 - u) * u * 60 + u ** 2 * 114;
    const y = (1 - u) ** 2 * 40 + 2 * (1 - u) * u * -14 + u ** 2 * 40;
    sun.setAttribute('cx', x.toFixed(1));
    sun.setAttribute('cy', (k < 0 || k > 1 ? 44 : y).toFixed(1));
    sun.toggleAttribute('data-night', k < 0 || k > 1);
  }
}

function commits(data: Data) {
  const plot = $('[data-stk]');
  if (!plot) return;
  const x = $('[data-stk-x]');
  const val = $('[data-stk-val]');
  const lbl = $('[data-stk-lbl]');
  const total = val.textContent;
  const totalLbl = lbl.textContent;
  const s = data.weekly;
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  plot.addEventListener('pointermove', (e) => {
    const r = plot.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const i = Math.round(u * (s.length - 1));
    x.style.transform = `translateX(${((i / (s.length - 1)) * r.width).toFixed(1)}px)`;
    x.style.opacity = '1';
    val.textContent = s[i].toLocaleString('en-AU');
    lbl.textContent = `by ${fmt(data.weekStarts[i])}`;
  });
  plot.addEventListener('pointerleave', () => {
    x.style.opacity = '0';
    val.textContent = total;
    lbl.textContent = totalLbl;
  });
}
