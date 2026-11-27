import { buildSceneMessages } from "../../../lib/prompt";
import { MAX_SCENES, MIN_SCENES } from "./contract";
import type { SceneRequest, SceneResponse } from "./contract";
import { createClosingScene, createStubScene } from "./fallback";
import { parseCompletion } from "./validation";
import { validateSceneContent } from "./content-quality";
import { expressionKey } from "../../../lib/lesson-vocabulary";

interface EngineOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Wait before retrying a rate-limited (429) request; an immediate retry is rate-limited too. */
  retryDelayMs?: number;
}

interface SceneResult {
  scene: SceneResponse;
  mode: "stub" | "kimi" | "limit";
}

/** An unavailable scene is recoverable, never a successful story ending. */
export class SceneGenerationError extends Error {
  constructor() { super("The next scene could not be prepared. Please try again."); this.name = "SceneGenerationError"; }
}

/** Shared by generation and cache identity so changing the model cannot reuse old scripts. */
export const resolvedSceneModel = () => process.env.KIMI_MODEL?.trim() || "kimi-k3.1-pro-highspeed";

export async function generateScene(
  request: SceneRequest,
  options: EngineOptions = {},
): Promise<SceneResult> {
  if (request.history.length >= MAX_SCENES - 1) {
    return { scene: createClosingScene(request.language), mode: "limit" };
  }
  const apiKey = (options.apiKey ?? process.env.KIMI_API_KEY)?.trim();
  if (!apiKey) return { scene: createStubScene(request), mode: "stub" };

  // The highspeed model returns a valid scene in about 2-4 s, versus 6-20 s for kimi-k3.
  const model = options.model ?? resolvedSceneModel();
  const fetcher = options.fetcher ?? fetch;
  const messages = buildSceneMessages(request);
  const tooEarlyToEnd = request.history.length + 1 < MIN_SCENES;
  let retryNote = "The previous attempt failed validation. Return a complete JSON scene matching the schema, with two distinct choices or an ending with no choices.";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        body: JSON.stringify({
          model,
          messages: attempt === 0 ? messages : [...messages, {
            role: "user",
            content: retryNote,
          }],
          response_format: { type: "json_object" },
          reasoning_effort: "low",
          max_completion_tokens: 4096,
          stream: false,
        }),
      });
      if (!response.ok) {
        // Retrying a rejected credential or unsupported parameter cannot repair it.
        if (response.status !== 429 && response.status < 500) break;
        if (response.status === 429 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 1500));
        }
        throw new Error("Temporary provider error");
      }
      const scene = validateSceneContent(parseCompletion(await response.json()), request);
      // A repeated early ending still has not given the child a meaningful choice.
      if (scene.lessonComplete && tooEarlyToEnd) {
        retryNote = `Too early to end: the story needs at least ${MIN_SCENES} scenes. Continue the story with lessonComplete false and two distinct choices.`;
        continue;
      }
      const learned = new Set(request.wordsLearned.map(expressionKey));
      scene.newWords = scene.newWords.filter(({ word }) => !learned.has(expressionKey(word)));
      return { scene, mode: "kimi" };
    } catch (failure) {
      // Do not expose credentials, provider payloads, or children's history in logs/errors.
      // Give the generator useful fixed validation guidance without replaying child text.
      if (failure instanceof Error && /Corrupt text|Invalid Korean|Unreviewed learning|Duplicate learning|Age three|Unsupported visible action/.test(failure.message)) {
        retryNote = `The previous scene failed quality checks: ${failure.message}. Regenerate a complete scene using the supplied reviewed vocabulary and simple, correctly spelled sentences.`;
      }
    }
  }
  throw new SceneGenerationError();
}
