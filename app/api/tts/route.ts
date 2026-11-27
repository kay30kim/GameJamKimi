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

type SpeechProvider = "typecast" | "elevenlabs";
type AudioResult = { audio: Uint8Array; cache: "HIT" | "MISS" | "BYPASS"; provider: SpeechProvider; fallback: boolean };
type Flight = { controller: AbortController; users: number; done: boolean; promise: Promise<AudioResult> };
const inFlight = new Map<string, Flight>();
const voiceMetadata = new Map<string, { emotions: string[]; expires: number }>();
const METADATA_TTL_MS = 60 * 60 * 1000;
// Account restrictions are not fixed by retrying individual characters. Keep the
// circuit open for this worker; Typecast is opt-in, so new workers do not probe
// the currently restricted account either. Re-enable it only after resolution.
const providerCircuits = new Map<string, number>();
const circuitKey = (provider: SpeechProvider, apiKey: string) => generatedKey({ provider, account: apiKey });

function requireProvider(provider: SpeechProvider, apiKey: string) {
  const key = circuitKey(provider, apiKey);
  const until = providerCircuits.get(key);
  if (until && until > Date.now()) throw new SpeechFailure(503, "TTS_PROVIDER_BLOCKED", "Speech provider access is unavailable. Please contact the site owner.");
  providerCircuits.delete(key);
}

function isMp3(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

/** Read only a bounded error prefix; diagnostics must not delay a failed request. */
async function errorPrefix(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const decoder = new TextDecoder();
        let text = "";
        let remaining = 8192;
        while (remaining > 0) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value.subarray(0, remaining), { stream: true });
          remaining -= value.length;
        }
        return text + decoder.decode();
      })(),
      new Promise<string>((resolve) => { timeout = setTimeout(() => resolve(""), 750); }),
    ]);
  } catch { return ""; }
  finally {
    clearTimeout(timeout);
    void reader.cancel().catch(() => {});
  }
}

/** Log fixed categories and machine codes, never provider messages, credentials or dialogue. */
async function reportProviderFailure(provider: SpeechProvider, stage: "voice-metadata" | "synthesis", response: Response, apiKey: string) {
  const mime = response.headers.get("content-type") ?? "";
  const contentType = /json/i.test(mime) ? "json" : /html/i.test(mime) ? "html" : /text\//i.test(mime) ? "text" : "other";
  const edge = [response.headers.get("server"), response.headers.get("via"), response.headers.get("x-cache")].join(" ");
  const server = /cloudfront/i.test(edge) ? "cloudfront" : /cloudflare/i.test(edge) ? "cloudflare" : "other";
  const body = await errorPrefix(response);
  const category = /\b(?:waf|cloudfront|cloudflare|bot detection|request blocked)\b/i.test(body) ? "waf"
    : /\b(?:ip address|ip restriction|ip allowlist|ip whitelist)\b/i.test(body) ? "ip"
    : /\b(?:region|country|geographic|geo.block)\b/i.test(body) ? "region"
    : /\b(?:starter|subscription|plan|upgrade)\b/i.test(body) ? "plan"
    : /\b(?:quota|credits?|balance|payment)\b/i.test(body) ? "quota"
    : /\b(?:api.?key|unauthorized|authentication|invalid token|dormant account)\b/i.test(body) ? "auth"
    : /\b(?:forbidden|permission|access denied)\b/i.test(body) ? "permission" : "unknown";
  let code: string | undefined;
  if (contentType === "json") {
    try {
      const parsed = JSON.parse(body);
      const candidate: unknown = parsed?.error?.code ?? parsed?.error?.type ?? parsed?.detail?.code ?? parsed?.detail?.status ?? parsed?.error_code;
      if (typeof candidate === "string" && /^[A-Z][A-Z0-9_]{0,63}$/i.test(candidate) &&
        !/(?:KEY|TOKEN|SECRET|TEXT|VOICE|PASSWORD|AUTHORIZATION)/i.test(candidate)) code = candidate.toUpperCase();
    } catch { /* A truncated or non-JSON error still has safe header/category diagnostics. */ }
  }
  console.warn("[tts] provider request failed", { provider, stage, status: response.status, contentType, server, category, ...(code ? { code } : {}) });
  if (code === "UNUSUAL_ACTIVITY_DETECTED" || code === "QUOTA_EXCEEDED" || response.status === 429) {
    if (providerCircuits.size >= 128) providerCircuits.delete(providerCircuits.keys().next().value!);
    providerCircuits.set(circuitKey(provider, apiKey), response.status === 429 && code !== "QUOTA_EXCEEDED" ? Date.now() + 60_000 : Infinity);
    throw new SpeechFailure(503, "TTS_PROVIDER_BLOCKED", "Speech provider access is unavailable. Please contact the site owner.");
  }
}

async function checkedEmotions(config: TypecastConfig, voice: Voice, signal: AbortSignal): Promise<string[]> {
  const key = generatedKey({ account: config.apiKey, voice: config.voiceId, model: config.model, role: voice });
  const cached = voiceMetadata.get(key);
  if (cached && cached.expires > Date.now()) return cached.emotions;
  voiceMetadata.delete(key);
  const metadata = await fetch(`${TYPECAST_BASE_URL}/v3/voices/${encodeURIComponent(config.voiceId)}`, {
    headers: { "X-API-KEY": config.apiKey }, cache: "no-store", signal,
  });
  if (!metadata.ok) {
    await reportProviderFailure("typecast", "voice-metadata", metadata, config.apiKey);
    throw new SpeechFailure(502, "TTS_UPSTREAM_ERROR", "Speech service failed.");
  }
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

  // The existing ElevenLabs cast supports Korean through Multilingual v2.
  // Typecast currently denies synthesis at account level; never probe it on
  // every cold start. An operator can opt back in after the restriction clears.
  const typecast = korean && process.env.TTS_KOREAN_PROVIDER?.trim() === "typecast" ? typecastConfig(voice) : null;
  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = (voice === "narrator" && process.env.ELEVENLABS_VOICE_ID?.trim()) || VOICES[voice].id;
  if (!typecast && !elevenKey) {
    return jsonError(
      503,
      "TTS_NOT_CONFIGURED",
      "Server speech is not configured.",
    );
  }

  // Hash all inputs that can change the voice, including account scope for private
  // voices. Neither credentials nor the text appear in the storage pathname.
  const multilingualBody = {
    // language_code is not supported by multilingual_v2; the text determines
    // pronunciation, including teaching lines that contain both languages.
    text: content, model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: VOICES[voice].speed, use_speaker_boost: true },
  };
  const candidates: { provider: SpeechProvider; apiKey: string; config: TypecastConfig | null; key: string }[] = [];
  for (const provider of (typecast ? ["typecast", "elevenlabs"] : ["elevenlabs"]) as SpeechProvider[]) {
    const config = provider === "typecast" ? typecast : null;
    const apiKey = config?.apiKey ?? elevenKey;
    if (!apiKey) continue;
    candidates.push({ provider, apiKey, config, key: generatedKey({
      version: `tts-mp3-v1:${VOICE_CACHE_REVISION}`, account: generatedKey(apiKey),
      provider, role: voice, language,
      voiceId: config?.voiceId ?? voiceId, emotion: emotion ?? null,
      requestedSettings: config ? typecastBody(content, config, ["happy", "sad"], emotion as Emotion | undefined) : multilingualBody,
      emotionPolicy: "supported-preset-else-smart-v1",
    }) });
  }
  const key = generatedKey(candidates.map((candidate) => candidate.key));
  const attempt = async (candidate: typeof candidates[number], fallback: boolean, signal: AbortSignal): Promise<AudioResult> => {
    const { provider, apiKey, config, key: audioKey } = candidate;
    signal.throwIfAborted();
    const cached = await readGenerated("tts", audioKey).catch(() => null);
    signal.throwIfAborted();
    if (cached && isMp3(cached)) return { audio: cached, cache: "HIT", provider, fallback };
    requireProvider(provider, apiKey);
    let url: string;
    let headers: Record<string, string>;
    let payload: unknown;
    if (config) {
      headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
      const emotions = await checkedEmotions(config, voice, signal);
      payload = typecastBody(content, config, emotions, emotion as Emotion | undefined);
      url = `${TYPECAST_BASE_URL}/v1/text-to-speech`;
    } else {
      url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
      headers = { "xi-api-key": apiKey, "Content-Type": "application/json" };
      payload = multilingualBody;
    }
    signal.throwIfAborted();
    const upstream = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(payload), cache: "no-store", signal,
    });

    if (!upstream.ok) {
      await reportProviderFailure(provider, "synthesis", upstream, apiKey);
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

    const stored = await writeGenerated("tts", audioKey, audio, "audio/mpeg").catch(() => false);
    signal.throwIfAborted();
    return { audio, cache: stored ? "MISS" : "BYPASS", provider, fallback };
  };
  const generate = async (signal: AbortSignal): Promise<AudioResult> => {
    let failure: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      signal.throwIfAborted();
      try { return await attempt(candidates[index], index > 0, signal); }
      catch (error) {
        signal.throwIfAborted();
        failure = error;
      }
    }
    throw failure;
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
        "X-Speech-Provider": result.provider,
        "X-Speech-Fallback": result.fallback ? "1" : "0",
      },
    });
  } catch (error) {
    if (error instanceof SpeechFailure) return jsonError(error.status, error.code, error.message);
    if (request.signal.aborted) return jsonError(499, "TTS_UPSTREAM_ERROR", "Speech request was cancelled.");
    return jsonError(502, "TTS_UPSTREAM_ERROR", "Speech service is unavailable.");
  }
}
