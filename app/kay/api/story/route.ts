import { generateKayStory, StoryGenerationError } from "../../../../lib/kay/generate";
import { parseCustomStoryRequest } from "../../../../lib/kay/validation";

export const maxDuration = 100;

const errorResponse = (code: string, status: number, message: string) => Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 6000) return errorResponse("INVALID_REQUEST", 400, "Please use a shorter description.");
    input = parseCustomStoryRequest(JSON.parse(raw));
  } catch {
    return errorResponse("INVALID_REQUEST", 400, "Add a short lesson (3–600 characters), an age from 3–8, and different familiar and learning languages.");
  }
  try {
    const story = await generateKayStory(input, { signal: request.signal });
    return Response.json({ story }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof StoryGenerationError ? error.code : "UNAVAILABLE";
    const messages = input.homeLanguage === "ko" ? {
      NOT_CONFIGURED: "새 이야기 만들기가 아직 연결되지 않았어요. 준비된 다섯 이야기는 바로 볼 수 있어요.",
      TIMEOUT: "이야기를 만드는 데 시간이 너무 오래 걸렸어요. 주제를 조금 짧게 적어 다시 시도하거나 저장된 이야기를 골라 주세요.",
      INVALID_STORY: "새 이야기가 끝까지 완성되지 않았어요. 다시 시도해 주세요. 저장된 이야기들은 그대로 있어요.",
      UNAVAILABLE: "지금은 새 이야기를 만들 수 없어요. 잠시 후 다시 시도하거나 준비된 이야기를 골라 주세요.",
    } : {
      NOT_CONFIGURED: "Custom stories aren't connected yet. The five ready-to-play stories are still available.",
      TIMEOUT: "This story took too long to write. Please try again with a shorter lesson, or play a saved story.",
      INVALID_STORY: "The new story wasn't complete enough to play. Please try again. Your saved stories are safe.",
      UNAVAILABLE: "We couldn't create a new story right now. Please try again, or choose a ready-to-play story.",
    };
    return errorResponse(code, code === "NOT_CONFIGURED" ? 503 : code === "TIMEOUT" ? 504 : 502, messages[code]);
  }
}
