import test from "node:test";
import assert from "node:assert/strict";
import { listeningFeedback, orderedChoices } from "./player-ui";

test("spoken choice order matches the reversed display without mutating the scene", () => {
  const scene = { narration: "odd", choices: ["help", "wait"] };
  assert.deepEqual(orderedChoices(scene), ["wait", "help"]);
  assert.deepEqual(scene.choices, ["help", "wait"]);
  assert.deepEqual(orderedChoices({ ...scene, narration: "even" }), ["help", "wait"]);
});

test("microphone failures explain a recovery rather than blaming pronunciation", () => {
  assert.match(listeningFeedback(new Error("Microphone access was blocked."), "ko"), /권한/);
  assert.match(listeningFeedback(new Error("Speech recognition couldn't connect."), "ko"), /인터넷/);
  assert.match(listeningFeedback(new Error("No microphone is available."), "en"), /find a microphone/);
  assert.match(listeningFeedback(new Error("Listening stopped."), "ko"), /잠시 멈췄/);
  assert.match(listeningFeedback(new Error("I didn't hear anything."), "en"), /couldn't hear/);
});
