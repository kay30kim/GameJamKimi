"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SceneLanguage, SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import { meaningLocale, speak, speechLocale, stopSpeaking } from "@/lib/speech";
import type { Stage } from "@/lib/world";
import styles from "./harbir.module.css";

const MeadowStage = dynamic(() => import("./meadow-stage"), {
  ssr: false,
  loading: () => <div className={styles.stageLoading}>Opening the meadow…</div>,
});

const LESSONS = {
  kindness: "Small acts that help others",
  empathy: "Notice how a friend feels",
  sharing: "Make room for everyone",
  honesty: "Tell the truth gently",
  patience: "Wait and try again",
} as const;
type Lesson = keyof typeof LESSONS;

/** Shown before the story starts: everyone comes to say hello. */
const WELCOME_STAGE: Stage = {
  weather: "sunny",
  cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "playground" }, { actor: "puppy", at: "garden" }, { actor: "grownup", at: "home" }],
  props: [{ prop: "ball", at: "playground" }],
  beats: [
    { actor: "hero", action: "wave" },
    { actor: "puppy", action: "run_to", target: "hero" },
    { actor: "hero", action: "emote", emotion: "happy" },
    { actor: "puppy", action: "jump" },
  ],
};

type Phase = "setup" | "loading" | "scene" | "ending";
type Settings = Pick<SceneRequest, "lesson" | "language" | "age">;

const subscribeFullscreen = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};
const isFullscreen = () => document.fullscreenElement !== null;
const notFullscreen = () => false;

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

export default function HarbirStory() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [lesson, setLesson] = useState<Lesson>("kindness");
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
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen, notFullscreen);

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
    setError(null);
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
  const story = (phase === "scene" || phase === "ending") && scene && settings ? { scene, settings } : null;
  const otherLanguage = language === "ko" ? "English" : "Korean";

  return (
    <main className={styles.page}>
      <div className={styles.stage} aria-label="Story stage">
        <MeadowStage stage={stage} replay={replay} />
      </div>

      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}><span aria-hidden="true">k.</span>KimiTales</Link>
        <div className={styles.topActions}>
          <span className={styles.badge}>Sunny Meadow</span>
          {story && <button className={styles.pill} onClick={() => setReplay((n) => n + 1)}>Watch again</button>}
          <button className={styles.pill} onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </header>

      {phase === "setup" && (
        <aside className={`${styles.card} ${styles.setup}`}>
          <p className={styles.eyebrow}>For the grown-ups</p>
          <h1 className={styles.title}>Make it their story</h1>
          <label className={styles.field} htmlFor="harbir-age">Age <strong>{age} years</strong></label>
          <input id="harbir-age" className={styles.slider} type="range" min={3} max={6} value={age} onChange={(event) => setAge(Number(event.target.value))} />
          <div className={styles.marks}><span>3</span><span>4</span><span>5</span><span>6</span></div>
          <label className={styles.field} htmlFor="harbir-language">Language to learn</label>
          <select id="harbir-language" className={styles.select} value={language} onChange={(event) => setLanguage(event.target.value as SceneLanguage)}>
            <option value="ko">Korean · 한국어</option>
            <option value="en">English</option>
          </select>
          <p className={styles.hint}>Story told in {otherLanguage}. New words in {otherLanguage === "English" ? "Korean" : "English"}.</p>
          <span className={styles.field}>A little lesson in…</span>
          <div className={styles.lessons}>
            {(Object.keys(LESSONS) as Lesson[]).map((option) => (
              <button key={option} aria-pressed={lesson === option} onClick={() => setLesson(option)}>
                <strong>{option[0].toUpperCase() + option.slice(1)}</strong>
                <small>{LESSONS[option]}</small>
              </button>
            ))}
          </div>
          <button className={styles.primary} onClick={start}>Begin our adventure</button>
        </aside>
      )}

      {phase === "loading" && !error && <div className={styles.thinking} role="status">Kimi is thinking…</div>}

      {error && (
        <div className={`${styles.card} ${styles.story}`} role="alert">
          <p className={styles.narration}>{error}</p>
          <button className={styles.primary} onClick={() => lastRequest.current && void run(lastRequest.current)}>Try again</button>
        </div>
      )}

      {story && (
        <section className={`${styles.card} ${styles.story}`} aria-live="polite">
          <div className={styles.storyTop}>
            <p className={styles.eyebrow}>{phase === "ending" ? "A happy ending" : "What will Kimi do?"}</p>
            <button className={styles.link} onClick={() => speak(story.scene.narration, meaningLocale(story.settings.language))}>Hear again</button>
          </div>
          <p className={styles.narration} lang={meaningLocale(story.settings.language)}>{story.scene.narration}</p>
          {story.scene.newWords.length > 0 && (
            <div className={styles.words}>
              {story.scene.newWords.map(({ word, meaning }) => (
                <button key={word} onClick={() => speak(word, speechLocale(story.settings.language))}>
                  <strong lang={speechLocale(story.settings.language)}>{word}</strong>
                  <small>{meaning}</small>
                </button>
              ))}
            </div>
          )}
          {phase === "scene" ? (
            <div className={styles.choices}>
              {story.scene.choices.map((choice) => <button key={choice} onClick={() => choose(choice)}>{choice}</button>)}
            </div>
          ) : (
            <div className={styles.ending}>
              <p>Your words: {wordsLearned.join(" · ") || "none yet"}</p>
              <button className={styles.primary} onClick={restart}>Another little adventure</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
