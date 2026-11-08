/**
 * Bento · Editorial — behaviour.
 * The sentence's pills drive everything: hover one and a preview follows the
 * cursor while the widget it names comes forward; click and the page glides
 * to it. The rest is small, quick, honest widget behaviour.
 */
import { terminal } from '@/concepts/widgets-system/terminal';
import { dots, type DotField } from './dots';
import { fortnight, coffeeGrid, coffeeHref } from './coffee';

type PageData = {
  weekly: number[]; // cumulative, one per week
  weekStarts: string[];
  total: number;
  last30: number;
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

const TZ = 'Australia/Sydney';
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const widgetEl = (key: string) => $(`[data-w="${key}"]`);

export function boot() {
  const data = JSON.parse($('#ed-data')!.textContent || '{}') as PageData;
  const wal = wallet();
  backdrop();
  reveal();
  nav();
  pills(wal);
  coffee(data.profile.email);
  golden();
  commits(data);
  github();
  projects();
  contact();
  reader();
  terminal(data, {
    openSheet: (name) => {
      if (name === 'rq') {
        goTo('projects');
        const a = $<HTMLAnchorElement>('.pj-list a[data-name="rq"]') ?? $<HTMLAnchorElement>('.pj-list a');
        a?.dispatchEvent(new Event('pointerenter'));
      }
    },
    toast,
  });
}

/* Toast ------------------------------------------------------------------- */
let toastT = 0;
function toast(text: string) {
  const t = $('[data-toast]');
  if (!t) return;
  t.textContent = text;
  t.setAttribute('data-on', '');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => t.removeAttribute('data-on'), 1800);
}

/* Scroll to a widget and let it say "here" -------------------------------- */
function goTo(key: string) {
  const el = widgetEl(key);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const fits = r.height < innerHeight - 120;
  const top = scrollY + r.top - (fits ? (innerHeight - r.height) / 2 + 20 : 84);
  scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
  el.removeAttribute('data-flash');
  void el.offsetWidth;
  el.setAttribute('data-flash', '');
  setTimeout(() => el.removeAttribute('data-flash'), 1100);
}

/* Backdrop switcher ------------------------------------------------------ */
const BACKDROPS = ['dunes', 'dusk', 'night', 'black', 'dots'] as const;
type Backdrop = (typeof BACKDROPS)[number];
const isBackdrop = (v: unknown): v is Backdrop => BACKDROPS.includes(v as Backdrop);

function backdrop() {
  const root = document.documentElement;
  const canvas = $<HTMLCanvasElement>('canvas.ed-dots');
  const label = $('[data-bgs-label]');
  const picks = $$<HTMLButtonElement>('[data-bg-pick]');
  let field: DotField | null = null;
  const apply = (id: Backdrop) => {
    root.dataset.bg = id;
    if (id === 'dots' && canvas) field ??= dots(canvas, reduced());
    field?.play(id === 'dots');
    picks.forEach((b) => {
      const on = b.dataset.bgPick === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    if (label) label.textContent = picks.find((b) => b.dataset.bgPick === id)?.title ?? '';
  };
  const choose = (id: Backdrop) => {
    apply(id);
    try {
      localStorage.setItem('ed-bg', id);
    } catch {
      /* private mode: just don't remember */
    }
  };
  const initial = root.dataset.bg;
  apply(isBackdrop(initial) ? initial : 'dunes');
  picks.forEach((b, i) => {
    b.addEventListener('click', () => choose(b.dataset.bgPick as Backdrop));
    // Radio-group arrows.
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = picks[(i + d + picks.length) % picks.length];
      choose(next.dataset.bgPick as Backdrop);
      next.focus();
    });
  });
}

/* Nav: a segmented control whose thumb slides to the current section ----- */
function nav() {
  const seg = $('.ed-seg')!;
  const links = $$<HTMLAnchorElement>('.ed-seg a');
  const thumb = $('.ed-seg-thumb')!;
  const top = $('.ed-top')!;
  let current = '';
  const place = () => {
    const a = links.find((l) => l.dataset.nav === current);
    seg.toggleAttribute('data-on', !!a);
    if (!a) return;
    thumb.style.setProperty('--x', `${a.offsetLeft}px`);
    thumb.style.setProperty('--w', `${a.offsetWidth}px`);
  };
  const set = (id: string) => {
    if (id === current) return;
    // Arriving from the intro: appear in place rather than slide in from the edge.
    const appear = !current;
    if (appear) thumb.style.transition = 'opacity 260ms ease';
    current = id;
    links.forEach((l) => (l.dataset.nav === id ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
    place();
    if (appear) requestAnimationFrame(() => requestAnimationFrame(() => (thumb.style.transition = '')));
  };
  document.fonts?.ready.then(place);
  addEventListener('resize', place);

  const sections = $$('[data-section]');
  // A nav click wins over scroll-spy until its scroll settles (otherwise landing on
  // #work near the end of the page reads as "at the bottom" and highlights Build).
  let lockUntil = 0;
  links.forEach((l) =>
    l.addEventListener('click', () => {
      lockUntil = performance.now() + 1200;
      set(l.dataset.nav!);
    }),
  );
  const pick = () => {
    if (performance.now() < lockUntil) return;
    const y = innerHeight * 0.45;
    let id = 'index';
    for (const s of sections) if (s.getBoundingClientRect().top <= y) id = s.dataset.section!;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) id = sections[sections.length - 1].dataset.section!;
    set(id === 'index' ? '' : id);
    top.style.setProperty('--scrim', scrollY > 24 ? '1' : '0');
  };
  let raf = 0;
  addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(pick);
  }, { passive: true });
  pick();
  $('[data-top]')?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  });
}

/* Cards stagger in as they arrive ----------------------------------------- */
function reveal() {
  const cards = $$('.card');
  if (reduced() || !('IntersectionObserver' in window)) {
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
        c.style.setProperty('--d', `${i * 70}ms`);
        c.classList.add('in');
        io.unobserve(c);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  // Let the sentence land first.
  setTimeout(() => cards.forEach((c) => io.observe(c)), 950);
}

/* Pills ------------------------------------------------------------------- */
function pills(wal: ReturnType<typeof wallet>) {
  const peek = $('[data-peek]')!;
  const inner = $('[data-peek-in]')!;
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
    const k = reduced() ? 1 : 0.24;
    x += (tx - x) * k;
    y += (ty - y) * k;
    peek.style.setProperty('--px', `${x.toFixed(1)}px`);
    peek.style.setProperty('--py', `${y.toFixed(1)}px`);
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  const target = (cx: number, cy: number, jump = false) => {
    const w = inner.offsetWidth || 264;
    const h = inner.offsetHeight || 120;
    let nx = cx + 18;
    let ny = cy + 24;
    if (nx + w > innerWidth - 12) nx = cx - w - 18;
    if (ny + h > innerHeight - 12) ny = cy - h - 18;
    tx = clamp(nx, 12, innerWidth - w - 12);
    ty = clamp(ny, 12, innerHeight - h - 12);
    if (jump) {
      x = tx;
      y = ty;
    }
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const show = (pill: HTMLAnchorElement) => {
    const key = pill.dataset.pill!;
    if (key !== shownKey) {
      const src = $(`[data-peek-for="${key}"]`);
      inner.innerHTML = src?.innerHTML ?? '';
      inner.toggleAttribute('data-pass', !!src?.querySelector('.pass'));
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
    document.body.setAttribute('data-hinted', '');

    // Bring its widget forward.
    const w = widgetEl(pill.dataset.to!);
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
      if (e.pointerType !== 'mouse') return;
      const wasHidden = !visible;
      show(pill);
      target(e.clientX, e.clientY, wasHidden);
    });
    pill.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') target(e.clientX, e.clientY);
    });
    pill.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
    pill.addEventListener('focus', () => {
      if (!pill.matches(':focus-visible')) return;
      show(pill);
      const r = pill.getBoundingClientRect();
      target(r.left - 18, r.bottom - 12, true);
    });
    pill.addEventListener('blur', hide);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      hide();
      if (pill.dataset.pass) wal.set(+pill.dataset.pass);
      goTo(pill.dataset.to!);
    });
  }
  addEventListener('scroll', () => {
    if (visible && !document.activeElement?.matches('[data-pill]')) hide();
  }, { passive: true });
}

/* Wallet ------------------------------------------------------------------ */
function wallet() {
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
  $$<HTMLButtonElement>('.wal-hit').forEach((b) =>
    b.addEventListener('click', () => {
      const i = +b.dataset.walPick!;
      set(i === front ? front + 1 : i);
    }),
  );
  tabs.forEach((t) => t.addEventListener('click', () => set(+t.dataset.walPick!)));
  return { set };
}

/* Coffee: a fortnight of weekday mornings; pick one, the button drafts the email. */
function coffee(email: string) {
  const grid = $('[data-cf-grid]');
  const cta = $<HTMLAnchorElement>('[data-cf-cta]');
  const pickEl = $('[data-cf-pick]');
  const month = $('[data-cf-month]');
  if (grid && cta && pickEl) {
    // Re-render with today's date (the build may be days old).
    const { days, first, month: m } = fortnight();
    grid.innerHTML = coffeeGrid(days, first.iso);
    if (month) month.textContent = m;
    const pick = (iso: string) => {
      const d = days.find((x) => x.iso === iso && x.state === 'open');
      if (!d) return;
      $$('[data-cf-day]', grid).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cfDay === iso)));
      pickEl.textContent = d.short;
      cta.href = coffeeHref(email, d);
    };
    pick(first.iso);
    grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cf-day]');
      if (b) pick(b.dataset.cfDay!);
    });
  }
  const t = () =>
    $$('[data-syd-now]').forEach(
      (el) => (el.textContent = new Date().toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ')),
    );
  t();
  setInterval(t, 30_000);
}

/* Golden hour: SunCalc-style solar maths for Sydney ------------------------- */
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
  const f = (d: Date) => d.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
  const g = f(t.golden);
  const big = $('[data-golden]');
  if (big) {
    const [time, ap] = g.split(' ');
    big.innerHTML = `${time}<small>${(ap ?? '').toLowerCase()}</small>`;
  }
  $$('[data-golden-text]').forEach((el) => (el.textContent = g));
  $$('[data-sunset]').forEach((el) => (el.textContent = f(t.sunset)));
  $$('[data-sunrise]').forEach((el) => (el.textContent = f(t.sunrise)));
  const sun = $<SVGCircleElement>('.gd-sun');
  if (sun) {
    const k = (now.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
    const u = clamp(k, 0, 1);
    const x = (1 - u) ** 2 * 6 + 2 * (1 - u) * u * 60 + u ** 2 * 114;
    const y = (1 - u) ** 2 * 40 + 2 * (1 - u) * u * -14 + u ** 2 * 40;
    sun.setAttribute('cx', x.toFixed(1));
    sun.setAttribute('cy', (k < 0 || k > 1 ? 44 : y).toFixed(1));
    sun.style.opacity = k < 0 || k > 1 ? '0.4' : '1';
  }
}

/* Commits: scrub the year ---------------------------------------------------- */
function commits(data: PageData) {
  const card = $('.c-commits');
  const svg = $<SVGSVGElement>('[data-cm-chart]');
  if (!card || !svg) return;
  const s = data.weekly;
  if (s.length < 2) return;
  const val = $('[data-cm-val]')!;
  const lbl = $('[data-cm-lbl]')!;
  const chg = $('[data-cm-chg]')!;
  const xLine = $<SVGLineElement>('.cm-x', svg)!;
  const dot = $<SVGCircleElement>('.cm-dot', svg)!;
  const hi = Math.max(4, ...s) * 1.04;
  const sx = (i: number) => (i / (s.length - 1)) * 200;
  const sy = (v: number) => 56 - (v / hi) * 54;
  const rest = { val: val.textContent, lbl: lbl.textContent, chg: chg.textContent };
  const at = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const i = Math.round(clamp((clientX - r.left) / r.width, 0, 1) * (s.length - 1));
    const x = sx(i).toFixed(2);
    xLine.setAttribute('x1', x);
    xLine.setAttribute('x2', x);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', sy(s[i]).toFixed(2));
    val.textContent = s[i].toLocaleString('en-AU');
    const d = data.weekStarts[i] ? new Date(`${data.weekStarts[i]}T00:00:00`) : null;
    lbl.textContent = d ? `by the week of ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : '';
    chg.textContent = `+${s[i] - (s[i - 1] ?? 0)} that week`;
    card.setAttribute('data-scrub', '');
  };
  svg.addEventListener('pointermove', (e) => at(e.clientX));
  svg.addEventListener('pointerdown', (e) => at(e.clientX));
  svg.addEventListener('pointerleave', () => {
    card.removeAttribute('data-scrub');
    val.textContent = rest.val;
    lbl.textContent = rest.lbl;
    chg.textContent = rest.chg;
    dot.setAttribute('cx', '200');
    dot.setAttribute('cy', sy(s[s.length - 1]).toFixed(2));
  });
}

/* GitHub: tooltip ------------------------------------------------------------ */
function github() {
  const card = $('.c-github');
  const tip = $('[data-gh-tip]');
  const grid = $('.gh-grid');
  if (!card || !tip || !grid) return;
  grid.addEventListener('pointerover', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('i[data-date]');
    if (!cell) return;
    const c = +cell.dataset.c!;
    const d = new Date(`${cell.dataset.date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    tip.innerHTML = `<b>${c === 0 ? 'No' : c} contribution${c === 1 ? '' : 's'}</b> <span>${d}</span>`;
    const r = cell.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${clamp(r.left + r.width / 2 - cr.left, half + 8, cr.width - half - 8)}px`;
    tip.style.top = `${r.top - cr.top}px`;
  });
  grid.addEventListener('pointerleave', () => (tip.hidden = true));
}

/* Projects: hover a name, read its line -------------------------------------- */
function projects() {
  const blurb = $('[data-pj-blurb]');
  const text = $('[data-pj-text]');
  const when = $('[data-pj-when]');
  const links = $$<HTMLAnchorElement>('.pj-list a');
  if (!blurb || !text || !when || !links.length) return;
  const set = (a: HTMLAnchorElement) => {
    if (text.textContent === a.dataset.blurb) return;
    text.textContent = a.dataset.blurb ?? '';
    when.textContent = a.dataset.when || 'Live from GitHub';
    blurb.removeAttribute('data-swap');
    void blurb.offsetWidth;
    blurb.setAttribute('data-swap', '');
  };
  links.forEach((a) => {
    a.addEventListener('pointerenter', () => set(a));
    a.addEventListener('focus', () => set(a));
  });
  $('.pj-list')?.addEventListener('pointerleave', () => set(links[0]));
}

/* Contact: copy the address ---------------------------------------------------- */
function contact() {
  $$<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const label = $('[data-copy-label]', b)!;
      try {
        await navigator.clipboard.writeText(b.dataset.copy!);
        b.setAttribute('data-copied', '');
        label.textContent = 'Copied';
        toast('Email copied');
      } catch {
        location.href = `mailto:${b.dataset.copy}`;
        return;
      }
      setTimeout(() => {
        b.removeAttribute('data-copied');
        label.textContent = 'Copy';
      }, 1800);
    }),
  );
}

/* Notes reader -------------------------------------------------------------- */
function reader() {
  const dlg = $<HTMLDialogElement>('[data-reader]');
  if (!dlg) return;
  const list = $('[data-rd-list]', dlg)!;
  const notes = $$('[data-note]', dlg);
  const pos = $('[data-rd-pos]', dlg)!;
  const scroller = $('[data-rd-scroll]', dlg)!;
  const steps = $$<HTMLButtonElement>('[data-rd-step]', dlg);
  const foot = $('.rd-foot', dlg)!;
  const total = notes.length;
  let cur: number | 'index' = 'index';
  const show = (i: number | 'index') => {
    cur = i;
    list.hidden = i !== 'index';
    notes.forEach((n, j) => (n.hidden = j !== i));
    foot.hidden = i === 'index';
    pos.textContent = i === 'index' ? `${total} notes` : `${String(i + 1).padStart(2, '0')} / ${total}`;
    if (i !== 'index') {
      steps[0].disabled = i === 0;
      steps[1].disabled = i === total - 1;
    }
    scroller.scrollTop = 0;
  };
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open-note]');
    if (!b) return;
    const v = b.dataset.openNote!;
    show(v === 'index' ? 'index' : +v);
    if (!dlg.open) dlg.showModal();
  });
  $('[data-rd-index]', dlg)!.addEventListener('click', () => show('index'));
  $('[data-rd-close]', dlg)!.addEventListener('click', () => dlg.close());
  steps.forEach((s) => s.addEventListener('click', () => typeof cur === 'number' && show(clamp(cur + +s.dataset.rdStep!, 0, total - 1))));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (typeof cur !== 'number') return;
    if (e.key === 'ArrowRight') show(clamp(cur + 1, 0, total - 1));
    if (e.key === 'ArrowLeft') show(clamp(cur - 1, 0, total - 1));
  });
}

