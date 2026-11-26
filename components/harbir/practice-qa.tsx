"use client";

import type { SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import Tales from "@/components/tales/tales";

/** Keep the real player and voice service; replace only generated story content. */
async function loadPracticeScene(request: SceneRequest): Promise<SceneResponse> {
  const korean = request.language === "ko";
  return {
    narration: korean ? "친구가 왔어요." : "Here comes a friend.",
    lines: [{
      speaker: "hero", to: "friend", emotion: "happy",
      text: korean ? "음⋯ 도와줄까?" : "Hmm… Can I help?",
    }],
    newWords: [{
      word: korean ? "도와줄까?" : "Can I help?",
      meaning: korean ? "Can I help?" : "도와줄까?",
    }],
    choices: request.history.length ? [] : korean ? ["함께 도와줘요", "먼저 물어봐요"] : ["Help together", "Ask first"],
    lessonComplete: request.history.length > 0,
    stage: {
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }],
      props: [],
      beats: [{ actor: "hero", action: "wave", target: "friend", cue: 1 }],
    },
  };
}

const noWarmup = () => {};

export default function PracticeQa() {
  return <>
    <aside role="note" style={{
      position: "fixed", top: 5, left: "50%", transform: "translateX(-50%)", zIndex: 20,
      padding: "3px 9px", borderRadius: 8, background: "#fffdf1e6", color: "#3f5545",
      fontSize: 10, pointerEvents: "none", whiteSpace: "nowrap",
    }}>Local practice QA · real TTS · no story API</aside>
    <Tales loadScene={loadPracticeScene} warmScene={noWarmup} />
  </>;
}
