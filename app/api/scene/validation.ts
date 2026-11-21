import type { SceneResponse } from "./contract";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** Validate semantics as well as JSON syntax; return only the public contract. */
export function parseScene(content: string): SceneResponse {
  const value: unknown = JSON.parse(content);
  if (!record(value) || !shortText(value.narration, 1200) ||
      typeof value.lessonComplete !== "boolean" || !Array.isArray(value.choices) ||
      !Array.isArray(value.newWords) || value.newWords.length > 2) {
    throw new Error("Invalid scene shape");
  }
  const choices = value.choices;
  if (choices.length !== (value.lessonComplete ? 0 : 2) ||
      !choices.every((choice) => shortText(choice, 150)) ||
      new Set(choices.map((choice: string) => choice.trim())).size !== choices.length) {
    throw new Error("Invalid scene choices");
  }
  const words = value.newWords.map((word: unknown) => {
    if (!record(word) || !shortText(word.word, 100) || !shortText(word.meaning, 150)) {
      throw new Error("Invalid vocabulary");
    }
    return { word: word.word.trim(), meaning: word.meaning.trim() };
  });
  if (new Set(words.map(({ word }) => word)).size !== words.length) {
    throw new Error("Duplicate vocabulary");
  }
  return {
    narration: value.narration.trim(),
    newWords: words,
    choices: choices.map((choice: string) => choice.trim()),
    lessonComplete: value.lessonComplete,
  };
}

export function parseCompletion(value: unknown): SceneResponse {
  if (!record(value) || !Array.isArray(value.choices)) throw new Error("Missing completion");
  const first: unknown = value.choices[0];
  if (!record(first) || first.finish_reason !== "stop" || !record(first.message) ||
      typeof first.message.content !== "string") throw new Error("Incomplete completion");
  return parseScene(first.message.content);
}
