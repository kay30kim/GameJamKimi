import { expressionKey, lessonVocabulary } from "../../../lib/lesson-vocabulary";
import type { SceneRequest, SceneResponse } from "./contract";

/** Reject corruption; never silently teach a guessed spelling correction. */
export function assertReadableText(text: string): void {
  const normalized = text.normalize("NFC");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(normalized) ||
      /[가-힣][A-Za-z]+[가-힣]/u.test(normalized) || /[ㄱ-ㅎㅏ-ㅣ]{2,}/u.test(normalized)) {
    throw new Error("Corrupt text: use complete, correctly spaced words");
  }
  // Regressions observed in live stories. These reject the entire generation;
  // they supplement script checks and reviewed vocabulary, not a spellchecker.
  if (/국러(?:가|갔|갈|굴)|걸베(?:주|줘|줄|준)/u.test(normalized)) {
    throw new Error("Invalid Korean spelling: proofread and regenerate the sentence");
  }
}

/** The bench target is grass in front of furniture; sit never raises an actor onto a seat. */
function claimsFurnitureSeat(text: string): boolean {
  const korean = /벤치(?:\s*위)?(?:에서|에)\s*(?:(?:나란히|함께|같이|편하게|편안하게|편안히|조용히|잠깐|가만히|둘이서|둘이|모두|(?:앨리스|도도|모모|보리|나비|할머니)(?:와|과|랑|하고))\s*){0,5}앉/u;
  const english = /\b(?:sit|sits|sat|sitting|seated)\s+(?:(?:down|together|quietly|comfortably|side by side)\s+){0,3}(?:on|onto)\s+(?:(?:the|a|that|this|wooden)\s+){0,2}bench\b|\btake(?:s)?\s+a\s+seat\s+on\s+(?:(?:the|a)\s+)?bench\b/iu;
  return korean.test(text) || english.test(text);
}

/** A held prop can be handed over, but the current engine has no put-down action. */
function claimsPropPutDown(text: string): boolean {
  const korean = /(?:사과|공|책|꽃|연|풍선|쿠키|우산|물뿌리개)(?:을|를)\s*(?:(?:(?:길|풀밭|잔디|바닥|땅|벤치)(?:\s*위)?에\s*)?(?:(?:살짝|조심히|잠깐)\s*)?(?:내려놓(?:아|고|자|기|을)|내려놔)|(?:길|풀밭|잔디|바닥|땅|벤치)(?:\s*위)?에\s*(?:(?:살짝|조심히|잠깐)\s*)?(?:두고|놓고))/u;
  const english = /\b(?:put|puts|putting|set|sets|setting)\s+(?:(?:the|an?|my|her|his)\s+)?(?:apple|ball|book|flower|kite|balloon|cookies|umbrella|watering can)\s+(?:down\b|on\s+(?:(?:the|a)\s+)?(?:path|ground|grass|bench)\b)|\b(?:put|puts|putting|set|sets|setting)\s+down\s+(?:(?:the|an?|my|her|his)\s+)?(?:apple|ball|book|flower|kite|balloon|cookies|umbrella|watering can)\b/iu;
  return korean.test(text) || english.test(text);
}

export function validateSceneContent(scene: SceneResponse, request: Pick<SceneRequest, "lesson" | "language" | "age">): SceneResponse {
  for (const text of [scene.narration, ...scene.lines.map(({ text }) => text), ...scene.choices,
    ...scene.newWords.flatMap(({ word, meaning }) => [word, meaning])]) assertReadableText(text);
  const storyText = [scene.narration, ...scene.lines.map(({ text }) => text), ...scene.choices];
  if (storyText.some(claimsFurnitureSeat)) {
    throw new Error("Unsupported visible action: bench is grass in front of the bench, not its seat. Say '벤치 앞 풀밭에 앉아 쉬어요' or 'sit on the grass near the bench' in narration, dialogue, and choices");
  }
  if (storyText.some(claimsPropPutDown)) {
    throw new Error("Unsupported visible action: held props cannot be put down. Keep carrying the prop or hand it to a nearby friend with give; make narration, dialogue, and choices match");
  }
  // These are concrete claims about the on-screen setup, not a general ban on
  // discussing accidents. The engine has no fall or moving-prop animation.
  if (/넘어졌|쓰러졌|발을\s*헛디뎌|\b(?:tripped|fell down|falls down|tumbled down)\b/iu.test(scene.narration) ||
      /사과[^.!?。！？]{0,35}(?:데굴|굴러(?:가|갔)|흩어)|풍선[^.!?。！？]{0,35}(?:날아가|날아갔|둥둥)/u.test(scene.narration) ||
      /\bapples?\b[^.!?]{0,45}\b(?:roll(?:s|ed|ing)?|scatter(?:s|ed|ing)?)\b|\bballoon\b[^.!?]{0,45}\b(?:float(?:s|ed|ing)?|flies|flew)\b/iu.test(scene.narration)) {
    throw new Error("Unsupported visible action: start from a stationary prop and use supported character actions");
  }
  const vocabulary = new Map(lessonVocabulary(request.lesson, request.age, request.language).map((entry) => [expressionKey(entry.word), entry]));
  const newWords = scene.newWords.map(({ word }) => {
    const reviewed = vocabulary.get(expressionKey(word));
    if (!reviewed) throw new Error("Unreviewed learning word: choose an expression from the supplied vocabulary");
    return { ...reviewed };
  });
  if (new Set(newWords.map(({ word }) => expressionKey(word))).size !== newWords.length) {
    throw new Error("Duplicate learning expression: choose distinct reviewed expressions");
  }
  if (request.age === 3 && newWords.length > 1) throw new Error("Age three practices one expression per scene");
  return { ...scene, newWords };
}
