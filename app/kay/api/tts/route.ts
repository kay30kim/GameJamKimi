import { KAY_VOICES } from "../../../../lib/kay/voices";
import type { Speaker } from "../../../../lib/kay/types";

export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid voice request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid voice request." }, { status: 400 });
  const { text, language, speaker } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > 800 ||
      (language !== "ko" && language !== "en") || typeof speaker !== "string" ||
      !Object.hasOwn(KAY_VOICES, speaker)) {
    return Response.json({ error: "Expected a short line, language, and character." }, { status: 400 });
  }
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return Response.json({ error: "Character voices are unavailable." }, { status: 503 });
  const voice = KAY_VOICES[speaker as Speaker];
  const override = process.env[`KAY_VOICE_${speaker.toUpperCase()}`]?.trim();
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(override || voice.id)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        model_id: process.env.KAY_TTS_MODEL?.trim() || "eleven_multilingual_v2",
        voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: voice.speed, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
      return Response.json({ error: "Character voices are temporarily unavailable." }, { status: 502 });
    }
    const audio = await response.arrayBuffer();
    if (!audio.byteLength) return Response.json({ error: "Character voice was empty." }, { status: 502 });
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return Response.json({ error: "Character voices are temporarily unavailable." }, { status: 502 });
  }
}
