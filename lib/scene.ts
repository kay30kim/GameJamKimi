import type {
  SceneErrorResponse,
  SceneLanguage,
  SceneRequest,
  SceneResponse,
} from "@/app/api/scene/contract";
import mockScene from "@/mocks/scene.json";
import { meaningLocale, preloadSpeech, speechLocale } from "@/lib/speech";

/**
 * Set NEXT_PUBLIC_USE_MOCK_SCENE=1 to play against mocks/scene.json instead of
 * the live API. Useful while the story engine is under construction.
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_SCENE === "1";

const MAX_PREFETCHED = 12;
const prefetched = new Map<string, Promise<SceneResponse>>();
const keyOf = ({ lesson, language, age, wordsLearned, history, opening }: SceneRequest) =>
  JSON.stringify([lesson, language, age, wordsLearned, history, opening]);

/** Thrown when Alice failed and the server sent its generic closing instead of a real scene. */
class FallbackScene extends Error {}

/**
 * Start generating a scene before the child asks for it. A later fetchScene with
 * the same request picks up this result instead of calling Alice again.
 */
export function prefetchScene(request: SceneRequest): Promise<SceneResponse> {
  const key = keyOf(request);
  const existing = prefetched.get(key);
  if (existing) return existing;

  const pending = requestScene(request, { rejectFallback: true });
  prefetched.set(key, pending);
  pending.catch(() => {
    if (prefetched.get(key) === pending) prefetched.delete(key);
  });
  for (const oldest of prefetched.keys()) {
    if (prefetched.size <= MAX_PREFETCHED) break;
    prefetched.delete(oldest);
  }
  return pending;
}

/** Uses a prefetched scene when there is one. If that background attempt failed, asks again live. */
export async function fetchScene(request: SceneRequest): Promise<SceneResponse> {
  const key = keyOf(request);
  const pending = prefetched.get(key);
  if (pending) {
    prefetched.delete(key);
    const scene = await pending.catch(() => null);
    if (scene) return scene;
  }
  return requestScene(request);
}

async function requestScene(
  request: SceneRequest,
  { rejectFallback = false } = {},
): Promise<SceneResponse> {
  if (USE_MOCK) return mockScene as SceneResponse;

  let res: Response;
  try {
    res = await fetch("/api/scene", {
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
  if (rejectFallback && res.headers.get("X-Scene-Mode") === "fallback") {
    throw new FallbackScene("Alice didn't return a scene in time.");
  }
  return data;
}

/** The request choose() sends. Prefetching builds the same one, so the cached scene matches. */
export function nextSceneRequest(
  settings: Pick<SceneRequest, "lesson" | "language" | "age" | "opening">,
  history: SceneRequest["history"],
  wordsLearned: string[],
  scene: SceneResponse,
  choice: string,
): SceneRequest {
  return {
    ...settings,
    wordsLearned: dedupeWords([...wordsLearned, ...scene.newWords.map(({ word }) => word)]),
    history: [...history, { narration: scene.narration, choice }],
  };
}

/** Warm the scene's narration and word audio so it plays as soon as the scene shows. */
function preloadSceneSpeech(scene: SceneResponse, language: SceneLanguage) {
  preloadSpeech(scene.narration, meaningLocale(language));
  for (const line of scene.lines) preloadSpeech(line.text, meaningLocale(language), line.speaker);
  for (const { word, meaning } of scene.newWords) {
    preloadSpeech(word, speechLocale(language));
    preloadSpeech(meaning, meaningLocale(language));
  }
}

/** Prefetch a scene, then warm its audio. Errors are ignored; fetchScene retries live. */
export function prefetch(request: SceneRequest) {
  prefetchScene(request)
    .then((scene) => preloadSceneSpeech(scene, request.language))
    .catch(() => {});
}

export function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of words) {
    const trimmed = word.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}
