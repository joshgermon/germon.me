/**
 * Lock-screen hero, minus the lock screen: instead of a clock, a single
 * monoline "hello" is written onto the dunes in liquid glass, and tucks
 * behind the far range (the same depth layer the System clock used).
 *
 * The pen: one hand-authored centre line (script.ts). Its arc length is
 * re-timed so the pen slows into loops and turns and eases off at the tail,
 * like Apple's hello. Each frame only the new piece of stroke is inked onto a
 * silhouette canvas (round caps), and the glass height field is rebuilt inside
 * that piece's dirty rect (glass-script.ts) — so writing costs a few
 * milliseconds a frame. Once the pen lifts nothing runs until you scroll,
 * move the pointer or resize.
 */
import { GlassScript } from './glass-script';
import { WORDS, build, flatten, type Line } from './script';
import { prefersReducedMotion } from '@/lib/glass';
import { ridge, WALL } from '@/concepts/widgets-system/data';

export type WordKey = keyof typeof WORDS;
export const isWord = (w: string | null): w is WordKey => !!w && w in WORDS;

const reduced = prefersReducedMotion();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Authored units (x-height = 100). */
const STROKE = 21;
/** How far the baseline sits below the ridge: hello tucks its feet in; Josh lets the
 * J's descender do the tucking and keeps o and s clear of the peaks. */
const BURY: Record<WordKey, number> = { hello: 17, josh: -14 };
const DURATION: Record<WordKey, number> = { hello: 2700, josh: 2500 };
const PEN = Number(new URLSearchParams(location.search).get('pen') ?? -1);

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

/** A word laid out in CSS px, plus the pen's timing along it. */
type Laid = {
  key: WordKey;
  line: Line;
  d: string;
  len: number;
  /** box of the stroke (incl. half the stroke width + bevel padding) in viewport px */
  box: { x: number; y: number; w: number; h: number };
  /** offset of the path's own origin inside `box` */
  ox: number;
  oy: number;
  width: number; // stroke width, px
  depth: number; // bevel, px
  top: number; // ascender top, px (viewport)
  baseline: number;
  /** pen time (0–1) → arc length, sampled */
  sOfT: Float32Array;
};

function timing(line: Line, unit: number) {
  const { pts, cum, len } = line;
  const N = cum.length - 1;
  // Resample to even arc-length steps.
  const n = Math.max(64, Math.ceil(len / 1.5));
  const ds = len / n;
  const at = (s: number, j: { i: number }) => {
    while (j.i < N - 1 && cum[j.i + 1] < s) j.i++;
    const f = (s - cum[j.i]) / Math.max(1e-6, cum[j.i + 1] - cum[j.i]);
    return { x: pts[j.i * 2] + (pts[j.i * 2 + 2] - pts[j.i * 2]) * f, y: pts[j.i * 2 + 1] + (pts[j.i * 2 + 3] - pts[j.i * 2 + 1]) * f };
  };
  const cur = { i: 0 };
  const ang = new Float32Array(n + 1);
  let prev = at(0, cur);
  for (let i = 1; i <= n; i++) {
    const p = at(i * ds, cur);
    ang[i] = Math.atan2(p.y - prev.y, p.x - prev.x);
    prev = p;
  }
  ang[0] = ang[1];
  // Curvature (turning per px), smoothed so the pen eases into a turn instead of braking at a point.
  const k = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    let a = ang[i] - ang[i - 1];
    a = Math.atan2(Math.sin(a), Math.cos(a));
    k[i] = Math.abs(a) / ds;
  }
  const win = Math.max(2, Math.round((14 * unit) / ds));
  const ks = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 0; i <= n + win; i++) {
    if (i <= n) acc += k[i];
    if (i - 2 * win - 1 >= 0) acc -= k[i - 2 * win - 1];
    const c = i - win;
    if (c >= 0 && c <= n) ks[c] = acc / (2 * win + 1);
  }
  // Speed: full along straights, ~⅓ through the tight tops of loops.
  const T = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const kk = ks[i] * 30 * unit;
    const v = 1 / (1 + 0.55 * kk);
    T[i] = T[i - 1] + ds / v;
  }
  const total = T[n];
  // Invert: for M even time steps, find arc length.
  const M = 600;
  const sOfT = new Float32Array(M + 1);
  let j = 0;
  for (let m = 0; m <= M; m++) {
    const t = (m / M) * total;
    while (j < n && T[j + 1] < t) j++;
    const f = j < n ? (t - T[j]) / Math.max(1e-6, T[j + 1] - T[j]) : 0;
    sOfT[m] = Math.min(len, (j + f) * ds);
  }
  return sOfT;
}

/** Overall rhythm: a soft start, an unhurried tail. */
const envelope = (x: number) => 0.5 * x + 0.5 * (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function helloHero(initial: WordKey, hooks: { onWritten?: () => void } = {}) {
  const root = document.documentElement;
  const heroEl = document.querySelector<HTMLElement>('.hero');
  const img = document.querySelector<HTMLImageElement>('.wall-img');
  const blurImg = document.querySelector<HTMLImageElement>('.wall-blur');
  const canvas = document.querySelector<HTMLCanvasElement>('.wall-gl');
  const depthSvg = document.querySelector<SVGSVGElement>('.wall-depth');
  const shade = document.querySelector<HTMLElement>('.wall-shade');
  const below = document.querySelector<HTMLElement>('.hero-below');
  const hit = document.querySelector<HTMLButtonElement>('.hello-hit');
  const fallback = document.querySelector<SVGSVGElement>('.hello-svg');
  if (!heroEl || !img || !canvas) return null;

  // Geometry ---------------------------------------------------------------
  const g = { ridge: 0, unit: 1, top: 0, bottom: 0, heroH: 0 };
  let word: WordKey = initial;
  let laid: Laid | null = null;

  const unitFor = (vw: number, vh: number, ridgeY: number) => {
    // Size to the widest word so switching words doesn't change the scale.
    const wide = Math.max(...Object.values(WORDS).map((w) => build(w).w));
    const byW = (vw * (vw < 680 ? 0.84 : 0.56)) / wide;
    const room = ridgeY - (vw < 680 ? 110 : 128); // clear of the island
    const byH = (room + BURY.hello) / 268;
    return clamp(Math.min(byW, byH, vh / 820), 0.42, 1.2);
  };

  const cache = new Map<string, { line: Line; d: string; sOfT: Float32Array }>();
  const layWord = (key: WordKey): Laid => {
    const u = g.unit;
    const ck = `${key}@${u.toFixed(4)}`;
    let c = cache.get(ck);
    if (!c) {
      const line = flatten(WORDS[key], u);
      c = { line, d: build(WORDS[key], u).d, sOfT: timing(line, u) };
      cache.set(ck, c);
    }
    const { line } = c;
    const { x0, x1, y0, y1 } = line;
    const width = STROKE * u;
    const depth = width * 0.5;
    const pad = Math.ceil(width / 2 + depth * 3 + 8);
    const baseline = g.ridge + BURY[key] * u;
    const left = innerWidth / 2 - (x0 + x1) / 2;
    const top = baseline - line.base;
    return {
      key,
      line,
      d: c.d,
      len: line.len,
      box: { x: Math.floor(left + x0 - pad), y: Math.floor(top + y0 - pad), w: Math.ceil(x1 - x0 + pad * 2), h: Math.ceil(y1 - y0 + pad * 2) },
      ox: left - Math.floor(left + x0 - pad),
      oy: top - Math.floor(top + y0 - pad),
      width,
      depth,
      top: top + y0 - width / 2,
      baseline,
      sOfT: c.sOfT,
    };
  };

  const layout = () => {
    const vw = innerWidth;
    const vh = innerHeight;
    const s = Math.max(vw / WALL.w, vh / WALL.h);
    const ox = (vw - WALL.w * s) / 2;
    const oy = (vh - WALL.h * s) / 2;
    let sum = 0;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const sx = vw * (0.3 + (0.4 * i) / (n - 1));
      sum += oy + ridgeAtImageX((sx - ox) / s) * s;
    }
    g.ridge = sum / n;
    g.unit = unitFor(vw, vh, g.ridge);
    laid = layWord(word);
    g.top = laid.top;
    g.bottom = laid.baseline;
    heroEl.style.setProperty('--ridge', `${g.ridge}px`);
    heroEl.style.setProperty('--hello-top', `${laid.top}px`);
    heroEl.style.setProperty('--hello-base', `${laid.baseline}px`);
    const belowTop = laid.baseline + Math.max(26, 30 * g.unit);
    if (below) below.style.top = `${belowTop}px`;
    if (hit) Object.assign(hit.style, { left: `${laid.box.x}px`, top: `${laid.top}px`, width: `${laid.box.w}px`, height: `${laid.baseline - laid.top}px` });
    if (fallback) {
      fallback.setAttribute('viewBox', `0 0 ${laid.box.w} ${laid.box.h}`);
      Object.assign(fallback.style, { left: `${laid.box.x}px`, top: `${laid.box.y}px`, width: `${laid.box.w}px`, height: `${laid.box.h}px` });
      const p = fallback.querySelector('path');
      p?.setAttribute('d', laid.d);
      p?.setAttribute('transform', `translate(${laid.ox} ${laid.oy})`);
      p?.setAttribute('stroke-width', String(laid.width));
      fallback.style.setProperty('--len', String(Math.ceil(laid.len)));
    }
    const belowH = below?.offsetHeight ?? 200;
    g.heroH = Math.round(belowTop + belowH + (vw < 680 ? 36 : 52));
    heroEl.style.setProperty('--hero-h', `${g.heroH}px`);
  };

  // GL --------------------------------------------------------------------------
  let gl: GlassScript | null = null;
  const noGlass = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  if (!noGlass) {
    try {
      gl = new GlassScript(canvas);
    } catch {
      gl = null;
    }
  }

  // Silhouette: a 2D canvas the size of the word box at device resolution. The pen
  // only ever adds ink, so each frame strokes just the new piece and rebuilds the
  // height field inside that piece's dirty rect.
  const sc = document.createElement('canvas');
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;
  let inked = 0; // arc length already on the canvas
  const pointAt = (L: number) => {
    const { pts, cum } = laid!.line;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= L) lo = mid;
      else hi = mid;
    }
    const f = clamp((L - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]), 0, 1);
    return { i: hi, x: pts[lo * 2] + (pts[hi * 2] - pts[lo * 2]) * f, y: pts[lo * 2 + 1] + (pts[hi * 2 + 1] - pts[lo * 2 + 1]) * f };
  };
  const reset = () => {
    inked = 0;
    if (!gl || !laid) return;
    const k = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(laid.box.w * k));
    const H = Math.max(1, Math.round(laid.box.h * k));
    sc.width = W;
    sc.height = H;
    sctx.clearRect(0, 0, W, H);
    gl.clear(W, H, laid.box, laid.depth);
  };
  const penTo = (L: number) => {
    if (!gl || !laid) return;
    L = Math.min(L, laid.len);
    if (L <= inked + 0.01) return;
    const kx = sc.width / laid.box.w;
    const ky = sc.height / laid.box.h;
    const { pts, cum } = laid.line;
    const a = pointAt(inked);
    const b = pointAt(L);
    sctx.setTransform(kx, 0, 0, ky, laid.ox * kx, laid.oy * ky);
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    sctx.lineWidth = laid.width;
    sctx.strokeStyle = '#fff';
    sctx.beginPath();
    sctx.moveTo(a.x, a.y);
    let x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let i = a.i; i < b.i && cum[i] < L; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      sctx.lineTo(x, y);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    sctx.lineTo(b.x, b.y);
    sctx.stroke();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = laid.width / 2 + 2;
    gl.paint(sctx, { x: (x0 - r + laid.ox) * kx, y: (y0 - r + laid.oy) * ky, w: (x1 - x0 + 2 * r) * kx, h: (y1 - y0 + 2 * r) * ky });
    inked = L;
  };

  let raf = 0;
  const draw = () => {
    if (!gl) return;
    gl.shift.y = -scrollY;
    gl.render();
  };
  const request = () => {
    if (!raf && !writing) raf = requestAnimationFrame(() => ((raf = 0), draw()));
  };

  // Writing ---------------------------------------------------------------------
  let writing = 0; // rAF id while the pen is down
  let written = false;
  let token = 0;
  const finish = () => {
    writing = 0;
    penTo(laid?.len ?? 0);
    draw();
  };
  const write = (key: WordKey, opts: { delay?: number } = {}) => {
    const my = ++token;
    cancelAnimationFrame(writing);
    writing = 0;
    word = key;
    layout();
    onScroll();
    reset();
    heroEl.dataset.hello = key;
    fallback?.removeAttribute('data-go');
    if (!gl) {
      // No WebGL: the same pen line, as a plain SVG stroke.
      void fallback?.getBoundingClientRect();
      fallback?.style.setProperty('--dur', `${DURATION[key]}ms`);
      fallback?.setAttribute('data-go', '');
      setTimeout(() => my === token && hooks.onWritten?.(), reduced ? 0 : DURATION[key] * 0.8);
      return;
    }
    if (reduced) {
      finish();
      hooks.onWritten?.();
      return;
    }
    const dur = DURATION[key];
    let t0 = 0;
    let told = false;
    const start = performance.now() + (opts.delay ?? 0);
    const frame = (now: number) => {
      if (my !== token || !laid) return;
      if (now < start) {
        writing = requestAnimationFrame(frame);
        return;
      }
      if (!t0) t0 = now;
      // `?pen=<ms>` freezes the pen at that moment — for reviewing the stroke frame by frame.
      const x = clamp((PEN >= 0 ? PEN : now - t0) / dur, 0, 1);
      const m = envelope(x) * (laid.sOfT.length - 1);
      const i = Math.floor(m);
      const s = i >= laid.sOfT.length - 1 ? laid.len : laid.sOfT[i] + (laid.sOfT[i + 1] - laid.sOfT[i]) * (m - i);
      penTo(s);
      gl!.shift.y = -scrollY;
      gl!.render();
      if (!told && x > 0.78) {
        told = true;
        hooks.onWritten?.();
      }
      if (PEN >= 0) writing = 0;
      else if (x < 1) writing = requestAnimationFrame(frame);
      else finish();
    };
    writing = requestAnimationFrame(frame);
    written = true;
  };

  /** Lift the glass off (quick fade), then write `key`. */
  const rewrite = (key: WordKey) => {
    if (!gl || reduced || !written) return write(key);
    const my = ++token;
    cancelAnimationFrame(writing);
    writing = 0;
    const a0 = performance.now();
    const fade = (now: number) => {
      if (my !== token) return;
      const x = clamp((now - a0) / 240, 0, 1);
      gl!.alpha = 1 - x * x;
      draw();
      if (x < 1) requestAnimationFrame(fade);
      else {
        gl!.alpha = 1;
        write(key, { delay: 120 });
      }
    };
    requestAnimationFrame(fade);
  };

  // Scroll: as you leave the lock screen the wallpaper defocuses, like iOS.
  const onScroll = () => {
    const y = scrollY;
    const p = clamp((y - g.heroH * 0.3) / (g.heroH * 0.55), 0, 1);
    if (blurImg) blurImg.style.opacity = p.toFixed(3);
    if (shade) shade.style.setProperty('--shade', p.toFixed(3));
    const glOn = p < 1 && y < g.bottom + 60;
    canvas.style.opacity = gl && root.hasAttribute('data-gl') ? String(glOn ? 1 - p : 0) : '';
    canvas.style.visibility = glOn ? '' : 'hidden';
    if (depthSvg) {
      depthSvg.style.opacity = String(1 - p);
      depthSvg.style.visibility = y < g.bottom - g.ridge + 120 ? '' : 'hidden';
    }
    // Only the word's band of the canvas is shown; the rest is the full-res <img>.
    const top = (laid?.box.y ?? g.top) - y;
    const bot = (laid ? laid.box.y + laid.box.h : g.bottom) - y;
    const mask = `linear-gradient(to bottom, transparent ${top - 20}px, #000 ${top + 10}px, #000 ${bot - 10}px, transparent ${bot + 20}px)`;
    canvas.style.maskImage = mask;
    canvas.style.setProperty('-webkit-mask-image', mask);
    if (glOn) request();
  };

  layout();
  onScroll();

  const begin = async () => {
    if (!gl) {
      root.setAttribute('data-nogl', '');
      write(word, { delay: 300 });
      return;
    }
    gl.params = { ...gl.params, refraction: 44, dispersion: 0.035, specular: 1.1, shadow: 1, frost: 0.04 };
    gl.light = { x: innerWidth * 0.22, y: -innerHeight * 0.25 };
    try {
      await img.decode();
    } catch {
      /* setPhoto still works once loaded */
    }
    if (!img.naturalWidth) await new Promise((r) => img.addEventListener('load', r, { once: true }));
    gl.setPhoto(img);
    reset();
    draw();
    root.setAttribute('data-gl', '');
    onScroll();
    write(word, { delay: 450 });
  };
  begin();

  // Dark mode: the <picture> swaps to the night photo; keep GL + depth layer in step.
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const depthImg = depthSvg?.querySelector('image');
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
  let prevFrac = 0;
  addEventListener('resize', () => {
    if (!rz && laid) prevFrac = inked / laid.len;
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      rz = 0;
      layout();
      onScroll();
      if (!gl || !root.hasAttribute('data-gl')) return;
      gl.resize();
      gl.setPhoto(img);
      // Re-ink what was written so far at the new size.
      const done = laid ? prevFrac * laid.len : 0;
      reset();
      penTo(done);
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

  hit?.addEventListener('click', () => rewrite(word));

  return {
    get word() {
      return word;
    },
    rewrite,
    relayout: () => (layout(), onScroll()),
  };
}
