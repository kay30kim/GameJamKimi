import assert from "node:assert/strict";
import test from "node:test";
import { motionOf } from "./motion";
import { createSim, JUMP_SECONDS, NAP_SECONDS, ROLL_SECONDS } from "./sim";
import type { ActorState, Pose } from "./sim";

const actor = (pose: Pose, poseTime: number, travelled = 0): ActorState => ({
  id: "hero", x: 0, z: 0, heading: 0, pose, poseTime, travelled, sitting: false, emotionLeft: 0,
});

const samples = (seconds: number, step = 1 / 120) => Array.from({ length: Math.ceil(seconds / step) + 1 }, (_, i) => Math.min(i * step, seconds));

test("a hop crouches first, leaves the ground, and lands back on it", () => {
  const lifts = samples(JUMP_SECONDS).map((t) => motionOf(actor("jump", t), 0).lift);
  assert.equal(lifts[0], 0);
  assert.ok(Math.max(...lifts) > 0.5, "should get well off the ground");
  assert.ok(lifts.at(-1)! < 1e-6, "should end on the ground");
  assert.ok(motionOf(actor("jump", JUMP_SECONDS * 0.15), 0).squash < 0.9, "should crouch before take-off");
});

test("a roll turns over exactly once and never sinks into the ground", () => {
  for (const t of samples(ROLL_SECONDS)) assert.ok(motionOf(actor("roll", t), 0).lift >= 0);
  assert.equal(motionOf(actor("roll", 0), 0).flip, 0);
  assert.ok(Math.abs(motionOf(actor("roll", ROLL_SECONDS * 0.999), 0).flip - Math.PI * 2) < 1e-3);
  assert.ok(motionOf(actor("roll", ROLL_SECONDS * 0.5), 0).curl < 0.7, "should be tucked mid-roll");
  assert.ok(Math.abs(motionOf(actor("roll", ROLL_SECONDS * 0.999), 0).curl - 1) < 0.01, "should stand back up");
});

test("hops and rolls end where idle starts, so the body does not pop", () => {
  const idle = motionOf(actor("idle", 0), 0);
  for (const end of [motionOf(actor("jump", JUMP_SECONDS - 1e-4), 0), motionOf(actor("roll", ROLL_SECONDS - 1e-4), 0)]) {
    assert.ok(Math.abs(end.lift - idle.lift) < 0.01);
    assert.ok(Math.abs(end.squash - idle.squash) < 0.03);
    assert.ok(Math.abs(end.curl - idle.curl) < 0.01);
  }
});

test("walking moves smoothly with distance: no jumps between nearby steps", () => {
  let last = motionOf(actor("walk", 0, 0), 0);
  for (let d = 0.01; d < 3; d += 0.01) {
    const next = motionOf(actor("walk", 0, d), 0);
    assert.ok(Math.abs(next.legLeft - last.legLeft) < 0.06);
    assert.ok(Math.abs(next.lift - last.lift) < 0.01);
    last = next;
  }
});

test("a bunny's bound lands softly between hops", () => {
  let last = motionOf(actor("run", 0, 0), 0);
  for (let d = 0.01; d < 4; d += 0.01) {
    const next = motionOf(actor("run", 0, d), 0);
    assert.ok(Math.abs(next.lift - last.lift) < 0.02, `lift jumped at ${d.toFixed(2)} m`);
    last = next;
  }
});

test("roll carries the character forward and back to standing", () => {
  const sim = createSim({ weather: "sunny", cast: [{ actor: "hero", at: "path" }], props: [], beats: [{ actor: "hero", action: "roll" }] });
  const start = sim.actors.hero!.z;
  for (let t = 0; t < 5 && !sim.done; t += 1 / 60) sim.step(1 / 60);
  const hero = sim.actors.hero!;
  assert.ok(sim.done);
  assert.equal(hero.pose, "idle");
  assert.ok(Math.abs(hero.z - start - 1.2) < 0.1, `moved ${hero.z - start} m`);
});

test("walking records the distance covered", () => {
  const sim = createSim({ weather: "sunny", cast: [{ actor: "hero", at: "path" }], props: [], beats: [{ actor: "hero", action: "walk_to", target: "bench" }] });
  const hero = sim.actors.hero!;
  const [x0, z0] = [hero.x, hero.z];
  for (let t = 0; t < 10 && !sim.done; t += 1 / 60) sim.step(1 / 60);
  const moved = Math.hypot(hero.x - x0, hero.z - z0);
  assert.ok(moved > 1 && Math.abs(hero.travelled - moved) < 0.05, `travelled ${hero.travelled}, moved ${moved}`);
});

test("a nap lies down and gets back up", () => {
  assert.ok(Math.abs(motionOf(actor("nap", 0), 0).sway) < 1e-6);
  assert.ok(motionOf(actor("nap", NAP_SECONDS / 2), 0).sway > 1.2, "should be lying down mid-nap");
  assert.ok(Math.abs(motionOf(actor("nap", NAP_SECONDS), 0).sway) < 1e-3, "should be upright again");
});

test("the new actions all finish and return to idle", () => {
  const sim = createSim({
    weather: "sunset",
    cast: [{ actor: "kitten", at: "bench" }, { actor: "duck", at: "pond" }],
    props: [],
    beats: [
      { actor: "kitten", action: "dance" },
      { actor: "duck", action: "clap" },
      { actor: "kitten", action: "nap" },
      { actor: "duck", action: "look_around" },
    ],
  });
  for (let t = 0; t < 20 && !sim.done; t += 1 / 60) sim.step(1 / 60);
  assert.ok(sim.done);
  assert.equal(sim.actors.kitten!.pose, "idle");
  assert.equal(sim.actors.duck!.pose, "idle");
});
