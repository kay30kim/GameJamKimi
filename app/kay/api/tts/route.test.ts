import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

test("Kay speech validates input before using the provider and keeps character voices distinct", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  const calls: string[] = [];
  process.env.ELEVENLABS_API_KEY = "test-only";
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(new Blob(["audio"], { type: "audio/mpeg" }), { headers: { "Content-Type": "audio/mpeg" } });
  };
  const request = (body: unknown) => new Request("https://story.test/kay/api/tts", { method: "POST", body: JSON.stringify(body) });
  try {
    for (const body of [null, { text: "Hi", language: "en", speaker: "https://untrusted.test" }, { text: "x".repeat(801), language: "en", speaker: "kimi" }, { text: "Hi", language: "invalid", speaker: "kimi" }, { text: "", language: "ko", speaker: "kimi" }]) {
      assert.equal((await POST(request(body))).status, 400);
    }
    assert.equal(calls.length, 0);
    for (const speaker of ["kimi", "momo", "bori"]) assert.equal((await POST(request({ text: "같이 놀자!", language: "ko", speaker }))).status, 200);
    assert.equal(new Set(calls).size, 3);
    globalThis.fetch = async () => new Response("provider payload", { status: 403 });
    const failed = await POST(request({ text: "Hi", language: "en", speaker: "kimi" }));
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes("provider payload"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});
