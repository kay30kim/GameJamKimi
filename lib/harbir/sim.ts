import { ACTORS, PROPS, SPOTS } from "../world";
import { clearLine, plan, pushOut } from "./obstacles";
import type { ActorId, Beat, Emotion, PropId, Spot, Stage } from "../world";

/** A point on the ground, [x, z] in meters, matching lib/world.ts. */
export type Point = readonly [number, number];

export type Pose = "idle" | "walk" | "run" | "jump" | "roll" | "sit" | "wave" | "hug" | "help" | "celebrate" | "reach" | "dance" | "clap" | "nap" | "look";

/** One hop: crouch, flight, and landing. Celebrate is two hops. */
export const JUMP_SECONDS = 0.8;
/** One forward roll: tuck, somersault, and stand back up. */
export const ROLL_SECONDS = 1.1;
/** Short actions that play in place. */
export const DANCE_SECONDS = 2.2;
export const CLAP_SECONDS = 1.3;
export const NAP_SECONDS = 2.6;
export const LOOK_SECONDS = 1.8;
/** How far a roll carries the body forward, in meters. */
const ROLL_DISTANCE = 1.2;

export interface ActorState {
  id: ActorId;
  x: number;
  z: number;
  /** Rotation around the vertical axis. 0 faces the camera (+z). */
  heading: number;
  pose: Pose;
  /** Seconds since the current pose started, for animation phase. */
  poseTime: number;
  /** Meters walked or run so far, so steps line up with the ground instead of sliding. */
  travelled: number;
  sitting: boolean;
  /** Who a hug or help leans toward. */
  facing?: ActorId;
  /** The prop this actor is walking up to pick up, so it doesn't kick it away. */
  reaching?: PropId;
  emotion?: Emotion;
  emotionLeft: number;
}

export interface PropState {
  id: PropId;
  /** On the ground at a point, or carried by an actor. */
  holder?: ActorId;
  x: number;
  z: number;
  /** Rolling speed on the ground, in meters per second. Only the ball rolls. */
  vx: number;
  vz: number;
}

export interface Sim {
  actors: Partial<Record<ActorId, ActorState>>;
  props: Partial<Record<PropId, PropState>>;
  /** True once every beat has played. */
  done: boolean;
  step(dt: number): void;
  /** True while two characters are allowed to be closer than touching, such as during a hug. */
  together(a: ActorId, b: ActorId): boolean;
}

const WALK_SPEED = 1.8;
const RUN_SPEED = 3.6;
/** Body radius on the ground, so characters keep their distance instead of walking through each other. */
export const RADIUS: Record<ActorId, number> = { hero: 0.38, friend: 0.42, puppy: 0.45, grownup: 0.5, kitten: 0.36, duck: 0.32 };
/** Footprint of each prop lying on the ground. Bodies push these aside instead of standing in them. */
export const PROP_RADIUS: Record<PropId, number> = { ball: 0.22, apple: 0.16, flower: 0.12, book: 0.24, kite: 0.3, umbrella: 0.25, balloon: 0.2, cookies: 0.22, watering_can: 0.26 };
/** How hard a walker's bump sends the ball rolling, and how quickly grass slows it down. */
const KICK_SPEED = 1.6;
const ROLL_FRICTION = 1.4;
/** Gap between two bodies when one walks up to talk to or give something to the other. */
const CHAT_GAP = 0.35;
/** Contact may finish a fraction of a step short, but never across scenery. */
const CONTACT_TOLERANCE = 0.08;
const CONTACT_RADIUS = 0.04;
/** How far ahead a walker starts steering around someone in the way. */
const AVOID_RANGE = 0.9;
const EMOTION_SECONDS = 2.4;

/** Where characters stand at a spot: in front of the landmark, facing the camera. */
export function standingPoint(spot: Spot, slot = 0, slots = 1): Point {
  const [x, z] = SPOTS[spot].position;
  const front = spot === "path" ? 0 : 1.6;
  return [x + (slot - (slots - 1) / 2) * 1.3, z + front];
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
      const [x, z] = pushOut(...standingPoint(spot, slot, ids.length), RADIUS[id]);
      actors[id] = { id, x, z, heading: 0, pose: "idle", poseTime: 0, travelled: 0, sitting: false, emotionLeft: 0 };
    });
  }

  const props: Sim["props"] = {};
  stage.props.forEach(({ prop, at }, index) => {
    const holder = at in ACTORS ? actors[at as ActorId] : undefined;
    const occupied = holder && Object.values(props).some((item) => item.holder === holder.id && item.id !== prop);
    if (holder && !occupied) {
      props[prop] = { id: prop, holder: holder.id, x: holder.x, z: holder.z, vx: 0, vz: 0 };
    } else {
      // Extra props remain nearby on the ground instead of occupying the same hand.
      const [x, z] = holder ? [holder.x, holder.z] : SPOTS[(at in SPOTS ? at : PROPS[prop].home) as Spot].position;
      const [px, pz] = pushOut(x + 0.7 + index * 0.5, z + 0.9, PROP_RADIUS[prop]);
      props[prop] = { id: prop, x: px, z: pz, vx: 0, vz: 0 };
    }
  });

  let dt = 0;
  const actor = (id: ActorId) => actors[id];
  const at = (a: ActorState): Point => [a.x, a.z];
  const touching = (a: ActorState, b: ActorState) => RADIUS[a.id] + RADIUS[b.id];
  const hasRoom = (a: ActorState, id: PropId) => !Object.values(props).some((prop) => prop.holder === a.id && prop.id !== id);
  const canTouch = (a: ActorState, point: Point, reach: number) =>
    distance(at(a), point) <= reach + CONTACT_TOLERANCE && clearLine(at(a), point, CONTACT_RADIUS);
  /** Pairs allowed to be closer than touching distance, such as two characters hugging. */
  const close = new Set<string>();
  const pairKey = (a: ActorId, b: ActorId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

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

  /**
   * Walk toward a point along a route around the scenery, steering around anyone in the way
   * (except `ignore`, the one being approached). Replans if the destination moves, and gives
   * up if blocked for a second, so a crowded spot never stalls the story.
   */
  function* moveTo(a: ActorState, dest: () => Point, speed: number, stopShort = 0, ignore?: ActorId): Generator<undefined, boolean> {
    setPose(a, speed > WALK_SPEED ? "run" : "walk");
    const radius = RADIUS[a.id];
    let goal = dest();
    let route = plan(at(a), pushOut(...goal, radius), radius);
    let best = Infinity, stuckFor = 0;
    let arrived = false;
    for (;;) {
      const live = dest();
      if (distance(live, goal) > 0.8) {
        goal = live;
        route = plan(at(a), pushOut(...goal, radius), radius);
      }
      // Drop waypoints already reached, or ones the walker can now cut straight past.
      while (route.length > 1 && (distance(at(a), route[0]) < 0.25 || clearLine(at(a), route[1], radius))) route.shift();
      const last = route.length === 1;
      const aim = last ? pushOut(...live, radius) : route[0];
      let left = distance(at(a), aim);
      for (let i = 1; i < route.length; i++) left += distance(route[i - 1], route[i]);
      // A pushed-out navigation endpoint is not the object itself. Test the actual
      // contact distance before ending an approach, especially beside the pond.
      if (last && (stopShort > 0
        ? distance(at(a), live) <= stopShort + 0.02 && clearLine(at(a), live, CONTACT_RADIUS)
        : left <= 0.02)) {
        arrived = true;
        break;
      }
      if (left < best - 0.03) { best = left; stuckFor = 0; } else if ((stuckFor += dt) > 1) break;

      const toAim = Math.max(distance(at(a), aim), 1e-6);
      let dx = (aim[0] - a.x) / toAim, dz = (aim[1] - a.z) / toAim;
      for (const other of Object.values(actors)) {
        if (other === a || other.id === ignore) continue;
        const d = distance(at(a), at(other));
        const room = d - touching(a, other);
        if (room >= AVOID_RANGE || d === 0) continue;
        const push = (1 - Math.max(0, room) / AVOID_RANGE) * 1.6;
        dx += ((a.x - other.x) / d) * push;
        dz += ((a.z - other.z) / d) * push;
      }
      const length = Math.hypot(dx, dz) || 1;
      a.heading = Math.atan2(dx, dz);
      const stride = Math.min(last ? left : toAim + 0.05, speed * dt);
      a.x += (dx / length) * stride;
      a.z += (dz / length) * stride;
      a.travelled += stride;
      yield;
    }
    setPose(a, "idle");
    return arrived;
  }

  function* approach(a: ActorState, other: ActorState, speed = WALK_SPEED, gap = CHAT_GAP): Generator<undefined, boolean> {
    const stop = touching(a, other) + gap;
    if (!canTouch(a, at(other), stop)) {
      if (!(yield* moveTo(a, () => at(other), speed, stop, other.id))) return false;
    }
    if (!canTouch(a, at(other), stop)) return false;
    a.heading = headingTo(at(a), at(other));
    other.heading = headingTo(at(other), at(a));
    return true;
  }

  function* takeProp(a: ActorState, id: PropId): Generator<undefined, boolean> {
    const prop = props[id];
    if (!prop || !hasRoom(a, id)) return false;
    if (prop.holder === a.id) return true;
    const previousHolder = prop.holder;
    const holder = previousHolder ? actor(previousHolder) : undefined;
    const reach = holder ? touching(a, holder) + CHAT_GAP : RADIUS[a.id] + 0.15;
    const point = (): Point => holder ? at(holder) : [prop.x, prop.z];
    a.reaching = id;
    try {
      const arrived = holder
        ? yield* approach(a, holder)
        : yield* moveTo(a, point, WALK_SPEED, reach);
      if (!arrived || !canTouch(a, point(), reach)) return false;
      a.heading = headingTo(at(a), point());
      if (holder) setPose(holder, "reach");
      yield* hold(a, "reach", 0.5);
      if (prop.holder !== previousHolder || !hasRoom(a, id) || !canTouch(a, point(), reach)) return false;
      prop.holder = a.id;
      prop.vx = prop.vz = 0;
      if (holder) yield* hold(a, "reach", 0.25);
      return true;
    } finally {
      a.reaching = undefined;
      if (holder?.pose === "reach") setPose(holder, "idle");
    }
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
      const prop = props[beat.prop];
      if (!other || !prop || prop.holder === other.id || !hasRoom(other, beat.prop)) return;
      if (!(yield* takeProp(a, beat.prop))) return;
      if (!(yield* approach(a, other))) return;
      setPose(other, "reach");
      yield* hold(a, "reach", 0.5);
      if (prop.holder !== a.id || !hasRoom(other, beat.prop) || !canTouch(a, at(other), touching(a, other) + CHAT_GAP)) {
        setPose(other, "idle");
        return;
      }
      prop.holder = other.id;
      yield* hold(other, "reach", 0.25);
      other.emotion = "happy";
      other.emotionLeft = EMOTION_SECONDS;
      yield* hold(other, "jump", JUMP_SECONDS);
    },
    *hug(beat, a) {
      const other = actor(beat.target);
      if (!other) return;
      const pair = pairKey(a.id, other.id);
      close.add(pair);
      if (!(yield* approach(a, other, WALK_SPEED, -0.15))) {
        close.delete(pair);
        return;
      }
      a.facing = other.id;
      other.facing = a.id;
      setPose(other, "hug");
      yield* hold(a, "hug", 1.4);
      setPose(other, other.sitting ? "sit" : "idle");
      a.facing = other.facing = undefined;
      close.delete(pair);
    },
    *help(beat, a) {
      const other = actor(beat.target);
      if (!other) return;
      if (!(yield* approach(a, other))) return;
      a.facing = other.id;
      yield* hold(a, "help", 0.7);
      a.facing = undefined;
      yield* hold(other, "jump", JUMP_SECONDS);
    },
    *wave(beat, a) {
      const other = beat.target ? actor(beat.target) : undefined;
      if (other) a.heading = headingTo(at(a), at(other));
      yield* hold(a, "wave", 1.4);
    },
    *jump(_beat, a) {
      yield* hold(a, "jump", JUMP_SECONDS);
      for (let left = 0.2; left > 0; left -= dt) yield;
    },
    *roll(_beat, a) {
      // Keep the carried object upright and above the ground instead of rolling over it.
      if (Object.values(props).some((prop) => prop.holder === a.id)) {
        yield* hold(a, "jump", JUMP_SECONDS);
        return;
      }
      setPose(a, "roll");
      // The body only travels while it is tucked and turning over, between 20% and 80% of the roll.
      const start = ROLL_SECONDS * 0.2, end = ROLL_SECONDS * 0.8;
      const speed = ROLL_DISTANCE / (end - start);
      for (let t = 0; t < ROLL_SECONDS; t += dt) {
        if (t > start && t < end) {
          a.x += Math.sin(a.heading) * speed * dt;
          a.z += Math.cos(a.heading) * speed * dt;
        }
        yield;
      }
      setPose(a, "idle");
    },
    *sit(_beat, a) {
      a.sitting = true;
      setPose(a, "sit");
      for (let left = 0.8; left > 0; left -= dt) yield;
    },
    *dance(_beat, a) {
      yield* hold(a, "dance", DANCE_SECONDS);
    },
    *clap(_beat, a) {
      yield* hold(a, "clap", CLAP_SECONDS);
    },
    *nap(_beat, a) {
      yield* hold(a, "nap", NAP_SECONDS);
    },
    *look_around(_beat, a) {
      yield* hold(a, "look", LOOK_SECONDS);
    },
    *celebrate(_beat, a) {
      yield* hold(a, "celebrate", JUMP_SECONDS * 2);
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

  /**
   * Push apart any two characters that overlap, and push everyone out of the scenery, so
   * nobody walks through anyone or anything. A few passes settle crowds near a wall.
   */
  function separate() {
    const list = Object.values(actors);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (close.has(pairKey(a.id, b.id))) continue;
          const d = distance(at(a), at(b));
          const overlap = touching(a, b) - d;
          if (overlap <= 0) continue;
          const [nx, nz] = d > 1e-6 ? [(b.x - a.x) / d, (b.z - a.z) / d] : [1, 0];
          a.x -= nx * overlap / 2;
          a.z -= nz * overlap / 2;
          b.x += nx * overlap / 2;
          b.z += nz * overlap / 2;
        }
      }
      for (const a of list) [a.x, a.z] = pushOut(a.x, a.z, RADIUS[a.id]);
    }
  }

  /**
   * Props on the ground get pushed aside by anyone who walks into them, instead of ending up
   * inside a body. The ball gets a kick and rolls until the grass slows it, bouncing off scenery.
   */
  function moveProps(before: Map<ActorId, Point>) {
    for (const prop of Object.values(props)) {
      const holder = prop.holder ? actors[prop.holder] : undefined;
      if (holder) {
        prop.x = holder.x;
        prop.z = holder.z;
        prop.vx = prop.vz = 0;
        continue;
      }
      const rolls = prop.id === "ball";
      if (rolls) {
        prop.x += prop.vx * dt;
        prop.z += prop.vz * dt;
        const slow = Math.exp(-ROLL_FRICTION * dt);
        prop.vx *= slow;
        prop.vz *= slow;
        if (Math.hypot(prop.vx, prop.vz) < 0.03) prop.vx = prop.vz = 0;
      }
      const size = PROP_RADIUS[prop.id];
      for (const a of Object.values(actors)) {
        if (a.reaching === prop.id) continue;
        const reach = RADIUS[a.id] + size;
        const d = distance(at(a), [prop.x, prop.z]);
        if (d >= reach) continue;
        const [nx, nz] = d > 1e-6 ? [(prop.x - a.x) / d, (prop.z - a.z) / d] : [Math.sin(a.heading), Math.cos(a.heading)];
        prop.x = a.x + nx * reach;
        prop.z = a.z + nz * reach;
        if (rolls) {
          const [bx, bz] = before.get(a.id) ?? at(a);
          const speed = Math.hypot(a.x - bx, a.z - bz) / Math.max(dt, 1e-6);
          const kick = Math.max(KICK_SPEED, speed * 1.3);
          prop.vx = nx * kick;
          prop.vz = nz * kick;
        }
      }
      const [x, z] = pushOut(prop.x, prop.z, size);
      if (x !== prop.x || z !== prop.z) {
        // Bounce off scenery, losing some speed.
        const dx = x - prop.x, dz = z - prop.z, length = Math.hypot(dx, dz);
        const nx = dx / length, nz = dz / length;
        const into = prop.vx * nx + prop.vz * nz;
        if (into < 0) {
          prop.vx -= 1.6 * into * nx;
          prop.vz -= 1.6 * into * nz;
        }
        prop.x = x;
        prop.z = z;
      }
    }
  }

  const timeline = play();
  const sim: Sim = {
    actors,
    props,
    done: false,
    together: (a, b) => close.has(pairKey(a, b)),
    step(seconds) {
      dt = Math.min(seconds, 0.1);
      for (const a of Object.values(actors)) {
        a.poseTime += dt;
        if (a.emotionLeft > 0) {
          a.emotionLeft -= dt;
          if (a.emotionLeft <= 0) a.emotion = undefined;
        }
      }
      const before = new Map(Object.values(actors).map((a) => [a.id, at(a)] as const));
      if (!sim.done && timeline.next().done) sim.done = true;
      separate();
      moveProps(before);
    },
  };
  return sim;
}
