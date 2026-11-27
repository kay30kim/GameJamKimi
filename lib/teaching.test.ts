import assert from "node:assert/strict";
import test from "node:test";
import { practiceInvitation, topicEnding } from "./teaching";
import { meaningLocale, speechLocale } from "./speech";

test("Korean is both the main story and practice language when Korean is selected", () => {
  assert.equal(speechLocale("ko"), "ko-KR");
  assert.equal(meaningLocale("ko"), "en-US");
  assert.equal(practiceInvitation("ko", "사과"), "우리 같이 “사과”라고 말해 볼까?");
  assert.equal(practiceInvitation("ko", "나는 슬퍼"), "우리 같이 “나는 슬퍼”라고 말해 볼까?");
});

test("Korean quoted words use the final consonant particle even before punctuation", () => {
  assert.equal(practiceInvitation("ko", "휘청"), "우리 같이 “휘청”이라고 말해 볼까?");
  assert.equal(practiceInvitation("ko", "친절!"), "우리 같이 “친절!”이라고 말해 볼까?");
  assert.equal(practiceInvitation("ko", "같이"), "우리 같이 “같이”라고 말해 볼까?");
});

test("topic endings explain each lesson and preserve body autonomy", () => {
  const topics = ["kindness", "empathy", "sharing", "honesty", "patience", "bravery", "gratitude", "teamwork", "body_safety", "table_manners"];
  for (const language of ["ko", "en"] as const) {
    const endings = topics.map((topic) => topicEnding(language, topic));
    assert.equal(new Set(endings.map(({ title }) => title)).size, topics.length);
    assert.ok(endings.every(({ title, summary }) => title.length > 0 && summary.length > 0));
    assert.ok(topicEnding(language, "custom lesson").summary);
  }
  assert.match(topicEnding("ko", "body_safety").summary, /싫다고 말해도 괜찮아요/);
  assert.match(topicEnding("en", "body_safety").summary, /change your mind/);
});

test("English invitations practice the English expression rather than its Korean meaning", () => {
  assert.equal(speechLocale("en"), "en-US");
  assert.equal(meaningLocale("en"), "ko-KR");
  assert.equal(practiceInvitation("en", "apple"), "Can you say “apple” with me?");
  assert.equal(practiceInvitation("en", "I'm sad"), "Can you say “I'm sad” with me?");
});
