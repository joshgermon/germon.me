/**
 * Bento · Dots — behaviour.
 *  - dot field (dots.ts): fades in first, a ripple leaves the Memoji on load,
 *    clicks on bare background drop a ripple
 *  - entrance: intro, then cards in a short stagger (CSS, gated on data-ready)
 *  - card spotlight (cursor-follow light + hairline), detail sheets (sheet.ts)
 *  - nav indicator: one of the field's own dots, lit under the active item
 *  - passes stack, commits scrub, contribution tooltips, golden hour (solar
 *    maths), the coffee calendar, copy email, the terminal (from Widgets · System)
 */
import { prefersReducedMotion } from '@/lib/glass';
import { terminal } from '@/concepts/widgets-system/terminal';
import { dots } from './dots';
import { sheets } from './sheet';

const reduced = prefersReducedMotion();
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const TZ = 'Australia/Sydney';

type PageData = {
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
  const root = document.documentElement;
  root.setAttribute('data-js', '');
  const data = JSON.parse($('#bd-data')?.textContent ?? '{}') as PageData;

  // Dots first, then everything else.
  const canvas = $<HTMLCanvasElement>('.bd-dots');
  const field = canvas ? dots(canvas, reduced) : null;
  requestAnimationFrame(() => {
    field?.show();
    setTimeout(() => root.setAttribute('data-ready', ''), reduced ? 0 : 120);
    // The first ripple leaves the Memoji as the cards arrive.
    const me = $('.bd-me');
    if (me && field)
      setTimeout(() => {
        const r = me.getBoundingClientRect();
        field.ripple(r.left + r.width / 2, r.top + r.height / 2, 1);
      }, 520);
  });

  fillTimes(document);
  setInterval(() => fillTimes(document), 15000);
  golden(document);
  coffee(data.profile.email);
  setInterval(() => coffee(data.profile.email), 60000);

  const sheet = sheets(reduced, (name, scope) => {
    fillTimes(scope);
    golden(scope);
    if (name === 'career') walletDetail(scope);
    if (name === 'notes' && pendingNote != null) {
      const d = $<HTMLDetailsElement>(`details[data-i="${pendingNote}"]`, scope);
      if (d) {
        d.open = true;
        requestAnimationFrame(() => (scope.scrollTop = Math.max(0, d.offsetTop - scope.offsetTop - 64)));
      }
    }
    pendingNote = null;
  });

  spotlight();
  wallet();
  commits(data);
  github();
  copy();
  notes(sheet);
  nav(sheet);
  navDot(field);
  sayHi(field);
  backgroundRipples(field);
  terminal(data, {
    openSheet: (name, from) => sheet?.open(from, name),
    toast: () => {},
  });
}

/* Time & place -------------------------------------------------------------------------------- */
function sydneyParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { h: +get('hour'), m: +get('minute'), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
}

function fillTimes(scope: ParentNode) {
  const now = new Date();
  const t = now.toLocaleTimeString('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
  $$('[data-syd-time]', scope).forEach((el) => (el.textContent = t));
  const syd = sydneyParts(now);
  let diff = Math.round((syd.h * 60 + syd.m - (now.getHours() * 60 + now.getMinutes())) / 30) / 2;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  const tzName = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'AET';
  const long = diff === 0 ? 'Same time as you' : `${Math.abs(diff)} hr${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} you`;
  $$('[data-syd-diff]', scope).forEach((el) => (el.textContent = long));
  $$('[data-syd-diff-short]', scope).forEach((el) => (el.textContent = diff === 0 ? tzName : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}h vs you`));
}

/** Sydney's calendar date for a moment, as a UTC-midnight Date (safe for day arithmetic). */
function sydneyDate(d = new Date()) {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/* Coffee: a week of mornings ---------------------------------------------------------------------
   Mon–Fri of the current Sydney week. Mornings that have gone (or today after 10am) are dashed
   out; on a weekend, or once Friday's slot has passed, it rolls to next week. Each open day is a
   mailto that names the morning. */
const COFFEE_END = 10; // the slot is 8–10am
function coffee(email: string) {
  const cal = $('[data-cf-cal]');
  if (!cal) return;
  const syd = sydneyParts();
  const today = sydneyDate();
  const dow = (today.getUTCDay() + 6) % 7; // Mon = 0
  const monday = new Date(today.valueOf() - dow * 86400000);
  const gone = (i: number) => i < dow || (i === dow && syd.h >= COFFEE_END);
  if (dow >= 5 || gone(4)) monday.setUTCDate(monday.getUTCDate() + 7);
  const thisWeek = monday.valueOf() <= today.valueOf();
  const days = Array.from({ length: 5 }, (_, i) => new Date(monday.valueOf() + i * 86400000));
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-AU', { timeZone: 'UTC', ...o });

  $$<HTMLAnchorElement>('[data-cf-day]', cal).forEach((a, i) => {
    const d = days[i];
    const off = thisWeek && gone(i);
    const isToday = thisWeek && i === dow;
    const label = f(d, { weekday: 'long', day: 'numeric', month: 'long' });
    $('[data-cf-date]', a)!.textContent = String(d.getUTCDate());
    a.toggleAttribute('data-off', off);
    a.toggleAttribute('data-today', isToday);
    a.setAttribute('aria-label', off ? `${label} — gone` : `Book coffee on ${isToday ? 'today, ' : ''}${label}, 8–10am`);
    a.title = off ? '' : `${f(d, { weekday: 'short', day: 'numeric', month: 'short' })}, 8–10am`;
    if (off) {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
    } else {
      a.removeAttribute('aria-disabled');
      a.href = `mailto:${email}?subject=${encodeURIComponent('Coffee?')}&body=${encodeURIComponent(`Hi Josh — would ${f(d, { weekday: 'long', day: 'numeric', month: 'long' })}, sometime 8–10am, work for a coffee? `)}`;
    }
  });
  cal.setAttribute('aria-label', thisWeek ? 'Mornings this week' : 'Mornings next week');
  const range = $('[data-cf-range]');
  if (range) {
    const a = days[0];
    const b = days[4];
    range.textContent = a.getUTCMonth() === b.getUTCMonth() ? `${f(a, { day: 'numeric', month: 'short' })} – ${b.getUTCDate()}` : `${f(a, { day: 'numeric', month: 'short' })} – ${f(b, { day: 'numeric', month: 'short' })}`;
  }
}

/* Golden hour (SunCalc-style solar maths for Sydney) ------------------------------------------- */
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
    big.innerHTML = `${time}<small>${(ap ?? '').toLowerCase()}</small>`;
  }
  $$('[data-golden-text]', scope).forEach((el) => (el.textContent = g));
  $$('[data-sunset]', scope).forEach((el) => (el.textContent = f(t.sunset)));
  $$('[data-sunrise]', scope).forEach((el) => (el.textContent = f(t.sunrise)));
  // Sun along the arc: quadratic bezier (4,44) → (60,-16) → (116,44); below the horizon at night.
  const sun = $<SVGGElement>('[data-sun]', scope);
  if (sun) {
    const k = (now.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
    const u = clamp(k, 0, 1);
    const x = (1 - u) ** 2 * 4 + 2 * (1 - u) * u * 60 + u ** 2 * 116;
    const y = (1 - u) ** 2 * 44 + 2 * (1 - u) * u * -16 + u ** 2 * 44;
    const night = k < 0 || k > 1;
    sun.setAttribute('transform', `translate(${x.toFixed(1)} ${(night ? 50 : y).toFixed(1)})`);
    sun.style.opacity = night ? '0.4' : '1';
  }
}

/* Cards: cursor spotlight ---------------------------------------------------------------------- */
function spotlight() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const el of $$('.bx')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
      el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
    });
  }
}

/* Wallet ----------------------------------------------------------------------------------------
   Stacked like Wallet: back passes show their top strip, the front pass shows in full. Tap a
   back pass to bring it forward; tap the front one to open the detail sheet. */
let order: number[] = [];
let layoutWallet = () => {};
function wallet() {
  const stack = $('[data-wal]');
  if (!stack) return;
  const slots = $$('.wl-slot', stack);
  order = slots.map((_, i) => i);
  layoutWallet = () => {
    const n = order.length;
    order.forEach((idx, pos) => {
      const el = slots[idx];
      const slot = pos === 0 ? n - 1 : n - 1 - pos;
      el.style.setProperty('--slot', String(slot));
      el.style.zIndex = String(10 + slot);
      el.toggleAttribute('data-front', pos === 0);
    });
  };
  slots.forEach((el, idx) =>
    el.addEventListener('click', (e) => {
      if (order[0] === idx) return;
      e.stopPropagation();
      order = [idx, ...order.filter((i) => i !== idx)];
      layoutWallet();
    }),
  );
  layoutWallet();

  // A small tilt + sheen on the front pass (mouse only).
  const card = stack.closest<HTMLElement>('.bx');
  if (!card || reduced) return;
  let raf = 0;
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const c = $<HTMLElement>('.bp', slots[order[0]]);
      if (!c) return;
      const r = c.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      c.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
      c.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
      c.style.setProperty('--rx', `${((0.5 - py) * 6).toFixed(2)}deg`);
      c.style.setProperty('--ry', `${((px - 0.5) * 8).toFixed(2)}deg`);
      c.setAttribute('data-tilt', '');
    });
  });
  card.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    $$('.bp', stack).forEach((c) => {
      c.removeAttribute('data-tilt');
      c.style.removeProperty('--rx');
      c.style.removeProperty('--ry');
    });
  });
}

function walletDetail(root: HTMLElement) {
  const detail = $('[data-wal-detail]', root);
  if (!detail) return;
  const pick = (i: number, animate = true) => {
    $$('.wd-face', detail).forEach((f) => f.toggleAttribute('data-on', Number(f.dataset.i) === i));
    $$('.wd-info', detail).forEach((f) => f.toggleAttribute('data-on', Number(f.dataset.i) === i));
    $$<HTMLButtonElement>('[data-wd-pick]', detail).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wdPick) === i)));
    if (animate && !reduced) {
      $('.wd-card', detail)?.animate([{ opacity: 0.4, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], {
        duration: 420,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
    }
  };
  pick(order[0] ?? 0, false);
  $$<HTMLButtonElement>('[data-wd-pick]', detail).forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.wdPick);
      pick(i);
      order = [i, ...order.filter((x) => x !== i)];
      layoutWallet();
    }),
  );
}

/* Commits: scrub the line to read any week ------------------------------------------------------ */
function commits(data: PageData) {
  const series = data.weekly ?? [];
  const w = $('.cm');
  const svg = $<SVGSVGElement>('.cm-chart', w ?? document);
  if (!w || !svg || !series.length) return;
  const x = $<SVGLineElement>('.cm-x', svg)!;
  const dot = $('[data-cm-dot]', w)!;
  const val = $('[data-cm-val]', w)!;
  const lbl = $('[data-cm-lbl]', w)!;
  const hi = Math.max(4, ...series) * 1.08;
  const rest = { val: val.textContent, lbl: lbl.textContent, x: dot.style.getPropertyValue('--x'), y: dot.style.getPropertyValue('--y') };
  if (!reduced) {
    svg.style.clipPath = 'inset(-10% 100% -10% 0)';
    dot.style.opacity = '0';
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        svg.style.transition = 'clip-path 1.6s cubic-bezier(0.23, 1, 0.32, 1) 0.7s';
        svg.style.clipPath = 'inset(-10% 0% -10% 0)';
        dot.style.transition = 'opacity 0.4s ease 1.7s';
        dot.style.opacity = '1';
      },
      { threshold: 0.5 },
    );
    io.observe(w);
  }
  const scrub = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1);
    const i = Math.round(t * (series.length - 1));
    const px = (i / (series.length - 1)) * 100;
    const py = 40 - (series[i] / hi) * 38;
    x.setAttribute('x1', String(px));
    x.setAttribute('x2', String(px));
    dot.style.transition = 'none';
    dot.style.setProperty('--x', `${px}%`);
    dot.style.setProperty('--y', `${((py + 2) / 44) * 100}%`);
    w.setAttribute('data-scrub', '');
    val.textContent = series[i].toLocaleString('en-AU');
    const start = data.weekStarts?.[i];
    lbl.textContent = start ? `by ${new Date(`${start}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : `week ${i + 1}`;
  };
  svg.addEventListener('pointermove', scrub);
  svg.addEventListener('pointerdown', scrub);
  svg.addEventListener('pointerleave', () => {
    w.removeAttribute('data-scrub');
    val.textContent = rest.val;
    lbl.textContent = rest.lbl;
    dot.style.setProperty('--x', rest.x);
    dot.style.setProperty('--y', rest.y);
  });
}

/* GitHub tooltip + start scrolled to "now" on narrow cards -------------------------------------- */
function github() {
  const w = $('.gh');
  const tip = $('[data-gh-tip]', w ?? document);
  const sc = $('[data-gh-scroll]', w ?? document);
  if (!w || !tip) return;
  if (sc) {
    const toEnd = () => (sc.scrollLeft = sc.scrollWidth);
    toEnd();
    addEventListener('resize', toEnd);
  }
  w.addEventListener('pointerover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.gh-col i');
    if (!c || c.hasAttribute('data-pad')) return;
    const n = +(c.dataset.c ?? 0);
    const date = new Date(`${c.dataset.date}T00:00:00`);
    tip.textContent = `${n || 'No'} contribution${n === 1 ? '' : 's'} · ${date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const r = c.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    tip.style.left = `${clamp(r.left - wr.left + r.width / 2, 80, wr.width - 80)}px`;
    tip.style.top = `${r.top - wr.top}px`;
    tip.hidden = false;
  });
  w.addEventListener('pointerleave', () => (tip.hidden = true));
}

/* Contact: copy email ----------------------------------------------------------------------------- */
function copy() {
  $$<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = b.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        location.href = `mailto:${text}`;
        return;
      }
      b.setAttribute('data-copied', '');
      const t = b.querySelector('.ct-mail-t');
      const was = t?.textContent;
      if (t) t.textContent = 'Copied to clipboard';
      setTimeout(() => {
        b.removeAttribute('data-copied');
        if (t && was) t.textContent = was;
      }, 1600);
    }),
  );
}

/* Notes: a row opens the sheet straight to that note ---------------------------------------------- */
let pendingNote: number | null = null;
function notes(sheet: ReturnType<typeof sheets>) {
  const card = $<HTMLElement>('#notes');
  if (!card || !sheet) return;
  $$<HTMLButtonElement>('[data-note]', card).forEach((b) =>
    b.addEventListener('click', () => {
      pendingNote = Number(b.dataset.note);
      sheet.open(card, 'notes');
    }),
  );
}

/* Nav + intro pills: open the matching card's sheet (from the card if it's on screen). ------------ */
function nav(sheet: ReturnType<typeof sheets>) {
  if (!sheet) return;
  const cardFor: Record<string, string> = { notes: '#notes', career: '#work', contact: '#contact', golden: '#golden' };
  $$<HTMLAnchorElement>('[data-nav-sheet]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const name = a.dataset.navSheet!;
      const card = $<HTMLElement>(cardFor[name] ?? '');
      e.preventDefault();
      if (!card) return;
      const r = card.getBoundingClientRect();
      const visible = r.bottom > 40 && r.top < innerHeight - 40;
      sheet.open(visible ? card : a, name);
    }),
  );
}

/* Nav indicator: one of the grid's dots, lit ------------------------------------------------------
   The header is nudged down (and the intro up by the same amount, so nothing below moves) until a
   row of the lattice sits just under the links; the indicator is then placed on that row, in the
   column nearest the item. Positions use offsets (layout, not transforms) so the entrance
   animation doesn't skew them. Hover/focus glides it along the row; a click sends a ripple out. */
function navDot(field: ReturnType<typeof dots> | null) {
  const nav = $('[data-nav]');
  const dot = $('[data-nav-dot]', nav ?? document);
  const page = $('.bd');
  if (!nav || !dot || !page || !field) return;
  const links = $$<HTMLAnchorElement>('a', nav);
  const current = links.find((a) => a.hasAttribute('aria-current')) ?? links[0];
  const GAP_BELOW = 7; // px from the bottom of the link text to the lit dot
  let row = 0; // the dot row's y, in document px
  let target: HTMLAnchorElement | null = null;

  const docPos = (el: HTMLElement) => {
    let x = 0;
    let y = 0;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y };
  };

  const place = (a: HTMLAnchorElement | null, glide: boolean) => {
    target = a;
    if (!a || !a.offsetParent) {
      dot.removeAttribute('data-on');
      return;
    }
    const { gap, ox } = field.grid();
    const p = docPos(a);
    const n = docPos(nav);
    const cx = p.x + a.offsetWidth / 2;
    const col = ox + Math.round((cx - ox) / gap) * gap;
    dot.toggleAttribute('data-glide', glide && dot.hasAttribute('data-on'));
    dot.style.setProperty('--dx', `${(col - n.x).toFixed(2)}px`);
    dot.style.setProperty('--dy', `${(row - n.y).toFixed(2)}px`);
    a.toggleAttribute('data-lit', true);
    links.forEach((l) => l !== a && l.removeAttribute('data-lit'));
    dot.setAttribute('data-on', '');
  };

  const snap = () => {
    const { gap, oy } = field.grid();
    page.style.setProperty('--snap', '0px');
    const a = links.find((l) => l.offsetParent) ?? current;
    const text = a.offsetHeight - 12; // padding: 6px top and bottom
    const want = docPos(a).y + 6 + text + GAP_BELOW;
    // The lattice is fixed to the viewport; the header is at the top of the page, so compare at scroll 0.
    const j = Math.ceil((want - oy) / gap);
    const delta = oy + j * gap - want;
    page.style.setProperty('--snap', `${delta.toFixed(2)}px`);
    row = want + delta;
    place(target ?? current, false);
  };

  for (const a of links) {
    a.addEventListener('pointerenter', () => place(a, true));
    a.addEventListener('focus', () => place(a, true));
    a.addEventListener('pointerleave', () => place(current, true));
    a.addEventListener('blur', () => place(current, true));
    a.addEventListener('click', () => {
      const dx = parseFloat(dot.style.getPropertyValue('--dx')) || 0;
      field.ripple(docPos(nav).x + dx - scrollX, row - scrollY, 0.7);
    });
  }
  snap();
  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(snap, 140); // after the field has re-laid its lattice (80ms)
  });
  document.fonts?.ready.then(snap);
}

/* Memoji: a little hello, and a ripple through the dots. ------------------------------------------- */
function sayHi(field: ReturnType<typeof dots> | null) {
  const me = $('[data-say-hi]');
  if (!me) return;
  me.addEventListener('click', () => {
    const r = me.getBoundingClientRect();
    field?.ripple(r.left + r.width / 2, r.top + r.height / 2, 1.1);
    if (!reduced)
      me.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }],
        { duration: 700, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
  });
}

/* Clicking bare background drops a ripple where you clicked. -------------------------------------- */
function backgroundRipples(field: ReturnType<typeof dots> | null) {
  if (!field) return;
  addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.bx, a, button, input, .sh, .sh-scrim')) return;
    field.ripple(e.clientX, e.clientY, 0.9);
  });
}
