import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { Sim } from "../../../lib/harbir/sim";
import type { ActorId, PropId } from "../../../lib/world";

export type GripPoint = readonly [number, number, number];

/** Palm/wing tip relative to the actual right-arm pivot, before model scaling. */
export const PALM: Record<ActorId, GripPoint> = {
  hero: [0, -0.39, 0.02],
  friend: [0, -0.36, 0],
  puppy: [0, -0.27, 0.02],
  grownup: [0, -0.48, 0],
  kitten: [0, -0.28, 0.03],
  duck: [0, -0.21, 0.02],
};

/** Contact point on each model. Round/flat objects rest against the front of the palm. */
export const PROP_GRIP: Record<PropId, GripPoint> = {
  ball: [0, 0.22, -0.22],
  apple: [0, 0.16, -0.15],
  book: [0, 0.06, -0.15],
  cookies: [0, 0.03, -0.24],
  flower: [0, 0.12, 0],
  balloon: [0, 0.05, 0],
  umbrella: [0, 0, 0],
  kite: [0, 0.05, 0],
  watering_can: [0, 0.17, -0.16],
};

interface Grip { palm: Object3D; body: Object3D }
// Rendering data lives outside the pure simulation. A new/replayed sim has its own grips.
const grips = new WeakMap<Sim, Partial<Record<ActorId, Grip>>>();

export function registerGrip(sim: Sim, id: ActorId, palm: Object3D, body: Object3D) {
  let cast = grips.get(sim);
  if (!cast) { cast = {}; grips.set(sim, cast); }
  const current = cast[id];
  if (!current || current.palm !== palm || current.body !== body) cast[id] = { palm, body };
}

export function removeGrip(sim: Sim, id: ActorId, palm: Object3D) {
  const cast = grips.get(sim);
  if (cast?.[id]?.palm === palm) delete cast[id];
}

export function getGrip(sim: Sim, id: ActorId) { return grips.get(sim)?.[id]; }

/** Lift the real paw when a small/seated character would otherwise drag its prop. */
export function clearGripFloor(palm: Object3D, arm: Object3D, prop: PropId, point: Vector3) {
  const bottom = prop === "kite" ? -0.25 : 0;
  const minimum = PROP_GRIP[prop][1] - bottom + 0.025;
  // Changing the shoulder keeps palm contact intact; clamping only the prop would detach it.
  for (let attempt = 0; attempt < 24; attempt++) {
    palm.updateWorldMatrix(true, false);
    palm.getWorldPosition(point);
    if (point.y >= minimum || arm.rotation.x <= -2.65) break;
    arm.rotation.x = Math.max(-2.65, arm.rotation.x - 0.08);
  }
}

/** Reusable scratch values keep the animation loop allocation-free. */
export function createGripTransform() {
  return { position: new Vector3(), rotation: new Quaternion(), contact: new Vector3() };
}

/** Keep the grip point on the palm, with a stable world size and upright balloon/string. */
export function gripTransform(grip: Grip, prop: PropId, target: ReturnType<typeof createGripTransform>) {
  grip.palm.updateWorldMatrix(true, false);
  grip.body.getWorldQuaternion(target.rotation);
  grip.palm.getWorldPosition(target.position);
  target.contact.fromArray(PROP_GRIP[prop]).applyQuaternion(target.rotation);
  target.position.sub(target.contact);
  return target;
}
