"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SceneLanguage, SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import { meaningLocale, speak, speechLocale, stopSpeaking } from "@/lib/speech";
import type { Stage } from "@/lib/world";
import styles from "./harbir.module.css";

const MeadowStage = dynamic(() => import("./meadow-stage"), {
  ssr: false,
  loading: () => <div className={styles.stageLoading}>Opening the meadow…</div>,
});

const LESSONS = ["kindness", "empathy", "sharing", "honesty", "patience"] as const;

/** Shown before the story starts: everyone says hello. */
const WELCOME_STAGE: Stage = {
  weather: "sunny",
  cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "playground" }, { actor: "puppy", at: "garden" }, { actor: "grownup", at: "home" }],
  props: [{ prop: "ball", at: "playground" }],
  beats: [
    { actor: "hero", action: "wave" },
    { actor: "puppy", action: "run_to", target: "hero" },
    { actor: "hero", action: "emote", emotion: "happy" },
  ],
};

type Phase = "setup" | "loading" | "scene" | "ending";
type Settings = Pick<SceneRequest, "lesson" | "language" | "age">;

export default function HarbirStory() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [lesson, setLesson] = useState<string>(LESSONS[0]);
  const [language, setLanguage] = useState<SceneLanguage>("ko");
  const [age, setAge] = useState(5);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [history, setHistory] = useState<SceneRequest["history"]>([]);
  const [wordsLearned, setWordsLearned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const requestId = useRef(0);
  const lastRequest = useRef<SceneRequest | null>(null);

  async function run(request: SceneRequest) {
    const id = ++requestId.current;
    lastRequest.current = request;
    stopSpeaking();
    setError(null);
    setPhase("loading");
    try {
      const next = await fetchScene(request);
      if (id !== requestId.current) return;
      setScene(next);
      if (next.lessonComplete) {
        setWordsLearned((learned) => dedupeWords([...learned, ...next.newWords.map(({ word }) => word)]));
      }
      setPhase(next.lessonComplete ? "ending" : "scene");
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : "The story got stuck.");
    }
  }

  function start() {
    const next = { lesson, language, age };
    setSettings(next);
    setHistory([]);
    setWordsLearned([]);
    void run({ ...next, history: [], wordsLearned: [] });
  }

  function choose(choice: string) {
    if (phase !== "scene" || !scene || !settings) return;
    const request = nextSceneRequest(settings, history, wordsLearned, scene, choice);
    setHistory(request.history);
    setWordsLearned(request.wordsLearned);
    void run(request);
  }

  function restart() {
    requestId.current += 1;
    stopSpeaking();
    setPhase("setup");
    setScene(null);
    setSettings(null);
  }

  useEffect(() => {
    if (phase !== "setup") return;
    const timer = setTimeout(() => prefetch({ lesson, language, age, history: [], wordsLearned: [] }), 600);
    return () => clearTimeout(timer);
  }, [phase, lesson, language, age]);

  useEffect(() => {
    if (phase !== "scene" || !scene || !settings) return;
    for (const choice of scene.choices) prefetch(nextSceneRequest(settings, history, wordsLearned, scene, choice));
  }, [phase, scene, settings, history, wordsLearned]);

  useEffect(() => {
    if (!scene || !settings || (phase !== "scene" && phase !== "ending")) return;
    speak(scene.narration, meaningLocale(settings.language));
    return () => stopSpeaking();
  }, [phase, scene, settings]);

  const stage = scene && phase !== "setup" ? scene.stage : WELCOME_STAGE;
  const showStory = (phase === "scene" || phase === "ending") && scene && settings;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>GameJamKimi</Link>
        <span className={styles.badge}>Sunny Meadow · 3D</span>
      </header>

      <section className={styles.stage} aria-label="Story stage">
        <MeadowStage stage={stage} replay={replay} />
        {phase === "loading" && <div className={styles.thinking}>Kimi is thinking…</div>}
        {showStory && <button className={styles.replay} onClick={() => setReplay((n) => n + 1)}>Watch again</button>}
      </section>

      <section className={styles.panel}>
        {phase === "setup" && (
          <div className={styles.setup}>
            <div className={styles.lessons} role="group" aria-label="Lesson">
              {LESSONS.map((option) => (
                <button key={option} aria-pressed={lesson === option} onClick={() => setLesson(option)}>{option}</button>
              ))}
            </div>
            <div className={styles.row}>
              <label>Learning
                <select value={language} onChange={(event) => setLanguage(event.target.value as SceneLanguage)}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>Age
                <select value={age} onChange={(event) => setAge(Number(event.target.value))}>
                  {[3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button className={styles.primary} onClick={start}>Start the story</button>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error} <button onClick={() => lastRequest.current && void run(lastRequest.current)}>Try again</button>
          </div>
        )}

        {showStory && (
          <>
            <p className={styles.narration} lang={meaningLocale(settings.language)}>{scene.narration}</p>
            {scene.newWords.length > 0 && (
              <div className={styles.words}>
                {scene.newWords.map(({ word, meaning }) => (
                  <button key={word} onClick={() => speak(word, speechLocale(settings.language))}>
                    <strong lang={speechLocale(settings.language)}>{word}</strong>
                    <small>{meaning}</small>
                  </button>
                ))}
              </div>
            )}
            {phase === "scene" ? (
              <div className={styles.choices}>
                {scene.choices.map((choice) => <button key={choice} onClick={() => choose(choice)}>{choice}</button>)}
              </div>
            ) : (
              <div className={styles.ending}>
                <p>Words learned: {wordsLearned.join(" · ") || "none yet"}</p>
                <button className={styles.primary} onClick={restart}>Another story</button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
