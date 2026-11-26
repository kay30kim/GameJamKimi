import type { Voice } from "./voices";
import type { Emotion } from "./world";

export const TYPECAST_BASE_URL = "https://api.typecast.ai";
export const TYPECAST_CHILD_ROLES: readonly Voice[] = ["hero", "friend", "puppy", "kitten", "duck"];

// Public API voice IDs, verified against the ssfm-v31 catalog. Shipping the cast
// with the app keeps a deployment from silently losing voices that existed only
// in a developer's .env.local. Credentials remain server environment variables.
export const TYPECAST_CAST: Readonly<Record<Voice, string>> = {
  narrator: "tc_6a7446c19f2d7dfed990a900", // 은경
  hero: "tc_6ae2b38a6c6f117dcc049386", // 아윤
  friend: "tc_6a98d65b0402016f616a7ac3", // 준우
  puppy: "tc_6699eb3849dfac016c29444c", // 시우
  grownup: "tc_6a867e7a0e6ddfd2f2dd17b6", // 경애
  kitten: "tc_6699eb5749dfac016c29445c", // 수아
  duck: "tc_65fbe54e2668bc4ddbd8b2a6", // 하율
};

export type TypecastConfig = {
  apiKey: string;
  voiceId: string;
  model: "ssfm-v31" | "ssfm-v30";
};

/** Server-only settings. Studio actor IDs must never be guessed into API voice IDs. */
export function typecastConfig(voice: Voice): TypecastConfig | null {
  const apiKey = process.env.TYPECAST_API_KEY?.trim();
  const voiceId = process.env[`TYPECAST_VOICE_${voice.toUpperCase()}`]?.trim() || TYPECAST_CAST[voice];
  const model = process.env.TYPECAST_MODEL?.trim() || "ssfm-v31";
  if (!apiKey || !voiceId || !/^(?:tc|uc)_[A-Za-z0-9_-]+$/.test(voiceId) || (model !== "ssfm-v31" && model !== "ssfm-v30")) return null;
  return { apiKey, voiceId, model };
}

/** Check the actual API catalog instead of pitching an adult voice up. */
export function typecastEmotions(metadata: unknown, config: TypecastConfig, voice: Voice): string[] | null {
  if (!metadata || typeof metadata !== "object") throw new Error("Invalid voice metadata");
  const record = metadata as Record<string, unknown>;
  if (record.voice_id !== config.voiceId || !Array.isArray(record.models)) throw new Error("Invalid voice metadata");
  if (TYPECAST_CHILD_ROLES.includes(voice) && record.age !== "child") return null;
  for (const model of record.models) {
    if (model && typeof model === "object" && model.version === config.model && Array.isArray(model.emotions) && model.emotions.every((value: unknown) => typeof value === "string")) {
      return model.emotions as string[];
    }
  }
  return null;
}

export function typecastBody(text: string, config: TypecastConfig, emotions: string[], emotion?: Emotion) {
  const preset = emotion === "excited" ? "happy" : emotion;
  const prompt = (preset === "happy" || preset === "sad") && emotions.includes(preset)
    ? { emotion_type: "preset", emotion_preset: preset, emotion_intensity: 1 }
    : { emotion_type: "smart" };
  // Let multilingual synthesis read both languages in teaching phrases. For a
  // Korean-only line, pin pronunciation to Korean rather than guessing.
  const hasKorean = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(text);
  const hasEnglish = /[a-z]/i.test(text);
  return {
    text,
    model: config.model,
    voice_id: config.voiceId,
    ...(!hasEnglish && hasKorean ? { language: "KOR" } : !hasKorean && hasEnglish ? { language: "ENG" } : {}),
    prompt,
    output: { audio_format: "mp3", audio_pitch: 0, audio_tempo: 0.95 },
  };
}
