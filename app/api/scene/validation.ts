import { ACTORS, EMOTIONS } from "../../../lib/world";
import type { ActorId, Beat, Emotion, Stage } from "../../../lib/world";
import { MAX_LINES } from "./contract";
import type { SceneLine, SceneResponse } from "./contract";
import { parseStage } from "./stage";
import { assertReadableText } from "./content-quality";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, max: number): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) return false;
  assertReadableText(value);
  return true;
}

const isActor = (value: unknown): value is ActorId => typeof value === "string" && Object.hasOwn(ACTORS, value);
const isEmotion = (value: unknown): value is Emotion => EMOTIONS.includes(value as Emotion);

/**
 * Dialogue is extra color on top of the narration, so a bad line is dropped rather than
 * failing the scene. Only actors on stage may speak or be spoken to.
 */
function parseDialogue(raw: unknown, stage: Stage): { lines: SceneLine[]; cues: Map<number, number> } {
  const lines: SceneLine[] = [];
  const cues = new Map<number, number>();
  if (!Array.isArray(raw)) return { lines, cues };
  const cast = new Set(stage.cast.map(({ actor }) => actor));
  for (const [index, line] of raw.entries()) {
    if (!record(line) || !isActor(line.speaker) || !cast.has(line.speaker) || !shortText(line.text, 300)) continue;
    const to = isActor(line.to) && line.to !== line.speaker && cast.has(line.to) ? line.to : undefined;
    lines.push({
      speaker: line.speaker,
      text: line.text.trim(),
      ...(to ? { to } : {}),
      ...(isEmotion(line.emotion) ? { emotion: line.emotion } : {}),
    });
    // A removed dialogue line must not shift its cue onto somebody else's speech.
    cues.set(index + 1, lines.length);
    if (lines.length === MAX_LINES) break;
  }
  return { lines, cues };
}

export function parseLines(raw: unknown, stage: Stage): SceneLine[] {
  return parseDialogue(raw, stage).lines;
}

function withoutCue(beat: Beat): Beat {
  const action = { ...beat };
  delete action.cue;
  return action;
}

/** Keep action order intact; conflicting cue order falls back to the client's timing plan. */
function alignCues(beats: Beat[], cues: Map<number, number>): Beat[] {
  const aligned = beats.map((beat) => {
    if (beat.cue === undefined || beat.cue === 0) return beat;
    const cue = cues.get(beat.cue);
    return cue === undefined ? withoutCue(beat) : { ...beat, cue };
  });
  let previous = 0;
  for (const beat of aligned) {
    if (beat.cue === undefined) continue;
    if (beat.cue < previous) return aligned.map(withoutCue);
    previous = beat.cue;
  }
  return aligned;
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
  const stage = parseStage(value.stage);
  const { lines, cues } = parseDialogue(value.lines, stage);
  stage.beats = alignCues(stage.beats, cues);
  return {
    narration: value.narration.trim(),
    lines,
    newWords: words,
    choices: choices.map((choice: string) => choice.trim()),
    lessonComplete: value.lessonComplete,
    stage,
  };
}

export function parseCompletion(value: unknown): SceneResponse {
  if (!record(value) || !Array.isArray(value.choices)) throw new Error("Missing completion");
  const first: unknown = value.choices[0];
  if (!record(first) || first.finish_reason !== "stop" || !record(first.message) ||
      typeof first.message.content !== "string") throw new Error("Incomplete completion");
  return parseScene(first.message.content);
}
