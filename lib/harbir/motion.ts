import type { ActorId, Emotion } from "../world";
import { JUMP_SECONDS, ROLL_SECONDS } from "./sim";
import type { ActorState } from "./sim";

/**
 * How a character's body should look this frame, worked out from its sim state alone.
 * Angles are radians. Limb angles rotate around the shoulder or hip: positive x swings
 * the hand or foot backward, and raise lifts an arm out to the side.
 */
export interface Motion {
  /** Meters off the ground. */
  lift: number;
  /** Height scale: below 1 squashes, above 1 stretches. Width changes to keep the volume. */
  squash: number;
  /** Uniform scale for tucking into a ball during a roll. */
  curl: number;
  /** Forward pitch around the feet. */
  lean: number;
  /** Sideways roll around the feet. */
  sway: number;
  /** Somersault pitch around the middle of the body. */
  flip: number;
  /** Extra turn on top of the heading, for spins. */
  spin: number;
  armLeft: number;
  armRight: number;
  raiseLeft: number;
  raiseRight: number;
  legLeft: number;
  legRight: number;
  /** Head pitch: positive looks down. */
  nod: number;
  /** Head roll: positive tilts toward the character's left. */
  tilt: number;
  /** Ears swept back: 0 is upright, about 1 is flat along the back. */
  ears: number;
  /** Ears drooping out to the sides. */
  droop: number;
  tail: number;
}

const REST: Motion = {
  lift: 0, squash: 1, curl: 1, lean: 0, sway: 0, flip: 0, spin: 0,
  armLeft: 0, armRight: 0, raiseLeft: 0.08, raiseRight: 0.08, legLeft: 0, legRight: 0,
  nod: 0, tilt: 0, ears: 0.1, droop: 0, tail: 0,
};

/** Bunnies and puppies bound with both back legs together; bears and owls step. */
const BOUNDS: Record<ActorId, boolean> = { hero: true, puppy: true, friend: false, grownup: false };

/** Meters covered by one full step cycle (left and right), or by one bound. */
const WALK_STRIDE = 1.0;
const RUN_STRIDE = 1.7;
const BOUND_LENGTH = 1.35;

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const easeInOut = (v: number) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2);
/** 0 at both ends, 1 in the middle. */
const hump = (v: number) => Math.sin(Math.PI * clamp01(v));

function walk(a: ActorState): Motion {
  const p = (a.travelled / WALK_STRIDE) * TAU;
  const s = Math.sin(p);
  // The body is highest as each foot passes under it, twice per cycle.
  const bob = (1 + Math.cos(2 * p)) / 2;
  return {
    ...REST,
    lift: 0.05 * bob,
    squash: 0.98 + 0.04 * bob,
    lean: 0.07,
    sway: 0.07 * s,
    armLeft: -0.5 * s,
    armRight: 0.5 * s,
    legLeft: 0.6 * s,
    legRight: -0.6 * s,
    nod: 0.04 * (1 - bob),
    tilt: -0.05 * s,
    ears: 0.25,
    tail: 0.4 * s,
  };
}

function run(a: ActorState): Motion {
  if (BOUNDS[a.id]) {
    // One bound: push off with both feet, stretch through the air, land and gather.
    const u = (a.travelled / BOUND_LENGTH) % 1;
    const air = hump(u);
    const swing = Math.cos(u * TAU);
    return {
      ...REST,
      lift: 0.34 * air,
      squash: 0.9 + 0.22 * air,
      lean: 0.2 + 0.14 * Math.sin(u * TAU),
      armLeft: 0.7 * swing,
      armRight: 0.7 * swing,
      raiseLeft: 0.25,
      raiseRight: 0.25,
      legLeft: 0.8 * swing,
      legRight: 0.8 * swing,
      nod: -0.08 * air,
      ears: 0.8,
      tail: 0.3 * swing,
    };
  }
  const p = (a.travelled / RUN_STRIDE) * TAU;
  const s = Math.sin(p);
  const bob = Math.abs(Math.cos(p));
  return {
    ...REST,
    lift: 0.13 * bob,
    squash: 0.95 + 0.08 * bob,
    lean: 0.2,
    sway: 0.05 * s,
    armLeft: -0.95 * s,
    armRight: 0.95 * s,
    raiseLeft: 0.2,
    raiseRight: 0.2,
    legLeft: 0.9 * s,
    legRight: -0.9 * s,
    ears: 0.6,
    tail: 0.5 * s,
  };
}

/** Timing inside one hop, as fractions of JUMP_SECONDS. */
const CROUCH_END = 0.22, LAND_AT = 0.78;

/** One hop at time t seconds: crouch, leave the ground stretched, tuck, land, and settle. */
function hop(t: number, height: number): Motion {
  const u = t / JUMP_SECONDS;
  if (u < CROUCH_END) {
    const k = easeOut(u / CROUCH_END);
    return {
      ...REST,
      squash: 1 - 0.24 * k,
      lean: 0.14 * k,
      armLeft: 0.7 * k,
      armRight: 0.7 * k,
      legLeft: -0.25 * k,
      legRight: -0.25 * k,
      nod: 0.12 * k,
      ears: 0.1 + 0.3 * k,
    };
  }
  if (u < LAND_AT) {
    const f = (u - CROUCH_END) / (LAND_AT - CROUCH_END);
    const up = hump(f);
    // Stretched as it leaves the ground, round at the top, a little long again coming down.
    const stretch = 0.16 * (1 - f) ** 2 + 0.06 * f ** 3;
    return {
      ...REST,
      lift: height * 4 * f * (1 - f),
      squash: 1 + stretch,
      lean: -0.1 * up,
      armLeft: -0.4 * up,
      armRight: -0.4 * up,
      raiseLeft: 0.3 + 1.9 * up,
      raiseRight: 0.3 + 1.9 * up,
      legLeft: -0.55 * up,
      legRight: -0.55 * up,
      nod: -0.15 * up,
      ears: 0.1 - 0.25 * up,
      tail: 0.4 * up,
    };
  }
  // Landing: squash on contact, then spring back to standing.
  const k = clamp01((u - LAND_AT) / (1 - LAND_AT));
  const give = hump(Math.min(1, k * 1.3)) * (1 - 0.3 * k);
  return {
    ...REST,
    squash: 1 - 0.2 * give,
    lean: 0.1 * give,
    raiseLeft: 0.6 * (1 - k),
    raiseRight: 0.6 * (1 - k),
    legLeft: -0.2 * give,
    legRight: -0.2 * give,
    nod: 0.1 * give,
    ears: 0.35 * give,
  };
}

function roll(t: number): Motion {
  const u = t / ROLL_SECONDS;
  // Tuck (0-0.2), turn over while rolling forward (0.2-0.8), unfold and stand (0.8-1).
  const tuck = u < 0.2 ? easeOut(u / 0.2) : u < 0.8 ? 1 : 1 - easeOut((u - 0.8) / 0.2);
  const turn = easeInOut(clamp01((u - 0.2) / 0.6));
  const bounce = u > 0.8 ? hump((u - 0.8) / 0.2) : 0;
  return {
    ...REST,
    curl: 1 - 0.36 * tuck,
    squash: 1 - 0.1 * tuck - 0.12 * bounce,
    lean: 0.35 * tuck * (1 - turn),
    flip: turn * TAU,
    lift: 0.08 * hump(turn),
    armLeft: -1.6 * tuck,
    armRight: -1.6 * tuck,
    raiseLeft: 0.08 + 0.4 * bounce,
    raiseRight: 0.08 + 0.4 * bounce,
    legLeft: -1.3 * tuck,
    legRight: -1.3 * tuck,
    nod: 0.45 * tuck,
    ears: 0.1 + 0.9 * tuck,
  };
}

function idle(a: ActorState): Motion {
  const t = a.poseTime;
  const breathe = Math.sin(t * 2.2);
  if (a.sitting) {
    return { ...REST, lift: -0.12, squash: 0.86 + 0.01 * breathe, raiseLeft: 0.15, raiseRight: 0.15, legLeft: -1.4, legRight: -1.4, tail: 0.15 * Math.sin(t * 3) };
  }
  return {
    ...REST,
    squash: 1 + 0.015 * breathe,
    sway: 0.02 * Math.sin(t * 1.1),
    armLeft: 0.04 * breathe,
    armRight: 0.04 * breathe,
    nod: 0.02 * Math.sin(t * 0.9),
    tilt: 0.04 * Math.sin(t * 0.6),
    // A quick double wag every few seconds.
    tail: 0.5 * Math.sin(t * 14) * Math.max(0, Math.sin(t * 1.3) - 0.7),
  };
}

function pose(a: ActorState): Motion {
  const t = a.poseTime;
  switch (a.pose) {
    case "idle": return idle(a);
    case "walk": return walk(a);
    case "run": return run(a);
    case "jump": return t < JUMP_SECONDS ? hop(t, 0.6) : idle(a);
    case "roll": return t < ROLL_SECONDS ? roll(t) : idle(a);
    case "celebrate": {
      // Two hops with a full spin in the air on each.
      const local = t % JUMP_SECONDS;
      const m = hop(local, 0.5);
      const f = clamp01((local / JUMP_SECONDS - CROUCH_END) / (LAND_AT - CROUCH_END));
      return { ...m, spin: easeInOut(f) * TAU, raiseLeft: Math.max(m.raiseLeft, 1.6), raiseRight: Math.max(m.raiseRight, 1.6) };
    }
    case "sit": {
      // Ease down over a third of a second instead of dropping.
      const k = easeOut(clamp01(t / 0.35));
      const seated = idle({ ...a, sitting: true });
      return { ...seated, lift: seated.lift * k, squash: 1 - (1 - seated.squash) * k, legLeft: seated.legLeft * k, legRight: seated.legRight * k };
    }
    case "wave": {
      const wave = Math.sin(t * 11);
      return {
        ...REST,
        sway: 0.05 * Math.sin(t * 5.5),
        lift: 0.03 * Math.abs(Math.sin(t * 5.5)),
        raiseRight: 2.5 + 0.35 * wave,
        armRight: -0.2,
        tilt: -0.14,
        ears: 0.05,
        tail: 0.4 * wave,
      };
    }
    case "hug": {
      const squeeze = Math.sin(clamp01(t / 1.4) * Math.PI);
      return { ...REST, lean: 0.22, squash: 1 - 0.05 * squeeze, armLeft: -1.35, armRight: -1.35, raiseLeft: 0.55, raiseRight: 0.55, tilt: 0.18, nod: 0.05, ears: 0.3, tail: 0.5 * Math.sin(t * 12) };
    }
    case "help":
    case "reach": {
      const k = easeOut(clamp01(t / 0.25));
      return { ...REST, lean: 0.26 * k, armLeft: -1.2 * k, armRight: -1.2 * k, nod: 0.2 * k, ears: 0.15 };
    }
  }
}

/** Feelings show on top of whatever the body is doing. */
function feel(m: Motion, emotion: Emotion | undefined, t: number): Motion {
  switch (emotion) {
    case "sad": return { ...m, nod: m.nod + 0.28, ears: m.ears + 0.35, droop: 0.7, squash: m.squash - 0.03, tail: m.tail * 0.3 };
    case "curious": return { ...m, tilt: m.tilt + 0.26, ears: m.ears - 0.1 };
    case "surprised": return { ...m, ears: -0.15, nod: m.nod - 0.12, squash: m.squash + 0.04 };
    case "happy": return { ...m, nod: m.nod - 0.06, tail: m.tail + 0.4 * Math.sin(t * 13) };
    case "excited": return { ...m, lift: m.lift + 0.06 * Math.abs(Math.sin(t * 9)), tail: m.tail + 0.5 * Math.sin(t * 16) };
    default: return m;
  }
}

/** The pose for one character this frame. Pure, so it is safe to call from anywhere. */
export function motionOf(a: ActorState, clock: number): Motion {
  return feel(pose(a), a.emotion, clock);
}
