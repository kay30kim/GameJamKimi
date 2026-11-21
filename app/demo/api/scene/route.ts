import { generateScene } from "./engine";
import { MAX_SCENES } from "../../../api/scene/contract";
import type { SceneRequest } from "../../../api/scene/contract";

export const maxDuration = 60;

function isSceneRequest(value: unknown): value is SceneRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lesson === "string" &&
    v.lesson.trim().length > 0 && v.lesson.length <= 500 &&
    (v.language === "en" || v.language === "ko") &&
    typeof v.age === "number" && Number.isInteger(v.age) &&
    v.age >= 3 && v.age <= 6 &&
    Array.isArray(v.wordsLearned) && v.wordsLearned.length <= 100 &&
    v.wordsLearned.every((word) => typeof word === "string" && word.length <= 100) &&
    Array.isArray(v.history) && v.history.length <= MAX_SCENES &&
    v.history.every((entry) =>
      entry !== null && typeof entry === "object" &&
      typeof entry.narration === "string" && entry.narration.length <= 4000 &&
      typeof entry.choice === "string" && entry.choice.length <= 500
    )
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }
  if (!isSceneRequest(body)) {
    return invalidRequest(
      "Expected lesson (1–500 characters), language (en or ko), age (integer 3–6), wordsLearned (up to 100 strings), and history (up to 8 narration/choice entries).",
    );
  }
  const result = await generateScene(body);
  return Response.json(result.scene, {
    headers: { "Cache-Control": "no-store", "X-Scene-Mode": result.mode },
  });
}

function invalidRequest(message: string): Response {
  return Response.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
