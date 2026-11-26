"use client";

import Tales from "@/components/tales/tales";
import type { SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import type { speak } from "@/lib/speech";
import type { ActorId, Stage } from "@/lib/world";

const SHARE = "모모에게 사과를 나눠 줘요";
const WALK = "사과를 들고 나무로 가요";

/** These wrong starting positions/owners must lose to the preceding world's snapshot. */
function conflictingStage(beats: Stage["beats"]): Stage {
  return {
    weather: "sunny",
    cast: [
      { actor: "hero", at: "home" },
      { actor: "kitten", at: "pond" },
      { actor: "friend", at: "garden" },
    ],
    props: [{ prop: "apple", at: "kitten" }],
    beats,
  };
}

function nextChoices(shared: boolean): [string, string] {
  const name = shared ? "모모" : "앨리스";
  return [`${name}가 나비에게 인사해요`, `${name}가 사과를 들고 춤춰요`];
}

/** Pure fixtures: history selects the branch; the actual Tales flow supplies continuity. */
export async function loadContinuityScene(request: SceneRequest): Promise<SceneResponse> {
  if (request.history.length === 0) {
    return {
      narration: "나비가 길 위의 사과를 집어 들어요.",
      lines: [
        { speaker: "kitten", to: "hero", text: "앨리스, 이 사과를 받아!", emotion: "happy" },
        { speaker: "hero", to: "kitten", text: "고마워! 모모와 나눠 먹을까?", emotion: "curious" },
      ],
      newWords: [],
      choices: [SHARE, WALK],
      lessonComplete: false,
      stage: {
        weather: "sunny",
        cast: [
          { actor: "hero", at: "path" },
          { actor: "kitten", at: "path" },
          { actor: "friend", at: "path" },
        ],
        props: [{ prop: "apple", at: "path" }],
        beats: [
          { actor: "kitten", action: "pick_up", prop: "apple", cue: 0 },
          { actor: "kitten", action: "give", prop: "apple", target: "hero", cue: 1 },
          { actor: "hero", action: "emote", emotion: "happy", cue: 2 },
        ],
      },
    };
  }

  const firstChoice = request.history[0].choice;
  if (firstChoice !== SHARE && firstChoice !== WALK) throw new Error("Continuity QA received an unknown first choice.");
  const shared = firstChoice === SHARE;
  const choices = nextChoices(shared);

  if (request.history.length === 1) {
    return shared ? {
      narration: "앨리스가 모모에게 사과를 건네요.",
      lines: [{ speaker: "friend", to: "hero", text: "고마워! 사과를 받으니 기뻐.", emotion: "happy" }],
      newWords: [],
      choices,
      lessonComplete: false,
      stage: conflictingStage([
        { actor: "hero", action: "give", prop: "apple", target: "friend", cue: 0 },
        { actor: "friend", action: "emote", emotion: "happy", cue: 1 },
      ]),
    } : {
      narration: "앨리스가 사과를 들고 큰 나무로 걸어가요.",
      lines: [{ speaker: "hero", text: "나무 그늘에서 잠깐 쉴게.", emotion: "happy" }],
      newWords: [],
      choices,
      lessonComplete: false,
      stage: conflictingStage([
        { actor: "hero", action: "walk_to", target: "tree", cue: 0 },
        { actor: "hero", action: "look_around", cue: 1 },
      ]),
    };
  }

  const lastChoice = request.history[request.history.length - 1].choice;
  if (lastChoice !== choices[0] && lastChoice !== choices[1]) throw new Error("Continuity QA received an unknown ending choice.");
  const greet = lastChoice === choices[0];
  const carrier: ActorId = shared ? "friend" : "hero";
  const name = shared ? "모모" : "앨리스";
  return {
    narration: greet
      ? `사과를 든 ${name}가 나비에게 다가가 인사해요.`
      : `${name}가 사과를 든 채 기쁘게 춤춰요.`,
    lines: [{
      speaker: carrier,
      ...(greet ? { to: "kitten" as const } : {}),
      text: greet ? "나비야, 사과 고마워!" : "친구들과 함께라서 신나!",
      emotion: "happy",
    }],
    newWords: [],
    choices: [],
    lessonComplete: true,
    stage: conflictingStage(greet ? [
      { actor: carrier, action: "walk_to", target: "kitten", cue: 0 },
      { actor: carrier, action: "wave", target: "kitten", cue: 1 },
    ] : [
      { actor: carrier, action: "dance", cue: 0 },
      { actor: carrier, action: "emote", emotion: "happy", cue: 1 },
    ]),
  };
}

const noWarmup = (): void => {};
const noAudio: typeof speak = async () => ({ started: false, cancelled: false });

export default function ContinuityQa() {
  return <>
    <Tales loadScene={loadContinuityScene} warmScene={noWarmup} speakLine={noAudio} />
    <aside role="note" aria-label="Local continuity QA" style={{
      position: "fixed", bottom: 2, left: "50%", transform: "translateX(-50%)", zIndex: 40,
      margin: 0, padding: "2px 8px", borderRadius: 6, background: "#fffcf3ed", color: "#3d5145",
      fontSize: 10, lineHeight: 1.4, whiteSpace: "nowrap", pointerEvents: "none",
    }}>Local continuity QA · scripted story, no audio/API</aside>
  </>;
}
