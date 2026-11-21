"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { SceneLanguage, SceneLine, SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import { Icon } from "@/components/kay/icons";
import { randomOpening } from "@/lib/openings";
import type { OpeningId } from "@/lib/openings";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import { isListeningSupported, listenOnce, matchesWord, meaningLocale, speak, speechLocale, stopListening, stopSpeaking } from "@/lib/speech";
import type { Voice } from "@/lib/voices";
import type { Stage } from "@/lib/world";
import type { Talk } from "./bodies";
import Landing from "./landing";
import { LESSONS, OWN, OWN_CARD, SAY_WORDS_UNDER_AGE } from "./lessons";
import type { Localized } from "./lessons";
import styles from "./tales.module.css";

const TalesStage = dynamic(() => import("./stage"), {
  ssr: false,
  loading: () => <div className={styles.worldLoading}><Icon name="leaf" size={32} /><span>The meadow is waking up…</span></div>,
});

type Phase = "home" | "loading" | "playing" | "choosing" | "ending";
type SayState = "idle" | "listening" | "yay" | "retry";
type Settings = Pick<SceneRequest, "lesson" | "language" | "age" | "opening">;

const SPEAKERS: Record<Voice, { name: Localized; color: string }> = {
  narrator: { name: { ko: "이야기", en: "Story" }, color: "#71836a" },
  hero: { name: { ko: "키미", en: "Kimi" }, color: "#d78068" },
  friend: { name: { ko: "모모", en: "Momo" }, color: "#638eab" },
  puppy: { name: { ko: "보리", en: "Bori" }, color: "#b69a43" },
  grownup: { name: { ko: "부엉이 할머니", en: "Grandma Owl" }, color: "#9783ad" },
  kitten: { name: { ko: "나비", en: "Nabi" }, color: "#d39a5c" },
  duck: { name: { ko: "도도", en: "Dodo" }, color: "#c9a93c" },
};

/** Everyone gathers on the path and waves while the parent sets up the story. */
const WELCOME: Stage = {
  weather: "sunny",
  cast: [{ actor: "hero", at: "path" }, { actor: "friend", at: "path" }, { actor: "puppy", at: "path" }, { actor: "grownup", at: "bench" }],
  props: [],
  beats: [
    { actor: "hero", action: "wave" },
    { actor: "puppy", action: "jump" },
    { actor: "friend", action: "wave" },
    { actor: "hero", action: "dance" },
  ],
};

interface Caption { voice: Voice; text: string }

const subscribeNothing = () => () => {};
const notSupported = () => false;
function motionPreference(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Tales() {
  const [phase, setPhase] = useState<Phase>("home");
  const [age, setAge] = useState(5);
  const [language, setLanguage] = useState<SceneLanguage>("ko");
  const [lesson, setLesson] = useState("kindness");
  const [ownLesson, setOwnLesson] = useState("");
  // The server render has no story yet; the browser picks a random opening so first scenes vary.
  const [opening, setOpening] = useState<OpeningId>(() => (typeof window === "undefined" ? "balloon" : randomOpening()));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [history, setHistory] = useState<SceneRequest["history"]>([]);
  const [wordsLearned, setWordsLearned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [talk, setTalk] = useState<Talk>({ line: null, speaking: false });
  const [replay, setReplay] = useState(0);
  const [muted, setMuted] = useState(false);
  const [sayState, setSayState] = useState<SayState>("idle");
  const [scenesPlayed, setScenesPlayed] = useState(0);
  const requestId = useRef(0);
  const lastRequest = useRef<SceneRequest | null>(null);
  const mutedRef = useRef(false);
  const canListen = useSyncExternalStore(subscribeNothing, isListeningSupported, notSupported);
  const reducedMotion = useSyncExternalStore(motionPreference, prefersReducedMotion, notSupported);

  /** The UI speaks the language the child already knows; only new words use the one being learned. */
  const home: SceneLanguage = language === "ko" ? "en" : "ko";
  const t = (korean: string, english: string) => (home === "ko" ? korean : english);
  const chosenLesson = lesson === OWN ? ownLesson.trim() : lesson;

  function stopAll() {
    requestId.current += 1;
    stopSpeaking();
    stopListening();
  }

  /** Narration, then each line in its speaker's voice. Muted, captions stay up long enough to read. */
  async function perform(next: SceneResponse, locale: string, id: number) {
    const steps: { voice: Voice; text: string; line: SceneLine | null }[] = [
      { voice: "narrator", text: next.narration, line: null },
      ...next.lines.map((line) => ({ voice: line.speaker, text: line.text, line })),
    ];
    setPhase("playing");
    for (const step of steps) {
      if (id !== requestId.current) return;
      setCaption({ voice: step.voice, text: step.text });
      setTalk({ line: step.line, speaking: false });
      if (mutedRef.current) {
        setTalk({ line: step.line, speaking: true });
        await wait(Math.max(1800, step.text.length * 70));
      } else {
        await speak(step.text, locale, { voice: step.voice, onStart: () => { if (id === requestId.current) setTalk({ line: step.line, speaking: true }); } });
      }
      if (id !== requestId.current) return;
      setTalk({ line: step.line, speaking: false });
      await wait(350);
    }
    if (id !== requestId.current) return;
    setTalk({ line: null, speaking: false });
    setPhase(next.lessonComplete ? "ending" : "choosing");
  }

  async function run(request: SceneRequest) {
    stopAll();
    const id = requestId.current;
    lastRequest.current = request;
    setSayState("idle");
    setError(null);
    setCaption(null);
    setPhase("loading");
    try {
      const next = await fetchScene(request);
      if (id !== requestId.current) return;
      setScene(next);
      setScenesPlayed((count) => count + 1);
      if (next.lessonComplete) setWordsLearned((learned) => dedupeWords([...learned, ...next.newWords.map(({ word }) => word)]));
      await perform(next, meaningLocale(request.language), id);
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : t("이야기가 멈췄어요.", "The story got stuck."));
    }
  }

  function start() {
    if (!chosenLesson) return;
    const next = { lesson: chosenLesson, language, age, opening };
    setSettings(next);
    setHistory([]);
    setWordsLearned([]);
    setScenesPlayed(0);
    void run({ ...next, history: [], wordsLearned: [] });
  }

  function choose(choice: string) {
    if (phase !== "choosing" || !scene || !settings) return;
    const request = nextSceneRequest(settings, history, wordsLearned, scene, choice);
    setHistory(request.history);
    setWordsLearned(request.wordsLearned);
    void run(request);
  }

  function watchAgain() {
    if (!scene || !settings) return;
    stopAll();
    setReplay((count) => count + 1);
    void perform(scene, meaningLocale(settings.language), requestId.current);
  }

  function skipToChoice() {
    if (!scene) return;
    stopAll();
    setTalk({ line: null, speaking: false });
    setPhase(scene.lessonComplete ? "ending" : "choosing");
  }

  function goHome() {
    stopAll();
    setOpening(randomOpening());
    setScene(null);
    setSettings(null);
    setCaption(null);
    setError(null);
    setTalk({ line: null, speaking: false });
    setReplay((count) => count + 1);
    setPhase("home");
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (mutedRef.current) stopSpeaking();
  }

  async function sayWord() {
    if (!scene || !settings || sayState === "listening") return;
    const id = requestId.current;
    setSayState("listening");
    try {
      const transcript = await listenOnce(speechLocale(settings.language));
      if (id !== requestId.current) return;
      if (scene.newWords.some(({ word }) => matchesWord(transcript, word))) {
        cheer(id);
        return;
      }
    } catch {
      if (id !== requestId.current) return;
    }
    setSayState("retry");
    const first = scene.newWords[0];
    if (first) void speak(first.word, speechLocale(settings.language), { voice: "hero" });
  }

  function cheer(id = requestId.current) {
    if (!scene) return;
    setSayState("yay");
    setTimeout(() => { if (id === requestId.current) choose(scene.choices[0]); }, 1000);
  }

  useEffect(() => () => { stopListening(); stopSpeaking(); }, []);

  useEffect(() => {
    // Warm up the first scene for preset lessons; an own lesson changes on every key.
    if (phase !== "home" || lesson === OWN) return;
    const timer = setTimeout(() => prefetch({ lesson, language, age, opening, history: [], wordsLearned: [] }), 600);
    return () => clearTimeout(timer);
  }, [phase, lesson, language, age, opening]);

  useEffect(() => {
    if ((phase !== "playing" && phase !== "choosing") || !scene || !settings || scene.lessonComplete) return;
    for (const choice of scene.choices) prefetch(nextSceneRequest(settings, history, wordsLearned, scene, choice));
  }, [phase, scene, settings, history, wordsLearned]);

  const stage = scene?.stage ?? WELCOME;
  const speaker = caption ? SPEAKERS[caption.voice] : SPEAKERS.narrator;
  const lessonCard = LESSONS.find(({ id }) => id === settings?.lesson);
  const sayWords = !!settings && settings.age < SAY_WORDS_UNDER_AGE && !!scene && scene.newWords.length > 0;
  const learnLocale = speechLocale(settings?.language ?? language);

  return (
    <main className={`${styles.theater} ${phase === "home" ? "" : styles.storyMode}`} lang={home}>
      <div className={styles.stage}>
        <TalesStage stage={stage} replay={replay} talk={talk} paused={false} overview={phase === "home"} reducedMotion={reducedMotion} />
      </div>
      <div className={styles.vignette} />

      {phase !== "home" && <header className={styles.header}>
        <button className={styles.brand} onClick={goHome} aria-label="KimiTales home" style={{ background: "none", border: 0, color: "inherit", textAlign: "left" }}>
          KimiTales
        </button>
        <div className={styles.headerActions}>
          <button className={styles.roundButton} aria-label={t("처음으로", "Back to start")} onClick={goHome}><Icon name="home" /></button>
          <button className={styles.roundButton} aria-label={muted ? t("소리 켜기", "Unmute") : t("소리 끄기", "Mute")} aria-pressed={muted} onClick={toggleMute}><Icon name={muted ? "muted" : "volume"} /></button>
        </div>
      </header>}

      {phase === "home" ? <Landing home={home} age={age} language={language} lesson={lesson} ownLesson={ownLesson} onAge={setAge} onLanguage={setLanguage} onLesson={setLesson} onOwnLesson={setOwnLesson} onStart={start} /> : <>
        <div className={styles.episode}>
          <span className={styles.episodeIcon} style={{ color: lessonCard?.color ?? OWN_CARD.color }}><Icon name={lessonCard?.icon ?? "spark"} size={18} /></span>
          <div><strong>{lessonCard?.name[home] ?? settings?.lesson}</strong><span>{t(`${scenesPlayed}번째 장면`, `Scene ${scenesPlayed}`)}</span></div>
        </div>

        {phase === "loading" && !error && <div className={styles.thinking} role="status"><span className={styles.spinner} />{t("키미가 다음 이야기를 쓰고 있어요…", "Kimi is writing what happens next…")}</div>}

        {error && <div className={styles.alert} role="alert">
          <p>{error}</p>
          <button className={styles.primary} onClick={() => lastRequest.current && void run(lastRequest.current)}><Icon name="replay" size={18} />{t("다시 해 볼게요", "Try again")}</button>
        </div>}

        {phase === "playing" && caption && <section className={styles.dialogue} aria-live="polite" aria-label={t("이야기", "Story")}>
          <div className={styles.speakerTag} style={{ "--speaker": speaker.color } as CSSProperties}><span className={talk.speaking ? styles.voiceBars : styles.voiceIdle}><i /><i /><i /></span>{speaker.name[home]}</div>
          <p key={`${caption.voice}:${caption.text}`} className={styles.line}>{caption.text}</p>
          <div className={styles.playControls}>
            <button aria-label={t("처음부터 다시 보기", "Watch this part again")} onClick={watchAgain}><Icon name="replay" size={18} /></button>
            <span>{t("친구들의 이야기를 들어봐요", "Let’s listen to our friends")}</span>
            <button className={styles.nextLine} onClick={skipToChoice}>{t("건너뛰기", "Skip")}</button>
          </div>
        </section>}

        {phase === "choosing" && scene && settings && <section className={`${styles.decision} ${sayWords ? styles.speakingGame : ""}`}>
          <div className={styles.gameSpeaker}><span className={styles.kimiAvatar}>K</span><span>{t("키미가 너에게 물어봐요", "Kimi is asking you!")}</span><span className={styles.turnBadge}>{t("네 차례", "YOUR TURN")}</span></div>
          {sayWords ? <>
            <p className={styles.invitationText}>{t("이 말을 같이 해 볼까?", "Can you say this with Kimi?")}</p>
            <div className={styles.words}>{scene.newWords.map(({ word, meaning }) => <button key={word} onClick={() => void speak(word, learnLocale, { voice: "hero" })}><strong lang={learnLocale}>{word}</strong><small>{meaning}</small></button>)}</div>
            <div className={styles.practiceButtons}>
              {canListen && sayState !== "yay" && <button className={styles.micButton} onClick={() => void sayWord()} disabled={sayState === "listening"}><Icon name="mic" size={23} />{sayState === "listening" ? t("듣고 있어!", "I’m listening!") : t("키미에게 말하기", "Talk to Kimi")}</button>}
            </div>
            <p className={styles.feedback} role="status">{sayState === "yay" ? t("잘했어!", "Great job!") : sayState === "retry" ? t("다시 같이 말해 볼까?", "Let’s try together again.") : sayState === "listening" ? t("네 목소리를 기다리고 있어…", "Kimi is waiting for your voice…") : ""}</p>
            {sayState !== "yay" && <button className={styles.saidItButton} onClick={() => cheer()}><Icon name="check" size={17} />{t("말했어요!", "I said it!")}</button>}
          </> : <>
            <h2>{t("키미는 어떻게 할까?", "What should Kimi do?")}</h2>
            <div className={styles.choices}>
              {scene.choices.map((choice) => <button key={choice} onClick={() => choose(choice)}><span className={styles.choicePortrait} style={{ background: SPEAKERS.hero.color }}>K</span><span>{choice}</span></button>)}
            </div>
            <p className={styles.waitingHint}><button className={styles.nextLine} style={{ background: "none", border: 0, color: "inherit" }} onClick={watchAgain}>{t("다시 보기", "Watch again")}</button></p>
          </>}
        </section>}

        {phase === "ending" && <section className={styles.ending}>
          <div className={styles.endSeal}><Icon name="kindness" size={32} /></div>
          <p className={styles.cardEyebrow}>{t("오늘도 마음이 한 뼘 자랐어요", "A LITTLE KINDER. A LITTLE CLOSER.")}</p>
          <h2>{t("함께라서 참 좋다!", "Better, together.")}</h2>
          <p>{t("오늘 배운 단어", "Words we learned today")}</p>
          <div className={styles.wordList}>{wordsLearned.length ? wordsLearned.map((word) => <span key={word} lang={learnLocale}>{word}</span>) : <span>{t("다음에 또 배워요", "More next time")}</span>}</div>
          <div className={styles.endingActions}>
            <button className={styles.primary} onClick={goHome}><Icon name="book" size={18} />{t("다른 이야기", "Another little story")}</button>
            <button className={styles.secondary} onClick={watchAgain}><Icon name="replay" size={18} />{t("다시 보기", "Watch again")}</button>
          </div>
        </section>}
      </>}
    </main>
  );
}
