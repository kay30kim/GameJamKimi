import stories from "./stories.json";

export type LearningLanguage = "en" | "ko";
export type Action = "walk" | "run" | "hide";
export type Motion = Action | "idle" | "celebrate";
export type Lesson = keyof typeof stories;
export type StoryNode = "intro" | Action | "ending";
export const ACTIONS: Action[] = ["walk", "run", "hide"];
export const LESSONS: Lesson[] = ["empathy", "sharing", "sacrifice"];
export const VOCABULARY = {
  walk: { en: "walk", ko: "걷다" },
  run: { en: "run", ko: "달리다" },
  hide: { en: "hide", ko: "숨다" },
};
export function narrationLanguage(learning: LearningLanguage): LearningLanguage {
  return learning === "en" ? "ko" : "en";
}
export function getNarration(lesson: Lesson, node: StoryNode, learning: LearningLanguage) {
  return stories[lesson][node][narrationLanguage(learning)];
}
export function audioId(lesson: Lesson, node: StoryNode, learning: LearningLanguage) {
  return `${lesson}-${node}-${narrationLanguage(learning)}`;
}
export function actionFromSpeech(text: string): Action | null {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[.!?,]/g, "").trim();
  const commands: Record<Action, string[]> = {
    walk: ["walk", "walk please", "please walk", "걷다", "걸어", "걸어요", "걷기"],
    run: ["run", "run please", "please run", "달리다", "달려", "달려요", "달리기"],
    hide: ["hide", "hide please", "please hide", "숨다", "숨어", "숨어요", "숨기"],
  };
  return ACTIONS.find((action) => commands[action].includes(normalized)) ?? null;
}
