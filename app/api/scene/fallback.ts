import { MAX_SCENES } from "./contract";
import type { SceneRequest, SceneResponse } from "./contract";

/** Integration stub. Replace this function with the story engine later. */
export function createStubScene(request: SceneRequest): SceneResponse {
  const learningKorean = request.language === "ko";
  const narrateInKorean = !learningKorean;
  // Three scenes keep frontend integration quick; the server also caps at eight.
  const complete = request.history.length >= 2 || request.history.length >= MAX_SCENES - 1;
  if (complete) {
    return {
      narration: narrateInKorean
        ? "미나와 강아지가 함께 집에 도착했어요. 서로 도우니 마음이 따뜻해졌어요."
        : "Mina and the puppy arrive home together. Helping each other feels good.",
      newWords: [],
      choices: [],
      lessonComplete: true,
    };
  }
  const first = request.history.length === 0;
  const word = learningKorean
    ? { word: first ? "강아지" : "친구", meaning: first ? "puppy" : "friend" }
    : { word: first ? "puppy" : "friend", meaning: first ? "강아지" : "친구" };
  return {
    narration: narrateInKorean
      ? first
        ? "미나가 빗속에 있는 강아지를 만났어요. 어떻게 도와줄까요?"
        : "미나와 강아지가 비를 피했어요. 새 친구와 무엇을 할까요?"
      : first
        ? "Mina sees a puppy in the rain. How can she help?"
        : "Mina and the puppy are out of the rain. What can she do with her new friend?",
    newWords: request.wordsLearned.includes(word.word) ? [] : [word],
    choices: narrateInKorean
      ? first ? ["우산을 함께 써요", "어른에게 도움을 청해요"] : ["함께 걸어요", "친구에게 웃어 줘요"]
      : first ? ["Share your umbrella", "Ask a grown-up for help"] : ["Walk together", "Smile at your friend"],
    lessonComplete: false,
  };
}

/** Close any generated story without inventing characters or repeating a stale scene. */
export function createClosingScene(language: SceneRequest["language"]): SceneResponse {
  return {
    narration: language === "en"
      ? "오늘의 이야기는 여기까지예요. 함께 생각하고 배워 줘서 고마워요."
      : "That is the end of our story today. Thank you for thinking and learning together.",
    newWords: [], choices: [], lessonComplete: true,
  };
}
