import assert from "node:assert/strict";
import test from "node:test";
import { createStubScene } from "./fallback";
import { parseScene } from "./validation";
import { isSceneRequest } from "./request-validation";
import { createSim, snapshotSim } from "../../../lib/harbir/sim";
import { MAX_LINES } from "./contract";
import type { SceneRequest, SceneResponse } from "./contract";

function play(scene: SceneResponse, request: SceneRequest, observe?: (sim: ReturnType<typeof createSim>) => void) {
  assert.deepEqual(parseScene(JSON.stringify(scene)), scene);
  const previous = request.continuation?.world;
  const sim = createSim(scene.stage, previous);
  for (const actor of previous?.actors ?? []) {
    assert.deepEqual([sim.actors[actor.actor]!.x, sim.actors[actor.actor]!.z], [actor.x, actor.z], "the next scene must start at the saved position");
  }
  for (let t = 0; t < 40 && !sim.done; t += 1 / 60) {
    sim.step(1 / 60);
    observe?.(sim);
  }
  assert.ok(sim.done, "offline story action sequence should finish");
  return sim;
}

function choose(request: SceneRequest, scene: SceneResponse, index: number, sim: ReturnType<typeof createSim>): SceneRequest {
  const next = {
    ...request,
    history: [...request.history, { narration: scene.narration, choice: scene.choices[index] }],
    wordsLearned: [...request.wordsLearned, ...scene.newWords.map(({ word }) => word)],
    continuation: { world: snapshotSim(sim, scene.stage.weather), previousLines: scene.lines, previousBeats: scene.stage.beats },
  };
  assert.ok(isSceneRequest(next), "played stub scene should produce a valid continuation request");
  return next;
}

for (const language of ["en", "ko"] as const) {
  test(`offline ${language} teaches brief vocabulary examples in the selected primary language`, () => {
    let request: SceneRequest = { lesson: "kindness", language, age: 3, history: [], wordsLearned: [] };
    for (let i = 0; i < 2; i++) {
      const scene = createStubScene(request);
      assert.match(scene.narration, language === "ko" ? /^[가-힣]/ : /^[A-Za-z]/);
      scene.choices.forEach((choice) => assert.match(choice, language === "ko" ? /^[가-힣]/ : /^[A-Za-z]/));
      assert.equal(scene.choices.length, 2, "three-year-olds still get their own choices");
      assert.equal(scene.newWords.length, 1);
      const [{ word, meaning }] = scene.newWords;
      assert.match(word, language === "ko" ? /^[가-힣]+$/ : /^[A-Za-z]+$/);
      assert.match(meaning, language === "ko" ? /^[A-Za-z]+$/ : /^[가-힣]+$/);
      assert.ok(scene.lines.some(({ text }) => text.includes(word) && text.includes(meaning)));
      assert.ok(scene.lines.length <= MAX_LINES);
      assert.doesNotMatch(scene.lines.map(({ text }) => text).join(" "), /따라 말|같이 말해|say it with me|repeat after/i);
      request = choose(request, scene, 0, play(scene, request));
    }
  });
  for (const firstChoice of [0, 1]) {
    for (const secondChoice of [0, 1]) {
      test(`offline ${language} choices ${firstChoice}/${secondChoice} carry actions and ownership through three scenes`, () => {
        let request: SceneRequest = { lesson: "kindness", language, age: 5, history: [], wordsLearned: [] };
        const first = createStubScene(request);
        const firstSim = play(first, request);
        assert.equal(firstSim.props.umbrella!.holder, "hero");
        request = choose(request, first, firstChoice, firstSim);

        const second = createStubScene(request);
        assert.equal(second.lessonComplete, false);
        assert.equal(second.choices.length, 2);
        const give = second.stage.beats.find((beat) => beat.action === "give");
        assert.ok(give, "sharing must be an action, not just a prop spawn location");
        assert.equal(second.lines[give.cue! - 1].speaker, "hero");
        assert.equal(second.stage.beats.some((beat) => beat.actor === "grownup" && beat.action === "help"), firstChoice === 1);
        const secondSim = play(second, request);
        assert.equal(secondSim.props.umbrella!.holder, "puppy");
        assert.equal(second.stage.weather, first.stage.weather);
        request = choose(request, second, secondChoice, secondSim);

        const ending = createStubScene(request);
        assert.equal(ending.lessonComplete, true);
        assert.deepEqual(ending.choices, []);
        assert.deepEqual(ending.newWords, []);
        assert.equal(ending.stage.weather, second.stage.weather);
        assert.equal(ending.stage.beats.some((beat) => beat.action === "walk_to"), secondChoice === 0);
        const endingSim = play(ending, request);
        assert.equal(endingSim.props.umbrella!.holder, "puppy");
        if (secondChoice === 0) {
          assert.ok(endingSim.actors.hero!.travelled > 1);
          assert.ok(endingSim.actors.puppy!.travelled > 1);
        } else {
          assert.equal(endingSim.actors.hero!.travelled, 0);
          assert.equal(endingSim.actors.puppy!.travelled, 0);
          assert.match(ending.narration, language === "ko" ? /웃어/ : /smiles/);
        }
      });
    }
  }
}

test("a completed umbrella handoff is not repeated when the actual snapshot already records it", () => {
  const firstRequest: SceneRequest = { lesson: "kindness", language: "en", age: 5, history: [], wordsLearned: [] };
  const first = createStubScene(firstRequest);
  const sim = play(first, firstRequest);
  sim.props.umbrella!.holder = "puppy";
  const continuation = choose(firstRequest, first, 0, sim);
  const next = createStubScene(continuation);
  assert.equal(next.stage.beats.some((beat) => beat.action === "give" || beat.action === "pick_up"), false);
  assert.equal(next.stage.props.find(({ prop }) => prop === "umbrella")!.at, "puppy");
  assert.equal(play(next, continuation).props.umbrella!.holder, "puppy");
});

for (const lesson of ["body_safety", "table_manners"]) {
  for (const language of ["en", "ko"] as const) {
    for (const firstChoice of [0, 1]) {
      for (const secondChoice of [0, 1]) {
        test(`offline ${lesson} ${language} choices ${firstChoice}/${secondChoice} teach the topic and preserve the world`, () => {
          let request: SceneRequest = { lesson, language, age: 3, history: [], wordsLearned: [] };
          const first = createStubScene(request);
          const firstSim = play(first, request);
          assert.equal(first.stage.props.some(({ prop }) => prop === "umbrella"), false);
          request = choose(request, first, firstChoice, firstSim);

          const second = createStubScene(request);
          let waitedSitting = false;
          const secondSim = play(second, request, (sim) => { waitedSitting ||= sim.actors.hero!.sitting; });
          if (lesson === "body_safety") {
            assert.equal(second.lines.some(({ speaker }) => speaker === "grownup"), firstChoice === 1);
            assert.equal(second.stage.beats.some(({ actor, action }) => actor === "hero" && action === "wave"), firstChoice === 0);
          } else {
            assert.equal(secondSim.props.apple!.holder, "hero", "the apple must actually reach Alice");
            assert.equal(waitedSitting, firstChoice === 1, "Alice sits while waiting, then stands to receive the apple");
            const give = second.stage.beats.find(({ action }) => action === "give");
            assert.ok(give);
            assert.equal(second.lines[give.cue! - 1].speaker, "friend");
          }
          request = choose(request, second, secondChoice, secondSim);

          const ending = createStubScene(request);
          const endingSim = play(ending, request);
          assert.equal(ending.lessonComplete, true);
          assert.deepEqual(ending.newWords, []);
          assert.deepEqual(ending.choices, []);
          if (lesson === "body_safety") {
            assert.equal(endingSim.actors.hero!.sitting, secondChoice === 0);
            assert.equal(ending.stage.beats.some(({ action }) => action === "walk_to"), secondChoice === 1);
            if (firstChoice === 1 || secondChoice === 1) assert.ok(endingSim.actors.grownup, "a previously introduced helper remains present");
          } else {
            assert.equal(endingSim.props.apple!.holder, secondChoice === 0 ? "friend" : "hero");
            assert.equal(ending.stage.beats.some(({ action }) => action === "give"), secondChoice === 0);
          }
          for (const scene of [first, second, ending]) {
            assert.match(scene.narration, language === "ko" ? /^[가-힣]/ : /^[A-Za-z]/);
            for (const choice of scene.choices) assert.match(choice, language === "ko" ? /^[가-힣]/ : /^[A-Za-z]/);
            assert.ok(scene.lines.length <= MAX_LINES);
            assert.ok(scene.stage.beats.every((beat) => beat.cue !== undefined && beat.cue <= scene.lines.length));
            assert.equal(scene.stage.beats.some(({ action }) => action === "hug"), false);
            assert.equal(scene.lines.some(({ emotion }) => emotion === "sad"), false, "safe choices should not carry a guilt penalty");
            assert.doesNotMatch(scene.lines.map(({ text }) => text).join(" "), /따라 말|같이 말해|say it with me|repeat after/i);
          }
          for (const scene of [first, second]) {
            assert.equal(scene.lessonComplete, false);
            assert.equal(scene.choices.length, 2);
            assert.equal(scene.newWords.length, 1);
            const [{ word, meaning }] = scene.newWords;
            assert.match(word, language === "ko" ? /[가-힣]/ : /[A-Za-z]/);
            assert.match(meaning, language === "ko" ? /[A-Za-z]/ : /[가-힣]/);
            assert.ok(scene.lines.some(({ text }) => text.toLowerCase().includes(word.toLowerCase()) && text.toLowerCase().includes(meaning.toLowerCase())));
          }
        });
      }
    }
  }
}

test("the picnic does not repeat a handoff already recorded in the world", () => {
  const initial: SceneRequest = { lesson: "table_manners", language: "ko", age: 5, history: [], wordsLearned: [] };
  const first = createStubScene(initial);
  const firstSim = play(first, initial);
  firstSim.props.apple!.holder = "hero";
  const secondRequest = choose(initial, first, 0, firstSim);
  const second = createStubScene(secondRequest);
  assert.equal(second.stage.beats.some(({ action }) => action === "give"), false);
  const secondSim = play(second, secondRequest);
  secondSim.props.apple!.holder = "friend";
  const finalRequest = choose(secondRequest, second, 0, secondSim);
  const ending = createStubScene(finalRequest);
  assert.equal(ending.stage.beats.some(({ action }) => action === "give"), false);
  assert.equal(play(ending, finalRequest).props.apple!.holder, "friend");
});
