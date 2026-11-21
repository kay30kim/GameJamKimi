import { gap, OBSTACLES } from "./obstacles";
import { createSim, PROP_RADIUS, RADIUS } from "./sim";
import type { Stage } from "../world";

/** Scenes built to stress collisions. /harbir/qa replays them, and the tests audit them. */
export const SCENARIOS: { name: string; about: string; stage: Stage }[] = [
  {
    name: "Pick up the ball by a friend",
    about: "Kimi walks up to the ball while Momo stands right next to it.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "playground" }],
      props: [{ prop: "ball", at: "playground" }],
      beats: [{ actor: "hero", action: "pick_up", prop: "ball" }, { actor: "hero", action: "give", prop: "ball", target: "friend" }],
    },
  },
  {
    name: "Run through the ball",
    about: "Kimi runs from the bench to the big tree, straight over the ball; the ball should roll away.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "bench" }, { actor: "friend", at: "tree" }],
      props: [{ prop: "ball", at: "bench" }],
      beats: [{ actor: "hero", action: "run_to", target: "tree" }, { actor: "hero", action: "wave", target: "friend" }],
    },
  },
  {
    name: "Walk around the house",
    about: "Kimi walks from the garden to the big tree, past the house.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "garden" }],
      props: [],
      beats: [{ actor: "hero", action: "walk_to", target: "home" }, { actor: "hero", action: "walk_to", target: "tree" }],
    },
  },
  {
    name: "Tree to pond",
    about: "Momo runs from the big tree to the pond, past a tree in the meadow.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "friend", at: "tree" }, { actor: "hero", at: "path" }],
      props: [],
      beats: [{ actor: "friend", action: "run_to", target: "pond" }, { actor: "hero", action: "run_to", target: "friend" }],
    },
  },
  {
    name: "Across the playground",
    about: "Kimi runs from the garden to the pond, past the swings and the slide.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "garden" }, { actor: "friend", at: "playground" }],
      props: [{ prop: "kite", at: "playground" }],
      beats: [{ actor: "hero", action: "run_to", target: "pond" }, { actor: "hero", action: "run_to", target: "garden" }],
    },
  },
  {
    name: "Crowd at the bench",
    about: "Everyone heads to the bench at once and squeezes in.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "home" }, { actor: "friend", at: "playground" }, { actor: "puppy", at: "garden" }, { actor: "grownup", at: "tree" }],
      props: [{ prop: "book", at: "bench" }],
      beats: [
        { actor: "friend", action: "run_to", target: "bench" },
        { actor: "puppy", action: "run_to", target: "bench" },
        { actor: "grownup", action: "walk_to", target: "bench" },
        { actor: "hero", action: "run_to", target: "bench" },
      ],
    },
  },
  {
    name: "Roll into a friend",
    about: "Kimi turns to Momo, rolls straight into Momo, then hugs.",
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
      props: [{ prop: "apple", at: "path" }],
      beats: [{ actor: "hero", action: "wave", target: "friend" }, { actor: "hero", action: "roll" }, { actor: "hero", action: "hug", target: "friend" }],
    },
  },
  {
    name: "Share the umbrella",
    about: "Kimi carries the umbrella to Bori by the pond and hands it over.",
    stage: {
      weather: "rainy",
      cast: [{ actor: "hero", at: "home" }, { actor: "puppy", at: "pond" }],
      props: [{ prop: "umbrella", at: "hero" }],
      beats: [{ actor: "hero", action: "give", prop: "umbrella", target: "puppy" }, { actor: "puppy", action: "jump" }],
    },
  },
];

export interface Audit {
  /** Seconds until every beat played, or Infinity if it never finished. */
  seconds: number;
  /** Deepest two bodies ever overlapped, in meters, not counting hugs. */
  bodyOverlap: number;
  /** Deepest a body ever went into scenery, in meters. */
  sceneryOverlap: number;
  /** Deepest a prop on the ground ever sat inside a body, in meters. */
  propInBody: number;
  /** Deepest a prop ever sat inside scenery, in meters. */
  propInScenery: number;
  /** Farthest any prop got pushed or rolled along the ground, in meters. */
  propMoved: number;
}

/** How much overlap still counts as touching rather than passing through, in meters. */
export const TOLERANCE = 0.05;

/** Plays a stage headless at 60 frames a second and records the worst collisions. */
export function audit(stage: Stage, maxSeconds = 40): Audit {
  const sim = createSim(stage);
  const result: Audit = { seconds: Infinity, bodyOverlap: 0, sceneryOverlap: 0, propInBody: 0, propInScenery: 0, propMoved: 0 };
  const start = new Map(Object.values(sim.props).map((p) => [p.id, [p.x, p.z] as const]));
  const dt = 1 / 60;
  // Keep going a little after the last beat so a rolling ball settles.
  let settle = 2;
  for (let t = 0; t < maxSeconds && settle > 0; t += dt) {
    sim.step(dt);
    if (sim.done) {
      if (result.seconds === Infinity) result.seconds = t;
      settle -= dt;
    }
    const actors = Object.values(sim.actors);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      for (const o of OBSTACLES) result.sceneryOverlap = Math.max(result.sceneryOverlap, RADIUS[a.id] - gap(o, a.x, a.z));
      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j];
        if (sim.together(a.id, b.id)) continue;
        const overlap = RADIUS[a.id] + RADIUS[b.id] - Math.hypot(a.x - b.x, a.z - b.z);
        result.bodyOverlap = Math.max(result.bodyOverlap, overlap);
      }
    }
    for (const prop of Object.values(sim.props)) {
      if (prop.holder) continue;
      const [sx, sz] = start.get(prop.id)!;
      result.propMoved = Math.max(result.propMoved, Math.hypot(prop.x - sx, prop.z - sz));
      const size = PROP_RADIUS[prop.id];
      for (const o of OBSTACLES) result.propInScenery = Math.max(result.propInScenery, size - gap(o, prop.x, prop.z));
      for (const a of actors) {
        if (a.reaching === prop.id) continue;
        result.propInBody = Math.max(result.propInBody, RADIUS[a.id] + size - Math.hypot(a.x - prop.x, a.z - prop.z));
      }
    }
  }
  return result;
}

export const passes = (a: Audit) =>
  Number.isFinite(a.seconds) && Math.max(a.bodyOverlap, a.sceneryOverlap, a.propInBody, a.propInScenery) <= TOLERANCE;

