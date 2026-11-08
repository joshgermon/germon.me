/**
 * System · Poster — behaviour. Copy of widgets-system/app.ts, calmer:
 * no Now Playing, no Weather; the hero is hero.ts in this folder (name / poster).
 *
 * Original notes:
 *  - Lock-screen glass clock with depth effect (hero.ts)
 *  - Dynamic Island: compact leading/trailing activities, expanded on hover,
 *    contact card on tap; widgets talk to it (music, copy, build, sections)
 *  - Sheets that grow out of the tapped widget, in that widget's material
 *  - Terminal (terminal.ts), live Sydney weather (Open-Meteo), Wallet stack
 *    of roles, real commits as a Stocks chart, Now Playing, golden hour,
 *    mini calendar, contribution tooltips, side rail
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass';
import { hero } from './hero';
import { sydneyNow } from '@/concepts/widgets-system/hero';
import { terminal } from '@/concepts/widgets-system/terminal';

const reduced = prefersReducedMotion();
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const emit = (name: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(name, { detail }));
const TZ = 'Australia/Sydney';

type PageData = {
  weekly: number[];
  weekStarts: string[];
  last30: number;
  delta: number;
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
  const root = document.documentElement;
  root.setAttribute('data-js', '');
  const data = JSON.parse($('#ws-data')?.textContent ?? '{}') as PageData;
  hero();
  requestAnimationFrame(() => setTimeout(() => root.setAttribute('data-ready', ''), 60));
  fillTimes(document);
  setInterval(() => fillTimes(document), 15000);
  calendar();
  golden(document);
  island();
  const sheet = sheets();
  entrance();
  stocks(data);
  wallet();
  github();
  contact();
  rail(sheet);
  terminal(data, {
    openSheet: (name, from) => sheet?.open(from, name),
    toast: (t) => emit('ws:toast', t),
  });
}

/* Time & place -------------------------------------------------------------- */
function fillTimes(scope: ParentNode) {
  const now = new Date();
  const t = now.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
  $$('[data-syd-time]', scope).forEach((el) => (el.textContent = t));
  const tzName = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'AET';
  const syd = sydneyNow(now);
  let diff = Math.round((syd.h * 60 + syd.m - (now.getHours() * 60 + now.getMinutes())) / 30) / 2;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  const long = diff === 0 ? 'Same time as you' : `${Math.abs(diff)} hr${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} you`;
  $$('[data-syd-diff]', scope).forEach((el) => (el.textContent = long));
  $$('[data-syd-diff-short]', scope).forEach((el) => (el.textContent = diff === 0 ? tzName : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}h`));
  // (No lock-screen date here — and [data-date] now only marks contribution cells.)
}

function calendar() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = +get('year');
  const m = +get('month') - 1;
  const d = +get('day');
  const dow = $('[data-cal-dow]');
  const num = $('[data-cal-num]');
  const mon = $('[data-cal-month]');
  if (dow) dow.textContent = get('weekday').toUpperCase();
  if (num) num.textContent = String(d);
  if (mon) mon.textContent = new Date(y, m, 1).toLocaleDateString('en-AU', { month: 'long' });
  const grid = $('[data-cal-grid]');
  if (!grid) return;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const cells: string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((c) => `<span>${c}</span>`);
  for (let i = first - 1; i >= 0; i--) cells.push(`<span class="is-muted">${prevDays - i}</span>`);
  for (let i = 1; i <= days; i++) cells.push(`<span${i === d ? ' class="is-today"' : ''}>${i}</span>`);
  const rows = Math.ceil((cells.length - 7) / 7);
  for (let i = 1; cells.length < 7 + rows * 7; i++) cells.push(`<span class="is-muted">${i}</span>`);
  grid.innerHTML = cells.join('');
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

function golden(scope: ParentNode) {
  const now = new Date();
  const t = sunTimes(now);
  const f = (d: Date) => d.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
  const g = f(t.golden);
  const big = $('[data-golden]', scope);
  if (big) {
    const [time, ap] = g.split(' ');
    big.innerHTML = `${time}<small>${(ap ?? '').toUpperCase()}</small>`;
  }
  $$('[data-golden-text]', scope).forEach((el) => (el.textContent = g));
  $$('[data-sunset]', scope).forEach((el) => (el.textContent = f(t.sunset)));
  $$('[data-sunrise]', scope).forEach((el) => (el.textContent = f(t.sunrise)));
  // Sun along the arc: quadratic bezier from (6,40) via (60,-14) to (114,40).
  const sun = $<SVGCircleElement>('.gd-sun', scope);
  if (sun) {
    const k = (now.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
    const u = clamp(k, 0, 1);
    const x = (1 - u) ** 2 * 6 + 2 * (1 - u) * u * 60 + u ** 2 * 114;
    const y = (1 - u) ** 2 * 40 + 2 * (1 - u) * u * -14 + u ** 2 * 40;
    sun.setAttribute('cx', x.toFixed(1));
    sun.setAttribute('cy', (k < 0 || k > 1 ? 46 : y).toFixed(1));
    sun.style.opacity = k < 0 || k > 1 ? '0.35' : '1';
  }
}

/* Entrance + small widget behaviours ---------------------------------------- */
function entrance() {
  const ws = $$('.w');
  if (reduced) {
    ws.forEach((w) => w.setAttribute('data-in', ''));
    return;
  }
  let batch = 0;
  let timer = 0;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const el = e.target as HTMLElement;
        el.style.setProperty('--d', `${0.35 * +(scrollY < 10) + batch++ * 0.045}s`);
        el.setAttribute('data-in', '');
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => (batch = 0), 120);
    },
    { threshold: 0.12 },
  );
  ws.forEach((w) => io.observe(w));
}

function onceVisible(el: Element, fn: () => void, threshold = 0.5) {
  const io = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        io.disconnect();
        fn();
      }
    },
    { threshold },
  );
  io.observe(el);
}

function stocks(data: PageData) {
  const series = data.weekly ?? [];
  const w = $('.stk');
  const svg = $<SVGSVGElement>('.stk-chart', w ?? document);
  if (!w || !svg || !series.length) return;
  const line = $<SVGPathElement>('.stk-line', svg)!;
  const x = $<SVGLineElement>('.stk-x', svg)!;
  const dot = $<SVGCircleElement>('.stk-dot', svg)!;
  const val = $('[data-stk-val]', w)!;
  const lbl = $('[data-stk-lbl]', w)!;
  const chg = $('[data-stk-chg]', w)!;
  const hi = Math.max(4, ...series) * 1.12;
  const restVal = val.textContent;
  const restLbl = lbl.textContent;
  const restChg = chg.textContent;
  if (!reduced) {
    // Reveal left→right with a clip (dash tricks + non-scaling strokes leave gaps).
    svg.style.clipPath = 'inset(-10% 100% -10% 0)';
    onceVisible(w, () => {
      svg.style.transition = 'clip-path 1.4s cubic-bezier(0.23, 1, 0.32, 1) 0.15s';
      svg.style.clipPath = 'inset(-10% 0% -10% 0)';
    });
  }
  const scrub = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1);
    const i = Math.round(t * (series.length - 1));
    const px = (i / (series.length - 1)) * 100;
    const py = 40 - (series[i] / hi) * 40;
    x.setAttribute('x1', String(px));
    x.setAttribute('x2', String(px));
    dot.setAttribute('cx', String(px));
    dot.setAttribute('cy', String(py));
    w.setAttribute('data-scrub', '');
    val.textContent = String(series[i]);
    const start = data.weekStarts?.[i];
    lbl.textContent = start ? `total by ${new Date(`${start}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : `week ${i + 1}`;
    chg.textContent = '';
  };
  svg.addEventListener('pointermove', scrub);
  svg.addEventListener('pointerdown', scrub);
  svg.addEventListener('pointerleave', () => {
    w.removeAttribute('data-scrub');
    val.textContent = restVal;
    lbl.textContent = restLbl;
    chg.textContent = restChg;
  });
}

/* Wallet: roles as cards ----------------------------------------------------------------
   Stacked like Apple Wallet: back cards show their top strip, the front card shows in
   full. Tap a back card to bring it forward; tap the front card to open its detail sheet.
   The front card tilts toward the pointer and its sheen follows, like moving a phone. */
function wallet() {
  const stack = $('[data-wal]');
  if (!stack) return;
  const slots = $$('.wal-slot', stack);
  let order = slots.map((_, i) => i); // order[0] is the front card
  const layout = () => {
    const n = order.length;
    order.forEach((idx, pos) => {
      const el = slots[idx];
      // Back cards stack from the top (oldest highest); the front card sits at the bottom.
      const slot = pos === 0 ? n - 1 : n - 1 - pos;
      el.style.setProperty('--slot', String(slot));
      el.style.zIndex = String(10 + slot);
      el.toggleAttribute('data-front', pos === 0);
    });
  };
  slots.forEach((el, idx) =>
    el.addEventListener('click', (e) => {
      if (order[0] === idx) return; // front card: the widget opens its sheet
      e.stopPropagation();
      order = [idx, ...order.filter((i) => i !== idx)];
      layout();
    }),
  );
  layout();

  // Tilt + sheen on the front card (mouse only; touch keeps it still).
  const wal = stack.closest<HTMLElement>('.wal');
  let raf = 0;
  wal?.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const c = $<HTMLElement>('.card', slots[order[0]]);
      if (!c) return;
      const r = c.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      c.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      c.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      c.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
      c.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
      c.setAttribute('data-tilt', '');
    });
  });
  wal?.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    $$('.card', stack).forEach((c) => {
      c.removeAttribute('data-tilt');
      c.style.removeProperty('--rx');
      c.style.removeProperty('--ry');
    });
  });

  // Detail sheet: open on the card that was in front; the list switches cards.
  document.addEventListener('ws:sheet-content', (e) => {
    const { name, root } = (e as CustomEvent<{ name: string; root: HTMLElement }>).detail;
    if (name !== 'career') return;
    const detail = $('[data-wal-detail]', root);
    if (!detail) return;
    const pick = (i: number, animate = true) => {
      $$('.wd-face', detail).forEach((f) => f.toggleAttribute('data-on', Number(f.dataset.i) === i));
      $$('.wd-info', detail).forEach((f) => f.toggleAttribute('data-on', Number(f.dataset.i) === i));
      $$<HTMLButtonElement>('[data-wd-pick]', detail).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wdPick) === i)));
      if (animate && !reduced) {
        $('.wd-card', detail)?.animate([{ transform: 'translateY(8px) scale(0.97)' }, { transform: 'none' }], {
          duration: 420,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        });
      }
    };
    pick(order[0], false);
    $$<HTMLButtonElement>('[data-wd-pick]', detail).forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.wdPick);
        pick(i);
        order = [i, ...order.filter((x) => x !== i)];
        layout();
      }),
    );
  });
}

/* Side rail: step between sections, say hi ------------------------------------------ */
function rail(sheet: ReturnType<typeof sheets>) {
  const sections = $$('#home, .grid');
  const current = () => {
    const mid = innerHeight * 0.4;
    let best = 0;
    sections.forEach((s, i) => {
      if (s.getBoundingClientRect().top <= mid) best = i;
    });
    return best;
  };
  $$<HTMLButtonElement>('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = clamp(current() + +(b.dataset.step ?? 1), 0, sections.length - 1);
      sections[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }),
  );
  const hi = $<HTMLButtonElement>('[data-say-hi]');
  hi?.addEventListener('click', () => {
    const ct = $('#contact');
    if (ct && sheet) sheet.open(ct, 'contact');
  });
}

function github() {
  const w = $('.gh');
  const tip = $('[data-gh-tip]', w ?? document);
  if (!w || !tip) return;
  w.addEventListener('pointerover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.gh-col i');
    if (!c || c.hasAttribute('data-pad')) return;
    const n = +(c.dataset.c ?? 0);
    const date = new Date(`${c.dataset.date}T00:00:00`);
    tip.textContent = `${n || 'No'} contribution${n === 1 ? '' : 's'} · ${date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const r = c.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    tip.style.left = `${clamp(r.left - wr.left + r.width / 2, 70, wr.width - 70)}px`;
    tip.style.top = `${r.top - wr.top}px`;
    tip.hidden = false;
  });
  w.addEventListener('pointerleave', () => (tip.hidden = true));
}

function contact() {
  $$<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = b.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard blocked (permissions / insecure context): fall back to a mailto.
        location.href = `mailto:${text}`;
        return;
      }
      b.setAttribute('data-copied', '');
      setTimeout(() => b.removeAttribute('data-copied'), 1600);
      emit('ws:toast', 'Email copied');
    }),
  );
}

/* Dynamic Island ------------------------------------------------------------- */
type View = 'idle' | 'hello' | 'building' | 'buildingx' | 'music' | 'musicx' | 'toast' | 'section' | 'contact';

function island() {
  const el = $('.island');
  if (!el) return;
  const root = document.documentElement;
  const views = new Map($$('.isl-view', el).map((v) => [v.dataset.view as View, v]));
  const size = (v: View) => {
    const vw = innerWidth;
    switch (v) {
      case 'hello':
        return { w: 326, h: 37, r: 18.5 };
      case 'building':
      case 'music':
        return { w: 196, h: 37, r: 18.5 };
      case 'toast':
        return { w: 210, h: 37, r: 18.5 };
      case 'section':
        return { w: 252, h: 37, r: 18.5 };
      case 'buildingx':
      case 'musicx':
        return { w: Math.min(372, vw - 24), h: 78, r: 39 };
      case 'contact':
        return { w: Math.min(430, vw - 16), h: vw < 480 ? 210 : 192, r: 44 };
      default:
        return { w: 126, h: 37, r: 18.5 };
    }
  };
  const cfg = { response: 0.5, damping: 0.72 };
  const w = new Spring(126, cfg);
  const h = new Spring(37, cfg);
  const r = new Spring(18.5, cfg);
  const loop = springLoop([w, h, r], () => {
    el.style.width = `${w.value}px`;
    el.style.height = `${h.value}px`;
    el.style.borderRadius = `${r.value}px`;
    el.toggleAttribute('data-big', h.value > 44);
  });

  let current: View = 'idle';
  let base: View = 'idle';
  let sheetOpen = false;
  let timer = 0;
  const go = (v: View) => {
    current = v;
    for (const [k, node] of views) node.toggleAttribute('data-on', k === v);
    const s = size(v);
    if (reduced) {
      w.set(s.w);
      h.set(s.h);
      r.set(s.r);
    } else {
      w.to(s.w);
      h.to(s.h);
      r.to(s.r);
    }
    loop.kick();
    el.setAttribute('aria-expanded', String(v === 'contact'));
  };
  const flash = (v: View, ms: number) => {
    if (current === 'contact' || sheetOpen) return;
    clearTimeout(timer);
    go(v);
    timer = window.setTimeout(() => go(base), ms);
  };

  // The island stays hidden while the lock screen settles, then drops in as a greeting.
  const reveal = reduced ? 0 : 1900;
  setTimeout(() => {
    root.setAttribute('data-island', '');
    if (!sheetOpen) go('hello');
  }, reveal);
  // After the greeting the island rests as a plain pill; it only grows for real events
  // (music playing, a copied email, a section change, the contact card).
  setTimeout(() => {
    if (current === 'hello') go('idle');
  }, reveal + 2600);

  const expand = { building: 'buildingx', music: 'musicx' } as Record<View, View>;
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && expand[current]) go(expand[current]);
  });
  el.addEventListener('pointerleave', () => {
    if (current === 'buildingx' || current === 'musicx') go(base);
  });
  const toggle = () => {
    clearTimeout(timer);
    go(current === 'contact' ? base : 'contact');
  };
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    toggle();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current === 'contact') go(base);
  });
  addEventListener('pointerdown', (e) => {
    if (current === 'contact' && !el.contains(e.target as Node)) go(base);
  });

  document.addEventListener('ws:sheet', (e) => {
    sheetOpen = (e as CustomEvent<boolean>).detail;
    clearTimeout(timer);
    el.toggleAttribute('data-away', sheetOpen); // never sit on top of an open sheet
    go(sheetOpen ? 'idle' : base);
  });
  document.addEventListener('ws:music', (e) => {
    base = (e as CustomEvent<boolean>).detail ? 'music' : 'idle';
    if (current !== 'contact' && !sheetOpen) go(base);
  });
  // Tapping the Memoji in the hero waves and says hi from the island.
  // (Both heroes have one; only the visible one ever gets clicked.)
  $$('.hero-me').forEach((me) => {
    me.addEventListener('click', () => {
      me.removeAttribute('data-wave');
      void me.offsetWidth;
      me.setAttribute('data-wave', '');
      flash('hello', 2400);
    });
    me.addEventListener('animationend', (e) => {
      if (e.animationName === 'me-wave') me.removeAttribute('data-wave');
    });
  });
  document.addEventListener('ws:toast', (e) => {
    const t = $('[data-isl-toast]', el);
    if (t) t.textContent = String((e as CustomEvent<string>).detail);
    flash('toast', 1800);
  });

  const label = $('[data-isl-section]', el);
  const count = $('[data-isl-count]', el);
  const groups = $$('#home, .grid');
  $('.ltb')?.addEventListener('tabchange', (e) => {
    const i = (e as CustomEvent<{ index: number }>).detail.index;
    const g = groups[i];
    if (!g || i === 0) return;
    if (label) label.textContent = g.dataset.title ?? '';
    if (count) count.textContent = `${$$('.w', g).length} widgets`;
    if (base !== 'idle') flash('section', 1500);
  });
}

/* Sheets ------------------------------------------------------------------------ */
type Rect = { x: number; y: number; w: number; h: number };

function sheets() {
  const sheet = $('.sheet');
  const scrim = $('.scrim');
  if (!sheet || !scrim) return null;
  const mini = $('.sheet-mini', sheet)!;
  const full = $('.sheet-full', sheet)!;
  const scroller = $('.sheet-scroll', sheet)!;
  const grab = $('.sheet-grab', sheet)!;
  const closeBtn = $('.sheet-close', sheet)!;
  const dark = new Set(['black', 'term', 'gh', 'art', 'dusk', 'sky']);

  const openCfg = { response: 0.52, damping: 0.84 };
  const x = new Spring(0, openCfg);
  const y = new Spring(0, openCfg);
  const w = new Spring(0, openCfg);
  const h = new Spring(0, openCfg);
  const p = new Spring(0, { response: 0.44, damping: 1 });
  let origin: HTMLElement | null = null;
  let from: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let state: 'closed' | 'open' | 'closing' = 'closed';
  let dragY = 0;
  let contentH = 0;

  const mobile = () => innerWidth < 681;
  const measure = (width: number) => {
    full.style.width = `${width}px`;
    full.style.height = 'auto';
    scroller.style.flex = 'none';
    contentH = full.scrollHeight;
    full.style.height = '';
    scroller.style.flex = '';
  };
  const targetRect = (): Rect => {
    const vw = innerWidth;
    const vh = innerHeight;
    if (mobile()) return { x: 8, y: 56, w: vw - 16, h: vh - 64 };
    const ww = Math.min(720, vw - 64);
    const hh = Math.min(vh - 96, 800, Math.max(340, contentH + 8));
    return { x: (vw - ww) / 2, y: Math.max(48, (vh - hh) / 2), w: ww, h: hh };
  };
  const rectOf = (el: HTMLElement): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const apply = () => {
    const pv = clamp(p.value, 0, 1);
    sheet.style.left = `${x.value}px`;
    sheet.style.top = `${y.value + dragY}px`;
    sheet.style.width = `${Math.max(1, w.value)}px`;
    sheet.style.height = `${Math.max(1, h.value)}px`;
    mini.style.opacity = String(clamp(1 - pv / 0.35, 0, 1));
    mini.style.transform = `scale(${Math.min(w.value / from.w, h.value / from.h)})`;
    full.style.opacity = String(clamp((pv - 0.3) / 0.5, 0, 1));
    full.style.transform = `translateY(${(1 - pv) * 24}px)`;
    scrim.style.opacity = String(pv * (1 - clamp(dragY / 600, 0, 0.8)));
  };
  const loop = springLoop([x, y, w, h, p], () => {
    apply();
    if (state === 'closing' && p.value < 0.002 && Math.abs(w.value - from.w) < 0.5 && Math.abs(h.value - from.h) < 0.5) finishClose();
  });

  const finishClose = () => {
    state = 'closed';
    emit('ws:sheet', false);
    sheet.hidden = true;
    scrim.hidden = true;
    origin?.removeAttribute('data-hidden');
    origin?.focus({ preventScroll: true });
    origin = null;
    document.documentElement.style.overflow = '';
  };

  const openFrom = (el: HTMLElement, name = el.dataset.sheet) => {
    const tpl = $<HTMLTemplateElement>(`template[data-sheet-for="${name}"]`);
    if (!tpl) return;
    if (state === 'closing' && origin === el) {
      state = 'open';
      const t = targetRect();
      x.to(t.x, openCfg);
      y.to(t.y, openCfg);
      w.to(t.w, openCfg);
      h.to(t.h, openCfg);
      p.to(1);
      loop.kick();
      return;
    }
    if (state !== 'closed') finishClose();
    origin = el;
    from = rectOf(el);
    const mat = name === 'rq' ? 'term' : (el.dataset.material ?? 'light');
    sheet.dataset.tone = dark.has(mat) ? 'dark' : mat === 'paper' ? 'paper' : 'light';
    mini.innerHTML = '';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.removeAttribute('data-sheet');
    clone.removeAttribute('data-hidden');
    clone.querySelectorAll('liquid-glass, input, [id]').forEach((n) => (n.tagName === 'LIQUID-GLASS' || n.tagName === 'INPUT' ? n.remove() : n.removeAttribute('id')));
    clone.style.cssText = `width:${from.w}px;height:${from.h}px;border-radius:var(--r);`;
    mini.style.width = `${from.w}px`;
    mini.style.height = `${from.h}px`;
    mini.style.transformOrigin = '0 0';
    mini.append(clone);
    scroller.innerHTML = '';
    scroller.append(tpl.content.cloneNode(true));
    fillTimes(scroller);
    golden(scroller);
    emit('ws:sheet-content', { name, root: scroller });
    $$('[data-wx-sheet-now]', scroller).forEach((el) => (el.textContent = document.documentElement.dataset.wxNow ?? '—'));
    scroller.scrollTop = 0;
    sheet.hidden = false;
    sheet.style.visibility = 'hidden';
    measure(mobile() ? innerWidth - 16 : Math.min(720, innerWidth - 64));
    sheet.style.visibility = '';
    const t = targetRect();
    full.style.width = `${t.w}px`;
    for (const s of [x, y, w, h]) Object.assign(s, openCfg);
    x.set(from.x);
    y.set(from.y);
    w.set(from.w);
    h.set(from.h);
    p.set(0);
    dragY = 0;
    scrim.hidden = false;
    el.setAttribute('data-hidden', '');
    document.documentElement.style.overflow = 'hidden';
    state = 'open';
    emit('ws:sheet', true);
    apply();
    if (reduced) {
      x.set(t.x);
      y.set(t.y);
      w.set(t.w);
      h.set(t.h);
      p.set(1);
      apply();
    } else {
      x.to(t.x);
      y.to(t.y);
      w.to(t.w);
      h.to(t.h);
      p.to(1);
      loop.kick();
    }
    sheet.setAttribute('aria-label', el.getAttribute('aria-label') ?? 'Details');
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 60);
  };

  const close = (velocity = 0) => {
    if (state !== 'open' || !origin) return;
    state = 'closing';
    from = rectOf(origin);
    const cfg = { response: 0.42, damping: 0.92 };
    y.value += dragY;
    dragY = 0;
    x.to(from.x, cfg);
    y.to(from.y, { ...cfg, velocity });
    w.to(from.w, cfg);
    h.to(from.h, cfg);
    p.to(0);
    if (reduced) {
      finishClose();
      return;
    }
    loop.kick();
  };

  for (const el of $$('[data-sheet]')) {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, button, .stk-chart')) return;
      if (el.hasAttribute('data-dragged')) return;
      openFrom(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFrom(el);
      }
    });
  }
  scrim.addEventListener('click', () => close());
  closeBtn.addEventListener('click', () => close());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  let dragging = false;
  let startY = 0;
  let hist: { y: number; t: number }[] = [];
  const begin = (e: PointerEvent) => {
    if (state !== 'open') return;
    if ((e.target as HTMLElement).closest('a, button, summary')) return;
    if (e.currentTarget === scroller && (scroller.scrollTop > 0 || e.pointerType !== 'mouse')) return;
    dragging = true;
    startY = e.clientY - dragY;
    hist = [{ y: e.clientY, t: e.timeStamp }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    dragY = dy >= 0 ? dy : -rubberband(-dy, 400);
    hist.push({ y: e.clientY, t: e.timeStamp });
    if (hist.length > 6) hist.shift();
    apply();
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const a = hist[0];
    const b = hist[hist.length - 1];
    const dt = (b.t - a.t) / 1000;
    const v = dt > 0 ? (b.y - a.y) / dt : 0;
    if (dragY + project(v, 0.99) > h.value * 0.3 || v > 900) close(v);
    else {
      y.value += dragY;
      dragY = 0;
      y.to(targetRect().y, { velocity: v, response: 0.4, damping: 0.8 });
      loop.kick();
    }
  };
  for (const el of [grab, scroller]) {
    el.addEventListener('pointerdown', begin);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  addEventListener('resize', () => {
    if (state !== 'open') return;
    const t = targetRect();
    x.set(t.x);
    y.set(t.y);
    w.set(t.w);
    h.set(t.h);
    full.style.width = `${t.w}px`;
    apply();
  });

  return { open: (el: HTMLElement, name: string) => openFrom(el, name) };
}
