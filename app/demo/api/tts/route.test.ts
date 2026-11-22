import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

test("demo voices stay isolated and choose an allowed speaker", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  const mainVoice = process.env.ELEVENLABS_VOICE_ID;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  process.env.ELEVENLABS_API_KEY = "test-only";
  globalThis.fetch = async (url, init) => {
    calls.push({url: String(url), body: JSON.parse(String(init?.body))});
    return new Response(new Blob(["audio"], {type:"audio/mpeg"}), {headers:{"Content-Type":"audio/mpeg"}});
  };
  const request = (speaker: string) => new Request("http://localhost/demo/api/tts", {method:"POST",body:JSON.stringify({text:"우와, 사과다!", lang:"ko-KR",speaker})});
  try {
    assert.equal((await POST(request("alice"))).status, 200);
    assert.equal((await POST(request("momo"))).status, 200);
    assert.ok(calls[0].url.endsWith(process.env.ELEVENLABS_DEMO_VOICE_ID?.trim() || "cgSgspJ2msm6clMCkdW9"));
    assert.ok(calls[1].url.endsWith(process.env.ELEVENLABS_DEMO_MOMO_VOICE_ID?.trim() || "TX3LPaxmHKxFdv7VOQHJ"));
    assert.equal(calls[0].body.language_code, "ko");
    assert.deepEqual(calls[0].body.voice_settings, {stability:.38,similarity_boost:.75,style:.35,speed:.92,use_speaker_boost:true});
    assert.equal((await POST(request("untrusted-voice-id"))).status,400);
    assert.equal(calls.length,2);
    assert.equal(process.env.ELEVENLABS_VOICE_ID,mainVoice);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});
