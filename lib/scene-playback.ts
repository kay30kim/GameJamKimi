import type { SceneLine, SceneResponse } from "../app/api/scene/contract";
import { createSim, snapshotSim } from "./harbir/sim";
import type { Sim } from "./harbir/sim";
import type { SpeakOptions, SpeakResult } from "./speech";
import type { SpeechErrorCode } from "./speech-policy";
import type { Voice } from "./voices";
import type { Stage, WorldSnapshot } from "./world";
import { storyText } from "./story-text";

export interface PlaybackSegment {
  voice: Voice;
  text: string;
  line: SceneLine | null;
  /** Cumulative number of actions released by this speech segment. */
  beatLimit: number;
}

/** Keep legacy scenes usable, while honoring the model's explicit speech cues. */
export function planPlayback(scene: SceneResponse): PlaybackSegment[] {
  const segments: PlaybackSegment[] = [
    { voice: "narrator", text: storyText(scene.narration), line: null, beatLimit: 0 },
    ...scene.lines.map((source) => {
      const line = { ...source, text: storyText(source.text) };
      return { voice: line.speaker, text: line.text, line, beatLimit: 0 };
    }),
  ];
  const valid = (cue: number | undefined): cue is number =>
    Number.isInteger(cue) && cue! >= 0 && cue! < segments.length;
  const explicit = scene.stage.beats.map(({ cue }) => valid(cue) ? cue : undefined);
  // Cached or hand-authored scenes may not have passed the current server parser.
  let previous = 0;
  const ordered = explicit.every((cue) => cue === undefined || (cue >= previous && ((previous = cue), true)));
  if (!ordered) explicit.fill(undefined);
  previous = 0;
  scene.stage.beats.forEach((beat, index) => {
    let cue = explicit[index];
    if (cue === undefined) {
      const nextCue = explicit.slice(index + 1).find((value) => value !== undefined) ?? segments.length - 1;
      const setup = beat.action === "walk_to" || beat.action === "run_to" || beat.action === "pick_up";
      const matchingLine = setup ? -1 : segments.findIndex((segment, i) =>
        i >= previous && i <= nextCue && segment.line?.speaker === beat.actor);
      cue = matchingLine < 0 ? previous : matchingLine;
    }
    previous = cue;
    for (let i = cue; i < segments.length; i += 1) segments[i].beatLimit = index + 1;
  });
  return segments;
}

interface PlaybackOptions {
  locale: string;
  isMuted: () => boolean;
  speak: (text: string, locale: string, options: SpeakOptions) => Promise<SpeakResult>;
  onSegment: (segment: PlaybackSegment, index: number) => void;
  onSpeaking: (speaking: boolean) => void;
  onLevel?: (level: number) => void;
  onSpeechError?: (error: SpeechErrorCode) => void;
}

/**
 * One clock for captions and actions. Audio releases its actions only after real
 * playback starts; the next line waits for both the voice and those actions.
 * Advance outside the Canvas so a device without WebGL can still finish a story.
 */
export class ScenePlayback {
  readonly sim: Sim;
  readonly segments: PlaybackSegment[];
  readonly stage: Stage;
  /** The start of this part, so Watch again does not restart the whole story. */
  readonly startWorld: WorldSnapshot;
  private readonly abort = new AbortController();
  private result: Promise<boolean> | null = null;
  private resolve: ((completed: boolean) => void) | null = null;
  private active = false;
  private paused = false;
  private completed = false;
  private index = -1;
  private beatLimit = 0;
  private voiceDone = false;
  private voiceStarted = false;
  private readingLeft = 0;
  private gapLeft: number | null = null;

  constructor(scene: SceneResponse, private readonly options: PlaybackOptions, previous?: WorldSnapshot) {
    this.stage = previous ? { ...scene.stage, weather: previous.weather } : scene.stage;
    this.sim = createSim(this.stage, previous);
    this.startWorld = snapshotSim(this.sim, this.stage.weather);
    this.segments = planPlayback(scene);
  }

  snapshot(): WorldSnapshot {
    return snapshotSim(this.sim, this.stage.weather);
  }

  play(): Promise<boolean> {
    if (this.result) return this.result;
    if (this.abort.signal.aborted) return Promise.resolve(false);
    this.result = new Promise((resolve) => { this.resolve = resolve; });
    this.active = true;
    this.beginSegment(0);
    return this.result;
  }

  advance(seconds: number): void {
    if (this.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, 0.1);
    // Choices hold one durable world state for both branch prefetch and rendering.
    // Idle animation advances without moving props or changing the saved emotions.
    if (this.completed) {
      for (const actor of Object.values(this.sim.actors)) actor.poseTime += dt;
      return;
    }
    if (!this.active) return;
    this.sim.step(dt, this.beatLimit);
    this.readingLeft = Math.max(0, this.readingLeft - dt);
    if (!this.voiceDone || this.readingLeft > 0) return;
    const segment = this.segments[this.index];
    // A caption's full reading time is part of the line. Only then can its
    // speaker turn away for a roll/spin and release the following actions.
    this.beatLimit = segment.beatLimit;
    if (this.sim.completedBeats < segment.beatLimit) return;
    const last = this.index === this.segments.length - 1;
    if (last && !this.sim.done) return;
    if (this.gapLeft === null) this.gapLeft = 0.35;
    this.gapLeft -= dt;
    if (this.gapLeft > 0) return;
    if (last) {
      this.active = false;
      this.completed = true;
      this.resolve?.(true);
      this.resolve = null;
    } else {
      this.beginSegment(this.index + 1);
    }
  }

  cancel(): void {
    this.active = false;
    this.completed = false;
    this.abort.abort();
    this.resolve?.(false);
    this.resolve = null;
    this.options.onLevel?.(0);
  }

  /** The owner pauses the shared audio player too, including practice speech. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    // Once this scene is complete, practice/choice speech owns the face.
    if (this.active) {
      this.options.onSpeaking(false);
      this.options.onLevel?.(0);
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.active && this.voiceStarted && !this.voiceDone) this.options.onSpeaking(true);
  }

  /** Skipping still applies every remaining interaction before presenting choices. */
  skip(): boolean {
    this.cancel();
    this.completed = this.sim.finish();
    return this.completed;
  }

  private beginSegment(index: number): void {
    this.index = index;
    this.voiceDone = false;
    this.voiceStarted = false;
    this.readingLeft = 0;
    this.gapLeft = null;
    const segment = this.segments[index];
    const previousLimit = this.segments[index - 1]?.beatLimit ?? 0;
    const speaker = segment.line?.speaker;
    const turnAway = speaker ? this.stage.beats.findIndex((beat, beatIndex) =>
      beatIndex >= previousLimit && beatIndex < segment.beatLimit && beat.actor === speaker
      && (beat.action === "roll" || beat.action === "celebrate")) : -1;
    // Keep the speaker's face readable without removing or changing the stunt.
    // Earlier actions can accompany the line; ordered actions after it must wait.
    const speakingLimit = turnAway < 0 ? segment.beatLimit : turnAway;
    const current = () => this.active && this.index === index;
    this.options.onSegment(segment, index);
    this.options.onSpeaking(false);
    this.options.onLevel?.(0);
    const captions = () => {
      this.beatLimit = speakingLimit;
      this.readingLeft = Math.max(1.8, segment.text.length * 0.07);
      this.voiceDone = true;
    };
    if (this.options.isMuted()) { captions(); return; }
    let started = false;
    const onStart = () => {
      if (!current() || started) return;
      started = true;
      this.voiceStarted = true;
      this.beatLimit = speakingLimit;
      this.options.onSpeaking(!this.paused);
    };
    // Defer invocation so a synchronous adapter failure uses the same caption fallback.
    void Promise.resolve().then(() => {
      if (!current()) return { started: false, cancelled: true };
      return this.options.speak(segment.text, this.options.locale, {
        voice: segment.voice, emotion: segment.line?.emotion, onStart, signal: this.abort.signal,
        onLevel: (level) => {
          if (current() && this.voiceStarted && !this.voiceDone && !this.paused) this.options.onLevel?.(level);
        },
      });
    }).then((result: SpeakResult) => {
      if (!current()) return;
      this.options.onSpeaking(false);
      this.options.onLevel?.(0);
      if (result.error && !result.cancelled && !this.options.isMuted()) this.options.onSpeechError?.(result.error);
      if (!started || !result.started || result.cancelled || result.error) captions();
      else {
        this.voiceDone = true;
        this.beatLimit = segment.beatLimit;
      }
    }, () => {
      if (!current()) return;
      this.options.onSpeaking(false);
      this.options.onLevel?.(0);
      if (!this.options.isMuted()) this.options.onSpeechError?.("TTS_UPSTREAM_ERROR");
      captions();
    });
  }
}
