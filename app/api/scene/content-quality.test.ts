import assert from "node:assert/strict";
import test from "node:test";
import { lessonVocabulary } from "../../../lib/lesson-vocabulary";
import { assertReadableText, validateSceneContent } from "./content-quality";
import type { SceneResponse } from "./contract";

const request = { lesson: "kindness", language: "ko" as const, age: 5 };
const scene: SceneResponse = {
  narration: "사과가 길에 있어요. 앨리스가 도도에게 다가가요.",
  lines: [{ speaker: "hero", text: "도와줄까?", to: "duck", emotion: "happy" }],
  newWords: [{ word: "사과", meaning: "apple" }], choices: ["함께 들어 줘요", "먼저 놀러 가요"], lessonComplete: false,
  stage: { weather: "sunny", cast: [{ actor: "hero", at: "path" }, { actor: "duck", at: "path" }], props: [{ prop: "apple", at: "path" }], beats: [{ actor: "hero", action: "walk_to", target: "duck", cue: 0 }] },
};

test("live corrupt Korean regressions and mixed-script word corruption are rejected", () => {
  for (const text of ["데굴de굴", "사과가 국러갔어요.", "우산을 걸베주고 함께 걸어요.", "친abc구", "사과\ufffd", "ㄱㄱ 배워요"]) {
    assert.throws(() => assertReadableText(text));
  }
  for (const text of ["영어로는 puppy야.", "나는 슬퍼. 영어로는 I'm sad.", "사과가 굴러갔어요.", "친구에게 걸어가요."]) assert.doesNotThrow(() => assertReadableText(text));
});

test("every displayed text field is checked before a scene is returned", () => {
  for (const corrupt of [
    { ...scene, narration: "사과가 국러갔어요." },
    { ...scene, lines: [{ speaker: "hero" as const, text: "우산을 걸베주고 가자." }] },
    { ...scene, choices: ["친de구를 도와요", "놀아요"] },
    { ...scene, newWords: [{ word: "데굴de굴", meaning: "rolling" }] },
  ]) assert.throws(() => validateSceneContent(corrupt, request));
});

test("learning targets use reviewed phrases and canonical translations without fixing narrative typos", () => {
  const canonical = validateSceneContent({ ...scene, newWords: [{ word: "도와줄까", meaning: "a wrong translation" }] }, request);
  assert.deepEqual(canonical.newWords, [{ word: "도와줄까?", meaning: "Can I help?" }]);
  assert.throws(() => validateSceneContent({ ...scene, newWords: [{ word: "일으켜 주다", meaning: "help up" }] }, request), /Unreviewed learning/);
  assert.throws(() => validateSceneContent({ ...scene, newWords: [{ word: "apple", meaning: "사과" }] }, request), /Unreviewed learning/);
  assert.throws(() => validateSceneContent({ ...scene, newWords: [{ word: "도와줄까", meaning: "Can I help?" }, { word: "도와줄까?", meaning: "Can I help?" }] }, request), /Duplicate learning/);
});

test("learning bank respects age while custom stories retain useful words", () => {
  assert.ok(lessonVocabulary("patience", 6, "ko").some(({ word }) => word === "기다리는 동안 다른 걸 할게"));
  assert.ok(!lessonVocabulary("patience", 3, "ko").some(({ word }) => word === "기다리는 동안 다른 걸 할게"));
  assert.ok(lessonVocabulary("custom topic", 3, "en").some(({ word }) => word === "friend"));
  assert.throws(() => validateSceneContent({ ...scene, newWords: [{ word: "사과", meaning: "apple" }, { word: "친구", meaning: "friend" }] }, { ...request, age: 3 }), /one expression/);
});

test("visible falls and moving props are rejected while supported actions remain valid", () => {
  for (const narration of ["도도가 발을 헛디뎌 넘어졌어요.", "사과가 데굴데굴 굴러갔어요.", "Dodo tripped on the path.", "The apples rolled across the path.", "The balloon floats toward the tree."]) {
    assert.throws(() => validateSceneContent({ ...scene, narration }, request), /Unsupported visible action/);
  }
  assert.doesNotThrow(() => validateSceneContent(scene, request));
  assert.doesNotThrow(() => validateSceneContent({ ...scene, narration: "앨리스가 데굴데굴 굴러요." }, request));
});
