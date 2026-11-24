import { ACTORS, EMOTIONS, MAX_BEATS, PROPS, SPOTS, WEATHERS } from "../../../lib/world";
import type { ActorId, Beat, Emotion, PropId, Spot, Stage, Weather } from "../../../lib/world";
import { MAX_LINES } from "./contract";

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isSpot = (value: unknown): value is Spot => typeof value === "string" && Object.hasOwn(SPOTS, value);
const isActor = (value: unknown): value is ActorId => typeof value === "string" && Object.hasOwn(ACTORS, value);
const isProp = (value: unknown): value is PropId => typeof value === "string" && Object.hasOwn(PROPS, value);
const isWeather = (value: unknown): value is Weather => WEATHERS.includes(value as Weather);
const isEmotion = (value: unknown): value is Emotion => EMOTIONS.includes(value as Emotion);

/** One parser per action. A beat whose arguments don't fit its action is dropped. */
const BEAT_PARSERS: Record<Beat["action"], (actor: ActorId, raw: Fields) => Beat | null> = {
  walk_to: (actor, { target }) => isSpot(target) || (isActor(target) && target !== actor) ? { actor, action: "walk_to", target } : null,
  run_to: (actor, { target }) => isSpot(target) || (isActor(target) && target !== actor) ? { actor, action: "run_to", target } : null,
  pick_up: (actor, { prop }) => isProp(prop) ? { actor, action: "pick_up", prop } : null,
  give: (actor, { prop, target }) => isProp(prop) && isActor(target) && target !== actor ? { actor, action: "give", prop, target } : null,
  hug: (actor, { target }) => isActor(target) && target !== actor ? { actor, action: "hug", target } : null,
  help: (actor, { target }) => isActor(target) && target !== actor ? { actor, action: "help", target } : null,
  wave: (actor, { target }) => isActor(target) && target !== actor ? { actor, action: "wave", target } : { actor, action: "wave" },
  jump: (actor) => ({ actor, action: "jump" }),
  roll: (actor) => ({ actor, action: "roll" }),
  sit: (actor) => ({ actor, action: "sit" }),
  celebrate: (actor) => ({ actor, action: "celebrate" }),
  dance: (actor) => ({ actor, action: "dance" }),
  clap: (actor) => ({ actor, action: "clap" }),
  nap: (actor) => ({ actor, action: "nap" }),
  look_around: (actor) => ({ actor, action: "look_around" }),
  emote: (actor, { emotion }) => isEmotion(emotion) ? { actor, action: "emote", emotion } : null,
};

function parseBeat(raw: unknown): Beat | null {
  if (!isRecord(raw) || !isActor(raw.actor) || typeof raw.action !== "string" || !Object.hasOwn(BEAT_PARSERS, raw.action)) return null;
  const beat = BEAT_PARSERS[raw.action as Beat["action"]](raw.actor, raw);
  // Bad timing metadata must not remove an otherwise playable action.
  if (beat && typeof raw.cue === "number" && Number.isInteger(raw.cue) && raw.cue >= 0 && raw.cue <= MAX_LINES) {
    beat.cue = raw.cue;
  }
  return beat;
}

function actorsIn(beat: Beat): ActorId[] {
  return "target" in beat && isActor(beat.target) ? [beat.actor, beat.target] : [beat.actor];
}

export const defaultStage = (beats: Beat[] = [{ actor: "hero", action: "emote", emotion: "happy" }]): Stage => ({
  weather: "sunny",
  cast: [{ actor: "hero", at: ACTORS.hero.home }],
  props: [],
  beats,
});

/**
 * Turn whatever the model sent into a stage the engine can always play.
 * Never throws: unknown names and malformed beats are dropped, and anyone or anything
 * a beat needs is added to the scene at its usual spot.
 */
export function parseStage(raw: unknown): Stage {
  if (!isRecord(raw)) return defaultStage();

  const beats = (Array.isArray(raw.beats) ? raw.beats : [])
    .map(parseBeat)
    .filter((beat): beat is Beat => beat !== null)
    .slice(0, MAX_BEATS);

  const cast = new Map<ActorId, Spot>([["hero", ACTORS.hero.home]]);
  for (const entry of Array.isArray(raw.cast) ? raw.cast : []) {
    if (isRecord(entry) && isActor(entry.actor)) {
      cast.set(entry.actor, isSpot(entry.at) ? entry.at : ACTORS[entry.actor].home);
    }
  }
  for (const actor of beats.flatMap(actorsIn)) {
    if (!cast.has(actor)) cast.set(actor, ACTORS[actor].home);
  }

  const props = new Map<PropId, Spot | ActorId>();
  for (const entry of Array.isArray(raw.props) ? raw.props : []) {
    if (!isRecord(entry) || !isProp(entry.prop)) continue;
    const held = isActor(entry.at) && cast.has(entry.at);
    props.set(entry.prop, held || isSpot(entry.at) ? (entry.at as Spot | ActorId) : PROPS[entry.prop].home);
  }
  for (const beat of beats) {
    if ("prop" in beat && !props.has(beat.prop)) {
      props.set(beat.prop, beat.action === "give" ? beat.actor : PROPS[beat.prop].home);
    }
  }

  return {
    weather: isWeather(raw.weather) ? raw.weather : "sunny",
    cast: [...cast].map(([actor, at]) => ({ actor, at })),
    props: [...props].map(([prop, at]) => ({ prop, at })),
    beats: beats.length > 0 ? beats : defaultStage().beats,
  };
}
