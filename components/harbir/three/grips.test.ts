import assert from "node:assert/strict";
import test from "node:test";
import { Group, Vector3 } from "three";
import { createSim } from "../../../lib/harbir/sim";
import type { PropId } from "../../../lib/world";
import { clearGripFloor, createGripTransform, getGrip, gripTransform, PALM, PROP_GRIP, registerGrip, removeGrip } from "./grips";

test("every prop keeps its contact point on the animated palm through turns, squashes and jumps", () => {
  const body = new Group(), lift = new Group(), model = new Group(), arm = new Group(), palm = new Group();
  body.add(lift); lift.add(model); model.add(arm); arm.add(palm);
  arm.position.set(0.3256, 1.03, 0);
  palm.position.set(0.07, -0.42, 0.025);
  const target = createGripTransform();
  const actualContact = new Vector3(), expectedContact = new Vector3();
  const up = new Vector3();
  for (const scale of [0.6, 0.74, 1]) {
    for (let step = 0; step < 90; step++) {
      const t = step / 15;
      body.position.set(t, 0, -t / 2);
      body.rotation.y = t;
      lift.position.y = 0.4 * Math.abs(Math.sin(t));
      lift.rotation.z = Math.sin(t) * 0.2;
      model.scale.set(scale, scale * (0.85 + 0.2 * Math.sin(t)), scale);
      arm.rotation.set(-1.05, 0, 0.3);
      for (const id of Object.keys(PROP_GRIP) as PropId[]) {
        gripTransform({ body, palm }, id, target);
        actualContact.fromArray(PROP_GRIP[id]).applyQuaternion(target.rotation).add(target.position);
        palm.getWorldPosition(expectedContact);
        assert.ok(actualContact.distanceTo(expectedContact) < 1e-9, `${id} lost contact at ${t}`);
        up.set(0, 1, 0).applyQuaternion(target.rotation);
        assert.ok(up.distanceTo(new Vector3(0, 1, 0)) < 1e-9, `${id} tipped with the arm`);
      }
    }
  }
});

test("a handoff between differently scaled models cannot resize the prop", () => {
  const target = createGripTransform();
  const prop = new Group();
  const pointA = new Vector3(), pointB = new Vector3();
  for (const scale of [0.6, 0.95, 0.74]) {
    const body = new Group(), model = new Group(), palm = new Group();
    body.add(model); model.add(palm);
    model.scale.setScalar(scale);
    palm.position.set(0.4, 0.8, 0.3);
    gripTransform({ body, palm }, "ball", target);
    prop.position.copy(target.position);
    prop.quaternion.copy(target.rotation);
    prop.updateMatrixWorld(true);
    prop.localToWorld(pointA.set(-0.22, 0.22, 0));
    prop.localToWorld(pointB.set(0.22, 0.22, 0));
    assert.ok(Math.abs(pointA.distanceTo(pointB) - 0.44) < 1e-9);
  }
});

test("root Alice's carried ball sits outside the head instead of floating in her face", () => {
  const body = new Group(), model = new Group(), arm = new Group(), palm = new Group();
  body.add(model); model.scale.setScalar(0.6); model.add(arm); arm.add(palm);
  arm.position.set(0.37 * 0.88, 0.83 + 0.2, 0);
  arm.rotation.set(-1.05, 0, 0.3);
  palm.position.set(0.07, -0.42, 0.025);
  const target = gripTransform({ body, palm }, "ball", createGripTransform());
  const ballCenter = new Vector3(0, 0.22, 0).applyQuaternion(target.rotation).add(target.position);
  const headCenter = new Vector3(0, 1.68 * 0.6, 0);
  // A sphere enclosing the head is stricter than its actual ellipsoid.
  assert.ok(ballCenter.distanceTo(headCenter) > 0.55 * 0.6 + 0.22);
  assert.ok(ballCenter.y - 0.22 > 0, "carried ball must clear the floor");
});

test("grip registration is isolated across scene replay and ignores stale cleanup", () => {
  const stage = { weather: "sunny", cast: [{ actor: "hero", at: "path" }], props: [], beats: [] } as const;
  const first = createSim({ ...stage, cast: [...stage.cast], props: [], beats: [] });
  const replay = createSim({ ...stage, cast: [...stage.cast], props: [], beats: [] });
  const body = new Group(), oldPalm = new Group(), currentPalm = new Group();
  registerGrip(first, "hero", oldPalm, body);
  assert.equal(getGrip(replay, "hero"), undefined);
  registerGrip(first, "hero", currentPalm, body);
  removeGrip(first, "hero", oldPalm);
  assert.equal(getGrip(first, "hero")?.palm, currentPalm);
  removeGrip(first, "hero", currentPalm);
  assert.equal(getGrip(first, "hero"), undefined);
});

test("small animals keep a carried ball above the floor while standing, sitting and crouching", () => {
  for (const id of ["kitten", "puppy", "duck"] as const) {
    for (const posture of ["standing", "sitting", "crouching"] as const) {
      const body = new Group(), lift = new Group(), squash = new Group(), lean = new Group(), model = new Group(), arm = new Group(), palm = new Group();
      body.add(lift); lift.add(squash); squash.add(lean); lean.add(model); model.add(arm); arm.add(palm);
      model.scale.setScalar(id === "puppy" ? 0.9 : 0.95);
      arm.position.set(...(id === "kitten" ? [0.13, 0.3, 0.2] : id === "puppy" ? [0.16, 0.32, 0.22] : [0.28, 0.52, -0.02]) as [number, number, number]);
      arm.rotation.set(-1.05, 0, 0.3);
      palm.position.fromArray(PALM[id]);
      if (posture === "sitting") { lift.position.y = -0.12; squash.scale.y = 0.85; }
      if (posture === "crouching") { squash.scale.y = 0.76; lean.rotation.x = 0.14; }
      clearGripFloor(palm, arm, "ball", new Vector3());
      const target = gripTransform({ body, palm }, "ball", createGripTransform());
      assert.ok(target.position.y >= 0.024, `${id} dragged the ball while ${posture}: ${target.position.y}`);
      const contact = new Vector3().fromArray(PROP_GRIP.ball).applyQuaternion(target.rotation).add(target.position);
      assert.ok(contact.distanceTo(palm.getWorldPosition(new Vector3())) < 1e-9);
    }
  }
});
