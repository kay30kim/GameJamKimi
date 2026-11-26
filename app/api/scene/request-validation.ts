import { isOpening } from "../../../lib/openings";
import { ACTIONS, ACTORS, EMOTIONS, MAX_BEATS, PROPS, SPOTS, WEATHERS } from "../../../lib/world";
import { MAX_LINES, MAX_SCENES } from "./contract";
import type { SceneContinuation, SceneRequest } from "./contract";

type Fields = Record<string, unknown>;
const record = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const known = (table: object, value: unknown): value is string => typeof value === "string" && Object.hasOwn(table, value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
// The meadow is 20 m across. Leave room around it while rejecting unusable remote coordinates.
const coordinate = (value: unknown): value is number => finite(value) && Math.abs(value) <= 100;
const emotion = (value: unknown) => typeof value === "string" && (EMOTIONS as readonly string[]).includes(value);
const only = (value: Fields, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function validPreviousBeat(value: unknown, actors: Set<string>, props: Set<string>, lines: number): boolean {
  if (!record(value) || !known(ACTIONS, value.action) || typeof value.actor !== "string" || !actors.has(value.actor)) return false;
  if (value.cue !== undefined && (!finite(value.cue) || !Number.isInteger(value.cue) || value.cue < 0 || value.cue > lines)) return false;
  const fields = ["actor", "action", "cue"];
  const other = (target: unknown) => typeof target === "string" && target !== value.actor && actors.has(target);
  const prop = typeof value.prop === "string" && props.has(value.prop);
  switch (value.action) {
    case "walk_to":
    case "run_to": return only(value, [...fields, "target"]) && (known(SPOTS, value.target) || other(value.target));
    case "pick_up": return only(value, [...fields, "prop"]) && prop;
    case "give": return only(value, [...fields, "prop", "target"]) && prop && other(value.target);
    case "hug":
    case "help": return only(value, [...fields, "target"]) && other(value.target);
    case "wave": return only(value, [...fields, "target"]) && (value.target === undefined || other(value.target));
    case "emote": return only(value, [...fields, "emotion"]) && emotion(value.emotion);
    default: return only(value, fields);
  }
}

/** Continuations are client-supplied data, so validate references as well as their shape. */
export function isSceneContinuation(value: unknown): value is SceneContinuation {
  if (!record(value) || !only(value, ["world", "previousLines", "previousBeats"]) || !record(value.world)) return false;
  const world = value.world;
  if (!only(world, ["weather", "actors", "props"]) || typeof world.weather !== "string" || !(WEATHERS as readonly string[]).includes(world.weather) ||
      !Array.isArray(world.actors) || world.actors.length < 1 || world.actors.length > Object.keys(ACTORS).length ||
      !Array.isArray(world.props) || world.props.length > Object.keys(PROPS).length) return false;

  const actors = new Set<string>();
  for (const actor of world.actors) {
    if (!record(actor) || !only(actor, ["actor", "x", "z", "heading", "sitting", "emotion"]) || !known(ACTORS, actor.actor) || actors.has(actor.actor) ||
        !coordinate(actor.x) || !coordinate(actor.z) || !finite(actor.heading) || typeof actor.sitting !== "boolean" ||
        (actor.emotion !== undefined && !emotion(actor.emotion))) return false;
    actors.add(actor.actor);
  }
  if (!actors.has("hero")) return false;

  const props = new Set<string>();
  const occupied = new Set<string>();
  for (const prop of world.props) {
    if (!record(prop) || !only(prop, ["prop", "x", "z", "holder"]) || !known(PROPS, prop.prop) || props.has(prop.prop) || !coordinate(prop.x) || !coordinate(prop.z)) return false;
    if (prop.holder !== undefined) {
      if (typeof prop.holder !== "string" || !actors.has(prop.holder) || occupied.has(prop.holder)) return false;
      occupied.add(prop.holder);
    }
    props.add(prop.prop);
  }

  if (!Array.isArray(value.previousLines) || value.previousLines.length > MAX_LINES ||
      !Array.isArray(value.previousBeats) || value.previousBeats.length > MAX_BEATS) return false;
  for (const line of value.previousLines) {
    if (!record(line) || !only(line, ["speaker", "text", "to", "emotion"]) || typeof line.speaker !== "string" || !actors.has(line.speaker) || !text(line.text, 300) ||
        (line.to !== undefined && (typeof line.to !== "string" || line.to === line.speaker || !actors.has(line.to))) ||
        (line.emotion !== undefined && !emotion(line.emotion))) return false;
  }
  let previousCue = 0;
  for (const beat of value.previousBeats) {
    if (!validPreviousBeat(beat, actors, props, value.previousLines.length)) return false;
    if (beat.cue !== undefined) {
      if (beat.cue < previousCue) return false;
      previousCue = beat.cue;
    }
  }
  return true;
}

export function isSceneRequest(value: unknown): value is SceneRequest {
  if (!record(value)) return false;
  return (
    text(value.lesson, 500) &&
    (value.language === "en" || value.language === "ko") &&
    (value.opening === undefined || isOpening(value.opening)) &&
    typeof value.age === "number" && Number.isInteger(value.age) && value.age >= 3 && value.age <= 6 &&
    Array.isArray(value.wordsLearned) && value.wordsLearned.length <= 100 &&
    value.wordsLearned.every((word) => typeof word === "string" && word.length <= 100) &&
    Array.isArray(value.history) && value.history.length <= MAX_SCENES &&
    value.history.every((entry) => record(entry) && typeof entry.narration === "string" && entry.narration.length <= 4000 && typeof entry.choice === "string" && entry.choice.length <= 500) &&
    (value.continuation === undefined || isSceneContinuation(value.continuation))
  );
}
