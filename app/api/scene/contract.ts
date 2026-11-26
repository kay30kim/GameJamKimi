/** Shared wire contract. Client code should use `import type`. */
import type { OpeningId } from "../../../lib/openings";
import type { ActorId, Beat, Emotion, Stage, WorldSnapshot } from "../../../lib/world";

export type { Beat, Stage } from "../../../lib/world";

export type SceneLanguage = "en" | "ko";

export interface SceneRequest {
  lesson: string;
  /** Primary language for the story, dialogue, choices, and vocabulary words. */
  language: SceneLanguage;
  age: number;
  wordsLearned: string[];
  /** Completed scenes only; append the current scene and choice before fetching. */
  history: { narration: string; choice: string }[];
  /** Optional starting situation from lib/openings.ts, so first scenes vary between stories. */
  opening?: OpeningId;
  /** Actual state after the preceding scene, plus its dialogue and attempted actions. */
  continuation?: SceneContinuation;
}

export interface SceneContinuation {
  /** Authoritative positions and prop ownership after playback, including skipped playback. */
  world: WorldSnapshot;
  previousLines: SceneLine[];
  /** Context only: a blocked action may not have changed the world. */
  previousBeats: Beat[];
}

/** One spoken line of dialogue, voiced by the speaker's own character voice. */
export interface SceneLine {
  /** Always a member of the stage cast. */
  speaker: ActorId;
  /** Primarily uses the selected language; may include a brief translated example. */
  text: string;
  /** Who the speaker is talking to, also in the cast. */
  to?: ActorId;
  emotion?: Emotion;
}

export interface SceneResponse {
  /** Uses the selected language. Spoken by the narrator before the lines. */
  narration: string;
  /** Up to MAX_LINES lines the characters say after the narration. May be empty. */
  lines: SceneLine[];
  /** word uses the selected language; meaning uses the other language. */
  newWords: { word: string; meaning: string }[];
  /** Uses the selected language; empty when lessonComplete is true. */
  choices: string[];
  lessonComplete: boolean;
  /** What the 3D engine plays. Beat cues reference narration (0) or this response's lines (1-based). */
  stage: Stage;
}

export interface SceneErrorResponse {
  error: { code: "INVALID_REQUEST"; message: string };
}

export const MAX_SCENES = 8;
/** A story needs room to set up the lesson, let the child choose, and show it; never end before this scene. */
export const MIN_SCENES = 3;
export const MAX_LINES = 4;
