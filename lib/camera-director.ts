import type { SceneLine } from "../app/api/scene/contract";
import type { ActorState, Sim } from "./harbir/sim";
import { gap, OBSTACLES } from "./harbir/obstacles";
import type { ActorId } from "./world";

/** Rendering information only; never written into the physics simulation. */
export type CameraSubject = { heading: number; lift: number };
export type CameraSubjects = Partial<Record<ActorId, CameraSubject>>;
export type CameraFrame = { top: number; bottom: number };
type Point3 = [number, number, number];
export type CameraShot = {
  kind: "wide" | "tracking" | "interaction" | "closeup";
  position: Point3;
  target: Point3;
  fov: number;
  centerY: number;
  speaker?: ActorId;
  heading?: number;
};

// Actual model dimensions, including Alice's ears. Keeping the whole head in
// frame matters more than using the same camera distance for every character.
export const CAMERA_CAST: Record<ActorId, { head: number; top: number; width: number }> = {
  hero: { head: 1.008, top: 1.94, width: 0.9 },
  friend: { head: 0.93, top: 1.5, width: 1.08 },
  puppy: { head: 0.713, top: 1.2, width: 0.9 },
  grownup: { head: 1.0952, top: 1.7, width: 1.1 },
  kitten: { head: 0.85, top: 1.32, width: 0.95 },
  duck: { head: 0.8, top: 1.18, width: 0.85 },
};

export const wrapCameraAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const walking = (actor: ActorState) => actor.pose === "walk" || actor.pose === "run";
const interacting = (actor: ActorState) => ["reach", "hug", "help"].includes(actor.pose);

/** Heights paired with the engine's fixed scenery; water never blocks a lens. */
const obstacleHeight = [3.8, 6, 1.05, 1.4, 1.4, 0, 0, 0, 0.9, 2.5, 2, 1.5];

function obstructionCost(x: number, y: number, z: number, actor: ActorState, head: number, actors: ActorState[]): number {
  let cost = 0;
  // Sample the view ray, not just the lens position. This also avoids putting a
  // conversation partner directly between the speaker's face and the camera.
  for (let step = 1; step <= 12; step++) {
    const t = step / 12;
    const px = actor.x + (x - actor.x) * t;
    const py = head + (y - head) * t;
    const pz = actor.z + (z - actor.z) * t;
    for (let i = 0; i < OBSTACLES.length; i++) {
      if (py < obstacleHeight[i] && gap(OBSTACLES[i], px, pz) < 0.18) cost += 2;
    }
    for (const other of actors) {
      if (other.id !== actor.id && py < CAMERA_CAST[other.id].top && Math.hypot(px - other.x, pz - other.z) < 0.48) cost += 3;
    }
  }
  return cost;
}

export interface CameraInput {
  sim: Sim;
  subjects: CameraSubjects;
  line: SceneLine | null;
  aspect: number;
  elapsed: number;
  shotIndex: number;
  overview: boolean;
  reducedMotion: boolean;
  frame?: CameraFrame;
}

/** One motivated composition per line; its small dolly settles rather than looping. */
export function planCamera(input: CameraInput): CameraShot | null {
  const { sim, subjects, line, elapsed, shotIndex, overview, reducedMotion } = input;
  const actors = Object.values(sim.actors).filter((actor): actor is ActorState => !!actor);
  if (!actors.length) return null;
  const aspect = Number.isFinite(input.aspect) && input.aspect > 0 ? clamp(input.aspect, 0.35, 3) : 1;
  const portrait = aspect < 0.85;
  const top = clamp(input.frame?.top ?? 0.1, 0, 0.3);
  const bottom = clamp(input.frame?.bottom ?? (portrait ? 0.35 : 0.25), 0, 0.65);
  const usable = Math.max(0.22, 1 - top - bottom);
  const centerY = top + usable / 2;
  const fov = portrait ? 44 : 37;
  const tan = Math.tan(fov * Math.PI / 360);
  const fit = (height: number, width: number) => Math.max(height / (2 * tan * usable), width / (2 * tan * aspect * 0.82));
  const move = reducedMotion ? 0 : smooth(elapsed / 7);
  const speaker = line && sim.actors[line.speaker];
  // Playback puts these acrobatics after the speaker's voice. Let the action
  // finish in a wider shot instead of orbiting at the speed of a somersault.
  const acrobatic = speaker && (speaker.pose === "roll" || speaker.pose === "celebrate");
  if (speaker && !overview && !acrobatic) {
    const framing = CAMERA_CAST[speaker.id];
    const subject = subjects[speaker.id];
    const lift = subject?.lift ?? 0;
    const facing = speaker.facing && sim.actors[speaker.facing];
    const heading = subject?.heading ?? (facing ? Math.atan2(facing.x - speaker.x, facing.z - speaker.z) : speaker.heading);
    const other = line.to && sim.actors[line.to];
    const interaction = interacting(speaker) || !!(other && interacting(other));
    const moving = walking(speaker);
    const kind = interaction ? "interaction" : moving ? "tracking" : "closeup";
    const low = kind === "closeup" ? Math.max(0.15, framing.head - 0.52) : 0;
    const high = framing.top + lift + 0.12;
    const target: Point3 = [speaker.x, (low + lift + high) / 2, speaker.z];
    const pairSpan = interaction && other ? Math.min(3, Math.hypot(other.x - speaker.x, other.z - speaker.z)) : 0;
    const distance = Math.max(2, fit(high - low - lift, framing.width + pairSpan * 1.35)) * (1.12 - move * 0.055);
    const cameraY = target[1] + 0.12;
    // Stay close to frontal. A small side offset keeps the nose from hiding an
    // eye, and the tested alternatives favor a clear view past the listener.
    const preference = shotIndex % 2 ? 1 : -1;
    let angle = heading;
    let best = Infinity;
    for (const offset of [preference * 0.28, -preference * 0.28, 0, preference * 0.4, -preference * 0.4, preference * 0.65, -preference * 0.65, preference * 0.85, -preference * 0.85]) {
      const candidate = heading + offset;
      const x = speaker.x + Math.sin(candidate) * distance;
      const z = speaker.z + Math.cos(candidate) * distance;
      const score = obstructionCost(x, cameraY, z, speaker, framing.head + lift, actors) + Math.abs(offset - preference * 0.28) * 0.1;
      if (score < best) { best = score; angle = candidate; }
    }
    return { kind, speaker: speaker.id, heading, fov, centerY, target,
      position: [speaker.x + Math.sin(angle) * distance, cameraY, speaker.z + Math.cos(angle) * distance] };
  }

  const active = !overview && actors.find((actor) => walking(actor) || interacting(actor) || ["jump", "dance", "roll", "celebrate"].includes(actor.pose));
  const group = active ? [active, ...actors.filter((actor) => actor.id !== active.id && Math.hypot(actor.x - active.x, actor.z - active.z) < 2.5)] : actors;
  const cx = group.reduce((sum, actor) => sum + actor.x, 0) / group.length;
  const cz = group.reduce((sum, actor) => sum + actor.z, 0) / group.length;
  const spread = Math.max(0.8, ...group.map((actor) => Math.hypot(actor.x - cx, actor.z - cz) + 0.6));
  const height = Math.max(...group.map((actor) => CAMERA_CAST[actor.id].top));
  const target: Point3 = [cx - (overview && !portrait ? 2 : 0), height * 0.5, cz];
  const distance = Math.max(4.5, fit(height + 0.5, spread * 2.15)) * (overview ? 1.15 : 1.05 - move * 0.035);
  const cameraY = target[1] + Math.min(1.5, distance * 0.13);
  let angle = 0.18;
  let best = Infinity;
  for (const candidate of [0.18, -0.35, 0.55, -0.7, 0.8]) {
    const x = target[0] + Math.sin(candidate) * distance;
    const z = target[2] + Math.cos(candidate) * distance;
    const score = group.reduce((cost, actor) => cost + obstructionCost(x, cameraY, z, actor, CAMERA_CAST[actor.id].head, []), 0) + Math.abs(candidate - 0.18) * 0.1;
    if (score < best) { best = score; angle = candidate; }
  }
  angle += reducedMotion ? 0 : (move - 0.5) * 0.08;
  return { kind: active ? "tracking" : "wide", target, fov, centerY,
    position: [target[0] + Math.sin(angle) * distance, cameraY, target[2] + Math.cos(angle) * distance] };
}

/** A reverse shot cuts on the new line instead of flying through the cast. */
export function needsCameraCut(position: Point3, shot: CameraShot): boolean {
  if (!shot.speaker || shot.heading === undefined) return false;
  const angle = Math.atan2(position[0] - shot.target[0], position[2] - shot.target[2]);
  return Math.abs(wrapCameraAngle(angle - shot.heading)) > 0.95;
}
