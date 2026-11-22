import type { DialogueLine, KayStory, Localized, Location, Mood, Motion, Speaker, StoryScene } from "./types";

type Line = [Speaker, string, string, Motion?, Speaker?, Mood?, Localized?];
const words = (ko: string, en: string): Localized => ({ ko, en });
const choice = (ko: string, en: string, next: string, actor: Speaker) => ({ label: words(ko, en), next, actor });
function scene(story: string, id: string, location: Location, ko: string, en: string, script: Line[], flow: Pick<StoryScene, "next" | "practice"> & { choices?: StoryScene["choices"] } = {}): StoryScene {
  const lines: DialogueLine[] = script.map(([speaker, korean, english, action = "talk", to, emotion = "happy", learn], i) => ({
    id: `${story}-${id}-${i + 1}`, speaker, text: words(korean, english), action, emotion,
    ...(to ? { to } : {}), ...(learn ? { learn } : {}),
  }));
  return { id, title: words(ko, en), location, lines, choices: [], ...flow };
}
function story(id: string, ko: string, en: string, descriptionKo: string, descriptionEn: string, scenes: StoryScene[]): KayStory {
  return { version: 1, id, lesson: id, title: words(ko, en), description: words(descriptionKo, descriptionEn), start: "hello", scenes: Object.fromEntries(scenes.map((item) => [item.id, item])) };
}

const kindness = story("kindness", "작은 친절의 피크닉", "The Little Kindness Picnic", "작은 도움이 모여 따뜻한 소풍이 돼요.", "A little helping hand makes room for a lovely picnic.", [
  scene("kindness", "hello", "meadow", "소풍 가는 아침", "A picnic morning", [
    ["narrator", "햇살이 반짝이는 아침, 친구들이 소풍을 준비해요.", "Morning sunlight dances through the meadow. The friends are getting a picnic ready."],
    ["alice", "모모야! 오늘은 연못 옆에서 소풍 가자. 꽃 냄새도 맡고!", "Momo! Let's have our picnic by the pond today. We can smell the flowers too!", "wave", "momo"],
    ["momo", "좋아! 나는 푹신한 자리를 챙겼어. 보리는 어디 있을까?", "Yes! I brought something soft to sit on. I wonder where Bori is.", "offer", "alice"],
    ["bori", "나 여기 있어! 그런데 이것들을 한꺼번에 들려니까 자꾸 떨어져.", "I'm right here! But when I try to carry everything, it keeps falling down.", "think", "alice", "sad"],
    ["alice", "어머, 보리 귀가 축 처졌네. 우리 가까이 가 보자.", "Oh, Bori's ears look droopy. Let's go over and see how we can help.", "walk", "bori", "curious"],
  ], { next: "notice" }),
  scene("kindness", "notice", "garden", "친구를 살펴봐요", "Notice a friend", [
    ["alice", "보리야, 힘들어 보여. 내가 조금 도와줘도 괜찮아?", "Bori, that looks tricky. Would it be okay if I gave you a little help?", "offer", "bori", "curious", words("도와줄까?", "Can I help?")],
    ["bori", "응. 내가 다 해야 하는 줄 알았어. 같이 해도 되는구나.", "Yes, please. I thought I had to do everything myself. We can do it together!", "talk", "alice"],
    ["momo", "내 손은 비어 있어! 들고 가는 걸 나눠서 해도 돼.", "My paws are free! We could each carry a little bit of the picnic.", "wave", "bori"],
    ["bori", "아니면 모모가 먼저 가서 앉을 자리를 찾아줘도 좋아.", "Or Momo could go ahead and find a nice place for us to sit.", "think", "momo", "curious"],
    ["alice", "둘 다 좋은 도움이야. 우리 어떤 일부터 같이 해 볼까?", "Those are both helpful ideas. What shall we do together first?", "think", "momo", "curious"],
  ], { practice: words("도와줄까?", "Can I help?"), choices: [choice("모모와 함께 짐을 나눠 들어요", "Share the carrying with Momo", "carry", "momo"), choice("보리와 천천히 걷고 모모가 자리를 찾아요", "Walk with Bori while Momo finds a spot", "walk", "bori")] }),
  scene("kindness", "carry", "garden", "조금씩 나누면", "A little each", [
    ["alice", "모모야, 나랑 조금씩 나눠 들자. 보리는 가벼운 걸 골라!", "Momo, let's each take a little. Bori, you can choose the lightest thing!", "offer", "momo"],
    ["momo", "하나, 둘! 아까보다 훨씬 쉬워졌어. 이제 네 얼굴이 보여!", "One, two! This is much easier. And now I can see your face!", "cheer", "bori", "excited"],
    ["bori", "히히, 내 얼굴이 숨어 있었네. 고마워, 친구들아.", "Hee hee, my face was hiding! Thank you for helping me, friends.", "wave", "alice", "happy", words("고마워!", "Thank you!")],
    ["alice", "우리 발걸음을 맞춰 보자. 작은 걸음, 또 작은 걸음!", "Let's match our footsteps. A little step, and another little step!", "walk", "bori"],
    ["momo", "나는 무거운 것만 옮기는 줄 알았는데, 웃음도 같이 옮겼네!", "I thought we were just carrying picnic things. We brought some giggles along too!", "cheer", "alice"],
  ], { next: "spot" }),
  scene("kindness", "walk", "meadow", "친구의 속도로", "At a friend's pace", [
    ["alice", "보리야, 네 옆에서 같이 걸을게. 서두르지 않아도 돼.", "Bori, I'll walk beside you. We don't need to hurry at all.", "walk", "bori"],
    ["bori", "조금 천천히 가니까 안 떨어져! 내 발도 덜 바쁘네.", "When I go slowly, nothing falls! My paws don't feel so busy now.", "walk", "alice"],
    ["momo", "여기야! 평평하고 나무 그늘도 있는 자리를 찾았어!", "Over here! I found a flat spot with a lovely patch of shade!", "wave", "alice", "excited"],
    ["bori", "기다려 줘서 고마워. 이제 나도 소풍이 기대돼.", "Thank you for waiting for me. Now I'm excited about our picnic too.", "talk", "alice", "happy", words("고마워!", "Thank you!")],
    ["alice", "우리가 함께 도착했네. 모모가 찾은 자리로 가 보자!", "We made it together. Let's go and see the place Momo found!", "wave", "momo"],
  ], { next: "spot" }),
  scene("kindness", "spot", "pond", "빈자리 하나", "One empty place", [
    ["momo", "이쪽은 앨리스 자리, 여기는 보리 자리! 하나가 남았네.", "This spot is for Alice, and this one is for Bori! There's one place left.", "offer", "bori"],
    ["bori", "부엉이 할머니가 저기 계셔. 꽃을 구경하고 계신가 봐.", "Grandma Owl is over there. I think she's looking at the flowers.", "wave", "owl", "curious"],
    ["owl", "너희 웃음소리가 참 즐겁구나. 소풍 준비가 잘됐니?", "Your giggles sound lovely, little ones. Is your picnic ready?", "wave", "alice"],
    ["alice", "네! 할머니도 함께하면 더 좋겠어요. 어떻게 모셔 올까?", "Yes! It would be even nicer with you here. How shall we invite you?", "offer", "owl"],
    ["momo", "직접 가서 손을 내밀까? 아니면 모두 반갑게 손을 흔들까?", "Shall we go and offer a paw? Or shall we all wave a big hello?", "think", "alice", "curious"],
  ], { choices: [choice("할머니께 다가가 초대해요", "Walk over and invite Grandma", "invite", "owl"), choice("친구들과 함께 손을 흔들어요", "Wave together with your friends", "wave", "momo")] }),
  scene("kindness", "invite", "pond", "같이 앉아요", "Come sit with us", [
    ["alice", "할머니, 우리 옆에 자리가 있어요. 같이 앉으실래요?", "Grandma, there's a place beside us. Would you like to come and sit?", "walk", "owl", "happy", words("같이 해요!", "Join us!")],
    ["owl", "직접 와서 물어봐 주니 참 따뜻하구나. 기쁘게 함께할게.", "How lovely of you to come and ask me. I'd be very happy to join you.", "talk", "alice"],
    ["bori", "여기에요, 할머니! 제가 조금 비켜 드릴게요.", "Over here, Grandma! I'll scoot over so you've got plenty of room.", "offer", "owl"],
    ["momo", "이제 빈자리가 웃는 자리로 바뀌었어!", "Now our empty place has turned into a smiling place!", "cheer", "alice", "excited"],
    ["alice", "할머니랑도 소풍을 하게 됐네. 정말 좋은 생각이었어.", "Now Grandma gets to have a picnic too. That was a lovely idea.", "talk", "momo"],
  ], { next: "together" }),
  scene("kindness", "wave", "pond", "반가운 손짓", "A friendly wave", [
    ["alice", "모두 할머니께 손을 흔들자. 할머니, 같이 소풍해요!", "Let's all wave to Grandma. Grandma, come and have a picnic with us!", "wave", "owl", "happy", words("같이 해요!", "Join us!")],
    ["bori", "여기 자리가 있어요! 제 꼬리도 인사하고 있어요!", "There's a place right here! Look, even my tail is saying hello!", "wave", "owl", "excited"],
    ["owl", "손도 꼬리도 참 반갑구나. 너희에게 가고 싶어졌어.", "What a friendly wave, and a friendly tail! I'd love to come over.", "walk", "bori"],
    ["momo", "제 옆에 앉으세요. 우리 모두 조금씩 자리를 만들었어요.", "Come sit beside me. We all moved a little to make some room.", "offer", "owl"],
    ["alice", "작은 손짓이 할머니께 닿았네. 우리 마음도 전해졌어!", "Our little wave reached Grandma. And our friendly feelings did too!", "cheer", "momo"],
  ], { next: "together" }),
  scene("kindness", "together", "pond", "친절이 돌아와요", "Kindness comes around", [
    ["bori", "앗, 앨리스야. 네 뒤에 자리가 조금 울퉁불퉁해 보여.", "Oh, Alice! The spot behind you looks a little bumpy.", "think", "alice", "curious"],
    ["alice", "정말 그러네. 푹신하게 만들려면 어떻게 해야 할까?", "You're right. What could we do to make it a bit more comfortable?", "think", "bori", "curious"],
    ["bori", "내가 도와줄까? 이번에는 내 손이 비어 있거든!", "Can I help? This time my paws are the ones that are free!", "offer", "alice", "happy", words("도와줄까?", "Can I help?")],
    ["alice", "응, 고마워! 네가 내 마음을 살펴봐 주니 기분이 좋아.", "Yes, thank you! It feels lovely when you notice what I need.", "talk", "bori"],
    ["momo", "우리 소풍에는 맛있는 것 말고도 친절이 아주 많네.", "Our picnic has more than lovely things to eat. It's full of kindness too.", "cheer", "alice"],
  ], { next: "end", practice: words("고마워!", "Thank you!") }),
  scene("kindness", "end", "meadow", "우리의 작은 친절", "Our little kindness", [
    ["alice", "나는 오늘 작은 도움도 친구를 웃게 한다는 걸 알았어.", "Today I found out that even a little bit of help can make a friend smile.", "talk", "momo"],
    ["momo", "나는 혼자 먼저 가기보다 친구와 함께 가는 게 좋았어.", "I liked going together with my friends instead of rushing ahead on my own.", "talk", "bori"],
    ["bori", "내가 도움을 받고, 또 도와줄 수도 있어서 좋았어!", "I liked getting some help, and then giving some help too!", "cheer", "alice", "excited"],
    ["owl", "너희가 서로를 살펴봐 줬구나. 마음이 참 포근해지는구나.", "You all noticed and cared for one another. That makes my heart feel warm.", "talk", "alice"],
    ["alice", "내일도 친구에게 물어볼래. 도와줄까? 그럼 또 같이 웃겠지!", "Tomorrow I'll ask a friend again: can I help? Then we can smile together again!", "wave", "bori", "happy", words("도와줄까?", "Can I help?")],
  ]),
]);

const empathy = story("empathy", "보리의 조용한 하루", "Bori's Quiet Day", "친구의 마음을 묻고, 함께 있을 방법을 찾아요.", "Listen to a friend's feelings and find a way to be together.", [
  scene("empathy", "hello", "garden", "춤추는 꽃밭", "The dancing garden", [
    ["narrator", "꽃밭에서 앨리스와 모모가 작은 춤을 만들고 있어요.", "In the flower garden, Alice and Momo are making up a little dance."],
    ["alice", "모모야, 내 귀가 리듬을 타! 한 번 흔들, 또 흔들!", "Momo, my ears are dancing to the rhythm! One little wiggle, then another!", "dance", "momo", "excited"],
    ["momo", "내 발은 쿵쿵! 보리도 같이 추면 정말 재미있겠어.", "My paws go stomp, stomp! It would be so much fun if Bori danced with us.", "dance", "alice", "excited"],
    ["alice", "보리가 저기 있네. 그런데 오늘은 꼬리가 조용해.", "Bori is over there. But his tail looks very quiet today.", "think", "bori", "curious"],
    ["bori", "안녕, 친구들아. 나는 지금 춤추고 싶은 마음이 별로 없어.", "Hello, friends. I don't really feel like dancing right now.", "wave", "alice", "sad"],
  ], { next: "ask" }),
  scene("empathy", "ask", "garden", "마음에 귀 기울여요", "Listen to a feeling", [
    ["alice", "보리야, 무슨 일이 있었어? 말하고 싶으면 내가 들어줄게.", "Bori, did something happen? If you feel like talking, I'll listen.", "think", "bori", "curious", words("괜찮아?", "Are you okay?")],
    ["bori", "아침에 쌓은 작은 탑이 무너졌어. 많이 속상했어.", "The little tower I built this morning fell down. I felt really upset.", "talk", "alice", "sad"],
    ["momo", "아, 네가 열심히 만든 거였구나. 그래서 마음이 무거웠네.", "Oh, you worked hard to make it. That's why your heart feels heavy.", "talk", "bori", "sad"],
    ["bori", "응. 바로 신나게 놀기는 어려워. 하지만 혼자는 싫어.", "Yes. It's hard to feel bouncy straight away. But I don't want to be alone.", "talk", "momo", "sad"],
    ["alice", "그럼 네 곁에 있을게. 조용히 앉을까, 천천히 걸을까?", "Then we'll stay beside you. Shall we sit quietly or take a gentle walk?", "offer", "bori", "curious"],
  ], { practice: words("괜찮아?", "Are you okay?"), choices: [choice("보리 옆에서 조용히 함께 있어요", "Sit quietly beside Bori", "sit", "bori"), choice("보리와 연못까지 천천히 걸어요", "Take a gentle walk with Bori", "walk", "bori")] }),
  scene("empathy", "sit", "garden", "말하지 않아도", "No words needed", [
    ["alice", "네 옆에 있을게. 지금 아무 말 안 해도 괜찮아.", "I'll stay right beside you. It's okay if you don't want to say anything.", "offer", "bori"],
    ["bori", "고마워. 친구가 옆에 있으니까 마음이 조금 덜 무거워.", "Thank you. Having a friend beside me makes my heart feel a little lighter.", "talk", "alice"],
    ["momo", "나는 조용히 꽃을 볼게. 저 작은 꽃은 고개를 끄덕이네.", "I'll quietly watch the flowers. That little one looks like it's nodding hello.", "think", "bori", "curious"],
    ["bori", "히히, 정말 그러네. 나도 꽃한테 살짝 인사할래.", "Hee hee, it does! I think I'll give the flower a little hello too.", "wave", "momo"],
    ["alice", "너의 웃음이 조금 돌아왔네. 천천히 돌아와도 괜찮아.", "A little bit of your smile came back. It can come back slowly.", "talk", "bori"],
  ], { next: "notice" }),
  scene("empathy", "walk", "pond", "천천히 걷는 마음", "A gentle little walk", [
    ["alice", "작은 발걸음으로 가자. 보리야, 네 속도에 맞출게.", "Let's take little steps. Bori, we'll go at your pace.", "walk", "bori"],
    ["momo", "물결이 동그랗게 퍼져. 우리 발소리도 작게 내 볼까?", "The ripples are making circles. Shall we make our footsteps quiet too?", "walk", "bori", "curious"],
    ["bori", "응, 또각또각. 물을 보니까 숨이 조금 편해졌어.", "Yes, tip-tap, tip-tap. Watching the water helps my breathing feel a little easier.", "walk", "alice"],
    ["alice", "속상한 마음이 아직 있어도 우리랑 같이 있어도 돼.", "You can still be with us, even while you're feeling upset.", "talk", "bori"],
    ["bori", "그 말이 좋아. 지금 내 마음 그대로 있어도 되는구나.", "I like that. I can be here with the feelings I have right now.", "talk", "alice"],
  ], { next: "notice" }),
  scene("empathy", "notice", "meadow", "함께할 방법", "A way to join in", [
    ["momo", "보리야, 춤을 꼭 추지 않아도 우리와 함께할 수 있어.", "Bori, you don't have to dance to be part of our game.", "offer", "bori"],
    ["bori", "정말? 큰 춤은 아직 싫지만 작은 일은 하고 싶어.", "Really? I don't want a big dance yet, but I'd like a little part.", "talk", "momo", "curious"],
    ["alice", "네가 시작 신호를 해 줄래? 아니면 나랑 작은 춤을 출래?", "Would you like to give us the starting signal? Or do a tiny dance with me?", "offer", "bori"],
    ["bori", "둘 다 괜찮겠다. 내가 편한 만큼만 하면 되는 거지?", "Both of those sound okay. I can do just as much as feels right for me?", "think", "alice", "curious"],
    ["momo", "물론이지! 우리 춤에는 조용한 친구 자리도 있어.", "Of course! Our dance has a place for a quiet friend too.", "wave", "bori"],
  ], { choices: [choice("보리에게 시작 신호를 맡겨요", "Let Bori give the starting signal", "signal", "bori"), choice("보리와 아주 작은 춤을 춰요", "Do a tiny dance with Bori", "dance", "alice")] }),
  scene("empathy", "signal", "meadow", "보리의 작은 신호", "Bori's little signal", [
    ["alice", "보리 선생님, 준비되면 시작이라고 말해 줘!", "Bori, you're our signal captain. Tell us to start whenever you're ready!", "wave", "bori"],
    ["bori", "음, 준비됐어. 하나, 둘, 시작! 아주 살살 추는 거야.", "Okay, I'm ready. One, two, start! Remember to make it a gentle dance.", "wave", "alice"],
    ["momo", "살살, 살살. 내 발도 오늘은 구름처럼 가벼워!", "Softly, softly. Today my paws are as light as little clouds!", "dance", "bori"],
    ["bori", "내 말에 맞춰 춰 주니까 나도 같이 노는 것 같아.", "When you dance to my signal, I feel like I'm playing with you too.", "talk", "momo"],
    ["alice", "당연하지! 보리가 있어야 우리 춤이 시작되잖아.", "Of course you are! Our dance starts because you're here with us.", "dance", "bori", "happy", words("같이 하자!", "Let's play together!")],
  ], { next: "reflect" }),
  scene("empathy", "dance", "meadow", "작고 조용한 춤", "A tiny quiet dance", [
    ["alice", "보리야, 우리 손만 살짝 흔들자. 작은 꽃처럼 말이야.", "Bori, let's just give our paws a little wiggle. Like tiny flowers in the breeze.", "dance", "bori"],
    ["bori", "이 정도면 나도 할 수 있어. 흔들, 흔들!", "This feels small enough for me. Wiggle, wiggle!", "dance", "alice"],
    ["momo", "나도 작은 춤을 출래. 큰 발로 아주 작은 춤!", "I'll do a tiny dance too. A very little dance with my very big paws!", "dance", "bori"],
    ["bori", "히히, 재미있다. 친구들이 내 마음에 맞춰 줬네.", "Hee hee, that's funny. My friends made room for how I was feeling.", "dance", "momo", "happy"],
    ["alice", "우리 함께 춤추니까 작은 움직임도 멋져 보여!", "When we dance together, even our tiniest movements look wonderful!", "dance", "bori", "happy", words("같이 하자!", "Let's play together!")],
  ], { next: "reflect" }),
  scene("empathy", "reflect", "garden", "조금 가벼워진 마음", "A lighter feeling", [
    ["owl", "얘들아, 서로의 마음에 맞춰서 놀고 있었구나.", "Little ones, I can see you're finding a way to play that feels right for everyone.", "wave", "alice"],
    ["bori", "처음에는 속상했어요. 친구들이 물어보고 기다려 줬어요.", "I was upset at first. My friends asked how I felt, and they waited with me.", "talk", "owl"],
    ["momo", "나는 보리가 무조건 신나면 좋겠다고 생각했어요. 하지만 물어봐야 했어요.", "I wanted Bori to feel bouncy straight away. But I needed to ask him what he wanted.", "think", "owl", "curious"],
    ["alice", "친구 마음을 내가 정할 수는 없으니까, 먼저 들어줄래요.", "I can't decide how my friend feels. So I'll listen to him first.", "talk", "bori"],
    ["bori", "다음에 앨리스가 조용한 날에는 내가 옆에 있어 줄게.", "Next time Alice has a quiet day, I'll be the friend who stays beside her.", "offer", "alice", "happy", words("내가 곁에 있어.", "I'm here for you.")],
  ], { next: "end", practice: words("내가 곁에 있어.", "I'm here for you.") }),
  scene("empathy", "end", "meadow", "모든 마음의 자리", "Room for every feeling", [
    ["alice", "보리야, 지금 마음은 어때? 오늘의 마지막으로 물어볼래.", "Bori, how is your heart feeling now? I'd like to ask one more time today.", "think", "bori", "curious"],
    ["bori", "조금 속상한 것도 남았지만, 따뜻한 기분이 더 커졌어.", "There's still a little sadness, but the warm feeling has grown much bigger.", "talk", "alice"],
    ["momo", "그 마음도 우리와 같이 가자. 모두 들어갈 만큼 넓어!", "That feeling can come along with us too. There's enough room for all of it!", "offer", "bori"],
    ["bori", "좋아. 친구들아, 오늘 내 말을 들어줘서 고마워.", "I'd like that. Friends, thank you for listening to me today.", "wave", "alice", "happy", words("고마워!", "Thank you!")],
    ["alice", "내일도 기쁜 마음, 조용한 마음, 모두 같이 만나자!", "Tomorrow, bring your bouncy feelings and your quiet feelings. We'll meet them all together!", "wave", "bori"],
  ]),
]);

const sharing = story("sharing", "모두의 둥근 춤", "A Dance for Everyone", "누구나 함께할 수 있게 놀이를 나눠요.", "Make space in the game so everyone can join the fun.", [
  scene("sharing", "hello", "meadow", "둘이 만든 춤", "A dance for two", [
    ["narrator", "오늘 초원에서는 친구들의 작은 춤잔치가 열려요.", "Today there's a little dance party in the meadow."],
    ["alice", "모모야, 내 손 잡아! 둘이 빙글 돌면 꽃처럼 보일 거야.", "Momo, take my paw! When we turn together, we'll look like a spinning flower.", "dance", "momo", "excited"],
    ["momo", "좋아! 왼쪽으로 한 번, 오른쪽으로 한 번. 우리 춤이야!", "Yes! A turn to the left, and a turn to the right. It's our very own dance!", "dance", "alice", "excited"],
    ["bori", "와, 멋지다. 나도 여기서 구경하고 있어도 될까?", "Wow, that looks lovely. Is it okay if I watch from over here?", "wave", "alice", "curious"],
    ["alice", "보리야! 구경만 하지 않아도 돼. 우리랑 같이 놀자.", "Bori! You don't have to just watch. Come and play with us.", "offer", "bori", "happy", words("같이 하자!", "Let's play together!")],
  ], { next: "space" }),
  scene("sharing", "space", "meadow", "세 번째 자리", "A third place", [
    ["bori", "그런데 너희는 둘이 손잡고 있잖아. 내 자리는 어디야?", "But you're holding paws as a pair. Where is the place for me?", "think", "alice", "curious"],
    ["momo", "음, 처음에는 두 명이 추는 춤으로 만들었어.", "Hmm. At first we made it as a dance for just two friends.", "think", "bori", "curious"],
    ["alice", "그럼 춤을 조금 바꿔 보자. 자리를 나누면 되잖아!", "Then let's change the dance a little. We can make room for another friend!", "offer", "momo"],
    ["momo", "셋이 둥글게 서도 되고, 둘씩 번갈아 추면 어떨까?", "We could make a circle of three, or take turns dancing with a partner.", "think", "alice", "curious"],
    ["bori", "나는 둘 다 해 보고 싶어! 먼저 어떤 춤을 출까?", "I'd love to try both of those! Which dance shall we do first?", "cheer", "alice", "excited"],
  ], { practice: words("같이 하자!", "Let's play together!"), choices: [choice("셋이 둥글게 서서 춤춰요", "Make a dancing circle of three", "circle", "bori"), choice("보리와 먼저 추고 모모와 차례를 바꿔요", "Dance with Bori, then swap with Momo", "turns", "bori")] }),
  scene("sharing", "circle", "meadow", "커다란 동그라미", "A bigger circle", [
    ["alice", "내가 조금 옆으로 갈게. 보리야, 여기 사이로 들어와!", "I'll move over a little. Bori, come into this space between us!", "offer", "bori"],
    ["bori", "여기구나! 내 양쪽에 친구가 있어서 정말 든든해.", "Here's my place! I have a friend on both sides. That feels lovely.", "dance", "alice"],
    ["momo", "하나, 둘, 셋! 우리 동그라미가 아까보다 커졌어.", "One, two, three! Our dancing circle is bigger than it was before.", "dance", "bori", "excited"],
    ["alice", "웃음소리도 커졌네. 보리 꼬리가 박자를 맞춰 줘!", "Our giggles got bigger too. Bori's tail is keeping the beat for us!", "dance", "bori", "excited"],
    ["bori", "꼬리도 초대해 줘서 고마워! 흔들, 흔들, 짠!", "Thank you for inviting my tail too! Wiggle, wiggle, ta-da!", "cheer", "momo"],
  ], { next: "another" }),
  scene("sharing", "turns", "meadow", "차례로 함께", "Taking turns together", [
    ["alice", "보리야, 이번에는 나랑 추자. 모모는 시작 신호를 해 줘!", "Bori, dance with me this time. Momo, would you give us the starting signal?", "dance", "bori"],
    ["momo", "좋아! 하나, 둘, 시작! 이제는 내가 보리랑 출 차례야.", "Okay! One, two, start! And now it's my turn to dance with Bori.", "wave", "bori", "excited"],
    ["bori", "친구가 바뀔 때마다 춤도 달라지네. 이것도 재미있어!", "Each time I change partners, the dance changes too. This is so much fun!", "dance", "momo", "excited"],
    ["alice", "나는 손뼉으로 응원할게. 기다리는 동안에도 함께 놀 수 있네.", "I'll clap along for you. I can be part of the fun while I wait for my turn.", "cheer", "momo"],
    ["momo", "이제 앨리스 차례! 우리 모두 한 번씩 주인공이 되는 거야.", "Now it's Alice's turn! Every one of us gets a turn in the middle.", "offer", "alice", "happy", words("네 차례야!", "Your turn!")],
  ], { next: "another" }),
  scene("sharing", "another", "cottage", "새로운 친구 자리", "Another place to share", [
    ["owl", "춤잔치가 정말 즐겁구나. 나도 작은 박자를 보태도 될까?", "What a lovely dance party. Could I add a little rhythm too?", "wave", "alice"],
    ["momo", "네! 그런데 할머니는 어떤 움직임이 편하세요?", "Yes! What sort of movement feels comfortable for you, Grandma?", "think", "owl", "curious"],
    ["owl", "나는 천천히 날개를 흔드는 게 좋단다. 너희가 골라 주겠니?", "I like gently waving my wings. Would you help me find a part in the dance?", "wave", "momo"],
    ["bori", "할머니를 우리 춤 안으로 모실까? 아니면 옆에서 같이 흔들까?", "Shall we invite Grandma into our dance, or wave our paws beside her?", "think", "alice", "curious"],
    ["alice", "모두 편안하게 같이할 수 있게 우리 놀이를 또 나눠 보자.", "Let's share our game again, so everyone can join in comfortably.", "offer", "owl"],
  ], { choices: [choice("할머니를 가운데 모시고 살살 춤춰요", "Make a gentle dance around Grandma", "grandma", "owl"), choice("할머니 옆에서 날갯짓 춤을 배워요", "Learn Grandma's wing dance beside her", "wings", "owl")] }),
  scene("sharing", "grandma", "cottage", "따뜻한 춤의 가운데", "The heart of the dance", [
    ["alice", "할머니, 가운데로 오세요. 우리 모두 천천히 움직일게요.", "Grandma, come into the middle. We'll all move nice and slowly.", "offer", "owl"],
    ["owl", "어머, 꽃송이 안에 앉은 것 같구나. 참 포근해.", "Oh, it feels like sitting inside a little flower. How cosy!", "wave", "alice"],
    ["bori", "우리 꽃은 자꾸 커져요. 친구가 오면 꽃잎이 늘어나요!", "Our flower keeps growing. Whenever a friend joins us, it gets another petal!", "dance", "owl", "excited"],
    ["momo", "살살, 빙글. 할머니의 날개와 내 발을 맞춰 볼래.", "Softly, round we go. I'll match my paws to Grandma's gentle wings.", "dance", "owl"],
    ["alice", "혼자만 아는 춤보다 다 같이 만드는 춤이 더 좋아!", "I like a dance we make together more than one I keep all to myself!", "dance", "bori"],
  ], { next: "reflect" }),
  scene("sharing", "wings", "cottage", "할머니의 날갯짓", "Grandma's wing dance", [
    ["alice", "할머니 옆에 서 볼게요. 날갯짓 춤을 보여 주세요!", "We'll stand beside you, Grandma. Please show us your wing dance!", "walk", "owl", "curious"],
    ["owl", "위로 천천히, 아래로 천천히. 바람을 안아 주는 거야.", "Slowly up, and slowly down. Imagine you're giving the breeze a hug.", "dance", "alice"],
    ["momo", "나는 날개가 없지만 팔로 할 수 있어요! 위로, 아래로!", "I don't have wings, but I can use my paws! Up, and down!", "dance", "owl", "excited"],
    ["bori", "나는 귀도 조금 움직여 볼래. 할머니, 저 잘하고 있나요?", "I'll try wiggling my ears too. Grandma, am I doing it right?", "dance", "owl", "curious"],
    ["owl", "너희만의 움직임이면 충분하단다. 나누니 새로운 춤이 생겼구나.", "Your very own movements are just right. Sharing has given us a brand-new dance.", "wave", "bori"],
  ], { next: "reflect" }),
  scene("sharing", "reflect", "meadow", "놀이도 나눌 수 있어요", "Sharing a game", [
    ["momo", "처음에는 우리 둘만의 춤이었는데, 이제 모두의 춤이 됐어.", "At first the dance belonged to just us two. Now it belongs to all of us.", "talk", "alice"],
    ["bori", "나는 구경만 할 줄 알았어. 초대받으니까 마음이 폴짝 뛰었어.", "I thought I'd only get to watch. Being invited made my heart do a happy little jump.", "cheer", "alice"],
    ["alice", "나누는 건 물건만이 아니네. 자리도, 차례도, 놀이도 나눌 수 있어.", "We can share more than things. We can share a place, a turn, and a game.", "talk", "momo"],
    ["momo", "다음에 누가 구경하고 있으면 내가 먼저 같이 하자고 할래.", "Next time I see someone watching, I'll be the first to say come and join us.", "offer", "bori", "happy", words("같이 하자!", "Let's play together!")],
    ["bori", "좋아! 내가 그 친구 자리도 만들어 줄게. 조금만 비켜서면 돼.", "Yes! I'll make a place for that friend too. All it takes is moving over a little.", "offer", "momo"],
  ], { next: "end", practice: words("네 차례야!", "Your turn!") }),
  scene("sharing", "end", "meadow", "우리 모두의 짠", "Everyone's ta-da", [
    ["alice", "마지막에는 모두 자기만의 춤을 보여 주자. 모모 먼저!", "For our last dance, let's each show our own little move. Momo, you go first!", "offer", "momo", "happy", words("네 차례야!", "Your turn!")],
    ["momo", "나는 둥근 발 춤! 보리야, 이제 네 차례야!", "Here's my round-paw dance! Bori, now it's your turn!", "dance", "bori", "excited"],
    ["bori", "나는 꼬리 흔들 춤! 앨리스야, 네 귀 춤도 보여 줘!", "Here's my wiggly-tail dance! Alice, show us your ear dance too!", "dance", "alice", "excited"],
    ["alice", "귀가 쫑긋, 마음도 쫑긋! 우리 모두 함께, 짠!", "Ears up, happy hearts up! And now all together, ta-da!", "cheer", "momo", "excited"],
    ["owl", "나눌수록 즐거움이 커지는 춤이구나. 모두 참 멋졌단다.", "What a dance! The more you shared it, the bigger the fun grew. You were all wonderful.", "wave", "alice"],
  ]),
]);

const honesty = story("honesty", "작은 실수, 용기 있는 말", "A Little Mistake, A Brave Word", "실수를 숨기지 않고 함께 고칠 용기를 배워요.", "Find the courage to tell the truth and make things right together.", [
  scene("honesty", "hello", "garden", "꽃밭의 약속", "A garden promise", [
    ["narrator", "친구들이 꽃밭 옆에서 놀이를 준비하고 있어요.", "The friends are getting ready to play beside the flower garden."],
    ["momo", "이 작은 꽃자리는 내가 예쁘게 정리했어. 밟지 않게 살살 가자.", "I made this little flower patch all neat. Let's walk gently around it.", "offer", "alice"],
    ["alice", "알겠어! 이 길로 살짝 뛰면 되겠지? 폴짝!", "Okay! I can do one little hop along this path, can't I? Hop!", "cheer", "momo", "excited"],
    ["bori", "앗, 앨리스야. 네 발이 꽃자리 가장자리에 닿았어.", "Oh, Alice. Your paw bumped the edge of the flower patch.", "think", "alice", "surprised"],
    ["alice", "어떡하지? 모모가 정리한 게 흐트러졌네. 가슴이 두근거려.", "Oh no. I messed up the place Momo made neat. My heart is beating fast.", "think", "bori", "sad"],
  ], { next: "brave" }),
  scene("honesty", "brave", "garden", "용기 있는 첫마디", "A brave first word", [
    ["bori", "일부러 그런 건 아니었지? 하지만 모모에게 알려 주는 게 좋겠어.", "You didn't mean to do it, did you? But I think we should tell Momo.", "talk", "alice", "curious"],
    ["alice", "응, 일부러는 아니었어. 모모가 속상해하면 어떡하지?", "No, I didn't mean to. What if Momo feels upset with me?", "think", "bori", "sad"],
    ["bori", "속상할 수는 있어. 그래도 사실을 알면 함께 고칠 수 있어.", "He might feel upset. But when he knows what happened, we can fix it together.", "offer", "alice"],
    ["alice", "맞아. 내가 한 일을 말할래. 혼자 말할까, 같이 가 달라고 할까?", "You're right. I'll tell him what I did. Shall I go myself, or ask you to come with me?", "think", "bori", "curious"],
    ["bori", "어느 쪽이든 네가 진짜 있었던 일을 말하면 돼. 나는 네 친구야.", "Either way, you can tell him what really happened. I'm here as your friend.", "offer", "alice"],
  ], { practice: words("내가 그랬어.", "I did it."), choices: [choice("앨리스가 모모에게 직접 말해요", "Alice tells Momo herself", "tell", "alice"), choice("보리와 함께 가서 앨리스가 말해요", "Bori comes along while Alice tells Momo", "support", "bori")] }),
  scene("honesty", "tell", "garden", "내가 그랬어", "I did it", [
    ["alice", "모모야, 내가 뛰다가 네 꽃자리를 흐트러뜨렸어. 미안해.", "Momo, I bumped your flower patch when I hopped. I'm sorry.", "walk", "momo", "sad", words("미안해.", "I'm sorry.")],
    ["momo", "아, 그랬구나. 열심히 만든 거라 조금 속상해.", "Oh, that's what happened. I worked hard on it, so I feel a little upset.", "talk", "alice", "sad"],
    ["alice", "응, 네 마음을 알겠어. 바람 때문이라고 말하지 않을래. 내가 했어.", "I understand. I won't say the wind did it. I was the one who did it.", "talk", "momo", "sad"],
    ["momo", "사실을 말해 줘서 고마워. 이제 무엇을 고쳐야 할지 알겠어.", "Thank you for telling me the truth. Now I know what we need to fix.", "talk", "alice"],
    ["alice", "다음에는 길에서 천천히 걸을게. 지금은 어떻게 도와주면 좋을까?", "Next time I'll walk slowly on the path. How can I help you right now?", "offer", "momo"],
  ], { next: "repair" }),
  scene("honesty", "support", "garden", "친구 곁에서 말해요", "A friend beside me", [
    ["bori", "모모야, 앨리스가 할 말이 있대. 나는 옆에 있을게.", "Momo, Alice has something to tell you. I'll stay here beside her.", "walk", "momo"],
    ["alice", "모모야, 내가 뛰다가 네 꽃자리를 흐트러뜨렸어. 미안해.", "Momo, I bumped your flower patch when I hopped. I'm sorry.", "talk", "momo", "sad", words("미안해.", "I'm sorry.")],
    ["momo", "그래서 달라져 있었구나. 조금 속상하지만 말해 줘서 고마워.", "That's why it looked different. I feel a little upset, but thank you for telling me.", "talk", "alice", "sad"],
    ["bori", "앨리스가 직접 말하려고 용기를 냈어. 우리 함께 고쳐도 될까?", "Alice found the courage to tell you herself. Could we help you fix it together?", "offer", "momo"],
    ["alice", "네가 옆에 있어서 말할 힘이 났어. 이제 내가 도와줄게, 모모야.", "Having you beside me helped me speak. Now I'd like to help you, Momo.", "offer", "momo"],
  ], { next: "repair" }),
  scene("honesty", "repair", "garden", "말 다음의 행동", "What comes after sorry", [
    ["momo", "꽃자리 가장자리를 다시 정리하면 돼. 천천히 하면 괜찮아.", "We can make the edge of the flower patch neat again. We just need to go slowly.", "think", "alice", "curious"],
    ["alice", "미안하다고 말한 다음에는 고치는 것도 함께하고 싶어.", "After saying sorry, I want to help make things right too.", "offer", "momo"],
    ["bori", "모모가 방법을 알려 주면 우리가 옆에서 도울 수 있겠네.", "Momo can show us how, and we can help right beside him.", "offer", "momo"],
    ["momo", "앨리스랑 함께 정리해도 좋고, 보리가 길을 안내해도 좋겠어.", "Alice could help me tidy the edge, or Bori could show everyone the safe path.", "think", "bori", "curious"],
    ["alice", "둘 다 다시 아끼는 방법이네. 어떤 일부터 해 볼까?", "Both of those are ways to take care of it again. Which one shall we do first?", "think", "momo", "curious"],
  ], { choices: [choice("모모와 꽃자리를 함께 정리해요", "Help Momo tidy the flower patch", "tidy", "momo"), choice("보리와 안전한 길을 보여 줘요", "Show the gentle walking path with Bori", "path", "bori")] }),
  scene("honesty", "tidy", "garden", "함께 다시 만들어요", "Making it right together", [
    ["alice", "모모야, 여기부터 할까? 네가 만든 모양을 알려 줘.", "Momo, shall I start here? Please show me the shape you wanted to make.", "offer", "momo", "curious"],
    ["momo", "응, 동그랗게 만들어 줘. 아주 조금씩 하면 돼.", "Yes, make it round like this. Just a little bit at a time.", "offer", "alice"],
    ["bori", "나는 옆에서 응원할게. 조금씩 예쁜 모양이 돌아오고 있어!", "I'll cheer you on from here. The lovely shape is coming back little by little!", "cheer", "alice"],
    ["alice", "이제 끝났어! 모모야, 네 마음도 조금 나아졌으면 좋겠다.", "There, we're finished! Momo, I hope your heart feels a little better too.", "talk", "momo"],
    ["momo", "같이 고쳐 주니 좋아. 네가 내 꽃자리를 아껴 주는 게 느껴져.", "It feels good that you helped. I can tell you care about my flower patch.", "talk", "alice"],
  ], { next: "reflect" }),
  scene("honesty", "path", "garden", "살살 걷는 길", "The gentle walking path", [
    ["alice", "보리야, 우리 길은 이쪽이야. 꽃자리에서 조금 떨어져 걷자.", "Bori, our path is over here. Let's walk a little way away from the flowers.", "walk", "bori"],
    ["bori", "내 발이 갈 곳을 보면서 걸으니까 부딪히지 않네.", "When I watch where my paws are going, I don't bump into anything.", "walk", "alice"],
    ["momo", "고마워. 나는 그동안 꽃자리를 정리했어. 이제 같이 걸어도 되겠다.", "Thank you. I tidied the patch while you did that. Now we can walk together.", "walk", "alice"],
    ["alice", "모모야, 다음에도 네가 아끼는 곳 옆에서는 천천히 할게.", "Momo, next time I'm beside something you care about, I'll remember to go gently.", "talk", "momo"],
    ["bori", "작은 실수에서 새로운 길을 배웠네. 우리 같이 따라가 보자!", "Our little mistake helped us learn a new path. Let's follow it together!", "wave", "momo"],
  ], { next: "reflect" }),
  scene("honesty", "reflect", "cottage", "두근거려도 말해요", "Speaking with a fluttery heart", [
    ["owl", "친구들아, 꽃밭에서 무슨 일이 있었니?", "Friends, what happened in the garden today?", "think", "alice", "curious"],
    ["alice", "제가 실수했어요. 처음에는 숨기고 싶었지만 사실대로 말했어요.", "I made a mistake. At first I wanted to hide it, but I told the truth.", "talk", "owl"],
    ["momo", "저는 조금 속상했어요. 그래도 앨리스가 함께 고쳐 줘서 좋았어요.", "I felt a little upset. But it helped when Alice worked with me to make things right.", "talk", "owl"],
    ["owl", "실수는 생길 수 있단다. 사실을 말하면 다음 일을 함께 찾을 수 있지.", "Mistakes can happen. Telling the truth helps you find the next step together.", "talk", "alice"],
    ["alice", "말할 때 두근거려도, 솔직하게 말하는 용기를 다시 내 볼래요.", "Even if my heart feels fluttery, I'll try to find that brave, honest voice again.", "cheer", "owl"],
  ], { next: "end", practice: words("미안해.", "I'm sorry.") }),
  scene("honesty", "end", "meadow", "다시 함께 놀아요", "Ready to play again", [
    ["bori", "앨리스야, 이제 마음은 어때? 아까보다 편해 보여.", "Alice, how do you feel now? You look a little more comfortable than before.", "think", "alice", "curious"],
    ["alice", "응. 숨기지 않고 이야기해서, 무엇을 하면 될지 알게 됐어.", "I do. Because I didn't hide what happened, I knew what I could do next.", "talk", "bori"],
    ["momo", "우리 또 놀자. 이번에는 넓은 초원에서 천천히 춤추는 거야.", "Let's play again. This time we'll do a gentle dance in the wide, open meadow.", "offer", "alice"],
    ["alice", "좋아! 모모야, 기다려 주고 같이 고쳐 줘서 고마워.", "I'd love that! Momo, thank you for waiting and helping me make things right.", "dance", "momo", "happy", words("고마워!", "Thank you!")],
    ["bori", "우리의 용기 있는 친구에게 작은 춤을! 하나, 둘, 짠!", "A little dance for our brave, honest friend! One, two, ta-da!", "cheer", "alice", "excited"],
  ]),
]);

const patience = story("patience", "천천히 피는 즐거움", "Good Things Take a Little Time", "기다리는 동안 할 수 있는 작은 일을 찾아요.", "Find little things to do while waiting and trying again.", [
  scene("patience", "hello", "garden", "아직 닫힌 꽃", "A sleepy flower", [
    ["narrator", "친구들이 꽃밭에서 아직 활짝 피지 않은 꽃을 발견했어요.", "In the garden, the friends find a flower that hasn't opened all the way yet."],
    ["bori", "앨리스야, 이 꽃은 언제 피어? 지금 보고 싶어!", "Alice, when will this flower open? I want to see it right now!", "think", "alice", "excited"],
    ["alice", "음, 내가 빨리 피라고 말하면 될까? 꽃아, 일어나!", "Hmm. Would it help if I asked it to hurry? Little flower, wake up!", "wave", "bori", "curious"],
    ["momo", "꽃은 자기 속도로 피는 것 같아. 우리도 기다려야 하나 봐.", "I think flowers open at their own pace. It looks like we'll need to wait.", "think", "alice", "curious"],
    ["bori", "기다리는 건 발이 근질근질해. 계속 가만히 있어야 해?", "Waiting makes my paws feel wriggly. Do we have to stay completely still?", "think", "momo", "sad"],
  ], { next: "wait" }),
  scene("patience", "wait", "garden", "기다리는 동안", "While we wait", [
    ["owl", "기다릴 때도 할 수 있는 일이 있단다. 꽃을 잡아당기지는 말고 말이야.", "There are things you can do while you wait. Just don't pull on the little flower.", "talk", "bori"],
    ["bori", "그럼 꽃이 준비될 때까지 내가 편안해질 일을 찾으면 되겠네요?", "So I can find something that helps me feel comfortable while the flower gets ready?", "think", "owl", "curious"],
    ["alice", "응! 우리 천천히 숨을 쉬어 볼까? 꽃 향기를 맡는 것처럼.", "Yes! Shall we take a slow breath, as if we're smelling a lovely flower?", "think", "bori", "happy", words("천천히.", "Slowly.")],
    ["momo", "아니면 연못까지 걸었다가 다시 와도 좋아. 기다림 산책이야.", "Or we could walk to the pond and come back again. A little waiting walk.", "offer", "bori"],
    ["bori", "가만히 참기만 하는 게 아니구나. 먼저 무엇을 해 볼까?", "So waiting doesn't mean doing nothing at all. What shall we try first?", "think", "alice", "curious"],
  ], { practice: words("천천히.", "Slowly."), choices: [choice("친구들과 천천히 숨 쉬어요", "Take slow breaths with your friends", "breathe", "alice"), choice("모모와 기다림 산책을 해요", "Take a waiting walk with Momo", "walk", "momo")] }),
  scene("patience", "breathe", "garden", "꽃처럼 숨 쉬기", "A flower breath", [
    ["alice", "꽃 향기를 맡듯 숨을 들이쉬고, 바람처럼 부드럽게 내쉬자.", "Breathe in as if you're smelling a flower, then let it out gently like the breeze.", "think", "bori"],
    ["momo", "들이쉬고, 내쉬고. 내 어깨가 조금 내려갔어.", "In, and out. My shoulders have dropped down a little.", "think", "alice"],
    ["bori", "한 번 더 해 볼래. 내 발도 아까보다 덜 바빠졌어.", "I'd like to try it once more. My paws feel less busy than before.", "think", "alice"],
    ["alice", "꽃은 아직 준비 중이네. 우리도 급하게 끝내지 않아도 돼.", "The flower is still getting ready. We don't have to hurry to finish either.", "talk", "bori"],
    ["bori", "좋아. 숨을 쉬면서 기다릴 수 있다는 걸 기억할래.", "Okay. I'll remember that I can take gentle breaths while I wait.", "wave", "alice"],
  ], { next: "try" }),
  scene("patience", "walk", "pond", "기다림 산책", "A little waiting walk", [
    ["momo", "보리야, 작은 걸음으로 나를 따라와. 주변에서 초록을 찾아보자.", "Bori, follow me with little steps. Let's look for green things along the way.", "walk", "bori"],
    ["bori", "초록 잎 하나, 초록 풀 둘! 연못에 비친 나무도 초록이야.", "One green leaf, two green grasses! The tree in the pond looks green too.", "walk", "momo", "excited"],
    ["alice", "나는 반짝이는 물을 찾았어. 기다리는 길에도 볼 게 많네.", "I found some sparkling water. There are lots of things to notice while we wait.", "walk", "bori"],
    ["bori", "꽃 생각만 했을 때보다 마음이 덜 급해. 산책하길 잘했어.", "I feel less rushed than when I was only thinking about the flower. I'm glad we walked.", "talk", "momo"],
    ["momo", "이제 천천히 돌아가자. 꽃은 자기 시간을 보내고 있을 거야.", "Now let's go back gently. The flower has been having its own little time too.", "walk", "bori"],
  ], { next: "try" }),
  scene("patience", "try", "meadow", "처음 해 보는 춤", "A brand-new dance", [
    ["alice", "기다리는 동안 새 춤을 만들어 볼까? 한 걸음, 멈춤, 빙글!", "Shall we make a new dance while we wait? One step, a pause, and a turn!", "dance", "bori", "excited"],
    ["bori", "앗, 나는 순서가 자꾸 헷갈려. 모모처럼 잘 안 돼.", "Oh, I keep mixing up the order. I can't do it like Momo yet.", "think", "momo", "sad"],
    ["momo", "나도 처음에는 헷갈렸어. 한꺼번에 다 하지 않아도 돼.", "I mixed it up at first too. You don't have to do all of it at once.", "offer", "bori"],
    ["alice", "보리랑 한 동작씩 연습할까? 아니면 쉬운 춤을 같이 만들까?", "Shall we practise one move at a time with Bori, or make an easier dance together?", "think", "momo", "curious"],
    ["bori", "조금씩 다시 해 보고 싶어. 친구들과 하면 할 수 있을 것 같아.", "I'd like to try again a little at a time. I think I can do it with my friends.", "offer", "alice", "happy", words("다시 해 보자!", "Let's try again!")],
  ], { choices: [choice("모모와 한 동작씩 연습해요", "Practise one move at a time with Momo", "practice", "momo"), choice("보리와 쉬운 춤을 새로 만들어요", "Make an easier dance with Bori", "simple", "bori")] }),
  scene("patience", "practice", "meadow", "한 동작씩", "One little move", [
    ["momo", "먼저 한 걸음만 해 보자. 나랑 같이, 하나!", "Let's start with just one step. Do it with me. One!", "walk", "bori"],
    ["bori", "하나! 이건 됐어. 다음은 멈추는 거였지?", "One! I did that part. The next bit was a pause, wasn't it?", "think", "momo", "curious"],
    ["alice", "맞아, 잠깐 멈춰. 잘 기다렸어! 이제 아주 살짝 돌아 보자.", "That's right, a little pause. You waited well! Now try a very gentle turn.", "dance", "bori"],
    ["bori", "빙글! 이번에는 순서를 알겠어. 천천히 하니까 되네!", "Turn! This time I remembered the order. Going slowly helped me do it!", "dance", "alice", "excited"],
    ["momo", "처음부터 빨리할 필요는 없었네. 한 동작씩 배운 거야.", "There was no need to rush at the beginning. You learned one little move at a time.", "cheer", "bori"],
  ], { next: "return" }),
  scene("patience", "simple", "meadow", "우리 속도의 춤", "A dance at our pace", [
    ["alice", "보리야, 네가 편한 동작을 골라 줘. 거기서 시작하자.", "Bori, choose a move that feels easy for you. We'll start from there.", "offer", "bori"],
    ["bori", "손을 흔드는 건 좋아! 한 번 흔들고, 잠깐 기다리자.", "I like waving my paws! One little wave, and then a little wait.", "wave", "alice"],
    ["momo", "흔들, 기다림! 이 춤에는 조용한 자리도 있네.", "Wave, and wait! This dance has a lovely quiet space in it too.", "dance", "bori"],
    ["bori", "내가 만든 춤을 친구들이 같이 해 주니까 자신이 생겨!", "When my friends do the dance I made, I feel brave enough to keep trying!", "dance", "momo", "excited"],
    ["alice", "천천히 바꿔 가면 되겠네. 다음에는 작은 한 걸음도 넣어 보자.", "We can change it slowly as we go. Next time, let's add one tiny step.", "dance", "bori"],
  ], { next: "return" }),
  scene("patience", "return", "garden", "다시 만난 꽃", "Hello again, flower", [
    ["bori", "우리 꽃을 다시 보러 가자. 이번에는 살살 걸어갈래.", "Let's go and see our flower again. This time I'll walk there gently.", "walk", "alice"],
    ["alice", "아직 활짝 피지는 않았네. 그렇지만 조금 기다릴 수 있어.", "It hasn't opened all the way yet. But we can wait a little longer.", "think", "bori", "curious"],
    ["momo", "꽃이 오늘 다 피지 않아도 괜찮아. 내일 또 만나면 되지.", "It's okay if it doesn't open fully today. We can come and see it tomorrow.", "talk", "bori"],
    ["bori", "응! 기다리는 동안 숨도 쉬고, 산책도 하고, 춤도 배웠잖아.", "Yes! While we waited, we found gentle breaths, little walks, and a dance to learn.", "cheer", "alice"],
    ["owl", "꽃에도 너희에게도 시간이 필요하단다. 오늘 참 잘 기다려 줬구나.", "Flowers need time, and so do little friends. You found lovely ways to wait today.", "wave", "bori"],
  ], { next: "end", practice: words("다시 해 보자!", "Let's try again!") }),
  scene("patience", "end", "meadow", "내일 또 만나", "See you tomorrow", [
    ["alice", "오늘 가장 기억하고 싶은 건 뭐야, 보리야?", "Bori, what's the thing you'd most like to remember from today?", "think", "bori", "curious"],
    ["bori", "빨리 안 된다고 그만두지 않아도 된다는 거! 조금 쉬고 다시 할래.", "That I don't have to give up when something takes time! I can rest, then try again.", "cheer", "alice", "excited"],
    ["momo", "나는 친구가 기다릴 때 옆에 있어 줄래. 함께면 덜 심심하니까.", "I'll stay beside a friend who's waiting. Waiting feels less lonely when we're together.", "offer", "bori"],
    ["bori", "고마워! 꽃아, 너도 천천히 해. 내일 또 인사하러 올게!", "Thank you! Little flower, take your time too. We'll come and say hello again tomorrow!", "wave", "alice"],
    ["alice", "우리도 천천히 자라고 있어. 내일도 한 걸음씩 같이 가자!", "We're growing a little at a time too. Tomorrow we'll take another little step together!", "wave", "momo", "happy", words("천천히.", "Slowly.")],
  ]),
]);

/** Authored once and shipped with the app: starting these stories never calls a model. */
export const STORIES: KayStory[] = [kindness, empathy, sharing, honesty, patience];
