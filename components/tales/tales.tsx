"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { SceneLanguage, SceneRequest, SceneResponse } from "@/app/api/scene/contract";
import { Icon } from "@/components/kay/icons";
import { randomOpening } from "@/lib/openings";
import type { OpeningId } from "@/lib/openings";
import { dedupeWords, fetchScene, nextSceneRequest, prefetch } from "@/lib/scene";
import { ScenePlayback } from "@/lib/scene-playback";
import { isListeningSupported, listenOnce, matchesWord, pauseSpeaking, resumeSpeaking, speak, speechLocale, stopListening, stopSpeaking } from "@/lib/speech";
import type { SpeechErrorCode } from "@/lib/speech-policy";
import type { CameraFrame } from "@/lib/camera-director";
import { practiceInvitation, topicEnding } from "@/lib/teaching";
import { listeningFeedback, orderedChoices } from "@/lib/player-ui";
import { storyText } from "@/lib/story-text";
import type { Voice } from "@/lib/voices";
import type { Stage, WorldSnapshot } from "@/lib/world";
import type { Talk } from "./bodies";
import Landing from "./landing";
import { LESSONS, OWN, OWN_CARD } from "./lessons";
import type { Localized } from "./lessons";
import styles from "./tales.module.css";

const TalesStage = dynamic(() => import("./stage"), {
  ssr: false,
  loading: () => <div className={styles.worldLoading}><Icon name="leaf" size={32} /><span>The meadow is waking up...</span></div>,
});

type Phase = "home" | "loading" | "playing" | "practicing" | "choosing" | "ending";
type SayState = "idle" | "listening" | "yay" | "retry";
type Settings = Pick<SceneRequest, "lesson" | "language" | "age" | "opening">;

const SPEAKERS: Record<Voice, { name: Localized; color: string }> = {
  narrator: { name: { ko: "이야기", en: "Story" }, color: "#71836a" },
  hero: { name: { ko: "앨리스", en: "Alice" }, color: "#d78068" },
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
interface SpokenPrompt { text: string; choice?: number }

const subscribeNothing = () => () => {};
const notSupported = () => false;
function motionPreference(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface TalesProps {
  /** Local QA can exercise the real player with a deterministic story source. */
  loadScene?: typeof fetchScene;
  warmScene?: typeof prefetch;
  speakLine?: typeof speak;
}

export default function Tales({ loadScene = fetchScene, warmScene = prefetch, speakLine = speak }: TalesProps = {}) {
  const theater = useRef<HTMLElement>(null);
  const [cameraFrame, setCameraFrame] = useState<CameraFrame>({ top: 0.12, bottom: 0.3 });
  const [phase, setPhase] = useState<Phase>("home");
  const [age, setAge] = useState(5);
  const [language, setLanguage] = useState<SceneLanguage>("ko");
  const [lesson, setLesson] = useState("kindness");
  const [ownLesson, setOwnLesson] = useState("");
  // The server render has no story yet; the browser picks a random opening so first scenes vary.
  const [opening, setOpening] = useState<OpeningId>(() => (typeof window === "undefined" ? "balloon" : randomOpening("kindness")));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [continuation, setContinuation] = useState<SceneRequest["continuation"]>();
  const [history, setHistory] = useState<SceneRequest["history"]>([]);
  const [wordsLearned, setWordsLearned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<SpeechErrorCode | null>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [talk, setTalk] = useState<Talk>({ line: null, speaking: false });
  const [playback, setPlayback] = useState<ScenePlayback | null>(null);
  const [replay, setReplay] = useState(0);
  const [muted, setMuted] = useState(false);
  const [sayState, setSayState] = useState<SayState>("idle");
  const [practiceCaption, setPracticeCaption] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null);
  const [readingChoice, setReadingChoice] = useState<number | null>(null);
  const [panelSpeaking, setPanelSpeaking] = useState(false);
  const [panelCaption, setPanelCaption] = useState("");
  const [paused, setPaused] = useState(false);
  const [scenesPlayed, setScenesPlayed] = useState(0);
  const requestId = useRef(0);
  const lastRequest = useRef<SceneRequest | null>(null);
  const mutedRef = useRef(false);
  const playbackRef = useRef<ScenePlayback | null>(null);
  const practiceSpeech = useRef(0);
  const manuallyPaused = useRef(false);
  const canListen = useSyncExternalStore(subscribeNothing, isListeningSupported, notSupported);
  const reducedMotion = useSyncExternalStore(motionPreference, prefersReducedMotion, notSupported);

  /** The selected learning language is also the interface and story's main language. */
  const home = language;
  const t = (korean: string, english: string) => (home === "ko" ? korean : english);
  const chosenLesson = lesson === OWN ? ownLesson.trim() : lesson;

  function stopAll() {
    requestId.current += 1;
    practiceSpeech.current += 1;
    playbackRef.current?.cancel();
    stopSpeaking();
    stopListening();
    setTalk((current) => ({ ...current, speaking: false, level: 0 }));
    setReadingChoice(null);
    setPanelSpeaking(false);
    manuallyPaused.current = false;
    setPaused(false);
  }

  /** Speech and its actions finish together before another line or choice appears. */
  async function perform(next: SceneResponse, primary: SceneLanguage, id: number, previous?: WorldSnapshot, learned = wordsLearned) {
    const performance = new ScenePlayback(next, {
      locale: speechLocale(primary),
      isMuted: () => mutedRef.current,
      speak: speakLine,
      onSegment: (segment) => {
        if (id !== requestId.current) return;
        setSpeechError(null);
        setCaption({ voice: segment.voice, text: segment.text });
        setTalk({ line: segment.line, speaking: false });
      },
      onSpeaking: (speaking) => {
        if (id !== requestId.current) return;
        setTalk((current) => ({ ...current, speaking }));
        if (speaking) setSpeechError(null);
      },
      onLevel: (level) => {
        if (id === requestId.current) setTalk((current) => ({ ...current, level }));
      },
      onSpeechError: (failure) => {
        if (id === requestId.current && !mutedRef.current) setSpeechError(failure);
      },
    }, previous);
    playbackRef.current = performance;
    if (document.hidden || manuallyPaused.current) {
      performance.pause();
      pauseSpeaking();
    }
    setPlayback(performance);
    setPhase("playing");
    const completed = await performance.play();
    if (!completed || id !== requestId.current) return;
    setTalk((current) => ({ ...current, speaking: false }));
    setContinuation({ world: performance.snapshot(), previousLines: next.lines, previousBeats: next.stage.beats });
    if (next.newWords.length) {
      setSayState("idle");
      setPhase("practicing");
      sayPractice(practiceInvitation(primary, next.newWords[0].word), primary);
    } else {
      presentDecision(next, primary, learned);
    }
  }

  async function run(request: SceneRequest) {
    // Freeze and carry the world the child can currently see through loading.
    const previous = request.history.length > 0
      ? playbackRef.current?.snapshot() ?? request.continuation?.world
      : undefined;
    stopAll();
    const id = requestId.current;
    lastRequest.current = request;
    setSayState("idle");
    setPracticeFeedback(null);
    setError(null);
    setSpeechError(null);
    setCaption(null);
    setContinuation(undefined);
    setPhase("loading");
    try {
      const next = await loadScene(request);
      if (id !== requestId.current) return;
      setScene(next);
      setScenesPlayed((count) => count + 1);
      if (next.lessonComplete) setWordsLearned((learned) => dedupeWords([...learned, ...next.newWords.map(({ word }) => word)]));
      await perform(next, request.language, id, previous, request.wordsLearned);
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
    const request = nextSceneRequest(settings, history, wordsLearned, scene, choice, continuation);
    setHistory(request.history);
    setWordsLearned(request.wordsLearned);
    void run(request);
  }

  function watchAgain() {
    if (!scene || !settings) return;
    const previous = playbackRef.current?.startWorld;
    stopAll();
    setContinuation(undefined);
    setReplay((count) => count + 1);
    void perform(scene, settings.language, requestId.current, previous);
  }

  function skipToChoice() {
    if (!scene) return;
    stopAll();
    if (!playbackRef.current?.skip()) {
      setError(t("장면을 마무리하지 못했어요. 다시 해 볼게요.", "The scene could not finish. Please try again."));
      return;
    }
    setTalk((current) => ({ ...current, speaking: false }));
    setContinuation({ world: playbackRef.current.snapshot(), previousLines: scene.lines, previousBeats: scene.stage.beats });
    presentDecision(scene, settings?.language ?? language);
  }

  function goHome() {
    stopAll();
    playbackRef.current = null;
    setPlayback(null);
    setOpening(randomOpening(lesson));
    setScene(null);
    setContinuation(undefined);
    setSettings(null);
    setCaption(null);
    setError(null);
    setSpeechError(null);
    setTalk({ line: null, speaking: false });
    setReplay((count) => count + 1);
    setPhase("home");
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (mutedRef.current) {
      practiceSpeech.current += 1;
      stopSpeaking();
      setPanelSpeaking(false);
      setReadingChoice(null);
      setTalk((current) => ({ ...current, speaking: false, level: 0 }));
    }
    if (document.hidden || manuallyPaused.current) pauseSpeaking();
  }

  function togglePause() {
    manuallyPaused.current = !manuallyPaused.current;
    setPaused(manuallyPaused.current);
    if (manuallyPaused.current) {
      playbackRef.current?.pause();
      pauseSpeaking();
      stopListening();
    } else {
      playbackRef.current?.resume();
      resumeSpeaking();
    }
  }

  async function sayPresentation(prompts: SpokenPrompt[], primary: SceneLanguage, practice = false) {
    const id = requestId.current;
    const token = ++practiceSpeech.current;
    stopSpeaking();
    if (document.hidden || manuallyPaused.current) pauseSpeaking();
    setSpeechError(null);
    setReadingChoice(null);
    const current = () => id === requestId.current && token === practiceSpeech.current;
    setPanelSpeaking(!mutedRef.current);
    for (const prompt of prompts) {
      if (!current()) return;
      const content = storyText(prompt.text);
      if (practice) setPracticeCaption(content);
      setPanelCaption(content);
      const line = { speaker: "hero" as const, text: content, emotion: "happy" as const };
      setTalk({ line, speaking: false, level: 0 });
      if (mutedRef.current) break;
      const result = await speakLine(content, speechLocale(primary), {
        voice: "hero", emotion: line.emotion,
        onStart: () => {
          if (!current()) return;
          setReadingChoice(prompt.choice ?? null);
          setTalk({ line, speaking: true, level: 0 });
        },
        onLevel: (level) => {
          if (current()) setTalk((value) => ({ ...value, level }));
        },
      }).catch(() => ({ started: false, cancelled: false, error: "TTS_UPSTREAM_ERROR" as const }));
      if (!current()) return;
      setTalk({ line, speaking: false, level: 0 });
      setReadingChoice(null);
      if (result.error && !result.cancelled && !mutedRef.current) setSpeechError(result.error);
      if (result.cancelled || result.error) break;
    }
    if (current()) {
      setPanelSpeaking(false);
      setReadingChoice(null);
    }
  }

  function sayPractice(text: string, primary: SceneLanguage) {
    void sayPresentation([{ text }], primary, true);
  }

  function readChoices(next: SceneResponse, primary: SceneLanguage) {
    const heading = primary === "ko" ? "앨리스는 어떻게 할까?" : "What should Alice do?";
    void sayPresentation([
      { text: heading },
      ...orderedChoices(next).map((choice, index) => ({
        text: `${primary === "ko" ? `${index + 1}번.` : `Choice ${index + 1}.`} ${choice}`,
        choice: index,
      })),
    ], primary);
  }

  function presentDecision(next: SceneResponse, primary: SceneLanguage, learned = wordsLearned) {
    setPhase(next.lessonComplete ? "ending" : "choosing");
    if (next.lessonComplete) {
      const ending = topicEnding(primary, settings?.lesson ?? chosenLesson);
      const words = dedupeWords([...learned, ...next.newWords.map(({ word }) => word)]);
      void sayPresentation([
        { text: `${ending.title} ${ending.summary}` },
        ...(words.length ? [{ text: `${primary === "ko" ? "오늘 함께 배운 말은" : "Today we learned"} ${words.join(", ")}.` }] : []),
      ], primary);
    } else readChoices(next, primary);
  }

  function finishPractice() {
    if (!scene) return;
    requestId.current += 1;
    practiceSpeech.current += 1;
    stopSpeaking();
    stopListening();
    setTalk((current) => ({ ...current, speaking: false }));
    presentDecision(scene, settings?.language ?? language);
  }

  async function sayWord() {
    if (!scene || !settings || sayState === "listening" || paused) return;
    practiceSpeech.current += 1;
    stopSpeaking();
    setTalk((current) => ({ ...current, speaking: false }));
    const id = requestId.current;
    setPracticeFeedback(null);
    setSayState("listening");
    try {
      const transcript = await listenOnce(speechLocale(settings.language));
      if (id !== requestId.current) return;
      if (scene.newWords.some(({ word }) => matchesWord(transcript, word))) {
        cheer(id);
        return;
      }
    } catch (failure) {
      if (id !== requestId.current) return;
      setSayState("retry");
      setPracticeFeedback(listeningFeedback(failure, settings.language));
      return;
    }
    setSayState("retry");
    setPracticeFeedback(t("괜찮아! 단어를 다시 듣고 천천히 말해 볼까?", "That's okay! Listen once more, then try it slowly."));
    const first = scene.newWords[0];
    if (first) sayPractice(first.word, settings.language);
  }

  function cheer(id = requestId.current) {
    if (!scene || !settings || id !== requestId.current) return;
    setSayState("yay");
    setPracticeFeedback(null);
    sayPractice(settings.language === "ko" ? "잘했어!" : "Great job!", settings.language);
  }

  useEffect(() => () => {
    requestId.current += 1;
    playbackRef.current?.cancel();
    stopListening();
    stopSpeaking();
  }, []);

  useEffect(() => {
    const visibilityChanged = () => {
      const shouldPause = document.hidden || manuallyPaused.current;
      setPaused(shouldPause);
      if (shouldPause) {
        playbackRef.current?.pause();
        pauseSpeaking();
        stopListening();
      } else {
        playbackRef.current?.resume();
        resumeSpeaking();
      }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    const root = theater.current;
    if (!root) return;
    const panel = root.querySelector<HTMLElement>("[data-camera-panel]");
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      if (!bounds.height) return;
      const next = { top: phase === "home" ? 0.06 : 0.12,
        bottom: panel ? Math.min(0.65, Math.max(0.12, (bounds.bottom - panel.getBoundingClientRect().top + 18) / bounds.height)) : 0.1 };
      setCameraFrame((current) => Math.abs(current.top - next.top) < 0.005 && Math.abs(current.bottom - next.bottom) < 0.005 ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (panel) observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [phase, error]);

  useEffect(() => {
    if (!playback) return;
    let frame: number;
    let previous: number | null = null;
    const tick = (now: number) => {
      if (document.hidden || manuallyPaused.current) previous = null;
      else {
        if (previous !== null) playback.advance((now - previous) / 1000);
        previous = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback]);

  useEffect(() => {
    // Warm up the first scene for preset lessons; an own lesson changes on every key.
    if (phase !== "home" || lesson === OWN) return;
    const timer = setTimeout(() => warmScene({ lesson, language, age, opening, history: [], wordsLearned: [] }), 600);
    return () => clearTimeout(timer);
  }, [phase, lesson, language, age, opening, warmScene]);

  useEffect(() => {
    // The next part depends on where this part actually ended, including failed
    // pickups/handoffs. Prefetch only once that outcome is known.
    if ((phase !== "practicing" && phase !== "choosing") || !scene || !settings || !continuation || scene.lessonComplete) return;
    for (const choice of scene.choices) warmScene(nextSceneRequest(settings, history, wordsLearned, scene, choice, continuation));
  }, [phase, scene, settings, history, wordsLearned, continuation, warmScene]);

  const stage = playback?.stage ?? scene?.stage ?? WELCOME;
  const speaker = caption ? SPEAKERS[caption.voice] : SPEAKERS.narrator;
  const lessonCard = LESSONS.find(({ id }) => id === settings?.lesson);
  const learnLocale = speechLocale(settings?.language ?? language);
  const speechNotice = speechError === "TTS_PROVIDER_BLOCKED"
    ? t("목소리 서비스가 잠시 이용되지 않아요. 보호자와 함께 글로 읽거나 잠시 후 다시 들어 주세요.", "The voice service is temporarily unavailable. Read with a grown-up, or try listening again later.")
    : speechError === "TTS_NOT_CONFIGURED"
    ? t("목소리가 아직 준비되지 않았어요. 지금은 글로 함께 읽어요.", "The voices are not ready yet. We can read the story together.")
    : speechError === "TTS_TIMEOUT"
      ? t("목소리를 준비하는 데 시간이 걸려요. 글로 이야기를 이어갈게요.", "The voice is taking a while. We can keep reading the story.")
      : speechError === "TTS_PLAYBACK_ERROR"
        ? t("소리를 재생하지 못했어요. 글로 이야기를 이어갈게요.", "The sound could not play. We can keep reading the story.")
        : speechError ? t("목소리를 불러오지 못했어요. 글로 이야기를 이어갈게요.", "The voice could not load. We can keep reading the story.") : null;
  // The model always puts the lesson choice first; flip per scene so it isn't always on top.
  const shownChoices = scene ? orderedChoices(scene) : [];
  const ending = topicEnding(home, settings?.lesson ?? chosenLesson);

  return (
    <main ref={theater} className={`${styles.theater} ${phase === "home" ? "" : styles.storyMode}`} lang={home} data-phase={phase} data-speaking={talk.speaking} data-audio-level={talk.level ?? 0} data-paused={paused}>
      <div className={styles.stage}>
        <TalesStage stage={stage} replay={replay} talk={talk} simulation={playback?.sim} paused={phase === "loading" || paused} overview={phase === "home"} reducedMotion={reducedMotion} cameraFrame={cameraFrame} />
      </div>
      <div className={styles.vignette} />

      {phase !== "home" && <header className={styles.header}>
        <button className={styles.brand} onClick={goHome} aria-label="Alicetales home" style={{ background: "none", border: 0, color: "inherit", textAlign: "left" }}>
          Alicetales
        </button>
        <div className={styles.headerActions}>
          <button className={styles.roundButton} aria-label={t("처음으로", "Back to start")} onClick={goHome}><Icon name="home" /></button>
          {phase !== "loading" && <button className={styles.roundButton} aria-label={paused ? t("이어서 재생", "Resume") : t("잠시 멈추기", "Pause")} aria-pressed={paused} onClick={togglePause}><Icon name={paused ? "play" : "pause"} /></button>}
          <button className={styles.roundButton} aria-label={muted ? t("소리 켜기", "Unmute") : t("소리 끄기", "Mute")} aria-pressed={muted} onClick={toggleMute}><Icon name={muted ? "muted" : "volume"} /></button>
        </div>
      </header>}

      {phase === "home" ? <Landing home={home} age={age} language={language} lesson={lesson} ownLesson={ownLesson} onAge={setAge} onLanguage={setLanguage} onLesson={(id) => { setLesson(id); setOpening(randomOpening(id)); }} onOwnLesson={setOwnLesson} onStart={start} /> : <>
        <div className={styles.episode}>
          <span className={styles.episodeIcon} style={{ color: lessonCard?.color ?? OWN_CARD.color }}><Icon name={lessonCard?.icon ?? "spark"} size={18} /></span>
          <div><strong>{lessonCard?.name[home] ?? settings?.lesson}</strong><span>{scenesPlayed > 0 ? t(`${scenesPlayed}번째 장면`, `Scene ${scenesPlayed}`) : t("이야기 준비 중", "Getting ready")}</span></div>
        </div>

        {phase === "loading" && !error && <div className={styles.thinking} role="status"><span className={styles.spinner} />{t("앨리스가 다음 이야기를 쓰고 있어요...", "Alice is writing what happens next...")}</div>}

        {error && <div className={styles.alert} role="alert" data-camera-panel>
          <p>{error}</p>
          <button className={styles.primary} onClick={() => lastRequest.current && void run(lastRequest.current)}><Icon name="replay" size={18} />{t("다시 해 볼게요", "Try again")}</button>
        </div>}

        {phase === "playing" && caption && <section className={styles.dialogue} aria-live="polite" aria-label={t("이야기", "Story")} data-camera-panel>
          <div className={styles.speakerTag} style={{ "--speaker": speaker.color } as CSSProperties}><span className={talk.speaking ? styles.voiceBars : styles.voiceIdle}><i /><i /><i /></span>{speaker.name[home]}</div>
          <p key={`${caption.voice}:${caption.text}`} className={styles.line}>{caption.text}</p>
          {speechNotice && !muted && <p className={styles.speechNotice} role="status">{speechNotice}</p>}
          <div className={styles.playControls}>
            <button aria-label={t("처음부터 다시 보기", "Watch this part again")} onClick={watchAgain}><Icon name="replay" size={18} /></button>
            <span>{speechError || muted ? t("글로 함께 읽어요", "Let’s read together") : t("친구들의 이야기를 들어봐요", "Let’s listen to our friends")}</span>
            <button className={styles.nextLine} onClick={skipToChoice}>{t("건너뛰기", "Skip")}</button>
          </div>
        </section>}

        {phase === "practicing" && scene && settings && <section className={`${styles.decision} ${styles.speakingGame}`} data-camera-panel>
          <div className={styles.gameSpeaker}><span className={styles.aliceAvatar}>A</span><span>{t("앨리스가 너에게 물어봐요", "Alice is asking you!")}</span><span className={styles.turnBadge}>{t("네 차례", "YOUR TURN")}</span></div>
          <div className={styles.practiceBody}>
            <div className={styles.practicePrompt}>
              <p className={styles.invitationText} aria-live="polite">{practiceCaption}</p>
              <div className={styles.words}>{scene.newWords.map(({ word, meaning }) => <button key={word} disabled={sayState === "listening"} onClick={() => sayPractice(word, settings.language)}><strong lang={learnLocale}>{storyText(word)}</strong><small>{storyText(meaning)}</small></button>)}</div>
            </div>
            <div className={styles.practiceActions}>
              <div className={styles.practiceButtons}>
                <button disabled={sayState === "listening"} onClick={() => sayPractice(practiceInvitation(settings.language, scene.newWords[0].word), settings.language)}><Icon name="volume" size={18} />{t("다시 듣기", "Listen again")}</button>
                {canListen && sayState !== "yay" && <button className={styles.micButton} data-listening={sayState === "listening"} onClick={() => void sayWord()} disabled={sayState === "listening" || paused}><Icon name="mic" size={23} />{sayState === "listening" ? t("듣고 있어!", "I’m listening!") : t("말해 보기", "Try saying it")}</button>}
              </div>
              {sayState === "listening" && <p className={styles.feedback} role="status">{t("네 목소리를 기다리고 있어...", "Alice is waiting for your voice...")}</p>}
              {practiceFeedback && <p className={styles.practiceFeedback} role="status">{practiceFeedback}</p>}
              {!canListen && <p className={styles.practiceFeedback}>{t("이 브라우저에서는 목소리를 확인할 수 없어요. 소리 내어 말한 뒤 ‘말했어요!’를 눌러 주세요.", "This browser cannot check your voice. Say the word aloud, then tap ‘I said it!’.")}</p>}
              <div className={styles.practiceButtons}>
                <button className={styles.saidItButton} disabled={sayState === "listening"} onClick={() => sayState === "yay" ? finishPractice() : cheer()}><Icon name="check" size={17} />{sayState === "yay" ? t("이야기 이어가기", "Continue the story") : t("말했어요!", "I said it!")}</button>
                {sayState !== "yay" && <button onClick={finishPractice}>{t("듣고 이어갈래요", "Listen and continue")}</button>}
              </div>
            </div>
          </div>
          {speechNotice && !muted && <p className={styles.speechNotice} role="status">{speechNotice}</p>}
        </section>}

        {phase === "choosing" && scene && settings && <section className={`${styles.decision} ${styles.choicePanel}`} data-camera-panel>
          <div className={styles.choiceHeading}>
            <span className={styles.aliceAvatar} aria-hidden="true">A</span>
            <h2>{t("앨리스는 어떻게 할까?", "What should Alice do?")}</h2>
            <span className={styles.turnBadge}>{t("네 차례", "YOUR TURN")}</span>
            <button className={styles.choiceReplay} onClick={watchAgain} aria-label={t("다시 보기", "Watch again")} title={t("다시 보기", "Watch again")}><Icon name="replay" size={18} /></button>
            <button className={styles.choiceReplay} onClick={() => readChoices(scene, settings.language)} aria-label={t("질문과 선택지 다시 듣기", "Read the question and choices again")}><Icon name="volume" size={18} /></button>
          </div>
            <div className={styles.choices}>
              {shownChoices.map((choice, index) => <div key={choice} className={`${styles.choiceOption} ${readingChoice === index ? styles.choiceReading : ""}`}>
                <button className={styles.chooseAction} onClick={() => choose(choice)}><span className={styles.choicePortrait} style={{ background: SPEAKERS.hero.color }} aria-hidden="true">{index + 1}</span><span>{choice}</span></button>
                <button className={styles.listenChoice} onClick={() => void sayPresentation([{ text: choice, choice: index }], settings.language)} aria-label={t(`${index + 1}번 선택지 듣기`, `Listen to choice ${index + 1}`)}><Icon name="volume" size={18} /></button>
              </div>)}
            </div>
            {panelSpeaking && <p className={styles.panelCaption} aria-live="polite">{panelCaption}</p>}
            {speechNotice && !muted && <p className={styles.speechNotice} role="status">{speechNotice}</p>}
        </section>}

        {phase === "ending" && <section className={styles.ending} data-camera-panel>
          <div className={styles.endSeal} style={{ color: lessonCard?.color }}><Icon name={lessonCard?.icon ?? "spark"} size={32} /></div>
          <p className={styles.cardEyebrow}>{lessonCard?.name[home] ?? settings?.lesson}</p>
          <h2>{ending.title}</h2>
          <p>{ending.summary}</p>
          <p>{t("오늘 배운 단어", "Words we learned today")}</p>
          <div className={styles.wordList}>{wordsLearned.length ? wordsLearned.map((word) => <button key={word} lang={learnLocale} onClick={() => sayPractice(word, home)} aria-label={t(`${word} 다시 듣기`, `Listen to ${word}`)}><Icon name="volume" size={15} />{word}</button>) : <span>{t("다음에 또 배워요", "More next time")}</span>}</div>
          <button className={styles.summaryAudio} onClick={() => void sayPresentation([{ text: `${ending.title} ${ending.summary}` }], home)}><Icon name="volume" size={17} />{t("마무리 다시 듣기", "Listen to the ending")}</button>
          {speechNotice && !muted && <p className={styles.speechNotice} role="status">{speechNotice}</p>}
          <div className={styles.endingActions}>
            <button className={styles.primary} onClick={goHome}><Icon name="book" size={18} />{t("다른 이야기", "Another little story")}</button>
            <button className={styles.secondary} onClick={watchAgain}><Icon name="replay" size={18} />{t("마지막 장면 다시 보기", "Replay the last scene")}</button>
          </div>
        </section>}
      </>}
    </main>
  );
}
