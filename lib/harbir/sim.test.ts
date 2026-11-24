import assert from "node:assert/strict";
import test from "node:test";
import { pushOut } from "./obstacles";
import { createSim, PROP_RADIUS, RADIUS, standingPoint } from "./sim";
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
  const radius = RADIUS;
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

test("a blocked approach never picks up a distant balloon", () => {
  const { sim, seconds } = runToEnd({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "grownup", at: "pond" }],
    props: [{ prop: "balloon", at: "pond" }],
    beats: [{ actor: "hero", action: "pick_up", prop: "balloon" }],
  });
  assert.ok(sim.done && seconds < 15, `blocked pickup took ${seconds}s`);
  const hero = sim.actors.hero!, balloon = sim.props.balloon!;
  assert.ok(Math.hypot(hero.x - balloon.x, hero.z - balloon.z) > 2, "fixture must leave the balloon out of reach");
  assert.equal(balloon.holder, undefined);
  assert.equal(hero.reaching, undefined);
  assert.equal(hero.pose, "idle");
});

test("a blocked handoff keeps the object with its giver", () => {
  const { sim, seconds } = runToEnd({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "puppy", at: "pond" }, { actor: "grownup", at: "pond" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "give", prop: "balloon", target: "grownup" }],
  });
  assert.ok(sim.done && seconds < 15, `blocked handoff took ${seconds}s`);
  const hero = sim.actors.hero!, recipient = sim.actors.grownup!;
  assert.ok(Math.hypot(hero.x - recipient.x, hero.z - recipient.z) > 2, "fixture must leave the recipient out of reach");
  assert.equal(sim.props.balloon!.holder, "hero");
  assert.equal(recipient.pose, "idle");
  assert.equal(recipient.emotion, undefined);
});

test("pickup leaves a nearby object on the ground until the reach finishes", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "balloon", at: "path" }],
    beats: [{ actor: "hero", action: "pick_up", prop: "balloon" }],
  });
  let reachFrames = 0;
  for (let i = 0; i < 600 && !sim.done; i++) {
    sim.step(1 / 60);
    if (sim.actors.hero!.pose === "reach") {
      reachFrames += 1;
      assert.equal(sim.props.balloon!.holder, undefined, "ownership must not change before the hand reaches out");
    }
  }
  assert.ok(sim.done);
  assert.ok(reachFrames >= 29, `only reached for ${reachFrames} frames`);
  assert.equal(sim.props.balloon!.holder, "hero");
  assert.equal(sim.actors.hero!.reaching, undefined);
});

test("a reachable handoff transfers after the giver's reach and preserves one owner", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "give", prop: "balloon", target: "friend" }],
  });
  let reachFrames = 0;
  let receivedReachFrames = 0;
  for (let i = 0; i < 600 && !sim.done; i++) {
    sim.step(1 / 60);
    const holder = sim.props.balloon!.holder;
    assert.ok(holder === "hero" || holder === "friend", "a handoff must never lose the object");
    if (sim.actors.hero!.pose === "reach") {
      reachFrames += 1;
      assert.equal(holder, "hero");
      assert.equal(sim.actors.friend!.pose, "reach", "both characters must offer a hand before the transfer");
    }
    if (holder === "friend" && sim.actors.friend!.pose === "reach") receivedReachFrames += 1;
  }
  assert.ok(sim.done);
  assert.ok(reachFrames >= 29);
  assert.ok(receivedReachFrames >= 14, "the receiver must hold still while the prop crosses between hands");
  assert.equal(sim.props.balloon!.holder, "friend");
});

test("an object that moves out of reach during pickup is not teleported into the hand", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "ball", at: "path" }],
    beats: [{ actor: "hero", action: "pick_up", prop: "ball" }],
  });
  let moved = false;
  for (let i = 0; i < 600 && !sim.done; i++) {
    sim.step(1 / 60);
    if (!moved && sim.actors.hero!.pose === "reach") {
      sim.props.ball!.vx = 8;
      moved = true;
    }
  }
  assert.ok(sim.done && moved);
  assert.equal(sim.props.ball!.holder, undefined);
  assert.equal(sim.actors.hero!.reaching, undefined);
});

test("only one initial prop occupies a hand and extras stay nearby on the ground", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }, { prop: "apple", at: "hero" }, { prop: "book", at: "hero" }],
    beats: [],
  });
  sim.step(1 / 60);
  assert.equal(sim.props.balloon!.holder, "hero");
  assert.equal(Object.values(sim.props).filter((prop) => prop.holder === "hero").length, 1);
  const hero = sim.actors.hero!;
  for (const id of ["apple", "book"] as const) {
    const prop = sim.props[id]!;
    assert.equal(prop.holder, undefined);
    const d = Math.hypot(hero.x - prop.x, hero.z - prop.z);
    assert.ok(d >= RADIUS.hero + PROP_RADIUS[id] && d < 3, `${id} should be safely beside its intended holder`);
  }
});

test("a full picker keeps its own prop and cannot take a second one", () => {
  for (const source of ["path", "friend"] as const) {
    const { sim } = runToEnd({
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
      props: [{ prop: "apple", at: "hero" }, { prop: "balloon", at: source }],
      beats: [{ actor: "hero", action: "pick_up", prop: "balloon" }],
    });
    assert.ok(sim.done);
    assert.equal(sim.props.apple!.holder, "hero");
    assert.equal(sim.props.balloon!.holder, source === "friend" ? "friend" : undefined);
  }
});

test("a full recipient rejects a gift before it can be taken from anyone else", () => {
  for (const source of ["hero", "puppy"] as const) {
    const { sim } = runToEnd({
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }, { actor: "puppy", at: "path" }],
      props: [{ prop: "apple", at: "friend" }, { prop: "balloon", at: source }],
      beats: [{ actor: "hero", action: "give", prop: "balloon", target: "friend" }],
    });
    assert.ok(sim.done);
    assert.equal(sim.props.apple!.holder, "friend");
    assert.equal(sim.props.balloon!.holder, source);
  }
});

test("a character carrying a prop jumps instead of rolling over it", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "roll" }],
  });
  let jumped = false;
  for (let i = 0; i < 300 && !sim.done; i++) {
    sim.step(1 / 60);
    assert.notEqual(sim.actors.hero!.pose, "roll");
    jumped ||= sim.actors.hero!.pose === "jump";
    assert.equal(sim.props.balloon!.holder, "hero");
  }
  assert.ok(sim.done && jumped);
  assert.equal(sim.actors.hero!.pose, "idle");
});
