/**
 * Bento · Command — page glue: the dot field, the palette and its global
 * shortcuts, the terminal, golden hour, the commits scrub, the HUD.
 */
import { terminal } from '@/concepts/widgets-system/terminal';
import { dots } from './dots';
import { palette } from './palette';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const TZ = 'Australia/Sydney';

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
  const data = JSON.parse($('#bc-data').textContent!) as Data;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;

  dots($<HTMLCanvasElement>('.bc-dots'));

  /* HUD (Raycast's little confirmation pill) ------------------------------- */
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

  /* Jump to a widget: scroll it to centre, then a brief hairline flash ------ */
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    el.removeAttribute('data-flash');
    void el.offsetWidth;
    setTimeout(() => el.setAttribute('data-flash', ''), reduced ? 0 : 260);
    setTimeout(() => el.removeAttribute('data-flash'), 1600);
    const focusable = el.querySelector<HTMLElement>('.bx-open, input, a, button');
    focusable?.focus({ preventScroll: true });
  };

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

  /* Theme ------------------------------------------------------------------ */
  const theme = () => {
    const light = html.getAttribute('data-bc') !== 'light';
    if (light) html.setAttribute('data-bc', 'light');
    else html.removeAttribute('data-bc');
    try {
      localStorage.setItem('bc-theme', light ? 'light' : 'dark');
    } catch {
      /* private mode */
    }
    $('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f4f5' : '#07080a');
    return light ? 'Light' : 'Dark';
  };

  const links: Record<string, string> = Object.fromEntries(data.profile.socials.map((s) => [s.label.toLowerCase(), s.href]));
  const pal = palette({ hud, jump, term, theme, email: data.profile.email, links });
  const suggestions = $$('[data-sugg]').map((b) => b.dataset.act!);

  // Every [data-act] on the page (outside the palette) routes through the palette.
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (t && !t.closest('[data-pal]')) {
      e.preventDefault();
      pal.perform(t.dataset.act);
    }
    if ((e.target as HTMLElement).closest('[data-open]')) pal.open();
  });

  /* Global shortcuts ---------------------------------------------------------- */
  const editable = (el: Element | null) => !!el && (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  let hoverContact = false;
  const contact = $('#contact');
  contact.addEventListener('pointerenter', () => (hoverContact = true));
  contact.addEventListener('pointerleave', () => (hoverContact = false));

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (pal.isOpen()) pal.close();
      else pal.open();
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      hud(`Appearance: ${theme()}`);
      return;
    }
    // ⌥1–⌥5 run the suggested commands (the chips under the bar), open or not.
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
      navigator.clipboard?.writeText(data.profile.email).then(() => hud('Copied to Clipboard'));
      return;
    }
    if (e.key === '/' && !mod) {
      e.preventDefault();
      pal.open();
      return;
    }
    // Raycast-style: just start typing.
    if (!mod && !e.altKey && e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
      e.preventDefault();
      pal.open({ q: e.key });
    }
  });

  /* Floating pill when the header window scrolls away ------------------------- */
  const float = $('[data-float]');
  new IntersectionObserver(([en]) => float.toggleAttribute('data-on', !en.isIntersecting), { rootMargin: '-40px 0px 0px 0px' }).observe($('[data-bar]'));

  terminal(data, {
    openSheet: () => pal.open({ view: 'projects' }),
    toast: hud,
  });
  golden();
  coffee();
  commits(data);
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
  $$('[data-sunset]').forEach((el) => (el.textContent = f(t.sunset)));
  $$('[data-sunrise]').forEach((el) => (el.textContent = f(t.sunrise)));
  const m1 = $('[data-meta="Golden hour"]');
  const m2 = $('[data-meta="Sunset"]');
  if (m1) m1.textContent = g;
  if (m2) m2.textContent = f(t.sunset);
  // Sun along a day-length track: sunrise → sunset.
  const k = (now.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
  const sun = $('[data-sun]');
  if (sun) {
    sun.style.setProperty('--k', String(Math.max(0, Math.min(1, k))));
    sun.toggleAttribute('data-night', k < 0 || k > 1);
  }
  const gk = (t.golden.valueOf() - t.sunrise.valueOf()) / (t.sunset.valueOf() - t.sunrise.valueOf());
  $('.gd-track')?.style.setProperty('--g', String(gk));
}

function coffee() {
  const dow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  const idx = (dow + 6) % 7; // Monday-first
  $$('[data-week] li')[idx]?.setAttribute('data-today', '');
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
