"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { audit, passes, SCENARIOS, TOLERANCE } from "@/lib/harbir/qa";
import styles from "./collision-qa.module.css";

const MeadowStage = dynamic(() => import("./meadow-stage"), { ssr: false });

const cm = (meters: number) => `${Math.max(0, Math.round(meters * 100))} cm`;

/** Replays scenes built to stress collisions, with the worst overlap each one reaches. */
export default function CollisionQa() {
  const [picked, setPicked] = useState(0);
  const [replay, setReplay] = useState(0);
  const results = useMemo(() => SCENARIOS.map(({ stage }) => audit(stage)), []);
  const scene = SCENARIOS[picked];

  return (
    <main className={styles.page}>
      <aside className={styles.list}>
        <h1>Collision QA</h1>
        <p>Overlaps above {cm(TOLERANCE)} fail. Click a scene to replay it.</p>
        {SCENARIOS.map(({ name }, i) => {
          const result = results[i];
          return (
            <button key={name} aria-pressed={picked === i} onClick={() => { setPicked(i); setReplay((n) => n + 1); }}>
              <span className={passes(result) ? styles.pass : styles.fail}>{passes(result) ? "Pass" : "Fail"}</span>
              <strong>{name}</strong>
              <small>
                bodies {cm(result.bodyOverlap)} · scenery {cm(result.sceneryOverlap)} · prop in body {cm(result.propInBody)} ·
                prop in scenery {cm(result.propInScenery)} · prop moved {cm(result.propMoved)} · {Number.isFinite(result.seconds) ? `${result.seconds.toFixed(1)} s` : "never finished"}
              </small>
            </button>
          );
        })}
      </aside>
      <section className={styles.stage}>
        <MeadowStage stage={scene.stage} replay={replay} />
        <div className={styles.caption}>
          <p>{scene.about}</p>
          <button onClick={() => setReplay((n) => n + 1)}>Replay</button>
        </div>
      </section>
    </main>
  );
}
