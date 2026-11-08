/**
 * The office camera: an orthographic camera on the export's iso angle (`CAM_Iso`), orbiting
 * its target inside the export's envelope (domain/office/orbit). Drags orbit with damping;
 * after a few idle seconds the view sways gently; close-ups glide (pointer) or cut (keyboard,
 * reduced motion) to a framing worked out by domain/office/framing.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { frame, type Extent, type FrameSpec, type FreeArea } from '~/domain/office/framing';
import {
  clampOrbit,
  closeUpOrbit,
  easeInOutCubic,
  orbitRange,
  swayAzimuth,
  swayCenter,
  type CameraLimits,
  type Orbit,
  type OrbitRange,
} from '~/domain/office/orbit';
import { nudgeZoom, wheelFactor, zoomProgress as zoomRangeProgress } from '~/domain/office/zoom';
import { NODE } from '../assets';

const DEG = Math.PI / 180;
/** Blender IsoCam ortho_scale, if the GLB has no camera. */
const DEFAULT_SPAN = 6.1;
/** Blender IsoCam looks at about (0, 0.25, 1.1) → three.js Y-up (x, z, −y). */
const DEFAULT_LOOK_AT = new THREE.Vector3(0, 1.1, -0.25);
/** Blender IsoCam rotation (58°, 0, 45°, XYZ Euler == three.js ZYX), if the GLB has no camera. */
const DEFAULT_ROTATION = new THREE.Euler(58 * DEG, 0, 45 * DEG, 'ZYX');
const RADIUS = 15;
/** The export's camera leaves a margin around the room; the card's own padding is enough. */
const HOME_ZOOM = 1.1;
/** Vertical drags only nudge the view: this much polar slack either side of home. */
const POLAR_SLACK = 7 * DEG;
/** How much of the visitor's orbit a close-up keeps. */
const CLOSE_UP_KEEP: Orbit = { theta: 8 * DEG, phi: 3 * DEG };
const SWAY = { amplitude: 5 * DEG, period: 10, idleAfter: 3 } as const;
/** A camera glide: spatial navigation, so slower than UI chrome, but not lazy. */
const GLIDE_SECONDS = 0.75;
/** A zoom-button step: UI feedback, so quick. */
const ZOOM_SECONDS = 0.24;

/** Where the camera looks, how close, and from which direction. */
export type View = { readonly target: THREE.Vector3; readonly zoom: number; readonly orbit: Orbit };

/** Instant camera cut, or an eased glide. */
export type Motion = 'cut' | 'glide';

/** The camera and everything that moves it. */
export type CameraRig = {
  readonly camera: THREE.OrthographicCamera;
  readonly range: OrbitRange;
  /** The designed iso view. */
  readonly home: View;
  /** Fit the room to the canvas ("contain": the span covers the shorter side). */
  resize(width: number, height: number): void;
  /** Visible world height at the current zoom. */
  visibleHeight(): number;
  /** Where the camera is now. */
  current(): View;
  /** Move to a view, gliding or cutting. */
  moveTo(view: View, motion: Motion): void;
  /** The close-up framing for an object. */
  closeUp(
    extent: (right: THREE.Vector3, up: THREE.Vector3) => Extent | undefined,
    center: THREE.Vector3,
    free: FreeArea,
    spec: FrameSpec,
  ): View | undefined;
  /** Nudge the zoom within the manual range above the settled view (domain/office/zoom). */
  zoomBy(factor: number, motion: Motion): void;
  /** Where the zoom sits in its manual range, 0–1 (for enabling the zoom buttons). */
  zoomProgress(): number;
  /** Note a user interaction (pauses the idle sway). */
  touch(): void;
  /** Advance one frame; `idle` allows the sway. Returns whether the camera moved. */
  update(dt: number, idle: boolean): boolean;
  /** Current azimuth offset from home and elevation, in degrees (for QA). */
  angles(): { readonly azimuthOffsetDeg: number; readonly elevationDeg: number };
  dispose(): void;
};

/** The model's camera node, as a world position, view direction and orthographic span. */
function readIsoCamera(root: THREE.Object3D): {
  readonly position: THREE.Vector3 | undefined;
  readonly direction: THREE.Vector3;
  readonly span: number;
} {
  const fallback = new THREE.Vector3(0, 0, -1).applyEuler(DEFAULT_ROTATION);
  const direction = new THREE.Vector3(fallback.x, fallback.z, -fallback.y).normalize();
  const node = root.getObjectByName(NODE.camera);
  if (!node) return { position: undefined, direction, span: DEFAULT_SPAN };
  let camera: THREE.Camera | undefined;
  node.traverse((o) => {
    if (!camera && o instanceof THREE.Camera) camera = o;
  });
  const source = camera ?? node;
  source.updateWorldMatrix(true, false);
  const dir = source.getWorldDirection(new THREE.Vector3());
  // Object3D.getWorldDirection is +Z; a camera's is −Z.
  if (!(source instanceof THREE.Camera)) dir.negate();
  if (dir.lengthSq() > 0.5) direction.copy(dir.normalize());
  let span = DEFAULT_SPAN;
  if (source instanceof THREE.OrthographicCamera) {
    const s = Math.max(source.right - source.left, source.top - source.bottom);
    if (s > 0.5 && s < 50) span = s;
  }
  return { position: source.getWorldPosition(new THREE.Vector3()), direction, span };
}

/**
 * Set up the camera.
 *
 * @param root - The loaded room (for `CAM_Iso`).
 * @param canvas - Where drags are read.
 * @param limits - The export's orbit envelope.
 * @param reducedMotion - No sway; every move cuts.
 * @param onChange - Called whenever the camera moves.
 * @returns The rig.
 */
export function createCameraRig(
  root: THREE.Object3D,
  canvas: HTMLCanvasElement,
  limits: CameraLimits,
  reducedMotion: boolean,
  onChange: () => void,
): CameraRig {
  const iso = readIsoCamera(root);
  // Aim at the point on the camera's line of sight nearest the room's centre.
  const homeTarget = iso.position
    ? iso.position
        .clone()
        .addScaledVector(
          iso.direction,
          DEFAULT_LOOK_AT.clone().sub(iso.position).dot(iso.direction),
        )
    : DEFAULT_LOOK_AT.clone();
  const homeSpherical = new THREE.Spherical().setFromVector3(iso.direction.clone().negate());
  const homeOrbit: Orbit = { theta: homeSpherical.theta, phi: homeSpherical.phi };
  const home: View = { target: homeTarget, zoom: HOME_ZOOM, orbit: homeOrbit };
  const range = orbitRange(homeOrbit, limits, POLAR_SLACK);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.45;
  controls.minAzimuthAngle = range.minTheta;
  controls.maxAzimuthAngle = range.maxTheta;
  controls.minPolarAngle = range.minPhi;
  controls.maxPolarAngle = range.maxPhi;
  // Vertical swipes scroll the page on touch screens; horizontal drags orbit.
  canvas.style.touchAction = 'pan-y';

  let elapsed = 0;
  let lastTouch = -Infinity;
  let dragging = false;
  let tween: { from: View; to: View; t: number; seconds?: number } | undefined;
  /** The zoom of the view the camera last moved to; manual zoom stays at or above it. */
  let baseZoom = home.zoom;
  let sway: { center: number; start: number } | undefined;
  const span = iso.span;

  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  const current = (): View => {
    spherical.setFromVector3(offset.copy(camera.position).sub(controls.target));
    return {
      target: controls.target.clone(),
      zoom: camera.zoom,
      orbit: { theta: spherical.theta, phi: spherical.phi },
    };
  };

  const apply = (view: View): void => {
    const orbit = clampOrbit(view.orbit, range);
    controls.target.copy(view.target);
    camera.position
      .copy(view.target)
      .add(offset.setFromSphericalCoords(RADIUS, orbit.phi, orbit.theta));
    camera.lookAt(view.target);
    if (camera.zoom !== view.zoom) {
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
    }
    onChange();
  };

  const touch = (): void => {
    lastTouch = elapsed;
    sway = undefined;
  };
  const onStart = (): void => {
    dragging = true;
    touch();
  };
  const onEnd = (): void => {
    dragging = false;
    touch();
  };
  // Manual zoom: ⌘/Ctrl-scroll (also how browsers report a trackpad pinch) and two-finger
  // touch pinch. A plain scroll is left to the page.
  const zoomNow = (factor: number): void => {
    if (tween) return;
    touch();
    const view = current();
    const zoom = nudgeZoom(view.zoom, baseZoom, factor);
    if (zoom !== view.zoom) apply({ ...view, zoom });
  };
  const onWheel = (e: WheelEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const px = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
    zoomNow(wheelFactor(px));
  };
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: number | undefined;
  const spread = (): number | undefined => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : undefined;
  };
  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = touches.size === 2 ? spread() : undefined;
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = spread();
    if (pinch !== undefined && d !== undefined && pinch > 0) {
      zoomNow(d / pinch);
      pinch = d;
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    pinch = undefined;
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', onChange);

  apply(home);
  controls.update();

  return {
    camera,
    range,
    home,
    resize(width, height) {
      const aspect = width / Math.max(1, height);
      const halfH = aspect >= 1 ? span / 2 : span / 2 / aspect;
      const halfW = aspect >= 1 ? (span / 2) * aspect : span / 2;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      onChange();
    },
    visibleHeight() {
      return (camera.top - camera.bottom) / camera.zoom;
    },
    current,
    moveTo(view, motion) {
      sway = undefined;
      baseZoom = view.zoom;
      if (motion === 'cut' || reducedMotion) {
        tween = undefined;
        controls.enabled = true;
        apply(view);
        controls.update();
        return;
      }
      tween = { from: current(), to: view, t: 0 };
      controls.enabled = false;
    },
    closeUp(extentOf, center, free, spec) {
      const orbit = closeUpOrbit(current().orbit, homeOrbit, CLOSE_UP_KEEP, range);
      const eye = new THREE.Vector3().setFromSphericalCoords(1, orbit.phi, orbit.theta);
      const basis = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP);
      const right = new THREE.Vector3().setFromMatrixColumn(basis, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(basis, 1);
      const extent = extentOf(right, up);
      if (!extent) return undefined;
      const view = { width: camera.right - camera.left, height: camera.top - camera.bottom };
      const framing = frame(extent, view, free, spec);
      // Keep the object's depth, so later orbiting circles the object.
      const target = center
        .clone()
        .addScaledVector(right, framing.x - center.dot(right))
        .addScaledVector(up, framing.y - center.dot(up));
      return { target, zoom: framing.zoom, orbit };
    },
    zoomBy(factor, motion) {
      const view = current();
      const zoom = nudgeZoom(tween ? tween.to.zoom : view.zoom, baseZoom, factor);
      touch();
      if (motion === 'cut' || reducedMotion) {
        tween = undefined;
        controls.enabled = true;
        apply({ ...view, zoom });
        controls.update();
        return;
      }
      tween = { from: view, to: { ...view, zoom }, t: 0, seconds: ZOOM_SECONDS };
      controls.enabled = false;
    },
    zoomProgress() {
      return zoomRangeProgress(tween ? tween.to.zoom : camera.zoom, baseZoom);
    },
    touch,
    update(dt, idle) {
      elapsed += dt;
      let moved = false;
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / (tween.seconds ?? GLIDE_SECONDS));
        const k = easeInOutCubic(tween.t);
        const { from, to } = tween;
        apply({
          target: from.target.clone().lerp(to.target, k),
          zoom: THREE.MathUtils.lerp(from.zoom, to.zoom, k),
          orbit: {
            theta: THREE.MathUtils.lerp(from.orbit.theta, to.orbit.theta, k),
            phi: THREE.MathUtils.lerp(from.orbit.phi, to.orbit.phi, k),
          },
        });
        moved = true;
        if (tween.t >= 1) {
          tween = undefined;
          controls.enabled = true;
          controls.update();
          touch();
        }
      } else if (!reducedMotion && idle && !dragging && elapsed - lastTouch > SWAY.idleAfter) {
        const now = current();
        sway ??= { center: swayCenter(now.orbit.theta, SWAY.amplitude, range), start: elapsed };
        const s = elapsed - sway.start;
        const theta = swayAzimuth(sway.center, SWAY.amplitude, SWAY.period, s);
        // Blend from wherever the camera is onto the sway path.
        const blend = Math.min(1, 0.5 + s / 2);
        apply({
          ...now,
          orbit: { ...now.orbit, theta: THREE.MathUtils.lerp(now.orbit.theta, theta, blend) },
        });
        moved = true;
      }
      if (controls.enabled && controls.update()) moved = true;
      return moved;
    },
    angles() {
      const { orbit } = current();
      return {
        azimuthOffsetDeg: (orbit.theta - homeOrbit.theta) / DEG,
        elevationDeg: 90 - orbit.phi / DEG,
      };
    },
    dispose() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onChange);
      controls.dispose();
    },
  };
}
