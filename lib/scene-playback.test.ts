import assert from "node:assert/strict";
import test from "node:test";
import type { SceneResponse } from "../app/api/scene/contract";
import { createSim } from "./harbir/sim";
import { planPlayback, ScenePlayback } from "./scene-playback";
import type { PlaybackSegment } from "./scene-playback";
import type { SpeakOptions, SpeakResult } from "./speech";
import type { SpeechErrorCode } from "./speech-policy";
import type { Beat, WorldSnapshot } from "./world";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function scene(beats: Beat[], overrides: Partial<SceneResponse> = {}): SceneResponse {
  return {
    narration: "앨리스가 친구를 만나요.",
    lines: [{ speaker: "hero", text: "내 풍선을 줄게!" }, { speaker: "friend", text: "고마워, 앨리스!" }],
    newWords: [],
    choices: ["함께 놀아요", "인사해요"],
    lessonComplete: false,
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
      props: [{ prop: "balloon", at: "hero" }],
      beats,
    },
    ...overrides,
  };
}

interface SpeechRequest {
  text: string;
  locale: string;
  options: SpeakOptions;
  start(): void;
  end(result?: SpeakResult): void;
  reject(): void;
}

function playbackHarness(value: SceneResponse, muted = false, previous?: WorldSnapshot) {
  const requests: SpeechRequest[] = [];
  const segments: { segment: PlaybackSegment; index: number }[] = [];
  const speaking: boolean[] = [];
  const errors: SpeechErrorCode[] = [];
  let completed: boolean | undefined;
  const playback = new ScenePlayback(value, {
    locale: "ko-KR",
    isMuted: () => muted,
    speak: (text, locale, options) => new Promise<SpeakResult>((resolve, reject) => {
      requests.push({
        text, locale, options,
        start: () => options.onStart?.(),
        end: (result = { started: true, cancelled: false }) => resolve(result),
        reject: () => reject(new Error("voice unavailable")),
      });
    }),
    onSegment: (segment, index) => segments.push({ segment, index }),
    onSpeaking: (value) => speaking.push(value),
    onSpeechError: (error) => errors.push(error),
  }, previous);
  const result = playback.play();
  void result.then((value) => { completed = value; });
  return { playback, requests, segments, speaking, errors, result, get completed() { return completed; } };
}

function advance(playback: ScenePlayback, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) playback.advance(1 / 60);
}

function advanceUntil(playback: ScenePlayback, condition: () => boolean, maxSeconds = 30) {
  for (let i = 0; i < maxSeconds * 60 && !condition(); i++) playback.advance(1 / 60);
  assert.ok(condition(), `condition not reached after ${maxSeconds} simulated seconds`);
}

function assertAllBeatsAssigned(value: SceneResponse, expected: number[]) {
  const limits = planPlayback(value).map(({ beatLimit }) => beatLimit);
  assert.deepEqual(limits, expected);
  assert.equal(limits.at(-1), value.stage.beats.length);
  assert.ok(limits.every((limit, i) => i === 0 || limit >= limits[i - 1]));
}

test("dialogue sends its emotion to speech without inventing a narration emotion", async () => {
  const h = playbackHarness(scene([{ actor: "hero", action: "wave", cue: 0 }], {
    narration: "Hello.", lines: [{ speaker: "friend", text: "I feel sad.", emotion: "sad" }],
  }));
  await flush();
  assert.equal(h.requests[0].options.emotion, undefined);
  h.requests[0].start();
  h.requests[0].end();
  await flush();
  advance(h.playback, 3);
  await flush();
  assert.equal(h.requests[1].options.voice, "friend");
  assert.equal(h.requests[1].options.emotion, "sad");
  h.playback.cancel();
  assert.equal(await h.result, false);
});

for (const started of [false, true]) {
  test(`typed voice failure ${started ? "after" : "before"} start reports once and gives the caption reading time`, async () => {
    const h = playbackHarness(scene([{ actor: "hero", action: "wave", cue: 0 }], {
      narration: "가".repeat(50), lines: [{ speaker: "friend", text: "다음 말이에요." }],
    }));
    await flush();
    if (started) { h.requests[0].start(); advance(h.playback, 0.3); }
    h.requests[0].end({ started, cancelled: false, error: "TTS_PLAYBACK_ERROR" });
    await flush();
    assert.deepEqual(h.errors, ["TTS_PLAYBACK_ERROR"]);
    assert.equal(h.speaking.filter(Boolean).length, started ? 1 : 0);
    advance(h.playback, 3.2);
    assert.equal(h.requests.length, 1, "an interrupted line must not skip its caption immediately");
    assert.equal(h.playback.sim.completedBeats, 1);
    advance(h.playback, 1);
    await flush();
    assert.equal(h.requests.length, 2);
    assert.deepEqual(h.errors, ["TTS_PLAYBACK_ERROR"]);
    h.playback.cancel();
    assert.equal(await h.result, false);
  });
}

test("cancelled or stale voice results never report an error for the current story", async () => {
  const cancelled = playbackHarness(scene([{ actor: "hero", action: "wave", cue: 0 }]));
  await flush();
  cancelled.requests[0].end({ started: false, cancelled: true, error: "TTS_NOT_CONFIGURED" });
  await flush();
  assert.deepEqual(cancelled.errors, []);
  cancelled.playback.cancel();
  assert.equal(await cancelled.result, false);

  const stale = playbackHarness(scene([{ actor: "hero", action: "wave", cue: 0 }]));
  await flush();
  stale.playback.cancel();
  stale.requests[0].end({ started: false, cancelled: false, error: "TTS_NOT_CONFIGURED" });
  await flush();
  assert.deepEqual(stale.errors, []);
  assert.equal(await stale.result, false);
});

test("a selected continuation starts at the previous handoff instead of reseeding the world", async () => {
  const first = playbackHarness(scene([{ actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 1 }]));
  assert.ok(first.playback.skip());
  const saved = first.playback.snapshot();
  assert.equal(saved.props[0].holder, "friend");
  const nextScene = scene([{ actor: "friend", action: "walk_to", target: "tree", cue: 0 }]);
  nextScene.stage.cast = [{ actor: "hero", at: "home" }, { actor: "friend", at: "bench" }];
  nextScene.stage.weather = "rainy";
  const next = playbackHarness(nextScene, false, saved);
  assert.deepEqual(next.playback.snapshot(), saved, "incoming starts cannot undo a completed handoff or teleport the cast");
  assert.equal(next.playback.stage.weather, "sunny");
  await flush();
  advance(next.playback, 2);
  assert.equal(next.playback.sim.completedBeats, 0);
  assert.deepEqual(next.playback.snapshot().props, saved.props);
  next.requests[0].start();
  advance(next.playback, 1);
  assert.ok(next.playback.sim.actors.friend!.travelled > 0, "the chosen action continues from the saved position");
  assert.equal(next.playback.sim.props.balloon!.holder, "friend");
  next.playback.cancel();
});

test("replaying a later part restores that part's start without replaying the first handoff", async () => {
  const first = playbackHarness(scene([{ actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 1 }]));
  assert.ok(first.playback.skip());
  const nextScene = scene([{ actor: "friend", action: "walk_to", target: "tree", cue: 0 }]);
  const next = playbackHarness(nextScene, true, first.playback.snapshot());
  const start = structuredClone(next.playback.startWorld);
  assert.ok(next.playback.skip());
  assert.notDeepEqual(next.playback.snapshot().actors, start.actors);
  const replay = playbackHarness(nextScene, true, next.playback.startWorld);
  assert.deepEqual(replay.playback.snapshot(), start);
  assert.equal(replay.playback.sim.props.balloon!.holder, "friend");
  assert.ok(replay.playback.skip());
  assert.deepEqual(replay.playback.snapshot(), next.playback.snapshot());
  await flush();
});

test("the decision world stays identical while the child reads choices and branches prefetch", async () => {
  const value = scene([], { lines: [], narration: "Ready." });
  value.stage.props = [{ prop: "ball", at: "path" }];
  const h = playbackHarness(value, true);
  const ball = h.playback.sim.props.ball!;
  ball.vx = 2;
  advance(h.playback, 3);
  assert.equal(await h.result, true);
  const decision = h.playback.snapshot();
  advance(h.playback, 30);
  assert.deepEqual(h.playback.snapshot(), decision);
  const next = playbackHarness(value, true, decision);
  assert.deepEqual(next.playback.snapshot(), decision);
  next.playback.cancel();
});

test("playback plans honor explicit narration and dialogue cues", () => {
  const value = scene([
    { actor: "hero", action: "walk_to", target: "friend", cue: 0 },
    { actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 1 },
    { actor: "friend", action: "clap", cue: 2 },
  ]);
  assertAllBeatsAssigned(value, [1, 2, 3]);
  assert.deepEqual(planPlayback(value).map(({ voice, text, line }) => ({ voice, text, line })), [
    { voice: "narrator", text: value.narration, line: null },
    ...value.lines.map((line) => ({ voice: line.speaker, text: line.text, line })),
  ]);
});

test("partial cues retain action order and assign unmarked beats between explicit cues", () => {
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "walk_to", target: "friend" },
    { actor: "hero", action: "emote", emotion: "happy", cue: 1 },
    { actor: "friend", action: "clap" },
    { actor: "friend", action: "wave", cue: 2 },
  ]), [1, 2, 4]);
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "emote", emotion: "happy", cue: 1 },
    { actor: "hero", action: "walk_to", target: "friend" },
    { actor: "friend", action: "clap", cue: 2 },
  ]), [0, 2, 3]);
});

test("legacy and invalid-cue scenes assign every action without waiting for a nonexistent line", () => {
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "walk_to", target: "friend" },
    { actor: "hero", action: "pick_up", prop: "balloon" },
    { actor: "hero", action: "give", prop: "balloon", target: "friend" },
    { actor: "friend", action: "clap" },
  ]), [2, 3, 4]);
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "wave", cue: 2 },
    { actor: "friend", action: "clap", cue: 1 },
  ]), [0, 1, 2]);
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "wave", cue: 99 },
    { actor: "friend", action: "clap", cue: -1 },
  ]), [0, 1, 2]);
  assertAllBeatsAssigned(scene([
    { actor: "hero", action: "wave", cue: 1 },
    { actor: "friend", action: "clap" },
  ], { lines: [] }), [2]);
  assertAllBeatsAssigned(scene([]), [0, 0, 0]);
});

test("pending voice generation cannot start narration's actions before onStart", async () => {
  const h = playbackHarness(scene([{ actor: "hero", action: "walk_to", target: "tree", cue: 0 }]));
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].locale, "ko-KR");
  assert.equal(h.requests[0].options.voice, "narrator");
  const hero = h.playback.sim.actors.hero!;
  const initial = [hero.x, hero.z];
  advance(h.playback, 8);
  assert.deepEqual([hero.x, hero.z], initial);
  assert.equal(hero.pose, "idle");
  assert.equal(h.playback.sim.completedBeats, 0);
  assert.deepEqual(h.speaking, [false]);
  h.requests[0].start();
  h.requests[0].start();
  advance(h.playback, 0.3);
  assert.ok(hero.travelled > 0);
  assert.deepEqual(h.speaking, [false, true], "duplicate playback events must not start the segment twice");
  h.playback.cancel();
  assert.equal(await h.result, false);
});

test("short speech waits for a long action before starting the next line", async () => {
  const h = playbackHarness(scene([
    { actor: "hero", action: "walk_to", target: "tree", cue: 0 },
    { actor: "friend", action: "wave", cue: 1 },
  ], { lines: [{ speaker: "friend", text: "여기야!" }] }));
  await flush();
  h.requests[0].start();
  h.requests[0].end();
  await flush();
  advance(h.playback, 1);
  assert.equal(h.playback.sim.completedBeats, 0);
  assert.equal(h.segments.length, 1);
  assert.equal(h.requests.length, 1);
  advanceUntil(h.playback, () => h.playback.sim.completedBeats === 1);
  assert.equal(h.segments.length, 1, "the inter-line pause starts after the action ends");
  advance(h.playback, 0.4);
  await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.voice, "friend");
  assert.equal(h.playback.sim.actors.friend!.pose, "idle", "the next action also waits for its own audible start");
  h.requests[1].start();
  h.requests[1].end();
  await flush();
  advance(h.playback, 2);
  assert.equal(await h.result, true);
  assert.equal(h.playback.sim.completedBeats, 2);
});

test("short actions wait for long speech before advancing captions or the next action", async () => {
  const h = playbackHarness(scene([
    { actor: "hero", action: "wave", cue: 0 },
    { actor: "friend", action: "clap", cue: 1 },
  ], { lines: [{ speaker: "friend", text: "잘했어!" }] }));
  await flush();
  h.requests[0].start();
  advance(h.playback, 6);
  assert.equal(h.playback.sim.completedBeats, 1);
  assert.equal(h.playback.sim.done, false);
  assert.equal(h.segments.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.completed, undefined);
  h.requests[0].end();
  await flush();
  advance(h.playback, 0.4);
  await flush();
  assert.equal(h.requests.length, 2);
  h.requests[1].start();
  h.requests[1].end();
  await flush();
  advance(h.playback, 2);
  assert.equal(await h.result, true);
});

for (const action of ["roll", "celebrate"] as const) {
  test(`a speaker's ${action} and following actions wait for voice end, then finish before the next line`, async () => {
    const value = scene([
      { actor: "hero", action: "wave", cue: 1 },
      { actor: "hero", action, cue: 1 },
      { actor: "friend", action: "clap", cue: 1 },
      { actor: "friend", action: "wave", cue: 2 },
    ]);
    value.stage.props = [];
    const h = playbackHarness(value);
    await flush();
    h.requests[0].start();
    h.requests[0].end();
    await flush();
    advance(h.playback, 0.4);
    await flush();
    assert.equal(h.requests.length, 2);
    h.requests[1].start();
    advance(h.playback, 4);
    assert.equal(h.playback.sim.completedBeats, 1, "the wave before the stunt still accompanies speech");
    assert.equal(h.playback.sim.actors.hero!.pose, "idle");
    assert.equal(h.playback.sim.actors.friend!.pose, "idle", "later actions cannot overtake the deferred stunt");
    assert.equal(h.speaking.at(-1), true);
    h.requests[1].end();
    await flush();
    assert.equal(h.speaking.at(-1), false);
    advance(h.playback, 0.1);
    assert.equal(h.playback.sim.actors.hero!.pose, action);
    assert.equal(h.requests.length, 2, "the next voice waits while the stunt plays silently");
    advanceUntil(h.playback, () => h.playback.sim.completedBeats === 3);
    assert.equal(h.segments.length, 2);
    advance(h.playback, 0.4);
    await flush();
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests[2].options.voice, "friend");
    h.playback.cancel();
    assert.equal(await h.result, false);
  });
}

for (const mode of ["muted", "no-start", "partial-error"] as const) {
  for (const text of ["야!", "가".repeat(50)]) {
    test(`${mode} defers the speaker's spin through ${text.length < 10 ? "minimum" : "long"} caption reading time`, async () => {
      const h = playbackHarness(scene([{ actor: "hero", action: "celebrate", cue: 1 }], {
        narration: "Ready.",
        lines: [{ speaker: "hero", text }, { speaker: "friend", text: "내 차례야." }],
      }), mode === "muted");
      await flush();
      if (mode === "muted") {
        advanceUntil(h.playback, () => h.segments.length === 2);
      } else {
        h.requests[0].start();
        h.requests[0].end();
        await flush();
        advance(h.playback, 0.4);
        await flush();
        if (mode === "partial-error") {
          h.requests[1].start();
          advance(h.playback, 0.4);
          assert.equal(h.playback.sim.actors.hero!.pose, "idle");
        }
        h.requests[1].end(mode === "partial-error"
          ? { started: true, cancelled: false, error: "TTS_PLAYBACK_ERROR" }
          : { started: false, cancelled: false });
        await flush();
      }
      const readingTime = Math.max(1.8, text.length * 0.07);
      advance(h.playback, readingTime - 0.2);
      assert.equal(h.playback.sim.actors.hero!.pose, "idle", "even a short caption gets the full reading interval");
      assert.equal(h.playback.sim.completedBeats, 0);
      assert.equal(h.segments.length, 2);
      assert.equal(h.speaking.at(-1), false);
      advance(h.playback, 0.3);
      assert.equal(h.playback.sim.actors.hero!.pose, "celebrate");
      assert.equal(h.segments.length, 2, "finishing the caption does not skip the deferred action");
      advanceUntil(h.playback, () => h.playback.sim.completedBeats === 1);
      advance(h.playback, 0.4);
      assert.equal(h.segments.length, 3);
      h.playback.cancel();
      assert.equal(await h.result, false);
    });
  }
}

test("narration and another character's stunt can still accompany the current voice", async () => {
  const value = scene([
    { actor: "hero", action: "roll", cue: 0 },
    { actor: "friend", action: "celebrate", cue: 1 },
  ], { lines: [{ speaker: "hero", text: "모모야, 신나지?" }] });
  value.stage.props = [];
  const h = playbackHarness(value);
  await flush();
  h.requests[0].start();
  advanceUntil(h.playback, () => h.playback.sim.actors.hero!.pose === "roll", 1);
  assert.equal(h.playback.sim.actors.hero!.pose, "roll");
  advance(h.playback, 2);
  h.requests[0].end();
  await flush();
  advance(h.playback, 0.4);
  await flush();
  h.requests[1].start();
  advance(h.playback, 0.1);
  assert.equal(h.playback.sim.actors.friend!.pose, "celebrate");
  assert.equal(h.speaking.at(-1), true);
  h.playback.cancel();
  assert.equal(await h.result, false);
});

test("cancelling a deferred stunt ignores voice end; skipping still completes it", async () => {
  for (const skip of [false, true]) {
    const value = scene([{ actor: "hero", action: "roll", cue: 1 }]);
    value.stage.props = [];
    const h = playbackHarness(value);
    await flush();
    h.requests[0].start();
    h.requests[0].end();
    await flush();
    advance(h.playback, 0.4);
    await flush();
    h.requests[1].start();
    advance(h.playback, 0.1);
    assert.equal(h.playback.sim.completedBeats, 0);
    if (skip) assert.equal(h.playback.skip(), true);
    else h.playback.cancel();
    const position = h.playback.snapshot();
    h.requests[1].end();
    await flush();
    advance(h.playback, 5);
    assert.equal(await h.result, false);
    assert.equal(h.playback.sim.completedBeats, skip ? 1 : 0);
    assert.deepEqual(h.playback.snapshot(), position);
  }
});

for (const mode of ["muted", "no-start", "rejected"] as const) {
  test(`${mode} playback keeps captions readable after its short action finishes`, async () => {
    const h = playbackHarness(scene([{ actor: "hero", action: "wave", cue: 0 }], {
      narration: "가".repeat(50),
      lines: [{ speaker: "friend", text: "이제 내 차례야." }],
    }), mode === "muted");
    await flush();
    if (mode === "no-start") h.requests[0].end({ started: false, cancelled: false });
    if (mode === "rejected") h.requests[0].reject();
    await flush();
    advance(h.playback, 3.2);
    assert.equal(h.playback.sim.completedBeats, 1);
    assert.equal(h.segments.length, 1, "long captions need reading time even when the action has finished");
    assert.ok(h.speaking.every((value) => !value), "fallback captions must not pretend that audio is playing");
    advance(h.playback, 1);
    await flush();
    assert.equal(h.segments.length, 2);
    if (mode === "muted") assert.equal(h.requests.length, 0);
    h.playback.cancel();
    assert.equal(await h.result, false);
  });

  test(`${mode} playback also waits for actions that outlast the caption reading time`, async () => {
    const h = playbackHarness(scene([{ actor: "hero", action: "walk_to", target: "tree", cue: 0 }], {
      narration: "가요.",
      lines: [{ speaker: "friend", text: "도착했어!" }],
    }), mode === "muted");
    await flush();
    if (mode === "no-start") h.requests[0].end({ started: false, cancelled: false });
    if (mode === "rejected") h.requests[0].reject();
    await flush();
    advance(h.playback, 2.2);
    assert.equal(h.playback.sim.completedBeats, 0);
    assert.equal(h.segments.length, 1);
    advanceUntil(h.playback, () => h.playback.sim.done);
    advance(h.playback, 0.4);
    await flush();
    assert.equal(h.segments.length, 2);
    h.playback.cancel();
    assert.equal(await h.result, false);
  });
}

test("cancel aborts pending speech and ignores late start and completion callbacks", async () => {
  for (const alreadyStarted of [false, true]) {
    const h = playbackHarness(scene([{ actor: "hero", action: "walk_to", target: "tree", cue: 0 }]));
    await flush();
    const request = h.requests[0];
    if (alreadyStarted) { request.start(); advance(h.playback, 1); }
    h.playback.cancel();
    assert.equal(await h.result, false);
    assert.equal(request.options.signal?.aborted, true);
    const state = JSON.stringify(h.playback.sim.actors);
    const callbacks = [h.segments.length, h.speaking.length];
    request.start();
    request.end();
    await flush();
    advance(h.playback, 20);
    assert.equal(JSON.stringify(h.playback.sim.actors), state);
    assert.deepEqual([h.segments.length, h.speaking.length], callbacks);
    assert.equal(await h.playback.play(), false, "a cancelled controller cannot be restarted accidentally");
  }
});

test("replay creates independent initial state and old callbacks cannot release its actions", async () => {
  const value = scene([{ actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 0 }], { lines: [] });
  const first = playbackHarness(value);
  await flush();
  first.requests[0].start();
  first.requests[0].end();
  await flush();
  advance(first.playback, 8);
  assert.equal(await first.result, true);
  assert.equal(first.playback.sim.props.balloon!.holder, "friend");

  const replay = playbackHarness(value);
  await flush();
  assert.notEqual(replay.playback.sim, first.playback.sim);
  assert.equal(replay.playback.sim.props.balloon!.holder, "hero");
  first.requests[0].start();
  advance(replay.playback, 5);
  assert.equal(replay.playback.sim.completedBeats, 0);
  assert.equal(replay.playback.sim.props.balloon!.holder, "hero");
  replay.requests[0].start();
  replay.requests[0].end();
  await flush();
  advance(replay.playback, 8);
  assert.equal(await replay.result, true);
  assert.equal(replay.playback.sim.props.balloon!.holder, "friend");
});

test("skip applies all remaining interactions and leaves the balloon with its final recipient", async () => {
  const value = scene([
    { actor: "hero", action: "pick_up", prop: "balloon", cue: 0 },
    { actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 1 },
    { actor: "friend", action: "walk_to", target: "tree", cue: 2 },
  ]);
  value.stage.props = [{ prop: "balloon", at: "path" }];
  const expected = createSim(value.stage);
  assert.equal(expected.finish(), true);
  const h = playbackHarness(value);
  await flush();
  const stale = h.requests[0];
  assert.equal(h.playback.skip(), true);
  assert.equal(await h.result, false, "skip cancels the normal dialogue sequence");
  assert.equal(stale.options.signal?.aborted, true);
  assert.equal(h.playback.sim.completedBeats, 3);
  assert.equal(h.playback.sim.done, true);
  assert.equal(h.playback.sim.props.balloon!.holder, "friend");
  assert.deepEqual(h.playback.sim.actors, expected.actors);
  assert.deepEqual(h.playback.sim.props, expected.props);
  stale.start();
  stale.end();
  await flush();
  advance(h.playback, 1);
  assert.equal(h.segments.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.playback.sim.completedBeats, 3);
  assert.equal(h.playback.sim.props.balloon!.holder, "friend");
});
