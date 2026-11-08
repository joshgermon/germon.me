/**
 * The room's materials: unlit baked surfaces skip tone mapping, PBR heroes get an environment
 * map for reflections, and every material is patched (shaders/material-patch) for the evening
 * crossfade, hover highlight and wind. Meshes that animate on their own (hotspots, plants, FX)
 * get their own patched clones; everything else shares one patched material.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { OfficeManifest } from '~/domain/office/manifest';
import {
  bakeTexture,
  detectBakeTarget,
  patchMaterial,
  setEveningTexture,
  type BakeTarget,
  type PatchOptions,
  type PatchedUniforms,
} from '../shaders/material-patch';
import { uploadEach, type TextureSource } from './load';
import { materialsOf, readNumber, readString } from './scene-graph';

/** The room's material bookkeeping. */
export type RoomMaterials = {
  /**
   * Give `mesh` its own patched material(s), so its uniforms animate independently. Meshes in
   * the same `scope` (one hotspot) share clones of a shared source material.
   */
  own(
    mesh: THREE.Mesh,
    options?: Omit<PatchOptions, 'bake'>,
    scope?: string,
  ): ReadonlyArray<PatchedUniforms>;
  /** Leave a mesh alone (it has its own shader: screens, light shafts). */
  skip(mesh: THREE.Mesh): void;
  /** Patch every material not owned or skipped, in place. */
  patchRest(root: THREE.Object3D): void;
  /** Dim the heroes' reflections as the room goes to evening (0 = day, 1 = evening). */
  setEvening(value: number): void;
  /** Load every evening bake (once); resolves when all have loaded or failed. */
  loadEvening(): Promise<void>;
  dispose(): void;
};

/** Default reflection strength for heroes without `envMapIntensity` in their extras. */
const ENV_INTENSITY = 0.4;
/** How much of their reflections heroes keep in the evening. */
const EVENING_REFLECTION = 0.35;

/**
 * Set up the room's materials.
 *
 * @param renderer - For the environment map.
 * @param manifest - Evening bakes for materials whose extras don't name one.
 * @param load - The texture loader.
 * @param isCollider - Meshes never drawn (and so never patched).
 * @returns The bookkeeping.
 */
export function createMaterials(
  renderer: THREE.WebGLRenderer,
  manifest: OfficeManifest,
  load: TextureSource,
  isCollider: (mesh: THREE.Mesh) => boolean,
): RoomMaterials {
  let envMap: THREE.Texture | undefined;
  const environment = (): THREE.Texture => {
    if (envMap) return envMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envMap = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return envMap;
  };

  const heroes: { material: THREE.MeshStandardMaterial; base: number }[] = [];
  const evening: { material: THREE.Material; url: string; day: THREE.Texture | null }[] = [];

  /** Tone mapping, reflections and evening bookkeeping for one material; returns its bake. */
  const prepare = (material: THREE.Material): BakeTarget => {
    if (material instanceof THREE.MeshBasicMaterial) {
      material.toneMapped = false;
    } else if (material instanceof THREE.MeshStandardMaterial) {
      material.envMap = environment();
      material.envMapIntensity = readNumber(material.userData, 'envMapIntensity') ?? ENV_INTENSITY;
      heroes.push({ material, base: material.envMapIntensity });
    }
    const bake = detectBakeTarget(material);
    const url = readString(material.userData, 'bakeEvening') ?? manifest.evening.get(material.name);
    if (bake && url) evening.push({ material, url, day: bakeTexture(material, bake) });
    return bake;
  };

  const handled = new Set<THREE.Mesh>();
  const owned = new Map<THREE.Mesh, ReadonlyArray<PatchedUniforms>>();
  const clones = new Map<string, { material: THREE.Material; uniforms: PatchedUniforms }>();
  const shared = new Set<THREE.Material>();

  let eveningLoad: Promise<void> | undefined;

  return {
    own(mesh, options = {}, scope) {
      const known = owned.get(mesh);
      if (known) return known;
      handled.add(mesh);
      const uniforms: PatchedUniforms[] = [];
      const next = materialsOf(mesh).map((source) => {
        // Wind clones carry per-plant uniforms, so they are never shared.
        const key = scope && !options.wind ? `${scope}:${source.uuid}` : undefined;
        const cached = key ? clones.get(key) : undefined;
        if (cached) {
          if (!uniforms.includes(cached.uniforms)) uniforms.push(cached.uniforms);
          return cached.material;
        }
        const material = source.clone();
        const patched = patchMaterial(material, { ...options, bake: prepare(material) });
        if (key) clones.set(key, { material, uniforms: patched });
        uniforms.push(patched);
        return material;
      });
      const [first] = next;
      if (first) mesh.material = next.length === 1 ? first : next;
      owned.set(mesh, uniforms);
      return uniforms;
    },
    skip(mesh) {
      handled.add(mesh);
    },
    patchRest(root) {
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || handled.has(o) || isCollider(o)) return;
        for (const material of materialsOf(o)) {
          if (material instanceof THREE.ShaderMaterial || shared.has(material)) continue;
          shared.add(material);
          patchMaterial(material, { bake: prepare(material) });
        }
      });
    },
    setEvening(value) {
      for (const h of heroes)
        h.material.envMapIntensity = h.base * (1 - (1 - EVENING_REFLECTION) * value);
    },
    loadEvening() {
      eveningLoad ??= Promise.all(
        evening.map(async ({ material, url, day }) => {
          const texture = await load(url);
          if (!texture) return null;
          texture.colorSpace = day?.colorSpace ?? THREE.SRGBColorSpace;
          if (day) {
            texture.wrapS = day.wrapS;
            texture.wrapT = day.wrapT;
            texture.channel = day.channel;
          }
          texture.needsUpdate = true;
          setEveningTexture(material, texture);
          return texture;
        }),
      )
        // Upload them one per task before the crossfade, not all in its first frame.
        .then((textures) =>
          uploadEach(
            renderer,
            textures.filter((t) => t !== null),
          ),
        );
      return eveningLoad;
    },
    dispose() {
      envMap?.dispose();
    },
  };
}
