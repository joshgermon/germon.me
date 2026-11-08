/**
 * A rotary control with detents.
 *
 * - Drag around the centre: the value follows your finger's angle 1:1, but a
 *   sinusoidal "detent torque" pulls it toward the nearest stop, so you feel
 *   it fall into each notch while turning.
 * - A ratchet fires `onTick` every `ratchet` units for clicks/LED blips.
 * - Release projects your angular momentum (Apple's projection) and springs
 *   into the chosen stop, inheriting the release velocity.
 * - Wheel steps one stop per notch; arrow keys / Home / End for keyboard.
 */
import { Spring, springLoop, project, rubberband, prefersReducedMotion } from '@/lib/glass';

export type KnobOpts = {
  hit: HTMLElement;
  min: number;
  max: number;
  /** Degrees of rotation per value unit. */
  degPerUnit: number;
  /** Uniform stop spacing in value units (stops at min, min+step, …). */
  step: number;
  value: number;
  /** 0..0.9 — how strongly the drag falls into notches. */
  magnet?: number;
  ratchet?: number;
  /** Angle offset so value `min` points somewhere sensible. */
  angle0?: number;
  onInput: (value: number, angle: number) => void;
  onStop?: (index: number) => void;
  onTick?: () => void;
  spring?: { response: number; damping: number };
};

export class Knob {
  o: KnobOpts;
  s: Spring;
  stop: number;
  #lastTick = 0;
  #loop: ReturnType<typeof springLoop>;
  #reduced = prefersReducedMotion();
  dragging = false;

  constructor(o: KnobOpts) {
    this.o = { magnet: 0.55, ratchet: o.step, angle0: 0, ...o };
    this.s = new Spring(o.value, o.spring ?? { response: 0.34, damping: 0.62 });
    this.stop = this.#nearest(o.value);
    this.#lastTick = Math.floor(o.value / this.o.ratchet!);
    this.#loop = springLoop([this.s], () => this.#apply());
    this.#apply();
    this.#bind();
  }

  get count() {
    return Math.round((this.o.max - this.o.min) / this.o.step) + 1;
  }

  #nearest(v: number) {
    return Math.max(0, Math.min(this.count - 1, Math.round((v - this.o.min) / this.o.step)));
  }

  #apply() {
    const v = this.s.value;
    this.o.onInput(v, this.o.angle0! + v * this.o.degPerUnit);
    const t = Math.floor(v / this.o.ratchet! + 0.5);
    if (t !== this.#lastTick) {
      this.#lastTick = t;
      this.o.onTick?.();
    }
    const n = this.#nearest(v);
    if (n !== this.stop) {
      this.stop = n;
      this.o.hit.setAttribute('aria-valuenow', String(n));
      this.o.onStop?.(n);
    }
  }

  /** Detent torque: pulls a raw finger value toward the nearest notch. */
  #detent(raw: number) {
    const { step, min, magnet } = this.o;
    const p = (raw - min) / step;
    return raw - ((magnet! * step) / (2 * Math.PI)) * Math.sin(2 * Math.PI * p);
  }

  goTo(i: number, velocity = 0) {
    const idx = Math.max(0, Math.min(this.count - 1, i));
    const target = this.o.min + idx * this.o.step;
    if (this.#reduced) {
      this.s.set(target);
      this.#apply();
    } else {
      this.s.to(target, { velocity });
      this.#loop.kick();
    }
  }

  #bind() {
    const { hit } = this.o;
    hit.setAttribute('aria-valuemin', '0');
    hit.setAttribute('aria-valuemax', String(this.count - 1));
    hit.setAttribute('aria-valuenow', String(this.stop));
    this.bindDrag(hit);
    hit.addEventListener('keydown', (e) => {
      const cur = this.#nearest(this.s.target);
      const map: Record<string, number> = {
        ArrowRight: cur + 1,
        ArrowUp: cur + 1,
        ArrowLeft: cur - 1,
        ArrowDown: cur - 1,
        PageUp: cur + 2,
        PageDown: cur - 2,
        Home: 0,
        End: this.count - 1,
      };
      if (!(e.key in map)) return;
      e.preventDefault();
      this.goTo(map[e.key]);
    });
  }

  /**
   * Make `target` turn this knob. Rotary (around the knob's centre) by default;
   * pass `pxPerUnit` to drag it linearly like a tuning strip.
   */
  bindDrag(target: HTMLElement, linear?: { pxPerUnit: () => number; valueAt: (clientX: number) => number }) {
    const pxPerUnit = linear?.pxPerUnit;
    let startX = 0;
    const { hit } = this.o;

    let raw = 0;
    let lastA = 0;
    let lastX = 0;
    let hist: { v: number; t: number }[] = [];
    const centre = () => {
      const r = hit.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const angleOf = (e: PointerEvent) => {
      const c = centre();
      return (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    };

    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dragging = true;
      raw = this.s.value;
      lastA = angleOf(e);
      lastX = startX = e.clientX;
      hist = [{ v: raw, t: e.timeStamp }];
      target.setPointerCapture(e.pointerId);
      this.s.to(this.s.value, { velocity: 0 });
      // Focus for keyboard follow-up, without the focus ring a pointer user doesn't need.
      hit.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      hit.dataset.grab = '';
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      if (pxPerUnit) {
        raw += (e.clientX - lastX) / pxPerUnit();
        lastX = e.clientX;
      } else {
        const a = angleOf(e);
        let d = a - lastA;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        lastA = a;
        raw += d / this.o.degPerUnit;
      }
      const { min, max, step } = this.o;
      let v = raw;
      if (v < min) v = min - rubberband(min - v, step);
      else if (v > max) v = max + rubberband(v - max, step);
      else v = this.#detent(v);
      hist.push({ v: raw, t: e.timeStamp });
      if (hist.length > 6) hist.shift();
      this.s.set(v);
      this.#apply();
    });
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      delete hit.dataset.grab;
      if (linear && Math.abs(e.clientX - startX) < 4) {
        // A tap on the strip tunes straight to the nearest stop.
        this.goTo(this.#nearest(linear.valueAt(e.clientX)));
        return;
      }
      const a = hist[0];
      const b = hist[hist.length - 1];
      const dt = (b.t - a.t) / 1000;
      const vel = dt > 0.004 ? (b.v - a.v) / dt : 0;
      const proj = this.s.value + project(vel, 0.985);
      const from = this.#nearest(this.s.value);
      let to = Math.round((proj - this.o.min) / this.o.step);
      to = Math.max(from - 2, Math.min(from + 2, to));
      this.goTo(to, vel);
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);

    let acc = 0;
    let lock = 0;
    target.addEventListener(
      'wheel',
      (e) => {
        // Strips only take horizontal scroll so they never trap page scrolling.
        const d = linear ? e.deltaX : Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const dir = Math.sign(d);
        if (!dir) return;
        const cur = this.#nearest(this.s.target);
        if ((dir > 0 && cur >= this.count - 1) || (dir < 0 && cur <= 0)) return;
        e.preventDefault();
        if (performance.now() < lock) return;
        acc += d;
        if (Math.abs(acc) > 30) {
          this.goTo(cur + dir);
          acc = 0;
          lock = performance.now() + 160;
        }
      },
      { passive: false },
    );
  }
}
