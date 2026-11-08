/**
 * The room's hotspots at runtime: each `HS_<id>` group's bounds, its colliders (`HIT_<id>`, or
 * the visible meshes when it has none), a vertex sample for framing, and its own patched
 * materials for the hover highlight. Picking raycasts the colliders only.
 */
import * as THREE from 'three';

import type { Extent } from '~/domain/office/framing';
import type { HotspotId } from '~/domain/office/hotspot';
import { NODE } from '../assets';
import type { PatchedUniforms } from '../shaders/material-patch';
import type { RoomMaterials } from './materials';
import { corners, hide, materialsOf, samplePoints } from './scene-graph';

/** One hotspot in the loaded room. */
type HotspotRuntime = {
  readonly colliders: ReadonlyArray<THREE.Object3D>;
  readonly center: THREE.Vector3;
  readonly labelAnchor: THREE.Vector3;
  readonly uniforms: ReadonlyArray<PatchedUniforms>;
  /** World-space samples of the visible meshes, for tight screen-space framing. */
  readonly points: ReadonlyArray<THREE.Vector3>;
  highlight: number;
};

/** The room's hotspots. */
export type Hotspots = {
  /** Hotspots whose group exists in the model, in the order asked for. */
  readonly available: ReadonlyArray<HotspotId>;
  /** The hotspot under a pointer (normalised device coordinates), if any. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): HotspotId | null;
  /** Ease every hotspot's highlight toward `lit`; returns whether any changed. */
  highlight(lit: HotspotId | null, dt: number, instant: boolean): boolean;
  /** A hotspot's bounding-box centre, in world space. */
  center(id: HotspotId): THREE.Vector3 | undefined;
  /** Where a hotspot's label sits, in world space. */
  labelAnchor(id: HotspotId): THREE.Vector3 | undefined;
  /** A hotspot's extent projected onto a camera's right/up axes. */
  extent(id: HotspotId, right: THREE.Vector3, up: THREE.Vector3): Extent | undefined;
};

/**
 * Whether an object is an invisible collider (named `HIT_*`, or wearing the `HIT` material).
 *
 * @param o - Any object.
 * @returns `true` for colliders.
 */
export function isCollider(o: THREE.Object3D): boolean {
  if (o.name.startsWith(NODE.hitPrefix)) return true;
  return o instanceof THREE.Mesh && materialsOf(o).some((m) => m.name === NODE.hitMaterial);
}

/** Vertex samples per hotspot: plenty for framing, cheap to project. */
const POINT_BUDGET = 4000;

/**
 * Find the hotspots in a loaded room. Call after the screens have their own shader (screen
 * meshes inside a hotspot keep it) and before the rest of the room is patched.
 *
 * @param root - The room.
 * @param ids - The hotspots to look for.
 * @param materials - For each hotspot's own highlight materials.
 * @returns The hotspots found.
 */
export function buildHotspots(
  root: THREE.Object3D,
  ids: ReadonlyArray<HotspotId>,
  materials: RoomMaterials,
): Hotspots {
  root.traverse((o) => {
    if (isCollider(o)) hide(o);
  });

  const runtimes = new Map<HotspotId, HotspotRuntime>();
  const owner = new Map<THREE.Object3D, HotspotId>();
  for (const id of ids) {
    const group = root.getObjectByName(NODE.hotspotPrefix + id);
    if (!group) continue;
    const box = new THREE.Box3();
    const uniforms: PatchedUniforms[] = [];
    const visible: THREE.Mesh[] = [];
    const inner: THREE.Object3D[] = [];
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (isCollider(o)) {
        inner.push(o);
        return;
      }
      if (!o.visible) return;
      visible.push(o);
      box.expandByObject(o);
      if (o.material instanceof THREE.ShaderMaterial) return;
      for (const u of materials.own(o, {}, id)) if (!uniforms.includes(u)) uniforms.push(u);
    });
    const hit = root.getObjectByName(NODE.hitPrefix + id);
    const colliders: ReadonlyArray<THREE.Object3D> = hit
      ? [hit]
      : inner.length > 0
        ? inner
        : visible;
    if (box.isEmpty()) {
      if (!hit) continue;
      box.setFromObject(hit, true);
    }
    const center = box.getCenter(new THREE.Vector3());
    const sampled = samplePoints(visible, POINT_BUDGET);
    runtimes.set(id, {
      colliders,
      center,
      labelAnchor: new THREE.Vector3(center.x, box.max.y, center.z),
      uniforms,
      points: sampled.length > 0 ? sampled : corners(box),
      highlight: 0,
    });
    for (const c of colliders) c.traverse((o) => owner.set(o, id));
  }

  const colliders = [...runtimes.values()].flatMap((r) => r.colliders);
  const raycaster = new THREE.Raycaster();

  return {
    available: [...runtimes.keys()],
    pick(ndc, camera) {
      if (colliders.length === 0) return null;
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObjects(colliders, true)) {
        const id = owner.get(hit.object);
        if (id) return id;
      }
      return null;
    },
    highlight(lit, dt, instant) {
      let changed = false;
      for (const [id, r] of runtimes) {
        const target = id === lit ? 1 : 0;
        if (Math.abs(r.highlight - target) < 0.001) continue;
        r.highlight = instant
          ? target
          : THREE.MathUtils.lerp(r.highlight, target, 1 - Math.exp(-14 * dt));
        for (const u of r.uniforms) u.uHighlight.value = r.highlight;
        changed = true;
      }
      return changed;
    },
    center(id) {
      return runtimes.get(id)?.center;
    },
    labelAnchor(id) {
      return runtimes.get(id)?.labelAnchor;
    },
    extent(id, right, up) {
      const r = runtimes.get(id);
      if (!r) return undefined;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of r.points) {
        const x = p.dot(right);
        const y = p.dot(up);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { minX, maxX, minY, maxY };
    },
  };
}
