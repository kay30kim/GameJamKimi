import type { SceneLanguage } from "../app/api/scene/contract";

type Expression = { ko: string; en: string; age?: number };

// The lesson phrases come from the reviewed, age-specific lesson-script drafts.
// Stories and choices remain generated; the words we ask children to repeat are bounded.
const LESSON_EXPRESSIONS: Record<string, Expression[]> = {
  kindness: [{ ko: "도와줄까?", en: "Can I help?" }],
  empathy: [{ ko: "슬퍼", en: "I'm sad" }, { ko: "기분이 어때?", en: "How do you feel?" }],
  sharing: [{ ko: "네 차례야", en: "Your turn" }],
  honesty: [{ ko: "내가 그랬어", en: "It was me" }],
  patience: [{ ko: "기다릴게", en: "I'll wait" }, { ko: "조금만 기다릴게", en: "I'll wait a little", age: 4 }, { ko: "다 보면 알려 줘", en: "Tell me when you're done", age: 5 }, { ko: "기다리는 동안 다른 걸 할게", en: "I'll do something else while I wait", age: 6 }],
  bravery: [{ ko: "나도 놀아도 돼?", en: "Can I play too?" }, { ko: "같이 해도 돼?", en: "Can I join?", age: 4 }, { ko: "처음이라 조금 떨려", en: "I feel nervous because it's new", age: 5 }, { ko: "내가 준비되면 해 볼게", en: "I'll try when I'm ready", age: 6 }],
  gratitude: [{ ko: "고마워", en: "Thank you" }, { ko: "도와줘서 고마워", en: "Thank you for helping", age: 4 }, { ko: "찾아줘서 고마워", en: "Thank you for finding it", age: 5 }, { ko: "찾아봐 줘서 고마워", en: "Thank you for looking for it", age: 6 }],
  teamwork: [{ ko: "같이", en: "Together" }, { ko: "같이 하자", en: "Let's do it together", age: 4 }, { ko: "책을 맡아 줄래?", en: "Could you carry the book?", age: 5 }, { ko: "어떤 일을 맡고 싶어?", en: "Which job would you like?", age: 6 }],
  body_safety: [{ ko: "그만", en: "Stop" }, { ko: "싫어요", en: "No, thank you", age: 4 }, { ko: "지금은 안고 싶지 않아", en: "I don't want a hug right now", age: 5 }, { ko: "내 마음이 바뀌었어", en: "I changed my mind", age: 6 }],
  table_manners: [{ ko: "주세요", en: "Please" }, { ko: "기다릴게요", en: "I'll wait", age: 4 }, { ko: "쿠키 좀 주세요", en: "May I have a cookie, please?", age: 5 }, { ko: "제 차례가 되면 알려 주세요", en: "Please tell me when it's my turn", age: 6 }],
};

const COMMON: Expression[] = [
  { ko: "친구", en: "friend" }, { ko: "강아지", en: "puppy" }, { ko: "토끼", en: "bunny" }, { ko: "고양이", en: "kitten" }, { ko: "오리", en: "duck" },
  { ko: "사과", en: "apple" }, { ko: "공", en: "ball" }, { ko: "책", en: "book" }, { ko: "꽃", en: "flower" }, { ko: "나무", en: "tree" },
  { ko: "연", en: "kite" }, { ko: "풍선", en: "balloon" }, { ko: "쿠키", en: "cookies" }, { ko: "우산", en: "umbrella" }, { ko: "물뿌리개", en: "watering can" },
  { ko: "벤치", en: "bench" }, { ko: "연못", en: "pond" }, { ko: "놀이터", en: "playground" }, { ko: "꽃밭", en: "garden" }, { ko: "집", en: "home" },
  { ko: "고마워", en: "Thank you" }, { ko: "미안해", en: "I'm sorry" }, { ko: "괜찮아", en: "It's okay" }, { ko: "함께", en: "together" },
  { ko: "도와줘", en: "Help me" }, { ko: "기다려", en: "Wait" }, { ko: "웃음", en: "smile" }, { ko: "차례", en: "turn" },
  { ko: "슬퍼", en: "I'm sad" }, { ko: "기뻐", en: "I'm happy" }, { ko: "무거워", en: "It's heavy" }, { ko: "가벼워", en: "It's light" },
  { ko: "같이 가자", en: "Let's go together" }, { ko: "천천히", en: "slowly" }, { ko: "조심조심", en: "carefully" },
];

export const expressionKey = (text: string) => text.normalize("NFC").replace(/[’‘]/g, "'").replace(/[.!?。！？]+$/u, "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function lessonVocabulary(lesson: string, age: number, language: SceneLanguage): { word: string; meaning: string }[] {
  const seen = new Set<string>();
  return [...(LESSON_EXPRESSIONS[lesson] ?? []), ...COMMON]
    .filter(({ age: minimum = 3 }) => age >= minimum)
    .map((entry) => ({ word: entry[language], meaning: entry[language === "ko" ? "en" : "ko"] }))
    .filter(({ word }) => { const key = expressionKey(word); if (seen.has(key)) return false; seen.add(key); return true; });
}
