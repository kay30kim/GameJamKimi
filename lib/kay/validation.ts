import type { DialogueLine, KayStory, Language, Localized, Location, Mood, Motion, Speaker, StoryChoice, StoryScene } from "./types";

const SPEAKERS: Speaker[] = ["alice", "momo", "bori", "owl", "narrator"];
const MOODS: Mood[] = ["happy", "sad", "curious", "excited", "surprised"];
const MOTIONS: Motion[] = ["talk", "wave", "dance", "walk", "offer", "think", "cheer"];
const LOCATIONS: Location[] = ["meadow", "garden", "pond", "cottage"];
function fail(message: string): never { throw new Error(`Invalid story: ${message}`); }
function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(name);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail(name);
  return value.trim();
}
function id(value: unknown): string {
  const result = text(value, 80, "identifier");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result) || ["constructor", "prototype", "__proto__"].includes(result)) return fail("identifier");
  return result;
}
function localized(value: unknown, max: number): Localized {
  const object = record(value, "translated text");
  return { ko: renameLegacyCharacter(text(object.ko, max, "Korean text")), en: renameLegacyCharacter(text(object.en, max, "English text")) };
}
/** Keep existing saved books playable with the renamed cast and spoken dialogue. */
function renameLegacyCharacter(value: string): string {
  return value.replace(/\bKimi\b/gi, "Alice").replace(/키미/g, "앨리스");
}
function speaker(value: unknown, allowNarrator = true): Speaker {
  return member(value === "kimi" ? "alice" : value, allowNarrator ? SPEAKERS : SPEAKERS.slice(0, 4), "speaker");
}
function member<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) return fail(name);
  return value as T;
}

/** Rebuild the object rather than trusting saved or model-generated properties. */
export function parseKayStory(value: unknown): KayStory {
  const raw = record(value, "object");
  if (raw.version !== 1) fail("version");
  const rawScenes = record(raw.scenes, "scenes");
  const entries = Object.entries(rawScenes);
  if (entries.length < 7 || entries.length > 14) fail("expected 7–14 scenes");
  const lineIds = new Set<string>();
  const scenes: Record<string, StoryScene> = {};
  let totalLines = 0;
  let narratorLines = 0;
  for (const [key, value] of entries) {
    const rawScene = record(value, "scene");
    if (id(key) !== id(rawScene.id)) fail("scene key and id differ");
    if (!Array.isArray(rawScene.lines) || rawScene.lines.length < 4 || rawScene.lines.length > 8) fail("expected 4–8 lines per scene");
    const lines = rawScene.lines.map((value): DialogueLine => {
      const rawLine = record(value, "line");
      const lineId = id(rawLine.id);
      if (lineIds.has(lineId)) fail("duplicate dialogue id");
      lineIds.add(lineId);
      const actor = speaker(rawLine.speaker);
      totalLines++;
      if (actor === "narrator") narratorLines++;
      return {
        id: lineId, speaker: actor, text: localized(rawLine.text, 320),
        ...(rawLine.to !== undefined ? { to: speaker(rawLine.to, false) } : {}),
        ...(rawLine.emotion !== undefined ? { emotion: member(rawLine.emotion, MOODS, "emotion") } : {}),
        ...(rawLine.action !== undefined ? { action: member(rawLine.action, MOTIONS, "action") } : {}),
        ...(rawLine.learn !== undefined ? { learn: localized(rawLine.learn, 80) } : {}),
      };
    });
    if (!Array.isArray(rawScene.choices) || ![0, 2].includes(rawScene.choices.length)) fail("choices must have zero or two entries");
    const choices = rawScene.choices.map((value): StoryChoice => {
      const rawChoice = record(value, "choice");
      return {
        label: localized(rawChoice.label, 130), next: id(rawChoice.next),
        ...(rawChoice.actor !== undefined ? { actor: speaker(rawChoice.actor, false) } : {}),
      };
    });
    if (choices.length && rawScene.next !== undefined) fail("scene has both choices and next");
    if (choices.length && (choices[0].next === choices[1].next || choices[0].label.ko === choices[1].label.ko || choices[0].label.en === choices[1].label.en)) fail("choices need different actions and consequences");
    scenes[key] = {
      id: key, title: localized(rawScene.title, 100), location: member(rawScene.location, LOCATIONS, "location"), lines, choices,
      ...(rawScene.next !== undefined ? { next: id(rawScene.next) } : {}),
      ...(rawScene.practice !== undefined ? { practice: localized(rawScene.practice, 80) } : {}),
    };
  }
  if (totalLines > 84 || narratorLines > Math.ceil(totalLines * 0.15)) fail("too many lines or too much narration");
  const start = id(raw.start);
  const reachable = new Set<string>();
  let completedPaths = 0;
  function visit(sceneId: string, stack: Set<string>, lineCount: number, decisions: number) {
    const node = scenes[sceneId];
    if (!Object.hasOwn(scenes, sceneId)) fail("dangling scene reference");
    if (stack.has(sceneId)) fail("cyclic story");
    if (stack.size >= 10) fail("story path is too long");
    reachable.add(sceneId);
    const branch = new Set(stack).add(sceneId);
    const count = lineCount + node.lines.length;
    const choiceCount = decisions + (node.choices.length ? 1 : 0);
    const next = node.choices.length ? node.choices.map((item) => item.next) : node.next ? [node.next] : [];
    if (!next.length) {
      completedPaths++;
      if (count < 30 || count > 56 || branch.size < 6 || choiceCount < 2 || choiceCount > 3) fail("each path needs 30–56 lines, at least 6 scenes, and 2–3 decisions");
      return;
    }
    next.forEach((nextId) => visit(nextId, branch, count, choiceCount));
  }
  visit(start, new Set(), 0, 0);
  if (!completedPaths || reachable.size !== entries.length) fail("unreachable scenes");
  return {
    version: 1, id: id(raw.id), title: localized(raw.title, 100), description: localized(raw.description, 240),
    lesson: renameLegacyCharacter(text(raw.lesson, 600, "lesson")), start, scenes,
    ...(raw.custom === true ? { custom: true } : {}),
  };
}

export interface CustomStoryRequest { prompt: string; age: number; homeLanguage: Language; learnLanguage: Language }
export function parseCustomStoryRequest(value: unknown): CustomStoryRequest {
  const raw = record(value, "request");
  const prompt = text(raw.prompt, 600, "parent prompt");
  if (prompt.length < 3) fail("parent prompt is too short");
  if (typeof raw.age !== "number" || !Number.isInteger(raw.age) || raw.age < 3 || raw.age > 8) fail("age must be 3–8");
  const homeLanguage = member(raw.homeLanguage, ["ko", "en"] as const, "home language");
  const learnLanguage = member(raw.learnLanguage, ["ko", "en"] as const, "learning language");
  if (homeLanguage === learnLanguage) fail("languages must differ");
  return { prompt, age: raw.age, homeLanguage, learnLanguage };
}
