import { ACTORS, PROPS, SPOTS } from "../world";
import type { ActorId, Beat, Emotion, PropId, Spot, Stage } from "../world";

/** A point on the ground, [x, z] in meters, matching lib/world.ts. */
export type Point = readonly [number, number];

export type Pose = "idle" | "walk" | "run" | "jump" | "sit" | "wave" | "hug" | "help" | "celebrate" | "reach";

export interface ActorState {
  id: ActorId;
  x: number;
  z: number;
  /** Rotation around the vertical axis. 0 faces the camera (+z). */
  heading: number;
  pose: Pose;
  /** Seconds since the current pose started, for animation phase. */
  poseTime: number;
  sitting: boolean;
  /** Who a hug or help leans toward. */
  facing?: ActorId;
  emotion?: Emotion;
  emotionLeft: number;
}

export interface PropState {
  id: PropId;
  /** On the ground at a point, or carried by an actor. */
  holder?: ActorId;
  x: number;
  z: number;
}

export interface Sim {
  actors: Partial<Record<ActorId, ActorState>>;
  props: Partial<Record<PropId, PropState>>;
  /** True once every beat has played. */
  done: boolean;
  step(dt: number): void;
}

const WALK_SPEED = 1.8;
const RUN_SPEED = 3.6;
const PERSONAL_SPACE = 0.9;
const EMOTION_SECONDS = 2.4;

/** Where characters stand at a spot: in front of the landmark, facing the camera. */
export function standingPoint(spot: Spot, slot = 0, slots = 1): Point {
  const [x, z] = SPOTS[spot].position;
  const front = spot === "path" ? 0 : 1.6;
  return [x + (slot - (slots - 1) / 2) * 1.1, z + front];
}

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const headingTo = (from: Point, to: Point) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/**
 * Turn a stage into a running simulation. Each beat is a generator that advances one
 * frame per step, so beats that need several moves (give = walk over, hand it across)
 * read top to bottom.
 */
export function createSim(stage: Stage): Sim {
  const actors: Sim["actors"] = {};
  const bySpot = new Map<Spot, ActorId[]>();
  for (const { actor, at } of stage.cast) bySpot.set(at, [...(bySpot.get(at) ?? []), actor]);
  for (const [spot, ids] of bySpot) {
    ids.forEach((id, slot) => {
      const [x, z] = standingPoint(spot, slot, ids.length);
      actors[id] = { id, x, z, heading: 0, pose: "idle", poseTime: 0, sitting: false, emotionLeft: 0 };
    });
  }

  const props: Sim["props"] = {};
  stage.props.forEach(({ prop, at }, index) => {
    if (at in ACTORS && actors[at as ActorId]) {
      const holder = actors[at as ActorId]!;
      props[prop] = { id: prop, holder: holder.id, x: holder.x, z: holder.z };
    } else {
      const [x, z] = SPOTS[(at in SPOTS ? at : PROPS[prop].home) as Spot].position;
      props[prop] = { id: prop, x: x + 0.7 + index * 0.5, z: z + 0.9 };
    }
  });

  let dt = 0;
  const actor = (id: ActorId) => actors[id];
  const at = (a: ActorState): Point => [a.x, a.z];

  function setPose(a: ActorState, pose: Pose) {
    if (a.pose !== pose) a.poseTime = 0;
    a.pose = pose;
    if (pose !== "sit" && pose !== "idle") a.sitting = false;
  }

  function* hold(a: ActorState, pose: Pose, seconds: number) {
    setPose(a, pose);
    for (let left = seconds; left > 0; left -= dt) yield;
    setPose(a, a.sitting ? "sit" : "idle");
  }

  function* moveTo(a: ActorState, dest: () => Point, speed: number, stopShort = 0) {
    setPose(a, speed > WALK_SPEED ? "run" : "walk");
    for (;;) {
      const target = dest();
      const gap = distance(at(a), target) - stopShort;
      if (gap <= 0.02) break;
      a.heading = headingTo(at(a), target);
      const stride = Math.min(gap, speed * dt);
      a.x += Math.sin(a.heading) * stride;
      a.z += Math.cos(a.heading) * stride;
      yield;
    }
    setPose(a, "idle");
  }

  function* approach(a: ActorState, other: ActorState, speed = WALK_SPEED) {
    if (distance(at(a), at(other)) > PERSONAL_SPACE + 0.1) {
      yield* moveTo(a, () => at(other), speed, PERSONAL_SPACE);
    }
    a.heading = headingTo(at(a), at(other));
    other.heading = headingTo(at(other), at(a));
  }

  function* takeProp(a: ActorState, id: PropId) {
    const prop = props[id];
    if (!prop || prop.holder === a.id) return;
    if (prop.holder) {
      const holder = actor(prop.holder);
      if (holder) yield* approach(a, holder);
    } else {
      yield* moveTo(a, () => [prop.x, prop.z], WALK_SPEED, 0.45);
    }
    prop.holder = a.id;
    yield* hold(a, "reach", 0.5);
  }

  const BEATS: { [K in Beat["action"]]: (beat: Beat & { action: K }, a: ActorState) => Generator } = {
    *walk_to(beat, a) {
      yield* goTo(a, beat.target, WALK_SPEED);
    },
    *run_to(beat, a) {
      yield* goTo(a, beat.target, RUN_SPEED);
    },
    *pick_up(beat, a) {
      yield* takeProp(a, beat.prop);
    },
    *give(beat, a) {
      const other = actor(beat.target);
      if (!other) return;
      yield* takeProp(a, beat.prop);
      yield* approach(a, other);
      yield* hold(a, "reach", 0.5);
      const prop = props[beat.prop];
      if (prop) prop.holder = other.id;
      other.emotion = "happy";
      other.emotionLeft = EMOTION_SECONDS;
      yield* hold(other, "jump", 0.7);
    },
    *hug(beat, a) {
      const other = actor(beat.target);
      if (!other) return;
      yield* approach(a, other);
      a.facing = other.id;
      other.facing = a.id;
      setPose(other, "hug");
      yield* hold(a, "hug", 1.4);
      setPose(other, other.sitting ? "sit" : "idle");
      a.facing = other.facing = undefined;
    },
    *help(beat, a) {
      const other = actor(beat.target);
      if (!other) return;
      yield* approach(a, other);
      a.facing = other.id;
      yield* hold(a, "help", 0.7);
      a.facing = undefined;
      yield* hold(other, "jump", 0.6);
    },
    *wave(beat, a) {
      const other = beat.target ? actor(beat.target) : undefined;
      if (other) a.heading = headingTo(at(a), at(other));
      yield* hold(a, "wave", 1.4);
    },
    *jump(_beat, a) {
      yield* hold(a, "jump", 1);
    },
    *sit(_beat, a) {
      a.sitting = true;
      setPose(a, "sit");
      for (let left = 0.8; left > 0; left -= dt) yield;
    },
    *celebrate(_beat, a) {
      yield* hold(a, "celebrate", 1.6);
    },
    *emote(beat, a) {
      a.emotion = beat.emotion;
      a.emotionLeft = EMOTION_SECONDS;
      for (let left = 1.2; left > 0; left -= dt) yield;
    },
  };

  function* goTo(a: ActorState, target: Spot | ActorId, speed: number) {
    if (target in SPOTS) {
      yield* moveTo(a, () => standingPoint(target as Spot), speed);
      return;
    }
    const other = actor(target as ActorId);
    if (other) yield* approach(a, other, speed);
  }

  function* play() {
    for (let left = 0.6; left > 0; left -= dt) yield;
    for (const beat of stage.beats) {
      const a = actor(beat.actor);
      if (!a) continue;
      // The union is checked per action by the BEATS table's type.
      yield* (BEATS[beat.action] as (b: Beat, a: ActorState) => Generator)(beat, a);
    }
  }

  const timeline = play();
  const sim: Sim = {
    actors,
    props,
    done: false,
    step(seconds) {
      dt = Math.min(seconds, 0.1);
      for (const a of Object.values(actors)) {
        a.poseTime += dt;
        if (a.emotionLeft > 0) {
          a.emotionLeft -= dt;
          if (a.emotionLeft <= 0) a.emotion = undefined;
        }
      }
      if (!sim.done && timeline.next().done) sim.done = true;
      for (const prop of Object.values(props)) {
        const holder = prop.holder ? actors[prop.holder] : undefined;
        if (holder) {
          prop.x = holder.x;
          prop.z = holder.z;
        }
      }
    },
  };
  return sim;
}
