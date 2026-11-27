import type { SceneLanguage } from "../app/api/scene/contract";

/** The child practices the selected language; a translation supports understanding. */
export function practiceInvitation(language: SceneLanguage, expression: string): string {
  const last = expression.normalize("NFC").replace(/[\s\p{P}\p{S}]+$/gu, "").at(-1);
  const code = last?.charCodeAt(0) ?? 0;
  const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return language === "ko"
    ? `우리 같이 “${expression}”${hasFinalConsonant ? "이라고" : "라고"} 말해 볼까?`
    : `Can you say “${expression}” with me?`;
}

type Ending = { title: string; summary: string };
const ENDINGS: Record<string, Record<SceneLanguage, Ending>> = {
  kindness: { ko: { title: "작은 도움이 마음을 따뜻하게 해요", summary: "친구에게 필요한 도움을 물어보고 함께해 봤어요." }, en: { title: "A little help matters", summary: "We noticed a friend and asked how we could help." } },
  empathy: { ko: { title: "네 마음을 들어 줄게", summary: "친구의 기분을 물어보고 이야기를 들어 봤어요." }, en: { title: "I hear how you feel", summary: "We asked about a friend's feelings and listened." } },
  sharing: { ko: { title: "내 차례, 네 차례", summary: "함께 쓸 방법을 찾고 서로 차례를 나눠 봤어요." }, en: { title: "My turn, your turn", summary: "We found a way to share and take turns." } },
  honesty: { ko: { title: "있는 그대로 말해 봐요", summary: "실수해도 사실대로 말하고 다시 해 볼 수 있어요." }, en: { title: "We can tell the truth", summary: "We can tell what happened and try to make things right." } },
  patience: { ko: { title: "기다리는 방법을 찾았어요", summary: "기다리는 동안 할 수 있는 작은 일을 생각해 봤어요." }, en: { title: "We found a way to wait", summary: "We thought of a calm thing to do while waiting." } },
  bravery: { ko: { title: "내가 준비되면 해 볼게", summary: "떨리는 마음을 말하고 작은 시도를 해 봤어요." }, en: { title: "I can try when I'm ready", summary: "We talked about feeling nervous and taking a small step." } },
  gratitude: { ko: { title: "고마운 마음을 전해요", summary: "친구가 해 준 일을 떠올리고 고맙다고 말해 봤어요." }, en: { title: "Thank you for helping", summary: "We noticed what someone did and said thank you." } },
  teamwork: { ko: { title: "각자 맡아서 함께해요", summary: "할 일을 나누고 서로 도우며 함께해 봤어요." }, en: { title: "Everyone has a part", summary: "We shared the jobs and helped each other." } },
  body_safety: { ko: { title: "내 몸과 마음은 소중해요", summary: "싫다고 말해도 괜찮아요. 믿을 수 있는 어른에게 도움을 청할 수 있어요." }, en: { title: "My body belongs to me", summary: "It's okay to say no, change your mind, and ask a trusted grown-up for help." } },
  table_manners: { ko: { title: "편안한 식사 시간을 만들어요", summary: "부탁하고 차례를 기다려 봤어요. 배고픔과 배부름도 말할 수 있어요." }, en: { title: "A comfortable picnic", summary: "We practiced asking and waiting. We can also say when we're hungry or full." } },
};

export function topicEnding(language: SceneLanguage, lesson: string): Ending {
  return ENDINGS[lesson]?.[language] ?? (language === "ko"
    ? { title: "함께 생각하고 배웠어요", summary: "오늘 이야기에서 기억에 남는 일을 함께 이야기해 봐요." }
    : { title: "We thought and learned together", summary: "Talk together about something you remember from today's story." });
}
