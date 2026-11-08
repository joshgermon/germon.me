/**
 * The office viewer's engine: loads the room, wires the camera, hotspots, effects and ball
 * together, and runs the frame loop. Rendering pauses while the canvas is off screen or the
 * tab is hidden; under reduced motion it renders only when something changed.
 *
 * Loaded with a dynamic `import()` once the card is in view and the page has settled, so
 * three.js costs nothing on first paint. The model and manifest are fetched at low priority.
 */
import * as THREE from 'three';

import { loadManifest } from '~/adapters/office-manifest';
import type { FreeArea } from '~/domain/office/framing';
import type { HotspotId } from '~/domain/office/hotspot';
import type { Lighting } from '~/domain/office/lighting';
import type { OfficeManifest } from '~/domain/office/manifest';
import { defaultCameraLimits } from '~/domain/office/orbit';
import { ASSETS } from '../assets';
import { globalUniforms } from '../shaders/material-patch';
import { createBall } from './ball';
import { createCameraRig, type Motion } from './camera';
import { createEffects } from './effects';
import { buildHotspots, isCollider } from './hotspots';
import {
  attachHeroLightMaps,
  createRenderer,
  fetchLow,
  loadModel,
  textureSource,
  texturesOf,
  uploadEach,
} from './load';
import { createMaterials } from './materials';
import { closeUps } from './views';

/** How a hotspot was activated on the canvas. */
export type PointerSource = 'pointer' | 'touch';

/** What the engine needs from its host. */
export type EngineOptions = {
  readonly canvas: HTMLCanvasElement;
  /** Sized like the canvas; observed for size and visibility. */
  readonly container: HTMLElement;
  /** The hover label; the engine only sets its transform. */
  readonly label: HTMLElement;
  readonly hotspots: ReadonlyArray<HotspotId>;
  readonly reducedMotion: boolean;
  /** The lighting to open with (loaded before the first frame). */
  readonly lighting: Lighting;
  /** The hotspot under the pointer (or previewed from the list) changed. */
  readonly onHover: (id: HotspotId | null) => void;
  /** A hotspot was clicked or tapped on the canvas. */
  readonly onActivate: (id: HotspotId, source: PointerSource) => void;
  /** Empty space was clicked or tapped. */
  readonly onBackgroundClick: () => void;
  /** The manual zoom moved within its range (0 at the settled view, 1 at the ceiling). */
  readonly onZoom: (progress: number) => void;
};

/** What a shot did. */
export type ShotResult = 'shot' | 'busy' | 'unavailable';

/** Draw calls and memory for the last frame (QA). */
export type RenderStats = {
  /** Frames rendered so far. */
  readonly frames: number;
  readonly calls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  readonly pixelRatio: number;
};

/** A running room. */
export type OfficeEngine = {
  /** Hotspots that exist in the loaded model. */
  readonly available: ReadonlyArray<HotspotId>;
  /** Frame an object in the uncovered part of the view. */
  focus(id: HotspotId, motion: Motion, free: FreeArea): void;
  /** Back to the designed view. */
  unfocus(motion: Motion): void;
  /** Zoom in (factor above 1) or out, within the manual range. */
  zoomBy(factor: number, motion: Motion): void;
  /** Highlight and label an object from the list (hover / focus on its button). */
  preview(id: HotspotId | null): void;
  /** Switch the baked lighting; `cut` switches instantly. */
  setLighting(lighting: Lighting, motion: Motion): void;
  /** Race the sim screens. */
  setSimLive(on: boolean): void;
  /** Throw the ball. */
  shoot(): ShotResult;
  stats(): RenderStats;
  dispose(): void;
};

/** Seconds the lighting takes to change when the lamp is clicked. */
const LIGHTING_SECONDS = 0.45;
/** Seconds a tapped hotspot keeps its label on touch screens. */
const TOUCH_LABEL_SECONDS = 1.6;
/** The objects around the amp light its jewel while focused. */
const MUSIC: ReadonlySet<HotspotId> = new Set(['Amp', 'Tele', 'Acoustic']);

async function manifestOrDefaults(): Promise<OfficeManifest> {
  const res = await loadManifest(ASSETS.manifest, fetchLow);
  if (res._tag === 'ok') return res.value;
  console.warn('[office] manifest unavailable, using the export defaults', res.error);
  return { cameraLimits: defaultCameraLimits, evening: new Map() };
}

/**
 * Load the room and start rendering.
 *
 * @param options - The host's canvas, elements and callbacks.
 * @returns The running room, once its first frame is drawn.
 * @throws When WebGL or the model fails to load (the host falls back to its poster).
 */
export async function createOfficeEngine(options: EngineOptions): Promise<OfficeEngine> {
  const { canvas, container, label, reducedMotion } = options;
  const renderer = createRenderer(canvas);
  const textures = textureSource(renderer);
  let root: THREE.Group;
  let manifest: OfficeManifest;
  try {
    [root, manifest] = await Promise.all([loadModel(ASSETS.glb), manifestOrDefaults()]);
  } catch (cause) {
    renderer.dispose();
    throw cause;
  }
  await attachHeroLightMaps(root, textures);

  const scene = new THREE.Scene();
  scene.add(root);
  root.updateMatrixWorld(true);

  let dirty = true;
  const markDirty = (): void => {
    dirty = true;
  };

  const materials = createMaterials(renderer, manifest, textures, isCollider);
  const effects = createEffects(root, scene, materials, reducedMotion);
  const hotspots = buildHotspots(root, options.hotspots, materials);
  materials.patchRest(root);
  const ball = createBall(root);
  const rig = createCameraRig(root, canvas, manifest.cameraLimits, reducedMotion, markDirty);
  scene.add(rig.camera);

  /* State --------------------------------------------------------------------------------- */
  let active = false;
  let disposed = false;
  let elapsed = 0;
  let lastFrame = -1;
  let lastZoom = 0;
  let width = 1;
  let height = 1;
  let focused: { id: HotspotId; free: FreeArea } | undefined;
  let hovered: HotspotId | null = null;
  let previewed: HotspotId | null = null;
  let touchLabel: { id: HotspotId; until: number } | undefined;
  let simLive = false;
  let evening = options.lighting === 'evening' ? 1 : 0;
  let eveningTarget = evening;
  let eveningSpeed = 1 / LIGHTING_SECONDS;
  if (evening > 0) await materials.loadEvening();

  const frameFocused = (motion: Motion): void => {
    if (!focused) return;
    const { id, free } = focused;
    const spec = closeUps[id];
    const center = hotspots.center(id);
    if (!spec || !center) return;
    const view = rig.closeUp((right, up) => hotspots.extent(id, right, up), center, free, spec);
    if (view) rig.moveTo(view, motion);
  };

  /* Sizing -------------------------------------------------------------------------------- */
  const resize = (): void => {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    rig.resize(width, height);
    if (focused) frameFocused('cut');
    dirty = true;
  };

  /* Pointer ------------------------------------------------------------------------------- */
  const ndc = new THREE.Vector2();
  let pointerDirty = false;
  let pointerInside = false;
  let lastPick = 0;
  let down: { x: number; y: number; t: number; type: string } | undefined;

  const setNdc = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const setHovered = (id: HotspotId | null): void => {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id ? 'pointer' : '';
    options.onHover(id ?? previewed);
    dirty = true;
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    setNdc(e);
    pointerInside = true;
    pointerDirty = true;
  };
  const onPointerLeave = (): void => {
    pointerInside = false;
    setHovered(null);
  };
  const onPointerDown = (e: PointerEvent): void => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
    rig.touch();
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    const touch = down.type === 'touch';
    down = undefined;
    if (moved > 6 || !quick) return;
    setNdc(e);
    const id = hotspots.pick(ndc, rig.camera);
    if (!id) {
      options.onBackgroundClick();
      return;
    }
    if (touch) {
      touchLabel = { id, until: elapsed + TOUCH_LABEL_SECONDS };
      options.onHover(id);
    }
    options.onActivate(id, touch ? 'touch' : 'pointer');
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  /* Label --------------------------------------------------------------------------------- */
  const projected = new THREE.Vector3();
  const labelled = (): HotspotId | null =>
    hovered ?? (touchLabel && elapsed < touchLabel.until ? touchLabel.id : null) ?? previewed;
  const placeLabel = (): void => {
    const id = labelled();
    const anchor = id ? hotspots.labelAnchor(id) : undefined;
    if (!anchor) return;
    projected.copy(anchor).project(rig.camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, calc(-100% - 8px))`;
  };

  /* Frame loop ---------------------------------------------------------------------------- */
  const tick = (forcedDt?: number): void => {
    if (disposed) return;
    const now = performance.now();
    const dt = forcedDt ?? (lastFrame < 0 ? 0 : Math.min((now - lastFrame) / 1000, 0.1));
    lastFrame = now;
    elapsed += dt;
    const animate = !reducedMotion;
    if (animate) globalUniforms.uTime.value += dt;

    if (pointerDirty && pointerInside && elapsed - lastPick > 0.05) {
      pointerDirty = false;
      lastPick = elapsed;
      setHovered(hotspots.pick(ndc, rig.camera));
    }
    if (touchLabel && elapsed >= touchLabel.until) {
      touchLabel = undefined;
      options.onHover(hovered ?? previewed);
    }

    if (rig.update(dt, !focused)) dirty = true;
    const zoom = rig.zoomProgress();
    if (Math.abs(zoom - lastZoom) > 0.001) {
      lastZoom = zoom;
      options.onZoom(zoom);
    }
    if (hotspots.highlight(labelled(), dt, reducedMotion)) dirty = true;

    if (evening !== eveningTarget) {
      const step = eveningSpeed * dt;
      evening =
        Math.abs(eveningTarget - evening) <= step
          ? eveningTarget
          : evening + Math.sign(eveningTarget - evening) * step;
      dirty = true;
    }
    globalUniforms.uEvening.value = evening;
    materials.setEvening(evening);

    const ampOn = focused !== undefined && MUSIC.has(focused.id);
    if (effects.update({ dt, elapsed, evening, simLive, ampOn })) dirty = true;
    if (ball?.update(reducedMotion ? 0 : dt)) dirty = true;
    effects.setPixelsPerMetre((height * renderer.getPixelRatio()) / rig.visibleHeight());
    placeLabel();

    if (animate || dirty) {
      renderer.render(scene, rig.camera);
      dirty = false;
    }
  };

  const setActive = (on: boolean): void => {
    if (disposed || on === active) return;
    active = on;
    lastFrame = -1;
    renderer.setAnimationLoop(on ? () => tick() : null);
  };

  /* Observers ----------------------------------------------------------------------------- */
  let inView = true;
  const sync = (): void => setActive(inView && document.visibilityState === 'visible');
  const io = new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      sync();
    },
    { rootMargin: '100px' },
  );
  io.observe(container);
  document.addEventListener('visibilitychange', sync);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // Upload every texture and compile every program before the first frame, so neither the
  // first frame nor the crossfade stalls the page.
  await uploadEach(renderer, texturesOf(root));
  await renderer.compileAsync(scene, rig.camera).catch(() => undefined);
  tick(0);
  renderer.render(scene, rig.camera);
  sync();

  const engine: OfficeEngine = {
    available: hotspots.available,
    focus(id, motion, free) {
      if (!closeUps[id]) return;
      focused = { id, free };
      frameFocused(motion);
    },
    unfocus(motion) {
      if (!focused) return;
      focused = undefined;
      rig.moveTo(rig.home, motion);
    },
    zoomBy(factor, motion) {
      rig.zoomBy(factor, motion);
      dirty = true;
    },
    preview(id) {
      previewed = id;
      if (!hovered) options.onHover(id);
      if (id === 'Lamp') void materials.loadEvening();
      dirty = true;
    },
    setLighting(lighting, motion) {
      eveningTarget = lighting === 'evening' ? 1 : 0;
      eveningSpeed = motion === 'cut' || reducedMotion ? Infinity : 1 / LIGHTING_SECONDS;
      // Hold the switch until the evening bakes are in, so it never fades to a missing texture.
      if (eveningTarget > 0) {
        const target = eveningTarget;
        eveningTarget = evening;
        void materials.loadEvening().then(() => {
          eveningTarget = target;
          dirty = true;
        });
      }
      dirty = true;
    },
    setSimLive(on) {
      simLive = on;
      dirty = true;
    },
    shoot() {
      if (!ball) return 'unavailable';
      if (reducedMotion) return 'shot';
      if (!ball.shoot()) return 'busy';
      rig.touch();
      return 'shot';
    },
    stats() {
      const { info } = renderer;
      return {
        frames: info.render.frame,
        calls: info.render.calls,
        triangles: info.render.triangles,
        programs: info.programs?.length ?? 0,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        pixelRatio: renderer.getPixelRatio(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      rig.dispose();
      effects.dispose();
      disposeScene(scene);
      materials.dispose();
      renderer.dispose();
      globalUniforms.uEvening.value = 0;
    },
  };

  if (import.meta.env.DEV) {
    // Dev-only QA handle: `__office.stats()`, `.angles()`, `.capturePoster()`.
    Reflect.set(window, '__office', {
      engine,
      stats: () => engine.stats(),
      angles: () => rig.angles(),
      range: rig.range,
      tick: (seconds = 1) => {
        for (let i = 0; i < Math.round(seconds * 60); i++) tick(1 / 60);
      },
      /** Where an object's centre is on screen (client pixels), for clicking it in QA. */
      screenPoint: (id: HotspotId) => {
        const c = hotspots.center(id);
        if (!c) return undefined;
        const p = c.clone().project(rig.camera);
        const rect = canvas.getBoundingClientRect();
        return {
          x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
        };
      },
      state: () => ({ focused: focused?.id, hovered, previewed, evening, eveningTarget, active }),
      /**
       * A wide still of the home view in daylight, on transparent black (the poster). Wide, so
       * `object-cover` shows exactly what the canvas shows on any card up to 12:5 — the rig fits
       * the room to the canvas height whenever it is landscape.
       */
      capturePoster: (posterWidth = 2400, posterHeight = 1000, quality = 0.9): string => {
        const saved = { view: rig.current(), evening, dpr: renderer.getPixelRatio() };
        rig.moveTo(rig.home, 'cut');
        globalUniforms.uEvening.value = 0;
        materials.setEvening(0);
        effects.update({ dt: 0, elapsed, evening: 0, simLive: false, ampOn: false });
        renderer.setPixelRatio(1);
        renderer.setSize(posterWidth, posterHeight, false);
        rig.resize(posterWidth, posterHeight);
        effects.setPixelsPerMetre(posterHeight / rig.visibleHeight());
        renderer.render(scene, rig.camera);
        const url = canvas.toDataURL('image/webp', quality);
        renderer.setPixelRatio(saved.dpr);
        resize();
        rig.moveTo(saved.view, 'cut');
        evening = saved.evening;
        return url;
      },
    });
  }

  return engine;
}

/** Free every geometry, material and texture in the scene. */
function disposeScene(scene: THREE.Scene): void {
  const textures = new Set<THREE.Texture>();
  const collect = (value: unknown): void => {
    if (value instanceof THREE.Texture) textures.add(value);
  };
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return;
    o.geometry.dispose();
    const list: ReadonlyArray<unknown> = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!(m instanceof THREE.Material)) continue;
      Object.values(m).forEach(collect);
      if (m instanceof THREE.ShaderMaterial) {
        for (const u of Object.values(m.uniforms)) collect(u.value);
      }
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
}
