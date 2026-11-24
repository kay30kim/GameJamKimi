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

export interface SpeakResult {
  /** At least one audio playing / browser speech start event was received. */
  started: boolean;
  cancelled: boolean;
}

export interface SpeakOptions {
  voice?: Voice;
  /** Called once, when audio is actually playing, including browser fallback. */
  onStart?: () => void;
  signal?: AbortSignal;
}

interface AudioRequest {
  audio: Promise<Blob>;
  controller: AbortController;
  users: number;
  complete: boolean;
}

interface QueuedSpeech {
  content: string;
  locale: string;
  request: AudioRequest;
  controller: AbortController;
  started: boolean;
  finished: boolean;
  start: () => void;
  finish: () => void;
}

const audioCache = new Map<string, AudioRequest>();
const speechQueue: QueuedSpeech[] = [];
let processingQueue = false;
let activeSpeech: QueuedSpeech | undefined;
const TTS_TIMEOUT_MS = 20_000;
const PLAYBACK_START_TIMEOUT_MS = 6_000;

/** ElevenLabs rejects bursts, and prefetching both branches can ask for a dozen clips at once. */
const MAX_TTS_REQUESTS = 3;
let ttsInFlight = 0;
const ttsWaiting: (() => void)[] = [];

function abortError(): Error {
  return new Error("Speech was cancelled.");
}

/** Cancellation releases the playback queue even if a network implementation never settles. */
function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal.aborted) reject(abortError());
    else signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function acquireTtsSlot(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const release = () => {
      const next = ttsWaiting.shift();
      if (next) next();
      else ttsInFlight -= 1;
    };
    const start = () => {
      signal.removeEventListener("abort", abort);
      resolve(release);
    };
    const abort = () => {
      const index = ttsWaiting.indexOf(start);
      if (index >= 0) ttsWaiting.splice(index, 1);
      reject(abortError());
    };
    if (signal.aborted) reject(abortError());
    else if (ttsInFlight < MAX_TTS_REQUESTS) {
      ttsInFlight += 1;
      start();
    } else {
      ttsWaiting.push(start);
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

async function requestAudio(content: string, locale: string, voice: Voice, signal: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content, lang: locale, voice }),
    signal,
  });
  const contentType = response.headers.get("content-type");
  if (!response.ok || contentType?.split(";", 1)[0].trim().toLowerCase() !== "audio/mpeg") {
    throw new Error("Speech audio is unavailable.");
  }
  const audio = await response.blob();
  if (audio.size === 0) throw new Error("Speech audio is empty.");
  return audio;
}

function getAudio(content: string, locale: string, voice: Voice): AudioRequest {
  const key = JSON.stringify([content, normalizeLocale(locale), voice]);
  const cached = audioCache.get(key);
  if (cached && !cached.controller.signal.aborted) return cached;

  const controller = new AbortController();
  const request: AudioRequest = { controller, users: 0, complete: false, audio: Promise.resolve(new Blob()) };
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  request.audio = (async () => {
    const release = await acquireTtsSlot(controller.signal);
    try {
      if (controller.signal.aborted) throw abortError();
      return await untilAborted(requestAudio(content, locale, voice, controller.signal), controller.signal);
    } finally {
      release();
    }
  })().finally(() => {
    clearTimeout(timeout);
    request.complete = true;
  });
  audioCache.set(key, request);
  void request.audio.catch(() => {
    if (audioCache.get(key) === request) audioCache.delete(key);
  });
  return request;
}

function playAudio(audioBlob: Blob, signal: AbortSignal, onStart: () => void, textLength: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || typeof Audio === "undefined" ||
      typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
      reject(new Error("Audio playback is unavailable."));
      return;
    }
    let audio: HTMLAudioElement;
    let objectUrl: string;
    try {
      audio = new Audio();
      objectUrl = URL.createObjectURL(audioBlob);
    } catch {
      reject(new Error("Audio playback is unavailable."));
      return;
    }
    let settled = false;
    let started = false;
    let watchdog: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      audio.onplaying = audio.onended = audio.onerror = null;
      if (error) {
        try { audio.pause(); } catch { /* Playback may already have stopped. */ }
      }
      try { URL.revokeObjectURL(objectUrl); } catch { /* Already cleaned up by the browser. */ }
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(abortError());
    signal.addEventListener("abort", abort, { once: true });
    audio.onplaying = () => {
      if (settled || started || signal.aborted) return;
      started = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => finish(new Error("Audio playback timed out.")), Math.max(15_000, textLength * 400));
      onStart();
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Audio playback failed."));
    watchdog = setTimeout(() => finish(new Error("Audio playback did not start.")), PLAYBACK_START_TIMEOUT_MS);
    try {
      audio.src = objectUrl;
      void audio.play()?.catch(() => finish(new Error("Audio playback failed.")));
    } catch {
      finish(new Error("Audio playback failed."));
    }
  });
}

function speakWithBrowser(content: string, locale: string, signal: AbortSignal, onStart: () => void): Promise<void> {
  const synthesis = getSpeechSynthesis();
  if (signal.aborted || !synthesis || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = locale;
      utterance.rate = 0.95;
      const voice = pickVoice(synthesis, locale);
      if (voice) utterance.voice = voice;
    } catch {
      resolve();
      return;
    }
    let settled = false;
    let started = false;
    let watchdog: ReturnType<typeof setTimeout>;
    const finish = (cancel = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      if (cancel) {
        try { synthesis.cancel(); } catch { /* The speech engine may have closed. */ }
      }
      resolve();
    };
    const abort = () => finish(true);
    signal.addEventListener("abort", abort, { once: true });
    utterance.onstart = () => {
      if (settled || started || signal.aborted) return;
      started = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => finish(true), Math.max(15_000, content.length * 400));
      onStart();
    };
    utterance.onend = () => finish();
    utterance.onerror = () => finish();
    watchdog = setTimeout(() => finish(true), PLAYBACK_START_TIMEOUT_MS);
    try { synthesis.speak(utterance); } catch { finish(); }
  });
}

async function processSpeechQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (speechQueue.length > 0) {
      const item = speechQueue.shift()!;
      activeSpeech = item;
      try {
        if (item.controller.signal.aborted) continue;
        try {
          const audio = await untilAborted(item.request.audio, item.controller.signal);
          if (!item.controller.signal.aborted) await playAudio(audio, item.controller.signal, item.start, item.content.length);
        } catch {
          if (!item.controller.signal.aborted) await speakWithBrowser(item.content, item.locale, item.controller.signal, item.start);
        }
      } finally {
        item.finish();
        if (activeSpeech === item) activeSpeech = undefined;
      }
    }
  } finally {
    processingQueue = false;
  }
}

/** Fetch speech ahead of time without claiming that playback has started. */
export function preloadSpeech(text: string, locale: string, voice: Voice = "narrator"): void {
  const content = text.trim();
  if (!content || typeof window === "undefined") return;
  void getAudio(content, locale.trim(), voice).audio.catch(() => {});
}

/** Never rejects. A non-started, non-cancelled result lets callers show readable captions. */
export function speak(text: string, locale: string, { voice = "narrator", onStart, signal }: SpeakOptions = {}): Promise<SpeakResult> {
  const content = text.trim();
  if (!content || typeof window === "undefined" || signal?.aborted) {
    return Promise.resolve({ started: false, cancelled: signal?.aborted ?? false });
  }
  return new Promise((resolve) => {
    const controller = new AbortController();
    const request = getAudio(content, locale.trim(), voice);
    request.users += 1;
    const cancel = () => controller.abort();
    const item: QueuedSpeech = {
      content, locale: locale.trim(), request, controller, started: false, finished: false,
      start() {
        if (item.finished || item.started || controller.signal.aborted) return;
        item.started = true;
        try { onStart?.(); } catch { /* A UI callback must not strand the audio queue. */ }
      },
      finish() {
        if (item.finished) return;
        item.finished = true;
        signal?.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", item.finish);
        request.users -= 1;
        if (controller.signal.aborted && request.users === 0 && !request.complete) request.controller.abort();
        resolve({ started: item.started, cancelled: controller.signal.aborted });
      },
    };
    controller.signal.addEventListener("abort", item.finish, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    speechQueue.push(item);
    void processSpeechQueue();
  });
}

export function stopSpeaking(): void {
  activeSpeech?.controller.abort();
  for (const item of speechQueue.splice(0)) item.controller.abort();
  const synthesis = getSpeechSynthesis();
  try { synthesis?.cancel(); } catch { /* The browser may already have closed its speech service. */ }
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
