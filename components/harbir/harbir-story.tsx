"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SceneLanguage, SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import { isListeningSupported, listenOnce, matchesWord, meaningLocale, speak, speechLocale, stopListening, stopSpeaking } from "@/lib/speech";
import styles from "./harbir.module.css";
import Landing from "./landing";
import SetupFlow, { type Lesson } from "./setup-flow";

const MeadowStage = dynamic(() => import("./meadow-stage"), {
  ssr: false,
  loading: () => <div className={styles.stageLoading}>Opening the meadow…</div>,
});

type Phase = "landing" | "setup" | "loading" | "scene" | "ending";
/** Children under this age say the new words instead of picking a choice. */
const SAY_WORDS_UNDER_AGE = 4;
type SayState = "idle" | "listening" | "yay" | "retry";
type Settings = Pick<SceneRequest, "lesson" | "language" | "age">;

const subscribeNothing = () => () => {};
const notSupported = () => false;

export default function HarbirStory() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [lesson, setLesson] = useState<Lesson>("kindness");
  const [language, setLanguage] = useState<SceneLanguage>("ko");
  const [age, setAge] = useState(5);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [history, setHistory] = useState<SceneRequest["history"]>([]);
  const [wordsLearned, setWordsLearned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const [sayState, setSayState] = useState<SayState>("idle");
  const requestId = useRef(0);
  const lastRequest = useRef<SceneRequest | null>(null);
  const canListen = useSyncExternalStore(subscribeNothing, isListeningSupported, notSupported);

  async function run(request: SceneRequest) {
    const id = ++requestId.current;
    lastRequest.current = request;
    stopSpeaking();
    stopListening();
    setSayState("idle");
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

  async function sayWord() {
    if (!story || sayState === "listening") return;
    const id = requestId.current;
    setSayState("listening");
    try {
      const transcript = await listenOnce(speechLocale(story.settings.language));
      if (id !== requestId.current) return;
      if (story.scene.newWords.some(({ word }) => matchesWord(transcript, word))) {
        setSayState("yay");
        setTimeout(() => {
          if (id === requestId.current) choose(story.scene.choices[0]);
        }, 1000);
        return;
      }
    } catch {
      if (id !== requestId.current) return;
    }
    setSayState("retry");
    const first = story.scene.newWords[0];
    if (first) speak(first.word, speechLocale(story.settings.language));
  }

  function restart() {
    requestId.current += 1;
    stopListening();
    stopSpeaking();
    setError(null);
    setPhase("setup");
    setScene(null);
    setSettings(null);
  }

  useEffect(() => () => stopListening(), []);

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

  const story = (phase === "scene" || phase === "ending") && scene && settings ? { scene, settings } : null;
  const sayWords = story !== null && story.settings.age < SAY_WORDS_UNDER_AGE;
  const canSay = sayWords && story.scene.newWords.length > 0 && canListen;

  if (phase === "landing") return <Landing onBegin={() => setPhase("setup")} />;
  if (phase === "setup") {
    return (
      <SetupFlow
        age={age}
        language={language}
        lesson={lesson}
        onAge={setAge}
        onLanguage={setLanguage}
        onLesson={setLesson}
        onStart={start}
        onExit={() => setPhase("landing")}
      />
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.stage} aria-label="Story stage">
        {scene && <MeadowStage stage={scene.stage} replay={replay} />}
      </div>

      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}><span aria-hidden="true">a.</span>Alicetales</Link>
        <div className={styles.topActions}>
          {story && <button className={styles.pill} onClick={() => setReplay((n) => n + 1)}>Watch again</button>}
        </div>
      </header>

      {phase === "loading" && !error && <div className={styles.thinking} role="status">Alice is thinking…</div>}

      {error && (
        <div className={`${styles.card} ${styles.story}`} role="alert">
          <p className={styles.narration}>{error}</p>
          <button className={styles.primary} onClick={() => lastRequest.current && void run(lastRequest.current)}>Try again</button>
        </div>
      )}

      {story && (
        <section className={`${styles.card} ${styles.story}`} aria-live="polite">
          <div className={styles.storyTop}>
            <p className={styles.eyebrow}>{phase === "ending" ? "A happy ending" : "What will Alice do?"}</p>
            <button className={styles.link} onClick={() => speak(story.scene.narration, meaningLocale(story.settings.language))}>Hear again</button>
          </div>
          <p className={styles.narration} lang={meaningLocale(story.settings.language)}>{story.scene.narration}</p>
          {sayWords && story.scene.newWords.length > 0 && (
            <div className={styles.words}>
              {story.scene.newWords.map(({ word, meaning }) => (
                <button key={word} onClick={() => speak(word, speechLocale(story.settings.language))}>
                  <strong lang={speechLocale(story.settings.language)}>{word}</strong>
                  <small>{meaning}</small>
                </button>
              ))}
            </div>
          )}
          {phase === "scene" && sayWords ? (
            <div className={styles.sayIt}>
              {canSay && sayState !== "yay" && (
                <button className={styles.primary} disabled={sayState === "listening"} onClick={() => void sayWord()}>
                  {sayState === "listening" ? "Listening…" : "Say it!"}
                </button>
              )}
              {sayState !== "yay" && (
                <button className={canSay ? styles.pill : styles.primary} onClick={() => choose(story.scene.choices[0])}>
                  {canSay ? "Skip" : "Next"}
                </button>
              )}
              <p role="status">{sayState === "yay" ? "Great job!" : sayState === "retry" ? "Try again!" : ""}</p>
            </div>
          ) : phase === "scene" ? (
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
