/** Shared routing rule: teaching lines can contain Korean even in English mode. */
export function needsKoreanVoice(text: string, locale: string): boolean {
  return /^ko(?:[-_]|$)/i.test(locale.trim()) || /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(text);
}

export type SpeechErrorCode =
  | "TTS_NOT_CONFIGURED"
  | "TTS_UPSTREAM_ERROR"
  | "TTS_TIMEOUT"
  | "TTS_PLAYBACK_ERROR";

// Old Korean blobs must not survive a provider or casting-policy change.
export const VOICE_CACHE_REVISION = "typecast-child-v1";
