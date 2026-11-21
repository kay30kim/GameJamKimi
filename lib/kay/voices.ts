import type { Speaker } from "./types";

/** Public voice-library IDs, not credentials. These are character performances. */
export const KAY_AUDIO_VERSION = "kay-cast-v1";
export const KAY_VOICES: Record<Speaker, { id: string; name: string; speed: number; pitch: number }> = {
  kimi: { id: "Pbk8E6dlpCANrnpOLIns", name: "Mishi · child animation", speed: 0.9, pitch: 1.35 },
  momo: { id: "loY1uopAz31XyhAEhNSa", name: "Valf · young playful character", speed: 0.86, pitch: 1.14 },
  bori: { id: "CPv3Zr3CQCqE4ZzuCgBP", name: "Lulu · bright playful character", speed: 0.94, pitch: 1.5 },
  owl: { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda · warm storyteller", speed: 0.86, pitch: 0.95 },
  narrator: { id: "Ov7OTdKIPpevrpNdUZRz", name: "Belle B · gentle story guide", speed: 0.92, pitch: 1.0 },
};

export function speechIdentity(text: string, language: string, speaker: Speaker): string {
  return JSON.stringify([KAY_AUDIO_VERSION, speaker, language, text.trim().normalize("NFC")]);
}
