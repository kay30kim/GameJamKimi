import { generateCachedScene } from "./cache";
import { isSceneRequest } from "./request-validation";
import { generatedCacheBackend } from "../../../lib/generated-cache";
import { SceneGenerationError } from "./engine";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }
  if (!isSceneRequest(body)) {
    return invalidRequest(
      "Expected lesson (1–500 characters), language (en or ko), age (integer 3–6), wordsLearned (up to 100 strings), history (up to 8 narration/choice entries), an optional opening id, and an optional valid continuation with bounded world state, up to 4 dialogue lines, and up to 4 actions.",
    );
  }
  let result;
  try {
    result = await generateCachedScene(body);
  } catch (error) {
    if (!(error instanceof SceneGenerationError)) throw error;
    return Response.json({ error: { code: "SCENE_UNAVAILABLE", message: body.language === "ko"
      ? "다음 이야기를 준비하지 못했어요. 잠시 후 다시 해 볼까요?"
      : "The next part is not ready. Please try again in a moment." } },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } });
  }
  return Response.json(result.scene, {
    headers: { "Cache-Control": "no-store", "X-Scene-Mode": result.mode, "X-Scene-Cache": result.cache, "X-Generated-Storage": generatedCacheBackend() },
  });
}

function invalidRequest(message: string): Response {
  return Response.json(
    { error: { code: "INVALID_REQUEST", message } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
