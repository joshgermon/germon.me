/**
 * Apple-style springs, parameterised by damping ratio + response (seconds),
 * not mass/stiffness. Always interruptible: retargeting keeps the current value
 * and velocity, so there is never a seam or a "brick wall".
 */

export type SpringConfig = { response?: number; damping?: number };

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  response: number;
  damping: number;

  constructor(value = 0, { response = 0.4, damping = 1 }: SpringConfig = {}) {
    this.value = this.target = value;
    this.response = response;
    this.damping = damping;
  }

  set(v: number) {
    this.value = this.target = v;
    this.velocity = 0;
  }

  to(target: number, cfg?: SpringConfig & { velocity?: number }) {
    this.target = target;
    if (cfg?.response) this.response = cfg.response;
    if (cfg?.damping != null) this.damping = cfg.damping;
    if (cfg?.velocity != null) this.velocity = cfg.velocity;
  }

  /** Advance by dt seconds. Returns true while still moving. */
  step(dt: number) {
    const k = Math.pow((2 * Math.PI) / this.response, 2);
    const c = (4 * Math.PI * this.damping) / this.response;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    const moving = Math.abs(this.velocity) > 0.01 || Math.abs(this.value - this.target) > 0.01;
    if (!moving) {
      this.value = this.target;
      this.velocity = 0;
    }
    return moving;
  }
}

/** Runs a set of springs on rAF until they all settle, calling `apply` each frame. */
export function springLoop(springs: Spring[], apply: () => void) {
  let raf = 0;
  let last = 0;
  const tick = (t: number) => {
    const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
    last = t;
    let moving = false;
    for (const s of springs) moving = s.step(dt) || moving;
    apply();
    raf = moving ? requestAnimationFrame(tick) : 0;
    if (!moving) last = 0;
  };
  return {
    kick() {
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}

/** Apple's momentum projection (Designing Fluid Interfaces sample code). */
export const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/** Progressive resistance past a boundary. */
export const rubberband = (overshoot: number, dimension: number, c = 0.55) =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
