import { lessonGuide } from "./lesson-guides";

/**
 * Small situations a story can start from. The client picks one at random for each new story,
 * from the openings that fit the chosen lesson (lib/lesson-guides.ts), so first scenes vary
 * and still set up that lesson. The server only accepts ids from this table.
 */
export const OPENINGS = {
  balloon: "A balloon slips out of someone's paw and floats toward the big tree.",
  thirsty_garden: "The flowers in the garden are drooping because nobody has watered them.",
  cookies: "Grandma Owl baked cookies, but there are not quite enough for everyone.",
  duck_bank: "Dodo the duckling can't climb out of the pond onto the bank.",
  kite_tree: "A kite is stuck in the branches of the big tree.",
  new_friend: "Nabi the kitten is new to the meadow and feels shy.",
  slide_turns: "Everyone wants a turn on the slide at the same time.",
  birthday: "It is Grandma Owl's birthday, and nobody has a present for her yet.",
  rain_umbrella: "Rain starts to fall, and there is only one umbrella.",
  lost_book: "Momo can't find a favorite storybook anywhere.",
  sunset_home: "The sun is setting, and someone is too far from home to walk back alone.",
  spilled_apples: "Someone trips and their apples roll all over the path.",
  race: "The friends race to the pond, and someone falls behind.",
  flower_crown: "Someone's flower crown falls apart just before a picnic.",
  quiet_duck: "Dodo the duckling sits alone by the pond, looking sad, and doesn't say why.",
  new_ball: "Alice has a shiny new ball, and Nabi the kitten has nothing to play with.",
  broken_flowers: "While playing ball by the garden, Alice accidentally knocks over Grandma Owl's favorite flowers, and nobody saw.",
  found_ball: "Alice finds a red ball under the bench. It looks just like the one Momo lost yesterday.",
  saved_apple: "Alice ate the apple Grandma Owl was saving for later, and now Grandma Owl is looking for it.",
  cookies_baking: "Grandma Owl's cookies smell wonderful, but they need a little more time in the oven.",
  no_wind: "Alice wants to fly a kite at the playground, but there is no wind yet.",
  big_slide: "Alice has never gone down the big slide at the playground, and it looks very tall.",
  stepping_stones: "The friends hop across the low, flat stepping stones in the shallow end of the pond, and Alice has never tried.",
  shy_to_ask: "Momo and Bori are playing ball, and Alice wants to join but feels too shy to ask.",
  kite_fixed: "Momo spent the whole morning fixing Alice's broken kite.",
  flower_gift: "Bori the puppy picked a flower from the garden just for Alice.",
  umbrella_lent: "Grandma Owl lent Alice her umbrella in yesterday's rain, and today the sun is out.",
  picnic_prep: "The picnic starts soon, but the cookies, apples, and flowers are all in different places.",
  ask_before_hug: "On the meadow path, Bori asks Alice if she would like a hug. Alice can choose a hug or a friendly wave, and Bori happily respects either answer.",
  tickle_stop: "Near the bench, Momo asks Alice about playing a tickle game. Alice changes her mind and says stop; Momo respects this immediately, and they can choose a different game. Use dialogue and supported gestures, not a tickling animation.",
  body_privacy_help: "Alice sits with Grandma Owl near the bench and asks what it means for private parts of her body to be private. Grandma Owl gently explains that Alice can say no and ask trusted grown-ups for help; if one does not listen, she can tell another. Keep this a calm conversation with no exposure or unsafe incident.",
  picnic_please: "At a picnic near the bench, Momo has an apple and Alice would like it. Alice can practice asking politely before Momo hands it over.",
  picnic_turns: "Alice and Bori both reach for the cookies at a picnic on the meadow path. There is enough for both, and they need to decide who will have a turn first.",
  chew_then_speak: "During a picnic near the bench, Alice wants to tell Momo about a butterfly just after taking a bite of apple. She can finish chewing and swallowing before speaking. Keep the eating in dialogue; use supported sitting and listening gestures.",
  calm_picnic: "Alice wants to keep playing while the friends settle for a picnic near the bench. She can sit calmly to eat when hungry, or politely save her apple for later if she is not hungry.",
} as const;

export type OpeningId = keyof typeof OPENINGS;

export const isOpening = (value: unknown): value is OpeningId => typeof value === "string" && Object.hasOwn(OPENINGS, value);

/** An opening that fits the lesson, or any opening for a custom lesson. */
export function randomOpening(lesson?: string): OpeningId {
  const ids = lessonGuide(lesson ?? "")?.openings ?? (Object.keys(OPENINGS) as OpeningId[]);
  return ids[Math.floor(Math.random() * ids.length)];
}
