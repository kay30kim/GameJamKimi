import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditionError, SAMPLES, parseArgs, runCli } from "./typecast-voices.mjs";

const SECRET = "mock-api-key-never-print";
const ID = "tc_catalog_voice";
const ENV = { TYPECAST_API_KEY: SECRET, TYPECAST_MODEL: "ssfm-v31" };
const voice = (overrides = {}) => ({
  voice_id: ID, voice_name: { kor: '아이 <script>alert("name")</script>', eng: "Sample child" },
  age: "child", gender: "female", voice_type: "original",
  models: [{ version: "ssfm-v31", emotions: ["normal", "happy"] }],
  preview_url: "https://static2.typecast.ai/preview/example.mp3",
  ...overrides,
});
const catalog = (voices = [voice()]) => new Response(JSON.stringify(voices), { headers: { "content-type": "application/json" } });
const mp3 = () => new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), { headers: { "content-type": "audio/mpeg; charset=binary" } });
const temp = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kimi-voice-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test("native .env.local loading preserves exported values, including empty ones", async (t) => {
  const cwd = await temp(t);
  await writeFile(join(cwd, ".env.local"), "TYPECAST_API_KEY=file-key\nTYPECAST_MODEL=ssfm-v30\nTYPECAST_EMPTY=file-value\n");
  const moduleUrl = new URL("./typecast-voices.mjs", import.meta.url).href;
  const source = `import {loadLocalEnvironment} from ${JSON.stringify(moduleUrl)};
    loadLocalEnvironment();
    process.stdout.write(JSON.stringify({keyPreserved:process.env.TYPECAST_API_KEY==='exported-key',modelLoaded:process.env.TYPECAST_MODEL==='ssfm-v30',emptyPreserved:process.env.TYPECAST_EMPTY===''}));`;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd, encoding: "utf8", env: { TYPECAST_API_KEY: "exported-key", TYPECAST_EMPTY: "" },
  });
  assert.deepEqual(JSON.parse(output), { keyPreserved: true, modelLoaded: true, emptyPreserved: true });
});

test("help needs no key or requests; invalid options and Studio IDs fail early", async () => {
  const logs = [];
  await runCli(["--help"], { env: {}, log: (s) => logs.push(s), fetchImpl: () => assert.fail("Help must not request a catalog") });
  assert.match(logs.join(""), /list \[--all\]/);
  assert.throws(() => parseArgs(["sample", "--voice", "6ae2b38a6c6f117dcc049386"]), /Studio actor IDs/);
  assert.throws(() => parseArgs(["sample", "--voice", ID, "--output"]), /needs one value/);
  assert.throws(() => parseArgs(["list", "--all", "--all"]), /repeated option/);
  await assert.rejects(runCli(["list"], { env: {}, fetchImpl: () => assert.fail("No key must mean no request") }), /TYPECAST_API_KEY/);
});

test("list defaults to child originals and --all includes adult catalog metadata", async () => {
  const adult = voice({ voice_id: "tc_adult_voice", age: "middle_age", preview_url: null });
  const custom = voice({ voice_id: "uc_custom_voice", voice_type: "custom" });
  const otherModel = voice({ voice_id: "tc_other_model", models: [{ version: "ssfm-v30", emotions: ["normal"] }] });
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return catalog([voice(), adult, custom, otherModel]);
  };
  const first = await runCli(["list"], { env: ENV, fetchImpl, log: (s) => logs.push(s) });
  assert.deepEqual(first.voices.map((v) => v.voice_id), [ID]);
  assert.equal(calls[0].url.pathname, "/v3/voices");
  assert.equal(calls[0].url.searchParams.get("age"), "child");
  assert.equal(calls[0].url.searchParams.get("model"), "ssfm-v31");
  assert.equal(calls[0].url.searchParams.get("voice_type"), "original");
  assert.equal(calls[0].options.headers["X-API-KEY"], SECRET);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const second = await runCli(["list", "--all"], { env: ENV, fetchImpl, log: (s) => logs.push(s) });
  assert.equal(calls[1].url.searchParams.has("age"), false);
  assert.deepEqual(second.voices.map((v) => v.voice_id), [ID, "tc_adult_voice"]);
  const printed = JSON.parse(logs[0]);
  assert.deepEqual(printed.voices[0].models[0].emotions, ["normal", "happy"]);
  assert.equal(printed.voices[0].preview_url, voice().preview_url);
  assert.ok(!logs.join("").includes(SECRET));
});

test("unknown voices and unsupported model combinations never make a sample request", async (t) => {
  const cwd = await temp(t);
  for (const voices of [[], [voice({ models: [{ version: "ssfm-v30", emotions: ["normal"] }] })]]) {
    const calls = [];
    await assert.rejects(runCli(["sample", "--voice", ID], {
      env: ENV, cwd, log: () => {}, fetchImpl: async (url, options) => { calls.push(options.method); assert.ok(url.includes("/v3/voices?")); return catalog(voices); },
    }), /No sample request was made/);
    assert.deepEqual(calls, ["GET"]);
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("audition writes three local MP3s with correct language/emotion and escaped HTML", async (t) => {
  const cwd = await temp(t);
  const posts = [];
  const logs = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers["X-API-KEY"], SECRET);
    if (options.method === "GET") return catalog();
    assert.equal(new URL(url).pathname, "/v1/text-to-speech");
    posts.push(JSON.parse(options.body));
    return mp3();
  };
  const first = await runCli(["sample", "--voice", ID], { env: ENV, cwd, fetchImpl, log: (s) => logs.push(s) });
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map((p) => p.text), SAMPLES.map((s) => s.text));
  assert.equal(posts[0].language, "kor");
  assert.equal(Object.hasOwn(posts[1], "language"), false);
  assert.equal(posts[2].language, "kor");
  assert.deepEqual(posts.map((p) => p.prompt), [
    { emotion_type: "smart" },
    { emotion_type: "smart" },
    { emotion_type: "preset", emotion_preset: "happy", emotion_intensity: 1 },
  ]);
  for (const body of posts) {
    assert.equal(body.voice_id, ID);
    assert.equal(body.model, "ssfm-v31");
    assert.deepEqual(body.output, { audio_format: "mp3", audio_pitch: 0, audio_tempo: 0.95 });
  }
  const html = await readFile(first.page, "utf8");
  assert.equal((html.match(/<audio /g) || []).length, 3);
  assert.match(html, /&lt;script&gt;alert\(&quot;name&quot;\)&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>alert("name")'));
  assert.ok(!html.includes(SECRET));
  assert.ok(!logs.join("").includes(SECRET));
  assert.ok(!/src="https?:/.test(html));
  assert.match(html, /3\/3개 생성/);
  assert.match(html, /언어 자동 감지/);
  assert.deepEqual((await readdir(first.directory)).sort(), [...SAMPLES.map((s) => s.file), "index.html"].sort());
  const firstBytes = await readFile(join(first.directory, SAMPLES[0].file));
  const second = await runCli(["sample", "--voice", ID], { env: ENV, cwd, fetchImpl, log: () => {} });
  assert.notEqual(first.directory, second.directory);
  assert.deepEqual(await readFile(join(first.directory, SAMPLES[0].file)), firstBytes);
});

test("v30 voice without happy uses the runtime smart prompt and records it", async (t) => {
  const cwd = await temp(t);
  const posts = [];
  const result = await runCli(["sample", "--voice", ID, "--output", "custom-output"], {
    env: { ...ENV, TYPECAST_MODEL: "ssfm-v30" }, cwd, log: () => {},
    fetchImpl: async (url, options) => {
      if (options.method === "GET") {
        assert.equal(new URL(url).searchParams.get("model"), "ssfm-v30");
        return catalog([voice({ models: [{ version: "ssfm-v30", emotions: ["normal"] }] })]);
      }
      posts.push(JSON.parse(options.body)); return mp3();
    },
  });
  assert.ok(result.directory.startsWith(join(cwd, "custom-output")));
  assert.equal(posts.length, 3);
  assert.ok(posts.every((p) => p.model === "ssfm-v30" && p.prompt.emotion_type === "smart"));
  assert.equal(result.completed[2].emotion, "smart");
  assert.match(await readFile(result.page, "utf8"), /문맥에 맞는 감정/);
});

test("HTTP and network errors do not print provider bodies, keys, or nested causes", async () => {
  for (const fetchImpl of [
    async () => new Response(`API key ${SECRET} rejected`, { status: 401 }),
    async () => { throw new Error(`Request ${SECRET}`, { cause: { headers: { key: SECRET } } }); },
  ]) {
    const logs = [];
    await assert.rejects(runCli(["list"], { env: ENV, fetchImpl, log: (s) => logs.push(s) }), (error) => {
      assert.ok(error instanceof AuditionError);
      assert.ok(!error.message.includes(SECRET));
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.ok(!logs.join("").includes(SECRET));
  }
});

test("bad second audio stops generation while preserving the first playable sample", async (t) => {
  const cwd = await temp(t);
  let posts = 0;
  const logs = [];
  await assert.rejects(runCli(["sample", "--voice", ID], {
    env: ENV, cwd, log: (s) => logs.push(s), fetchImpl: async (_url, options) => {
      if (options.method === "GET") return catalog();
      posts++;
      return posts === 1 ? mp3() : new Response(`not audio ${SECRET}`, { headers: { "content-type": "application/json" } });
    },
  }), /did not return MP3/);
  assert.equal(posts, 2);
  const base = join(cwd, "tmp/voice-auditions");
  const directory = join(base, (await readdir(base))[0]);
  assert.deepEqual((await readdir(directory)).sort(), ["01-apple.mp3", "index.html"]);
  const html = await readFile(join(directory, "index.html"), "utf8");
  assert.equal((html.match(/<audio /g) || []).length, 1);
  assert.match(html, /1\/3개 생성/);
  assert.ok(!html.includes(SECRET));
  assert.ok(!logs.some((s) => s.startsWith("Ready:")));
});

test("empty audio is rejected and each request receives a bounded timeout signal", async (t) => {
  const cwd = await temp(t);
  const timeouts = [];
  const original = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds) => { timeouts.push(milliseconds); return original(milliseconds); });
  let posts = 0;
  await assert.rejects(runCli(["sample", "--voice", ID], {
    env: ENV, cwd, log: () => {}, fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      if (options.method === "GET") return catalog();
      posts++;
      return new Response(new Uint8Array(), { headers: { "content-type": "audio/mpeg" } });
    },
  }), /empty audio/);
  assert.equal(posts, 1);
  assert.deepEqual(timeouts, [30_000, 30_000]);
});
