import { isVoice, VOICES } from "../../../lib/voices";
import { needsKoreanVoice } from "../../../lib/speech-policy";
import { TYPECAST_BASE_URL, typecastBody, typecastConfig, typecastEmotions } from "../../../lib/typecast";
import type { Emotion } from "../../../lib/world";

const MAX_TEXT_LENGTH = 4000;
const TYPECAST_MAX_TEXT_LENGTH = 2000;
const UPSTREAM_TIMEOUT_MS = 18_000;
const EMOTIONS: readonly string[] = ["happy", "sad", "surprised", "curious", "excited"];

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

  const { text, lang, voice = "narrator", emotion } = body as Record<string, unknown>;
  if (typeof text !== "string" || typeof lang !== "string") {
    return jsonError(400, "INVALID_REQUEST", "Expected text and lang strings.");
  }

  const content = text.trim();
  const language = languageCode(lang);
  const korean = needsKoreanVoice(content, lang);
  const maxLength = korean ? TYPECAST_MAX_TEXT_LENGTH : MAX_TEXT_LENGTH;
  if (!content || content.length > maxLength || !language || !isVoice(voice) || (emotion !== undefined && (typeof emotion !== "string" || !EMOTIONS.includes(emotion)))) {
    return jsonError(
      400,
      "INVALID_REQUEST",
      `Expected trimmed text (1–${maxLength} characters), lang (en-US or ko-KR), an optional character voice and a supported emotion.`,
    );
  }

  const typecast = korean ? typecastConfig(voice) : null;
  const apiKey = korean ? typecast?.apiKey : process.env.ELEVENLABS_API_KEY?.trim();
  // Existing English cast stays separate from the explicitly auditioned Korean cast.
  const voiceId = (voice === "narrator" && process.env.ELEVENLABS_VOICE_ID?.trim()) || VOICES[voice].id;
  if (!apiKey) {
    return jsonError(
      503,
      "TTS_NOT_CONFIGURED",
      "Server speech is not configured.",
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, UPSTREAM_TIMEOUT_MS);

  try {
    controller.signal.throwIfAborted();
    let url: string;
    let headers: Record<string, string>;
    let payload: unknown;
    if (typecast) {
      headers = { "X-API-KEY": typecast.apiKey, "Content-Type": "application/json" };
      const metadata = await fetch(`${TYPECAST_BASE_URL}/v3/voices/${encodeURIComponent(typecast.voiceId)}`, {
        headers: { "X-API-KEY": typecast.apiKey }, cache: "no-store", signal: controller.signal,
      });
      if (!metadata.ok) return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
      const emotions = typecastEmotions(await metadata.json(), typecast, voice);
      if (!emotions) return jsonError(503, "TTS_NOT_CONFIGURED", "The selected speech voice is not compatible.");
      payload = typecastBody(content, typecast, emotions, emotion as Emotion | undefined);
      url = `${TYPECAST_BASE_URL}/v1/text-to-speech`;
    } else {
      url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
      headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };
      payload = {
          text: content,
          model_id: "eleven_multilingual_v2",
          language_code: language,
          voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: VOICES[voice].speed, use_speaker_boost: true },
      };
    }
    controller.signal.throwIfAborted();
    const upstream = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(payload), cache: "no-store", signal: controller.signal,
    });

    if (!upstream.ok) {
      return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
    }

    const contentType = upstream.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (contentType !== "audio/mpeg" && contentType !== "audio/mp3") {
      return jsonError(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech service returned an invalid response.",
      );
    }

    const audio = await upstream.arrayBuffer();
    controller.signal.throwIfAborted();
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
    if (timedOut) return jsonError(504, "TTS_TIMEOUT", "Speech service timed out.");
    if (request.signal.aborted) return jsonError(499, "TTS_UPSTREAM_ERROR", "Speech request was cancelled.");
    return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service is unavailable.");
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}
