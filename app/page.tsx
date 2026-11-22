"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent } from "react";
import type {
  SceneLanguage,
  SceneRequest,
  SceneResponse,
} from "@/app/api/scene/contract";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import {
  isListeningSupported,
  listenOnce,
  matchesWord,
  meaningLocale,
  speak,
  speechLocale,
  stopSpeaking,
} from "@/lib/speech";
import styles from "./page.module.css";

type Phase = "setup" | "loading" | "scene" | "ending";
type WordStatus = "idle" | "listening" | "praise" | "retry";

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
const subscribeToListeningSupport = () => () => {};
const getServerListeningSupport = () => false;


function StoryStage({
  loading = false,
  hopping = false,
  ending = false,
}: {
  loading?: boolean;
  hopping?: boolean;
  ending?: boolean;
}) {
  const kid = (
    <div className={styles.kidBob}>
      <svg
        className={styles.kidSvg}
        viewBox="0 0 120 140"
        width="120"
        height="140"
        focusable="false"
      >
        <circle cx="30" cy="103" r="11" fill="#f2b58d" />
        <circle cx="90" cy="103" r="11" fill="#f2b58d" />
        <rect x="32" y="76" width="56" height="52" rx="26" fill="#6c4de6" />
        <circle cx="45" cy="125" r="10" fill="#3e2d70" />
        <circle cx="75" cy="125" r="10" fill="#3e2d70" />
        <circle cx="60" cy="48" r="37" fill="#5a3b32" />
        <circle cx="26" cy="53" r="8" fill="#f2b58d" />
        <circle cx="94" cy="53" r="8" fill="#f2b58d" />
        <circle cx="60" cy="52" r="31" fill="#f7c39d" />
        <path
          d="M31 43c3-20 15-30 30-30 17 0 29 11 31 30-10-2-18-8-23-16-9 10-22 15-38 16Z"
          fill="#5a3b32"
        />
        <circle cx="49" cy="52" r="3" fill="#292341" />
        <circle cx="71" cy="52" r="3" fill="#292341" />
        <circle cx="42" cy="62" r="4" fill="#ef9a9a" opacity="0.65" />
        <circle cx="78" cy="62" r="4" fill="#ef9a9a" opacity="0.65" />
        <path
          d="M51 63c5 7 13 7 18 0"
          fill="none"
          stroke="#9c4f55"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M44 91c10 8 22 8 32 0"
          fill="none"
          stroke="#dcd2ff"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );

  return (
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.ground} />
      <div className={styles.kidEnter}>
        {hopping ? <div className={styles.kidHop}>{kid}</div> : kid}
      </div>
      {loading && <div className={styles.thinkingBubble}>...</div>}
      {ending && (
        <div className={styles.confettiBurst}>
          {Array.from({ length: 14 }, (_, index) => (
            <span className={styles.confettiPiece} key={index} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
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
  const [wordStatus, setWordStatus] = useState<Record<string, WordStatus>>({});
  const [listeningWord, setListeningWord] = useState<string | null>(null);
  const lastRequest = useRef<SceneRequest | null>(null);
  const requestId = useRef(0);
  const requestPending = useRef(false);
  const speechGeneration = useRef(0);
  const canListen = useSyncExternalStore(
    subscribeToListeningSupport,
    isListeningSupported,
    getServerListeningSupport,
  );

  const lesson =
    selectedLesson === CUSTOM_LESSON ? customLesson.trim() : selectedLesson;

  const runRequest = useCallback(async (request: SceneRequest) => {
    const id = ++requestId.current;
    requestPending.current = true;
    lastRequest.current = request;
    speechGeneration.current += 1;
    stopSpeaking();
    setListeningWord(null);
    setError(null);
    setPhase("loading");

    try {
      const nextScene = await fetchScene(request);
      if (id !== requestId.current) return;

      setScene(nextScene);
      setWordStatus({});
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
    setWordStatus({});
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

    const request = nextSceneRequest(settings, history, wordsLearned, scene, choice);
    setWordsLearned(request.wordsLearned);
    setHistory(request.history);
    void runRequest(request);
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
    setPhase("setup");
    setSettings(null);
    setScene(null);
    setHistory([]);
    setWordsLearned([]);
    setWordStatus({});
    setListeningWord(null);
    setError(null);
  }

  function readSceneAloud() {
    if (!scene || !settings || listeningWord) return;

    stopSpeaking();
    speak(scene.narration, meaningLocale(settings.language));
    for (const { word, meaning } of scene.newWords) {
      speak(word, speechLocale(settings.language));
      speak(meaning, meaningLocale(settings.language));
    }
  }

  function hearWord(word: string) {
    if (!settings || listeningWord) return;
    stopSpeaking();
    speak(word, speechLocale(settings.language));
  }

  async function practiceWord(word: string) {
    if (!settings || listeningWord || requestPending.current) return;

    const generation = speechGeneration.current;
    stopSpeaking();
    setListeningWord(word);
    setWordStatus((status) => ({ ...status, [word]: "listening" }));

    try {
      const transcript = await listenOnce(speechLocale(settings.language));
      if (generation !== speechGeneration.current) return;

      const matched = matchesWord(transcript, word);
      setWordStatus((status) => ({
        ...status,
        [word]: matched ? "praise" : "retry",
      }));
      speak(word, speechLocale(settings.language));
    } catch {
      if (generation !== speechGeneration.current) return;
      setWordStatus((status) => ({ ...status, [word]: "retry" }));
    } finally {
      if (generation === speechGeneration.current) setListeningWord(null);
    }
  }

  useEffect(() => {
    if (phase !== "setup" || !lesson) return;
    const timer = setTimeout(() => {
      prefetch({ lesson, language, age, history: [], wordsLearned: [] });
    }, 600);
    return () => clearTimeout(timer);
  }, [phase, lesson, language, age]);

  useEffect(() => {
    if (phase !== "scene" || !scene || !settings || scene.lessonComplete) return;
    for (const choice of scene.choices) {
      prefetch(nextSceneRequest(settings, history, wordsLearned, scene, choice));
    }
  }, [phase, scene, settings, history, wordsLearned]);

  useEffect(() => {
    speechGeneration.current += 1;
    stopSpeaking();

    if ((phase === "scene" || phase === "ending") && scene && settings) {
      speak(scene.narration, meaningLocale(settings.language));
      for (const { word, meaning } of scene.newWords) {
        speak(word, speechLocale(settings.language));
        speak(meaning, meaningLocale(settings.language));
      }
    }

    return () => {
      speechGeneration.current += 1;
      stopSpeaking();
    };
  }, [phase, scene, settings]);

  useEffect(
    () => () => {
      requestId.current += 1;
      requestPending.current = false;
      speechGeneration.current += 1;
      stopSpeaking();
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
        <section className={`${styles.panel} ${styles.loadingPanel}`}>
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
              <StoryStage loading hopping={scene !== null} />
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
        <section
          className={`${styles.panel} ${styles.storyPanel} ${
            phase === "ending" ? styles.endingPanel : ""
          }`}
        >
          <div className={styles.storyHeading}>
            <div>
              <p className={styles.eyebrow}>
                {phase === "ending" ? "Lesson complete" : "Story time"}
              </p>
              <h1 className={styles.storyTitle}>
                {phase === "ending" ? "The End" : "What happens next?"}
              </h1>
            </div>
            <button
              type="button"
              className={styles.readAloudButton}
              onClick={readSceneAloud}
              disabled={listeningWord !== null}
            >
              Read aloud
            </button>
          </div>

          <StoryStage ending={phase === "ending"} />

          <p className={styles.narration} lang={speechLocale(settings.language)}>
            {scene.narration}
          </p>

          {scene.newWords.length > 0 && (
            <section className={styles.wordSection} aria-labelledby="new-words">
              <div className={styles.sectionHeading}>
                <h2 id="new-words">New words</h2>
                <p>Tap a word to hear it, then tap Speak to try it yourself.</p>
              </div>
              <div className={styles.wordGrid}>
                {scene.newWords.map(({ word, meaning }, index) => {
                  const status = wordStatus[word] ?? "idle";
                  return (
                    <article
                      className={styles.wordCard}
                      key={`${word}-${index}`}
                    >
                      {status === "praise" && (
                        <div className={styles.starBurst} aria-hidden="true">
                          {Array.from({ length: 6 }, (_, starIndex) => (
                            <span className={styles.star} key={starIndex}>
                              ★
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className={styles.wordButton}
                        onClick={() => hearWord(word)}
                        disabled={listeningWord !== null}
                        aria-label={`Hear ${word}`}
                        lang={speechLocale(settings.language)}
                      >
                        {word}
                      </button>
                      <p
                        className={styles.meaning}
                        lang={meaningLocale(settings.language)}
                      >
                        {meaning}
                      </p>
                      {canListen && (
                        <button
                          type="button"
                          className={styles.speakButton}
                          disabled={listeningWord !== null}
                          onClick={() => void practiceWord(word)}
                          aria-label={`Speak ${word}`}
                        >
                          {status === "listening" ? "Listening…" : "Speak"}
                        </button>
                      )}
                      <div className={styles.feedback} aria-live="polite">
                        {status === "praise" && (
                          <p className={styles.praise}>
                            Great job! You said it.
                          </p>
                        )}
                        {status === "retry" && (
                          <p className={styles.gentleRetry}>
                            Nice try. Hear the word once more, then try again.
                          </p>
                        )}
                        {status === "listening" && (
                          <p className={styles.listeningHint}>
                            Say the word when you&apos;re ready.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {phase === "scene" && (
            <section className={styles.choiceSection} aria-labelledby="choices">
              <h2 id="choices">What do you choose?</h2>
              <div className={styles.choices}>
                {scene.choices.map((choice, index) => (
                  <button
                    key={`${choice}-${index}`}
                    type="button"
                    className={styles.choiceButton}
                    onClick={() => choose(choice)}
                    lang={speechLocale(settings.language)}
                  >
                    <span className={styles.choiceNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{choice}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {phase === "ending" && (
            <div className={styles.endingContent}>
              {wordsLearned.length > 0 && (
                <section className={styles.learnedSection} aria-labelledby="learned">
                  <h2 id="learned">Words you learned</h2>
                  <div className={styles.learnedWords}>
                    {wordsLearned.map((word) => (
                      <span className={styles.learnedWord} key={word}>
                        {word}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              <p className={styles.endingMessage}>
                Every choice helps a little lesson grow. Well done!
              </p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={restart}
              >
                Make another story
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
