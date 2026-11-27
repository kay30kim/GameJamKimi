import type { SceneLanguage, SceneResponse } from "../app/api/scene/contract";

/** Audio and buttons must use the same order, including after a replay. */
export function orderedChoices(scene: Pick<SceneResponse, "narration" | "choices">): string[] {
  return scene.narration.length % 2 === 1 ? [...scene.choices].reverse() : [...scene.choices];
}

/** Recognition failures are device feedback, never a judgement of the child's speech. */
export function listeningFeedback(failure: unknown, language: SceneLanguage): string {
  const message = failure instanceof Error ? failure.message.toLowerCase() : "";
  const ko = language === "ko";
  if (/blocked|notallowed|permission|not-allowed/.test(message)) {
    return ko ? "마이크 사용이 허용되지 않았어요. 보호자에게 브라우저의 마이크 권한을 확인해 달라고 해 주세요. ‘말했어요!’로도 이어갈 수 있어요."
      : "Microphone access is blocked. Ask a grown-up to check the browser permission. You can also tap ‘I said it!’.";
  }
  if (/no microphone|notfound|audio-capture/.test(message)) {
    return ko ? "마이크를 찾지 못했어요. 연결을 확인하거나 소리 내어 말한 뒤 ‘말했어요!’를 눌러 주세요."
      : "We couldn't find a microphone. Check the connection, or say it aloud and tap ‘I said it!’.";
  }
  if (/connect|network/.test(message)) {
    return ko ? "목소리 확인 서비스에 연결하지 못했어요. 인터넷 연결을 확인하거나 ‘말했어요!’로 이어가 주세요."
      : "The voice checker couldn't connect. Check your internet connection, or tap ‘I said it!’.";
  }
  if (/language|recognition couldn't start/.test(message)) {
    return ko ? "이 브라우저에서 목소리 확인을 시작하지 못했어요. 소리 내어 말한 뒤 ‘말했어요!’를 눌러 주세요."
      : "This browser couldn't start the voice checker. Say it aloud, then tap ‘I said it!’.";
  }
  if (/stopped|aborted/.test(message)) {
    return ko ? "듣기를 잠시 멈췄어요. 준비되면 ‘말해 보기’를 눌러 주세요."
      : "Listening has stopped. Tap ‘Try saying it’ when you're ready.";
  }
  return ko ? "목소리가 잘 들리지 않았어요. 준비되면 마이크 가까이에서 다시 말해 주세요."
    : "We couldn't hear you clearly. When you're ready, try again near the microphone.";
}
