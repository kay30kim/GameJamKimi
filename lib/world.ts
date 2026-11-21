/**
 * Sunny Meadow: the one fixed world every story happens in.
 * The prompt, the server's stage validation, and the 3D engine all read these tables,
 * so adding an entry here is the only change needed to grow the world.
 * Positions are [x, z] in meters on a 20 x 20 ground plane centered at the origin.
 */

export const SPOTS = {
  path: { en: "the meadow path", ko: "풀밭 길", position: [0, 0] },
  home: { en: "Kimi's house", ko: "키미의 집", position: [-6, -5] },
  tree: { en: "the big tree", ko: "큰 나무", position: [5, -5] },
  bench: { en: "the bench", ko: "벤치", position: [0, -3] },
  pond: { en: "the pond", ko: "연못", position: [6, 4] },
  garden: { en: "the flower garden", ko: "꽃밭", position: [-6, 4] },
  playground: { en: "the playground", ko: "놀이터", position: [0, 6] },
} as const satisfies Record<string, { en: string; ko: string; position: readonly [number, number] }>;

export const ACTORS = {
  hero: { en: "Kimi the bunny", ko: "토끼 키미", home: "path" },
  friend: { en: "Momo the bear cub", ko: "아기곰 모모", home: "playground" },
  puppy: { en: "Bori the puppy", ko: "강아지 보리", home: "garden" },
  grownup: { en: "Grandma Owl", ko: "부엉이 할머니", home: "home" },
} as const satisfies Record<string, { en: string; ko: string; home: keyof typeof SPOTS }>;

export const PROPS = {
  ball: { en: "a ball", ko: "공", home: "playground" },
  umbrella: { en: "an umbrella", ko: "우산", home: "home" },
  flower: { en: "a flower", ko: "꽃", home: "garden" },
  apple: { en: "an apple", ko: "사과", home: "tree" },
  book: { en: "a book", ko: "책", home: "bench" },
  kite: { en: "a kite", ko: "연", home: "playground" },
} as const satisfies Record<string, { en: string; ko: string; home: keyof typeof SPOTS }>;

export const WEATHERS = ["sunny", "rainy"] as const;

/** Matches the designer's expression sheet in design/character-brief.md. */
export const EMOTIONS = ["happy", "sad", "surprised", "curious", "excited"] as const;

export type Spot = keyof typeof SPOTS;
export type ActorId = keyof typeof ACTORS;
export type PropId = keyof typeof PROPS;
export type Weather = (typeof WEATHERS)[number];
export type Emotion = (typeof EMOTIONS)[number];

/** One step of a scene's animation. Each action takes exactly the arguments listed. */
export type Beat =
  | { actor: ActorId; action: "walk_to" | "run_to"; target: Spot | ActorId }
  | { actor: ActorId; action: "pick_up"; prop: PropId }
  | { actor: ActorId; action: "give"; prop: PropId; target: ActorId }
  | { actor: ActorId; action: "hug" | "help"; target: ActorId }
  | { actor: ActorId; action: "wave"; target?: ActorId }
  | { actor: ActorId; action: "jump" | "roll" | "sit" | "celebrate" }
  | { actor: ActorId; action: "emote"; emotion: Emotion };

export type Action = Beat["action"];

/** What the engine renders for a scene. The server always returns a complete, valid stage. */
export interface Stage {
  weather: Weather;
  /** Who is in the scene and where each starts. Always includes the hero. */
  cast: { actor: ActorId; at: Spot }[];
  /** Props in the scene: placed at a spot, or held by an actor in the cast. */
  props: { prop: PropId; at: Spot | ActorId }[];
  /** Played in order, one to four steps. */
  beats: Beat[];
}

export const MAX_BEATS = 4;

/** Argument shape for each action, used by the prompt and the server's stage parser. */
export const ACTIONS = {
  walk_to: { args: "target (a spot or an actor)", meaning: "walk to a place or someone" },
  run_to: { args: "target (a spot or an actor)", meaning: "run to a place or someone" },
  pick_up: { args: "prop", meaning: "pick up a prop" },
  give: { args: "prop, target (an actor)", meaning: "give or share a prop with someone" },
  hug: { args: "target (an actor)", meaning: "hug someone" },
  help: { args: "target (an actor)", meaning: "help someone up or comfort them" },
  wave: { args: "optional target (an actor)", meaning: "wave hello or goodbye" },
  jump: { args: "none", meaning: "jump for joy" },
  roll: { args: "none", meaning: "tuck into a ball and roll forward, for fun or to show off" },
  sit: { args: "none", meaning: "sit down where they are" },
  celebrate: { args: "none", meaning: "dance and celebrate" },
  emote: { args: "emotion", meaning: "show a feeling on their face" },
} as const satisfies Record<Action, { args: string; meaning: string }>;
