/**
 * Bento · Dots — the background.
 *
 * A fixed grid of tiny dots on black that very quietly breathes: slow ripples
 * travel out from random points, and the dots near the pointer brighten and
 * swell a little. The resting grid is drawn once to an offscreen canvas; each
 * frame only the handful of "lit" dots are redrawn over it, so the cost is a
 * single blit plus a few hundred arcs.
 *
 *  - DPR-aware (capped at 2), resizes with the viewport
 *  - pauses while the tab is hidden
 *  - prefers-reduced-motion: the static grid only, no loop
 */

type Ripple = { x: number; y: number; t0: number; amp: number };

const BASE_A = 0.075; // resting dot alpha (~7.5% white)
const PEAK_A = 0.19; // brightest a ripple/pointer can take a dot
const R0 = 0.8; // resting dot radius, CSS px
const SPEED = 80; // ripple front speed, px/s
const BAND = 46; // ripple band half-width, px
const LIFE = 7.5; // ripple lifetime, s
const HOVER_R = 150; // pointer influence radius, px

export type DotField = {
  ripple: (x: number, y: number, amp?: number) => void;
  show: () => void;
  /** The lattice in viewport px: dot (i, j) sits at (ox + i·gap, oy + j·gap). */
  grid: () => { gap: number; ox: number; oy: number };
};

export function dots(canvas: HTMLCanvasElement, reduced: boolean): DotField {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d')!;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let gap = 20;
  let ox = 0;
  let oy = 0;
  let cols = 0;
  let rows = 0;
  let px: Float32Array = new Float32Array(0);
  let py: Float32Array = new Float32Array(0);

  const ripples: Ripple[] = [];
  const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, a: 0, ta: 0 };
  let raf = 0;
  let last = 0;
  let nextSpawn = 0;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth;
    H = innerHeight;
    gap = W < 640 ? 18 : 22;
    for (const c of [canvas, base]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    cols = Math.ceil(W / gap) + 1;
    rows = Math.ceil(H / gap) + 1;
    // Centre the lattice so it sits evenly on both edges.
    ox = (W - (cols - 1) * gap) / 2;
    oy = (H - (rows - 1) * gap) / 2;
    px = new Float32Array(cols * rows);
    py = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        px[j * cols + i] = ox + i * gap;
        py[j * cols + i] = oy + j * gap;
      }
    // Resting grid, drawn once.
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = `rgb(255 255 255 / ${BASE_A})`;
    bctx.beginPath();
    for (let k = 0; k < px.length; k++) {
      bctx.moveTo(px[k] + R0, py[k]);
      bctx.arc(px[k], py[k], R0, 0, Math.PI * 2);
    }
    bctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
  };

  // Lit dots are bucketed by intensity so each bucket is one path + one fill.
  const LEVELS = 10;
  const buckets: number[][] = Array.from({ length: LEVELS }, () => []);

  const frame = (now: number) => {
    raf = 0;
    const t = now / 1000;
    const dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;

    // Ambient ripples from random points, never more than three at once.
    if (t > nextSpawn) {
      if (ripples.length < 3) ripples.push({ x: Math.random() * W, y: Math.random() * H * 0.9, t0: t, amp: 0.55 + Math.random() * 0.3 });
      nextSpawn = t + 3.4 + Math.random() * 3;
    }
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t0 > LIFE) ripples.splice(i, 1);

    // Pointer: eased follow, and its presence fades in/out.
    const k = 1 - Math.exp(-dt * 10);
    ptr.x += (ptr.tx - ptr.x) * k;
    ptr.y += (ptr.ty - ptr.y) * k;
    ptr.a += (ptr.ta - ptr.a) * (1 - Math.exp(-dt * 4));

    for (const b of buckets) b.length = 0;

    // Precompute each ripple's current front/strength; skip dots far from all fronts.
    const live = ripples.map((r) => {
      const age = t - r.t0;
      const front = age * SPEED;
      // Ease in over the first 0.6s, then decay.
      const env = Math.min(1, age / 0.6) * Math.exp(-age / 2.6) * r.amp;
      return { x: r.x, y: r.y, front, env, lo: Math.max(0, front - BAND * 2.2), hi: front + BAND * 2.2 };
    });
    const hoverOn = ptr.a > 0.01;
    const H2 = HOVER_R * HOVER_R;

    for (let n = 0; n < px.length; n++) {
      const x = px[n];
      const y = py[n];
      let v = 0;
      for (const r of live) {
        if (r.env < 0.01) continue;
        const dx = x - r.x;
        const dy = y - r.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r.lo || d > r.hi) continue;
        const u = (d - r.front) / BAND;
        v += r.env * Math.exp(-u * u);
      }
      if (hoverOn) {
        const dx = x - ptr.x;
        const dy = y - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < H2) {
          const f = 1 - Math.sqrt(d2) / HOVER_R;
          v += ptr.a * f * f * 0.9;
        }
      }
      if (v < 0.04) continue;
      const lvl = Math.min(LEVELS - 1, Math.floor(Math.min(1, v) * LEVELS));
      buckets[lvl].push(n);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let l = 0; l < LEVELS; l++) {
      const list = buckets[l];
      if (!list.length) continue;
      const i = (l + 0.5) / LEVELS;
      const target = BASE_A + (PEAK_A - BASE_A) * i;
      // Over-paint: the lit dot is larger than the resting one, so it simply covers it.
      const r = R0 * (1 + 0.55 * i);
      ctx.fillStyle = `rgb(255 255 255 / ${target.toFixed(3)})`;
      ctx.beginPath();
      for (const n of list) {
        ctx.moveTo(px[n] + r, py[n]);
        ctx.arc(px[n], py[n], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    schedule();
  };

  const schedule = () => {
    if (!raf && !reduced && !document.hidden) raf = requestAnimationFrame(frame);
  };

  resize();
  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(resize, 80);
  });

  if (!reduced) {
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        if (ptr.tx < -999) {
          ptr.x = e.clientX;
          ptr.y = e.clientY;
        }
        ptr.tx = e.clientX;
        ptr.ty = e.clientY;
        ptr.ta = 1;
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => (ptr.ta = 0));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      } else schedule();
    });
    nextSpawn = performance.now() / 1000 + 2.2;
    schedule();
  }

  return {
    ripple(x, y, amp = 1) {
      if (reduced) return;
      ripples.push({ x, y, t0: performance.now() / 1000, amp });
      if (ripples.length > 4) ripples.shift();
      schedule();
    },
    show() {
      canvas.setAttribute('data-on', '');
    },
    grid() {
      return { gap, ox, oy };
    },
  };
}
