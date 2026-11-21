import type { OpeningId } from "./openings";

/**
 * What each preset lesson means for a 3–6 year old, so the model builds the story around it
 * instead of falling back to generic helping. Ids match components/tales/lessons.ts.
 * A custom lesson has no guide; the prompt asks the model to work one out.
 */
export interface LessonGuide {
  /** One sentence a young child understands. */
  meaning: string;
  /** Concrete things Kimi can do on stage that show the lesson. */
  looksLike: string;
  /** The understandable, never-mean pull the other way. The second choice comes from here. */
  temptation: string;
  /** Close to what a character says at the ending, in the narration language. */
  kidPhrase: string;
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
    temptation: "keep the thing because Kimi wants it too and had it first",
    kidPhrase: "When we share, everyone gets some!",
    openings: ["cookies", "rain_umbrella", "slide_turns", "new_ball"],
  },
  honesty: {
    meaning: "Honesty means telling the truth, even when you made a mistake.",
    looksLike: "saying \"I did it, I'm sorry\", giving back something that isn't yours, telling a grown-up what really happened",
    temptation: "stay quiet or say \"I don't know\" because Kimi is worried about getting in trouble",
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
};

export const lessonGuide = (lesson: string): LessonGuide | undefined =>
  Object.hasOwn(LESSON_GUIDES, lesson) ? LESSON_GUIDES[lesson] : undefined;
