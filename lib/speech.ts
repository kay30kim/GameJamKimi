import type { SceneLanguage } from "@/app/api/scene/contract";

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

/** Queue an utterance. Call stopSpeaking() first to interrupt prior speech. */
export function speak(text: string, locale: string): void {
  const content = text.trim();
  const synthesis = getSpeechSynthesis();
  if (
    !content ||
    !synthesis ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(content);
    if (locale.trim()) utterance.lang = locale.trim();
    utterance.rate = 0.95;

    const voice = pickVoice(synthesis, locale);
    if (voice) utterance.voice = voice;
    synthesis.speak(utterance);
  } catch {
    // Speech can fail when a browser's speech service is unavailable.
  }
}

export function stopSpeaking(): void {
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
