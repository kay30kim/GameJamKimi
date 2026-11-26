import type { SceneLanguage } from "../app/api/scene/contract";

/** The child practices the selected language; a translation supports understanding. */
export function practiceInvitation(language: SceneLanguage, expression: string): string {
  return language === "ko"
    ? `우리 같이 “${expression}”라고 말해 볼까?`
    : `Can you say “${expression}” with me?`;
}
