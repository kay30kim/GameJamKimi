import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { POST } from "./route";
import { VOICES } from "../../../lib/voices";
import type { Voice } from "../../../lib/voices";
import { TYPECAST_CAST } from "../../../lib/typecast";
import * as generatedCache from "../../../lib/generated-cache";

const roles = Object.keys(VOICES) as Voice[];
const childRoles: Voice[] = ["hero", "friend", "puppy", "kitten", "duck"];
const api = "https://api.typecast.ai";
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
let fixtureId = 0;

function environment(t: TestContext, changes: Record<string, string | undefined> = {}) {
  t.mock.method(console, "warn", () => {});
  const values: Record<string, string | undefined> = {
    TYPECAST_API_KEY: "test-typecast-key",
    TYPECAST_MODEL: undefined,
    ELEVENLABS_API_KEY: "test-eleven-key",
    ELEVENLABS_VOICE_ID: undefined,
    GENERATED_CACHE_DISABLED: "1",
  };
  const ids = {} as Record<Voice, string>;
  for (const role of roles) {
    ids[role] = `tc_test_${role}_${++fixtureId}`;
    values[`TYPECAST_VOICE_${role.toUpperCase()}`] = ids[role];
  }
  Object.assign(values, changes);
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return ids;
}

function request(body: unknown = { text: "안녕, 친구야!", lang: "ko-KR", voice: "hero" }, signal?: AbortSignal) {
  return new Request("http://localhost/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
}

function voiceDetails(id: string, age = "child", model = "ssfm-v31", emotions = ["normal", "happy", "sad"]) {
  return {
    voice_id: id, age, voice_name: { eng: "Test voice", kor: "테스트 목소리" },
    models: [{ version: model, emotions }],
  };
}

const mp3 = (type = "audio/mpeg", bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04])) =>
  new Response(bytes, { headers: { "Content-Type": type } });

interface Call { url: string; options: RequestInit }
function provider(t: TestContext, options: {
  metadata?: (id: string, init: RequestInit) => Response | Promise<Response>;
  audio?: (init: RequestInit) => Response | Promise<Response>;
} = {}) {
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, options: init });
    if (url.startsWith(`${api}/v3/voices/`)) {
      const id = decodeURIComponent(url.slice(`${api}/v3/voices/`.length));
      return options.metadata ? options.metadata(id, init) : Response.json(voiceDetails(id));
    }
    if (url === `${api}/v1/text-to-speech`) return options.audio ? options.audio(init) : mp3();
    throw new Error(`Unexpected provider: ${url}`);
  });
  return calls;
}

async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
}

function syntheses(calls: Call[]) {
  return calls.filter(({ url }) => url === `${api}/v1/text-to-speech`);
}

function cache(t: TestContext) {
  const files = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const writes: string[] = [];
  t.mock.method(generatedCache, "readGenerated", async (namespace: string, key: string) => {
    assert.equal(namespace, "tts");
    assert.match(key, /^[a-f0-9]{64}$/);
    reads.push(key);
    return files.get(key) ?? null;
  });
  t.mock.method(generatedCache, "writeGenerated", async (namespace: string, key: string, bytes: Uint8Array, contentType: string) => {
    assert.equal(namespace, "tts");
    assert.equal(contentType, "audio/mpeg");
    writes.push(key);
    files.set(key, bytes.slice());
    return true;
  });
  return { files, reads, writes };
}

test("Korean requires its own Typecast key and never falls through to configured ElevenLabs", async (t) => {
  environment(t, { TYPECAST_API_KEY: "  " });
  const calls = provider(t);
  await error(await POST(request()), 503, "TTS_NOT_CONFIGURED");
  assert.equal(calls.length, 0);
});

test("a deployment with only the API key uses the reviewed cast for every Korean role", async (t) => {
  environment(t);
  const calls = provider(t);
  assert.equal(new Set(Object.values(TYPECAST_CAST)).size, roles.length);
  for (const role of roles) {
    const key = `TYPECAST_VOICE_${role.toUpperCase()}`;
    delete process.env[key];
    const response = await POST(request({ text: "안녕하세요", lang: "ko-KR", voice: role }));
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(String(syntheses(calls).at(-1)!.options.body)).voice_id, TYPECAST_CAST[role]);
  }
  assert.equal(syntheses(calls).length, roles.length);
});

test("blank optional cast overrides keep the reviewed default while explicit overrides are respected", async (t) => {
  const ids = environment(t, { TYPECAST_VOICE_HERO: "  " });
  const calls = provider(t);
  assert.equal((await POST(request())).status, 200);
  assert.equal(JSON.parse(String(syntheses(calls)[0].options.body)).voice_id, TYPECAST_CAST.hero);
  assert.equal((await POST(request({ text: "같이 놀자!", lang: "ko-KR", voice: "friend" }))).status, 200);
  assert.equal(JSON.parse(String(syntheses(calls)[1].options.body)).voice_id, ids.friend);
});

test("a Studio actor identifier cannot be mistaken for an API voice identifier", async (t) => {
  environment(t, { TYPECAST_VOICE_HERO: "5c3c52ca5827e0000800656b" });
  const calls = provider(t);
  await error(await POST(request()), 503, "TTS_NOT_CONFIGURED");
  assert.equal(calls.length, 0);
});

test("pure Korean validates the selected voice and sends a pitch-neutral Typecast MP3 request", async (t) => {
  const ids = environment(t);
  const calls = provider(t);
  const response = await POST(request({ text: "  안녕, 친구야!  ", lang: "ko-KR", voice: "hero", emotion: "happy" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x49, 0x44, 0x33, 0x04]);
  assert.equal(calls[0].url, `${api}/v3/voices/${ids.hero}`);
  assert.equal(calls[0].options.method ?? "GET", "GET");
  assert.equal(calls.length, 2);
  for (const { options } of calls) {
    assert.equal(new Headers(options.headers).get("x-api-key"), "test-typecast-key");
    assert.ok(options.signal, "metadata and generation both need an abort signal");
  }
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
    model: "ssfm-v31", voice_id: ids.hero, text: "안녕, 친구야!", language: "KOR",
    output: { audio_format: "mp3", audio_pitch: 0, audio_tempo: 0.95 },
    prompt: { emotion_type: "preset", emotion_preset: "happy", emotion_intensity: 1 },
  });
});

test("Hangul inside an English request always selects Typecast and leaves mixed-language detection automatic", async (t) => {
  environment(t);
  const calls = provider(t);
  for (const lang of ["en-US", "ko-KR"]) {
    const response = await POST(request({ text: "“주세요” means please in English.", lang, voice: "hero" }));
    assert.equal(response.status, 200);
    const body = JSON.parse(String(syntheses(calls).at(-1)!.options.body));
    assert.equal(Object.hasOwn(body, "language"), false, "forcing KOR would mishandle the English explanation");
  }
  assert.equal(syntheses(calls).length, 2);
  assert.ok(calls.every(({ url }) => url.startsWith(`${api}/`)));
});

test("decomposed Hangul also selects Typecast, and a Korean locale does not fall through for Latin-only text", async (t) => {
  environment(t);
  const calls = provider(t);
  for (const [text, lang] of [["Hello, 안녕", "en-US"], ["Hello!", "ko-KR"]]) {
    assert.equal((await POST(request({ text, lang, voice: "hero" }))).status, 200);
  }
  assert.equal(syntheses(calls).length, 2);
  assert.ok(calls.every(({ url }) => url.startsWith(`${api}/`)));
});

test("every child character rejects an adult voice before generating audio", async (t) => {
  environment(t);
  const calls = provider(t, { metadata: (id) => Response.json(voiceDetails(id, "young_adult")) });
  for (const voice of childRoles) {
    await error(await POST(request({ text: "같이 놀자!", lang: "ko-KR", voice })), 503, "TTS_NOT_CONFIGURED");
  }
  assert.equal(syntheses(calls).length, 0);
  assert.equal(calls.length, childRoles.length);
});

test("narrator is the default and adult narrator/grownup voices remain valid", async (t) => {
  const ids = environment(t);
  const calls = provider(t, { metadata: (id) => Response.json(voiceDetails(id, "old_adult")) });
  assert.equal((await POST(request({ text: "친구들이 만났어요.", lang: "ko-KR" }))).status, 200);
  assert.equal((await POST(request({ text: "천천히 말해도 돼.", lang: "ko-KR", voice: "grownup" }))).status, 200);
  assert.deepEqual(syntheses(calls).map(({ options }) => JSON.parse(String(options.body)).voice_id), [ids.narrator, ids.grownup]);
});

test("configured model must be supported by the selected voice, and supported v30 is used explicitly", async (t) => {
  environment(t, { TYPECAST_MODEL: "ssfm-v30" });
  let supported = false;
  const calls = provider(t, { metadata: (id) => Response.json(voiceDetails(id, "child", supported ? "ssfm-v30" : "ssfm-v31")) });
  await error(await POST(request()), 503, "TTS_NOT_CONFIGURED");
  assert.equal(syntheses(calls).length, 0);
  supported = true;
  assert.equal((await POST(request())).status, 200);
  assert.equal(JSON.parse(String(syntheses(calls)[0].options.body)).model, "ssfm-v30");
});

test("invalid Typecast model configuration fails without generating from another provider", async (t) => {
  environment(t, { TYPECAST_MODEL: "unreviewed-model" });
  const calls = provider(t);
  await error(await POST(request()), 503, "TTS_NOT_CONFIGURED");
  assert.equal(syntheses(calls).length, 0);
});

test("happy/sad use supported presets, excitement maps to happy, and other emotions stay smart", async (t) => {
  environment(t);
  const calls = provider(t);
  for (const emotion of ["happy", "sad", "excited", "curious", "surprised", undefined]) {
    assert.equal((await POST(request({ text: "친구야, 이야기해 줘.", lang: "ko-KR", voice: "hero", emotion }))).status, 200);
    const { prompt } = JSON.parse(String(syntheses(calls).at(-1)!.options.body));
    assert.deepEqual(prompt, emotion === "happy" || emotion === "sad" || emotion === "excited"
      ? { emotion_type: "preset", emotion_preset: emotion === "excited" ? "happy" : emotion, emotion_intensity: 1 }
      : { emotion_type: "smart" });
  }
});

test("an unavailable emotion preset falls back to smart without switching the cast", async (t) => {
  const ids = environment(t);
  const calls = provider(t, { metadata: (id) => Response.json(voiceDetails(id, "child", "ssfm-v31", ["normal"])) });
  assert.equal((await POST(request({ text: "정말 기뻐!", lang: "ko-KR", voice: "hero", emotion: "happy" }))).status, 200);
  const body = JSON.parse(String(syntheses(calls)[0].options.body));
  assert.deepEqual(body.prompt, { emotion_type: "smart" });
  assert.equal(body.voice_id, ids.hero);
});

test("malformed input, unknown actors/emotions/locales, and empty text never contact a provider", async (t) => {
  environment(t);
  const calls = provider(t);
  const invalid: unknown[] = [null, [], "hello", {}, { text: 4, lang: "ko-KR" }, { text: "안녕" },
    { text: "   ", lang: "ko-KR" }, { text: "안녕", lang: "fr-FR" },
    { text: "안녕", lang: "ko-KR", voice: "unknown" }, { text: "안녕", lang: "ko-KR", voice: "toString" },
    { text: "안녕", lang: "ko-KR", emotion: "angry" }, { text: "안녕", lang: "ko-KR", emotion: null }];
  for (const body of invalid) await error(await POST(request(body)), 400, "INVALID_REQUEST");
  await error(await POST(new Request("http://localhost/api/tts", { method: "POST", body: "{" })), 400, "INVALID_REQUEST");
  assert.equal(calls.length, 0);
});

test("Typecast's 2000-character cap also applies to mixed-language requests", async (t) => {
  environment(t);
  const calls = provider(t);
  for (const [text, lang] of [["가".repeat(2000), "ko-KR"], ["가" + "a".repeat(1999), "en-US"]]) {
    assert.equal((await POST(request({ text, lang, voice: "hero" }))).status, 200);
    await error(await POST(request({ text: text + "a", lang, voice: "hero" })), 400, "INVALID_REQUEST");
  }
  assert.equal(syntheses(calls).length, 2);
});

test("metadata HTTP/network/JSON failures stop before synthesis and can recover on a fresh request", async (t) => {
  environment(t);
  let mode = "http";
  const calls = provider(t, { metadata: (id) => {
    if (mode === "http") return new Response(null, { status: 401 });
    if (mode === "network") throw new Error("provider unavailable");
    if (mode === "json") return new Response("not json", { headers: { "Content-Type": "application/json" } });
    return Response.json(voiceDetails(id));
  } });
  for (mode of ["http", "network", "json"]) await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(syntheses(calls).length, 0);
  mode = "healthy";
  assert.equal((await POST(request())).status, 200);
  assert.equal(syntheses(calls).length, 1);
});

test("malformed voice metadata is rejected rather than treated as verified child casting", async (t) => {
  environment(t);
  const calls = provider(t, { metadata: () => Response.json({ voice_id: 42, models: "ssfm-v31" }) });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(syntheses(calls).length, 0);
});

test("valid-looking metadata for a different child voice cannot authorize the configured cast", async (t) => {
  environment(t);
  const calls = provider(t, { metadata: () => Response.json(voiceDetails("tc_some_other_child")) });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(syntheses(calls).length, 0);
});

test("provider HTTP failures never fall back to ElevenLabs, and a later request can recover", async (t) => {
  environment(t);
  let fail = true;
  const calls = provider(t, { audio: () => fail ? new Response(null, { status: 503 }) : mp3() });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  fail = false;
  assert.equal((await POST(request())).status, 200);
  assert.equal(syntheses(calls).length, 2);
  assert.ok(calls.every(({ url }) => url.startsWith(`${api}/`)));
});

test("WAV, JSON, missing content type, and empty audio are rejected instead of mislabeled MP3", async (t) => {
  environment(t);
  const responses = [mp3("audio/wav"), Response.json({ url: "https://example.com/audio.mp3" }),
    new Response(new Uint8Array([1, 2])), mp3("audio/mpeg", new Uint8Array())];
  const calls = provider(t, { audio: () => responses.shift()! });
  for (let i = 0; i < 4; i++) await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(syntheses(calls).length, 4);
});

test("audio/mp3 upstream responses normalize to the browser's audio/mpeg contract", async (t) => {
  environment(t);
  provider(t, { audio: () => mp3("audio/mp3; charset=binary") });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
});

test("English-only speech preserves ElevenLabs casting, narrator override, and its 4000-character cap", async (t) => {
  environment(t, { TYPECAST_API_KEY: undefined, ELEVENLABS_VOICE_ID: "test-storyteller" });
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(input), options });
    return mp3();
  });
  assert.equal((await POST(request({ text: "Hello, friends!", lang: "en-US", voice: "hero" }))).status, 200);
  assert.equal((await POST(request({ text: "a".repeat(4000), lang: "en-US" }))).status, 200);
  await error(await POST(request({ text: "a".repeat(4001), lang: "en-US" })), 400, "INVALID_REQUEST");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://api.elevenlabs.io/v1/text-to-speech/${VOICES.hero.id}`);
  assert.equal(calls[1].url, "https://api.elevenlabs.io/v1/text-to-speech/test-storyteller");
  const body = JSON.parse(String(calls[0].options.body));
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.language_code, "en");
  assert.equal(body.voice_settings.speed, VOICES.hero.speed);
  assert.equal(new Headers(calls[0].options.headers).get("xi-api-key"), "test-eleven-key");
});

function pendingUntilAbort(init: RequestInit, observe: (signal: AbortSignal) => void) {
  assert.ok(init.signal);
  const signal = init.signal;
  observe(signal);
  return new Promise<Response>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

for (const phase of ["metadata", "synthesis"] as const) {
  test(`client cancellation aborts ${phase} and does not start a fallback request`, async (t) => {
    environment(t);
    let upstreamSignal: AbortSignal | undefined;
    const hold = (init: RequestInit) => pendingUntilAbort(init, (signal) => { upstreamSignal = signal; });
    const calls = provider(t, phase === "metadata" ? { metadata: (_id, init) => hold(init) } : { audio: hold });
    const controller = new AbortController();
    const result = POST(request(undefined, controller.signal));
    await flush();
    assert.ok(upstreamSignal);
    controller.abort();
    await error(await result, 499, "TTS_UPSTREAM_ERROR");
    assert.equal(upstreamSignal.aborted, true);
    assert.equal(calls.length, phase === "metadata" ? 1 : 2);
  });

  test(`the 18-second server deadline aborts stalled ${phase} with a timeout response`, async (t) => {
    environment(t);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let upstreamSignal: AbortSignal | undefined;
    const hold = (init: RequestInit) => pendingUntilAbort(init, (signal) => { upstreamSignal = signal; });
    const calls = provider(t, phase === "metadata" ? { metadata: (_id, init) => hold(init) } : { audio: hold });
    const result = POST(request());
    await flush();
    assert.ok(upstreamSignal);
    t.mock.timers.tick(18_000);
    await error(await result, 504, "TTS_TIMEOUT");
    assert.equal(upstreamSignal.aborted, true);
    assert.equal(calls.length, phase === "metadata" ? 1 : 2);
  });
}

test("the deadline also covers a stalled audio body after successful response headers", async (t) => {
  environment(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let upstreamSignal: AbortSignal | undefined;
  provider(t, { audio: (init) => {
    assert.ok(init.signal);
    upstreamSignal = init.signal;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    } });
    return new Response(body, { headers: { "Content-Type": "audio/mpeg" } });
  } });
  const result = POST(request());
  await flush();
  assert.ok(upstreamSignal);
  t.mock.timers.tick(18_000);
  await error(await result, 504, "TTS_TIMEOUT");
  assert.equal(upstreamSignal.aborted, true);
});

test("an exact clip is persisted once and replayed without metadata or synthesis calls", async (t) => {
  environment(t);
  const storage = cache(t);
  const calls = provider(t);
  const first = await POST(request({ text: "  같이 놀자!  ", lang: "ko-KR", voice: "hero", emotion: "happy" }));
  const second = await POST(request({ text: "같이 놀자!", lang: "KO_kr", voice: "hero", emotion: "happy" }));
  assert.equal(first.headers.get("x-generated-cache"), "MISS");
  assert.equal(second.headers.get("x-generated-cache"), "HIT");
  assert.deepEqual(await first.arrayBuffer(), await second.arrayBuffer());
  assert.equal(calls.length, 2, "one metadata lookup and one paid synthesis");
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.reads[0], storage.reads[1]);
});

test("clip identity includes text, locale, role, emotion, real voice, model, and account", async (t) => {
  environment(t);
  const storage = cache(t);
  const calls = provider(t, { metadata: (id) => Response.json({ ...voiceDetails(id), models: [
    { version: "ssfm-v31", emotions: ["happy", "sad", "normal"] },
    { version: "ssfm-v30", emotions: ["happy", "sad", "normal"] },
  ] }) });
  const base = { text: "도와줄까? Can I help?", lang: "ko-KR", voice: "hero", emotion: "happy" };
  for (const change of [{}, { text: "도와줘! Please help!" }, { lang: "en-US" }, { voice: "friend" }, { emotion: "sad" }]) {
    assert.equal((await POST(request({ ...base, ...change }))).status, 200);
  }
  process.env.TYPECAST_VOICE_HERO = "tc_recast_child";
  assert.equal((await POST(request(base))).status, 200);
  process.env.TYPECAST_MODEL = "ssfm-v30";
  assert.equal((await POST(request(base))).status, 200);
  process.env.TYPECAST_API_KEY = "another-account-key";
  assert.equal((await POST(request(base))).status, 200);
  assert.equal(syntheses(calls).length, 8);
  assert.equal(new Set(storage.writes).size, 8);
  assert.ok(storage.writes.every((key) => !key.includes("account") && !key.includes("도와")));
});

test("English characters sharing a voice ID still cache their distinct speeds separately", async (t) => {
  environment(t);
  const storage = cache(t);
  const payloads: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit = {}) => {
    payloads.push(JSON.parse(String(init.body)));
    return mp3();
  });
  for (const voice of ["hero", "duck", "hero"]) {
    assert.equal((await POST(request({ text: "Can I help?", lang: "en-US", voice }))).status, 200);
  }
  assert.equal(VOICES.hero.id, VOICES.duck.id);
  assert.equal(payloads.length, 2);
  assert.notDeepEqual(payloads[0].voice_settings, payloads[1].voice_settings);
  assert.equal(new Set(storage.writes).size, 2);
});

test("only successful MP3 clips are stored, and corrupt cached bytes are regenerated", async (t) => {
  environment(t);
  const storage = cache(t);
  let mode = "http";
  const calls = provider(t, { audio: () => mode === "http" ? new Response(null, { status: 503 })
    : mode === "invalid" ? mp3("audio/mpeg", new Uint8Array([1, 2, 3])) : mp3() });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  mode = "invalid";
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(storage.writes.length, 0);
  storage.files.set(storage.reads[0], new Uint8Array([9, 8, 7]));
  mode = "healthy";
  const recovered = await POST(request());
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-generated-cache"), "MISS");
  assert.equal(storage.writes.length, 1);
  assert.equal(syntheses(calls).length, 3);
});

test("storage outages fail open and leave playback available", async (t) => {
  environment(t);
  t.mock.method(generatedCache, "readGenerated", async () => { throw new Error("store unavailable"); });
  t.mock.method(generatedCache, "writeGenerated", async () => { throw new Error("store unavailable"); });
  const calls = provider(t);
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-generated-cache"), "BYPASS");
  assert.equal(syntheses(calls).length, 1);
});

test("concurrent identical requests share one synthesis and a cancelled subscriber cannot stop another", async (t) => {
  environment(t);
  const storage = cache(t);
  let complete!: (response: Response) => void;
  let signal!: AbortSignal;
  const calls = provider(t, { audio: (init) => {
    signal = init.signal!;
    return new Promise((resolve) => { complete = resolve; });
  } });
  const controller = new AbortController();
  const first = POST(request(undefined, controller.signal));
  const second = POST(request());
  await flush();
  assert.equal(syntheses(calls).length, 1);
  controller.abort();
  await error(await first, 499, "TTS_UPSTREAM_ERROR");
  assert.equal(signal.aborted, false);
  complete(mp3());
  assert.equal((await second).status, 200);
  assert.equal(storage.writes.length, 1);
});

test("cancelling the final subscriber stops synthesis and the next request can retry", async (t) => {
  environment(t);
  const storage = cache(t);
  let pending = true;
  let signal!: AbortSignal;
  const calls = provider(t, { audio: (init) => pending ? pendingUntilAbort(init, (value) => { signal = value; }) : mp3() });
  const controller = new AbortController();
  const first = POST(request(undefined, controller.signal));
  await flush();
  controller.abort();
  await error(await first, 499, "TTS_UPSTREAM_ERROR");
  assert.equal(signal.aborted, true);
  assert.equal(storage.writes.length, 0);
  pending = false;
  assert.equal((await POST(request())).status, 200);
  assert.equal(syntheses(calls).length, 2);
  assert.equal(storage.writes.length, 1);
});

test("validated voice metadata is reused across different lines", async (t) => {
  environment(t);
  const calls = provider(t);
  assert.equal((await POST(request({ text: "첫 번째 대사야.", lang: "ko-KR", voice: "hero" }))).status, 200);
  assert.equal((await POST(request({ text: "두 번째 대사야.", lang: "ko-KR", voice: "hero" }))).status, 200);
  assert.equal(syntheses(calls).length, 2);
  assert.equal(calls.filter(({ url }) => url.startsWith(`${api}/v3/voices/`)).length, 1);
});

test("provider failure logs expose stage and HTTP status without credentials or dialogue", async (t) => {
  environment(t);
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  let metadataFails = true;
  provider(t, {
    metadata: (id) => metadataFails ? new Response(null, { status: 401 }) : Response.json(voiceDetails(id)),
    audio: () => new Response("private provider details", { status: 429 }),
  });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  metadataFails = false;
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.deepEqual(warnings, [
    ["[tts] provider request failed", { provider: "typecast", stage: "voice-metadata", status: 401, contentType: "other", server: "other", category: "unknown" }],
    ["[tts] provider request failed", { provider: "typecast", stage: "synthesis", status: 429, contentType: "text", server: "other", category: "unknown" }],
  ]);
  const logged = JSON.stringify(warnings);
  for (const privateValue of ["test-typecast-key", "안녕, 친구야!", "private provider details", process.env.TYPECAST_VOICE_HERO!]) {
    assert.equal(logged.includes(privateValue), false);
  }
});

test("provider diagnostics distinguish edge denial from JSON permission errors without logging bodies", async (t) => {
  environment(t);
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const failures = [
    new Response("<html>Request blocked by CloudFront. private-request-id</html>", { status: 403, headers: { "Content-Type": "text/html", Server: "CloudFront" } }),
    Response.json({ error: { code: "PERMISSION_DENIED", message: "Starter plan unavailable: private-account-detail" } }, { status: 403 }),
    Response.json({ detail: { code: "SECRET_API_KEY" }, message: "IP address not allowed: 192.0.2.1" }, { status: 403 }),
    Response.json({ error: { code: "PRIVATE DIALOGUE" } }, { status: 403 }),
    Response.json({ error_code: "PERMISSION_DENIED", message: "This is a dormant account: private-account-id" }, { status: 403 }),
  ];
  provider(t, { audio: () => failures.shift()! });
  for (let i = 0; i < 5; i++) await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.deepEqual(warnings.map((entry) => entry[1]), [
    { provider: "typecast", stage: "synthesis", status: 403, contentType: "html", server: "cloudfront", category: "waf" },
    { provider: "typecast", stage: "synthesis", status: 403, contentType: "json", server: "other", category: "plan", code: "PERMISSION_DENIED" },
    { provider: "typecast", stage: "synthesis", status: 403, contentType: "json", server: "other", category: "ip" },
    { provider: "typecast", stage: "synthesis", status: 403, contentType: "json", server: "other", category: "unknown" },
    { provider: "typecast", stage: "synthesis", status: 403, contentType: "json", server: "other", category: "auth", code: "PERMISSION_DENIED" },
  ]);
  const logged = JSON.stringify(warnings);
  for (const value of ["private-request-id", "private-account-detail", "private-account-id", "192.0.2.1", "SECRET_API_KEY", "PRIVATE DIALOGUE"]) assert.equal(logged.includes(value), false);
});

test("provider diagnostic reads are bounded and a stalled error body cannot hang a failed request", async (t) => {
  environment(t);
  let cancelled = false;
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  provider(t, { audio: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 403 }) });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal(cancelled, true);
  assert.equal(warnings.length, 1);
  assert.equal((warnings[0][1] as { category: string }).category, "unknown");

  provider(t, { audio: () => new Response(" ".repeat(8192) + "secret API key", { status: 403 }) });
  await error(await POST(request()), 502, "TTS_UPSTREAM_ERROR");
  assert.equal((warnings[1][1] as { category: string }).category, "unknown", "text beyond the prefix is never inspected");
});
