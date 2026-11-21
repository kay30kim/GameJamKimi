/** Shared wire contract. Client code should use `import type`. */
export type SceneLanguage = "en" | "ko";

export interface SceneRequest {
  lesson: string;
  language: SceneLanguage;
  age: number;
  wordsLearned: string[];
  /** Completed scenes only; append the current scene and choice before fetching. */
  history: { narration: string; choice: string }[];
}

export interface SceneResponse {
  narration: string;
  /** word uses the selected language; meaning uses the other language. */
  newWords: { word: string; meaning: string }[];
  /** Empty when lessonComplete is true. */
  choices: string[];
  lessonComplete: boolean;
}

export interface SceneErrorResponse {
  error: { code: "INVALID_REQUEST"; message: string };
}

export const MAX_SCENES = 8;
