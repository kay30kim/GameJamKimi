import test from "node:test";
import assert from "node:assert/strict";
import { speakAsync, stopSpeaking, matchesWord } from "./speech";

test("character speech waits for playback and cancels queued turns", async () => {
  const originals = { window: Object.getOwnPropertyDescriptor(globalThis, "window"), audio: Object.getOwnPropertyDescriptor(globalThis, "Audio"), fetch: globalThis.fetch };
  const players: FakeAudio[] = [];
  class FakeAudio {
    src = "";
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    paused = false;
    constructor() { players.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "Audio", { value: FakeAudio, configurable: true });
  globalThis.fetch = async () => new Response(new Blob(["fake audio"], { type: "audio/mpeg" }), { headers: { "content-type": "audio/mpeg" } });
  try {
    let started = false;
    let finished = false;
    const first = speakAsync("Apple", "en-US", () => { started = true; }).then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(started, true);
    assert.equal(finished, false, "listening must not start while Alice is speaking");
    players[0].onended?.();
    await first;
    assert.equal(finished, true);

    const active = speakAsync("Try again", "en-US");
    const queued = speakAsync("Your turn", "en-US");
    await new Promise(resolve => setTimeout(resolve, 20));
    const count = players.length;
    stopSpeaking();
    await Promise.all([active, queued]);
    assert.equal(players.at(-1)?.paused, true);
    assert.equal(players.length, count, "cancelled queued speech must not play");
    assert.equal(matchesWord("apple", "Apple"), true);
    assert.equal(matchesWord("banana", "Apple"), false);
  } finally {
    stopSpeaking();
    globalThis.fetch = originals.fetch;
    if (originals.window) Object.defineProperty(globalThis, "window", originals.window);
    else Reflect.deleteProperty(globalThis, "window");
    if (originals.audio) Object.defineProperty(globalThis, "Audio", originals.audio);
    else Reflect.deleteProperty(globalThis, "Audio");
  }
});
