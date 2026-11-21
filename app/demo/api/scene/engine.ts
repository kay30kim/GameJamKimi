import { buildSceneMessages } from "../../../../lib/demo/prompt";
import { MAX_SCENES } from "../../../api/scene/contract";
import type { SceneRequest, SceneResponse } from "../../../api/scene/contract";
import { createClosingScene, createStubScene } from "../../../api/scene/fallback";
import { parseCompletion } from "../../../api/scene/validation";

interface EngineOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface SceneResult {
  scene: SceneResponse;
  mode: "stub" | "kimi" | "fallback" | "limit";
}

export async function generateScene(
  request: SceneRequest,
  options: EngineOptions = {},
): Promise<SceneResult> {
  if (request.history.length >= MAX_SCENES - 1) {
    return { scene: createClosingScene(request.language), mode: "limit" };
  }
  const apiKey = (options.apiKey ?? process.env.KIMI_API_KEY)?.trim();
  if (!apiKey) return { scene: createStubScene(request), mode: "stub" };

  const model = options.model ?? (process.env.KIMI_MODEL?.trim() || "kimi-k3");
  const fetcher = options.fetcher ?? fetch;
  const messages = buildSceneMessages(request);
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
            content: "The previous attempt failed validation. Return a complete JSON scene matching the schema, with two distinct choices or an ending with no choices.",
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
        throw new Error("Temporary provider error");
      }
      const scene = parseCompletion(await response.json());
      const learned = new Set(request.wordsLearned.map((word) => word.trim().normalize("NFC").toLocaleLowerCase()));
      scene.newWords = scene.newWords.filter(({ word }) => !learned.has(word.normalize("NFC").toLocaleLowerCase()));
      return { scene, mode: "kimi" };
    } catch {
      // Do not expose credentials, provider payloads, or children's history in logs/errors.
      // Retry once, then return a valid, localized closing scene.
    }
  }
  return { scene: createClosingScene(request.language), mode: "fallback" };
}
