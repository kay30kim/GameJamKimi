import assert from "node:assert/strict";
import test from "node:test";
import { audit, passes, SCENARIOS } from "./qa";

for (const { name, stage } of SCENARIOS) {
  test(`collision QA: ${name}`, () => {
    const result = audit(stage);
    assert.ok(passes(result), JSON.stringify(result, (_k, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v)));
  });
}

test("walking into the ball sends it rolling", () => {
  const scene = SCENARIOS.find(({ name }) => name === "Run through the ball")!;
  const { propMoved } = audit(scene.stage);
  assert.ok(propMoved > 0.5, `ball moved ${propMoved.toFixed(2)} m`);
});
