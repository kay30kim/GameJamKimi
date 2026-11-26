import assert from "node:assert/strict";
import test from "node:test";
import { parseWarmupArgs, warmupCatalog, warmupPlan, runWarmup, sceneVoiceRequests } from "./warm-generated.mjs";

test("default dry-run covers the actual 10 topics, four ages and both languages without requests", async () => {
  const options = parseWarmupArgs([]);
  const plan = warmupPlan(options, await warmupCatalog());
  assert.equal(plan.length, 80);
  assert.equal(new Set(plan.map(({ lesson }) => lesson)).size, 10);
  assert.ok(plan.every(({ opening, history, wordsLearned }) => opening && history.length === 0 && wordsLearned.length === 0));
  await runWarmup(options, plan, async () => { throw new Error("Dry runs must never call a provider"); }, () => {});
});

test("paid warmup requires an explicit execute flag and a bounded limit", async () => {
  assert.throws(() => parseWarmupArgs(["--execute"]), /limit/);
  assert.throws(() => parseWarmupArgs(["--execute", "--limit", "401"]), /400/);
  assert.throws(() => parseWarmupArgs(["--execute", "--dry-run", "--limit", "1"]), /not both/);
  const options = parseWarmupArgs(["--lesson", "kindness", "--age", "5", "--language", "ko", "--openings", "all", "--execute", "--limit", "2"]);
  const plan = warmupPlan(options, await warmupCatalog());
  assert.equal(plan.length, 2);
  assert.notEqual(plan[0].opening, plan[1].opening);
  assert.ok(plan.every(({ lesson, age, language }) => lesson === "kindness" && age === 5 && language === "ko"));
});

test("voice warmup matches runtime punctuation, roles and practice invitation exactly", () => {
  const requests = sceneVoiceRequests({ narration: "친구가 와요…", lines: [{ speaker: "hero", text: "음⋯ 도와줄까?", emotion: "happy" }], newWords: [{ word: "도와줄까?", meaning: "Can I help?" }] }, "ko");
  assert.deepEqual(requests.map(({ text }) => text), ["친구가 와요...", "음... 도와줄까?", "도와줄까?", "우리 같이 “도와줄까?”라고 말해 볼까?", "잘했어!"]);
  assert.ok(requests.every(({ lang }) => lang === "ko-KR"));
  assert.equal(requests[0].voice, "narrator");
  assert.equal(requests[1].voice, "hero");
  assert.equal(requests[1].emotion, "happy");
});

test("an unsuccessful scene stops warmup before audio or further provider calls", async () => {
  const options = parseWarmupArgs(["--execute", "--limit", "2", "--audio"]);
  let calls = 0;
  const plan = warmupPlan(options, await warmupCatalog());
  await assert.rejects(runWarmup(options, plan, async () => { calls++; return Response.json({}, { headers: { "X-Scene-Mode": "fallback" } }); }, () => {}), /not generated successfully/);
  assert.equal(calls, 1);
});

test("a generated but unsaved scene is not reported as prepared", async () => {
  const options = parseWarmupArgs(["--execute", "--limit", "2", "--audio"]);
  const output = [];
  let calls = 0;
  const plan = warmupPlan(options, await warmupCatalog());
  await assert.rejects(runWarmup(options, plan, async () => {
    calls++;
    return Response.json({}, { headers: { "X-Scene-Mode": "kimi", "X-Scene-Cache": "bypass" } });
  }, (line) => output.push(JSON.parse(line))), /generated but not saved.*Storage/);
  assert.equal(calls, 1);
  assert.ok(output.every((entry) => entry.completed === undefined));
});

test("unsaved audio stops preparation without claiming a completed scene", async () => {
  const options = parseWarmupArgs(["--execute", "--limit", "2", "--audio"]);
  const output = [];
  let calls = 0;
  const plan = warmupPlan(options, await warmupCatalog());
  await assert.rejects(runWarmup(options, plan, async (url) => {
    calls++;
    if (url.endsWith("/api/scene")) return Response.json({ narration: "안녕.", lines: [], newWords: [] }, { headers: { "X-Scene-Mode": "kimi", "X-Scene-Cache": "miss", "X-Generated-Storage": "disk" } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg", "X-Generated-Cache": "BYPASS" } });
  }, (line) => output.push(JSON.parse(line))), /Voice.*not saved.*Storage/);
  assert.equal(calls, 2);
  assert.ok(output.every((entry) => entry.completed === undefined));
});

test("memory-only hits cannot be mistaken for persistent preparation", async () => {
  const options = parseWarmupArgs(["--execute", "--limit", "1"]);
  const plan = warmupPlan(options, await warmupCatalog());
  for (const storage of ["memory", "disabled"]) {
    await assert.rejects(runWarmup(options, plan, async () => Response.json({}, {
      headers: { "X-Scene-Mode": "kimi", "X-Scene-Cache": "hit", "X-Generated-Storage": storage },
    }), () => {}), /not saved.*Storage/);
  }
});

test("successful preparation reports the persistent backend for matching scene and audio", async () => {
  const options = parseWarmupArgs(["--execute", "--limit", "1", "--audio"]);
  const plan = warmupPlan(options, await warmupCatalog());
  const output = [];
  await runWarmup(options, plan, async (url) => url.endsWith("/api/scene")
    ? Response.json({ narration: "안녕.", lines: [], newWords: [] }, { headers: { "X-Scene-Mode": "kimi", "X-Scene-Cache": "hit", "X-Generated-Storage": "blob" } })
    : new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg", "X-Generated-Cache": "HIT", "X-Generated-Storage": "blob" } }), (line) => output.push(JSON.parse(line)));
  assert.deepEqual(output.at(-1), { completed: 1, lesson: plan[0].lesson, age: plan[0].age, language: plan[0].language, opening: plan[0].opening, sceneCache: "hit", storage: "blob", audioClips: 1 });
});
