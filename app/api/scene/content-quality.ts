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

export function validateSceneContent(scene: SceneResponse, request: Pick<SceneRequest, "lesson" | "language" | "age">): SceneResponse {
  for (const text of [scene.narration, ...scene.lines.map(({ text }) => text), ...scene.choices,
    ...scene.newWords.flatMap(({ word, meaning }) => [word, meaning])]) assertReadableText(text);
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
