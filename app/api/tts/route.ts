import { isVoice, VOICES } from "../../../lib/voices";
import type { Voice } from "../../../lib/voices";
import { needsKoreanVoice, VOICE_CACHE_REVISION } from "../../../lib/speech-policy";
import { TYPECAST_BASE_URL, typecastBody, typecastConfig, typecastEmotions } from "../../../lib/typecast";
import type { TypecastConfig } from "../../../lib/typecast";
import { generatedCacheBackend, generatedKey, readGenerated, writeGenerated } from "../../../lib/generated-cache";
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

class SpeechFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type AudioResult = { audio: Uint8Array; cache: "HIT" | "MISS" | "BYPASS" };
type Flight = { controller: AbortController; users: number; done: boolean; promise: Promise<AudioResult> };
const inFlight = new Map<string, Flight>();
const voiceMetadata = new Map<string, { emotions: string[]; expires: number }>();
const METADATA_TTL_MS = 60 * 60 * 1000;

function isMp3(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

async function checkedEmotions(config: TypecastConfig, voice: Voice, signal: AbortSignal): Promise<string[]> {
  const key = generatedKey({ account: config.apiKey, voice: config.voiceId, model: config.model, role: voice });
  const cached = voiceMetadata.get(key);
  if (cached && cached.expires > Date.now()) return cached.emotions;
  voiceMetadata.delete(key);
  const metadata = await fetch(`${TYPECAST_BASE_URL}/v3/voices/${encodeURIComponent(config.voiceId)}`, {
    headers: { "X-API-KEY": config.apiKey }, cache: "no-store", signal,
  });
  if (!metadata.ok) throw new SpeechFailure(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
  const emotions = typecastEmotions(await metadata.json(), config, voice);
  signal.throwIfAborted();
  if (!emotions) throw new SpeechFailure(503, "TTS_NOT_CONFIGURED", "The selected speech voice is not compatible.");
  if (voiceMetadata.size >= 128) voiceMetadata.delete(voiceMetadata.keys().next().value!);
  voiceMetadata.set(key, { emotions, expires: Date.now() + METADATA_TTL_MS });
  return emotions;
}

/** Sharing generation must not let one closed tab cancel another tab's clip. */
function joinFlight(flight: Flight, signal: AbortSignal): Promise<AudioResult> {
  flight.users += 1;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result?: AudioResult, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      flight.users -= 1;
      if (flight.users === 0 && !flight.done) flight.controller.abort();
      if (error !== undefined) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(undefined, new SpeechFailure(499, "TTS_UPSTREAM_ERROR", "Speech request was cancelled."));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    flight.promise.then((result) => finish(result), (error: unknown) => finish(undefined, error));
  });
}

function createFlight(key: string, generate: (signal: AbortSignal) => Promise<AudioResult>): Flight {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, UPSTREAM_TIMEOUT_MS);
  const promise = generate(controller.signal).catch((error: unknown) => {
    if (timedOut) throw new SpeechFailure(504, "TTS_TIMEOUT", "Speech service timed out.");
    throw error;
  }).finally(() => {
    clearTimeout(timeout);
    flight.done = true;
    if (inFlight.get(key) === flight) inFlight.delete(key);
  });
  const flight: Flight = { controller, users: 0, done: false, promise };
  inFlight.set(key, flight);
  return flight;
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

  // Hash all inputs that can change the voice, including account scope for private
  // voices. Neither credentials nor the text appear in the storage pathname.
  const englishBody = {
    text: content, model_id: "eleven_multilingual_v2", language_code: language,
    voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: VOICES[voice].speed, use_speaker_boost: true },
  };
  const key = generatedKey({
    version: `tts-mp3-v1:${VOICE_CACHE_REVISION}`, account: generatedKey(apiKey),
    provider: typecast ? "typecast" : "elevenlabs", role: voice, language,
    voiceId: typecast?.voiceId ?? voiceId, emotion: emotion ?? null,
    // Supported emotion selection is validated on a miss; this versioned policy
    // represents the requested preset and its smart fallback without an API call.
    requestedSettings: typecast ? typecastBody(content, typecast, ["happy", "sad"], emotion as Emotion | undefined) : englishBody,
    emotionPolicy: "supported-preset-else-smart-v1",
  });
  const generate = async (signal: AbortSignal): Promise<AudioResult> => {
    signal.throwIfAborted();
    const cached = await readGenerated("tts", key).catch(() => null);
    signal.throwIfAborted();
    if (cached && isMp3(cached)) return { audio: cached, cache: "HIT" };
    let url: string;
    let headers: Record<string, string>;
    let payload: unknown;
    if (typecast) {
      headers = { "X-API-KEY": typecast.apiKey, "Content-Type": "application/json" };
      const emotions = await checkedEmotions(typecast, voice, signal);
      payload = typecastBody(content, typecast, emotions, emotion as Emotion | undefined);
      url = `${TYPECAST_BASE_URL}/v1/text-to-speech`;
    } else {
      url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
      headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };
      payload = englishBody;
    }
    signal.throwIfAborted();
    const upstream = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(payload), cache: "no-store", signal,
    });

    if (!upstream.ok) {
      throw new SpeechFailure(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
    }

    const contentType = upstream.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (contentType !== "audio/mpeg" && contentType !== "audio/mp3") {
      throw new SpeechFailure(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech service returned an invalid response.",
      );
    }

    const audio = new Uint8Array(await upstream.arrayBuffer());
    signal.throwIfAborted();
    if (!isMp3(audio)) {
      throw new SpeechFailure(
        502,
        "TTS_UPSTREAM_ERROR",
        "Speech service returned an invalid response.",
      );
    }

    const stored = await writeGenerated("tts", key, audio, "audio/mpeg").catch(() => false);
    signal.throwIfAborted();
    return { audio, cache: stored ? "MISS" : "BYPASS" };
  };

  try {
    if (request.signal.aborted) return jsonError(499, "TTS_UPSTREAM_ERROR", "Speech request was cancelled.");
    const pending = inFlight.get(key);
    const flight = pending && !pending.controller.signal.aborted ? pending : createFlight(key, generate);
    const result = await joinFlight(flight, request.signal);
    return new Response(Uint8Array.from(result.audio).buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Generated-Cache": result.cache,
        "X-Generated-Storage": generatedCacheBackend(),
      },
    });
  } catch (error) {
    if (error instanceof SpeechFailure) return jsonError(error.status, error.code, error.message);
    if (request.signal.aborted) return jsonError(499, "TTS_UPSTREAM_ERROR", "Speech request was cancelled.");
    return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service is unavailable.");
  }
}
