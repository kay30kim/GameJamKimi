import type { SceneLanguage } from "@/app/api/scene/contract";
import type { Voice } from "@/lib/voices";
import type { Emotion } from "./world";
import { needsKoreanVoice, VOICE_CACHE_REVISION } from "./speech-policy";
import type { SpeechErrorCode } from "./speech-policy";

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
  error?: SpeechErrorCode;
}

export interface SpeakOptions {
  voice?: Voice;
  emotion?: Emotion;
  /** Called once, when audio is actually playing, including browser fallback. */
  onStart?: () => void;
  /** Actual decoded audio envelope, 0–1; silence/pause/end always emit zero. */
  onLevel?: (level: number) => void;
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
  error?: SpeechErrorCode;
  start: () => void;
  level: (level: number) => void;
  finish: () => void;
}

const audioCache = new Map<string, AudioRequest>();
const speechQueue: QueuedSpeech[] = [];
let processingQueue = false;
let activeSpeech: QueuedSpeech | undefined;
let speechPaused = false;
let activePlayback: { pause: () => void; resume: () => void } | undefined;
const resumeWaiters = new Set<() => void>();
const isPlaybackPaused = () => speechPaused || (typeof document !== "undefined" && document.hidden);
const TTS_TIMEOUT_MS = 20_000;
const PLAYBACK_START_TIMEOUT_MS = 6_000;

/** Keep generation within the Korean provider's free-tier concurrency allowance. */
const MAX_TTS_REQUESTS = 2;
let ttsInFlight = 0;
const ttsWaiting: { request: AudioRequest; start: () => void }[] = [];

function abortError(): Error {
  return new Error("Speech was cancelled.");
}

class SpeechFailure extends Error {
  constructor(readonly code: SpeechErrorCode) { super(code); }
}

function errorCode(value: unknown): SpeechErrorCode | undefined {
  return value === "TTS_NOT_CONFIGURED" || value === "TTS_UPSTREAM_ERROR" ||
    value === "TTS_PROVIDER_BLOCKED" || value === "TTS_TIMEOUT" || value === "TTS_PLAYBACK_ERROR" ? value : undefined;
}

function waitForSpeechResume(signal: AbortSignal): Promise<void> {
  if (!isPlaybackPaused()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const page = typeof document !== "undefined" ? document : undefined;
    const cleanup = () => {
      resumeWaiters.delete(resume);
      signal.removeEventListener("abort", abort);
      page?.removeEventListener("visibilitychange", resume);
    };
    const resume = () => { if (!isPlaybackPaused()) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) { abort(); return; }
    resumeWaiters.add(resume);
    signal.addEventListener("abort", abort, { once: true });
    page?.addEventListener("visibilitychange", resume);
  });
}

/** Deadlines measure active playback time, never time spent in a hidden tab. */
function playbackWatchdog(onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = 0;
  let deadline = 0;
  const pause = () => {
    if (timer !== undefined) remaining = Math.max(0, deadline - Date.now());
    clearTimeout(timer);
    timer = undefined;
  };
  const resume = () => {
    if (timer !== undefined || isPlaybackPaused()) return;
    deadline = Date.now() + remaining;
    timer = setTimeout(onTimeout, remaining);
  };
  return { pause, resume, arm(ms: number) { pause(); remaining = ms; resume(); }, stop() { clearTimeout(timer); timer = undefined; } };
}

/**
 * Decode the real MP3 with Web Audio and sample its envelope at media.currentTime.
 * Do not route audible media through AudioContext: a suspended context on iOS
 * would otherwise silence an audio element that can play normally.
 */
function audioMeter(audio: HTMLAudioElement, blob: Blob, onLevel: (level: number) => void) {
  let alive = true;
  let running = false;
  let frame: number | undefined;
  let levels: Float32Array | undefined;
  let lastSampleTime = -Infinity;
  const framesPerSecond = 50;
  const emit = (level: number) => { try { onLevel(level); } catch { /* Animation cannot interrupt speech. */ } };
  const tick = () => {
    if (!alive || !running) return;
    if (audio.currentTime - lastSampleTime >= 0.05 || audio.currentTime < lastSampleTime) {
      lastSampleTime = audio.currentTime;
      const value = !audio.paused && !audio.ended ? levels?.[Math.floor(audio.currentTime * framesPerSecond)] ?? 0 : 0;
      emit(value);
    }
    frame = window.requestAnimationFrame(tick);
  };
  const pause = () => {
    running = false;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    lastSampleTime = -Infinity;
    emit(0);
  };
  // Offline decoding needs no autoplay permission and never touches the output.
  const OfflineContext = typeof window !== "undefined" ? window.OfflineAudioContext : undefined;
  if (OfflineContext) void (async () => {
    try {
      const decoder = new OfflineContext(1, 1, 44_100);
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      if (!alive) return;
      const sampleStep = Math.max(1, Math.floor(decoded.sampleRate / framesPerSecond));
      const envelope = new Float32Array(Math.ceil(decoded.length / sampleStep));
      for (let block = 0; block < envelope.length; block += 1) {
        const from = block * sampleStep, to = Math.min(decoded.length, from + sampleStep);
        let squares = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const samples = decoded.getChannelData(channel);
          for (let sample = from; sample < to; sample += 1) squares += samples[sample] * samples[sample];
        }
        const rms = Math.sqrt(squares / ((to - from) * decoded.numberOfChannels));
        envelope[block] = Math.min(1, Math.max(0, rms - 0.006) * 6);
      }
      levels = envelope;
    } catch { /* Audio remains playable if waveform decoding is unavailable. */ }
  })();
  return {
    start() {
      if (!alive || running || typeof window.requestAnimationFrame !== "function") return;
      running = true;
      tick();
    },
    pause,
    stop() { alive = false; pause(); levels = undefined; },
  };
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

function acquireTtsSlot(request: AudioRequest): Promise<() => void> {
  const signal = request.controller.signal;
  return new Promise((resolve, reject) => {
    const release = () => {
      // A line the child is hearing takes priority over unchosen story branches.
      // Inspect users at release time: a prefetched clip can become foreground.
      const foreground = ttsWaiting.findIndex((waiting) => waiting.request.users > 0);
      const [next] = ttsWaiting.splice(Math.max(0, foreground), 1);
      if (next) next.start();
      else ttsInFlight -= 1;
    };
    const start = () => {
      signal.removeEventListener("abort", abort);
      resolve(release);
    };
    const abort = () => {
      const index = ttsWaiting.findIndex((waiting) => waiting.start === start);
      if (index >= 0) ttsWaiting.splice(index, 1);
      reject(abortError());
    };
    if (signal.aborted) reject(abortError());
    else if (ttsInFlight < MAX_TTS_REQUESTS) {
      ttsInFlight += 1;
      start();
    } else {
      ttsWaiting.push({ request, start });
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

async function requestAudio(content: string, locale: string, voice: Voice, emotion: Emotion | undefined, signal: AbortSignal): Promise<Blob> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content, lang: locale, voice, emotion }),
      signal,
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const error = data && typeof data === "object" && "error" in data ? data.error : undefined;
      const code = error && typeof error === "object" && "code" in error ? errorCode(error.code) : undefined;
      throw new SpeechFailure(code ?? "TTS_UPSTREAM_ERROR");
    }
    const contentType = response.headers.get("content-type");
    if (contentType?.split(";", 1)[0].trim().toLowerCase() !== "audio/mpeg") {
      throw new SpeechFailure("TTS_UPSTREAM_ERROR");
    }
    const audio = await response.blob();
    if (audio.size === 0) throw new SpeechFailure("TTS_UPSTREAM_ERROR");
    return audio;
  } catch (error) {
    if (error instanceof SpeechFailure) throw error;
    throw new SpeechFailure("TTS_UPSTREAM_ERROR");
  }
}

function getAudio(content: string, locale: string, voice: Voice, emotion?: Emotion): AudioRequest {
  const key = JSON.stringify([VOICE_CACHE_REVISION, content, normalizeLocale(locale), voice, emotion ?? null]);
  const cached = audioCache.get(key);
  if (cached && !cached.controller.signal.aborted) return cached;

  const controller = new AbortController();
  const request: AudioRequest = { controller, users: 0, complete: false, audio: Promise.resolve(new Blob()) };
  let timedOut = false;
  request.audio = (async () => {
    const release = await acquireTtsSlot(request);
    // Waiting for our local concurrency slot is not time spent at the provider.
    // Otherwise an entire prefetched branch can expire without making a request.
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, TTS_TIMEOUT_MS);
    try {
      if (controller.signal.aborted) throw abortError();
      return await untilAborted(requestAudio(content, locale, voice, emotion, controller.signal), controller.signal);
    } finally {
      clearTimeout(timeout);
      release();
    }
  })().catch((error: unknown) => {
    if (timedOut) throw new SpeechFailure("TTS_TIMEOUT");
    throw error;
  }).finally(() => {
    request.complete = true;
  });
  audioCache.set(key, request);
  void request.audio.catch(() => {
    if (audioCache.get(key) === request) audioCache.delete(key);
  });
  return request;
}

function playAudio(audioBlob: Blob, signal: AbortSignal, onStart: () => void, onLevel: (level: number) => void, textLength: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || typeof Audio === "undefined" ||
      typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
      reject(new SpeechFailure("TTS_PLAYBACK_ERROR"));
      return;
    }
    let audio: HTMLAudioElement;
    let objectUrl: string;
    try {
      audio = new Audio();
      objectUrl = URL.createObjectURL(audioBlob);
      if (typeof document !== "undefined" && document.body) {
        audio.hidden = true;
        audio.setAttribute("data-story-audio", "");
        audio.setAttribute("aria-hidden", "true");
        document.body.append(audio);
      }
    } catch {
      reject(new SpeechFailure("TTS_PLAYBACK_ERROR"));
      return;
    }
    let settled = false;
    let started = false;
    let playAttempt = 0;
    const meter = audioMeter(audio, audioBlob, onLevel);
    const watchdog = playbackWatchdog(() => finish(new SpeechFailure("TTS_PLAYBACK_ERROR")));
    const play = () => {
      if (settled || signal.aborted || isPlaybackPaused()) return;
      const attempt = ++playAttempt;
      const failed = () => {
        // pause() rejects a still-pending play() with AbortError. A quick resume
        // may already have started a new attempt when that rejection arrives.
        if (!settled && attempt === playAttempt && !isPlaybackPaused()) finish(new SpeechFailure("TTS_PLAYBACK_ERROR"));
      };
      try { void audio.play()?.catch(failed); }
      catch { failed(); }
    };
    const controls = {
      pause() { playAttempt += 1; watchdog.pause(); meter.pause(); try { audio.pause(); } catch { /* Closed media. */ } },
      resume() { if (!settled) { watchdog.resume(); play(); } },
    };
    activePlayback = controls;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      watchdog.stop();
      meter.stop();
      if (activePlayback === controls) activePlayback = undefined;
      signal.removeEventListener("abort", abort);
      audio.onplaying = audio.onended = audio.onerror = null;
      audio.remove?.();
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
      if (settled || signal.aborted) return;
      if (isPlaybackPaused()) { controls.pause(); return; }
      meter.start();
      if (!started) {
        started = true;
        watchdog.arm(Math.max(15_000, textLength * 400));
        onStart();
      }
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new SpeechFailure("TTS_PLAYBACK_ERROR"));
    watchdog.arm(PLAYBACK_START_TIMEOUT_MS);
    try {
      audio.src = objectUrl;
      play();
    } catch {
      finish(new SpeechFailure("TTS_PLAYBACK_ERROR"));
    }
  });
}

function speakWithBrowser(content: string, locale: string, signal: AbortSignal, onStart: () => void): Promise<boolean> {
  const synthesis = getSpeechSynthesis();
  if (signal.aborted || !synthesis || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = locale;
      utterance.rate = 0.95;
      const voice = pickVoice(synthesis, locale);
      if (voice) utterance.voice = voice;
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    let started = false;
    const watchdog = playbackWatchdog(() => finish(true));
    const controls = {
      pause() { watchdog.pause(); try { synthesis.pause?.(); } catch { /* Closed speech engine. */ } },
      resume() { if (!settled) { watchdog.resume(); try { synthesis.resume?.(); } catch { finish(true); } } },
    };
    activePlayback = controls;
    const finish = (cancel = false, completed = false) => {
      if (settled) return;
      settled = true;
      watchdog.stop();
      if (activePlayback === controls) activePlayback = undefined;
      signal.removeEventListener("abort", abort);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      if (cancel) {
        try { synthesis.cancel(); } catch { /* The speech engine may have closed. */ }
      }
      resolve(completed && started);
    };
    const abort = () => finish(true);
    signal.addEventListener("abort", abort, { once: true });
    utterance.onstart = () => {
      if (settled || started || signal.aborted) return;
      started = true;
      watchdog.arm(Math.max(15_000, content.length * 400));
      if (isPlaybackPaused()) controls.pause();
      onStart();
    };
    utterance.onend = () => finish(false, true);
    utterance.onerror = () => finish();
    watchdog.arm(PLAYBACK_START_TIMEOUT_MS);
    try {
      // cancel() does not clear the native engine's paused state. This also
      // covers callers outside Tales that return from a hidden page later.
      if (synthesis.paused && !isPlaybackPaused()) synthesis.resume?.();
      synthesis.speak(utterance);
    } catch { finish(); }
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
          await waitForSpeechResume(item.controller.signal);
          if (!item.controller.signal.aborted) await playAudio(audio, item.controller.signal, item.start, item.level, item.content.length);
        } catch (error) {
          if (!item.controller.signal.aborted) {
            await waitForSpeechResume(item.controller.signal).catch(() => {});
            const fallbackCompleted = !needsKoreanVoice(item.content, item.locale) &&
              await speakWithBrowser(item.content, item.locale, item.controller.signal, item.start);
            if (!fallbackCompleted) item.error = error instanceof SpeechFailure ? error.code : "TTS_UPSTREAM_ERROR";
          }
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
export function preloadSpeech(text: string, locale: string, voice: Voice = "narrator", emotion?: Emotion): void {
  const content = text.trim();
  if (!content || typeof window === "undefined") return;
  void getAudio(content, locale.trim(), voice, emotion).audio.catch(() => {});
}

/** Never rejects. A non-started, non-cancelled result lets callers show readable captions. */
export function speak(text: string, locale: string, { voice = "narrator", emotion, onStart, onLevel, signal }: SpeakOptions = {}): Promise<SpeakResult> {
  const content = text.trim();
  if (!content || typeof window === "undefined" || signal?.aborted) {
    return Promise.resolve({ started: false, cancelled: signal?.aborted ?? false });
  }
  return new Promise((resolve) => {
    const controller = new AbortController();
    const request = getAudio(content, locale.trim(), voice, emotion);
    request.users += 1;
    const cancel = () => controller.abort();
    const item: QueuedSpeech = {
      content, locale: locale.trim(), request, controller, started: false, finished: false,
      start() {
        if (item.finished || item.started || controller.signal.aborted) return;
        item.started = true;
        try { onStart?.(); } catch { /* A UI callback must not strand the audio queue. */ }
      },
      level(value) {
        if (item.finished || controller.signal.aborted) return;
        try { onLevel?.(value); } catch { /* Animation cannot interrupt speech. */ }
      },
      finish() {
        if (item.finished) return;
        try { onLevel?.(0); } catch { /* Animation cannot strand the queue. */ }
        item.finished = true;
        signal?.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", item.finish);
        request.users -= 1;
        if (controller.signal.aborted && request.users === 0 && !request.complete) request.controller.abort();
        resolve({ started: item.started, cancelled: controller.signal.aborted,
          ...(!controller.signal.aborted && item.error ? { error: item.error } : {}) });
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
  // Discard unfinished speculative clips too, so a new practice prompt or
  // chosen scene does not wait behind speech belonging to the previous screen.
  for (const request of audioCache.values()) {
    if (request.users === 0 && !request.complete) request.controller.abort();
  }
  speechPaused = false;
  const synthesis = getSpeechSynthesis();
  try {
    synthesis?.cancel();
    if (synthesis?.paused && !isPlaybackPaused()) synthesis.resume?.();
  } catch { /* The browser may already have closed its speech service. */ }
  for (const resume of resumeWaiters) resume();
}

/** Pause media without cancelling its line or losing the current playback time. */
export function pauseSpeaking(): void {
  speechPaused = true;
  activePlayback?.pause();
  activeSpeech?.level(0);
}

/** Resume the same line, including one whose audio finished loading while hidden. */
export function resumeSpeaking(): void {
  speechPaused = false;
  if (isPlaybackPaused()) return;
  activePlayback?.resume();
  for (const resume of resumeWaiters) resume();
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
