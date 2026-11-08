/**
 * The room's small life: the desk and sim screens, sunlight shafts and dust, the blinking
 * cursor, the amp's jewel and lamp shade glows, and the plants swaying in the breeze. Under
 * reduced motion nothing moves: no dust, no wind, no shimmer, a steady cursor.
 */
import * as THREE from 'three';

import { NODE } from '../assets';
import { createDust, type DustHandle } from '../shaders/dust';
import { applyGodRays, type GodRayHandle } from '../shaders/god-rays';
import type { PatchedUniforms } from '../shaders/material-patch';
import { applyScreenMaterial, type ScreenHandle } from '../shaders/screen';
import type { RoomMaterials } from './materials';
import { hide, meshesOf, readNumber } from './scene-graph';

/** What the effects read each frame. */
export type EffectsFrame = {
  readonly dt: number;
  readonly elapsed: number;
  /** 0 = day, 1 = evening. */
  readonly evening: number;
  /** Whether the sim screens should race. */
  readonly simLive: boolean;
  /** Whether the amp's jewel should glow. */
  readonly ampOn: boolean;
};

/** The room's effects. */
export type Effects = {
  /** Advance one frame; returns whether anything visible changed. */
  update(frame: EffectsFrame): boolean;
  /** Keep dust motes the same physical size at any zoom: device pixels per world metre. */
  setPixelsPerMetre(px: number): void;
  dispose(): void;
};

/** The screens: side sims streak most when racing, the centre a little, the desk never. */
const SCREENS = [
  { name: NODE.screens.nvim, streak: 0, sim: false },
  { name: NODE.screens.term, streak: 0, sim: false },
  { name: NODE.screens.simL, streak: 1, sim: true },
  { name: NODE.screens.simC, streak: 0.35, sim: true },
  { name: NODE.screens.simR, streak: 1, sim: true },
] as const;

const damp = (current: number, target: number, lambda: number, dt: number): number =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

/**
 * Wire up the effects in a loaded room.
 *
 * @param root - The room.
 * @param scene - Where the dust is added.
 * @param materials - For the glow and wind materials.
 * @param reducedMotion - Freeze everything.
 * @returns The effects.
 */
export function createEffects(
  root: THREE.Object3D,
  scene: THREE.Scene,
  materials: RoomMaterials,
  reducedMotion: boolean,
): Effects {
  const find = (name: string): THREE.Object3D | undefined => root.getObjectByName(name);

  /* Screens ------------------------------------------------------------------------------- */
  const sims: ScreenHandle[] = [];
  for (const { name, streak, sim } of SCREENS) {
    for (const mesh of meshesOf(find(name))) {
      const screen = applyScreenMaterial(mesh, streak);
      materials.skip(mesh);
      if (screen && sim) sims.push(screen);
    }
  }

  /* Light shafts and dust ----------------------------------------------------------------- */
  const shafts: GodRayHandle[] = [];
  for (const name of NODE.shafts) {
    for (const mesh of meshesOf(find(name))) {
      shafts.push(applyGodRays(mesh));
      materials.skip(mesh);
    }
  }
  let dust: DustHandle | undefined;
  const volume = find(NODE.dustVolume);
  if (volume) hide(volume);
  if (!reducedMotion) {
    const box = new THREE.Box3();
    if (volume) box.setFromObject(volume);
    else {
      for (const name of NODE.shafts) {
        const shaft = find(name);
        if (shaft) box.union(new THREE.Box3().setFromObject(shaft));
      }
    }
    if (!box.isEmpty()) {
      dust = createDust(box);
      scene.add(dust.points);
    }
  }

  /* Glows --------------------------------------------------------------------------------- */
  const glow = (name: string, color: THREE.Color): PatchedUniforms[] =>
    meshesOf(find(name)).flatMap((mesh) =>
      materials.own(mesh).map((u) => {
        u.uGlowColor.value.copy(color);
        return u;
      }),
    );
  const jewel = glow(NODE.ampJewel, new THREE.Color(1.0, 0.08, 0.04));
  const shade = glow(NODE.lampShade, new THREE.Color(1.0, 0.68, 0.36));
  const cursor = find(NODE.cursor);

  /* Wind ---------------------------------------------------------------------------------- */
  let seed = 0;
  root.traverse((o) => {
    if (!o.name.startsWith(NODE.windPrefix)) return;
    // A plant nested in another plant is handled with its ancestor.
    if (o.parent?.name.startsWith(NODE.windPrefix)) return;
    const box = new THREE.Box3().setFromObject(o);
    const extras = { ...o.children[0]?.userData, ...o.userData };
    const baseY = readNumber(extras, 'baseY') ?? box.min.y;
    const height = readNumber(extras, 'height') ?? Math.max(0.1, box.max.y - baseY);
    const wind = { baseY, height, seed: (seed++ * 0.618) % 1 };
    for (const mesh of meshesOf(o)) materials.own(mesh, reducedMotion ? {} : { wind });
  });

  let simLive = 0;

  return {
    update({ dt, elapsed, evening, simLive: live, ampOn }) {
      let changed = false;
      for (const s of shafts) s.intensity.value = s.baseIntensity * (1 - 0.88 * evening);
      if (dust) dust.intensity.value = dust.baseIntensity * (1 - 0.8 * evening);
      for (const u of shade) u.uGlow.value = 0.04 + 0.85 * evening;

      const glowNow = ampOn ? (reducedMotion ? 0.6 : 0.45 + 0.4 * Math.sin(elapsed * 3.2)) : 0;
      for (const u of jewel) {
        if (u.uGlow.value !== glowNow) changed = true;
        u.uGlow.value = glowNow;
      }

      const target = live && !reducedMotion ? 1 : 0;
      if (Math.abs(simLive - target) > 0.001) {
        simLive = damp(simLive, target, 4, dt);
        changed = true;
      } else simLive = target;
      for (const s of sims) s.live.value = simLive;

      if (cursor) {
        const on = reducedMotion || Math.floor(elapsed / 0.5) % 2 === 0;
        if (cursor.visible !== on) {
          cursor.visible = on;
          changed = true;
        }
      }
      return changed;
    },
    setPixelsPerMetre(px) {
      dust?.setScale(px);
    },
    dispose() {
      dust?.dispose();
    },
  };
}
