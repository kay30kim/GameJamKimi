import type { SceneRequest, SceneResponse, Stage } from "./contract";
import { SPOTS } from "../../../lib/world";
import type { Spot } from "../../../lib/world";
import { defaultStage } from "./stage";
import { createTopicStubScene } from "./topic-fallback";

function nearestSpot(x: number, z: number): Spot {
  return (Object.keys(SPOTS) as Spot[]).reduce((closest, spot) => {
    const distance = ([sx, sz]: readonly number[]) => Math.hypot(x - sx, z - sz);
    return distance(SPOTS[spot].position) < distance(SPOTS[closest].position) ? spot : closest;
  }, "path");
}

/** These locations only seed new entities; playback restores existing ones from the snapshot. */
function keepWorld(request: SceneRequest, stage: Stage): Stage {
  const world = request.continuation?.world;
  if (!world) return stage;
  const cast = new Map(stage.cast.map((entry) => [entry.actor, entry]));
  const props = new Map(stage.props.map((entry) => [entry.prop, entry]));
  for (const { actor, x, z } of world.actors) cast.set(actor, { actor, at: nearestSpot(x, z) });
  for (const { prop, x, z, holder } of world.props) props.set(prop, { prop, at: holder ?? nearestSpot(x, z) });
  return { ...stage, weather: world.weather, cast: [...cast.values()], props: [...props.values()] };
}

/** Three-scene offline story: both choices change the next dialogue and physical actions. */
export function createStubScene(request: SceneRequest): SceneResponse {
  const topic = createTopicStubScene(request);
  if (topic) return { ...topic, stage: keepWorld(request, topic.stage) };
  const korean = request.language === "ko";
  const say = (ko: string, en: string) => korean ? ko : en;
  const lastChoice = request.history.at(-1)?.choice;
  const stage = (value: Stage) => keepWorld(request, value);
  if (request.history.length >= 2) {
    const smile = lastChoice === "친구에게 웃어 줘요" || lastChoice === "Smile at your friend";
    return {
      narration: smile
        ? say("앨리스가 강아지에게 환하게 웃어 줘요. 두 친구의 마음이 따뜻해져요.", "Alice smiles at the puppy. Both friends feel warm inside.")
        : say("앨리스와 강아지가 함께 집으로 걸어요. 서로 도우니 마음이 따뜻해요.", "Alice and the puppy walk home together. Helping each other feels good."),
      lines: smile ? [
        { speaker: "hero", text: say("친구가 되어 참 좋아!", "I'm glad we're friends!"), to: "puppy", emotion: "happy" },
        { speaker: "puppy", text: say("나도! 함께 있어서 좋아.", "Me too! I like being together."), to: "hero", emotion: "happy" },
      ] : [
        { speaker: "grownup", text: say("어서 오렴! 함께 와서 참 좋구나.", "Welcome home! I'm glad we're together."), to: "hero", emotion: "happy" },
        { speaker: "hero", text: say("우리가 서로 도왔어요!", "We helped each other!"), to: "grownup", emotion: "excited" },
      ],
      newWords: [],
      choices: [],
      lessonComplete: true,
      stage: stage({
        weather: "rainy",
        cast: [{ actor: "hero", at: "tree" }, { actor: "puppy", at: "tree" }, ...(!smile ? [{ actor: "grownup" as const, at: "home" as const }] : [])],
        props: [{ prop: "umbrella", at: "puppy" }],
        beats: smile ? [
          { actor: "hero", action: "emote", emotion: "happy", cue: 1 },
          { actor: "puppy", action: "emote", emotion: "happy", cue: 2 },
        ] : [
          { actor: "hero", action: "walk_to", target: "home", cue: 0 },
          { actor: "puppy", action: "walk_to", target: "home", cue: 0 },
          { actor: "grownup", action: "walk_to", target: "home", cue: 0 },
          { actor: "grownup", action: "wave", target: "hero", cue: 1 },
        ],
      }),
    };
  }
  const first = request.history.length === 0;
  const word = korean
    ? { word: first ? "강아지" : "친구", meaning: first ? "puppy" : "friend" }
    : { word: first ? "puppy" : "friend", meaning: first ? "강아지" : "친구" };
  const base = {
    newWords: request.wordsLearned.includes(word.word) ? [] : [word],
    choices: first
      ? [say("우산을 함께 써요", "Share your umbrella"), say("어른에게 도움을 청해요", "Ask a grown-up for help")]
      : [say("함께 걸어요", "Walk together"), say("친구에게 웃어 줘요", "Smile at your friend")],
    lessonComplete: false,
  };
  if (first) return {
    ...base,
    narration: say("앨리스가 빗속에 있는 강아지를 만났어요. 어떻게 도와줄까요?", "Alice sees a puppy in the rain. How can Alice help?"),
    lines: [
      { speaker: "puppy", text: say("비가 와서 너무 추워…", "The rain is so cold…"), emotion: "sad" },
      { speaker: "hero", text: say("강아지야, 도와줄게. 강아지는 영어로 puppy야.", "I'll help you, puppy. In Korean, 강아지."), to: "puppy", emotion: "curious" },
    ],
    stage: stage({
      weather: "rainy",
      cast: [{ actor: "hero", at: "path" }, { actor: "puppy", at: "tree" }],
      props: [{ prop: "umbrella", at: "hero" }],
      beats: [
        { actor: "hero", action: "walk_to", target: "puppy", cue: 0 },
        { actor: "puppy", action: "emote", emotion: "sad", cue: 1 },
        { actor: "hero", action: "emote", emotion: "curious", cue: 2 },
      ],
    }),
  };

  const askGrownup = lastChoice === "어른에게 도움을 청해요" || lastChoice === "Ask a grown-up for help";
  const alreadyShared = request.continuation?.world.props.some(({ prop, holder }) => prop === "umbrella" && holder === "puppy");
  if (askGrownup) return {
    ...base,
    narration: say("앨리스가 부엉이 할머니에게 도움을 청해요.", "Alice asks Grandma Owl for help."),
    lines: [
      { speaker: "hero", text: say("할머니, 강아지가 비를 맞고 있어요.", "Grandma, the puppy is getting wet."), to: "grownup", emotion: "curious" },
      { speaker: "grownup", text: alreadyShared ? say("잘 도왔구나. 나도 함께 있을게.", "You helped well. I'll stay with you.") : say("함께 도와주자. 우산을 나눠 쓰렴.", "Let's help together. Share the umbrella."), to: "hero", emotion: "happy" },
      { speaker: "hero", text: alreadyShared ? say("우리 함께 있으니 좋다!", "It's nice being together!") : say("여기, 내 우산 받아!", "Here, take my umbrella!"), to: "puppy", emotion: "happy" },
      { speaker: "puppy", text: say("고마워, 친구! 친구는 영어로 friend야.", "Thank you, friend! In Korean, 친구."), to: "hero", emotion: "happy" },
    ],
    stage: stage({
      weather: "rainy",
      cast: [{ actor: "hero", at: "tree" }, { actor: "puppy", at: "tree" }, { actor: "grownup", at: "home" }],
      props: [{ prop: "umbrella", at: "hero" }],
      beats: [
        { actor: "grownup", action: "walk_to", target: "puppy", cue: 1 },
        { actor: "grownup", action: "help", target: "puppy", cue: 2 },
        ...(!alreadyShared ? [{ actor: "hero" as const, action: "give" as const, prop: "umbrella" as const, target: "puppy" as const, cue: 3 }] : []),
        { actor: "puppy", action: "emote", emotion: "happy", cue: 4 },
      ],
    }),
  };
  return {
    ...base,
    narration: alreadyShared
      ? say("강아지가 앨리스의 우산 아래에서 웃어요.", "The puppy smiles under Alice's umbrella.")
      : say("앨리스가 강아지 곁에서 우산을 들어요.", "Alice lifts the umbrella beside the puppy."),
    lines: [
      { speaker: "hero", text: alreadyShared ? say("함께 있어서 좋지?", "It's nice being together, isn't it?") : say("내 우산을 같이 쓰자!", "Let's share my umbrella!"), to: "puppy", emotion: "happy" },
      { speaker: "puppy", text: say("고마워, 친구! 친구는 영어로 friend야.", "Thank you, friend! In Korean, 친구."), to: "hero", emotion: "happy" },
    ],
    stage: stage({
      weather: "rainy",
      cast: [{ actor: "hero", at: "tree" }, { actor: "puppy", at: "tree" }],
      props: [{ prop: "umbrella", at: "hero" }],
      beats: [
        ...(alreadyShared ? [] : [{ actor: "hero" as const, action: "give" as const, prop: "umbrella" as const, target: "puppy" as const, cue: 1 }]),
        { actor: "puppy", action: "emote", emotion: "happy", cue: 2 },
      ],
    }),
  };
}

/** Close any generated story without inventing characters or repeating a stale scene. */
export function createClosingScene(language: SceneRequest["language"]): SceneResponse {
  return {
    narration: language === "ko"
      ? "오늘의 이야기는 여기까지예요. 함께 생각하고 배워 줘서 고마워요."
      : "That is the end of our story today. Thank you for thinking and learning together.",
    lines: [], newWords: [], choices: [], lessonComplete: true,
    stage: defaultStage([{ actor: "hero", action: "wave" }, { actor: "hero", action: "celebrate" }]),
  };
}
