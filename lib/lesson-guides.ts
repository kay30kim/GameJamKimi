import type { OpeningId } from "./openings";

/**
 * What each preset lesson means for a 3–6 year old, so the model builds the story around it
 * instead of falling back to generic helping. Ids match components/tales/lessons.ts.
 * A custom lesson has no guide; the prompt asks the model to work one out.
 */
export interface LessonGuide {
  /** One sentence a young child understands. */
  meaning: string;
  /** Concrete things Alice can do on stage that show the lesson. */
  looksLike: string;
  /** The understandable, never-mean pull the other way. The second choice comes from here. */
  temptation: string;
  /** Close to what a character says at the ending, in the narration language. */
  kidPhrase: string;
  /** Topic-specific limits that take precedence over general story and choice rules. */
  guardrails?: string;
  /** Openings whose situation needs this lesson. The client picks one of these at random. */
  openings: readonly OpeningId[];
}

export const LESSON_GUIDES: Record<string, LessonGuide> = {
  kindness: {
    meaning: "Being kind means noticing someone who needs help and choosing to help them.",
    looksLike: "stopping what you're doing to help someone up, carrying something for them, cheering them on",
    temptation: "keep playing or hurry on, because helping takes time",
    kidPhrase: "Helping made us both happy!",
    openings: ["duck_bank", "spilled_apples", "sunset_home", "thirsty_garden", "balloon"],
  },
  empathy: {
    meaning: "Empathy means noticing how someone else feels and caring about that feeling.",
    looksLike: "asking \"How do you feel?\", sitting close to someone who is sad, saying \"I feel that way sometimes too\"",
    temptation: "try to fix things fast, change the subject, or say \"It's not a big deal\" without asking how they feel",
    kidPhrase: "I listened, and now I know how you feel.",
    openings: ["new_friend", "race", "lost_book", "flower_crown", "quiet_duck"],
  },
  sharing: {
    meaning: "Sharing means letting someone else use or have some of what you have.",
    looksLike: "breaking cookies in half, taking turns with the ball, holding the umbrella over two friends",
    temptation: "keep the thing because Alice wants it too and had it first",
    kidPhrase: "When we share, everyone gets some!",
    openings: ["cookies", "rain_umbrella", "slide_turns", "new_ball"],
  },
  honesty: {
    meaning: "Honesty means telling the truth, even when you made a mistake.",
    looksLike: "saying \"I did it, I'm sorry\", giving back something that isn't yours, telling a grown-up what really happened",
    temptation: "stay quiet or say \"I don't know\" because Alice is worried about getting in trouble",
    kidPhrase: "Telling the truth made my tummy feel better.",
    openings: ["broken_flowers", "found_ball", "saved_apple"],
  },
  patience: {
    meaning: "Patience means waiting calmly when something takes time.",
    looksLike: "waiting your turn, counting slowly, finding something calm to do while you wait",
    temptation: "grab it now, cut in line, or give up because waiting feels too long",
    kidPhrase: "Waiting was hard, but it was worth it!",
    openings: ["cookies_baking", "no_wind", "slide_turns"],
  },
  bravery: {
    meaning: "Being brave means trying something even when you feel a little scared.",
    looksLike: "taking a deep breath and trying, saying \"I feel scared, but I'll try\", asking to join a game",
    temptation: "say \"Maybe another day\" and walk away, because it feels scary",
    kidPhrase: "I felt scared, and I tried anyway!",
    openings: ["big_slide", "stepping_stones", "shy_to_ask"],
  },
  gratitude: {
    meaning: "Gratitude means noticing when someone does something nice for you and thanking them.",
    looksLike: "saying \"Thank you for…\", making a small gift, hugging the helper, telling others what the helper did",
    temptation: "run off to enjoy the nice thing and forget who made it happen",
    kidPhrase: "Thank you for helping me!",
    openings: ["kite_fixed", "flower_gift", "birthday", "umbrella_lent"],
  },
  teamwork: {
    meaning: "Teamwork means friends each doing a part so they can do something together.",
    looksLike: "sharing the jobs, saying \"You hold it, I'll pull\", cheering each other on",
    temptation: "try to do it all alone, or let someone else do all the work",
    kidPhrase: "We did it together!",
    openings: ["kite_tree", "picnic_prep", "spilled_apples", "thirsty_garden"],
  },
  body_safety: {
    meaning: "My body belongs to me, and I can choose what feels comfortable and ask for help.",
    looksLike: "asking before a hug and waiting for permission, happily accepting a no and offering a wave, stopping a tickle game immediately when someone says stop, saying private parts are private, asking a trusted grown-up for help",
    temptation: "feel unsure which words to use or want a little time before asking for help; never treat saying no, changing one's mind, or declining touch as the wrong choice",
    kidPhrase: "My body is mine. I can say stop and ask for help.",
    guardrails: "Keep this gentle and suitable for ages 3–6: body autonomy, permission, privacy, and help. No adult sexual acts, explicit descriptions, exposure, secret-keeping scenarios, or frightening strangers. Refusal and changing one's mind are always valid; nobody becomes sad, guilty, disappointed, or less friendly because a child declines touch. Stop immediately at no or stop, without persuasion. Offer two safe choices, such as saying no or asking for help; never contrast consent with disobedience. A child can ask a trusted grown-up about any uncomfortable feeling, even when friends could handle it. If one grown-up does not listen or help, tell another trusted grown-up until someone helps; adults are not always right, and it is never the child's fault. Keep all characters covered and teach privacy through calm words with Grandma Owl; never show private body parts. Use existing supported gestures and dialogue rather than inventing a tickling animation.",
    openings: ["ask_before_hug", "tickle_stop", "body_privacy_help"],
  },
  table_manners: {
    meaning: "Mealtimes feel comfortable when we ask kindly, take turns, and listen to our bodies.",
    looksLike: "asking \"May I have an apple, please?\", waiting for a turn with the cookies, finishing chewing and swallowing before speaking, sitting calmly for a picnic, saying \"No thank you\" or \"I'm full\" when needed",
    temptation: "reach for a cookie before asking or rush to tell a story before finishing a mouthful; never make hunger, fullness, food preferences, or refusing food the wrong choice",
    kidPhrase: "Please and thank you make our picnic friendly!",
    guardrails: "Use a gentle picnic on the meadow path or near the bench with only supported apple or cookies props. No kitchen, dining table, dishes, utensils, or invented eating animations; show sitting, waiting, asking, and handing over food with supported beats, and mention chewing and swallowing in simple dialogue when relevant. Never pressure a child to taste food, take more bites, finish a plate, or ignore hunger or fullness. No food shaming, good-food/bad-food labels, rewards for eating, or guilt about waste. Declining food and asking for more when hungry are both valid. Teach calmly asking please, waiting for a turn, swallowing before speaking, and sitting comfortably; no choking scares or punishment.",
    openings: ["picnic_please", "picnic_turns", "chew_then_speak", "calm_picnic"],
  },
};

export const lessonGuide = (lesson: string): LessonGuide | undefined =>
  Object.hasOwn(LESSON_GUIDES, lesson) ? LESSON_GUIDES[lesson] : undefined;
