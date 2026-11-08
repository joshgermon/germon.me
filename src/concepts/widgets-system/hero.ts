/**
 * Lock-screen hero: the iOS 26 glass clock, refracting the dune wallpaper and
 * tucked behind the far range (depth effect).
 *
 * Layers (all fixed, behind the page):
 *   .wall-img     full-res photo, object-fit: cover
 *   .wall-blur    the same photo pre-blurred; cross-fades in as you scroll into the widgets
 *   .wall-gl      GlassTypeGL — renders the photo + glass lettering; masked to the clock band
 *   .wall-depth   SVG <image> of the photo clipped to the ridge → the mountains sit *in front*
 *
 * Rendering is on demand (scroll, pointer, minute tick) rather than a constant rAF loop.
 */
import { GlassClock } from './glass-clock';
import { Spring, springLoop, prefersReducedMotion } from '@/lib/glass';
import { ridge, WALL } from './data';

const reduced = prefersReducedMotion();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const FONT = 'system-ui, -apple-system, "SF Pro Display", "Inter Variable", sans-serif';

export function sydneyNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second') };
}
export const clockText = () => {
  const { h, m } = sydneyNow();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
/** Narrow portrait screens get the iOS 26 stacked clock: hours over minutes. */
const stackedClock = () => innerWidth < 600 && innerHeight / innerWidth > 1.4;

function ridgeAtImageX(ix: number) {
  if (ix <= 0) return ridge[0][1];
  for (let i = 1; i < ridge.length; i++) {
    const [x1, y1] = ridge[i];
    if (ix <= x1) {
      const [x0, y0] = ridge[i - 1];
      return y0 + ((ix - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return ridge[ridge.length - 1][1];
}

export function hero() {
  const root = document.documentElement;
  const heroEl = document.querySelector<HTMLElement>('.hero');
  const img = document.querySelector<HTMLImageElement>('.wall-img');
  const blurImg = document.querySelector<HTMLImageElement>('.wall-blur');
  const canvas = document.querySelector<HTMLCanvasElement>('.wall-gl');
  const depth = document.querySelector<SVGSVGElement>('.wall-depth');
  const shade = document.querySelector<HTMLElement>('.wall-shade');
  const below = document.querySelector<HTMLElement>('.hero-below');
  const domClock = document.querySelector<HTMLElement>('[data-clock-dom]');
  if (!heroEl || !img || !canvas) return;

  // Geometry ---------------------------------------------------------------
  const g = { ridge: 0, size: 200, y: 0, y1: 0, asc: 0, desc: 0, top: 0, bottom: 0, heroH: 0, stacked: false };
  const measure = document.createElement('canvas').getContext('2d')!;

  const layout = () => {
    const vw = innerWidth;
    const vh = innerHeight;
    const s = Math.max(vw / WALL.w, vh / WALL.h);
    const ox = (vw - WALL.w * s) / 2;
    const oy = (vh - WALL.h * s) / 2;
    // Mean ridge height under the middle of the screen, where the clock sits.
    let sum = 0;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const sx = vw * (0.32 + (0.36 * i) / (n - 1));
      sum += oy + ridgeAtImageX((sx - ox) / s) * s;
    }
    g.ridge = sum / n;
    g.stacked = stackedClock();
    g.size = Math.round(g.stacked ? clamp(vw * 0.46, 120, 210) : clamp(Math.min(vw * 0.3, vh * 0.31), 112, 300));
    measure.font = `700 ${g.size}px ${FONT}`;
    (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-g.size * 0.035}px`;
    measure.textBaseline = 'middle';
    const m = measure.measureText('10:48');
    g.asc = m.actualBoundingBoxAscent;
    g.desc = m.actualBoundingBoxDescent;
    const digitH = g.asc + g.desc;
    // Bury the bottom ~quarter of the numerals behind the range.
    const overlap = digitH * (g.stacked ? 0.22 : 0.26);
    g.y = g.ridge + overlap - g.desc;
    g.y1 = g.stacked ? g.y - digitH - g.size * 0.07 : g.y;
    g.top = g.y1 - g.asc;
    g.bottom = g.y + g.desc;
    heroEl.style.setProperty('--ridge', `${g.ridge}px`);
    heroEl.style.setProperty('--clock', `${g.size}px`);
    heroEl.style.setProperty('--clock-top', `${g.top}px`);
    const belowTop = g.bottom + Math.max(22, g.size * 0.11);
    if (below) below.style.top = `${belowTop}px`;
    if (domClock) domClock.style.top = `${g.top - g.size * 0.1}px`;
    const belowH = below?.offsetHeight ?? 200;
    g.heroH = Math.round(belowTop + belowH + (vw < 680 ? 36 : 48));
    heroEl.style.setProperty('--hero-h', `${g.heroH}px`);
  };

  // GL --------------------------------------------------------------------------
  let gl: GlassClock | null = null;
  const noGlass = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  if (!noGlass) {
    try {
      gl = new GlassClock(canvas);
    } catch {
      gl = null;
    }
  }
  let text = clockText();
  if (domClock) domClock.textContent = text;

  let raf = 0;
  const alpha = new Spring(reduced ? 1 : 0, { response: 1.1, damping: 1 });
  const rise = new Spring(reduced ? 0 : 26, { response: 1.2, damping: 0.9 });

  const draw = () => {
    if (!gl) return;
    gl.alpha = alpha.value;
    gl.shift.y = rise.value - scrollY;
    gl.render();
  };
  const request = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()));
  };
  const setLayers = () => {
    const x = innerWidth / 2;
    const [hh, mm] = text.split(':');
    const lines = g.stacked ? [{ text: hh.padStart(2, '0'), x, y: g.y1 }, { text: mm, x, y: g.y }] : [{ text, x, y: g.y }];
    gl?.setText({ lines, font: `700 ${g.size}px ${FONT}`, letterSpacing: -g.size * 0.035, depth: g.size * (g.stacked ? 0.075 : 0.085) });
  };

  // Scroll: the clock rides the page up and out from behind the mountains;
  // past the lock screen the wallpaper defocuses like the iOS home screen.
  const onScroll = () => {
    const y = scrollY;
    const p = clamp((y - g.heroH * 0.3) / (g.heroH * 0.55), 0, 1);
    if (blurImg) blurImg.style.opacity = p.toFixed(3);
    if (shade) shade.style.setProperty('--shade', p.toFixed(3));
    const glOn = p < 1 && y < g.bottom + 60;
    canvas.style.opacity = gl && root.hasAttribute('data-gl') ? String(glOn ? 1 - p : 0) : '';
    canvas.style.visibility = glOn ? '' : 'hidden';
    if (depth) {
      depth.style.opacity = String(1 - p);
      depth.style.visibility = y < g.bottom - g.ridge + 40 ? '' : 'hidden';
    }
    // Only the clock band of the canvas is shown; the rest is the full-res <img>.
    const top = g.top - y - 50;
    const bot = g.bottom - y + 40;
    const mask = `linear-gradient(to bottom, transparent ${top - 30}px, #000 ${top}px, #000 ${bot}px, transparent ${bot + 30}px)`;
    canvas.style.maskImage = mask;
    canvas.style.setProperty('-webkit-mask-image', mask);
    if (glOn) request();
  };

  layout();
  onScroll();

  const start = async () => {
    if (!gl) return;
    gl.params = { ...gl.params, refraction: 64, dispersion: 0.03, specular: 1, shadow: 0.9, frost: 0.035 };
    gl.light = { x: innerWidth * 0.22, y: -innerHeight * 0.25 };
    try {
      await img.decode();
    } catch {
      /* fall through: setPhoto still works once loaded */
    }
    if (!img.naturalWidth) await new Promise((r) => img.addEventListener('load', r, { once: true }));
    gl.setPhoto(img);
    setLayers();
    root.setAttribute('data-gl', '');
    onScroll();
    const loop = springLoop([alpha, rise], () => draw());
    alpha.to(1);
    rise.to(0);
    loop.kick();
    draw();
  };
  start();

  // Dark mode: the <picture> swaps to the night photo; keep the glass clock
  // texture and the depth layer (mountains in front of the clock) in step.
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const depthImg = depth?.querySelector('image');
  const syncScheme = () => depthImg?.setAttribute('href', dark.matches ? '/wallpapers/dunes-dark.jpg' : '/wallpapers/dunes.jpg');
  syncScheme();
  dark.addEventListener('change', syncScheme);
  img.addEventListener('load', () => {
    if (!gl || !root.hasAttribute('data-gl')) return;
    gl.setPhoto(img);
    draw();
  });

  addEventListener('scroll', onScroll, { passive: true });
  let rz = 0;
  addEventListener('resize', () => {
    layout();
    onScroll();
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      if (!gl || !root.hasAttribute('data-gl')) return;
      gl.resize();
      gl.setPhoto(img);
      setLayers();
      draw();
    }, 80);
  });
  addEventListener(
    'pointermove',
    (e) => {
      if (!gl || e.pointerType !== 'mouse' || scrollY > g.bottom) return;
      gl.light = { x: e.clientX, y: e.clientY - 120 };
      request();
    },
    { passive: true },
  );

  // Minute tick.
  const tick = () => {
    const next = clockText();
    if (next !== text) {
      text = next;
      if (domClock) domClock.textContent = text;
      setLayers();
      request();
    }
  };
  setInterval(tick, 5000);
  return { relayout: () => (layout(), onScroll()) };
}
