"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { audit, passes, SCENARIOS, TOLERANCE } from "@/lib/harbir/qa";
import styles from "./collision-qa.module.css";

const MeadowStage = dynamic(() => import("./meadow-stage"), { ssr: false });
const TalesStage = dynamic(() => import("../tales/stage"), { ssr: false });
const QUIET_TALK = { line: null, speaking: false };

const cm = (meters: number) => `${Math.max(0, Math.round(meters * 100))} cm`;

/** Replays scenes built to stress collisions, with the worst overlap each one reaches. */
export default function CollisionQa() {
  const [picked, setPicked] = useState(0);
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [renderer, setRenderer] = useState<"tales" | "original">("tales");
  const results = useMemo(() => SCENARIOS.map(({ stage }) => audit(stage)), []);
  const scene = SCENARIOS[picked];

  return (
    <main className={styles.page}>
      <aside className={styles.list}>
        <h1>Collision QA</h1>
        <p>Body and ground-prop overlaps above {cm(TOLERANCE)} fail. Held props are not measured: inspect the grip, face clearance, and handoff in the animation.</p>
        <label className={styles.renderer} htmlFor="qa-renderer">
          Character models
          <select id="qa-renderer" value={renderer} onChange={(event) => { setRenderer(event.target.value as "tales" | "original"); setPaused(false); setReplay((n) => n + 1); }}>
            <option value="tales">Main game · Tales</option>
            <option value="original">Original · Harbir / GLB Alice</option>
          </select>
        </label>
        {SCENARIOS.map(({ name }, i) => {
          const result = results[i];
          return (
            <button key={name} aria-pressed={picked === i} onClick={() => { setPicked(i); setPaused(false); setReplay((n) => n + 1); }}>
              <span className={passes(result) ? styles.pass : styles.fail}>{passes(result) ? "Body / ground pass" : "Body / ground fail"}</span>
              <strong>{name}</strong>
              <small>
                bodies {cm(result.bodyOverlap)} · scenery {cm(result.sceneryOverlap)} · ground prop in body {cm(result.propInBody)} ·
                ground prop in scenery {cm(result.propInScenery)} · ground prop moved {cm(result.propMoved)} · {Number.isFinite(result.seconds) ? `${result.seconds.toFixed(1)} s` : "never finished"}
              </small>
            </button>
          );
        })}
      </aside>
      <section className={styles.stage}>
        {renderer === "tales"
          ? <TalesStage stage={scene.stage} replay={replay} paused={paused} talk={QUIET_TALK} />
          : <MeadowStage stage={scene.stage} replay={replay} paused={paused} />}
        <div className={styles.caption}>
          <p>{scene.about}</p>
          <div className={styles.controls}>
            <button aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "Resume actions" : "Pause actions"}</button>
            <button onClick={() => { setPaused(false); setReplay((n) => n + 1); }}>Replay</button>
          </div>
        </div>
      </section>
    </main>
  );
}
