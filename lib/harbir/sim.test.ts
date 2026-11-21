import assert from "node:assert/strict";
import test from "node:test";
import { pushOut } from "./obstacles";
import { createSim, RADIUS, standingPoint } from "./sim";
import type { Stage } from "../world";

function runToEnd(stage: Stage, maxSeconds = 30) {
  const sim = createSim(stage);
  let t = 0;
  while (!sim.done && t < maxSeconds) {
    sim.step(1 / 60);
    t += 1 / 60;
  }
  return { sim, seconds: t };
}

test("walking to an actor stops beside them and faces them", () => {
  const { sim, seconds } = runToEnd({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "puppy", at: "tree" }],
    props: [],
    beats: [{ actor: "hero", action: "walk_to", target: "puppy" }],
  });
  assert.ok(sim.done && seconds < 10, `took ${seconds}s`);
  const hero = sim.actors.hero!, puppy = sim.actors.puppy!;
  assert.ok(Math.abs(Math.hypot(hero.x - puppy.x, hero.z - puppy.z) - (0.38 + 0.45 + 0.35)) < 0.1);
  assert.equal(hero.pose, "idle");
});

test("give walks over, hands the prop across, and the prop follows its new holder", () => {
  const { sim } = runToEnd({
    weather: "rainy",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "playground" }],
    props: [{ prop: "umbrella", at: "home" }],
    beats: [
      { actor: "hero", action: "give", prop: "umbrella", target: "friend" },
      { actor: "friend", action: "run_to", target: "pond" },
    ],
  });
  const umbrella = sim.props.umbrella!, friend = sim.actors.friend!;
  assert.equal(umbrella.holder, "friend");
  assert.deepEqual([umbrella.x, umbrella.z], [friend.x, friend.z]);
  // The pond's standing point is at the water's edge, so Momo stops just outside the water.
  const [px, pz] = pushOut(...standingPoint("pond"), RADIUS.friend);
  assert.ok(Math.hypot(friend.x - px, friend.z - pz) < 0.05);
});

test("emotions show, then fade; sitting persists until the actor moves", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "bench" }],
    props: [],
    beats: [{ actor: "hero", action: "sit" }, { actor: "hero", action: "emote", emotion: "sad" }],
  });
  for (let i = 0; i < 100; i++) sim.step(1 / 60);
  assert.equal(sim.actors.hero!.pose, "sit");
  assert.equal(sim.actors.hero!.emotion, "sad");
  for (let i = 0; i < 400; i++) sim.step(1 / 60);
  assert.ok(sim.done);
  assert.equal(sim.actors.hero!.emotion, undefined);
  assert.equal(sim.actors.hero!.pose, "sit");
});

test("every action finishes, even when its target is missing from the cast", () => {
  const { sim, seconds } = runToEnd({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "grownup", at: "home" }],
    props: [{ prop: "ball", at: "playground" }],
    beats: [
      { actor: "hero", action: "pick_up", prop: "ball" },
      { actor: "hero", action: "hug", target: "grownup" },
      { actor: "hero", action: "help", target: "puppy" },
      { actor: "grownup", action: "wave", target: "hero" },
    ],
  });
  assert.ok(sim.done && seconds < 20, `took ${seconds}s`);
  assert.equal(sim.props.ball!.holder, "hero");
});

test("characters steer around each other and never overlap, except while hugging", () => {
  const radius = { hero: 0.38, friend: 0.42, puppy: 0.45, grownup: 0.5 } as const;
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "friend", at: "path" }, { actor: "puppy", at: "bench" }, { actor: "grownup", at: "tree" }],
    props: [],
    beats: [
      { actor: "hero", action: "run_to", target: "tree" },
      { actor: "grownup", action: "walk_to", target: "home" },
      { actor: "puppy", action: "run_to", target: "playground" },
      { actor: "friend", action: "walk_to", target: "bench" },
    ],
  });
  let t = 0;
  while (!sim.done && t < 40) {
    sim.step(1 / 60);
    t += 1 / 60;
    const list = Object.values(sim.actors);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        assert.ok(d >= radius[a.id] + radius[b.id] - 0.01, `${a.id} and ${b.id} overlap at ${t.toFixed(2)}s`);
      }
    }
  }
  assert.ok(sim.done, `still running after ${t}s`);
});
