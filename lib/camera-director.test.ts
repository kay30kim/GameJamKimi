import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA_CAST, needsCameraCut, planCamera, wrapCameraAngle } from "./camera-director";
import type { CameraInput, CameraShot, CameraSubjects } from "./camera-director";
import { createSim } from "./harbir/sim";
import type { ActorState, Sim } from "./harbir/sim";
import { ACTORS } from "./world";
import type { ActorId } from "./world";

const ids = Object.keys(ACTORS) as ActorId[];

function simulation(cast: ActorId[] = ["hero", "friend"]): Sim {
  return createSim({ weather: "sunny", cast: cast.map((actor) => ({ actor, at: "path" })), props: [], beats: [] });
}

function input(sim = simulation(), overrides: Partial<CameraInput> = {}): CameraInput {
  return { sim, subjects: {}, line: { speaker: "hero", text: "Hello." }, aspect: 16 / 9,
    elapsed: 0, shotIndex: 0, overview: false, reducedMotion: false, ...overrides };
}

function shot(value: CameraInput): CameraShot {
  const result = planCamera(value);
  assert.ok(result, "a populated scene must have a shot");
  return result;
}

function frontAngle(value: CameraShot, actor: ActorState, heading: number): number {
  return Math.abs(wrapCameraAngle(Math.atan2(value.position[0] - actor.x, value.position[2] - actor.z) - heading));
}

function horizontalDistance(value: CameraShot): number {
  return Math.hypot(value.position[0] - value.target[0], value.position[2] - value.target[2]);
}

/** Matches the stage's PerspectiveCamera and optical-center shift, not a hand-written projection. */
function cameraFor(value: CameraShot, width: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(value.fov, width / height, 0.1, 130);
  camera.position.fromArray(value.position);
  camera.lookAt(new Vector3(...value.target));
  camera.setViewOffset(width, height, 0, height * (0.5 - value.centerY), width, height);
  camera.updateMatrixWorld(true);
  return camera;
}

function screenPoint(camera: PerspectiveCamera, x: number, y: number, z: number) {
  const point = new Vector3(x, y, z).project(camera);
  return { x: (point.x + 1) / 2, y: (1 - point.y) / 2, depth: point.z };
}

for (const id of ids) {
  test(`${id}: every heading keeps the camera in front of the rendered face`, () => {
    const sim = simulation([id]);
    const actor = sim.actors[id]!;
    actor.x = 1.2;
    actor.z = -0.2;
    for (let degrees = -360; degrees <= 360; degrees += 15) {
      const heading = degrees * Math.PI / 180;
      // The body can still be turning, or spinning, while simulation heading already changed.
      actor.heading = heading + Math.PI;
      const subjects: CameraSubjects = { [id]: { heading, lift: 0.2 } };
      for (const aspect of [0.48, 16 / 9]) {
        const value = shot(input(sim, { subjects, aspect, line: { speaker: id, text: "Hello." } }));
        assert.equal(value.kind, "closeup");
        assert.ok(frontAngle(value, actor, heading) <= 0.86, `${degrees} degrees, aspect ${aspect}`);
        assert.equal(value.heading, heading, "rendered heading takes precedence over simulation heading");
      }
    }
  });
}

test("planning does not turn the cast, move props, or mutate rendered pose data", () => {
  const sim = simulation();
  sim.actors.hero!.facing = "friend";
  sim.props.balloon = { id: "balloon", x: 0.2, z: 0.3, holder: "friend", vx: 0, vz: 0 };
  const subjects: CameraSubjects = { hero: { heading: 2.4, lift: 0.35 } };
  const before = structuredClone({ actors: sim.actors, props: sim.props, done: sim.done, completedBeats: sim.completedBeats, subjects });
  for (const elapsed of [0, 2, 7, 60]) {
    shot(input(sim, { subjects, elapsed, line: { speaker: "hero", to: "friend", text: "Thank you." } }));
  }
  assert.deepEqual({ actors: sim.actors, props: sim.props, done: sim.done, completedBeats: sim.completedBeats, subjects }, before);
});

test("an idle listener does not turn every dialogue line into a distant pair shot", () => {
  const sim = simulation();
  const solo = shot(input(sim));
  const addressed = shot(input(sim, { line: { speaker: "hero", to: "friend", text: "Hello, Momo." } }));
  assert.equal(addressed.kind, "closeup");
  assert.deepEqual(addressed.position, solo.position);
  assert.deepEqual(addressed.target, solo.target);
});

test("reach and handoff show the interaction while walking gets a tracking shot", () => {
  const sim = simulation();
  const line = { speaker: "hero" as const, to: "friend" as const, text: "Here you go." };
  const close = shot(input(sim, { line }));
  sim.actors.hero!.pose = "reach";
  const handoff = shot(input(sim, { line }));
  assert.equal(handoff.kind, "interaction");
  assert.ok(horizontalDistance(handoff) > horizontalDistance(close), "both bodies need room for the handoff");
  sim.actors.hero!.pose = "idle";
  sim.actors.friend!.pose = "reach";
  assert.equal(shot(input(sim, { line })).kind, "interaction", "the receiving hand also keeps the interaction visible");
  sim.actors.friend!.pose = "idle";
  for (const pose of ["walk", "run"] as const) {
    sim.actors.hero!.pose = pose;
    assert.equal(shot(input(sim, { line })).kind, "tracking");
  }
});

test("narration follows an active actor while overview still establishes the whole cast", () => {
  const sim = simulation(["hero", "friend", "duck"]);
  Object.assign(sim.actors.hero!, { x: -4, z: 0, pose: "walk" });
  Object.assign(sim.actors.friend!, { x: -3, z: 0 });
  Object.assign(sim.actors.duck!, { x: 8, z: 0 });
  const active = shot(input(sim, { line: null }));
  const overview = shot(input(sim, { line: null, overview: true }));
  assert.equal(active.kind, "tracking");
  assert.equal(overview.kind, "wide");
  assert.ok(Math.abs(active.target[0] - sim.actors.hero!.x) < 1);
  assert.ok(horizontalDistance(overview) > horizontalDistance(active), "overview includes the distant cast member");
  sim.actors.hero!.pose = "idle";
  const narration = shot(input(sim, { line: null }));
  assert.equal(narration.kind, "wide");
  assert.notDeepEqual(narration.target, active.target);
});

test("dialogue stays near eye level rather than looking down from above", () => {
  for (const id of ids) {
    const sim = simulation([id]);
    const value = shot(input(sim, { line: { speaker: id, text: "Hello." } }));
    const elevation = Math.atan2(value.position[1] - value.target[1], horizontalDistance(value));
    assert.ok(elevation >= 0 && elevation < 0.08, `${id} has excessive camera elevation ${elevation}`);
  }
});

test("silent acrobatics get an action shot instead of spinning the camera around a face", () => {
  const sim = simulation();
  for (const pose of ["roll", "celebrate"] as const) {
    sim.actors.hero!.pose = pose;
    const base = input(sim);
    const first = shot({ ...base, subjects: { hero: { heading: 0, lift: 0 } } });
    const spun = shot({ ...base, subjects: { hero: { heading: Math.PI, lift: 0 } } });
    assert.equal(first.kind, "tracking");
    assert.equal(first.speaker, undefined);
    assert.deepEqual(spun, first);
  }
});

test("reduced motion is invariant to elapsed time for closeup, action, and overview", () => {
  const sim = simulation();
  for (const mode of ["closeup", "action", "overview"] as const) {
    sim.actors.hero!.pose = mode === "action" ? "walk" : "idle";
    const base = input(sim, { reducedMotion: true, line: mode === "closeup" ? { speaker: "hero", text: "Hello." } : null, overview: mode === "overview" });
    const first = shot(base);
    for (const elapsed of [0.5, 3, 7, 60]) assert.deepEqual(shot({ ...base, elapsed }), first);
  }
});

test("the small dolly settles after seven seconds instead of looping during long speech", () => {
  const base = input(simulation(["hero"]));
  const start = shot(base);
  const end = shot({ ...base, elapsed: 7 });
  const travel = new Vector3(...start.position).distanceTo(new Vector3(...end.position));
  assert.ok(travel > 0, "ordinary playback may make a small intentional dolly");
  assert.ok(travel / horizontalDistance(start) < 0.08, "a line must not produce a large zoom");
  assert.deepEqual(shot({ ...base, elapsed: 14 }), end);
  assert.deepEqual(shot({ ...base, elapsed: 120 }), end);
});

for (const id of ids) {
  test(`${id}: actual portrait projection keeps face and head top above a tall dialogue panel`, () => {
    const sim = simulation([id]);
    const actor = sim.actors[id]!;
    const framing = CAMERA_CAST[id];
    const frame = { top: 0.1, bottom: 0.6 };
    for (const [width, height] of [[390, 844], [320, 900], [768, 1024]]) {
      for (const lift of [-0.2, 0, 0.6]) {
        const value = shot(input(sim, { aspect: width / height, frame, elapsed: 7,
          subjects: { [id]: { heading: Math.PI * 0.7, lift } }, line: { speaker: id, text: "Hello." } }));
        const camera = cameraFor(value, width, height);
        for (const [name, y] of [["face", framing.head + lift], ["head top", framing.top + lift]] as const) {
          const point = screenPoint(camera, actor.x, y, actor.z);
          assert.ok(point.depth > -1 && point.depth < 1, `${name} is outside clipping planes`);
          assert.ok(point.x > 0.05 && point.x < 0.95, `${id} ${name} is outside horizontal frame`);
          assert.ok(point.y > frame.top && point.y < 1 - frame.bottom,
            `${id} ${name} at y=${point.y.toFixed(4)} is outside ${frame.top}..${1 - frame.bottom} (${width}x${height}, lift ${lift})`);
        }
      }
    }
  });
}

test("camera cuts when a new speaker would otherwise be seen from behind", () => {
  const sim = simulation(["hero"]);
  const actor = sim.actors.hero!;
  const value = shot(input(sim, { subjects: { hero: { heading: Math.PI - 0.05, lift: 0 } } }));
  const positionAt = (angle: number): [number, number, number] => [actor.x + Math.sin(angle) * 5, 1.5, actor.z + Math.cos(angle) * 5];
  assert.equal(needsCameraCut(value.position, value), false);
  assert.equal(needsCameraCut(positionAt(value.heading! + 0.5), value), false);
  assert.equal(needsCameraCut(positionAt(value.heading! + 0.96), value), true);
  assert.equal(needsCameraCut(positionAt(value.heading! + Math.PI), value), true);
  assert.equal(needsCameraCut(positionAt(-Math.PI + 0.05), value), false, "the -pi/pi seam is not a reverse shot");
  assert.equal(needsCameraCut(positionAt(2), shot(input(sim, { line: null }))), false);
});

test("the camera picks the clear side when another actor blocks its preferred view ray", () => {
  const sim = simulation(["hero"]);
  Object.assign(sim.actors.hero!, { x: 20, z: 20 });
  const clear = shot(input(sim));
  const hero = sim.actors.hero!;
  const preferredAngle = Math.atan2(clear.position[0] - hero.x, clear.position[2] - hero.z);
  const other = simulation(["grownup"]).actors.grownup!;
  Object.assign(other, { x: hero.x + Math.sin(preferredAngle) * 1.4, z: hero.z + Math.cos(preferredAngle) * 1.4 });
  sim.actors.grownup = other;
  const adjusted = shot(input(sim));
  const rayClearance = (value: CameraShot) => {
    const start = new Vector3(hero.x, CAMERA_CAST.hero.head, hero.z);
    const end = new Vector3(...value.position);
    const point = new Vector3(other.x, CAMERA_CAST.hero.head, other.z);
    const direction = end.clone().sub(start);
    const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(direction) / direction.lengthSq()));
    return start.addScaledVector(direction, t).distanceTo(point);
  };
  assert.ok(rayClearance(clear) < 0.2, "fixture must obstruct the initial view");
  assert.ok(rayClearance(adjusted) > 0.48, "chosen ray should clear the blocking actor");
  assert.ok(frontAngle(adjusted, hero, 0) <= 0.86, "avoidance must still show the front of the face");
});

test("empty cast has no shot", () => {
  assert.equal(planCamera(input(simulation([]))), null);
});

test("resizing through very narrow, zero, or unmeasured canvas aspects keeps a finite shot", () => {
  for (const aspect of [0, 0.01, 0.35, 0.85, 1, 3, 50, Infinity, NaN]) {
    const value = shot(input(undefined, { aspect }));
    for (const n of [...value.position, ...value.target, value.fov, value.centerY]) {
      assert.ok(Number.isFinite(n), `aspect ${aspect} produced a non-finite camera value`);
    }
  }
});
