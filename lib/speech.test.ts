import assert from "node:assert/strict";
import test from "node:test";
import { preloadSpeech, speak, stopSpeaking } from "./speech";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const audioResponse = () => new Response(new Blob(["audio"], { type: "audio/mpeg" }), { headers: { "content-type": "audio/mpeg" } });

function environment() {
  const originals = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    audio: Object.getOwnPropertyDescriptor(globalThis, "Audio"),
    utterance: Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance"),
    fetch: globalThis.fetch,
  };
  const players: FakeAudio[] = [];
  const utterances: FakeUtterance[] = [];
  let rejectPlay = false;
  let browserCancels = 0;
  class FakeAudio {
    src = "";
    onplaying: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    paused = false;
    constructor() { players.push(this); }
    play() { return rejectPlay ? Promise.reject(new Error("autoplay blocked")) : Promise.resolve(); }
    pause() { this.paused = true; }
  }
  class FakeUtterance {
    lang = "";
    rate = 1;
    voice?: SpeechSynthesisVoice;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const browserWindow: { speechSynthesis?: unknown } = {};
  Object.defineProperty(globalThis, "window", { value: browserWindow, configurable: true });
  Object.defineProperty(globalThis, "Audio", { value: FakeAudio, configurable: true });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
  globalThis.fetch = async () => audioResponse();
  return {
    players, utterances,
    rejectAudio() { rejectPlay = true; },
    enableBrowser() {
      browserWindow.speechSynthesis = {
        getVoices: () => [],
        speak: (utterance: FakeUtterance) => utterances.push(utterance),
        cancel: () => { browserCancels += 1; },
      };
    },
    get browserCancels() { return browserCancels; },
    async restore() {
      stopSpeaking();
      await flush();
      globalThis.fetch = originals.fetch;
      for (const [name, original] of [["window", originals.window], ["Audio", originals.audio], ["SpeechSynthesisUtterance", originals.utterance]] as const) {
        if (original) Object.defineProperty(globalThis, name, original);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

function fakeTimers() {
  const set = globalThis.setTimeout, clear = globalThis.clearTimeout;
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let sequence = 0;
  globalThis.setTimeout = ((callback: () => void, ms: number) => {
    pending.set(++sequence, { callback, ms });
    return sequence;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { pending.delete(id); }) as unknown as typeof clearTimeout;
  return {
    fire(ms: number) {
      const matches = [...pending].filter(([, timer]) => timer.ms === ms);
      assert.ok(matches.length > 0, `expected a ${ms}ms watchdog`);
      for (const [id, timer] of matches) { pending.delete(id); timer.callback(); }
    },
    restore() { globalThis.setTimeout = set; globalThis.clearTimeout = clear; },
  };
}

test("speech starts only on actual playing, once, and finishes on ended", async () => {
  const env = environment();
  try {
    let starts = 0, finished = false;
    const result = speak("event-aligned line", "ko-KR", { onStart: () => { starts += 1; } }).then((value) => { finished = true; return value; });
    await flush();
    assert.equal(env.players.length, 1);
    assert.equal(starts, 0, "fetch completion and a resolved play() are not audible playback");
    assert.equal(finished, false);
    env.players[0].onplaying?.();
    env.players[0].onplaying?.();
    assert.equal(starts, 1);
    assert.equal(finished, false);
    env.players[0].onended?.();
    assert.deepEqual(await result, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("browser fallback waits for its real start event and reports no duplicate start", async () => {
  const env = environment();
  env.enableBrowser();
  env.rejectAudio();
  try {
    let starts = 0;
    const result = speak("fallback start event", "en-US", { onStart: () => { starts += 1; } });
    await flush();
    assert.equal(env.utterances.length, 1);
    assert.equal(starts, 0);
    env.utterances[0].onstart?.();
    env.utterances[0].onstart?.();
    assert.equal(starts, 1);
    env.utterances[0].onend?.();
    assert.deepEqual(await result, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("an audio failure after starting does not start the same story segment again in fallback", async () => {
  const env = environment();
  env.enableBrowser();
  try {
    let starts = 0;
    const result = speak("one segment across fallback", "en-US", { onStart: () => { starts += 1; } });
    await flush();
    env.players[0].onplaying?.();
    env.players[0].onerror?.();
    await flush();
    env.utterances[0].onstart?.();
    assert.equal(starts, 1);
    env.utterances[0].onend?.();
    assert.deepEqual(await result, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("cancelling an unresolved generation immediately frees playback and aborts its request", async () => {
  const env = environment();
  let release!: (value: Response) => void;
  let oldSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => {
    if (JSON.parse(String(options?.body)).text === "stuck old line") {
      oldSignal = options?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { release = resolve; });
    }
    return audioResponse();
  };
  try {
    let staleStarts = 0;
    const first = speak("stuck old line", "ko-KR", { onStart: () => { staleStarts += 1; } });
    const queued = speak("discarded queued line", "ko-KR", { onStart: () => { staleStarts += 1; } });
    await flush();
    stopSpeaking();
    assert.deepEqual(await first, { started: false, cancelled: true });
    assert.deepEqual(await queued, { started: false, cancelled: true });
    assert.equal(oldSignal?.aborted, true);
    const next = speak("new line after cancellation", "ko-KR");
    await flush();
    assert.equal(env.players.length, 1, "new playback must not wait for the old fetch");
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await next, { started: true, cancelled: false });
    release(audioResponse());
    await flush();
    assert.equal(staleStarts, 0);
    assert.equal(env.players.length, 1);
  } finally { await env.restore(); }
});

test("an AbortSignal cancels active media and ignores late playback events", async () => {
  const env = environment();
  try {
    const controller = new AbortController();
    let starts = 0;
    const result = speak("cancel media before it starts", "en-US", { signal: controller.signal, onStart: () => { starts += 1; } });
    await flush();
    const latePlaying = env.players[0].onplaying;
    controller.abort();
    assert.deepEqual(await result, { started: false, cancelled: true });
    latePlaying?.();
    assert.equal(starts, 0);
    assert.equal(env.players[0].paused, true);
    const before = env.players.length;
    assert.deepEqual(await speak("already cancelled", "en-US", { signal: controller.signal }), { started: false, cancelled: true });
    assert.equal(env.players.length, before);
  } finally { await env.restore(); }
});

test("cancelling a queued duplicate does not abort another consumer of the same audio", async () => {
  const env = environment();
  let release!: (value: Response) => void;
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => {
    requestSignal = options?.signal as AbortSignal;
    return new Promise<Response>((resolve) => { release = resolve; });
  };
  try {
    const controller = new AbortController();
    const first = speak("shared generation", "ko-KR");
    const second = speak("shared generation", "ko-KR", { signal: controller.signal });
    await flush();
    controller.abort();
    assert.deepEqual(await second, { started: false, cancelled: true });
    assert.equal(requestSignal?.aborted, false);
    release(audioResponse());
    await flush();
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await first, { started: true, cancelled: false });
    await flush();
    assert.equal(env.players.length, 1);
  } finally { await env.restore(); }
});

test("unusable audio reports a caption fallback instead of pretending speech played", async () => {
  const env = environment();
  env.rejectAudio();
  try {
    let starts = 0;
    assert.deepEqual(await speak("no usable output", "en-US", { onStart: () => { starts += 1; } }), { started: false, cancelled: false, error: "TTS_PLAYBACK_ERROR" });
    assert.equal(starts, 0);
  } finally { await env.restore(); }
});

test("cancelling browser speech after start preserves started and removes stale callbacks", async () => {
  const env = environment();
  env.enableBrowser();
  env.rejectAudio();
  try {
    const controller = new AbortController();
    let starts = 0;
    const result = speak("interrupt spoken fallback", "en-US", { signal: controller.signal, onStart: () => { starts += 1; } });
    await flush();
    const lateStart = env.utterances[0].onstart;
    lateStart?.();
    controller.abort();
    assert.deepEqual(await result, { started: true, cancelled: true });
    lateStart?.();
    assert.equal(starts, 1);
    assert.equal(env.utterances[0].onstart, null);
    assert.equal(env.utterances[0].onend, null);
    assert.equal(env.browserCancels, 1);
  } finally { await env.restore(); }
});

test("cancelling a saturated generation queue frees slots without starting abandoned requests", async () => {
  const env = environment();
  const requested: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const text = JSON.parse(String(options?.body)).text as string;
    requested.push(text);
    if (text.startsWith("abandoned generation")) return new Promise<Response>(() => {});
    return audioResponse();
  };
  try {
    const abandoned = Array.from({ length: 5 }, (_, i) => speak(`abandoned generation ${i}`, "en-US"));
    await flush();
    assert.equal(requested.length, 2, "the Korean provider concurrency limit remains in force");
    stopSpeaking();
    assert.ok((await Promise.all(abandoned)).every((result) => result.cancelled && !result.started));
    const next = speak("fresh generation after saturation", "en-US");
    await flush();
    assert.equal(requested.length, 3, "aborted slot waiters must never reach the provider");
    assert.equal(env.players.length, 1);
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await next, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("generation has a deadline even when fetch ignores abort", async () => {
  const env = environment();
  const timers = fakeTimers();
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => {
    requestSignal = options?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  };
  try {
    const result = speak("generation deadline", "en-US");
    await flush();
    timers.fire(20_000);
    assert.deepEqual(await result, { started: false, cancelled: false, error: "TTS_TIMEOUT" });
    assert.equal(requestSignal?.aborted, true);
    assert.equal(env.players.length, 0);
  } finally { await env.restore(); timers.restore(); }
});

test("a foreground line is generated before queued audio for unchosen branches", async () => {
  const env = environment();
  const requested: string[] = [];
  const responses = new Map<string, (value: Response) => void>();
  globalThis.fetch = async (_url, options) => {
    const text = JSON.parse(String(options?.body)).text as string;
    requested.push(text);
    return new Promise<Response>((resolve) => { responses.set(text, resolve); });
  };
  try {
    for (let i = 0; i < 4; i++) preloadSpeech(`speculative branch priority ${i}`, "ko-KR");
    const current = speak("지금 화면에 나오는 대사", "ko-KR");
    await flush();
    assert.deepEqual(requested, ["speculative branch priority 0", "speculative branch priority 1"]);
    responses.get(requested[0])!(audioResponse());
    await flush();
    assert.equal(requested[2], "지금 화면에 나오는 대사", "current speech must jump ahead of unchosen branches");
    responses.get(requested[2])!(audioResponse());
    await flush();
    assert.equal(env.players.length, 1);
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await current, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("a clip receives its full generation deadline after waiting for a provider slot", async () => {
  const env = environment();
  const timers = fakeTimers();
  const requested: string[] = [];
  let currentResponse!: (value: Response) => void;
  globalThis.fetch = async (_url, options) => {
    const text = JSON.parse(String(options?.body)).text as string;
    requested.push(text);
    return new Promise<Response>((resolve) => {
      if (text === "대기 뒤에도 들려야 하는 대사") currentResponse = resolve;
    });
  };
  try {
    preloadSpeech("blocked speculative deadline one", "ko-KR");
    preloadSpeech("blocked speculative deadline two", "ko-KR");
    const current = speak("대기 뒤에도 들려야 하는 대사", "ko-KR");
    await flush();
    assert.equal(requested.length, 2);
    timers.fire(20_000);
    await flush();
    assert.equal(requested[2], "대기 뒤에도 들려야 하는 대사", "a waiting clip must not expire with the preceding requests");
    currentResponse(audioResponse());
    await flush();
    assert.equal(env.players.length, 1);
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await current, { started: true, cancelled: false });
  } finally { await env.restore(); timers.restore(); }
});

test("changing screens cancels speculative audio so the next line starts immediately", async () => {
  const env = environment();
  const requested: string[] = [];
  const speculativeSignals: AbortSignal[] = [];
  globalThis.fetch = async (_url, options) => {
    const text = JSON.parse(String(options?.body)).text as string;
    requested.push(text);
    if (text.startsWith("old screen preload")) {
      speculativeSignals.push(options!.signal as AbortSignal);
      return new Promise<Response>(() => {});
    }
    return audioResponse();
  };
  try {
    for (let i = 0; i < 4; i++) preloadSpeech(`old screen preload ${i}`, "ko-KR");
    await flush();
    assert.equal(requested.length, 2);
    stopSpeaking();
    const next = speak("새 화면의 첫 대사", "ko-KR");
    await flush();
    assert.ok(speculativeSignals.every((signal) => signal.aborted));
    assert.deepEqual(requested, ["old screen preload 0", "old screen preload 1", "새 화면의 첫 대사"]);
    assert.equal(env.players.length, 1);
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await next, { started: true, cancelled: false });
  } finally { await env.restore(); }
});

test("missing media and browser start events settle without firing onStart", async () => {
  const env = environment();
  env.enableBrowser();
  const timers = fakeTimers();
  try {
    let starts = 0;
    const result = speak("silent engines need captions", "en-US", { onStart: () => { starts += 1; } });
    await flush();
    timers.fire(6_000);
    await flush();
    assert.equal(env.players[0].paused, true);
    assert.equal(env.utterances.length, 1);
    timers.fire(6_000);
    assert.deepEqual(await result, { started: false, cancelled: false, error: "TTS_PLAYBACK_ERROR" });
    assert.equal(starts, 0);
    assert.equal(env.browserCancels, 1);
  } finally { await env.restore(); timers.restore(); }
});

test("Korean locale and Hangul in English lines never use browser speech on server failure", async () => {
  const env = environment();
  env.enableBrowser();
  let starts = 0;
  try {
    for (const [text, locale] of [["Korean locale needs its server voice", "KO_kr"], ["Let’s say 안녕 together", "en-US"]]) {
      for (const code of ["TTS_NOT_CONFIGURED", "TTS_UPSTREAM_ERROR", "TTS_TIMEOUT", "TTS_PLAYBACK_ERROR"] as const) {
        globalThis.fetch = async () => Response.json({ error: { code, message: "Private service details must not appear in UI." } }, { status: 503 });
        assert.deepEqual(await speak(`${text} ${code}`, locale, { onStart: () => { starts += 1; } }), {
          started: false, cancelled: false, error: code,
        });
      }
    }
    assert.equal(env.utterances.length, 0);
    assert.equal(env.players.length, 0);
    assert.equal(starts, 0);
  } finally { await env.restore(); }
});

test("unknown server details and invalid audio become safe typed errors", async () => {
  const env = environment();
  env.enableBrowser();
  try {
    const responses = [
      () => Response.json({ error: { code: "PRIVATE_DETAIL", message: "Do not forward this message." } }, { status: 502 }),
      () => new Response("not json", { status: 502 }),
      () => new Response("not audio", { headers: { "content-type": "text/plain" } }),
      () => new Response(new Blob([]), { headers: { "content-type": "audio/mpeg" } }),
    ];
    for (const [i, response] of responses.entries()) {
      globalThis.fetch = async () => response();
      assert.deepEqual(await speak(`안전한 오류 ${i}`, "ko-KR"), { started: false, cancelled: false, error: "TTS_UPSTREAM_ERROR" });
    }
    assert.equal(env.utterances.length, 0);
  } finally { await env.restore(); }
});

test("Korean playback failures preserve actual start without changing to another voice", async () => {
  const env = environment();
  env.enableBrowser();
  try {
    let starts = 0;
    const result = speak("한글 음성이 중간에 멈춰요", "en-US", { onStart: () => { starts += 1; } });
    await flush();
    env.players[0].onplaying?.();
    env.players[0].onerror?.();
    assert.deepEqual(await result, { started: true, cancelled: false, error: "TTS_PLAYBACK_ERROR" });
    assert.equal(starts, 1);
    assert.equal(env.utterances.length, 0);
    assert.equal(env.players[0].paused, true);
  } finally { await env.restore(); }
});

test("Korean media that cannot start returns an error without a browser utterance", async () => {
  const env = environment();
  env.enableBrowser();
  env.rejectAudio();
  try {
    let starts = 0;
    assert.deepEqual(await speak("재생을 시작할 수 없어요", "ko-KR", { onStart: () => { starts += 1; } }), {
      started: false, cancelled: false, error: "TTS_PLAYBACK_ERROR",
    });
    assert.equal(starts, 0);
    assert.equal(env.utterances.length, 0);
  } finally { await env.restore(); }
});

test("a failed Korean generation is evicted so retry can use the configured voice", async () => {
  const env = environment();
  env.enableBrowser();
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1
    ? Response.json({ error: { code: "TTS_NOT_CONFIGURED" } }, { status: 503 })
    : audioResponse();
  try {
    assert.deepEqual(await speak("같은 대사를 다시 준비해요", "ko-KR"), { started: false, cancelled: false, error: "TTS_NOT_CONFIGURED" });
    const retry = speak("같은 대사를 다시 준비해요", "ko-KR");
    await flush();
    assert.equal(requests, 2);
    env.players[0].onplaying?.();
    env.players[0].onended?.();
    assert.deepEqual(await retry, { started: true, cancelled: false });
    assert.equal(env.utterances.length, 0);
  } finally { await env.restore(); }
});

test("prefetch shares matching emotional audio and keeps different emotions and speakers separate", async () => {
  const env = environment();
  const requests: { text: string; voice: string; emotion?: string }[] = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return audioResponse();
  };
  try {
    preloadSpeech("감정에 따라 목소리가 달라요", "ko-KR", "hero", "happy");
    await flush();
    assert.equal(requests.length, 1);
    assert.equal(env.players.length, 0, "prefetch must never start playback");
    for (const [voice, emotion] of [["hero", "happy"], ["hero", "sad"], ["friend", "happy"]] as const) {
      const result = speak("감정에 따라 목소리가 달라요", " ko_kr ", { voice, emotion });
      await flush();
      env.players.at(-1)!.onplaying?.();
      env.players.at(-1)!.onended?.();
      assert.deepEqual(await result, { started: true, cancelled: false });
    }
    assert.deepEqual(requests.map(({ voice, emotion }) => ({ voice, emotion })), [
      { voice: "hero", emotion: "happy" }, { voice: "hero", emotion: "sad" }, { voice: "friend", emotion: "happy" },
    ]);
  } finally { await env.restore(); }
});
