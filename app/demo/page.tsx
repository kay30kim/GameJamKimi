"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import AnimatedStory from "@/components/demo/game/animated-story";
import type { FormEvent } from "react";
import type {
  SceneLanguage,
  SceneRequest,
  SceneResponse,
} from "@/app/api/scene/contract";
import { fetchScene } from "@/lib/demo/scene";
import { stopSpeaking, stopListening } from "@/lib/demo/speech";
import styles from "./page.module.css";

type Phase = "setup" | "loading" | "scene" | "ending";

interface GameSettings {
  lesson: string;
  language: SceneLanguage;
  age: number;
}

const LESSONS = [
  "kindness",
  "empathy",
  "sharing",
  "honesty",
  "patience",
  "sacrifice",
] as const;
const CUSTOM_LESSON = "custom";

function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of words) {
    const trimmed = word.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

const LoadingForest = dynamic(() => import("@/components/demo/forest-stage"), { ssr: false });

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedLesson, setSelectedLesson] = useState<string>(LESSONS[0]);
  const [customLesson, setCustomLesson] = useState("");
  const [language, setLanguage] = useState<SceneLanguage>("en");
  const [age, setAge] = useState(5);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [history, setHistory] = useState<SceneRequest["history"]>([]);
  const [wordsLearned, setWordsLearned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastRequest = useRef<SceneRequest | null>(null);
  const requestId = useRef(0);
  const requestPending = useRef(false);
  const speechGeneration = useRef(0);

  const lesson =
    selectedLesson === CUSTOM_LESSON ? customLesson.trim() : selectedLesson;

  const runRequest = useCallback(async (request: SceneRequest) => {
    const id = ++requestId.current;
    requestPending.current = true;
    lastRequest.current = request;
    speechGeneration.current += 1;
    stopSpeaking();
    stopListening();
    setError(null);
    setPhase("loading");

    try {
      const nextScene = await fetchScene(request);
      if (id !== requestId.current) return;

      setScene(nextScene);
      if (nextScene.lessonComplete) {
        setWordsLearned((learned) =>
          dedupeWords([
            ...learned,
            ...nextScene.newWords.map(({ word }) => word),
          ]),
        );
        setPhase("ending");
      } else {
        setPhase("scene");
      }
    } catch (requestError) {
      if (id !== requestId.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The story got stuck. Please try again.",
      );
    } finally {
      if (id === requestId.current) requestPending.current = false;
    }
  }, []);

  function startStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lesson || requestPending.current) return;

    const nextSettings = { lesson, language, age };
    setSettings(nextSettings);
    setScene(null);
    setHistory([]);
    setWordsLearned([]);
    void runRequest({
      ...nextSettings,
      history: [],
      wordsLearned: [],
    });
  }

  function choose(choice: string) {
    if (
      phase !== "scene" ||
      !scene ||
      !settings ||
      scene.lessonComplete ||
      requestPending.current
    ) {
      return;
    }

    const nextWords = dedupeWords([
      ...wordsLearned,
      ...scene.newWords.map(({ word }) => word),
    ]);
    const nextHistory = [
      ...history,
      { narration: scene.narration, choice },
    ];

    setWordsLearned(nextWords);
    setHistory(nextHistory);
    void runRequest({
      lesson: settings.lesson,
      language: settings.language,
      age: settings.age,
      wordsLearned: nextWords,
      history: nextHistory,
    });
  }

  function retryLastRequest() {
    if (lastRequest.current && !requestPending.current) {
      void runRequest(lastRequest.current);
    }
  }

  function restart() {
    requestId.current += 1;
    requestPending.current = false;
    lastRequest.current = null;
    speechGeneration.current += 1;
    stopSpeaking();
    stopListening();
    setPhase("setup");
    setSettings(null);
    setScene(null);
    setHistory([]);
    setWordsLearned([]);
    setError(null);
  }

  useEffect(
    () => () => {
      requestId.current += 1;
      requestPending.current = false;
      speechGeneration.current += 1;
      stopSpeaking();
    stopListening();
    },
    [],
  );

  return (
    <main
      className={styles.shell}
      aria-busy={phase === "loading" && !error}
    >
      <div className={styles.sun} aria-hidden="true" />
      <div className={styles.cloudOne} aria-hidden="true" />
      <div className={styles.cloudTwo} aria-hidden="true" />

      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          A
        </span>
        <span>Alicetales</span>
      </div>

      {phase === "setup" && (
        <section className={`${styles.panel} ${styles.setupPanel}`}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>A story made for your little one</p>
            <h1 className={styles.title}>Big lessons. Little stories.</h1>
            <p className={styles.subtitle}>
              Choose a lesson, then read, listen, speak, and decide what happens
              next together.
            </p>
          </div>

          <form className={styles.setupForm} onSubmit={startStory}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Today&apos;s lesson</legend>
              <div className={styles.chips}>
                {LESSONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${styles.chip} ${
                      selectedLesson === preset ? styles.selected : ""
                    }`}
                    aria-pressed={selectedLesson === preset}
                    onClick={() => setSelectedLesson(preset)}
                  >
                    {preset[0].toUpperCase() + preset.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.chip} ${
                    selectedLesson === CUSTOM_LESSON ? styles.selected : ""
                  }`}
                  aria-pressed={selectedLesson === CUSTOM_LESSON}
                  onClick={() => setSelectedLesson(CUSTOM_LESSON)}
                >
                  My own lesson
                </button>
              </div>
              {selectedLesson === CUSTOM_LESSON && (
                <div className={styles.customLesson}>
                  <label htmlFor="custom-lesson">
                    What should the story teach?
                  </label>
                  <input
                    id="custom-lesson"
                    className={styles.textInput}
                    value={customLesson}
                    onChange={(event) => setCustomLesson(event.target.value)}
                    maxLength={500}
                    placeholder="For example: being brave at a new school"
                    autoFocus
                    required
                  />
                </div>
              )}
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Learning</legend>
              <div className={styles.languageChoices}>
                <button
                  type="button"
                  className={`${styles.languageButton} ${
                    language === "en" ? styles.selected : ""
                  }`}
                  aria-pressed={language === "en"}
                  onClick={() => setLanguage("en")}
                >
                  English
                </button>
                <button
                  type="button"
                  className={`${styles.languageButton} ${
                    language === "ko" ? styles.selected : ""
                  }`}
                  aria-pressed={language === "ko"}
                  onClick={() => setLanguage("ko")}
                  lang="ko"
                >
                  한국어
                </button>
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>
                Child&apos;s age: <strong>{age}</strong>
              </legend>
              <input
                className={styles.ageSlider}
                type="range"
                min={3}
                max={6}
                step={1}
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
                aria-label="Child's age"
                aria-valuetext={`${age} years old`}
              />
              <div className={styles.sliderMarks} aria-hidden="true">
                {[3, 4, 5, 6].map((mark) => (
                  <span key={mark}>{mark}</span>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!lesson}
            >
              Start the story
            </button>
          </form>
        </section>
      )}

      {phase === "loading" && (
        <section className={styles.animatedLoading}>
          {error ? (
            <>
              <p className={styles.eyebrow}>The story paused</p>
              <h1 className={styles.loadingTitle}>Let&apos;s try that again</h1>
              <p className={styles.errorText} role="alert">
                {error}
              </p>
              <div className={styles.errorActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={retryLastRequest}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={restart}
                >
                  Start over
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.loadingWorld}><LoadingForest motion="idle" paused={false} age={age}/></div>
              <div className={styles.loadingContent} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                <h1 className={styles.loadingTitle}>Making your story…</h1>
                <p>A new adventure is on its way.</p>
              </div>
            </>
          )}
        </section>
      )}

      {(phase === "scene" || phase === "ending") && scene && settings && (
        <AnimatedStory key={history.length} scene={scene} language={settings.language} age={settings.age}
          firstScene={history.length === 0} onChoose={choose} onExit={restart} />
      )}
    </main>
  );
}
