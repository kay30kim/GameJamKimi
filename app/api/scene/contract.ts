/** Shared wire contract. Client code should use `import type`. */
export type SceneLanguage = "en" | "ko";

export interface SceneRequest {
  lesson: string;
  /** Language the child is learning; narration and choices use the other language. */
  language: SceneLanguage;
  age: number;
  wordsLearned: string[];
  /** Completed scenes only; append the current scene and choice before fetching. */
  history: { narration: string; choice: string }[];
}

export interface SceneResponse {
  /** Uses the other language, matching vocabulary meanings. */
  narration: string;
  /** word uses the selected language; meaning uses the other language. */
  newWords: { word: string; meaning: string }[];
  /** Uses the other language; empty when lessonComplete is true. */
  choices: string[];
  lessonComplete: boolean;
}

export interface SceneErrorResponse {
  error: { code: "INVALID_REQUEST"; message: string };
}

export const MAX_SCENES = 8;
