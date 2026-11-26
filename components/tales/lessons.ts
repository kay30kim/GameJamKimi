import type { SceneLanguage } from "@/app/api/scene/contract";

export type Localized = Record<SceneLanguage, string>;

export const MAX_OWN_LESSON = 200;
export const OWN = "own";

export const LESSONS: { id: string; icon: string; color: string; name: Localized }[] = [
  { id: "kindness", icon: "kindness", color: "#d78068", name: { ko: "친절", en: "Kindness" } },
  { id: "empathy", icon: "empathy", color: "#8e91b9", name: { ko: "공감", en: "Empathy" } },
  { id: "sharing", icon: "sharing", color: "#ceaa55", name: { ko: "나눔", en: "Sharing" } },
  { id: "honesty", icon: "honesty", color: "#77a292", name: { ko: "정직", en: "Honesty" } },
  { id: "patience", icon: "patience", color: "#7f9db3", name: { ko: "인내", en: "Patience" } },
  { id: "bravery", icon: "spark", color: "#c98a5a", name: { ko: "용기", en: "Bravery" } },
  { id: "gratitude", icon: "leaf", color: "#9aa86a", name: { ko: "감사", en: "Gratitude" } },
  { id: "teamwork", icon: "book", color: "#6f9a7d", name: { ko: "협동", en: "Teamwork" } },
  { id: "body_safety", icon: "honesty", color: "#a082ab", name: { ko: "소중한 내 몸", en: "My body & boundaries" } },
  { id: "table_manners", icon: "leaf", color: "#9a9b64", name: { ko: "식사 예절", en: "Table manners" } },
];
export const OWN_CARD = { color: "#a78650", name: { ko: "직접 쓰기", en: "Your own" } };

