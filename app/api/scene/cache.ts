import { generatedKey, readGenerated, writeGenerated } from "../../../lib/generated-cache";
import { buildSceneMessages } from "../../../lib/prompt";
import { generateScene, resolvedSceneModel } from "./engine";
import type { SceneRequest, SceneResponse } from "./contract";
import { parseScene } from "./validation";
import { validateSceneContent } from "./content-quality";

const SCENE_CACHE_REVISION = "scene-v3-ground-seating-supported-prop-choices";
type SceneResult = Awaited<ReturnType<typeof generateScene>>;
export type CachedSceneResult = SceneResult & { cache: "hit" | "miss" | "bypass" };

/** Includes the complete world, branch and actual prompt; never round actor positions. */
export function sceneCacheKey(request: SceneRequest, model = resolvedSceneModel()): string {
  return generatedKey({
    revision: SCENE_CACHE_REVISION,
    model,
    request: {
      lesson: request.lesson, language: request.language, age: request.age,
      opening: request.opening, wordsLearned: request.wordsLearned,
      history: request.history, continuation: request.continuation,
    },
    messages: buildSceneMessages(request).map(({ role, content }) => ({
      role, content: role === "user" ? JSON.parse(content) as unknown : content,
    })),
  });
}

type CacheDependencies = {
  model: () => string;
  read: typeof readGenerated;
  write: typeof writeGenerated;
  generate: typeof generateScene;
};

/** All storage is private, including custom lessons and children’s story history. */
export function createCachedSceneGenerator(dependencies: CacheDependencies = {
  model: resolvedSceneModel, read: readGenerated, write: writeGenerated, generate: generateScene,
}) {
  const inFlight = new Map<string, Promise<CachedSceneResult>>();
  return async (request: SceneRequest): Promise<CachedSceneResult> => {
    const model = dependencies.model();
    const key = sceneCacheKey(request, model);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const work = (async (): Promise<CachedSceneResult> => {
      try {
        const bytes = await dependencies.read("scene", key);
        if (bytes) {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          const scene = validateSceneContent(parseScene(text), request);
          // A repaired/defaulted stage or dropped dialogue is not the saved scene.
          // Reject corrupt entries instead of silently changing the cached story.
          if (generatedKey(JSON.parse(text)) === generatedKey(scene)) {
            return { scene, mode: "kimi", cache: "hit" };
          }
        }
      } catch { /* Storage errors and corrupt entries fall through to generation. */ }

      const result = await dependencies.generate(request, { model });
      if (result.mode !== "kimi") return { ...result, cache: "bypass" };
      const scene: SceneResponse = validateSceneContent(parseScene(JSON.stringify(result.scene)), request);
      let stored = false;
      try {
        stored = await dependencies.write("scene", key, new TextEncoder().encode(JSON.stringify(scene)), "application/json");
      } catch { /* A cache outage must never lose a successfully generated story. */ }
      return { ...result, scene, cache: stored ? "miss" : "bypass" };
    })();
    inFlight.set(key, work);
    try { return await work; }
    finally { if (inFlight.get(key) === work) inFlight.delete(key); }
  };
}

export const generateCachedScene = createCachedSceneGenerator();
