/** Shared wire contract. Client code should use `import type`. */
import type { OpeningId } from "../../../lib/openings";
import type { ActorId, Emotion, Stage } from "../../../lib/world";

export type { Beat, Stage } from "../../../lib/world";

export type SceneLanguage = "en" | "ko";

export interface SceneRequest {
  lesson: string;
  /** Language the child is learning; narration and choices use the other language. */
  language: SceneLanguage;
  age: number;
  wordsLearned: string[];
  /** Completed scenes only; append the current scene and choice before fetching. */
  history: { narration: string; choice: string }[];
  /** Optional starting situation from lib/openings.ts, so first scenes vary between stories. */
  opening?: OpeningId;
}

/** One spoken line of dialogue, voiced by the speaker's own character voice. */
export interface SceneLine {
  /** Always a member of the stage cast. */
  speaker: ActorId;
  /** Uses the narration language. */
  text: string;
  /** Who the speaker is talking to, also in the cast. */
  to?: ActorId;
  emotion?: Emotion;
}

export interface SceneResponse {
  /** Uses the other language, matching vocabulary meanings. Spoken by the narrator before the lines. */
  narration: string;
  /** Up to MAX_LINES lines the characters say after the narration. May be empty. */
  lines: SceneLine[];
  /** word uses the selected language; meaning uses the other language. */
  newWords: { word: string; meaning: string }[];
  /** Uses the other language; empty when lessonComplete is true. */
  choices: string[];
  lessonComplete: boolean;
  /** What the 3D engine plays for this scene, always valid for the world in lib/world.ts. */
  stage: Stage;
}

export interface SceneErrorResponse {
  error: { code: "INVALID_REQUEST"; message: string };
}

export const MAX_SCENES = 8;
export const MAX_LINES = 4;
