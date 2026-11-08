/**
 * System · Poster — the hero, in two flavours (html[data-hero]):
 *
 *  name   — "Josh" as liquid-glass lettering where the lock-screen clock used to be,
 *           refracting the dunes and tucked behind the far range. On load the letters
 *           rise from behind the ridge one after another.
 *  poster — an iOS Contact Poster: the name set huge in the sky, its foot behind the
 *           mountains, and a large cut-out Memoji standing in front of both.
 *
 * Wallpaper layers (fixed, behind the page):
 *   .wall-img      full-res photo
 *   .wall-blur     pre-blurred copy, cross-fades in past the hero
 *   .wall-gl       GlassName canvas (name mode), masked to the lettering band
 *   .poster-name   DOM type (poster mode) — between the photo and the ridge
 *   .wall-depth    photo clipped to the ridge → the mountains sit in front
 */
import { GlassName } from './glass-name';
import { Spring, springLoop, prefersReducedMotion } from '@/lib/glass';
import { ridge, WALL } from '@/concepts/widgets-system/data';

const reduced = prefersReducedMotion();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const FONT = 'system-ui, -apple-system, "SF Pro Display", "Inter Variable", sans-serif';

export type HeroMode = 'name' | 'poster';
export const heroMode = (): HeroMode => (document.documentElement.dataset.hero === 'poster' ? 'poster' : 'name');

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

/** Mean height of the far ridge across the middle of the screen (where the name sits), in viewport px. */
function ridgeY(from = 0.3, to = 0.7, stat: 'mean' | 'low' = 'mean') {
  const vw = innerWidth;
  const vh = innerHeight;
  const s = Math.max(vw / WALL.w, vh / WALL.h);
  const ox = (vw - WALL.w * s) / 2;
  const oy = (vh - WALL.h * s) / 2;
  let sum = 0;
  let low = -Infinity;
  const n = 32;
  for (let i = 0; i < n; i++) {
    const sx = vw * (from + ((to - from) * i) / (n - 1));
    const y = oy + ridgeAtImageX((sx - ox) / s) * s;
    sum += y;
    low = Math.max(low, y);
  }
  // 'low' = the lowest dip of the ridge (largest y): where the most of the letters would show.
  return stat === 'low' ? low : sum / n;
}

type Els = {
  root: HTMLElement;
  heroEl: HTMLElement;
  img: HTMLImageElement;
  blurImg: HTMLImageElement | null;
  canvas: HTMLCanvasElement;
  depth: SVGSVGElement | null;
  shade: HTMLElement | null;
};

export function hero() {
  const root = document.documentElement;
  const heroEl = document.querySelector<HTMLElement>('.hero');
  const img = document.querySelector<HTMLImageElement>('.wall-img');
  const canvas = document.querySelector<HTMLCanvasElement>('.wall-gl');
  if (!heroEl || !img || !canvas) return;
  const els: Els = {
    root,
    heroEl,
    img,
    canvas,
    blurImg: document.querySelector<HTMLImageElement>('.wall-blur'),
    depth: document.querySelector<SVGSVGElement>('.wall-depth'),
    shade: document.querySelector<HTMLElement>('.wall-shade'),
  };

  // Dark mode: the <picture> swaps to the night photo; keep the depth layer in step.
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const depthImg = els.depth?.querySelector('image');
  const syncScheme = () => depthImg?.setAttribute('href', dark.matches ? '/wallpapers/dunes-dark.jpg' : '/wallpapers/dunes.jpg');
  syncScheme();
  dark.addEventListener('change', syncScheme);

  return heroMode() === 'poster' ? posterHero(els) : nameHero(els);
}

/** Past the hero the wallpaper defocuses like the iOS home screen. Returns 0→1. */
function homeScreen(els: Els, heroH: number) {
  const p = clamp((scrollY - heroH * 0.3) / (heroH * 0.55), 0, 1);
  if (els.blurImg) els.blurImg.style.opacity = p.toFixed(3);
  els.shade?.style.setProperty('--shade', p.toFixed(3));
  return p;
}

/* ───────────────────────────── name: glass lettering ───────────────────────────── */

function nameHero(els: Els) {
  const { root, heroEl, img, canvas, depth } = els;
  const below = heroEl.querySelector<HTMLElement>('.hero-below');
  const domWord = heroEl.querySelector<HTMLElement>('[data-word-dom]');
  // "Joshua Germon" set tighter was tried: at that size the glass loses its body. One word, big.
  const word = 'Josh';
  if (domWord) domWord.textContent = word;

  const g = { ridge: 0, size: 200, y: 0, asc: 0, desc: 0, top: 0, bottom: 0, heroH: 0, h: 0 };
  const measure = document.createElement('canvas').getContext('2d')!;
  const track = (size: number) => -size * 0.04;

  const layout = () => {
    const vw = innerWidth;
    const vh = innerHeight;
    g.ridge = ridgeY();
    // Big enough to carry the glass, small enough to leave room for the widgets.
    const target = vw < 600 ? vw * 0.5 : Math.min(vw * 0.3, vh * 0.33);
    g.size = Math.round(clamp(target, 130, 300));
    measure.font = `700 ${g.size}px ${FONT}`;
    (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${track(g.size)}px`;
    measure.textBaseline = 'middle';
    const fit = (vw - 36) / measure.measureText(word).width;
    if (fit < 1) {
      g.size = Math.floor(g.size * fit);
      measure.font = `700 ${g.size}px ${FONT}`;
      (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${track(g.size)}px`;
    }
    // Ignore the J's descender: the cap height is what reads as the word.
    const m = measure.measureText('Josh');
    g.asc = m.actualBoundingBoxAscent;
    g.desc = measure.measureText('osh').actualBoundingBoxDescent;
    g.h = g.asc + g.desc;
    // Bury the foot of the letters behind the range, like the clock was.
    // Measured against the ridge under the word itself, so no foot pokes out of a dip.
    const half = measure.measureText(word).width / 2 / vw;
    const dip = ridgeY(0.5 - half, 0.5 + half, 'low');
    g.ridge = ridgeY(0.5 - half, 0.5 + half);
    // The J's hook rises about a quarter of the way up: keep it fully behind the ridge.
    g.y = Math.max(g.ridge + g.h * 0.24, dip + g.h * 0.31) - g.desc;
    g.top = g.y - g.asc;
    g.bottom = g.y + g.desc;
    heroEl.style.setProperty('--ridge', `${g.ridge}px`);
    heroEl.style.setProperty('--word', `${g.size}px`);
    heroEl.style.setProperty('--word-top', `${g.top}px`);
    const belowTop = g.bottom + Math.max(18, g.size * 0.08);
    if (below) below.style.top = `${belowTop}px`;
    if (domWord) domWord.style.top = `${g.top - g.size * 0.1}px`;
    const belowH = below?.offsetHeight ?? 160;
    g.heroH = Math.round(belowTop + belowH + (vw < 680 ? 30 : 40));
    heroEl.style.setProperty('--hero-h', `${g.heroH}px`);
  };

  let gl: GlassName | null = null;
  if (!matchMedia('(prefers-reduced-transparency: reduce)').matches) {
    try {
      gl = new GlassName(canvas);
    } catch {
      gl = null;
    }
  }
  // Without glass, the DOM word stands in (it stays hidden while the glass is pending).
  if (!gl) root.setAttribute('data-nogl', '');

  // Entrance: each letter rises from behind the ridge on its own spring, 70ms apart.
  let letters: Spring[] = [];
  const alpha = new Spring(reduced ? 1 : 0, { response: 0.9, damping: 1 });
  let raf = 0;
  const draw = () => {
    if (!gl) return;
    gl.alpha = alpha.value;
    gl.shift.y = -scrollY;
    gl.offsets = letters.map((s) => s.value);
    gl.render();
  };
  const request = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()));
  };
  const setLayers = () => {
    gl?.setText({
      lines: [{ text: word, x: innerWidth / 2, y: g.y }],
      font: `700 ${g.size}px ${FONT}`,
      letterSpacing: track(g.size),
      depth: g.size * 0.085,
    });
    if (gl && letters.length !== gl.letters) letters = Array.from({ length: gl.letters }, () => new Spring(0, { response: 1.05, damping: 0.88 }));
  };

  const onScroll = () => {
    const y = scrollY;
    const p = homeScreen(els, g.heroH);
    const glOn = p < 1 && y < g.bottom + 60;
    canvas.style.opacity = gl && root.hasAttribute('data-gl') ? String(glOn ? 1 - p : 0) : '';
    canvas.style.visibility = glOn ? '' : 'hidden';
    if (depth) {
      depth.style.opacity = String(1 - p);
      depth.style.visibility = y < g.bottom - g.ridge + 40 ? '' : 'hidden';
    }
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
      /* setPhoto still works once loaded */
    }
    if (!img.naturalWidth) await new Promise((r) => img.addEventListener('load', r, { once: true }));
    gl.setPhoto(img);
    setLayers();
    root.setAttribute('data-gl', '');
    onScroll();
    const loop = springLoop([alpha, ...letters], () => draw());
    if (reduced) {
      alpha.set(1);
      draw();
      return;
    }
    // Start every letter fully below the ridge; the mountains hide them until they rise.
    const drop = g.h * 1.15;
    letters.forEach((s) => s.set(drop));
    alpha.set(1);
    draw();
    letters.forEach((s, i) =>
      setTimeout(() => {
        s.to(0);
        loop.kick();
      }, 260 + i * 70),
    );
    loop.kick();
  };
  start();

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
  return { relayout: () => (layout(), onScroll()) };
}

/* ───────────────────────────── poster: Contact Poster ───────────────────────────── */

function posterHero(els: Els) {
  const { heroEl, depth } = els;
  const name = document.querySelector<HTMLElement>('.poster-name');
  const me = heroEl.querySelector<HTMLElement>('.poster-me');
  const line = heroEl.querySelector<HTMLElement>('.poster-line');
  if (!name || !me) return;
  const g = { ridge: 0, bottom: 0, heroH: 0 };

  const layout = () => {
    const vw = innerWidth;
    const stacked = vw < 700 && innerHeight / vw > 1.3;
    name.toggleAttribute('data-stacked', stacked);
    g.ridge = ridgeY(stacked ? 0.1 : 0.2, stacked ? 0.9 : 0.8);
    heroEl.style.setProperty('--ridge', `${g.ridge}px`);
    name.style.setProperty('--ridge', `${g.ridge}px`);
    // Size the type to the width it has (the font-size is set in CSS; measure and correct).
    name.style.removeProperty('--fit');
    const lines = [...name.querySelectorAll<HTMLElement>('.pn-line')];
    // offset*, not rects: the wallpaper scales in on load.
    const widest = stacked ? Math.max(...lines.map((l) => l.offsetWidth)) : name.offsetWidth;
    const room = stacked ? vw - 28 : Math.min(vw - 2 * 150, 1100);
    if (widest > room) name.style.setProperty('--fit', (room / widest).toFixed(4));
    // The foot of the last line tucks behind the range.
    const h = name.offsetHeight;
    const em = parseFloat(getComputedStyle(name).fontSize);
    const capH = em * 0.7;
    const baseline = h - em * 0.05; // line-height ≈ 0.8: the box hugs cap height
    const tuck = capH * (stacked ? 0.12 : 0.16);
    const top = g.ridge + tuck - baseline;
    name.style.top = `${top}px`;
    // The Memoji stands in front: its hair covers the lower part of the last line,
    // the way a Contact Poster's subject overlaps the name.
    const meW = me.offsetWidth;
    const hairTop = top + baseline - capH * (stacked ? 0.5 : 0.46);
    const meTop = hairTop - meW * 0.13;
    me.style.top = `${meTop}px`;
    // Its own bottom fades out; the line sits just under that fade.
    const lineTop = meTop + meW * 0.86;
    if (line) line.style.top = `${lineTop}px`;
    g.bottom = top + h;
    g.heroH = Math.round(lineTop + (line?.offsetHeight ?? 40) + (vw < 680 ? 34 : 44));
    heroEl.style.setProperty('--hero-h', `${g.heroH}px`);
  };

  const onScroll = () => {
    const y = scrollY;
    const p = homeScreen(els, g.heroH);
    // The name lives in the fixed wallpaper stack (so the ridge can sit in front of it);
    // it rides the page up and out from behind the mountains.
    name.style.translate = `-50% ${-y}px`;
    name.style.visibility = y > g.bottom + 40 ? 'hidden' : '';
    if (depth) {
      depth.style.opacity = String(1 - p);
      depth.style.visibility = y < g.bottom - g.ridge + 60 ? '' : 'hidden';
    }
  };

  const run = () => {
    layout();
    onScroll();
    document.documentElement.setAttribute('data-poster', '');
  };
  // Measure once the display face is in.
  (document.fonts?.ready ?? Promise.resolve()).then(run);
  run();

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => (layout(), onScroll()));

  // The Memoji leans toward the pointer a touch — it's a poster, not a toy.
  if (!reduced) {
    const tilt = { x: new Spring(0, { response: 0.8, damping: 0.9 }), y: new Spring(0, { response: 0.8, damping: 0.9 }) };
    const loop = springLoop([tilt.x, tilt.y], () => {
      me.style.setProperty('--tx', `${tilt.x.value.toFixed(2)}px`);
      me.style.setProperty('--ty', `${tilt.y.value.toFixed(2)}px`);
      name.style.setProperty('--px', `${(-tilt.x.value * 0.35).toFixed(2)}px`);
    });
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || scrollY > g.heroH) return;
        tilt.x.to(((e.clientX / innerWidth) - 0.5) * 14);
        tilt.y.to(((e.clientY / innerHeight) - 0.5) * 6);
        loop.kick();
      },
      { passive: true },
    );
  }
  return { relayout: () => (layout(), onScroll()) };
}
