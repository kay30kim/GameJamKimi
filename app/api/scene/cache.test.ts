import assert from "node:assert/strict";
import test from "node:test";
import { createCachedSceneGenerator, sceneCacheKey } from "./cache";
import type { SceneRequest, SceneResponse } from "./contract";
import type { generateScene } from "./engine";

const request: SceneRequest = {
  lesson: "kindness", language: "ko", age: 5, opening: "balloon", wordsLearned: [],
  history: [{ narration: "친구가 기다려요.", choice: "도와줄래요" }],
  continuation: {
    world: {
      weather: "sunny",
      actors: [
        { actor: "hero", x: 0, z: 1, heading: 0, sitting: false, emotion: "happy" },
        { actor: "friend", x: 1, z: 1, heading: 0, sitting: false },
      ],
      props: [{ prop: "balloon", x: 0, z: 1, holder: "hero" }],
    },
    previousLines: [{ speaker: "hero", text: "도와줄까?", to: "friend", emotion: "happy" }],
    previousBeats: [{ actor: "hero", action: "wave", target: "friend", cue: 1 }],
  },
};
const scene: SceneResponse = {
  narration: "앨리스가 친구를 도와줘요.",
  lines: [{ speaker: "friend", text: "고마워!", emotion: "happy", to: "hero" }],
  newWords: [{ word: "고마워", meaning: "Thank you" }],
  choices: ["함께 걸어요", "잠깐 쉬어요"], lessonComplete: false,
  stage: {
    weather: "sunny", cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }], beats: [{ actor: "friend", action: "wave", target: "hero", cue: 1 }],
  },
};
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test("cache identity separates every learning setting, selected branch and exact world state", () => {
  const mutations: ((value: SceneRequest) => void)[] = [
    (v) => { v.lesson = "empathy"; }, (v) => { v.language = "en"; }, (v) => { v.age = 6; },
    (v) => { v.opening = "thirsty_garden"; }, (v) => { v.wordsLearned.push("고마워"); },
    (v) => { v.history[0].choice = "놀러 갈래요"; }, (v) => { v.history[0].narration = "다른 친구예요."; },
    (v) => { v.continuation!.world.weather = "rainy"; },
    (v) => { v.continuation!.world.actors[0].x += 0.0001; },
    (v) => { v.continuation!.world.actors[0].heading += 0.001; },
    (v) => { v.continuation!.world.actors[0].sitting = true; },
    (v) => { v.continuation!.world.actors[0].emotion = "sad"; },
    (v) => { v.continuation!.world.props[0].holder = "friend"; },
    (v) => { v.continuation!.world.props[0].z += 0.001; },
    (v) => { v.continuation!.previousLines[0].text = "같이 놀까?"; },
    (v) => { v.continuation!.previousBeats = [{ actor: "hero", action: "jump", cue: 1 }]; },
    (v) => { delete v.continuation; },
  ];
  const baseline = sceneCacheKey(request, "model-one");
  for (const mutate of mutations) {
    const changed = structuredClone(request);
    mutate(changed);
    assert.notEqual(sceneCacheKey(changed, "model-one"), baseline);
  }
  assert.notEqual(sceneCacheKey(request, "model-two"), baseline);
});

test("cache identity ignores JSON property order and never exposes custom lesson text in a path", () => {
  const reversed = JSON.parse(JSON.stringify(request, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value)) as SceneRequest;
  assert.equal(sceneCacheKey(reversed, "model"), sceneCacheKey(request, "model"));
  assert.match(sceneCacheKey({ ...request, lesson: "우리 가족의 비공개 주제" }), /^[a-f0-9]{64}$/);
});

function harness(generate?: typeof generateScene) {
  const stored = new Map<string, Uint8Array>();
  const calls = { read: 0, write: 0, generate: 0 };
  let model = "test-model";
  const run = createCachedSceneGenerator({
    model: () => model,
    read: async (namespace, key) => { assert.equal(namespace, "scene"); calls.read++; return stored.get(key) ?? null; },
    write: async (namespace, key, value, contentType) => {
      assert.equal(namespace, "scene"); assert.equal(contentType, "application/json");
      calls.write++; stored.set(key, value); return true;
    },
    generate: async (...args) => {
      calls.generate++;
      assert.equal(args[1]?.model, model);
      return generate ? generate(...args) : { scene: structuredClone(scene), mode: "kimi" };
    },
  });
  return { run, stored, calls, model: (next: string) => { model = next; } };
}

test("a validated generated scene is reused without another model request", async () => {
  const h = harness();
  const first = await h.run(request);
  assert.equal(first.cache, "miss");
  assert.equal(first.mode, "kimi");
  const next = await h.run(structuredClone(request));
  assert.equal(next.cache, "hit");
  assert.deepEqual(next.scene, scene);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.write, 1);
  h.model("changed-model");
  assert.equal((await h.run(request)).cache, "miss");
  assert.equal(h.calls.generate, 2);
});

for (const mode of ["stub", "fallback", "limit"] as const) {
  test(`${mode} results are never saved as reusable generated stories`, async () => {
    const h = harness(async () => ({ scene: structuredClone(scene), mode }));
    assert.equal((await h.run(request)).cache, "bypass");
    assert.equal((await h.run(request)).cache, "bypass");
    assert.equal(h.calls.generate, 2);
    assert.equal(h.calls.write, 0);
    assert.equal(h.stored.size, 0);
  });
}

test("corrupt or silently repaired cache entries regenerate instead of altering the story", async () => {
  for (const invalid of [new TextEncoder().encode("not JSON"), bytes({}),
    bytes({ ...scene, stage: null }), bytes({ ...scene, lines: [{ speaker: "stranger", text: "wrong voice" }] })]) {
    const h = harness();
    h.stored.set(sceneCacheKey(request, "test-model"), invalid);
    const result = await h.run(request);
    assert.equal(result.cache, "miss");
    assert.deepEqual(result.scene, scene);
    assert.equal(h.calls.generate, 1);
    assert.equal(h.calls.write, 1);
  }
});

test("simultaneous identical requests share generation while a different branch stays independent", async () => {
  const releases: (() => void)[] = [];
  const h = harness(async () => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return { scene: structuredClone(scene), mode: "kimi" };
  });
  const one = h.run(request), same = h.run(structuredClone(request));
  const other = structuredClone(request);
  other.history[0].choice = "잠깐 쉴래요";
  const different = h.run(other);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.calls.generate, 2);
  for (const release of releases) release();
  const results = await Promise.all([one, same, different]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(h.stored.size, 2);
});

test("storage outages fail open and a rejected generation does not remain in flight", async () => {
  let calls = 0;
  const run = createCachedSceneGenerator({
    model: () => "outage-model",
    read: async () => { throw new Error("storage unavailable"); },
    write: async () => { throw new Error("storage unavailable"); },
    generate: async () => {
      if (++calls === 1) throw new Error("generation unavailable");
      return { scene: structuredClone(scene), mode: "kimi" };
    },
  });
  await assert.rejects(run(request), /generation unavailable/);
  const recovered = await run(request);
  assert.equal(recovered.cache, "bypass");
  assert.deepEqual(recovered.scene, scene);
  assert.equal(calls, 2);
});

test("unavailable persistent storage reports bypass while preserving the generated scene", async () => {
  const run = createCachedSceneGenerator({
    model: () => "memory-only-model",
    read: async () => null,
    write: async () => false,
    generate: async () => ({ scene: structuredClone(scene), mode: "kimi" }),
  });
  const result = await run(request);
  assert.equal(result.cache, "bypass");
  assert.equal(result.mode, "kimi");
  assert.deepEqual(result.scene, scene);
});
