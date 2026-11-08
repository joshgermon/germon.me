/**
 * Apple-style springs for gesture-driven motion (sheets, the palette highlight), parameterised
 * by damping ratio + response in seconds rather than mass/stiffness. Always interruptible:
 * retargeting keeps the current value and velocity, so a grab mid-flight never jumps.
 *
 * The maths (`Spring#step`, `project`, `rubberband`) is pure; `springLoop` is the one piece
 * that touches `requestAnimationFrame`.
 */

/** How a spring feels: `response` ≈ seconds to settle, `damping` 1 = no overshoot. */
export type SpringConfig = { readonly response?: number; readonly damping?: number };

/** One animated number. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  response: number;
  damping: number;

  constructor(value = 0, { response = 0.4, damping = 1 }: SpringConfig = {}) {
    this.value = value;
    this.target = value;
    this.response = response;
    this.damping = damping;
  }

  /** Jump to `v` and stop. */
  set(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  /** Retarget, optionally changing feel or injecting a release velocity (units/s). */
  to(target: number, cfg: SpringConfig & { readonly velocity?: number } = {}): void {
    this.target = target;
    if (cfg.response !== undefined) this.response = cfg.response;
    if (cfg.damping !== undefined) this.damping = cfg.damping;
    if (cfg.velocity !== undefined) this.velocity = cfg.velocity;
  }

  /**
   * Advance by `dt` seconds (sub-stepped at 240Hz for stability).
   *
   * @returns `true` while still moving.
   */
  step(dt: number): boolean {
    const k = ((2 * Math.PI) / this.response) ** 2;
    const c = (4 * Math.PI * this.damping) / this.response;
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    const moving = Math.abs(this.velocity) > 0.01 || Math.abs(this.value - this.target) > 0.01;
    if (!moving) this.set(this.target);
    return moving;
  }
}

/** A running animation of some springs. */
export type SpringLoop = {
  /** Start ticking if not already. */
  readonly kick: () => void;
  /** Stop immediately (values stay where they are). */
  readonly stop: () => void;
};

/**
 * Tick `springs` on animation frames until they all settle, calling `apply` after each frame.
 *
 * @param springs - The springs to advance together.
 * @param apply - Writes the current values to the DOM.
 */
export function springLoop(springs: ReadonlyArray<Spring>, apply: () => void): SpringLoop {
  let raf = 0;
  let last = 0;
  const tick = (t: number): void => {
    const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
    last = t;
    let moving = false;
    for (const s of springs) moving = s.step(dt) || moving;
    apply();
    raf = moving ? requestAnimationFrame(tick) : 0;
    if (!moving) last = 0;
  };
  return {
    kick: () => {
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop: () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}

/**
 * Where a flick would come to rest: Apple's momentum projection ("Designing Fluid
 * Interfaces").
 *
 * @param velocity - Release velocity in px/s.
 * @param rate - Deceleration rate per ms (UIScrollView's normal rate by default).
 * @returns The extra distance travelled, in px.
 */
export const project = (velocity: number, rate = 0.998): number =>
  ((velocity / 1000) * rate) / (1 - rate);

/**
 * Progressive resistance past a boundary (iOS rubber-banding).
 *
 * @param overshoot - How far past the boundary the finger is.
 * @param dimension - The size of the thing being dragged.
 * @param c - Stiffness; 0.55 matches UIScrollView.
 * @returns The damped offset, same sign as `overshoot`, never larger than it.
 */
export const rubberband = (overshoot: number, dimension: number, c = 0.55): number =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
