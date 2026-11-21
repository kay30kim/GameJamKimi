/**
 * Small situations a story can start from. The client picks one at random for each new story,
 * so first scenes don't all open the same way. The server only accepts ids from this table.
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
} as const;

export type OpeningId = keyof typeof OPENINGS;

export const isOpening = (value: unknown): value is OpeningId => typeof value === "string" && Object.hasOwn(OPENINGS, value);

export function randomOpening(): OpeningId {
  const ids = Object.keys(OPENINGS) as OpeningId[];
  return ids[Math.floor(Math.random() * ids.length)];
}
