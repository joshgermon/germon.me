/**
 * Loading the room: the renderer, the meshopt-compressed GLB, and the textures that live
 * beside it (the PBR heroes' light maps, the evening bakes). The GLB uses meshopt geometry and
 * WebP textures only, so no Draco or KTX2 decoders are shipped.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { materialsOf, readNumber, readString } from './scene-graph';

/**
 * A WebGL2 renderer for the room: transparent (the card's surface shows through), capped at
 * 2× device pixels.
 *
 * @param canvas - The canvas to draw into.
 * @returns The renderer.
 */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Baked/unlit materials opt out of tone mapping; only the PBR heroes are tone mapped. Khronos
  // PBR Neutral keeps their hue and saturation next to the baked room (AgX washed them out).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  return renderer;
}

/**
 * `fetch` at low priority: the room's files never compete with anything else the page (or the
 * visitor) asks for while they stream in.
 */
export const fetchLow: typeof fetch = (input, init) => fetch(input, { ...init, priority: 'low' });

/**
 * Load the GLB, at low priority.
 *
 * @param url - Where `office.glb` is served.
 * @returns The scene root.
 */
export async function loadModel(url: string): Promise<THREE.Group> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setPriority('low');
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

/** Loads a texture by URL, once per URL; resolves `null` if it fails. */
export type TextureSource = (url: string) => Promise<THREE.Texture | null>;

/**
 * Fetch an image and decode it off the main thread into a texture. An `<img>` (what
 * `TextureLoader` gives) is decoded on the main thread when it's first uploaded, so, like
 * `GLTFLoader`, decode to an `ImageBitmap` where the browser can. The bakes are opaque and
 * authored for glTF's UV convention, so neither flipping nor premultiplying applies either way.
 */
async function loadTexture(url: string): Promise<THREE.Texture> {
  if (typeof createImageBitmap !== 'function') {
    return new THREE.TextureLoader().setPriority('low').loadAsync(url);
  }
  const bitmap = await new THREE.ImageBitmapLoader()
    .setPriority('low')
    .setOptions({ imageOrientation: 'from-image', premultiplyAlpha: 'none' })
    .loadAsync(url);
  const texture = new THREE.Texture(bitmap);
  texture.needsUpdate = true;
  return texture;
}

/**
 * A caching texture loader for the room's side textures (light maps and bakes are authored
 * for glTF's UV convention, so `flipY` is off). Fetched at low priority and decoded off the
 * main thread.
 *
 * @param renderer - For the anisotropy limit.
 * @returns The loader.
 */
export function textureSource(renderer: THREE.WebGLRenderer): TextureSource {
  const cache = new Map<string, Promise<THREE.Texture | null>>();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return (url) => {
    const cached = cache.get(url);
    if (cached) return cached;
    const pending = loadTexture(url).then(
      (texture) => {
        texture.flipY = false;
        texture.anisotropy = anisotropy;
        return texture;
      },
      () => null,
    );
    cache.set(url, pending);
    return pending;
  };
}

/**
 * Upload textures to the GPU one per task. Uploading is synchronous; left to the next
 * `render`, a batch of 2048² maps lands in one long task that blocks the whole page.
 *
 * @param renderer - The room's renderer.
 * @param textures - What to upload; render targets (already on the GPU) are skipped.
 */
export async function uploadEach(
  renderer: THREE.WebGLRenderer,
  textures: Iterable<THREE.Texture>,
): Promise<void> {
  for (const texture of new Set(textures)) {
    if (texture.isRenderTargetTexture) continue;
    renderer.initTexture(texture);
    // Let the browser run whatever is waiting (input, other tasks) before the next one.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Every texture the scene's materials use, for `uploadEach` before the first frame.
 *
 * @param root - The loaded scene.
 * @returns The textures.
 */
export function texturesOf(root: THREE.Object3D): ReadonlyArray<THREE.Texture> {
  const textures: THREE.Texture[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of materialsOf(o)) {
      for (const value of Object.values(m))
        if (value instanceof THREE.Texture) textures.push(value);
    }
  });
  return textures;
}

/**
 * Attach the PBR heroes' day light maps. Heroes (`M_Hero_*`) carry their baked lighting as a
 * URL in their material extras (`bakeType: lightmap`, `bakeDay`, `lightMapIntensity`,
 * `lightMapUV`, `lightMapColorSpace`); it must be attached before the materials are patched,
 * since the patch keys off `material.lightMap`.
 *
 * @param root - The loaded scene.
 * @param load - The texture loader.
 */
export async function attachHeroLightMaps(
  root: THREE.Object3D,
  load: TextureSource,
): Promise<void> {
  const heroes = new Map<string, Set<THREE.MeshStandardMaterial>>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of materialsOf(o)) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const url = readString(m.userData, 'bakeDay');
      if (readString(m.userData, 'bakeType') !== 'lightmap' || !url) continue;
      heroes.set(url, (heroes.get(url) ?? new Set()).add(m));
    }
  });
  await Promise.all(
    [...heroes].map(async ([url, materials]) => {
      const texture = await load(url);
      if (!texture) return;
      for (const m of materials) {
        texture.colorSpace =
          readString(m.userData, 'lightMapColorSpace') === 'linear'
            ? THREE.LinearSRGBColorSpace
            : THREE.SRGBColorSpace;
        texture.channel = readNumber(m.userData, 'lightMapUV') ?? 0;
        m.lightMap = texture;
        m.lightMapIntensity = readNumber(m.userData, 'lightMapIntensity') ?? Math.PI;
        m.userData['bakeTarget'] = 'lightMap';
        m.needsUpdate = true;
      }
    }),
  );
}
