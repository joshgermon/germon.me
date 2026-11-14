/**
 * The globe: a three.js scene that draws an observed day at any minute.
 *
 * The island owns the clock and the interaction; this module owns the GPU. It is imperative on
 * purpose (one canvas, one render loop) and exposes a small API: set the time, fly the camera,
 * focus an airport, find the airport under the pointer.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { LAND_BITS, LATTICE_SIZE, US_BITS } from '~/experiments/ground-stop/data/land-mask';
import { CENTRES } from '~/experiments/ground-stop/domain/artcc';
import { LIFT, STOP, type Minute } from '~/experiments/ground-stop/domain/clock';
import { EVENTS, RECOVERY_STOPS } from '~/experiments/ground-stop/domain/events';
import type { ObservedDay, TrackTable } from '~/experiments/ground-stop/domain/observed-codec';
import {
  hasBit,
  latticePoint,
  toVec3,
  type LatLon,
  type Vec3,
} from '~/experiments/ground-stop/domain/sphere';

import { atmosphereShader, flightShader, landShader, ringShader, stackShader } from './shaders';

/** Colours the scene reads from the design tokens (hex strings). */
export interface Palette {
  readonly ocean: string;
  readonly oceanDot: string;
  readonly land: string;
  readonly us: string;
  readonly flight: string;
  readonly foreign: string;
  readonly held: string;
  readonly released: string;
  readonly atmosphere: string;
}

/** Where the globe sits on screen and how busy its labels are. */
export interface Framing {
  /** Shift the globe off-centre, as fractions of the canvas. */
  readonly offset: { readonly x: number; readonly y: number };
  /** Airports labelled at once. */
  readonly labels: number;
}

/** Where the camera looks from. */
export interface View extends LatLon {
  /** Distance from the Earth's centre, in Earth radii. */
  readonly distance: number;
}

/** What the island can do with the globe. */
export interface Globe {
  /** Draw the sky at a minute (fractional minutes interpolate). */
  readonly setTime: (minute: Minute) => void;
  /** Move the camera; instant when motion is reduced. */
  readonly flyTo: (view: View) => void;
  /** Light one airport's column and label (or none). */
  readonly focus: (code: string | null) => void;
  /** The airport drawn nearest a canvas point, within reach. */
  readonly airportAt: (x: number, y: number) => string | null;
  /** Show the recorded live sky, drawn whenever the clock is past the baked data. */
  readonly setLive: (live: ObservedDay) => void;
  /**
   * At the live edge: how many minutes have passed since the latest sweep. Flights still in the
   * air are carried on along their last heading by that much, so the sky keeps up with the clock.
   */
  readonly setLiveDrift: (minutes: number) => void;
  /**
   * At the live edge: set the flights in motion. Each one keeps replaying the last stretch of its
   * flight up to where it is now, out of step with the others, so the whole sky flows the way
   * the traffic is going. Off, the live sky is still (each flight with a fine wake).
   */
  readonly setLiveFlow: (on: boolean) => void;
  /** Re-place the globe on screen (after a rotate or resize) and set how many airports get labels. */
  readonly setFraming: (framing: Framing) => void;
  readonly dispose: () => void;
}

/** Departures behind normal per dot in an airport's column. */
export const FLIGHTS_PER_DOT = 6;
const STACK_STEP = 0.0042;
/** How a flight's trail is drawn: dots behind the aircraft, `step` minutes apart. */
interface TrailStyle {
  readonly dots: number;
  readonly step: number;
  /** Size and peak opacity of a trail dot, against the aircraft's own dot at 1 and 0.95. */
  readonly scale: number;
  readonly alpha: number;
}
/** The evening: a short dotted tail, the clock does the moving. */
const TRAIL: TrailStyle = { dots: 6, step: 2.5, scale: 0.62, alpha: 0.4 };
/** The live sky: a fine wake of small, close dots, so the tail can't be mistaken for more aircraft. */
const LIVE_TRAIL: TrailStyle = { dots: 11, step: 1.25, scale: 0.34, alpha: 0.5 };
/** In the live flow, each flight replays this many minutes of its flight up to now… */
const FLOW_RUN = 24;
/** …every this many seconds, fading in and out over this share of the loop at each end. */
const FLOW_SECONDS = 5;
const FLOW_FADE = 0.16;
/** A flight is carried past its last recorded point for at most this many minutes. */
const MAX_DRIFT = 8;
const MAX_LABELS = 7;
const PICK_RADIUS = 22;

const color = (hex: string): THREE.Color => new THREE.Color(hex);
const decode64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const height = (feet: number): number => 1.003 + Math.min(45000, feet) * 5.5e-7;

const pointsMaterial = (
  shader: { readonly vertex: string; readonly fragment: string },
  uniforms: Record<string, THREE.IUniform>,
  blending: THREE.Blending = THREE.NormalBlending,
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader: shader.vertex,
    fragmentShader: shader.fragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending,
  });

/** Geometry for rings of dots: every vertex carries its ring's centre, angle, start and phase. */
const ringGeometry = (
  rings: readonly { readonly centre: Vec3; readonly start: number; readonly phase: number }[],
): THREE.BufferGeometry => {
  const dots = 36;
  const n = rings.length * dots;
  const centres = new Float32Array(n * 3);
  const angles = new Float32Array(n);
  const starts = new Float32Array(n);
  const phases = new Float32Array(n);
  rings.forEach((r, k) => {
    for (let d = 0; d < dots; d++) {
      const i = k * dots + d;
      centres.set([r.centre.x, r.centre.y, r.centre.z], i * 3);
      angles[i] = (d / dots) * Math.PI * 2;
      starts[i] = r.start;
      phases[i] = r.phase;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aCentre', new THREE.BufferAttribute(centres, 3));
  g.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  g.setAttribute('aStart', new THREE.BufferAttribute(starts, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  return g;
};

const slerpUnit = (a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 => {
  const omega = a.angleTo(b);
  if (omega < 1e-5) return b.clone();
  const s = Math.sin(omega);
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * omega) / s)
    .add(b.clone().multiplyScalar(Math.sin(t * omega) / s));
};

/** Distance from a point to the segment a–b, in pixels. */
const toSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t =
    dx === 0 && dy === 0 ? 0 : clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Mount the globe on a canvas. Labels are positioned DOM nodes inside `labelLayer`. */
export const createGlobe = (options: {
  readonly canvas: HTMLCanvasElement;
  readonly labelLayer: HTMLElement;
  readonly day: ObservedDay;
  readonly palette: Palette;
  readonly reducedMotion: boolean;
  /** Whether the pointer can turn the globe (fine pointers only). */
  readonly interactive: boolean;
  readonly framing: Framing;
  readonly initial: View;
}): Globe => {
  const { canvas, labelLayer, day, palette, reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  // Transparent: the page's night gradient shows around the globe.
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.45;
  controls.enableZoom = options.interactive;
  controls.zoomSpeed = 0.5;
  controls.minDistance = 1.5;
  controls.maxDistance = 6.5;
  controls.enabled = options.interactive;

  const uPixelRatio = { value: pixelRatio };
  const uTime = { value: STOP };
  const uClock = { value: 0 };
  const uStop = { value: 0 };
  const uReopen = { value: 0 };
  const uReduced = { value: reducedMotion ? 1 : 0 };
  const uHeld = { value: color(palette.held) };
  const uReleased = { value: color(palette.released) };

  // ── Ocean occluder and atmosphere ───────────────────────────────────────────────────────
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.995, 96, 64),
      new THREE.MeshBasicMaterial({ color: color(palette.ocean) }),
    ),
  );
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.07, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereShader.vertex,
        fragmentShader: atmosphereShader.fragment,
        uniforms: { uColor: { value: color(palette.atmosphere) }, uStrength: { value: 0.5 } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );

  // ── Dot-matrix Earth ─────────────────────────────────────────────────────────────────────
  const land = decode64(LAND_BITS);
  const us = decode64(US_BITS);
  const landPositions = new Float32Array(LATTICE_SIZE * 3);
  const landKinds = new Float32Array(LATTICE_SIZE);
  for (let i = 0; i < LATTICE_SIZE; i++) {
    const p = latticePoint(i, LATTICE_SIZE);
    landPositions.set([p.x, p.y, p.z], i * 3);
    landKinds[i] = hasBit(us, i) ? 2 : hasBit(land, i) ? 1 : 0;
  }
  const landGeometry = new THREE.BufferGeometry();
  landGeometry.setAttribute('position', new THREE.BufferAttribute(landPositions, 3));
  landGeometry.setAttribute('aKind', new THREE.BufferAttribute(landKinds, 1));
  const landPoints = new THREE.Points(
    landGeometry,
    pointsMaterial(landShader, {
      uSize: { value: 10.5 },
      uPixelRatio,
      uStop,
      uReopen,
      uClock,
      uOcean: { value: color(palette.oceanDot) },
      uLand: { value: color(palette.land) },
      uUs: { value: color(palette.us) },
      uHeld,
      uReleased,
    }),
  );
  landPoints.renderOrder = 1;
  scene.add(landPoints);

  // ── Flights: observed tracks, interpolated on the CPU when the clock moves ──────────────
  interface TrackLayer {
    readonly points: THREE.Points;
    readonly draw: (m: number) => void;
    /** Draw every flight still flying at the window's end, somewhere along its run-up to `head`. */
    readonly flow: (head: number, seconds: number) => void;
    readonly dispose: () => void;
  }
  /** One set of tracks (sorted by start) over a window, drawn as dots with fading trails. */
  const trackLayer = (
    tracks: TrackTable,
    window: { readonly start: Minute; readonly end: Minute },
    /** The live sky: a finer trail, and flights can be carried past their last point. */
    isLive: boolean,
  ): TrackLayer => {
    const ux = new Float32Array(tracks.t.length);
    const uy = new Float32Array(tracks.t.length);
    const uz = new Float32Array(tracks.t.length);
    for (let p = 0; p < tracks.t.length; p++) {
      const v = toVec3({ lat: tracks.lat[p] ?? 0, lon: tracks.lon[p] ?? 0 });
      ux[p] = v.x;
      uy[p] = v.y;
      uz[p] = v.z;
    }
    const tStart = new Float32Array(tracks.count);
    const tEnd = new Float32Array(tracks.count);
    for (let i = 0; i < tracks.count; i++) {
      tStart[i] = tracks.t[tracks.offsets[i] ?? 0] ?? 0;
      tEnd[i] = tracks.t[(tracks.offsets[i + 1] ?? 1) - 1] ?? 0;
    }
    // Size the buffer for the busiest minute.
    let busiest = 0;
    for (let m = window.start; m <= window.end; m += 5) {
      let n = 0;
      for (let i = 0; i < tracks.count; i++) if ((tStart[i] ?? 0) <= m && m <= (tEnd[i] ?? 0)) n++;
      busiest = Math.max(busiest, n);
    }
    const trail = isLive ? LIVE_TRAIL : TRAIL;
    const capacity = Math.ceil(busiest * 1.15 + 8) * (trail.dots + 1);
    const fPos = new Float32Array(capacity * 3);
    const fKind = new Float32Array(capacity);
    const fAlpha = new Float32Array(capacity);
    const fScale = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage);
    const kindAttr = new THREE.BufferAttribute(fKind, 1).setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(fAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    const scaleAttr = new THREE.BufferAttribute(fScale, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('aKind', kindAttr);
    geometry.setAttribute('aAlpha', alphaAttr);
    geometry.setAttribute('aScale', scaleAttr);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
    const material = pointsMaterial(
      flightShader,
      {
        uSize: { value: 9 },
        uPixelRatio,
        uFlight: { value: color(palette.flight) },
        uReleased,
        uForeign: { value: color(palette.foreign) },
      },
      THREE.AdditiveBlending,
    );
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 3;
    scene.add(points);

    /** Index of the point at or before `t` in [from, to), by binary search. */
    const segmentAt = (from: number, to: number, t: number): number => {
      let lo = from;
      let hi = to - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((tracks.t[mid] ?? 0) <= t) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    /** Write flight `i`'s dot for minute `tm` into slot `n` (past its last point, along its last leg). */
    const put = (n: number, i: number, tm: number, alpha: number, scale: number): void => {
      const from = tracks.offsets[i] ?? 0;
      const to = tracks.offsets[i + 1] ?? 0;
      // Beyond the last point: stay on the last leg and extend it.
      const j = tm > (tEnd[i] ?? 0) ? Math.max(from, to - 2) : segmentAt(from, to, tm);
      const j2 = Math.min(j + 1, to - 1);
      const t0 = tracks.t[j] ?? 0;
      const t1 = tracks.t[j2] ?? 0;
      const f = t1 > t0 ? (tm - t0) / (t1 - t0) : 0;
      // Normalised lerp: at a few minutes between points, indistinguishable from slerp.
      const x = (ux[j] ?? 0) + ((ux[j2] ?? 0) - (ux[j] ?? 0)) * f;
      const y = (uy[j] ?? 0) + ((uy[j2] ?? 0) - (uy[j] ?? 0)) * f;
      const z = (uz[j] ?? 0) + ((uz[j2] ?? 0) - (uz[j] ?? 0)) * f;
      const feet =
        (tracks.alt[j] ?? 0) + ((tracks.alt[j2] ?? 0) - (tracks.alt[j] ?? 0)) * Math.min(1, f);
      const r = height(feet) / (Math.hypot(x, y, z) || 1);
      fPos[n * 3] = x * r;
      fPos[n * 3 + 1] = y * r;
      fPos[n * 3 + 2] = z * r;
      fKind[n] = tracks.kind[i] ?? 0;
      fAlpha[n] = alpha;
      fScale[n] = scale;
    };
    const commit = (n: number): void => {
      geometry.setDrawRange(0, n);
      posAttr.needsUpdate = true;
      kindAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      scaleAttr.needsUpdate = true;
    };

    const draw = (m: number): void => {
      let n = 0;
      for (let i = 0; i < tracks.count && n < capacity - trail.dots - 1; i++) {
        const s = tStart[i] ?? 0;
        if (s > m) break; // tracks are sorted by start
        const e = tEnd[i] ?? 0;
        // Past its last point a flight is gone, unless it was still flying at the latest sweep:
        // then it carries on along its last leg for a few minutes.
        if (e < m && !(isLive && e >= window.end - 0.5 && m <= e + MAX_DRIFT)) continue;
        for (let k = 0; k <= trail.dots; k++) {
          const tm = m - k * trail.step;
          if (tm < s) break;
          const fade = 1 - k / (trail.dots + 1);
          put(n++, i, tm, k === 0 ? 0.95 : trail.alpha * fade * fade, k === 0 ? 1 : trail.scale);
        }
      }
      commit(n);
    };

    const flow = (head: number, seconds: number): void => {
      let n = 0;
      for (let i = 0; i < tracks.count && n < capacity - 1; i++) {
        const s = tStart[i] ?? 0;
        if (s > head) break;
        const e = tEnd[i] ?? 0;
        if (e < window.end - 0.5) continue; // landed, or lost, before the latest sweep
        const to = Math.min(head, e + MAX_DRIFT);
        const run = Math.min(FLOW_RUN, to - s);
        if (run < 1) continue;
        // Where this flight is in its loop; each starts at a different point so they never
        // all jump back together.
        const p = (seconds / FLOW_SECONDS + ((i * 0.618) % 1)) % 1;
        // Fade in as it sets off and out as it arrives, so the return to the start is never seen.
        const alpha = 0.95 * Math.min(1, p / FLOW_FADE, (1 - p) / FLOW_FADE);
        put(n++, i, to - run * (1 - p), alpha, 1);
      }
      commit(n);
    };
    return {
      points,
      draw,
      flow,
      dispose: () => {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };
  };
  const baked = trackLayer(day.tracks, day.window, false);
  // Live: the recorder's last 90 minutes, replaced whole each time a newer sweep arrives.
  let live: TrackLayer | null = null;
  const setLive = (recorded: ObservedDay): void => {
    live?.dispose();
    live = trackLayer(recorded.tracks, recorded.window, true);
    liveEnd = recorded.window.end;
    setTime(uTime.value);
  };
  let liveEnd = Number.POSITIVE_INFINITY;
  let liveDrift = 0;
  const setLiveDrift = (minutes: number): void => {
    const next = Math.max(0, Math.min(MAX_DRIFT, minutes));
    if (Math.abs(next - liveDrift) < 0.01) return;
    liveDrift = next;
    if (uTime.value >= liveEnd - 0.01) setTime(uTime.value);
  };
  let flowing = false;
  const setLiveFlow = (on: boolean): void => {
    if (on === flowing) return;
    flowing = on;
    // Back to the still picture when the flow stops.
    if (!on) setTime(uTime.value);
  };

  // ── Shortfall columns: departures behind last Friday, per airport ──────────────────────
  const { series, airports } = day;
  const unit = airports.map((a) => toVec3(a));
  const levels = airports.map((_, i) => {
    let max = 0;
    for (let m = 0; m < series.length; m++)
      max = Math.max(max, series.shortfall[i * series.length + m] ?? 0);
    return Math.ceil(max / FLIGHTS_PER_DOT);
  });
  const stackCount = levels.reduce((x, n) => x + n, 0);
  const stackPositions = new Float32Array(stackCount * 3);
  const stackOn = new Float32Array(stackCount);
  const stackTop = new Float32Array(stackCount);
  const stackFocus = new Float32Array(stackCount);
  const stackOffsets: number[] = [];
  let cursor = 0;
  airports.forEach((_, k) => {
    stackOffsets.push(cursor);
    const n = unit[k];
    for (let l = 0; l < (levels[k] ?? 0); l++) {
      if (n)
        stackPositions.set(
          [n.x, n.y, n.z].map((c) => c * (1.006 + l * STACK_STEP)),
          cursor * 3,
        );
      cursor++;
    }
  });
  const stackGeometry = new THREE.BufferGeometry();
  stackGeometry.setAttribute('position', new THREE.BufferAttribute(stackPositions, 3));
  const onAttribute = new THREE.BufferAttribute(stackOn, 1);
  const topAttribute = new THREE.BufferAttribute(stackTop, 1);
  const focusAttribute = new THREE.BufferAttribute(stackFocus, 1);
  stackGeometry.setAttribute('aOn', onAttribute);
  stackGeometry.setAttribute('aTop', topAttribute);
  stackGeometry.setAttribute('aFocus', focusAttribute);
  const stacks = new THREE.Points(
    stackGeometry,
    pointsMaterial(
      stackShader,
      { uSize: { value: 11 }, uPixelRatio, uHeld },
      THREE.AdditiveBlending,
    ),
  );
  stacks.renderOrder = 2;
  scene.add(stacks);

  // ── Rings: the 22 centres, and pings for events at airports ─────────────────────────────
  const ringMaterial = (mode: number, active: { value: number }): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      vertexShader: ringShader.vertex,
      fragmentShader: ringShader.fragment,
      uniforms: {
        uTime,
        uClock,
        uMode: { value: mode },
        uActive: active,
        uReduced,
        uColor: uHeld,
        uSize: { value: 7 },
        uPixelRatio,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const centresActive = { value: 0 };
  const artcc = new THREE.Points(
    ringGeometry(
      CENTRES.flatMap((c, k) => [
        { centre: toVec3(c), start: STOP, phase: (k * 0.137) % 1 },
        { centre: toVec3(c), start: STOP, phase: ((k * 0.137) % 1) + 0.5 },
      ]),
    ),
    ringMaterial(0, centresActive),
  );
  artcc.renderOrder = 4;
  scene.add(artcc);
  const pingAt = [
    ...EVENTS.flatMap((e) => (e.airports ?? []).map((code) => ({ code, at: e.at }))),
    ...RECOVERY_STOPS.map((s) => ({ code: s.airport, at: s.at })),
  ].flatMap(({ code, at }) => {
    const a = airports.find((x) => x.code === code);
    return a ? [{ centre: toVec3(a), start: at, phase: 0 }] : [];
  });
  const pings = new THREE.Points(ringGeometry(pingAt), ringMaterial(1, { value: 1 }));
  pings.renderOrder = 4;
  scene.add(pings);

  // ── Labels: the airports furthest behind, and the focused one ──────────────────────────
  let framing = options.framing;
  const labelNodes = Array.from({ length: MAX_LABELS + 1 }, () => {
    const el = document.createElement('div');
    el.className =
      'pointer-events-none absolute left-0 top-0 flex items-baseline gap-1.5 whitespace-nowrap rounded-xs px-1 font-mono text-micro text-fg will-change-transform';
    el.style.opacity = '0';
    const code = document.createElement('span');
    const value = document.createElement('span');
    value.className = 'text-accent tabular';
    el.appendChild(code);
    el.appendChild(value);
    labelLayer.appendChild(el);
    return { el, code, value, airport: -1 };
  });

  let minute = 0;
  let focused = -1;
  let onLive = false;
  const shortfallAt = (a: number): number => series.shortfall[a * series.length + minute] ?? 0;
  const updateStacks = (): void => {
    airports.forEach((_, k) => {
      const on = Math.ceil(shortfallAt(k) / FLIGHTS_PER_DOT);
      const offset = stackOffsets[k] ?? 0;
      for (let l = 0; l < (levels[k] ?? 0); l++) {
        stackOn[offset + l] = l < on ? 1 : 0;
        stackTop[offset + l] = l === on - 1 ? 1 : 0;
        stackFocus[offset + l] = k === focused ? 1 : 0;
      }
    });
    onAttribute.needsUpdate = true;
    topAttribute.needsUpdate = true;
    focusAttribute.needsUpdate = true;
    const ranked = airports
      .map((_, i) => ({ i, v: shortfallAt(i) }))
      .filter((x) => x.v >= 12)
      .toSorted((x, y) => y.v - x.v)
      .slice(0, framing.labels)
      .map((x) => x.i);
    if (focused >= 0 && !ranked.includes(focused)) ranked.push(focused);
    labelNodes.forEach((node, k) => {
      const i = ranked[k];
      node.airport = i ?? -1;
      node.code.textContent = i === undefined ? '' : (airports[i]?.code ?? '');
      node.value.textContent = i === undefined ? '' : `−${shortfallAt(i).toLocaleString('en-US')}`;
      node.el.classList.toggle('bg-glass', i === focused);
    });
  };

  const projected = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const facingOf = (n: Vec3): number => {
    toCamera.copy(camera.position).normalize();
    return toCamera.x * n.x + toCamera.y * n.y + toCamera.z * n.z;
  };
  const screenOf = (n: Vec3, r: number): { readonly x: number; readonly y: number } => {
    projected.set(n.x * r, n.y * r, n.z * r).project(camera);
    return { x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height2 };
  };
  const placeLabels = (): void => {
    for (const node of labelNodes) {
      const n = unit[node.airport];
      if (!n || onLive) {
        node.el.style.opacity = '0';
        continue;
      }
      const top =
        1.006 + Math.ceil(shortfallAt(node.airport) / FLIGHTS_PER_DOT) * STACK_STEP + 0.01;
      const { x, y } = screenOf(n, top);
      node.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -130%)`;
      node.el.style.opacity = String(clamp01((facingOf(n) - 0.25) / 0.2));
    }
  };

  // ── Camera ───────────────────────────────────────────────────────────────────────────────
  const place = (v: View): void => {
    const p = toVec3(v);
    camera.position.set(p.x * v.distance, p.y * v.distance, p.z * v.distance);
    camera.lookAt(0, 0, 0);
  };
  place(options.initial);
  controls.update();

  let flight: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromD: number;
    toD: number;
    start: number;
    ms: number;
  } | null = null;
  const flyTo = (view: View): void => {
    const target = toVec3(view);
    const to = new THREE.Vector3(target.x, target.y, target.z);
    if (reducedMotion) {
      flight = null;
      place(view);
      controls.update();
      return;
    }
    const from = camera.position.clone();
    const fromD = from.length();
    const angle = from.clone().normalize().angleTo(to);
    flight = {
      from: from.normalize(),
      to,
      fromD,
      toD: view.distance,
      start: performance.now(),
      ms: 900 + angle * 600 + Math.abs(view.distance - fromD) * 100,
    };
  };
  controls.addEventListener('start', () => {
    flight = null;
  });

  // ── Clock ────────────────────────────────────────────────────────────────────────────────
  const setTime = (m: Minute): void => {
    uTime.value = m;
    // Deterministic from the clock, so scrubbing backwards undoes it.
    const stopped = m >= STOP && m < LIFT;
    uStop.value = stopped ? clamp01((m - STOP) / 8) : m >= LIFT ? clamp01(1 - (m - LIFT) / 6) : 0;
    uReopen.value = m >= LIFT ? clamp01(1 - (m - LIFT) / 50) * 0.85 : 0;
    centresActive.value = stopped ? 1 : 0;
    const past = live !== null && m > day.window.end;
    // The columns are the evening's losses; the live sky is drawn without them.
    onLive = past;
    stacks.visible = !past;
    baked.points.visible = !past;
    if (live) live.points.visible = past;
    if (past && live) live.draw(m >= liveEnd - 0.01 ? m + liveDrift : m);
    else baked.draw(m);
    const next = Math.max(0, Math.min(series.length - 1, Math.floor(m - day.window.start)));
    if (next !== minute) {
      minute = next;
      updateStacks();
    }
  };
  setTime(day.window.start);
  updateStacks();

  const focus = (code: string | null): void => {
    focused = code === null ? -1 : airports.findIndex((a) => a.code === code);
    updateStacks();
  };

  let width = 0;
  let height2 = 0;
  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height2 = rect.height;
    renderer.setSize(width, height2, false);
    camera.aspect = width / Math.max(1, height2);
    // A view offset moves the globe on screen without moving the camera, so orbiting still
    // turns it about its own centre.
    camera.setViewOffset(
      width,
      height2,
      -width * framing.offset.x,
      -height2 * framing.offset.y,
      width,
      height2,
    );
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const airportAt = (x: number, y: number): string | null => {
    if (onLive) return null;
    let best = -1;
    let bestD = PICK_RADIUS;
    unit.forEach((n, i) => {
      if (facingOf(n) < 0.2) return;
      // Anywhere along the column counts, from the airport to the column's top.
      const top = 1.006 + Math.ceil(shortfallAt(i) / FLIGHTS_PER_DOT) * STACK_STEP;
      const d = toSegment({ x, y }, screenOf(n, 1.0), screenOf(n, top));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return airports[best]?.code ?? null;
  };

  let frame = 0;
  const started = performance.now();
  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    uClock.value = (now - started) / 1000;
    if (flowing && live && uTime.value >= liveEnd - 0.01)
      live.flow(liveEnd + liveDrift, uClock.value);
    if (flight) {
      const t = clamp01((now - flight.start) / flight.ms);
      const e = easeInOut(t);
      // Pull out a little mid-flight, like a camera crane, then settle in.
      const lift = Math.sin(Math.PI * e) * Math.min(0.9, flight.from.angleTo(flight.to) * 0.6);
      const d = flight.fromD + (flight.toD - flight.fromD) * e + lift;
      camera.position.copy(slerpUnit(flight.from, flight.to, e).multiplyScalar(d));
      camera.lookAt(0, 0, 0);
      if (t >= 1) flight = null;
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
    placeLabels();
  };
  frame = requestAnimationFrame(tick);

  return {
    setTime,
    flyTo,
    focus,
    airportAt,
    setLive,
    setLiveDrift,
    setLiveFlow,
    setFraming: (next) => {
      framing = next;
      resize();
      minute = -1;
      setTime(uTime.value);
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      for (const node of labelNodes) node.el.remove();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          const m: unknown = o.material;
          if (m instanceof THREE.Material) m.dispose();
        }
      });
      renderer.dispose();
    },
  };
};
