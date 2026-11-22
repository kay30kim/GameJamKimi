export type Language = "ko" | "en";
export type Localized = Record<Language, string>;
export type Speaker = "alice" | "momo" | "bori" | "owl" | "narrator";
export type Mood = "happy" | "sad" | "curious" | "excited" | "surprised";
export type Motion = "talk" | "wave" | "dance" | "walk" | "offer" | "think" | "cheer";
export type Location = "meadow" | "garden" | "pond" | "cottage";
export interface DialogueLine {
  id: string;
  speaker: Speaker;
  text: Localized;
  to?: Speaker;
  emotion?: Mood;
  action?: Motion;
  /** An additional short expression, spoken in the language being learned. */
  learn?: Localized;
}
export interface StoryChoice { label: Localized; next: string; actor?: Speaker }
export interface StoryScene {
  id: string;
  title: Localized;
  location: Location;
  lines: DialogueLine[];
  choices: StoryChoice[];
  next?: string;
  practice?: Localized;
}
export interface KayStory {
  version: 1;
  id: string;
  title: Localized;
  description: Localized;
  lesson: string;
  start: string;
  scenes: Record<string, StoryScene>;
  custom?: boolean;
}
export const SPEAKERS: Record<Speaker, { name: Localized; color: string }> = {
  alice: { name: { ko: "앨리스", en: "Alice" }, color: "#d78068" },
  momo: { name: { ko: "모모", en: "Momo" }, color: "#638eab" },
  bori: { name: { ko: "보리", en: "Bori" }, color: "#b69a43" },
  owl: { name: { ko: "부엉이 할머니", en: "Grandma Owl" }, color: "#9783ad" },
  narrator: { name: { ko: "이야기", en: "Story" }, color: "#71836a" },
};
