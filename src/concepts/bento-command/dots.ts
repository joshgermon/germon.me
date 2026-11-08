/**
 * The dot field: a 22px grid of near-invisible dots (≈6% white) with two or
 * three slow ripples drifting through it. Drawn at ~30fps, paused when the
 * tab is hidden, and drawn once (static) under prefers-reduced-motion.
 */
export function dots(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GAP = 22;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  const t0 = performance.now();

  // Ripple sources wander on slow Lissajous paths (normalised coords).
  const sources = [
    { ax: 0.32, ay: 0.22, fx: 0.021, fy: 0.017, px: 0, py: 1.3, k: 1 },
    { ax: 0.38, ay: 0.3, fx: 0.013, fy: 0.019, px: 2.1, py: 0.4, k: 0.8 },
    { ax: 0.26, ay: 0.36, fx: 0.017, fy: 0.011, px: 4.2, py: 2.6, k: 0.6 },
  ];

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw(performance.now());
  };

  const light = () => document.documentElement.getAttribute('data-bc') === 'light';

  function draw(now: number) {
    if (!ctx) return;
    const t = reduced ? 8 : (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ink = light() ? '0,0,0' : '255,255,255';
    const base = light() ? 0.07 : 0.055;
    const amp = light() ? 0.09 : 0.075;
    const pts = sources.map((s) => ({
      x: w * (0.5 + s.ax * Math.sin(t * s.fx * 2 * Math.PI + s.px)),
      y: h * (0.5 + s.ay * Math.sin(t * s.fy * 2 * Math.PI + s.py)),
      k: s.k,
    }));
    const ox = ((w % GAP) / 2) | 0;
    const oy = ((h % GAP) / 2) | 0;
    // Bucket by quantised alpha so we only set fillStyle a handful of times.
    const buckets: number[][] = Array.from({ length: 8 }, () => []);
    for (let y = oy; y < h; y += GAP) {
      for (let x = ox; x < w; x += GAP) {
        let a = 0;
        for (const p of pts) {
          const d = Math.hypot(x - p.x, y - p.y);
          // A soft ring travelling outwards, fading with distance.
          const ring = Math.sin(d / 46 - t * 0.9 * p.k);
          a += Math.max(0, ring) ** 6 * Math.exp(-d / 520) * p.k;
        }
        const q = Math.min(7, Math.round(Math.min(1, a) * 7));
        buckets[q].push(x, y);
      }
    }
    for (let q = 0; q < 8; q++) {
      const b = buckets[q];
      if (!b.length) continue;
      ctx.fillStyle = `rgba(${ink},${(base + (amp * q) / 7).toFixed(3)})`;
      const r = 0.75 + q * 0.07;
      ctx.beginPath();
      for (let i = 0; i < b.length; i += 2) {
        ctx.moveTo(b[i] + r, b[i + 1]);
        ctx.arc(b[i], b[i + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    draw(now);
  };

  resize();
  addEventListener('resize', resize);
  new MutationObserver(() => draw(performance.now())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bc'] });
  if (reduced) return;
  raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(loop);
  });
}
