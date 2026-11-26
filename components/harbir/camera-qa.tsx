"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneLine } from "@/app/api/scene/contract";
import { createSim } from "@/lib/harbir/sim";
import type { ActorId, Stage, WorldSnapshot } from "@/lib/world";
import styles from "./camera-qa.module.css";

const TalesStage = dynamic(() => import("../tales/stage"), { ssr: false });

type Mode = "wide" | "action" | ActorId;
const MODES: { id: Mode; name: string }[] = [
  { id: "wide", name: "Wide · all friends" },
  { id: "action", name: "Action · walk, give, jump" },
  { id: "hero", name: "Alice · speaker" },
  { id: "friend", name: "Momo · speaker" },
  { id: "puppy", name: "Bori · speaker" },
  { id: "grownup", name: "Grandma Owl · speaker" },
  { id: "kitten", name: "Nabi · small speaker" },
  { id: "duck", name: "Dodo · small speaker" },
];
const POSITIONS: WorldSnapshot["actors"] = [
  { actor: "hero", x: -1.1, z: 0.5, heading: 0, sitting: false },
  { actor: "friend", x: 1.1, z: 0.5, heading: 0, sitting: false },
  { actor: "kitten", x: -2.3, z: -0.8, heading: 0, sitting: false },
  { actor: "duck", x: 2.3, z: -0.8, heading: 0, sitting: false },
  { actor: "puppy", x: -1.1, z: -1.1, heading: 0, sitting: false },
  { actor: "grownup", x: 1.1, z: -1.1, heading: 0, sitting: false },
];

function fixture(mode: Mode, heading: number) {
  const stage: Stage = {
    weather: "sunny",
    cast: POSITIONS.map(({ actor }) => ({ actor, at: "path" })),
    props: [{ prop: "balloon", at: "hero" }],
    beats: mode === "action" ? [
      { actor: "hero", action: "walk_to", target: "friend" },
      { actor: "hero", action: "give", prop: "balloon", target: "friend" },
      { actor: "friend", action: "jump" },
      { actor: "friend", action: "wave", target: "hero" },
    ] : [],
  };
  const sim = createSim(stage, {
    weather: stage.weather,
    actors: POSITIONS.map((actor) => ({ ...actor, heading: actor.actor === mode ? heading : 0 })),
    props: [{ prop: "balloon", x: -1.1, z: 0.5, holder: "hero" }],
  });
  return { mode, stage, sim };
}

/** A local, deterministic camera preview. No scene requests, microphone, or generated audio. */
export default function CameraQa() {
  const [current, setCurrent] = useState(() => fixture("wide", 0));
  const [heading, setHeading] = useState(0);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [addressed, setAddressed] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [largePanel, setLargePanel] = useState(false);
  const [cameraFrame, setCameraFrame] = useState({ top: 0.06, bottom: 0.3 });
  const [status, setStatus] = useState({ completed: 0, holder: "hero" });
  const stageBox = useRef<HTMLDivElement>(null);
  const captionBox = useRef<HTMLElement>(null);
  const { mode, stage, sim } = current;
  const speaker = mode === "wide" || mode === "action" ? null : mode;
  const line = useMemo<SceneLine | null>(() => speaker ? {
    speaker,
    ...(addressed ? { to: speaker === "hero" ? "friend" as const : "hero" as const } : {}),
    emotion: "happy",
    text: "내 눈과 코, 입이 모두 잘 보이니? 함께 이야기해 보자!",
  } : null, [addressed, speaker]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let lastStatus = 0;
    const tick = (now: number) => {
      if (!paused && mode === "action") sim.step(Math.min(Math.max((now - previous) / 1000, 0), 0.05));
      previous = now;
      if (now - lastStatus >= 100) {
        const next = { completed: sim.completedBeats, holder: sim.props.balloon?.holder ?? "ground" };
        setStatus((before) => before.completed === next.completed && before.holder === next.holder ? before : next);
        lastStatus = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, paused, sim]);

  useEffect(() => {
    const container = stageBox.current;
    const caption = captionBox.current;
    if (!container || !caption) return;
    const measure = () => {
      const height = container.getBoundingClientRect().height;
      const next = { top: 0.06, bottom: Math.min(0.65, (caption.getBoundingClientRect().height + 28) / Math.max(1, height)) };
      setCameraFrame((before) => Math.abs(before.bottom - next.bottom) < 0.002 ? before : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(caption);
    measure();
    return () => observer.disconnect();
  }, []);

  function reset(nextMode = mode, nextHeading = heading) {
    setCurrent(fixture(nextMode, nextHeading));
    setPaused(false);
    setReplay((value) => value + 1);
    setStatus({ completed: 0, holder: "hero" });
  }

  return <main className={styles.page}>
    <aside className={styles.panel}>
      <Link href="/">Back to Alicetales</Link>
      <h1>Camera QA</h1>
      <p className={styles.notice}>Local preview with simulated speech. No audio or API calls.</p>
      <label className={styles.field}>Shot scenario
        <select value={mode} onChange={(event) => reset(event.target.value as Mode)}>
          {MODES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <label className={styles.field}>Speaker starts facing
        <select value={heading} disabled={!speaker} onChange={(event) => {
          const next = Number(event.target.value);
          setHeading(next);
          reset(mode, next);
        }}>
          <option value={0}>Front · 0°</option>
          <option value={Math.PI / 2}>Side · 90°</option>
          <option value={Math.PI}>Back · 180°</option>
          <option value={-Math.PI / 2}>Other side · −90°</option>
        </select>
      </label>
      <div className={styles.checks}>
        <label><input type="checkbox" checked={speaking} onChange={(event) => setSpeaking(event.target.checked)} /> Simulated voice playing</label>
        <label><input type="checkbox" checked={addressed} onChange={(event) => setAddressed(event.target.checked)} /> Address another character</label>
        <label><input type="checkbox" checked={largePanel} onChange={(event) => setLargePanel(event.target.checked)} /> Tall dialogue / practice panel</label>
        <label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduced motion</label>
      </div>
      <div className={styles.controls}>
        <button onClick={() => reset()}>Replay scenario</button>
        <button onClick={() => setPaused((value) => !value)} disabled={mode !== "action"}>{paused ? "Resume action" : "Pause action"}</button>
      </div>
      <dl className={styles.status}>
        <div><dt>Completed actions</dt><dd>{status.completed} / {stage.beats.length}</dd></div>
        <div><dt>Balloon holder</dt><dd>{status.holder}</dd></div>
        <div><dt>Bottom safe area</dt><dd>{Math.round(cameraFrame.bottom * 100)}%</dd></div>
      </dl>
      <p className={styles.hint}>Check both eyes, nose and mouth above the caption. Try the back-facing speaker, small characters, and a narrow browser window. Watch a full action replay for framing during the handoff and jump.</p>
    </aside>
    <div className={styles.stage} ref={stageBox}>
      <TalesStage stage={stage} simulation={sim} replay={replay} talk={{ line, speaking: Boolean(line) && speaking }} paused={paused} reducedMotion={reducedMotion} cameraFrame={cameraFrame} />
      <section className={styles.caption} ref={captionBox} aria-label="Simulated story panel">
        <span className={styles.captionLabel}>{speaker ? MODES.find((option) => option.id === speaker)?.name : mode === "action" ? "Action tracking" : "Wide establishing shot"}</span>
        <p>{line?.text ?? (mode === "action" ? "앨리스가 모모에게 풍선을 건네고, 모모가 기뻐해요." : "친구들이 풀밭에서 함께 이야기를 시작해요.")}</p>
        {largePanel && <div className={styles.practice}>
          <strong>함께 말해 볼까요?</strong>
          <p>화면이 좁아져도 친구의 얼굴을 볼 수 있어야 해요.</p>
          <button onClick={() => setSpeaking((value) => !value)}>{speaking ? "Pause simulated voice" : "Start simulated voice"}</button>
          <button onClick={() => reset()}>Replay this moment</button>
        </div>}
        <small>Visual framing check · no real voice</small>
      </section>
    </div>
  </main>;
}
