import type { KayStory, Language, Localized, Motion, Speaker, StoryScene } from "./types";

export interface GameMoment {
  id: string;
  question: Localized;
  choices: Array<{
    label: Localized;
    response: Localized;
    speaker: Speaker;
    action: Motion;
    to: Speaker;
  }>;
}

export const choicePrompt: Localized = {
  en: "What should we do? You choose!",
  ko: "우리 어떻게 할까? 네가 골라 줘!",
};
export const successPrompt: Localized = {
  en: "Great job! Let’s keep playing!",
  ko: "잘했어! 계속 놀자!",
};
export const retryPrompt: Localized = {
  en: "Let's try that together once more. You can listen to me, then have a turn.",
  ko: "우리 한 번 더 같이 해 보자. 내 말을 먼저 듣고, 그다음에 네가 말해 봐.",
};
export const defaultPractice: Localized = { ko: "고마워!", en: "Thank you!" };
const LESSON_PRACTICE: Record<string, Localized> = {
  kindness: defaultPractice,
  empathy: { ko: "괜찮아?", en: "Are you okay?" },
  sharing: { ko: "같이 놀자!", en: "Let's play together!" },
  honesty: { ko: "미안해.", en: "I'm sorry." },
  patience: { ko: "다시 해 보자!", en: "Let's try again!" },
};

/** Every younger-child scene ends with a short, contextual speaking turn. */
export function practiceFor(story: KayStory, scene: StoryScene): Localized {
  if (scene.practice) return scene.practice;
  for (let index = scene.lines.length - 1; index >= 0; index--) {
    if (scene.lines[index].learn) return scene.lines[index].learn!;
  }
  return LESSON_PRACTICE[story.lesson] ?? defaultPractice;
}

/** One direct invitation, followed by a real listening turn in the player. */
export function practicePrompt(word: Localized, home: Language, learn: Language): string {
  const value = word[learn].trim();
  const phrase = /[.!?。！？]$/u.test(value) ? value : `${value}.`;
  return home === "en"
    ? `Let's all say, ${phrase} Now it's your turn. I'm listening.`
    : `우리 다 같이 말해 보자. ${phrase} 이제 네 차례야. 네 말을 들어 줄게.`;
}

type Option = [ko: string, en: string, responseKo: string, responseEn: string, action: Motion, to: Speaker];
function moment(id: string, ko: string, en: string, options: Option[]): GameMoment {
  return {
    id, question: { ko, en },
    choices: options.map(([labelKo, labelEn, responseKo, responseEn, action, to]) => ({
      label: { ko: labelKo, en: labelEn }, response: { ko: responseKo, en: responseEn }, speaker: "kimi", action, to,
    })),
  };
}

const MOMENTS: Record<string, Record<string, GameMoment>> = {
  kindness: {
    hello: moment("kindness-hello-child", "보리에게 어떻게 인사할까? 네가 골라 줘!", "How should I say hello to Bori? You choose!", [
      ["보리에게 손을 흔들어요", "Wave to Bori", "보리야, 안녕! 내 손 보이니? 네 친구가 여기 있어!", "Hi, Bori! Can you see my little wave? Your friend is right here!", "wave", "bori"],
      ["보리에게 가까이 가요", "Step closer to Bori", "보리야, 네 옆으로 갈게. 가까이서 네 이야기를 듣고 싶어.", "Bori, I'll come a little closer. I'd like to hear how you're doing.", "walk", "bori"],
    ]),
    together: moment("kindness-together-child", "누구에게 먼저 고맙다고 말해 볼까?", "Who shall I thank first?", [
      ["모모에게 고맙다고 해요", "Thank Momo", "모모야, 우리 모두를 도와줘서 고마워. 네 친절이 참 따뜻해!", "Momo, thank you for helping all of us. Your kindness feels so warm!", "offer", "momo"],
      ["보리에게 고맙다고 해요", "Thank Bori", "보리야, 내 자리를 살펴봐 줘서 고마워. 네 덕분에 편안해졌어!", "Bori, thank you for noticing my seat. You helped me feel comfortable!", "wave", "bori"],
    ]),
    end: moment("kindness-end-child", "우리 소풍을 어떻게 마무리할까?", "How shall we finish our lovely picnic?", [
      ["모모와 고마움의 춤을 춰요", "Dance with Momo", "모모야, 우리 고마움의 춤을 추자! 작은 발로 하나, 둘!", "Momo, let's do a little thank-you dance! Tiny paws, one and two!", "dance", "momo"],
      ["보리에게 반갑게 손을 흔들어요", "Wave goodbye to Bori", "보리야, 오늘 함께해서 즐거웠어! 내일도 같이 놀자!", "Bori, I loved being with you today! Let's play together again tomorrow!", "wave", "bori"],
    ]),
  },
  empathy: {
    hello: moment("empathy-hello-child", "보리에게 우리가 곁에 있다는 걸 어떻게 알려 줄까?", "How can I let Bori know we're here for him?", [
      ["보리에게 살며시 손을 흔들어요", "Give Bori a gentle wave", "안녕, 보리야. 작은 인사를 보낼게. 지금 춤추지 않아도 괜찮아.", "Hello, Bori. Here's a gentle little wave. You don't have to dance right now.", "wave", "bori"],
      ["보리 가까이 천천히 가요", "Come closer to Bori", "보리야, 천천히 네 곁으로 갈게. 네 마음을 그대로 가져와도 돼.", "Bori, I'll come over slowly. You can bring your feelings just as they are.", "walk", "bori"],
    ]),
    reflect: moment("empathy-reflect-child", "친구에게 어떤 마음을 전할까? 네가 골라 줘.", "What shall I say to our friends? You choose.", [
      ["보리의 마음을 물어봐요", "Check in with Bori", "보리야, 지금 마음은 어때? 말하고 싶으면 내가 들어줄게.", "Bori, how are you feeling now? If you'd like to tell me, I'll listen.", "think", "bori"],
      ["모모에게 고마움을 전해요", "Thank Momo for listening", "모모야, 보리의 이야기를 함께 들어줘서 고마워. 좋은 친구가 되어 줬네.", "Momo, thank you for listening to Bori with me. You were a caring friend.", "offer", "momo"],
    ]),
    end: moment("empathy-end-child", "우리만의 조용한 인사를 어떻게 할까?", "How shall we say a gentle goodbye?", [
      ["보리와 조용히 손을 흔들어요", "Share a quiet wave with Bori", "보리야, 작은 손짓으로 인사할게. 내일도 네 마음을 들려줘.", "Bori, here's a quiet little wave. You can tell me how you feel tomorrow too.", "wave", "bori"],
      ["모모와 천천히 걸어요", "Take slow steps with Momo", "모모야, 우리 천천히 걸어가자. 친구를 기다려 주는 걸음이야.", "Momo, let's take some slow steps. These are footsteps that make time for friends.", "walk", "momo"],
    ]),
  },
  sharing: {
    hello: moment("sharing-hello-child", "보리가 함께 놀 수 있게 어떻게 해 볼까?", "What can I do to help Bori join our game?", [
      ["보리에게 오라고 손을 흔들어요", "Wave Bori over", "보리야, 이리 와! 너랑 함께 놀고 싶어. 네 자리도 만들자!", "Bori, come over here! I'd love to play with you. Let's make a place for you!", "wave", "bori"],
      ["모모와 함께 자리를 만들어요", "Ask Momo to make room", "모모야, 우리 조금씩 비켜 볼까? 그러면 보리도 함께할 수 있어!", "Momo, shall we move over a little? Then Bori can be part of our game too!", "offer", "momo"],
    ]),
    reflect: moment("sharing-reflect-child", "이번 작은 춤은 누구와 함께 출까?", "Who shall I share this little dance with?", [
      ["모모와 발을 쿵쿵 굴러요", "Stomp gently with Momo", "모모야, 네 발걸음을 따라 해 볼게! 하나, 둘, 함께 쿵쿵!", "Momo, I'll try your little footsteps! One, two, let's stomp together!", "dance", "momo"],
      ["보리와 몸을 살랑살랑 흔들어요", "Wiggle with Bori", "보리야, 네 살랑살랑 춤을 배워 볼래! 우리 같이 흔들흔들!", "Bori, I'd love to learn your wiggly dance! Let's wiggle side by side!", "dance", "bori"],
    ]),
    end: moment("sharing-end-child", "마지막 인사는 누구와 함께 할까?", "Who shall join me for our last little ta-da?", [
      ["모모와 함께 짠!", "Say ta-da with Momo", "모모야, 같이 짠! 네가 함께해서 우리 놀이가 더 즐거워졌어!", "Momo, let's say ta-da together! Our game was more fun with you in it!", "cheer", "momo"],
      ["보리와 함께 짠!", "Say ta-da with Bori", "보리야, 네 차례야! 같이 짠! 다음에도 꼭 함께 놀자!", "Bori, here's your turn! Let's say ta-da! Come and play with us next time too!", "cheer", "bori"],
    ]),
  },
  honesty: {
    hello: moment("honesty-hello-child", "내 마음이 콩닥콩닥해. 어떻게 용기를 내 볼까?", "My heart feels fluttery. What could help me be brave?", [
      ["보리와 잠깐 숨을 고르세요", "Take a breath with Bori", "보리야, 나랑 잠깐 숨을 쉬어 줄래? 후우. 이제 천천히 말해 볼게.", "Bori, will you take a little breath with me? Phew. Now I can try to speak slowly.", "think", "bori"],
      ["모모에게 한 걸음 다가가요", "Take a step toward Momo", "모모야, 네게 하고 싶은 말이 있어. 작은 걸음으로 가까이 갈게.", "Momo, there's something I'd like to tell you. I'll take one little step closer.", "walk", "momo"],
    ]),
    reflect: moment("honesty-reflect-child", "친구에게 어떤 말을 전하고 싶어?", "What would you like me to say to a friend?", [
      ["모모에게 들어줘서 고맙다고 해요", "Thank Momo for listening", "모모야, 내 이야기를 들어줘서 고마워. 다음에도 솔직하게 말할게.", "Momo, thank you for listening to me. I'll try to be honest next time too.", "offer", "momo"],
      ["보리와 조심조심 걸어봐요", "Walk carefully with Bori", "보리야, 이제 길에서 천천히 걸어 보자. 우리가 함께 꽃밭을 돌보는 거야.", "Bori, let's walk carefully on the path. We're helping to look after the garden together.", "walk", "bori"],
    ]),
    end: moment("honesty-end-child", "용기를 낸 우리에게 어떤 인사를 해 줄까?", "How shall we celebrate our brave, honest day?", [
      ["모모와 작은 춤을 춰요", "Do a little dance with Momo", "모모야, 같이 작은 춤을 추자! 솔직하게 말하고 다시 함께 놀 수 있어 기뻐!", "Momo, let's do a little dance! I'm glad I told the truth and we can play together again!", "dance", "momo"],
      ["보리에게 고마운 인사를 해요", "Give Bori a thankful wave", "보리야, 곁에 있어 줘서 고마워! 내 작은 손으로 큰 고마움을 보낼게!", "Bori, thank you for being beside me! Here's a little wave with a big thank-you!", "wave", "bori"],
    ]),
  },
  patience: {
    hello: moment("patience-hello-child", "내 손이 꼼지락거려! 어떤 작은 움직임을 해 볼까?", "My paws feel wriggly! What little move should I try?", [
      ["모모에게 천천히 손을 흔들어요", "Wave slowly to Momo", "모모야, 내 느린 손짓을 봐! 하나, 둘. 기다리는 동안에도 인사할 수 있네.", "Momo, look at my slow little wave! One, two. We can say hello while we wait.", "wave", "momo"],
      ["보리와 작은 걸음을 걸어요", "Take tiny steps with Bori", "보리야, 작은 발로 천천히 걸어 보자. 우리 서두르지 않아도 돼.", "Bori, let's try some tiny, gentle steps. We don't have to hurry.", "walk", "bori"],
    ]),
    return: moment("patience-return-child", "기다린 마음을 누구와 나눌까?", "Who shall I share our patient little moment with?", [
      ["모모와 꽃을 조용히 바라봐요", "Look at the flower with Momo", "모모야, 꽃을 조용히 바라보자. 꽃도 자기만의 시간이 있구나.", "Momo, let's look at the flower quietly. It has its very own time to grow.", "think", "momo"],
      ["할머니께 고맙다고 해요", "Thank Grandma Owl", "할머니, 천천히 해도 된다고 알려 주셔서 고마워요! 마음이 편안해졌어요.", "Grandma, thank you for showing us it's okay to go slowly! My heart feels calmer.", "offer", "owl"],
    ]),
    end: moment("patience-end-child", "우리만의 느긋한 인사를 어떻게 할까?", "How shall we say goodbye at our own gentle pace?", [
      ["보리와 느린 춤을 춰요", "Dance slowly with Bori", "보리야, 느린 춤도 재미있지? 하나, 둘. 우리는 조금씩 자라고 있어!", "Bori, slow dancing is fun too! One, two. We're growing a little at a time!", "dance", "bori"],
      ["모모에게 손을 흔들어요", "Wave goodbye to Momo", "모모야, 오늘 기다리는 법을 같이 배워서 좋았어. 내일 또 만나자!", "Momo, I liked learning to wait with you today. Let's see each other tomorrow!", "wave", "momo"],
    ]),
  },
};

/** Mini moments add acted choices without changing the authored branching graph. */
export function getGameMoment(story: KayStory, scene: StoryScene): GameMoment | undefined {
  if (!story.custom) {
    const authored = MOMENTS[story.id]?.[scene.id];
    if (authored) return authored;
  }
  if (!story.custom || scene.choices.length) return undefined;
  if (scene.id === story.start) return moment(`${story.id}-hello-child`, "친구들에게 어떻게 인사할까?", "How shall I say hello to our friends?", [
    ["모모에게 손을 흔들어요", "Wave to Momo", "모모야, 안녕! 오늘 함께하게 되어 기뻐!", "Hello, Momo! I'm happy we're here together today!", "wave", "momo"],
    ["보리에게 다가가요", "Come closer to Bori", "보리야, 네 곁으로 갈게. 우리 함께 이야기를 시작하자.", "Bori, I'll come over to you. Let's begin our little story together.", "walk", "bori"],
  ]);
  if (!scene.next) return moment(`${story.id}-end-child`, "친구들과 어떤 마지막 인사를 나눌까?", "How shall we say goodbye to our friends?", [
    ["모모와 함께 손을 흔들어요", "Wave with Momo", "모모야, 함께해 줘서 고마워! 다음에도 같이 놀자!", "Momo, thank you for being with me! Let's play together another day!", "wave", "momo"],
    ["보리에게 고마운 인사를 해요", "Thank Bori", "보리야, 오늘도 내 친구가 되어 줘서 고마워. 너랑 함께해서 좋았어!", "Bori, thank you for being my friend today. I liked spending this time with you!", "offer", "bori"],
  ]);
  const next = story.scenes[scene.next];
  if (next && !next.next && !next.choices.length) return moment(`${story.id}-reflect-child`, "누구에게 함께해 줘서 고맙다고 할까?", "Who shall I thank for being here with us?", [
    ["모모에게 고맙다고 해요", "Thank Momo", "모모야, 내 이야기를 들어줘서 고마워. 네가 함께해서 기뻐.", "Momo, thank you for listening to me. I'm glad you were here with us.", "offer", "momo"],
    ["보리에게 고맙다고 해요", "Thank Bori", "보리야, 함께해 줘서 고마워. 우리 서로를 잘 살펴보자.", "Bori, thank you for being with me. Let's keep looking out for each other.", "wave", "bori"],
  ]);
  return undefined;
}
