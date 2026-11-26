import { generateScene } from "./engine";
import { isSceneRequest } from "./request-validation";

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
