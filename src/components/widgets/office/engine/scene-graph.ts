/**
 * Small typed helpers for walking a loaded glTF scene without casts: three's scene graph is
 * loosely typed (`Object3D`, `Material | Material[]`, `userData: any`), so every read goes
 * through an `instanceof` or `typeof` check here.
 */
import * as THREE from 'three';

/**
 * A mesh's materials as a list, whether it has one or several.
 *
 * @param mesh - Any mesh.
 * @returns Its materials.
 */
export function materialsOf(mesh: THREE.Mesh): ReadonlyArray<THREE.Material> {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/**
 * Every mesh under (and including) `root`.
 *
 * @param root - A subtree, or nothing.
 * @returns The meshes, in traversal order.
 */
export function meshesOf(root: THREE.Object3D | undefined): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root?.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

/**
 * Hide a subtree (colliders, helper volumes).
 *
 * @param root - The subtree.
 */
export function hide(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.visible = false;
  });
}

/**
 * A finite number from glTF extras.
 *
 * @param data - An object's or material's `userData`.
 * @param key - The extras key.
 * @returns The number, if present and finite.
 */
export function readNumber(
  data: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A non-empty string from glTF extras.
 *
 * @param data - An object's or material's `userData`.
 * @param key - The extras key.
 * @returns The string, if present and non-empty.
 */
export function readString(
  data: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * World-space samples of a set of meshes' vertices (about `budget` of them), for tight
 * screen-space framing.
 *
 * @param meshes - The meshes to sample.
 * @param budget - Roughly how many points to return.
 * @returns The sampled points.
 */
export function samplePoints(meshes: ReadonlyArray<THREE.Mesh>, budget: number): THREE.Vector3[] {
  const total = meshes.reduce((n, m) => n + (m.geometry.getAttribute('position')?.count ?? 0), 0);
  const stride = Math.max(1, Math.floor(total / budget));
  const points: THREE.Vector3[] = [];
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < position.count; i += stride) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
      );
    }
  }
  return points;
}

/**
 * The eight corners of a box.
 *
 * @param box - Any non-empty box.
 * @returns Its corners.
 */
export function corners(box: THREE.Box3): THREE.Vector3[] {
  return Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ),
  );
}
