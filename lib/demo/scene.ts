import type {
  SceneErrorResponse,
  SceneRequest,
  SceneResponse,
} from "@/app/api/scene/contract";
import mockScene from "@/mocks/scene.json";

/**
 * Set NEXT_PUBLIC_USE_MOCK_SCENE=1 to play against mocks/scene.json instead of
 * the live API. Useful while the story engine is under construction.
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_SCENE === "1";

export async function fetchScene(
  request: SceneRequest,
): Promise<SceneResponse> {
  if (USE_MOCK) return mockScene as SceneResponse;

  let res: Response;
  try {
    res = await fetch("/demo/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error("Couldn't reach the story server. Check your connection.");
  }

  let data: SceneResponse | SceneErrorResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("The story server sent something unreadable.");
  }

  if (!res.ok || "error" in data) {
    throw new Error(
      "error" in data ? data.error.message : "The story server had a problem.",
    );
  }
  return data;
}
