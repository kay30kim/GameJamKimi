import assert from "node:assert/strict";
import test from "node:test";
import { speak, stopSpeaking } from "./speech";

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
    const result = speak("fallback start event", "ko-KR", { onStart: () => { starts += 1; } });
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
    assert.deepEqual(await speak("no usable output", "en-US", { onStart: () => { starts += 1; } }), { started: false, cancelled: false });
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
    const result = speak("interrupt spoken fallback", "ko-KR", { signal: controller.signal, onStart: () => { starts += 1; } });
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
    assert.equal(requested.length, 3, "the provider concurrency limit remains in force");
    stopSpeaking();
    assert.ok((await Promise.all(abandoned)).every((result) => result.cancelled && !result.started));
    const next = speak("fresh generation after saturation", "en-US");
    await flush();
    assert.equal(requested.length, 4, "aborted slot waiters must never reach the provider");
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
    assert.deepEqual(await result, { started: false, cancelled: false });
    assert.equal(requestSignal?.aborted, true);
    assert.equal(env.players.length, 0);
  } finally { await env.restore(); timers.restore(); }
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
    assert.deepEqual(await result, { started: false, cancelled: false });
    assert.equal(starts, 0);
    assert.equal(env.browserCancels, 1);
  } finally { await env.restore(); timers.restore(); }
});
