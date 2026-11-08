/**
 * The basketball: a shot at the mini hoop (an arc through the net, a drop, a bounce, a roll
 * home) and the net's wobble as it drops through. Plain kinematics, stepped by the frame loop.
 */
import * as THREE from 'three';

import { NODE } from '../assets';

/** The ball and hoop, if the room has them. */
export type Ball = {
  /** Start a shot; `false` if one is already in the air. */
  shoot(): boolean;
  /** Advance one frame; returns whether anything moved. */
  update(dt: number): boolean;
};

type Segment = { readonly end: number; readonly at: (u: number, out: THREE.Vector3) => void };

type Shot = {
  t: number;
  readonly segments: ReadonlyArray<Segment>;
  readonly netAt: number;
  /** When the ball lands on the floor and starts rolling. */
  readonly rollAt: number;
  readonly spinAxis: THREE.Vector3;
  spin: number;
  swished: boolean;
  previous: THREE.Vector3 | undefined;
};

const G = 9.8;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Find the ball and hoop in a loaded room.
 *
 * @param root - The room.
 * @returns The ball, or `undefined` if the room lacks the ball or the hoop target.
 */
export function createBall(root: THREE.Object3D): Ball | undefined {
  const ball = root.getObjectByName(NODE.ball);
  const hoop = root.getObjectByName(NODE.hoopTarget);
  const net = root.getObjectByName(NODE.hoopNet);
  if (!ball || !hoop) return undefined;

  const home = ball.getWorldPosition(new THREE.Vector3());
  const homeQuat = ball.getWorldQuaternion(new THREE.Quaternion());
  const radius = Math.max(
    0.03,
    new THREE.Box3().setFromObject(ball).getSize(new THREE.Vector3()).y / 2,
  );
  const netRest = net
    ? (() => {
        // Scale about the rim (the net's top centre), in the net's local space.
        const b = new THREE.Box3().setFromObject(net);
        const rim = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
        return {
          position: net.position.clone(),
          scale: net.scale.clone(),
          pivot: net.worldToLocal(rim),
        };
      })()
    : undefined;

  let shot: Shot | undefined;
  let wobble = -1;

  const tmp = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const place = (position: THREE.Vector3, quaternion: THREE.Quaternion): void => {
    const parent = ball.parent;
    if (!parent) {
      ball.position.copy(position);
      ball.quaternion.copy(quaternion);
      return;
    }
    parent.updateWorldMatrix(true, false);
    ball.position.copy(parent.worldToLocal(tmp.copy(position)));
    ball.quaternion.copy(parent.getWorldQuaternion(parentQ).invert().multiply(quaternion));
  };

  const plan = (): Shot => {
    const target = hoop.getWorldPosition(new THREE.Vector3());
    const restY = radius;
    const start = home.clone();
    const rim = target.clone().add(new THREE.Vector3(0, radius * 1.1, 0));
    const apexY = Math.max(start.y, rim.y) + 0.55;
    // Quadratic Bézier control point so the arc peaks at about apexY.
    const control = start.clone().lerp(rim, 0.5);
    control.y = 2 * apexY - 0.5 * (start.y + rim.y);
    const below = target.clone().add(new THREE.Vector3(0, -0.32, 0));
    const v0 = 1.6;
    const drop = Math.max(0.01, below.y - restY);
    const tFall = (-v0 + Math.sqrt(v0 * v0 + 2 * G * drop)) / G;
    const vUp = (v0 + G * tFall) * 0.38;
    const tBounce = (2 * vUp) / G;
    // Drift away from the wall while bouncing so the roll starts in the room.
    const away = new THREE.Vector3(start.x - target.x, 0, start.z - target.z);
    const dist = away.length();
    if (dist > 1e-4) away.divideScalar(dist);
    const landing = new THREE.Vector3(below.x, restY, below.z);
    const afterBounce = landing.clone().addScaledVector(away, Math.min(0.25, dist * 0.3));
    const homeOnFloor = new THREE.Vector3(start.x, restY, start.z);
    const tRoll = THREE.MathUtils.clamp(afterBounce.distanceTo(homeOnFloor) * 0.9, 0.5, 1.8);

    let t = 0;
    const segments: Segment[] = [];
    const add = (duration: number, at: Segment['at']): number => {
      t += duration;
      segments.push({ end: t, at });
      return t;
    };
    const netAt = add(1.0, (u, out) => {
      const a = (1 - u) ** 2;
      const b = 2 * u * (1 - u);
      const c = u * u;
      out.set(
        a * start.x + b * control.x + c * rim.x,
        a * start.y + b * control.y + c * rim.y,
        a * start.z + b * control.z + c * rim.z,
      );
    });
    add(0.28, (u, out) => out.copy(rim).lerp(below, u * u));
    add(tFall, (u, out) => {
      const s = u * tFall;
      out.set(below.x, Math.max(restY, below.y - v0 * s - 0.5 * G * s * s), below.z);
    });
    const rollAt = add(tBounce, (u, out) => {
      const s = u * tBounce;
      out.copy(landing).lerp(afterBounce, u);
      out.y = restY + vUp * s - 0.5 * G * s * s;
    });
    add(tRoll, (u, out) => out.copy(afterBounce).lerp(homeOnFloor, easeOutCubic(u)));
    if (start.y > restY + 0.02) {
      add(0.45, (u, out) => {
        out.copy(homeOnFloor).lerp(start, u);
        out.y += Math.sin(u * Math.PI) * 0.15;
      });
    }
    const heading = new THREE.Vector3(rim.x - start.x, 0, rim.z - start.z);
    if (heading.lengthSq() < 1e-6) heading.set(1, 0, 0);
    const spinAxis = new THREE.Vector3()
      .crossVectors(THREE.Object3D.DEFAULT_UP, heading.normalize())
      .normalize();
    return {
      t: 0,
      segments,
      netAt,
      rollAt,
      spinAxis,
      spin: 0,
      swished: false,
      previous: undefined,
    };
  };

  const updateShot = (dt: number): boolean => {
    if (!shot) return false;
    const s = shot;
    s.t += dt;
    const index = s.segments.findIndex((seg) => s.t <= seg.end);
    const segment = s.segments[index];
    if (!segment) {
      place(home, homeQuat);
      shot = undefined;
      return true;
    }
    const begin = s.segments[index - 1]?.end ?? 0;
    const position = new THREE.Vector3();
    segment.at(THREE.MathUtils.clamp((s.t - begin) / (segment.end - begin), 0, 1), position);
    if (!s.swished && s.t >= s.netAt) {
      s.swished = true;
      wobble = 0;
    }
    // Backspin in the air; rolling on the floor (angle = distance / radius).
    if (s.previous) {
      if (s.t > s.rollAt) {
        const step = tmp.copy(position).sub(s.previous).setY(0);
        const length = step.length();
        if (length > 1e-6) {
          s.spinAxis.crossVectors(THREE.Object3D.DEFAULT_UP, step.normalize());
          s.spin += length / radius;
        }
      } else s.spin -= dt * 9;
    }
    s.previous = position.clone();
    place(position, tmpQ.setFromAxisAngle(s.spinAxis, s.spin).multiply(homeQuat));
    return true;
  };

  const updateNet = (dt: number): boolean => {
    if (!net || !netRest || wobble < 0) return false;
    wobble += dt;
    const k = Math.exp(-wobble * 3.2);
    const sy = 1 + 0.22 * Math.sin(wobble * 22) * k;
    const sxz = 1 - 0.07 * Math.sin(wobble * 22 + 0.6) * k;
    net.scale.set(netRest.scale.x * sxz, netRest.scale.y * sy, netRest.scale.z * sxz);
    // Keep the rim fixed while scaling.
    const p = netRest.pivot;
    const delta = new THREE.Vector3(p.x * (1 - sxz), p.y * (1 - sy), p.z * (1 - sxz))
      .multiply(netRest.scale)
      .applyQuaternion(net.quaternion);
    net.position.copy(netRest.position).add(delta);
    if (wobble > 1.6) {
      net.scale.copy(netRest.scale);
      net.position.copy(netRest.position);
      wobble = -1;
    }
    return true;
  };

  return {
    shoot() {
      if (shot) return false;
      shot = plan();
      return true;
    },
    update(dt) {
      const moved = updateShot(dt);
      return updateNet(dt) || moved;
    },
  };
}
