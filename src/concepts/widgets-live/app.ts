/**
 * Widgets: Live — behaviour.
 * Every widget is a small toy; the Dynamic Island hears about all of it.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass';
import { mountShell } from './shell';
import type { LiveData } from './types';

const reduced = prefersReducedMotion();
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const on = <T = unknown>(name: string, fn: (d: T) => void) =>
  document.addEventListener(name, (e) => fn((e as CustomEvent<T>).detail));
const velocity = (h: { p: number; t: number }[]) => {
  if (h.length < 2) return 0;
  const a = h[0];
  const b = h[h.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? (b.p - a.p) / dt : 0;
};
const thumb = (src: string) => src.replace(/\/\d+\/\d+$/, '/96/96');

let data: LiveData;

export function boot() {
  data = JSON.parse($('#wl-data')!.textContent!);
  wallpaper();
  entrances();
  const isl = island();
  clock();
  liveActivity(isl);
  stack();
  chart();
  deck(isl);
  reader();
  nav();

  const term = $('.term');
  if (term) {
    const shell = mountShell(term, data);
    isl.booting = true;
    shell.boot().then(() => (isl.booting = false));
  }
}

/* Wallpaper ------------------------------------------------------------------ */
function wallpaper() {
  const img = $<HTMLImageElement>('.wp img');
  if (!img || reduced) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const t = scrollY / max;
    img.style.transform = `translate3d(0, ${-t * 2.5}%, 0) scale(${1.07 - t * 0.03})`;
  };
  addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
  update();
}

/* Entrances: sections rise in as they arrive --------------------------------- */
function entrances() {
  const secs = $$('.sec');
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute('data-in', '');
        io.unobserve(e.target);
        e.target.dispatchEvent(new CustomEvent('wl:in'));
      }
    },
    { threshold: 0.12 },
  );
  secs.forEach((s) => io.observe(s));
  requestAnimationFrame(() => document.documentElement.setAttribute('data-ready', ''));
}

/* Navigation ------------------------------------------------------------------ */
function nav() {
  on<string>('wl:nav', (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Let the shell print first, then glide.
    setTimeout(() => {
      if (id === 'today') scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, 420);
  });
}

/* Dynamic Island ---------------------------------------------------------------- */
type View = 'boot' | 'idle' | 'la' | 'cmd' | 'photo' | 'section' | 'commit' | 'contact';
type Island = ReturnType<typeof island>;

function island() {
  const el = $('.island')!;
  const glass = $<HTMLElement>('.isl-glass', el)!;
  const hit = $<HTMLButtonElement>('.isl-hit', el)!;
  const views = new Map($$('.isl-view', el).map((v) => [v.dataset.view as View, v]));
  const cfg = { response: 0.5, damping: 0.72 };
  const w = new Spring(126, cfg);
  const h = new Spring(37, cfg);
  const r = new Spring(18.5, cfg);
  const loop = springLoop([w, h, r], () => {
    el.style.width = `${w.value}px`;
    el.style.height = `${h.value}px`;
    el.style.borderRadius = `${r.value}px`;
    // Squash a touch as it grows — the island is a droplet, not a div.
    const stretch = clamp((w.velocity / 9000) * 0.06, -0.04, 0.04);
    el.style.scale = `${1 + stretch} ${1 - stretch}`;
  });

  let current: View = 'boot';
  let base: View = 'idle';
  let timer = 0;
  let lastEvent = 0;
  let hover = false;

  const size = (v: View) => {
    const max = innerWidth - 20;
    if (v === 'boot') return { w: 126, h: 37, r: 18.5 };
    if (v === 'idle') return { w: 204, h: 38, r: 19 };
    if (v === 'contact') {
      const card = $('.isl-card', el)!;
      const cw = Math.min(460, max);
      card.style.width = `${cw}px`;
      return { w: cw, h: card.offsetHeight, r: 40 };
    }
    const row = $('.isl-row', views.get(v)!)!;
    const ww = clamp(row.scrollWidth + 30, 150, Math.min(v === 'la' ? 420 : 380, max));
    const hh = v === 'la' ? 76 : 38;
    return { w: ww, h: hh, r: hh / 2 };
  };

  const go = (v: View) => {
    current = v;
    for (const [k, node] of views) {
      node.toggleAttribute('data-on', k === v);
      node.inert = k !== v;
    }
    el.dataset.state = v;
    const s = size(v);
    glass.setAttribute('radius', v === 'contact' ? '40' : 'pill');
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
    if (reduced) loop.kick();
    hit.setAttribute('aria-expanded', String(v === 'contact'));
    hit.setAttribute('aria-label', v === 'contact' ? 'Close contact card' : 'Open contact card');
  };
  const back = () => go(hover && base === 'idle' ? 'la' : base);
  const flash = (v: View, ms = 1900) => {
    if (current === 'contact' || api.sheet) return;
    clearTimeout(timer);
    lastEvent = performance.now();
    go(v);
    timer = window.setTimeout(back, ms);
  };

  const api = {
    booting: false,
    sheet: false,
    get quietFor() {
      return performance.now() - lastEvent;
    },
    flash,
    go,
    hold(v: View) {
      if (current === 'contact' || api.sheet) return;
      clearTimeout(timer);
      lastEvent = performance.now();
      go(v);
    },
    release(ms = 1500) {
      clearTimeout(timer);
      timer = window.setTimeout(back, ms);
    },
    is: (v: View) => current === v,
  };

  // Intro: wake into the expanded Live Activity, then settle into the compact one.
  setTimeout(() => go('la'), 450);
  setTimeout(() => current === 'la' && !hover && go('idle'), 3600);

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hover = true;
    if (current === 'idle') go('la');
  });
  el.addEventListener('pointerleave', () => {
    hover = false;
    if (current === 'la') go('idle');
  });
  const toggle = () => {
    clearTimeout(timer);
    go(current === 'contact' ? base : 'contact');
  };
  hit.addEventListener('click', toggle);
  $('.isl-card', el)?.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('a')) toggle();
  });
  $$('[data-contact]').forEach((b) => b.addEventListener('click', toggle));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current === 'contact') {
      go(base);
      hit.focus();
    }
  });
  addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (current === 'contact' && !el.contains(t) && !t.closest('[data-contact]')) go(base);
  });
  addEventListener('resize', () => go(current));

  // Terminal commands -----------------------------------------------------------
  const cmdText = $('[data-isl-cmd]', el)!;
  const status = $('[data-isl-status]', el)!;
  on<{ cmd: string; ok: boolean | null }>('wl:cmd', ({ cmd, ok }) => {
    if (api.booting) return;
    if (ok === null) {
      cmdText.textContent = cmd.length > 34 ? `${cmd.slice(0, 33)}…` : cmd;
      status.dataset.s = 'run';
      api.hold('cmd');
    } else {
      cmdText.textContent = cmd.length > 34 ? `${cmd.slice(0, 33)}…` : cmd;
      status.dataset.s = ok ? 'ok' : 'err';
      if (current !== 'cmd') api.hold('cmd');
      api.release(1500);
    }
  });
  on('wl:contact', () => setTimeout(() => current !== 'contact' && toggle(), 500));

  // Section changes (tab bar scroll-spy) -------------------------------------------
  const secLabel = $('[data-isl-section]', el)!;
  const secSub = $('[data-isl-sub]', el)!;
  const subs: Record<string, string> = { Today: 'shell · rq · clock', Work: 'career · numbers', Weekend: 'photos · notes' };
  const secs = $$('.sec');
  $('.ltb')?.addEventListener('tabchange', (e) => {
    const i = (e as CustomEvent<{ index: number }>).detail.index;
    const t = secs[i]?.dataset.title ?? '';
    secLabel.textContent = t;
    secSub.textContent = subs[t] ?? '';
    if (current === 'cmd') return; // the command that caused it is already showing
    flash('section', 1600);
  });

  return api;
}

/* StandBy clock -------------------------------------------------------------------- */
function sydneyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    month: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second'), mo: get('month') - 1 };
}

// Approximate Sydney sunrise/sunset (local clock time, minutes) by month.
const SUN: [number, number][] = [
  [354, 1208], [384, 1192], [405, 1162], [380, 1066], [400, 1027], [419, 1014],
  [420, 1025], [400, 1046], [362, 1066], [335, 1146], [342, 1180], [341, 1203],
];

function clock() {
  const root = $('.clock');
  if (!root) return;
  const dg = $$('[data-dg]', root);
  const ampm = $('[data-ck-ampm]', root)!;
  const dateEl = $('[data-ck-date]', root)!;
  const diffEl = $('[data-ck-diff]', root)!;
  const rise = $('[data-ck-rise]', root)!;
  const set = $('[data-ck-set]', root)!;
  const arc = $<SVGPathElement>('[data-ck-arc]', root)!;
  const sun = $('[data-ck-sun]', root)!;
  const fmt = (min: number) => {
    const h = Math.floor(min / 60);
    return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
  };

  const now = new Date();
  const syd = sydneyParts(now);
  let diff = Math.round((syd.h * 60 + syd.m - (now.getHours() * 60 + now.getMinutes())) / 30) / 2;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  diffEl.textContent =
    diff === 0 ? 'your time too' : `${Math.abs(diff)}h ${diff > 0 ? 'ahead of' : 'behind'} you`;

  const tick = () => {
    const d = new Date();
    const { h, m, mo } = sydneyParts(d);
    const h12 = h % 12 || 12;
    const vals = [Math.floor(h12 / 10), h12 % 10, Math.floor(m / 10), m % 10];
    dg.forEach((el, i) => {
      el.style.setProperty('--n', String(vals[i]));
      if (i === 0) el.toggleAttribute('data-hide', vals[0] === 0);
    });
    ampm.textContent = h < 12 ? 'am' : 'pm';
    root.setAttribute('aria-label', `Sydney, ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`);
    dateEl.textContent = d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' });
    const [sr, ss] = SUN[mo];
    rise.textContent = `↑ ${fmt(sr)}`;
    set.textContent = `↓ ${fmt(ss)}`;
    const mins = h * 60 + m;
    const t = clamp((mins - sr) / (ss - sr), 0, 1);
    const night = mins < sr || mins > ss;
    arc.style.strokeDasharray = `${t * 100} 100`;
    // Point on the cubic arc (matches the SVG path).
    const bz = (a: number, b: number, c: number, e: number) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e;
    sun.style.left = `${(bz(18, 90, 210, 282) / 300) * 100}%`;
    sun.style.top = `${(bz(36, -6, -6, 36) / 40) * 100}%`;
    sun.toggleAttribute('data-night', night);
  };
  tick();
  // Re-sync on the minute so the digits roll exactly when the minute does.
  const schedule = () => setTimeout(() => (tick(), schedule()), 60000 - (Date.now() % 60000) + 30);
  schedule();
  document.addEventListener('visibilitychange', tick);
}

/* rq Live Activity ------------------------------------------------------------------ */
function liveActivity(isl: Island) {
  const root = $('.la');
  if (!root) return;
  const pctEl = $('[data-la-pct]', root)!;
  const fill = $('[data-la-fill]', root)!;
  const roll = $('[data-la-roll]', root)!;
  const ago = $('[data-la-ago]', root)!;
  const eta = $('[data-la-eta]', root)!;
  const list = $('[data-la-list]', root)!;
  const toggle = $<HTMLButtonElement>('[data-la-toggle]', root)!;
  const islPct = $('[data-isl-pct]')!;
  const islPct2 = $('[data-isl-pct2]')!;
  const islRing = $<SVGCircleElement>('[data-isl-ring]')!;
  const islBar = $('[data-isl-bar]')!;
  const islCommit = $('[data-isl-commit]')!;
  const islHash = $('[data-isl-hash]')!;
  const islUp = $('[data-isl-up]')!;

  let pct = 72;
  let shown = 72;
  let k = 0;
  let last = Date.now();

  const paint = (p: number) => {
    pctEl.textContent = p.toFixed(1);
    fill.style.width = `${p}%`;
    islPct.textContent = `${Math.round(p)}%`;
    islPct2.textContent = `${Math.round(p)}%`;
    islRing.style.strokeDasharray = `${p} 100`;
    islBar.style.width = `${p}%`;
    eta.textContent = `~${Math.max(1, Math.round((100 - p) / 9))} weeks`;
  };
  paint(pct);

  const countTo = (to: number) => {
    const from = shown;
    const t0 = performance.now();
    const step = (t: number) => {
      const u = clamp((t - t0) / 900, 0, 1);
      const e = 1 - (1 - u) ** 3;
      shown = from + (to - from) * e;
      paint(shown);
      if (u < 1) requestAnimationFrame(step);
    };
    if (reduced) paint((shown = to));
    else requestAnimationFrame(step);
  };

  const push = () => {
    const prev = data.commits[k % data.commits.length];
    k++;
    const c = data.commits[k % data.commits.length];
    const inc = 0.4 + ((k * 37) % 7) / 10;
    pct = Math.min(99.4, pct + inc);
    last = Date.now();

    // Ticker: the old line rolls up and away, the new one rolls in from below.
    const old = roll.firstElementChild as HTMLElement | null;
    const next = document.createElement('span');
    next.className = 'la-commit';
    next.innerHTML = `<code>${c.h}</code>`;
    next.append(document.createTextNode(c.m));
    roll.append(next);
    if (!reduced) {
      next.animate([{ transform: 'translateY(110%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
      old?.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-110%)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.4,0,.6,1)' }).finished.then(() => old.remove());
    } else old?.remove();
    ago.textContent = 'just now';

    // The commit that just scrolled away becomes history.
    const li = document.createElement('li');
    li.innerHTML = `<code>${prev.h}</code><span></span><small>now</small>`;
    li.querySelector('span')!.textContent = prev.m;
    list.prepend(li);
    while (list.children.length > 4) list.lastElementChild?.remove();
    [...list.children].forEach((n, i) => {
      const s = n.querySelector('small');
      if (s && i > 0 && s.textContent === 'now') s.textContent = `${i * 2}m`;
    });

    islCommit.textContent = c.m;
    islHash.textContent = c.h;
    islUp.textContent = `+${inc.toFixed(1)}%`;
    countTo(pct);
    root.classList.remove('pulse');
    void root.offsetWidth;
    root.classList.add('pulse');
    if (isl.is('idle') && isl.quietFor > 7000 && !isl.booting) isl.flash('commit', 2200);
  };

  setInterval(() => {
    if (document.hidden) return;
    const s = Math.round((Date.now() - last) / 1000);
    ago.textContent = s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  }, 1000);
  setInterval(() => !document.hidden && push(), 11000);

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    root.toggleAttribute('data-open', open);
  });
}

/* Smart Stack (career) ------------------------------------------------------------------ */
function stack() {
  const w = $('.stackw');
  const root = $('[data-stack]');
  if (!w || !root) return;
  const cards = $$('.sc', root);
  const dots = $$('.stack-dots i', w);
  const pos = new Spring(0, { response: 0.42, damping: 0.84 });
  let H = root.clientHeight;
  let index = 0;

  const apply = () => {
    cards.forEach((c, i) => {
      const off = (i * H - pos.value) / H;
      const a = Math.min(Math.abs(off), 1.4);
      // A true pager, like iOS's Smart Stack: cards travel together, each one
      // shrinking and dimming a touch as it leaves the frame.
      c.style.transform = `translate3d(0, ${off * H}px, 0) scale(${1 - a * 0.07})`;
      c.style.opacity = String(clamp(1 - a * 0.7, 0, 1));
      c.toggleAttribute('inert', Math.abs(off) > 0.5);
    });
    const at = clamp(Math.round(pos.value / H), 0, cards.length - 1);
    dots.forEach((d, i) => d.toggleAttribute('data-on', i === at));
  };
  const loop = springLoop([pos], apply);
  new ResizeObserver(() => {
    H = root.clientHeight;
    pos.set(index * H);
    apply();
  }).observe(root);

  const goTo = (i: number, v = 0) => {
    index = clamp(i, 0, cards.length - 1);
    if (reduced) pos.set(index * H);
    else pos.to(index * H, { velocity: v });
    loop.kick();
    apply();
  };

  let dragging = false;
  let moved = false;
  let startY = 0;
  let startPos = 0;
  let hist: { p: number; t: number }[] = [];
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startY = e.clientY;
    startPos = pos.value;
    hist = [{ p: e.clientY, t: e.timeStamp }];
    pos.to(pos.value, { velocity: 0 });
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (!moved) {
      if (Math.abs(dy) < 6) return;
      moved = true;
      root.setPointerCapture(e.pointerId);
      w.setAttribute('data-drag', '');
    }
    hist.push({ p: e.clientY, t: e.timeStamp });
    if (hist.length > 6) hist.shift();
    const max = (cards.length - 1) * H;
    let p = startPos - dy;
    if (p < 0) p = -rubberband(-p, H);
    if (p > max) p = max + rubberband(p - max, H);
    pos.set(p);
    apply();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    w.removeAttribute('data-drag');
    if (!moved) return;
    const v = -velocity(hist);
    const target = clamp(Math.round((pos.value + project(v, 0.99)) / H), index - 1, index + 1);
    goTo(target, v);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  let acc = 0;
  let lock = 0;
  root.addEventListener(
    'wheel',
    (e) => {
      const dir = Math.sign(e.deltaY);
      if (!((dir > 0 && index < cards.length - 1) || (dir < 0 && index > 0))) return;
      e.preventDefault();
      if (performance.now() < lock) return;
      acc += e.deltaY;
      if (Math.abs(acc) > 30) {
        goTo(index + dir);
        acc = 0;
        lock = performance.now() + 450;
      }
    },
    { passive: false },
  );
  w.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') (e.preventDefault(), goTo(index + 1));
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') (e.preventDefault(), goTo(index - 1));
  });
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
  on<number>('wl:role', (i) => setTimeout(() => goTo(i), 500));
  apply();
}

/* Stats chart ------------------------------------------------------------------------- */
function chart() {
  const root = $('.chart');
  if (!root) return;
  const tl = data.timeline;
  const n = tl.length;
  const pts = tl.map((t, i) => ({ x: (i / (n - 1)) * 1000, y: 282 - (t.v / 100) * 250 }));
  // Catmull-Rom → cubic Bézier, for a calm line.
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  $('[data-ch-line]', root)!.setAttribute('d', d);
  $('[data-ch-area]', root)!.setAttribute('d', `${d} L1000,300 L0,300 Z`);
  const dotsEl = $('[data-ch-dots]', root)!;
  dotsEl.innerHTML = pts.map((p) => `<i style="left:${p.x / 10}%;top:${(p.y / 300) * 100}%"></i>`).join('');
  const dots = $$('i', dotsEl);
  const scrub = $('[data-ch-scrub]', root)!;
  const year = $('[data-ch-year]', root)!;
  const delta = $('[data-ch-delta]', root)!;
  const label = $('[data-ch-label]', root)!;
  const plot = $('[data-ch-plot]', root)!;
  let at = n - 1;

  const show = (i: number) => {
    at = clamp(i, 0, n - 1);
    const t = tl[at];
    year.textContent = String(t.y);
    delta.textContent = at === 0 ? 'day one' : `+${t.y - tl[0].y} yr${t.y - tl[0].y > 1 ? 's' : ''}`;
    label.textContent = t.label;
    scrub.style.left = `${pts[at].x / 10}%`;
    scrub.style.setProperty('--y', `${(pts[at].y / 300) * 100}%`);
    dots.forEach((dd, j) => dd.toggleAttribute('data-on', j === at));
    root.style.setProperty('--cut', `${100 - pts[at].x / 10}%`);
  };
  show(at);

  const fromX = (x: number) => {
    const r = plot.getBoundingClientRect();
    return Math.round(clamp((x - r.left) / r.width, 0, 1) * (n - 1));
  };
  plot.addEventListener('pointerdown', (e) => {
    plot.setPointerCapture(e.pointerId);
    root.setAttribute('data-scrub', '');
    show(fromX(e.clientX));
  });
  plot.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || plot.hasPointerCapture(e.pointerId)) {
      root.setAttribute('data-scrub', '');
      const i = fromX(e.clientX);
      if (i !== at) show(i);
    }
  });
  const leave = () => {
    root.removeAttribute('data-scrub');
    show(n - 1);
  };
  plot.addEventListener('pointerleave', leave);
  plot.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && setTimeout(leave, 900));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') (e.preventDefault(), root.setAttribute('data-scrub', ''), show(at - 1));
    if (e.key === 'ArrowRight') (e.preventDefault(), root.setAttribute('data-scrub', ''), show(at + 1));
  });
  root.addEventListener('blur', leave);

  // Count the stats up when the section arrives.
  const sec = root.closest('.sec')!;
  const count = () => {
    $$('[data-count]', root).forEach((dd, i) => {
      const raw = dd.dataset.count!;
      const num = parseFloat(raw);
      const suffix = raw.replace(/^[\d.]+/, '');
      if (reduced || !Number.isFinite(num)) return;
      const t0 = performance.now() + 250 + i * 90;
      const step = (t: number) => {
        const u = clamp((t - t0) / 1100, 0, 1);
        const e = 1 - (1 - u) ** 4;
        dd.textContent = `${Math.round(num * e)}${suffix}`;
        if (u < 1) requestAnimationFrame(step);
      };
      dd.textContent = `0${suffix}`;
      requestAnimationFrame(step);
    });
  };
  if (sec.hasAttribute('data-in')) count();
  else sec.addEventListener('wl:in', count, { once: true });
}

/* Photo deck --------------------------------------------------------------------------- */
function deck(isl: Island) {
  const root = $('[data-deck]');
  if (!root) return;
  const cards = $$('.card', root);
  const N = cards.length;
  const countEl = $('[data-deck-i]')!;
  const islThumb = $<HTMLImageElement>('[data-isl-thumb]')!;
  const islCap = $('[data-isl-caption]')!;
  const islCount = $('[data-isl-count]')!;
  let order = cards.map((_, i) => i); // order[0] is on top
  const st = cards.map(() => ({
    d: new Spring(0, { response: 0.5, damping: 0.8 }),
    x: new Spring(0, { response: 0.45, damping: 0.78 }),
    y: new Spring(0, { response: 0.45, damping: 0.78 }),
  }));
  const W = () => root.clientWidth;
  let lift = 0;

  const flying = new Set<number>();
  const token = cards.map(() => 0);

  const apply = () => {
    const ww = W();
    order.forEach((ci, depth) => {
      const s = st[ci];
      const c = cards[ci];
      const dv = s.d.value;
      const x = s.x.value;
      const y = s.y.value;
      const isTop = depth === 0 && !flying.has(ci);
      const dd = Math.min(dv, 3);
      const rot = (x / ww) * 14 + (ci % 2 ? 1 : -1) * Math.min(dv, 2) * 1.8;
      const sc = 1 - dd * 0.06 + (isTop ? lift * 0.015 : 0);
      c.style.transform = `translate3d(${x + (ci % 2 ? 1 : -1) * Math.min(dv, 2) * 6}px, ${y - dd * 34}px, 0) rotate(${rot}deg) scale(${sc})`;
      c.style.filter = dv > 0.05 ? `brightness(${1 - Math.min(dv, 2) * 0.12})` : '';
      const fade = clamp(1 - (Math.abs(x) - ww * 0.55) / (ww * 0.45), 0, 1);
      c.style.opacity = String(clamp(3 - dv, 0, 1) * fade);
      c.style.zIndex = String(flying.has(ci) ? N + 1 : N - depth);
      c.toggleAttribute('data-top', isTop);
    });
  };
  const all = st.flatMap((s) => [s.d, s.x, s.y]);
  const loop = springLoop(all, apply);
  order.forEach((ci, depth) => st[ci].d.set(depth));
  apply();

  const announce = (silent = false) => {
    const top = order[0];
    const p = data.photos[top];
    countEl.textContent = String(top + 1);
    cards.forEach((c, i) => c.setAttribute('aria-hidden', String(i !== top)));
    if (silent) return;
    islThumb.src = thumb(p.src);
    islCap.textContent = p.caption;
    islCount.textContent = `${top + 1}/${N}`;
    isl.flash('photo', 1800);
  };
  announce(true);

  const reflow = () => order.forEach((ci, depth) => (reduced ? st[ci].d.set(depth) : st[ci].d.to(depth)));
  const settle = (ci: number) => {
    const s = st[ci];
    s.x.response = s.y.response = 0.45;
    s.x.damping = s.y.damping = 0.78;
  };

  const flingOut = (dir: number, vx = 0, vy = 0) => {
    const top = order[0];
    const s = st[top];
    order = [...order.slice(1), top];
    if (reduced) {
      s.x.set(0);
      s.y.set(0);
      reflow();
      apply();
      announce();
      return;
    }
    // The rest rise at once; the thrown card keeps flying on top until it's gone,
    // then quietly re-joins at the back of the deck.
    order.slice(0, -1).forEach((ci, depth) => st[ci].d.to(depth));
    flying.add(top);
    const my = ++token[top];
    const ww = W();
    s.x.to(dir * ww * 1.15, { velocity: vx || dir * 2600, response: 0.5, damping: 1 });
    s.y.to(s.y.value + vy * 0.12, { velocity: vy, response: 0.5, damping: 1 });
    loop.kick();
    const t0 = performance.now();
    const wait = () => {
      if (token[top] !== my) return;
      if (Math.abs(s.x.value) < ww * 1.0 && performance.now() - t0 < 900) return void requestAnimationFrame(wait);
      flying.delete(top);
      s.x.set(0);
      s.y.set(0);
      s.d.set(N - 1);
      settle(top);
      apply();
    };
    requestAnimationFrame(wait);
    announce();
  };

  const bringBack = () => {
    const last = order[N - 1];
    token[last]++;
    flying.delete(last);
    settle(last);
    order = [last, ...order.slice(0, -1)];
    const s = st[last];
    s.d.set(0);
    if (reduced) {
      s.x.set(0);
      s.y.set(0);
      reflow();
      apply();
    } else {
      if (Math.abs(s.x.value) < 1) s.x.set(-W() * 1.05);
      s.y.set(-20);
      s.x.to(0);
      s.y.to(0);
      reflow();
      loop.kick();
    }
    announce();
  };

  const goTo = (i: number) => {
    if (order[0] === i) return;
    const k = order.indexOf(i);
    order = [...order.slice(k), ...order.slice(0, k)];
    reflow();
    order.forEach((ci) => {
      st[ci].x.to(0);
      st[ci].y.to(0);
    });
    if (!reduced) st[i].y.to(0, { velocity: -900 });
    loop.kick();
    apply();
    announce();
  };

  // Drag the top card in 2D; flick to send it to the back.
  let dragging = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  let hx: { p: number; t: number }[] = [];
  let hy: { p: number; t: number }[] = [];
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const top = order[0];
    if (!(e.target as HTMLElement).closest(`[data-card="${top}"]`)) return;
    dragging = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    ox = st[top].x.value;
    oy = st[top].y.value;
    hx = [{ p: e.clientX, t: e.timeStamp }];
    hy = [{ p: e.clientY, t: e.timeStamp }];
    root.setPointerCapture(e.pointerId);
    lift = 1;
    root.setAttribute('data-drag', '');
    apply();
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    hx.push({ p: e.clientX, t: e.timeStamp });
    hy.push({ p: e.clientY, t: e.timeStamp });
    if (hx.length > 6) (hx.shift(), hy.shift());
    const s = st[order[0]];
    s.x.set(ox + dx);
    s.y.set(oy + (dy > 0 ? dy : -rubberband(-dy, 300)) * 0.6);
    apply();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    lift = 0;
    root.removeAttribute('data-drag');
    const s = st[order[0]];
    if (!moved) {
      flingOut(-1);
      return;
    }
    const vx = velocity(hx);
    const vy = velocity(hy);
    const projected = s.x.value + project(vx, 0.99);
    if (Math.abs(projected) > W() * 0.42) {
      flingOut(Math.sign(projected), vx, vy);
    } else {
      s.x.to(0, { velocity: vx });
      s.y.to(0, { velocity: vy });
      loop.kick();
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') (e.preventDefault(), flingOut(1));
    if (e.key === 'ArrowLeft') (e.preventDefault(), bringBack());
  });
  $('[data-deck-next]')?.addEventListener('click', () => flingOut(1));
  $('[data-deck-prev]')?.addEventListener('click', bringBack);
  on<number>('wl:photo', (i) =>
    setTimeout(() => {
      if (i >= 0) goTo(i);
      else {
        // `open photos`: a little shuffle to say hello.
        order.forEach((ci, depth) => !reduced && st[ci].x.to(0, { velocity: (depth % 2 ? 1 : -1) * 600 }));
        loop.kick();
      }
    }, 900),
  );
  addEventListener('resize', apply);
}

/* Notes reader sheet -------------------------------------------------------------------- */
type Rect = { x: number; y: number; w: number; h: number };

function reader() {
  const sheet = $('[data-sheet]');
  const scrim = $('[data-scrim]');
  if (!sheet || !scrim) return;
  const scroller = $('[data-rd-scroll]', sheet)!;
  const art = $('[data-rd]', sheet)!;
  const kicker = $('[data-rd-kicker]', sheet)!;
  const title = $('[data-rd-title]', sheet)!;
  const body = $('[data-rd-body]', sheet)!;
  const meta = $('[data-rd-meta]', sheet)!;
  const progress = $('[data-rd-progress]', sheet)!;
  const closeBtn = $<HTMLButtonElement>('[data-rd-close]', sheet)!;
  const prevBtn = $<HTMLButtonElement>('[data-rd-prev]', sheet)!;
  const nextBtn = $<HTMLButtonElement>('[data-rd-next]', sheet)!;
  const grab = $('[data-rd-grab]', sheet)!;
  const isl = () => document.querySelector('.island');

  const cfg = { response: 0.52, damping: 0.86 };
  const x = new Spring(0, cfg);
  const y = new Spring(0, cfg);
  const w = new Spring(0, cfg);
  const h = new Spring(0, cfg);
  const p = new Spring(0, { response: 0.45, damping: 1 });
  let from: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let origin: HTMLElement | null = null;
  let state: 'closed' | 'open' | 'closing' = 'closed';
  let dragY = 0;
  let idx = 0;
  const mobile = () => innerWidth < 700;

  const target = (): Rect => {
    const vw = innerWidth;
    const vh = innerHeight;
    if (mobile()) return { x: 0, y: 44, w: vw, h: vh - 44 + 40 };
    const ww = Math.min(760, vw - 64);
    return { x: (vw - ww) / 2, y: 40, w: ww, h: vh - 80 };
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
    sheet.style.borderRadius = `${18 + pv * (mobile() ? 12 : 18)}px`;
    sheet.style.setProperty('--p', pv.toFixed(3));
    scrim.style.opacity = String(pv * (1 - clamp(dragY / 600, 0, 0.8)));
  };
  const loop = springLoop([x, y, w, h, p], () => {
    apply();
    if (state === 'closing' && p.value < 0.01 && Math.abs(h.value - from.h) < 1 && Math.abs(w.value - from.w) < 1) finish();
  });

  const fill = (i: number) => {
    idx = clamp(i, 0, data.notes.length - 1);
    const n = data.notes[idx];
    const tpl = $<HTMLTemplateElement>(`template[data-note-body="${n.id}"]`);
    body.innerHTML = '';
    if (tpl) body.append(tpl.content.cloneNode(true));
    body.querySelector('h1')?.remove();
    body.querySelector('h2')?.remove();
    $$('a', body).forEach((a) => a.setAttribute('target', '_blank'));
    kicker.textContent = `${n.date} · ${n.mins} min read`;
    title.textContent = n.headline;
    meta.textContent = `Note ${data.notes.length - idx} of ${data.notes.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === data.notes.length - 1;
    scroller.scrollTop = 0;
    progress.style.transform = 'scaleX(0)';
  };

  const open = (id: string, el?: HTMLElement | null) => {
    const i = data.notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    if (state === 'open') {
      fill(i);
      return;
    }
    origin = el ?? $(`.notes [data-note="${id}"]`) ?? $('.notes');
    from = origin ? rectOf(origin) : { x: innerWidth / 2 - 100, y: innerHeight, w: 200, h: 80 };
    fill(i);
    const t = target();
    art.style.width = `${t.w}px`;
    x.set(from.x);
    y.set(from.y);
    w.set(from.w);
    h.set(from.h);
    p.set(0);
    dragY = 0;
    sheet.hidden = false;
    scrim.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    state = 'open';
    const islEl = isl() as HTMLElement | null;
    islEl?.setAttribute('data-dim', '');
    apply();
    for (const s of [x, y, w, h]) Object.assign(s, cfg);
    if (reduced) {
      x.set(t.x), y.set(t.y), w.set(t.w), h.set(t.h), p.set(1);
      apply();
    } else {
      x.to(t.x), y.to(t.y), w.to(t.w), h.to(t.h), p.to(1);
      loop.kick();
    }
    setTimeout(() => closeBtn.focus({ preventScroll: true }), 60);
  };

  const finish = () => {
    state = 'closed';
    sheet.hidden = true;
    scrim.hidden = true;
    document.documentElement.style.overflow = '';
    (isl() as HTMLElement | null)?.removeAttribute('data-dim');
    origin?.focus({ preventScroll: true });
    origin = null;
  };

  const close = (v = 0) => {
    if (state !== 'open') return;
    state = 'closing';
    if (origin) from = rectOf(origin);
    y.value += dragY;
    dragY = 0;
    const c = { response: 0.44, damping: 0.9 };
    x.to(from.x, c);
    y.to(from.y, { ...c, velocity: v });
    w.to(from.w, c);
    h.to(from.h, c);
    p.to(0);
    if (reduced) return finish();
    loop.kick();
  };

  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.notes [data-note]');
    if (b) open(b.dataset.note!, b);
  });
  on<string>('wl:note', (id) => setTimeout(() => open(id), 700));
  scrim.addEventListener('click', () => close());
  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => fill(idx - 1));
  nextBtn.addEventListener('click', () => fill(idx + 1));
  addEventListener('keydown', (e) => {
    if (state !== 'open') return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = $$<HTMLElement>('button:not([disabled]), a[href]', sheet);
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
  });
  scroller.addEventListener(
    'scroll',
    () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      progress.style.transform = `scaleX(${max > 0 ? scroller.scrollTop / max : 1})`;
    },
    { passive: true },
  );

  // Drag down to dismiss — from the grabber, or the page when it's at the top.
  let dragging = false;
  let sy = 0;
  let hist: { p: number; t: number }[] = [];
  const begin = (e: PointerEvent) => {
    if (state !== 'open' || (e.target as HTMLElement).closest('a, button')) return;
    if (e.currentTarget === scroller && (scroller.scrollTop > 0 || e.pointerType !== 'mouse')) return;
    dragging = true;
    sy = e.clientY - dragY;
    hist = [{ p: e.clientY, t: e.timeStamp }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - sy;
    dragY = dy >= 0 ? dy : -rubberband(-dy, 400);
    hist.push({ p: e.clientY, t: e.timeStamp });
    if (hist.length > 6) hist.shift();
    apply();
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const v = velocity(hist);
    if (dragY + project(v, 0.99) > h.value * 0.3 || v > 1000) close(v);
    else {
      y.value += dragY;
      dragY = 0;
      y.to(target().y, { velocity: v, response: 0.4, damping: 0.8 });
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
    const t = target();
    x.set(t.x), y.set(t.y), w.set(t.w), h.set(t.h);
    art.style.width = `${t.w}px`;
    apply();
  });
}
