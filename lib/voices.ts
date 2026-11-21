import type { ActorId } from "./world";

/** Who is speaking a clip: a character, or the storyteller reading the narration. */
export type Voice = ActorId | "narrator";

/**
 * Public ElevenLabs voice-library IDs, not credentials, cast by Kay for each character.
 * Nabi and Dodo have no voice of their own yet, so they borrow one at a different pace.
 */
export const VOICES: Record<Voice, { id: string; speed: number }> = {
  narrator: { id: "Ov7OTdKIPpevrpNdUZRz", speed: 0.92 },
  hero: { id: "Pbk8E6dlpCANrnpOLIns", speed: 0.9 },
  friend: { id: "loY1uopAz31XyhAEhNSa", speed: 0.86 },
  puppy: { id: "CPv3Zr3CQCqE4ZzuCgBP", speed: 0.94 },
  grownup: { id: "XrExE9yKIg1WjnnlVkGX", speed: 0.86 },
  kitten: { id: "CPv3Zr3CQCqE4ZzuCgBP", speed: 1.04 },
  duck: { id: "Pbk8E6dlpCANrnpOLIns", speed: 1.05 },
};

export const isVoice = (value: unknown): value is Voice => typeof value === "string" && Object.hasOwn(VOICES, value);
