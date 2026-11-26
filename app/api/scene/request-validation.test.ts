import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { isSceneContinuation, isSceneRequest } from "./request-validation";
import type { SceneRequest } from "./contract";

const legacy: SceneRequest = { lesson: "kindness", language: "en", age: 5, wordsLearned: [], history: [] };
const request: SceneRequest = {
  ...legacy,
  opening: "balloon",
  history: [{ narration: "Momo holds the balloon.", choice: "Walk together" }],
  continuation: {
    world: {
      weather: "sunny",
      actors: [
        { actor: "hero", x: -0.5, z: 1, heading: 0.2, sitting: false },
        { actor: "friend", x: 0.5, z: 1, heading: -2.9, sitting: false, emotion: "happy" },
      ],
      props: [{ prop: "balloon", x: 0.5, z: 1, holder: "friend" }],
    },
    previousLines: [{ speaker: "hero", text: "Here you go!", to: "friend" }, { speaker: "friend", text: "Thanks!" }],
    previousBeats: [{ actor: "hero", action: "give", target: "friend", prop: "balloon", cue: 1 }],
  },
};

function malformedContinuations(): [string, unknown][] {
  const c = request.continuation!;
  const w = c.world;
  const a = w.actors[0];
  const p = w.props[0];
  const withWorld = (world: unknown) => ({ ...c, world });
  const withActor = (actor: unknown) => withWorld({ ...w, actors: [actor, w.actors[1]] });
  return [
    ["null continuation", null],
    ["unexpected continuation data", { ...c, extra: { arbitrary: "payload" } }],
    ["unknown weather", withWorld({ ...w, weather: "storm" })],
    ["duplicate actor", withWorld({ ...w, actors: [...w.actors, a] })],
    ["too many actors", withWorld({ ...w, actors: Array(7).fill(a) })],
    ["missing hero", withWorld({ ...w, actors: [w.actors[1]] })],
    ["unknown actor", withActor({ ...a, actor: "dragon" })],
    ["actor null coordinate", withActor({ ...a, x: null })],
    ["actor numeric string", withActor({ ...a, z: "1" })],
    ["actor nonfinite coordinate", withActor({ ...a, x: Infinity })],
    ["actor out of world bounds", withActor({ ...a, z: 101 })],
    ["nonfinite heading", withActor({ ...a, heading: NaN })],
    ["invalid posture", withActor({ ...a, sitting: "yes" })],
    ["invalid emotion", withActor({ ...a, emotion: "angry" })],
    ["duplicate prop", withWorld({ ...w, props: [p, p] })],
    ["too many props", withWorld({ ...w, props: Array(10).fill(p) })],
    ["unknown prop", withWorld({ ...w, props: [{ ...p, prop: "sword" }] })],
    ["prop nonfinite coordinate", withWorld({ ...w, props: [{ ...p, z: Infinity }] })],
    ["holder absent from world", withWorld({ ...w, props: [{ ...p, holder: "duck" }] })],
    ["two props in one hand", withWorld({ ...w, props: [p, { ...p, prop: "ball" }] })],
    ["too many lines", { ...c, previousLines: Array(5).fill(c.previousLines[0]) }],
    ["long dialogue", { ...c, previousLines: [{ speaker: "hero", text: "x".repeat(301) }] }],
    ["speaker absent from world", { ...c, previousLines: [{ speaker: "duck", text: "Hello" }] }],
    ["listener absent from world", { ...c, previousLines: [{ speaker: "hero", to: "duck", text: "Hello" }] }],
    ["too many beats", { ...c, previousBeats: Array(5).fill(c.previousBeats[0]) }],
    ["unknown action", { ...c, previousBeats: [{ actor: "hero", action: "fly" }] }],
    ["missing prop reference", { ...c, previousBeats: [{ actor: "hero", action: "pick_up", prop: "apple" }] }],
    ["missing actor reference", { ...c, previousBeats: [{ actor: "hero", action: "give", prop: "balloon", target: "duck" }] }],
    ["bad movement destination", { ...c, previousBeats: [{ actor: "hero", action: "walk_to", target: "castle" }] }],
    ["cue beyond previous lines", { ...c, previousBeats: [{ actor: "hero", action: "wave", cue: 3 }] }],
    ["descending cues", { ...c, previousBeats: [{ actor: "hero", action: "wave", cue: 2 }, { actor: "friend", action: "jump", cue: 1 }] }],
    ["unknown action payload", { ...c, previousBeats: [{ actor: "hero", action: "wave", instruction: "unbounded data" }] }],
  ];
}

test("legacy requests and finite continuations remain valid", () => {
  assert.ok(isSceneRequest(legacy));
  assert.ok(isSceneRequest(request));
  assert.ok(isSceneContinuation({
    ...request.continuation,
    world: { ...request.continuation!.world, props: [{ prop: "balloon", x: 0, z: 1 }] },
    previousLines: [],
    previousBeats: [{ actor: "hero", action: "look_around" }],
  }));
});

test("continuations reject malformed state, cross references, and excessive context", () => {
  for (const [name, continuation] of malformedContinuations()) {
    assert.equal(isSceneRequest({ ...request, continuation }), false, name);
  }
});

test("the scene route rejects malformed continuation before any provider call", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.KIMI_API_KEY;
  let calls = 0;
  process.env.KIMI_API_KEY = "test-only";
  globalThis.fetch = async () => { calls += 1; throw new Error("Invalid request must never reach the provider"); };
  try {
    for (const [name, continuation] of malformedContinuations()) {
      const response = await POST(new Request("https://story.test/api/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, continuation }),
      }));
      assert.equal(response.status, 400, name);
      assert.equal((await response.json()).error.code, "INVALID_REQUEST", name);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = oldKey;
  }
});

test("the scene route accepts both request versions without requiring network access", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.KIMI_API_KEY;
  process.env.KIMI_API_KEY = "";
  globalThis.fetch = async () => { throw new Error("No provider call expected without a key"); };
  try {
    for (const body of [legacy, request]) {
      const response = await POST(new Request("https://story.test/api/scene", { method: "POST", body: JSON.stringify(body) }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Scene-Mode"), "stub");
      assert.equal(typeof (await response.json()).narration, "string");
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = oldKey;
  }
});
