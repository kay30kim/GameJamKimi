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

  const { text, lang, speaker = "kimi" } = body as Record<string, unknown>;
  if (typeof text !== "string" || typeof lang !== "string") {
    return jsonError(400, "INVALID_REQUEST", "Expected text and lang strings.");
  }

  if (speaker !== "kimi" && speaker !== "momo") return jsonError(400, "INVALID_SPEAKER", "Expected kimi or momo.");

  const content = text.trim();
  const language = languageCode(lang);
  if (!content || content.length > MAX_TEXT_LENGTH || !language) {
    return jsonError(
      400,
      "INVALID_REQUEST",
      "Expected trimmed text (1–4000 characters) and lang (en-US or ko-KR).",
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  // Demo-only defaults, selected from the account's available premade voices.
  // Never alter the main game's ELEVENLABS_VOICE_ID or account-wide voice settings.
  const voiceId = speaker === "momo"
    ? process.env.ELEVENLABS_DEMO_MOMO_VOICE_ID?.trim() || "TX3LPaxmHKxFdv7VOQHJ" // Liam
    : process.env.ELEVENLABS_DEMO_VOICE_ID?.trim() || "cgSgspJ2msm6clMCkdW9"; // Jessica
  if (!apiKey || !voiceId) {
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
          voice_settings: { stability: .38, similarity_boost: .75, style: .35, speed: .92, use_speaker_boost: true },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
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
