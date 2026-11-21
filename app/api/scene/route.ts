import { MAX_SCENES } from "./contract";
import type { SceneRequest, SceneResponse } from "./contract";

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

/** Integration stub. Replace this function with the story engine later. */
function createScene(request: SceneRequest): SceneResponse {
  const korean = request.language === "ko";
  // Three scenes keep frontend integration quick; the server also caps at eight.
  const complete = request.history.length >= 2 || request.history.length >= MAX_SCENES - 1;
  if (complete) {
    return {
      narration: korean
        ? "미나와 강아지가 함께 집에 도착했어요. 서로 도우니 마음이 따뜻해졌어요."
        : "Mina and the puppy arrive home together. Helping each other feels good.",
      newWords: [],
      choices: [],
      lessonComplete: true,
    };
  }
  const first = request.history.length === 0;
  const word = korean
    ? { word: first ? "강아지" : "친구", meaning: first ? "puppy" : "friend" }
    : { word: first ? "puppy" : "friend", meaning: first ? "강아지" : "친구" };
  return {
    narration: korean
      ? first
        ? "미나가 빗속에 있는 강아지를 만났어요. 어떻게 도와줄까요?"
        : "미나와 강아지가 비를 피했어요. 새 친구와 무엇을 할까요?"
      : first
        ? "Mina sees a puppy in the rain. How can she help?"
        : "Mina and the puppy are out of the rain. What can she do with her new friend?",
    newWords: request.wordsLearned.includes(word.word) ? [] : [word],
    choices: korean
      ? first ? ["우산을 함께 써요", "어른에게 도움을 청해요"] : ["함께 걸어요", "친구에게 웃어 줘요"]
      : first ? ["Share your umbrella", "Ask a grown-up for help"] : ["Walk together", "Smile at your friend"],
    lessonComplete: false,
  };
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
  return Response.json(createScene(body), {
    headers: { "Cache-Control": "no-store", "X-Scene-Mode": "stub" },
  });
}

function invalidRequest(message: string): Response {
  return Response.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
