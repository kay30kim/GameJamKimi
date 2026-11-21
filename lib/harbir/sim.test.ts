import assert from "node:assert/strict";
import test from "node:test";
import { createSim, standingPoint } from "./sim";
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
  assert.ok(Math.abs(Math.hypot(hero.x - puppy.x, hero.z - puppy.z) - 0.9) < 0.1);
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
  const [px, pz] = standingPoint("pond");
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
