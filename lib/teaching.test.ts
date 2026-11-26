import assert from "node:assert/strict";
import test from "node:test";
import { practiceInvitation } from "./teaching";
import { meaningLocale, speechLocale } from "./speech";

test("Korean is both the main story and practice language when Korean is selected", () => {
  assert.equal(speechLocale("ko"), "ko-KR");
  assert.equal(meaningLocale("ko"), "en-US");
  assert.equal(practiceInvitation("ko", "사과"), "우리 같이 “사과”라고 말해 볼까?");
  assert.equal(practiceInvitation("ko", "나는 슬퍼"), "우리 같이 “나는 슬퍼”라고 말해 볼까?");
});

test("English invitations practice the English expression rather than its Korean meaning", () => {
  assert.equal(speechLocale("en"), "en-US");
  assert.equal(meaningLocale("en"), "ko-KR");
  assert.equal(practiceInvitation("en", "apple"), "Can you say “apple” with me?");
  assert.equal(practiceInvitation("en", "I'm sad"), "Can you say “I'm sad” with me?");
});
