import assert from "node:assert/strict";
import test from "node:test";
import { pushOut } from "./obstacles";
import { createSim, PROP_RADIUS, RADIUS, snapshotSim, standingPoint } from "./sim";
import type { Stage, WorldSnapshot } from "../world";

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

test("a zero beat limit waits for dialogue while idle motion and prop physics continue", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "ball", at: "path" }],
    beats: [{ actor: "hero", action: "walk_to", target: "tree" }],
  });
  const hero = sim.actors.hero!, ball = sim.props.ball!;
  const start = [hero.x, hero.z], ballX = ball.x;
  ball.vx = 1;
  for (let i = 0; i < 300; i++) sim.step(1 / 60, 0);
  assert.deepEqual([hero.x, hero.z], start);
  assert.equal(hero.pose, "idle");
  assert.ok(hero.poseTime > 4, "idle breathing must keep advancing while a cue is pending");
  assert.ok(ball.x > ballX, "ordinary physics must keep running while actions are gated");
  assert.equal(sim.completedBeats, 0);
  assert.equal(sim.done, false);
});

test("raising the beat limit resumes the same ownership and positions without overrunning a cue", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "path" }],
    beats: [
      { actor: "hero", action: "pick_up", prop: "balloon" },
      { actor: "hero", action: "give", prop: "balloon", target: "friend" },
      { actor: "friend", action: "walk_to", target: "tree" },
    ],
  });
  for (let i = 0; i < 1200 && sim.completedBeats < 1; i++) sim.step(1 / 60, 1);
  assert.equal(sim.completedBeats, 1);
  assert.equal(sim.props.balloon!.holder, "hero");
  const hero = sim.actors.hero!, friend = sim.actors.friend!;
  const afterPickup = [hero.x, hero.z, friend.x, friend.z];
  for (let i = 0; i < 180; i++) sim.step(1 / 60, 1);
  assert.deepEqual([hero.x, hero.z, friend.x, friend.z], afterPickup);
  assert.equal(sim.props.balloon!.holder, "hero");
  assert.equal(sim.completedBeats, 1);
  assert.equal(sim.done, false);

  for (let i = 0; i < 1200 && sim.completedBeats < 2; i++) sim.step(1 / 60, 2);
  assert.equal(sim.completedBeats, 2);
  assert.equal(sim.props.balloon!.holder, "friend");
  const afterHandoff = [friend.x, friend.z];
  for (let i = 0; i < 180; i++) sim.step(1 / 60, 2);
  assert.deepEqual([friend.x, friend.z], afterHandoff, "the third beat must not begin yet");
  assert.equal(sim.completedBeats, 2);
  assert.equal(sim.done, false);

  for (let i = 0; i < 1200 && !sim.done; i++) sim.step(1 / 60, 3);
  assert.equal(sim.completedBeats, 3);
  assert.equal(sim.done, true);
  assert.equal(sim.props.balloon!.holder, "friend");
  assert.ok(Math.hypot(friend.x - afterHandoff[0], friend.z - afterHandoff[1]) > 2);
});

test("a beat is counted on completion and lowering its limit never interrupts it", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [],
    beats: [{ actor: "hero", action: "wave" }, { actor: "hero", action: "walk_to", target: "tree" }],
  });
  for (let i = 0; i < 120 && sim.actors.hero!.pose !== "wave"; i++) sim.step(1 / 60, 1);
  assert.equal(sim.actors.hero!.pose, "wave");
  assert.equal(sim.completedBeats, 0, "starting a pose is not completing a beat");
  for (let i = 0; i < 240; i++) sim.step(1 / 60, 0);
  assert.equal(sim.actors.hero!.pose, "idle");
  assert.deepEqual([sim.actors.hero!.x, sim.actors.hero!.z], [0, 0]);
  assert.equal(sim.completedBeats, 1);
  assert.equal(sim.done, false);
});

test("empty stages finish immediately and missing actors still consume only permitted beat slots", () => {
  const empty = createSim({ weather: "sunny", cast: [], props: [], beats: [] });
  assert.equal(empty.completedBeats, 0);
  assert.equal(empty.done, true);
  assert.equal(empty.finish(), true);

  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [],
    beats: [{ actor: "friend", action: "jump" }, { actor: "duck", action: "wave" }],
  });
  for (let i = 0; i < 120; i++) sim.step(1 / 60, 0);
  assert.equal(sim.completedBeats, 0);
  sim.step(1 / 60, 1);
  assert.equal(sim.completedBeats, 1);
  assert.equal(sim.done, false);
  sim.step(1 / 60, 2);
  assert.equal(sim.completedBeats, 2);
  assert.equal(sim.done, true);
});

test("finish skips from the current timeline using the same final ownership and movement rules", () => {
  const stage: Stage = {
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "path" }],
    beats: [
      { actor: "hero", action: "pick_up", prop: "balloon" },
      { actor: "hero", action: "give", prop: "balloon", target: "friend" },
      { actor: "friend", action: "walk_to", target: "tree" },
    ],
  };
  const skipped = createSim(stage), played = createSim(stage);
  for (let i = 0; i < 1200 && skipped.completedBeats < 1; i++) {
    skipped.step(1 / 30, 1);
    played.step(1 / 30, 1);
  }
  assert.equal(skipped.props.balloon!.holder, "hero");
  assert.equal(skipped.finish(), true);
  for (let i = 0; i < 3600 && !played.done; i++) played.step(1 / 30);
  assert.ok(played.done && skipped.done);
  assert.equal(skipped.completedBeats, stage.beats.length);
  assert.deepEqual(skipped.actors, played.actors);
  assert.deepEqual(skipped.props, played.props);
  assert.equal(skipped.props.balloon!.holder, "friend");
  const end = JSON.stringify({ actors: skipped.actors, props: skipped.props });
  assert.equal(skipped.finish(), true);
  assert.equal(JSON.stringify({ actors: skipped.actors, props: skipped.props }), end, "finishing twice must not replay actions");
});

test("finish preserves a failed interaction instead of forcing a remote transfer", () => {
  const sim = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "puppy", at: "pond" }, { actor: "grownup", at: "pond" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "give", prop: "balloon", target: "grownup" }],
  });
  sim.step(1 / 60, 0);
  assert.equal(sim.finish(), true);
  assert.equal(sim.completedBeats, 1);
  assert.equal(sim.props.balloon!.holder, "hero");
});

test("a choice keeps a delivered balloon with its recipient despite conflicting scene starts", () => {
  const first = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [
      { actor: "hero", action: "give", prop: "balloon", target: "friend" },
      { actor: "friend", action: "walk_to", target: "tree" },
    ],
  });
  assert.equal(first.finish(), true);
  assert.equal(first.props.balloon!.holder, "friend");
  const previous = snapshotSim(first, "sunny");
  const next = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "friend", at: "playground" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "wave", target: "friend" }],
  }, previous);
  assert.deepEqual(snapshotSim(next, "sunny"), previous, "new scene setup must not move characters or undo the gift");
  assert.equal(next.completedBeats, 0, "only the new action timeline restarts");
  assert.equal(next.finish(), true);
  assert.equal(next.props.balloon!.holder, "friend");
  assert.deepEqual([next.actors.friend!.x, next.actors.friend!.z], [first.actors.friend!.x, first.actors.friend!.z]);
});

test("restoring a world preserves exact coordinates, headings, sitting, emotions and prop state", () => {
  const previous: WorldSnapshot = {
    weather: "rainy",
    actors: [
      { actor: "hero", x: 2.123456789, z: 1.234567891, heading: -1.23456789, sitting: true, emotion: "sad" },
      { actor: "friend", x: -3.456789123, z: -0.789123456, heading: 2.345678912, sitting: false },
    ],
    props: [
      { prop: "ball", x: 1.111111119, z: 2.222222229 },
      { prop: "balloon", x: -3.456789123, z: -0.789123456, holder: "friend" },
    ],
  };
  const next = createSim({
    weather: "rainy",
    cast: [{ actor: "hero", at: "home" }, { actor: "friend", at: "pond" }],
    props: [{ prop: "ball", at: "hero" }, { prop: "balloon", at: "playground" }],
    beats: [],
  }, previous);
  assert.deepEqual(snapshotSim(next, "rainy"), previous);
  assert.equal(next.actors.hero!.sitting, true);
  assert.equal(next.actors.hero!.pose, "idle", "seated idle must not restart the sit-down animation");
  assert.equal(next.actors.hero!.emotion, "sad");
  assert.equal(next.props.ball!.holder, undefined, "a grounded object cannot be reassigned by a later stage declaration");
});

test("omitting existing cast and props from a new scene does not remove them", () => {
  const first = createSim({
    weather: "sunset",
    cast: [{ actor: "hero", at: "path" }, { actor: "duck", at: "pond" }],
    props: [{ prop: "balloon", at: "duck" }, { prop: "flower", at: "garden" }],
    beats: [],
  });
  const previous = snapshotSim(first, "sunset");
  const next = createSim({ weather: "sunset", cast: [], props: [], beats: [] }, previous);
  assert.deepEqual(snapshotSim(next, "sunset"), previous);
  assert.equal(next.props.balloon!.holder, "duck");
  assert.equal(next.done, true);
});

test("new entities join the retained world without resetting props or overfilling hands", () => {
  const first = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [],
  });
  const previous = snapshotSim(first, "sunny");
  const next = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }, { actor: "friend", at: "path" }],
    props: [
      { prop: "balloon", at: "friend" },
      { prop: "apple", at: "hero" },
      { prop: "book", at: "friend" },
      { prop: "flower", at: "garden" },
    ],
    beats: [],
  }, previous);
  const hero = next.actors.hero!, friend = next.actors.friend!;
  assert.deepEqual([hero.x, hero.z], [0, 0]);
  assert.ok(Math.hypot(hero.x - friend.x, hero.z - friend.z) >= RADIUS.hero + RADIUS.friend);
  assert.equal(next.props.balloon!.holder, "hero");
  assert.equal(next.props.apple!.holder, undefined);
  assert.equal(next.props.book!.holder, "friend");
  assert.equal(next.props.flower!.holder, undefined);
  assert.equal(Object.values(next.props).filter(({ holder }) => holder === "hero").length, 1);
  next.step(1 / 60, 0);
  assert.deepEqual([hero.x, hero.z], [0, 0], "the newcomer must not shove an existing actor on the first frame");
});

test("snapshots are detached from source and restored simulations, and replay keeps the same initial world", () => {
  const first = createSim({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [],
  });
  const initial = snapshotSim(first, "sunny");
  const saved = JSON.stringify(initial);
  first.actors.hero!.x = 100;
  first.props.balloon!.holder = "friend";
  assert.equal(JSON.stringify(initial), saved, "later source mutations cannot rewrite a saved snapshot");
  initial.actors.forEach(Object.freeze);
  initial.props.forEach(Object.freeze);
  Object.freeze(initial.actors);
  Object.freeze(initial.props);
  Object.freeze(initial);

  const stage: Stage = {
    weather: "sunny",
    cast: [{ actor: "hero", at: "home" }],
    props: [],
    beats: [
      { actor: "hero", action: "give", prop: "balloon", target: "friend" },
      { actor: "friend", action: "walk_to", target: "tree" },
    ],
  };
  const played = createSim(stage, initial);
  assert.equal(played.finish(), true);
  const replay = createSim(stage, initial);
  assert.equal(replay.props.balloon!.holder, "hero");
  assert.equal(replay.finish(), true);
  assert.deepEqual(snapshotSim(replay, "sunny"), snapshotSim(played, "sunny"));
  assert.equal(JSON.stringify(initial), saved, "playing or replaying must never mutate the initial snapshot");

  const detached = snapshotSim(played, "sunset");
  const actualX = played.actors.hero!.x;
  detached.actors.find(({ actor }) => actor === "hero")!.x += 20;
  detached.props.find(({ prop }) => prop === "balloon")!.holder = "hero";
  assert.equal(detached.weather, "sunset");
  assert.equal(played.actors.hero!.x, actualX);
  assert.equal(played.props.balloon!.holder, "friend");
});

test("an undefined previous snapshot retains the original cold-start behavior", () => {
  const stage: Stage = {
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "give", prop: "balloon", target: "friend" }],
  };
  const original = createSim(stage), optional = createSim(stage, undefined);
  assert.deepEqual(snapshotSim(optional, "sunny"), snapshotSim(original, "sunny"));
  assert.equal(original.finish(), true);
  assert.equal(optional.finish(), true);
  assert.deepEqual(snapshotSim(optional, "sunny"), snapshotSim(original, "sunny"));
});
