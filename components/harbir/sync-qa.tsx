"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { SceneLine, SceneResponse } from "@/app/api/scene/contract";
import { ScenePlayback } from "@/lib/scene-playback";
import type { SpeakOptions, SpeakResult } from "@/lib/speech";
import type { Voice } from "@/lib/voices";
import styles from "./sync-qa.module.css";

const TalesStage = dynamic(() => import("../tales/stage"), { ssr: false });

const SCENE: SceneResponse = {
  narration: "앨리스가 풍선을 들고 모모에게 다가가요.",
  lines: [
    { speaker: "hero", to: "friend", text: "모모야, 이 풍선 받아!", emotion: "happy" },
    { speaker: "friend", to: "hero", text: "고마워, 앨리스!", emotion: "happy" },
  ],
  newWords: [],
  choices: ["함께 걸어요", "잠깐 쉬어요"],
  lessonComplete: false,
  stage: {
    weather: "sunny",
    cast: [{ actor: "hero", at: "bench" }, { actor: "friend", at: "path" }],
    props: [{ prop: "balloon", at: "hero" }],
    beats: [
      { actor: "hero", action: "walk_to", target: "friend", cue: 0 },
      { actor: "hero", action: "give", prop: "balloon", target: "friend", cue: 1 },
      { actor: "friend", action: "wave", target: "hero", cue: 2 },
    ],
  },
};

type Mode = "manual" | "muted" | "unavailable";
type Phase = "idle" | "running" | "finished" | "cancelled" | "error";
type VoiceState = "idle" | "waiting" | "playing" | "ended" | "silent" | "unavailable";
type Segment = { voice: Voice; text: string; line: SceneLine | null; beatLimit: number };
type MockVoice = { start: () => void; finish: (cancelled: boolean) => void };
type Snapshot = { completed: number; holder: string; heroPose: string; friendPose: string };

const EMPTY: Snapshot = { completed: 0, holder: "hero", heroPose: "idle", friendPose: "idle" };
const VOICE_STATUS: Record<VoiceState, string> = {
  idle: "No pending voice",
  waiting: "Waiting for voice start",
  playing: "Voice playing (simulated)",
  ended: "Voice ended · waiting for its actions",
  silent: "Muted · caption timing",
  unavailable: "Voice unavailable · caption timing",
};

/** Manual voice events make latency, cancellation, and action barriers reproducible without TTS. */
export default function SyncQa() {
  const [mode, setMode] = useState<Mode>("manual");
  const [phase, setPhase] = useState<Phase>("idle");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [playback, setPlayback] = useState<ScenePlayback | null>(null);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(-1);
  const [speaking, setSpeaking] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [choice, setChoice] = useState<string | null>(null);
  const active = useRef<ScenePlayback | null>(null);
  const pendingVoice = useRef<MockVoice | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let previous = performance.now();
    let lastSnapshot = 0;
    let frame = 0;
    const advance = (now: number) => {
      const current = active.current;
      if (current) {
        current.advance(Math.min(Math.max((now - previous) / 1000, 0), 0.05));
        if (now - lastSnapshot >= 100) {
          const { sim } = current;
          const next = {
            completed: sim.completedBeats,
            holder: sim.props.balloon?.holder ?? "ground",
            heroPose: sim.actors.hero?.pose ?? "absent",
            friendPose: sim.actors.friend?.pose ?? "absent",
          };
          setSnapshot((before) => before.completed === next.completed && before.holder === next.holder && before.heroPose === next.heroPose && before.friendPose === next.friendPose ? before : next);
          lastSnapshot = now;
        }
      }
      previous = now;
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(frame);
      generation.current += 1;
      active.current?.cancel();
      pendingVoice.current?.finish(true);
    };
  }, []);

  function start() {
    const id = ++generation.current;
    active.current?.cancel();
    pendingVoice.current?.finish(true);
    pendingVoice.current = null;
    setPhase("running");
    setVoiceState("idle");
    setSegment(null);
    setSegmentIndex(-1);
    setSpeaking(false);
    setSnapshot(EMPTY);
    setChoice(null);

    const mockSpeak = (_text: string, _locale: string, options: SpeakOptions): Promise<SpeakResult> => {
      if (mode === "unavailable") {
        if (id === generation.current) setVoiceState("unavailable");
        return Promise.resolve({ started: false, cancelled: false });
      }
      return new Promise((resolve) => {
        let started = false;
        let settled = false;
        const finish = (cancelled: boolean) => {
          if (settled) return;
          settled = true;
          options.signal?.removeEventListener("abort", abort);
          if (pendingVoice.current === voice) pendingVoice.current = null;
          if (id === generation.current) setVoiceState(cancelled ? "idle" : "ended");
          resolve({ started, cancelled });
        };
        const abort = () => finish(true);
        const voice: MockVoice = {
          start: () => {
            if (settled || started || id !== generation.current) return;
            started = true;
            setVoiceState("playing");
            options.onStart?.();
          },
          finish,
        };
        if (options.signal?.aborted || id !== generation.current) {
          finish(true);
          return;
        }
        pendingVoice.current = voice;
        options.signal?.addEventListener("abort", abort, { once: true });
        setVoiceState("waiting");
      });
    };

    const next = new ScenePlayback(SCENE, {
      locale: "ko-KR",
      isMuted: () => mode === "muted",
      speak: mockSpeak,
      onSegment: (current, index) => {
        if (id !== generation.current) return;
        setSegment(current);
        setSegmentIndex(index);
        setVoiceState(mode === "muted" ? "silent" : "waiting");
      },
      onSpeaking: (value) => { if (id === generation.current) setSpeaking(value); },
    });
    active.current = next;
    setPlayback(next);
    void next.play().then((completed) => {
      if (id !== generation.current) return;
      setSpeaking(false);
      setVoiceState("idle");
      setPhase(completed ? "finished" : "cancelled");
    }).catch(() => {
      if (id !== generation.current) return;
      setSpeaking(false);
      setPhase("error");
    });
  }

  function cancel() {
    generation.current += 1;
    active.current?.cancel();
    pendingVoice.current?.finish(true);
    setSpeaking(false);
    setVoiceState("idle");
    setPhase("cancelled");
  }

  function skip() {
    const current = active.current;
    if (!current) return;
    generation.current += 1;
    const completed = current.skip();
    pendingVoice.current?.finish(true);
    setSpeaking(false);
    setVoiceState("idle");
    setPhase(completed ? "finished" : "cancelled");
  }

  return <main className={styles.page}>
    <aside className={styles.panel}>
      <a href="/harbir/qa">← Collision QA</a>
      <h1>Speech sync QA</h1>
      <p className={styles.notice}>Fake voice events only. This page produces no sound and makes no story or TTS requests.</p>
      <label className={styles.mode} htmlFor="sync-mode">Voice mode
        <select id="sync-mode" value={mode} disabled={phase === "running"} onChange={(event) => setMode(event.target.value as Mode)}>
          <option value="manual">Manual start / end events</option>
          <option value="muted">Muted captions</option>
          <option value="unavailable">Voice unavailable</option>
        </select>
      </label>
      <div className={styles.controls}>
        <button onClick={start}>{phase === "idle" ? "Start scene" : "Replay scene"}</button>
        <button onClick={cancel} disabled={phase !== "running"}>Cancel scene</button>
        <button onClick={skip} disabled={phase !== "running"}>Skip to choices</button>
      </div>
      <div className={styles.voiceControls}>
        <button onClick={() => pendingVoice.current?.start()} disabled={voiceState !== "waiting" || mode !== "manual"}>Start voice</button>
        <button onClick={() => pendingVoice.current?.finish(false)} disabled={voiceState !== "playing"}>End voice</button>
      </div>
      <dl className={styles.status} aria-live="polite">
        <div><dt>Playback</dt><dd>{phase}</dd></div>
        <div><dt>Speech</dt><dd>{VOICE_STATUS[voiceState]}</dd></div>
        <div><dt>Segment</dt><dd>{segmentIndex < 0 ? "Not started" : `${segmentIndex + 1} / 3 · ${segment?.voice}`}</dd></div>
        <div><dt>Completed actions</dt><dd>{snapshot.completed} / {SCENE.stage.beats.length}</dd></div>
        <div><dt>Segment action limit</dt><dd>{segment?.beatLimit ?? 0}</dd></div>
        <div><dt>Balloon holder</dt><dd>{snapshot.holder}</dd></div>
        <div><dt>Alice / Momo pose</dt><dd>{snapshot.heroPose} / {snapshot.friendPose}</dd></div>
      </dl>
      <ol className={styles.checks}>
        <li>Before Start voice, no action assigned to that segment should begin.</li>
        <li>End Alice&apos;s voice immediately: Momo&apos;s thanks must wait for the handoff.</li>
        <li>Keep Momo&apos;s voice playing after the wave: choices must stay hidden.</li>
        <li>Cancel or replay while waiting: old voice events must not advance the new scene.</li>
      </ol>
    </aside>
    <section className={styles.stage} aria-label="Synchronization test scene">
      <TalesStage stage={SCENE.stage} replay={0} talk={{ line: segment?.line ?? null, speaking }} paused simulation={playback?.sim} />
      <div className={styles.caption}>
        <p lang="ko">{segment?.text ?? SCENE.narration}</p>
        {phase === "finished" && <div className={styles.choices}>
          <strong>Choices ready · all actions completed</strong>
          {SCENE.choices.map((text) => <button key={text} lang="ko" onClick={() => setChoice(text)}>{text}</button>)}
          {choice && <p lang="ko">선택: {choice}</p>}
        </div>}
      </div>
    </section>
  </main>;
}
