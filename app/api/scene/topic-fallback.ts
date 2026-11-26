import type { Beat, SceneRequest, SceneResponse, Stage } from "./contract";

/** The new topics also work without a model key, using only supported world actions. */
export function createTopicStubScene(request: SceneRequest): SceneResponse | undefined {
  if (request.lesson !== "body_safety" && request.lesson !== "table_manners") return undefined;
  const ko = request.language === "ko";
  const say = (korean: string, english: string) => ko ? korean : english;
  const step = Math.min(request.history.length, 2);
  const choice = request.history.at(-1)?.choice;
  const words = (korean: string, english: string) => {
    const word = say(korean, english);
    return request.wordsLearned.includes(word) ? [] : [{ word, meaning: ko ? english : korean }];
  };

  if (request.lesson === "body_safety") {
    const ask = choice === "할머니에게 물어요" || choice === "Ask Grandma Owl";
    const stay = choice === "할머니 곁으로 가요" || choice === "Go to Grandma Owl";
    const stage = (beats: Beat[], grandma = false): Stage => ({
      weather: "sunny",
      cast: [{ actor: "hero", at: "path" }, { actor: "puppy", at: "bench" }, ...(grandma ? [{ actor: "grownup" as const, at: "bench" as const }] : [])],
      props: [], beats,
    });
    if (step === 0) return {
      narration: say("보리가 앨리스에게 반갑게 인사해요.", "Bori greets Alice on the path."),
      lines: [
        { speaker: "puppy", to: "hero", text: say("안녕! 안아도 괜찮아?", "Hello! Would you like a hug?"), emotion: "happy" },
        { speaker: "hero", to: "puppy", text: say("내 몸은 내가 정해. 영어로는 my body야.", "It's my body. In Korean, 내 몸."), emotion: "curious" },
      ],
      newWords: words("내 몸", "my body"),
      choices: [say("손을 흔들어요", "Wave hello"), say("할머니에게 물어요", "Ask Grandma Owl")],
      lessonComplete: false,
      stage: stage([
        { actor: "puppy", action: "wave", target: "hero", cue: 1 },
        { actor: "hero", action: "emote", emotion: "curious", cue: 2 },
      ]),
    };
    if (step === 1) return {
      narration: ask
        ? say("앨리스가 할머니에게 마음을 이야기해요.", "Alice asks Grandma Owl about her feelings.")
        : say("앨리스가 안는 대신 손을 흔들어요.", "Alice waves instead of hugging."),
      lines: ask ? [
        { speaker: "hero", to: "grownup", text: say("안고 싶지 않으면 뭐라고 말해요?", "What can I say instead of hugging?"), emotion: "curious" },
        { speaker: "grownup", to: "hero", text: say("싫어요, 해도 돼. 영어로는 No, thank you.", "You can say, No, thank you. Korean: 싫어요."), emotion: "happy" },
        { speaker: "puppy", to: "hero", text: say("괜찮아! 네가 편한 대로 하자.", "That's okay! You can choose."), emotion: "happy" },
      ] : [
        { speaker: "hero", to: "puppy", text: say("안는 건 싫어요. 영어로는 No, thank you.", "No, thank you. In Korean, 싫어요."), emotion: "happy" },
        { speaker: "puppy", to: "hero", text: say("좋아! 손을 흔들며 인사하자.", "Okay! We can wave hello."), emotion: "happy" },
      ],
      newWords: words("싫어요", "No, thank you"),
      choices: [say("잠깐 쉬어요", "Rest a little"), say("할머니 곁으로 가요", "Go to Grandma Owl")],
      lessonComplete: false,
      stage: stage(ask ? [
        { actor: "grownup", action: "walk_to", target: "hero", cue: 0 },
        { actor: "hero", action: "emote", emotion: "curious", cue: 1 },
        { actor: "grownup", action: "emote", emotion: "happy", cue: 2 },
        { actor: "puppy", action: "wave", target: "hero", cue: 3 },
      ] : [
        { actor: "hero", action: "wave", target: "puppy", cue: 1 },
        { actor: "puppy", action: "wave", target: "hero", cue: 2 },
      ], ask),
    };
    return {
      narration: stay
        ? say("앨리스가 할머니 곁으로 가요.", "Alice walks over to Grandma Owl.")
        : say("앨리스가 편하게 앉아 잠깐 쉬어요.", "Alice sits down for a comfortable rest."),
      lines: [
        { speaker: "hero", text: say("내 몸은 내가 정할 수 있어!", "I can choose what feels comfortable!"), emotion: "happy" },
        stay
          ? { speaker: "grownup", to: "hero", text: say("언제든 내게 도움을 청해도 괜찮아.", "You can always ask me for help."), emotion: "happy" }
          : { speaker: "puppy", to: "hero", text: say("네가 편한 대로 하자!", "Let's do what feels comfortable for you!"), emotion: "happy" },
      ],
      newWords: [], choices: [], lessonComplete: true,
      stage: stage([
        stay ? { actor: "hero", action: "walk_to", target: "grownup", cue: 0 } : { actor: "hero", action: "sit", cue: 0 },
        { actor: stay ? "grownup" : "puppy", action: "emote", emotion: "happy", cue: 2 },
      ], stay),
    };
  }

  const wait = choice === "차례를 기다려요" || choice === "Wait your turn";
  const pass = choice === "모모에게 사과를 건네요" || choice === "Pass Momo the apple";
  const actualApple = request.continuation?.world.props.find(({ prop }) => prop === "apple");
  const holder = actualApple ? actualApple.holder : step === 2 ? "hero" : "friend";
  const stage = (beats: Beat[]): Stage => ({
    weather: "sunny",
    cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "bench" }],
    props: [{ prop: "apple", at: holder ?? "bench" }], beats,
  });
  if (step === 0) return {
    narration: say("앨리스와 모모가 소풍을 준비해요.", "Alice and Momo settle for a picnic."),
    lines: [
      { speaker: "friend", to: "hero", text: say("사과가 있어. 영어로는 apple이야.", "Here's an apple. In Korean, 사과."), emotion: "happy" },
      { speaker: "hero", to: "friend", text: say("나도 사과를 먹고 싶어.", "I'd like an apple too."), emotion: "curious" },
    ],
    newWords: words("사과", "apple"),
    choices: [say("사과를 부탁해요", "Ask for an apple"), say("차례를 기다려요", "Wait your turn")],
    lessonComplete: false,
    stage: stage([
      { actor: "hero", action: "walk_to", target: "friend", cue: 0 },
      { actor: "friend", action: "emote", emotion: "happy", cue: 1 },
      { actor: "hero", action: "emote", emotion: "curious", cue: 2 },
    ]),
  };
  if (step === 1) return {
    narration: wait
      ? say("앨리스가 차분히 차례를 기다려요.", "Alice waits calmly for her turn.")
      : say("앨리스가 모모에게 사과를 부탁해요.", "Alice asks Momo for the apple."),
    lines: [
      { speaker: "hero", to: "friend", text: wait ? say("앉아서 내 차례를 기다릴게.", "I'll sit and wait for my turn.") : say("모모야, 사과를 줄래?", "May I have the apple, please?"), emotion: "happy" },
      { speaker: "friend", to: "hero", text: holder === "friend" ? say("여기, 사과 받아!", "Here, take the apple!") : say("먹고 싶을 때 먹어도 돼.", "You can eat when you feel hungry."), emotion: "happy" },
      { speaker: "hero", to: "friend", text: say("고마워! 영어로는 thank you야.", "Thank you! In Korean, 고마워."), emotion: "happy" },
    ],
    newWords: words("고마워", "thank you"),
    choices: [say("모모에게 사과를 건네요", "Pass Momo the apple"), say("사과는 나중에 먹어요", "Save it for later")],
    lessonComplete: false,
    stage: stage([
      wait ? { actor: "hero", action: "sit", cue: 1 } : { actor: "hero", action: "emote", emotion: "curious", cue: 1 },
      ...(holder === "friend" ? [{ actor: "friend" as const, action: "give" as const, prop: "apple" as const, target: "hero" as const, cue: 2 }] : []),
      { actor: "hero", action: "emote", emotion: "happy", cue: 3 },
    ]),
  };
  const giveBack = pass && holder === "hero";
  return {
    narration: pass
      ? say("앨리스가 모모와 다정하게 이야기해요.", "Alice speaks kindly with Momo.")
      : say("앨리스가 사과를 나중에 먹기로 해요.", "Alice saves the apple for later."),
    lines: [
      { speaker: "hero", to: "friend", text: giveBack ? say("모모야, 먹고 싶으면 받아.", "Here, Momo, if you'd like it.") : say("배고플 때 먹으면 되지!", "We can eat when we're hungry!"), emotion: "happy" },
      { speaker: "friend", to: "hero", text: giveBack ? say("고마워! 먹고 싶을 때 먹을게.", "Thank you! I'll eat when I'm hungry.") : say("좋아! 배부르면 나중에 먹어도 돼.", "Okay! We can save it for later."), emotion: "happy" },
    ],
    newWords: [], choices: [], lessonComplete: true,
    stage: stage([
      giveBack ? { actor: "hero", action: "give", prop: "apple", target: "friend", cue: 1 } : { actor: "hero", action: "sit", cue: 1 },
      { actor: "friend", action: "emote", emotion: "happy", cue: 2 },
    ]),
  };
}
