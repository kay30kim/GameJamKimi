import type { SceneLanguage } from "@/app/api/scene/contract";
import type { Voice } from "@/lib/voices";

const NO_SPEECH_MESSAGE = "I didn't hear anything. Please try again.";
const MICROPHONE_BLOCKED_MESSAGE =
  "Microphone access was blocked. Allow microphone access and try again.";
const LISTENING_STOPPED_MESSAGE = "Listening stopped. Please try again.";
const LISTEN_TIMEOUT_MS = 15_000;

export function speechLocale(language: SceneLanguage): string {
  return language === "ko" ? "ko-KR" : "en-US";
}

/** Locale for word meanings, which use the language not being learned. */
export function meaningLocale(language: SceneLanguage): string {
  return language === "ko" ? "en-US" : "ko-KR";
}

function getSpeechSynthesis(): SpeechSynthesis | undefined {
  if (typeof window === "undefined") return undefined;

  const synthesis = window.speechSynthesis;
  if (
    !synthesis ||
    typeof synthesis.speak !== "function" ||
    typeof synthesis.cancel !== "function" ||
    typeof synthesis.getVoices !== "function"
  ) {
    return undefined;
  }
  return synthesis;
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

function pickVoice(
  synthesis: SpeechSynthesis,
  locale: string,
): SpeechSynthesisVoice | undefined {
  const normalizedLocale = normalizeLocale(locale);
  const language = normalizedLocale.split("-")[0];
  if (!language) return undefined;

  let bestVoice: SpeechSynthesisVoice | undefined;
  let bestScore = 0;

  for (const voice of synthesis.getVoices()) {
    const voiceLocale = normalizeLocale(voice.lang);
    const exactMatch = voiceLocale === normalizedLocale;
    if (!exactMatch && voiceLocale.split("-")[0] !== language) continue;

    let score = exactMatch ? 100 : 10;
    if (voice.default) score += 2;
    if (voice.localService) score += 1;

    if (score > bestScore) {
      bestVoice = voice;
      bestScore = score;
    }
  }

  return bestVoice;
}

interface QueuedSpeech {
  content: string;
  locale: string;
  generation: number;
  audio: Promise<Blob>;
  onStart?: () => void;
  /** Settles speak()'s promise once this clip has played, failed, or been skipped. */
  done: () => void;
}

export interface SpeakOptions {
  voice?: Voice;
  /** Called just before the clip starts playing, so the stage can show who is talking. */
  onStart?: () => void;
}

interface ActiveAudio {
  audio: HTMLAudioElement;
  cancel: () => void;
}

interface ActiveBrowserSpeech {
  utterance: SpeechSynthesisUtterance;
  cancel: () => void;
}

const audioCache = new Map<string, Promise<Blob>>();
const speechQueue: QueuedSpeech[] = [];
let playbackGeneration = 0;
let processingQueue = false;
let activeAudio: ActiveAudio | undefined;
let activeBrowserSpeech: ActiveBrowserSpeech | undefined;

/** ElevenLabs rejects bursts, and prefetching both branches can ask for a dozen clips at once. */
const MAX_TTS_REQUESTS = 3;
let ttsInFlight = 0;
const ttsWaiting: (() => void)[] = [];

async function withTtsSlot<T>(task: () => Promise<T>): Promise<T> {
  // A finished request hands its slot straight to the next waiter, so the count never overshoots.
  if (ttsInFlight >= MAX_TTS_REQUESTS) await new Promise<void>((resolve) => ttsWaiting.push(resolve));
  else ttsInFlight += 1;
  try {
    return await task();
  } finally {
    const next = ttsWaiting.shift();
    if (next) next();
    else ttsInFlight -= 1;
  }
}

function fetchAudio(content: string, locale: string, voice: Voice): Promise<Blob> {
  return withTtsSlot(() => requestAudio(content, locale, voice));
}

async function requestAudio(content: string, locale: string, voice: Voice): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content, lang: locale, voice }),
  });
  const contentType = response.headers.get("content-type");
  if (
    !response.ok ||
    contentType?.split(";", 1)[0].trim().toLowerCase() !== "audio/mpeg"
  ) {
    throw new Error("Speech audio is unavailable.");
  }

  const audio = await response.blob();
  if (audio.size === 0) throw new Error("Speech audio is empty.");
  return audio;
}

function getAudio(content: string, locale: string, voice: Voice): Promise<Blob> {
  const key = JSON.stringify([content, normalizeLocale(locale), voice]);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const request = fetchAudio(content, locale, voice);
  audioCache.set(key, request);
  void request.catch(() => {
    if (audioCache.get(key) === request) audioCache.delete(key);
  });
  return request;
}

function playAudio(audioBlob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    if (
      typeof Audio === "undefined" ||
      typeof URL.createObjectURL !== "function" ||
      typeof URL.revokeObjectURL !== "function"
    ) {
      reject(new Error("Audio playback is unavailable."));
      return;
    }

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(audioBlob);
    } catch {
      reject(new Error("Audio playback is unavailable."));
      return;
    }

    let audio: HTMLAudioElement;
    try {
      audio = new Audio();
    } catch {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore URL cleanup failures when audio cannot be constructed.
      }
      reject(new Error("Audio playback is unavailable."));
      return;
    }

    let settled = false;
    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      if (activeAudio?.audio === audio) activeAudio = undefined;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // The object URL may already have been revoked during page teardown.
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const pauseAndFinish = (error?: Error) => {
      if (settled) return;
      settled = true;
      try {
        audio.pause();
      } catch {
        // Playback may already have stopped.
      }
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    activeAudio = {
      audio,
      cancel: () => pauseAndFinish(),
    };
    audio.onended = () => finish();
    audio.onerror = () => pauseAndFinish(new Error("Audio playback failed."));

    try {
      audio.src = objectUrl;
      const playback = audio.play();
      if (playback) {
        void playback.catch(() =>
          pauseAndFinish(new Error("Audio playback failed.")),
        );
      }
    } catch {
      pauseAndFinish(new Error("Audio playback failed."));
    }
  });
}

function speakWithBrowser(content: string, locale: string): Promise<void> {
  const synthesis = getSpeechSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(content);
      if (locale) utterance.lang = locale;
      utterance.rate = 0.95;
      const voice = pickVoice(synthesis, locale);
      if (voice) utterance.voice = voice;
    } catch {
      resolve();
      return;
    }

    const finish = () => {
      utterance.onend = null;
      utterance.onerror = null;
      if (activeBrowserSpeech?.utterance === utterance) {
        activeBrowserSpeech = undefined;
      }
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    activeBrowserSpeech = { utterance, cancel: finish };

    try {
      synthesis.speak(utterance);
    } catch {
      finish();
    }
  });
}

async function processSpeechQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;

  try {
    while (speechQueue.length > 0) {
      const item = speechQueue.shift();
      if (!item) continue;
      try {
        if (item.generation !== playbackGeneration) continue;
        try {
          const audioBlob = await item.audio;
          if (item.generation !== playbackGeneration) continue;
          item.onStart?.();
          await playAudio(audioBlob);
        } catch {
          if (item.generation !== playbackGeneration) continue;
          item.onStart?.();
          await speakWithBrowser(item.content, item.locale);
        }
      } finally {
        item.done();
      }
    }
  } finally {
    processingQueue = false;
  }
}

/** Queue speech, preferring server audio with browser speech as a fallback. */
/** Fetch speech audio ahead of time so speak() can play it without waiting. */
export function preloadSpeech(text: string, locale: string, voice: Voice = "narrator"): void {
  const content = text.trim();
  if (!content || typeof window === "undefined") return;
  void getAudio(content, locale.trim(), voice).catch(() => {});
}

/** Resolves when this clip finishes, fails, or is cancelled by stopSpeaking(). Never rejects. */
export function speak(text: string, locale: string, { voice = "narrator", onStart }: SpeakOptions = {}): Promise<void> {
  const content = text.trim();
  if (!content || typeof window === "undefined") return Promise.resolve();

  return new Promise((done) => {
    speechQueue.push({
      content,
      locale: locale.trim(),
      generation: playbackGeneration,
      audio: getAudio(content, locale.trim(), voice),
      onStart,
      done,
    });
    void processSpeechQueue().catch(() => undefined);
  });
}

export function stopSpeaking(): void {
  playbackGeneration += 1;
  for (const item of speechQueue.splice(0)) item.done();
  activeAudio?.cancel();
  activeBrowserSpeech?.cancel();

  const synthesis = getSpeechSynthesis();
  if (!synthesis) return;
  try {
    synthesis.cancel();
  } catch {
    // The browser may already have torn down its speech service.
  }
}

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly length: number;
  readonly isFinal?: boolean;
  readonly [index: number]: RecognitionAlternative;
}

interface RecognitionResultEvent {
  readonly results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent {
  readonly error?: string;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onnomatch: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

interface ActiveRecognition {
  recognition: Recognition;
  cancel: () => void;
}

let activeRecognition: ActiveRecognition | undefined;

function getRecognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;

  const browserWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const Constructor =
    browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  return typeof Constructor === "function" ? Constructor : undefined;
}

export function isListeningSupported(): boolean {
  return getRecognitionConstructor() !== undefined;
}

function recognitionErrorMessage(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return MICROPHONE_BLOCKED_MESSAGE;
    case "audio-capture":
      return "No microphone is available. Check your microphone and try again.";
    case "network":
      return "Speech recognition couldn't connect. Check your connection and try again.";
    case "language-not-supported":
      return "This browser can't recognize that language.";
    case "aborted":
      return LISTENING_STOPPED_MESSAGE;
    case "no-speech":
      return NO_SPEECH_MESSAGE;
    default:
      return "I didn't catch that. Please try again.";
  }
}

function recognitionStartError(error: unknown): Error {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return new Error(MICROPHONE_BLOCKED_MESSAGE);
  }
  if (name === "NotFoundError") {
    return new Error(recognitionErrorMessage("audio-capture"));
  }
  return new Error("Speech recognition couldn't start. Please try again.");
}

function abortRecognition(recognition: Recognition): void {
  try {
    recognition.abort();
  } catch {
    // Recognition may already have ended.
  }
}

function transcriptFromEvent(event: RecognitionResultEvent): string {
  for (let index = event.results.length - 1; index >= 0; index -= 1) {
    const result = event.results[index];
    if (!result || result.isFinal === false) continue;

    const transcript = result[0]?.transcript;
    if (typeof transcript === "string" && transcript.trim()) {
      return transcript.trim();
    }
  }
  return "";
}

/**
 * Listen for one utterance and resolve with its final transcript. A newer call
 * replaces an active session so double taps cannot leave multiple microphones
 * running.
 */
export function listenOnce(locale: string): Promise<string> {
  const Constructor = getRecognitionConstructor();
  if (!Constructor) {
    return Promise.reject(
      new Error("Speech recognition is not supported here. Try Chrome."),
    );
  }

  stopSpeaking();
  activeRecognition?.cancel();

  return new Promise((resolve, reject) => {
    let recognition: Recognition;
    try {
      recognition = new Constructor();
    } catch (error) {
      reject(recognitionStartError(error));
      return;
    }

    recognition.lang = locale;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    let timeoutId: number | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onnomatch = null;
      if (activeRecognition?.recognition === recognition) {
        activeRecognition = undefined;
      }
    };

    const resolveOnce = (transcript: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(transcript);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    recognition.onresult = (event) => {
      const transcript = transcriptFromEvent(event);
      if (!transcript) return;
      resolveOnce(transcript);
      abortRecognition(recognition);
    };
    recognition.onerror = (event) => {
      rejectOnce(new Error(recognitionErrorMessage(event.error)));
    };
    recognition.onnomatch = () => {
      rejectOnce(new Error(NO_SPEECH_MESSAGE));
      abortRecognition(recognition);
    };
    recognition.onend = () => {
      rejectOnce(new Error(NO_SPEECH_MESSAGE));
    };

    activeRecognition = {
      recognition,
      cancel: () => {
        rejectOnce(new Error(LISTENING_STOPPED_MESSAGE));
        abortRecognition(recognition);
      },
    };

    try {
      recognition.start();
    } catch (error) {
      rejectOnce(recognitionStartError(error));
      return;
    }

    if (!settled) {
      timeoutId = window.setTimeout(() => {
        rejectOnce(new Error(NO_SPEECH_MESSAGE));
        abortRecognition(recognition);
      }, LISTEN_TIMEOUT_MS);
    }
  });
}

const KOREAN_ENDINGS = new Set([
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "에서",
  "의",
  "도",
  "만",
  "와",
  "과",
  "하고",
  "랑",
  "이랑",
  "으로",
  "로",
  "이야",
  "야",
  "이에요",
  "예요",
  "입니다",
  "습니다",
]);
const HANGUL_PATTERN = /\p{Script=Hangul}/u;

function wordTokens(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Match whole words within a short transcript while ignoring case, punctuation,
 * and spacing. Korean targets may also carry a common particle or copula.
 */
export function matchesWord(transcript: string, target: string): boolean {
  const saidTokens = wordTokens(transcript);
  const targetTokens = wordTokens(target);
  const wanted = targetTokens.join("");
  if (!wanted || saidTokens.length === 0) return false;

  const allowKoreanEnding = targetTokens.some((token) =>
    HANGUL_PATTERN.test(token),
  );

  for (let start = 0; start < saidTokens.length; start += 1) {
    let candidate = "";
    for (let end = start; end < saidTokens.length; end += 1) {
      candidate += saidTokens[end];
      if (candidate === wanted) return true;
      if (
        allowKoreanEnding &&
        candidate.startsWith(wanted) &&
        KOREAN_ENDINGS.has(candidate.slice(wanted.length))
      ) {
        return true;
      }
    }
  }

  return false;
}

/** Cancel a microphone session when leaving an interactive demo. */
export function stopListening(): void {
  activeRecognition?.cancel();
}
