import { isVoice, VOICES } from "../../../lib/voices";

const MAX_TEXT_LENGTH = 4000;

export const maxDuration = 60;

function languageCode(lang: string): "en" | "ko" | undefined {
  switch (lang.trim().replace(/_/g, "-").toLowerCase()) {
    case "en-us":
      return "en";
    case "ko-kr":
      return "ko";
    default:
      return undefined;
  }
}

function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_REQUEST", "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "INVALID_REQUEST", "Expected text and lang strings.");
  }

  const { text, lang, voice = "narrator" } = body as Record<string, unknown>;
  if (typeof text !== "string" || typeof lang !== "string") {
    return jsonError(400, "INVALID_REQUEST", "Expected text and lang strings.");
  }

  const content = text.trim();
  const language = languageCode(lang);
  if (!content || content.length > MAX_TEXT_LENGTH || !language || !isVoice(voice)) {
    return jsonError(
      400,
      "INVALID_REQUEST",
      "Expected trimmed text (1–4000 characters), lang (en-US or ko-KR), and an optional voice (narrator or an actor id).",
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  // ELEVENLABS_VOICE_ID still picks the storyteller; characters always use their own voices.
  const voiceId = (voice === "narrator" && process.env.ELEVENLABS_VOICE_ID?.trim()) || VOICES[voice].id;
  if (!apiKey) {
    return jsonError(
      503,
      "TTS_NOT_CONFIGURED",
      "Server speech is not configured.",
    );
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: content,
          model_id: "eleven_multilingual_v2",
          language_code: language,
          voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: VOICES[voice].speed, use_speaker_boost: true },
        }),
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
    }

    const contentType = upstream.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("audio/")) {
      return jsonError(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech service returned an invalid response.",
      );
    }

    const audio = await upstream.arrayBuffer();
    if (audio.byteLength === 0) {
      return jsonError(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech service returned an invalid response.",
      );
    }

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service is unavailable.");
  }
}
