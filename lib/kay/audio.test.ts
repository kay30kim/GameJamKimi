import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { playKaySpeech, stopKayAudio } from "./audio";
import { speechIdentity } from "./voices";

test("saved dialogue waits for audible playback; cancellation never advances a pending voice", async () => {
  const originals = Object.fromEntries(["window", "Audio", "location", "caches", "SpeechSynthesisUtterance"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const players: FakeAudio[] = [];
  const requests: string[] = [];
  class FakeAudio {
    src = "";
    preload = "";
    onplaying: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    paused = false;
    constructor() { players.push(this); }
    setAttribute() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const text = "같이 춤출래?";
  const key = createHash("sha256").update(speechIdentity(text, "ko", "alice")).digest("hex");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "Audio", { value: FakeAudio, configurable: true });
  Object.defineProperty(globalThis, "location", { value: { origin: "https://story.test" }, configurable: true });
  Object.defineProperty(globalThis, "caches", { value: { open: async () => { throw new Error("Private browsing"); } }, configurable: true });
  let release: (() => void) | undefined;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).endsWith("manifest.json")) return Response.json({ clips: { [key]: { src: "/kay/audio/test.mp3" } } });
    if (String(url) === "/kay/api/tts") await new Promise<void>((resolve) => { release = resolve; });
    return new Response(new Blob(["fake-audio"], { type: "audio/mpeg" }), { headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    let started = 0, ended = 0, resolved = false;
    const first = playKaySpeech({ text, language: "ko", speaker: "alice", onStart: () => started++, onEnd: () => ended++ }).then(() => { resolved = true; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(started, 0, "a downloaded clip is not yet audible");
    assert.equal(resolved, false);
    assert.ok(requests.includes("/kay/audio/test.mp3"));
    assert.ok(!requests.includes("/kay/api/tts"), "prepared dialogue must not need generation");
    players[0].onplaying?.();
    assert.equal(started, 1);
    assert.equal(resolved, false);
    players[0].onended?.();
    await first;
    assert.equal(ended, 1);

    const controller = new AbortController();
    let cancelledStart = false;
    const pending = playKaySpeech({ text: "새로운 대사", language: "ko", speaker: "momo", signal: controller.signal, onStart: () => { cancelledStart = true; } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    controller.abort();
    await pending;
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(cancelledStart, false);
    assert.equal(players.length, 1, "all dialogue reuses the unlocked iPad audio element");
    assert.equal(players[0].paused, true);

    const utterances: { onstart?: () => void; onend?: () => void }[] = [];
    class FakeUtterance { constructor(public text: string) {} }
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
    Object.defineProperty(globalThis, "window", { value: { speechSynthesis: { cancel() {}, getVoices: () => [], speak: (value: typeof utterances[number]) => utterances.push(value) } }, configurable: true });
    players[0].play = () => { players[0].onerror?.(); return Promise.reject(new Error("Autoplay blocked")); };
    let fallbacks = 0;
    const fallback = playKaySpeech({ text, language: "ko", speaker: "alice", onFallback: () => fallbacks++ });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(fallbacks, 1, "media error and rejected play promise must not double-speak");
    assert.equal(utterances.length, 1);
    utterances[0].onstart?.();
    utterances[0].onend?.();
    await fallback;
  } finally {
    stopKayAudio();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
