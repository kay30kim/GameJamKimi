import test from "node:test";
import assert from "node:assert/strict";
import { STORIES } from "./stories";
import { defaultPractice, getGameMoment, practiceFor, practicePrompt } from "./interactions";
import type { StoryScene } from "./types";

test("every bundled story path has five spoken, acted decisions", () => {
  for (const story of STORIES) {
    function visit(id: string, count: number) {
      const scene = story.scenes[id];
      const moment = getGameMoment(story, scene);
      if (moment) {
        assert.equal(moment.choices.length, 2);
        assert.ok(moment.question.en && moment.question.ko);
        for (const choice of moment.choices) {
          assert.equal(choice.speaker, "alice");
          assert.ok(choice.label.en && choice.label.ko && choice.response.en && choice.response.ko);
          assert.notEqual(choice.action, "talk", "a choice must cause a visible action");
          assert.notEqual(choice.to, "narrator");
        }
        count++;
      }
      if (scene.choices.length) {
        for (const choice of scene.choices) visit(choice.next, count + 1);
      } else if (scene.next) visit(scene.next, count);
      else assert.equal(count, 5, `${story.id} must offer five choices on every route`);
    }
    visit(story.start, 0);
  }
});

test("younger children always get a contextual phrase and a direct invitation", () => {
  for (const story of STORIES) for (const scene of Object.values(story.scenes)) {
    const phrase = practiceFor(story, scene);
    assert.ok(phrase.en && phrase.ko);
    const invitation = practicePrompt(phrase, "en", "ko");
    assert.ok(invitation.includes(phrase.ko));
    assert.match(invitation, /your turn/i);
    assert.match(invitation, /listening/i);
  }
  const story = STORIES[0];
  const scene: StoryScene = { id: "test", title: { en: "Test", ko: "연습" }, location: "meadow", choices: [], lines: [] };
  assert.deepEqual(practiceFor({ ...story, lesson: "unfamiliar custom lesson", custom: true }, scene), defaultPractice);
  assert.deepEqual(practiceFor(story, { ...scene, practice: { ko: "안녕!", en: "Hello!" } }), { ko: "안녕!", en: "Hello!" });
});

test("custom stories reuse greetings, reflection, and goodbye without overriding authored decisions", () => {
  const story = { ...STORIES[0], id: "parent-created", custom: true };
  assert.ok(getGameMoment(story, story.scenes[story.start]));
  assert.ok(getGameMoment(story, story.scenes.together));
  assert.ok(getGameMoment(story, story.scenes.end));
  assert.equal(getGameMoment(story, story.scenes.notice), undefined);
});
