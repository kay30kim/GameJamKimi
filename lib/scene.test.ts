import assert from "node:assert/strict";
import test from "node:test";
import type { SceneRequest, SceneResponse } from "../app/api/scene/contract";
import { fetchScene, nextSceneRequest, prefetch, prefetchScene } from "./scene";

const settings = { lesson: "sharing", language: "en", age: 6, opening: "balloon" } as const;
const scene: SceneResponse = {
  narration: "앨리스가 모모에게 풍선을 건넸어요.",
  lines: [{ speaker: "friend", to: "hero", text: "고마워!" }],
  newWords: [{ word: "friend", meaning: "친구" }],
  choices: ["함께 걸어요", "인사해요"],
  lessonComplete: false,
  stage: {
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [{ actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 0 }],
  },
};
const continuation: NonNullable<SceneRequest["continuation"]> = {
  world: {
    weather: "sunny",
    actors: [
      { actor: "hero", x: -0.5, z: 0, heading: Math.PI / 2, sitting: false },
      { actor: "friend", x: 0.7, z: 0, heading: -Math.PI / 2, sitting: false },
    ],
    props: [{ prop: "balloon", x: 0.7, z: 0, holder: "friend" }],
  },
  previousLines: scene.lines,
  previousBeats: scene.stage.beats,
};

test("a choice request carries the completed world and prior dialogue, without mutating history", () => {
  const history: SceneRequest["history"] = [];
  const words = ["friend"];
  const request = nextSceneRequest(settings, history, words, scene, scene.choices[0], continuation);
  assert.deepEqual(request.history, [{ narration: scene.narration, choice: "함께 걸어요" }]);
  assert.deepEqual(request.continuation, continuation);
  assert.equal(request.continuation!.world.props[0].holder, "friend");
  assert.deepEqual(request.wordsLearned, ["friend"]);
  assert.deepEqual(history, []);
  assert.deepEqual(words, ["friend"]);
});

test("prefetch reuses the same choice state but cannot reuse a scene for a different world", async (t) => {
  const requests: SceneRequest[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    requests.push(JSON.parse(options.body as string));
    return Response.json(scene, { headers: { "X-Scene-Mode": "model" } });
  });
  const request = nextSceneRequest(settings, [], [], scene, scene.choices[0], continuation);
  await prefetchScene(request);
  await fetchScene(structuredClone(request));
  assert.equal(requests.length, 1);
  await prefetchScene(request);
  const different = structuredClone(request);
  different.continuation!.world.props[0].holder = "hero";
  await fetchScene(different);
  assert.equal(requests.length, 3, "ownership changes invalidate a cached continuation");
  assert.equal(requests[2].continuation!.world.props[0].holder, "hero");
});

test("story loading errors follow the selected primary language", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(fetchScene({ ...settings, language: "ko", lesson: "network-ko", history: [], wordsLearned: [] }), /인터넷 연결/);
  await assert.rejects(fetchScene({ ...settings, language: "en", lesson: "network-en", history: [], wordsLearned: [] }), /Check your connection/);
});

test("Korean mode localizes unreadable and rejected API responses", async (t) => {
  const fetcher = t.mock.method(globalThis, "fetch", async () => new Response("not json"));
  const request = { ...settings, language: "ko" as const, lesson: "response-errors", history: [], wordsLearned: [] };
  await assert.rejects(fetchScene(request), /이야기를 읽어/);
  fetcher.mock.mockImplementation(async () => Response.json({ error: { code: "INVALID_REQUEST", message: "Expected valid settings" } }, { status: 400 }));
  await assert.rejects(fetchScene(request), /이야기 설정/);
});

test("scene prefetch preserves each dialogue speaker and emotion in the warmed audio", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  const audioRequests: { text: string; voice: string; emotion?: string }[] = [];
  const warmed: SceneResponse = {
    ...scene,
    narration: "감정을 담은 새 이야기예요.",
    lines: [
      { speaker: "hero", text: "나는 지금 슬퍼.", emotion: "sad" },
      { speaker: "friend", text: "내가 곁에 있을게.", emotion: "happy" },
    ],
    newWords: [{ word: "오늘의 기분", meaning: "today’s feeling" }],
  };
  t.mock.method(globalThis, "fetch", async (url: unknown, options: RequestInit) => {
    if (url === "/api/scene") return Response.json(warmed, { headers: { "X-Scene-Mode": "model" } });
    assert.equal(url, "/api/tts");
    audioRequests.push(JSON.parse(options.body as string));
    return new Response(new Blob(["audio"]), { headers: { "content-type": "audio/mpeg" } });
  });
  try {
    prefetch({ ...settings, language: "ko", lesson: "prefetch-emotion", history: [], wordsLearned: [] });
    for (let i = 0; i < 10 && audioRequests.length < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(audioRequests.map(({ text, voice, emotion }) => ({ text, voice, emotion })), [
      { text: warmed.narration, voice: "narrator", emotion: undefined },
      { text: warmed.lines[0].text, voice: "hero", emotion: "sad" },
      { text: warmed.lines[1].text, voice: "friend", emotion: "happy" },
      { text: warmed.newWords[0].word, voice: "hero", emotion: "happy" },
      { text: warmed.newWords[0].meaning, voice: "narrator", emotion: undefined },
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
