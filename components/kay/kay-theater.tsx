"use client";
// @refresh reset

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { STORIES } from "@/lib/kay/stories";
import { parseKayStory } from "@/lib/kay/validation";
import { getKayLibrary, saveKayLibrary, serverLibrary, subscribeKayLibrary } from "@/lib/kay/library";
import { choicePrompt, getGameMoment, practiceFor, practicePrompt, retryPrompt, successPrompt } from "@/lib/kay/interactions";
import type { GameMoment } from "@/lib/kay/interactions";
import { SPEAKERS } from "@/lib/kay/types";
import type { DialogueLine, KayStory, Language } from "@/lib/kay/types";
import { playKaySpeech, preloadKaySpeech, stopKayAudio, unlockKayAudio } from "@/lib/kay/audio";
import { isListeningSupported, listenOnce, matchesWord, stopListening } from "@/lib/speech";
import { Icon } from "./icons";
import styles from "./kay.module.css";

const CinemaStage = dynamic(() => import("./cinema-stage"), { ssr: false, loading: () => <div className={styles.worldLoading}><Icon name="leaf" size={32} /><span>The forest is waking up…</span></div> });
const LESSONS: Record<string, { ko: string; en: string; color: string }> = {
  kindness: { ko: "친절", en: "Kindness", color: "#d78068" },
  empathy: { ko: "공감", en: "Empathy", color: "#8e91b9" },
  sharing: { ko: "나눔", en: "Sharing", color: "#ceaa55" },
  honesty: { ko: "정직", en: "Honesty", color: "#77a292" },
  patience: { ko: "인내", en: "Patience", color: "#7f9db3" },
};
const welcome: DialogueLine = { id: "welcome", speaker: "kimi", text: { ko: "우리, 같이 놀자!", en: "Come and play with us!" }, action: "wave", emotion: "happy", to: "momo" };
type Phase = "library" | "playing" | "decision" | "reaction" | "ending";
const subscribeNothing = () => () => {};
const serverFalse = () => false;
function motionPreference(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export default function KayTheater() {
  const [homeLanguage, setHomeLanguage] = useState<Language>("en");
  const learnLanguage: Language = homeLanguage === "ko" ? "en" : "ko";
  const ko = homeLanguage === "ko";
  const t = (korean: string, english: string) => ko ? korean : english;
  const [age, setAge] = useState(4);
  const [selected, setSelected] = useState<KayStory>(STORIES[0]);
  const saved = useSyncExternalStore(subscribeKayLibrary, getKayLibrary, serverLibrary);
  const [phase, setPhase] = useState<Phase>("library");
  const [sceneId, setSceneId] = useState(STORIES[0].start);
  const [lineIndex, setLineIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [learning, setLearning] = useState(false);
  const [replay, setReplay] = useState(0);
  const [visited, setVisited] = useState<string[]>([]);
  const [practice, setPractice] = useState<"idle" | "listening" | "retry" | "success">("idle");
  const [interactionStep, setInteractionStep] = useState<"practice" | "choice">("practice");
  const [highlightedChoice, setHighlightedChoice] = useState(-1);
  const [earned, setEarned] = useState(0);
  const [reaction, setReaction] = useState<DialogueLine | null>(null);
  const [reactionTarget, setReactionTarget] = useState<"advance" | "choose">("advance");
  const [audioFallback, setAudioFallback] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generated, setGenerated] = useState<KayStory | null>(null);
  const scene = selected.scenes[sceneId] ?? selected.scenes[selected.start];
  const gameMoment = useMemo(() => getGameMoment(selected, scene), [selected, scene]);
  const practiceExpression = useMemo(() => practiceFor(selected, scene), [selected, scene]);
  const invitation = useMemo<DialogueLine>(() => ({
    id: `${scene.id}-${interactionStep}-invitation`, speaker: "kimi", action: "wave", emotion: "curious",
    text: interactionStep === "practice" ? {
      en: practicePrompt(practiceExpression, "en", "ko"), ko: practicePrompt(practiceExpression, "ko", "en"),
    } : gameMoment?.question ?? choicePrompt,
  }), [scene.id, interactionStep, practiceExpression, gameMoment]);
  const activeLine = phase === "library" ? welcome : phase === "decision" ? invitation : phase === "reaction" ? reaction : scene.lines[lineIndex] ?? null;
  const abortGeneration = useRef<AbortController | null>(null);
  const playback = useRef<AbortController | null>(null);
  const micSession = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const canListen = useSyncExternalStore(subscribeNothing, isListeningSupported, serverFalse);
  const reducedMotion = useSyncExternalStore(motionPreference, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, serverFalse);

  useEffect(() => {
    return () => { playback.current?.abort(); stopKayAudio(); stopListening(); abortGeneration.current?.abort(); };
  }, []);

  useEffect(() => {
    if (creatorOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creatorOpen]);

  useEffect(() => {
    function hide() { if (document.hidden) { setPaused(true); stopKayAudio(); stopListening(); } }
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  const enterScene = useCallback((id: string) => {
    if (!selected.scenes[id]) return;
    micSession.current += 1;
    stopListening(); stopKayAudio();
    setSceneId(id); setLineIndex(0); setPhase("playing"); setPractice("idle"); setPaused(false);
    setVisited((current) => [...current, id]);
  }, [selected]);

  const finishScene = useCallback(() => {
    setInteractionStep(age < 5 ? "practice" : "choice");
    setPractice("idle");
    if (age < 5 || scene.choices.length || gameMoment) setPhase("decision");
    else if (scene.next) enterScene(scene.next);
    else setPhase("ending");
  }, [age, scene, gameMoment, enterScene]);

  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const controller = new AbortController();
    playback.current = controller;
    const signal = controller.signal;
    const line = scene.lines[lineIndex];
    if (!line) return;
    async function perform() {
      setLearning(false);
      // Prepare the following lines while the current character is talking.
      if (!muted && !selected.custom) {
        for (const next of scene.lines.slice(lineIndex + 1, lineIndex + 3)) {
          void preloadKaySpeech({ text: next.text[homeLanguage], language: homeLanguage, speaker: next.speaker });
          if (next.learn) void preloadKaySpeech({ text: next.learn[learnLanguage], language: learnLanguage, speaker: next.speaker });
        }
      }
      const began = performance.now();
      if (!muted) await playKaySpeech({ text: line.text[homeLanguage], language: homeLanguage, speaker: line.speaker, signal, onStart: () => {
        if (signal.aborted) return;
        setSpeaking(true);
        // Give the current custom voice priority over future generated speech.
        if (selected.custom) {
          const next = scene.lines[lineIndex + 1];
          if (line.learn) void preloadKaySpeech({ text: line.learn[learnLanguage], language: learnLanguage, speaker: line.speaker });
          else if (next) void preloadKaySpeech({ text: next.text[homeLanguage], language: homeLanguage, speaker: next.speaker });
        }
      }, onEnd: () => setSpeaking(false), onFallback: () => setAudioFallback(true) });
      // Let each moment breathe; subtitles also remain readable in silent mode.
      const readable = Math.max(4300, Math.min(11000, line.text[homeLanguage].length * (ko ? 105 : 52)));
      await delay(Math.max(0, readable - (performance.now() - began)), signal);
      if (signal.aborted) return;
      if (line.learn && age >= 5) {
        setLearning(true);
        if (!muted) await playKaySpeech({ text: line.learn[learnLanguage], language: learnLanguage, speaker: line.speaker, signal, onStart: () => { if (!signal.aborted) setSpeaking(true); }, onEnd: () => setSpeaking(false), onFallback: () => setAudioFallback(true) });
        await delay(500, signal);
      }
      await delay(350, signal);
      if (signal.aborted) return;
      setSpeaking(false); setLearning(false);
      if (lineIndex + 1 < scene.lines.length) setLineIndex(lineIndex + 1);
      else finishScene();
    }
    void perform();
    return () => { controller.abort(); stopKayAudio(); setSpeaking(false); };
  }, [phase, paused, muted, scene, lineIndex, homeLanguage, learnLanguage, ko, age, replay, finishScene, selected.custom]);

  // Kimi asks the child directly. Completing the prompt never advances the story.
  useEffect(() => {
    if (phase !== "decision" || muted) return;
    const controller = new AbortController();
    playback.current = controller;
    const options = scene.choices.length ? scene.choices : gameMoment?.choices ?? [];
    const say = (text: string) => playKaySpeech({ text, language: homeLanguage, speaker: "kimi", signal: controller.signal,
      onStart: () => { if (!controller.signal.aborted) setSpeaking(true); }, onEnd: () => setSpeaking(false), onFallback: () => setAudioFallback(true) });
    async function invite() {
      setHighlightedChoice(-1);
      await say(invitation.text[homeLanguage]);
      if (interactionStep === "choice") {
        for (let index = 0; index < options.length; index++) {
          if (controller.signal.aborted) return;
          setHighlightedChoice(index);
          await say(options[index].label[homeLanguage]);
          await delay(400, controller.signal);
        }
      }
      if (!controller.signal.aborted) { setSpeaking(false); setHighlightedChoice(-1); }
    }
    void invite();
    return () => { controller.abort(); stopKayAudio(); };
  }, [phase, muted, scene, gameMoment, invitation, homeLanguage, interactionStep]);

  useEffect(() => {
    if (phase !== "reaction" || !reaction) return;
    const controller = new AbortController();
    playback.current = controller;
    async function respond() {
      const began = performance.now();
      if (!muted) await playKaySpeech({ text: reaction!.text[homeLanguage], language: homeLanguage, speaker: reaction!.speaker, signal: controller.signal,
        onStart: () => { if (!controller.signal.aborted) setSpeaking(true); }, onEnd: () => setSpeaking(false) });
      const reactionTime = reaction!.id.endsWith("-well-done") ? 2200 : 4200;
      await delay(Math.max(0, reactionTime - (performance.now() - began)), controller.signal);
      if (controller.signal.aborted) return;
      if (reactionTarget === "choose") { setInteractionStep("choice"); setPhase("decision"); }
      else { const next = scene.choices[0]?.next ?? scene.next; if (next) enterScene(next); else setPhase("ending"); }
    }
    void respond();
    return () => { controller.abort(); stopKayAudio(); };
  }, [phase, reaction, reactionTarget, muted, homeLanguage, scene, enterScene]);

  function start(story = selected) {
    playback.current?.abort(); micSession.current += 1; stopListening(); stopKayAudio(); unlockKayAudio();
    setSelected(story); setSceneId(story.start); setLineIndex(0); setVisited([story.start]);
    setPaused(false); setSpeaking(false); setPractice("idle"); setPhase("playing"); setAudioFallback(false); setEarned(0); setReaction(null);
  }
  function goHome() {
    playback.current?.abort(); micSession.current += 1; stopListening(); stopKayAudio();
    setSpeaking(false); setPhase("library"); setPaused(false); setLearning(false);
  }
  function celebratePractice() {
    playback.current?.abort(); micSession.current += 1; stopListening(); stopKayAudio(); unlockKayAudio();
    setPractice("success"); setEarned((value) => value + 1); setLearning(false);
    setReaction({ id: `${scene.id}-well-done`, speaker: "kimi", action: "cheer", emotion: "excited", text: successPrompt });
    setReactionTarget(age >= 4 && scene.choices.length > 0 ? "choose" : "advance");
    setPhase("reaction");
  }
  function actChoice(choice: GameMoment["choices"][number], index: number) {
    playback.current?.abort(); stopKayAudio(); unlockKayAudio(); setLearning(false);
    setEarned((value) => value + 1);
    setReaction({ id: `${scene.id}-action-${index}`, speaker: choice.speaker, to: choice.to, action: choice.action, emotion: "excited", text: choice.response });
    setReactionTarget("advance"); setPhase("reaction");
  }
  async function practiceWord() {
    const word = practiceExpression[learnLanguage];
    const session = ++micSession.current;
    playback.current?.abort(); setPractice("listening"); stopKayAudio();
    try {
      const heard = await listenOnce(learnLanguage === "ko" ? "ko-KR" : "en-US");
      if (session !== micSession.current) return;
      if (matchesWord(heard, word)) { celebratePractice(); return; }
    } catch { if (session !== micSession.current) return; }
    setPractice("retry");
    if (!muted) void playKaySpeech({ text: retryPrompt[homeLanguage], language: homeLanguage, speaker: "kimi", onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  }
  function hearWord() {
    playback.current?.abort(); micSession.current += 1; stopListening(); setPractice("idle");
    unlockKayAudio();
    void playKaySpeech({ text: practiceExpression[learnLanguage], language: learnLanguage, speaker: "kimi", onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  }
  async function generate() {
    if (prompt.trim().length < 4 || generating) return;
    const controller = new AbortController();
    abortGeneration.current = controller;
    setGenerating(true); setGenerationError(""); setGenerated(null);
    try {
      const response = await fetch("/kay/api/story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), age, homeLanguage, learnLanguage }), signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : t("이야기를 만들지 못했어요. 잠시 후 다시 시도해 주세요.", "We couldn't finish the story. Please try again."));
      const story = parseKayStory(data.story);
      const library = [story, ...saved.filter((item) => item.id !== story.id)].slice(0, 6);
      setGenerated(story);
      setStorageWarning(!saveKayLibrary(library));
    } catch (error) {
      if (!controller.signal.aborted) setGenerationError(error instanceof Error ? error.message : t("다시 시도해 주세요.", "Please try again."));
    } finally { if (abortGeneration.current === controller) setGenerating(false); }
  }
  function closeCreator() { abortGeneration.current?.abort(); setGenerating(false); setCreatorOpen(false); }
  function togglePause() { unlockKayAudio(); setPaused((value) => !value); }
  const theme = LESSONS[selected.lesson] ?? LESSONS.kindness;
  const speaker = SPEAKERS[activeLine?.speaker ?? "narrator"];
  const practiceText = practiceExpression[learnLanguage];
  const totalSteps = 7;

  return (
    <main className={`${styles.theater} ${phase === "library" ? styles.libraryMode : styles.storyMode}`} lang={homeLanguage}>
      <div className={styles.stage}><CinemaStage line={activeLine} location={phase === "library" ? "meadow" : scene.location} playing={speaking} acting={phase === "library" || (phase === "playing" && !paused) || phase === "reaction" || (phase === "decision" && speaking)} overview={phase === "library" || phase === "ending"} reducedMotion={reducedMotion} /></div>
      <div className={styles.vignette} />
      {phase === "library" && <div className={styles.libraryShade} />}
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="KimiTales home"><span className={styles.brandMark}>k.</span><span>KimiTales<small>THE LITTLE FOREST</small></span></Link>
        <div className={styles.headerActions}>
          {phase === "library" ? <button className={styles.parentButton} onClick={() => { setGenerated(null); setCreatorOpen(true); }}><Icon name="spark" size={18} />{t("부모님 이야기 공방", "Parent story studio")}</button> : <>
            <button className={styles.roundButton} aria-label={t("이야기 고르기", "Story library")} onClick={goHome}><Icon name="home" /></button>
            <button className={styles.roundButton} aria-label={muted ? t("소리 켜기", "Unmute") : t("소리 끄기", "Mute")} aria-pressed={muted} onClick={() => { unlockKayAudio(); setMuted((value) => !value); }}><Icon name={muted ? "muted" : "volume"} /></button>
          </>}
          <button className={`${styles.roundButton} ${styles.fullscreen}`} aria-label={t("전체 화면 전환", "Toggle full screen")} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }}><Icon name="expand" size={19} /></button>
        </div>
      </header>

      {phase === "library" ? <>
        <section className={styles.intro}>
          <p className={styles.eyebrow}><span />{t("마음이 자라는 작은 이야기", "LITTLE STORIES. BIG FEELINGS.")}</p>
          <h1>{t("우리, 함께", "A little forest.")}<br /><em>{t("자라볼까?", "A world of feeling.")}</em></h1>
          <p className={styles.introCopy}>{t("키미와 친구들의 숲에 놀러 오세요.", "Come into the forest with Kimi and friends.")}<br />{t("듣고, 말하고, 마음을 나누는 시간.", "Listen, talk, and grow a little together.")}</p>
          <div className={styles.setupFields}>
            <div><span className={styles.fieldLabel}>{t("아이의 나이", "Child’s age")}</span><div className={styles.ageChoices}>{[3, 4, 5, 6].map((value) => <button key={value} aria-pressed={age === value} onClick={() => setAge(value)}>{value}{ko ? "세" : ""}</button>)}</div></div>
            <label className={styles.languageField}><span className={styles.fieldLabel}>{t("익숙한 언어", "Home language")}</span><select value={homeLanguage} onChange={(event) => setHomeLanguage(event.target.value as Language)}><option value="ko">한국어</option><option value="en">English</option></select></label>
          </div>
          <p className={styles.ageHint}>{age < 4 ? t("키미가 기다려요. 함께 말해 주세요!", "Kimi asks. Your child speaks. The story waits.") : age === 4 ? t("말하고, 고르고, 친구들과 함께 놀아요.", "Say little words, make choices, and play together.") : t("다섯 번의 선택으로 친구들의 모험을 이끌어요.", "Five choices. Your child leads the adventure.")}</p>
          <button className={styles.begin} onClick={() => start()}><span className={styles.playDisc}><Icon name="play" size={21} /></span><span>{t("이야기 시작하기", "Let’s begin")}<small>{selected.title[homeLanguage]}</small></span></button>
          <div className={styles.details}><span><Icon name="book" size={14} />{t("한 편 3–5분", "3–5 minute stories")}</span><span>{t("준비된 이야기 바로 시작", "Ready to play")}</span></div>
        </section>
        <div className={styles.worldLabel}><span className={styles.worldLabelLine} /><span>{t("햇살숲에 오신 걸 환영해요", "WELCOME TO SUNNY MEADOW")}</span></div>
        <section className={styles.library} aria-label={t("이야기 선택", "Choose a story")}>
          <div className={styles.libraryHeading}><span>{t("오늘은 어떤 마음을 만나볼까요?", "What shall we discover today?")}</span><span>{t("다섯 가지 작은 모험", "FIVE LITTLE ADVENTURES")}</span></div>
          <div className={styles.storyCards}>{STORIES.map((story) => { const lesson = LESSONS[story.lesson] ?? LESSONS.kindness; return <button key={story.id} className={styles.storyCard} style={{ "--theme": lesson.color } as CSSProperties} aria-pressed={selected.id === story.id} onClick={() => setSelected(story)}><span className={styles.themeIcon}><Icon name={story.lesson} size={24} /></span><span><strong>{lesson[homeLanguage]}</strong><small>{story.title[homeLanguage]}</small></span>{selected.id === story.id && <span className={styles.selectedDot}><Icon name="check" size={11} /></span>}</button>; })}</div>
          {saved.length > 0 && <div className={styles.savedStories}><Icon name="book" size={16} /><span>{t("우리 집 책장", "Our bookshelf")}</span>{saved.map((story) => <button key={story.id} aria-pressed={selected.id === story.id} onClick={() => setSelected(story)}>{story.title[homeLanguage]}</button>)}</div>}
        </section>
      </> : <>
        <div className={styles.episode}><span className={styles.episodeIcon} style={{ color: theme.color }}><Icon name={selected.lesson} size={18} /></span><div><strong>{selected.title[homeLanguage]}</strong><span>{scene.title[homeLanguage]}</span></div></div>
        <div className={styles.friendship} aria-label={t(`함께한 마음 ${earned}개`, `${earned} friendship moments`)}>{[0,1,2,3,4].map((leaf) => <Icon key={leaf} name="leaf" size={19} style={{color:earned > leaf ? "#d6a859" : "#a4b29a66"}} />)}<span>{earned} {t("마음", "together")}</span></div>
        <div className={styles.progress} role="progressbar" aria-label={t("이야기 진행", "Story progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === "ending" ? 100 : Math.min(95, Math.round(((visited.length - 1 + (lineIndex + 1) / scene.lines.length) / totalSteps) * 100))}><span style={{ width: `${phase === "ending" ? 100 : Math.min(95, ((visited.length - 1 + (lineIndex + 1) / scene.lines.length) / totalSteps) * 100)}%` }} /></div>
        {(phase === "playing" || phase === "reaction") && activeLine && <section className={styles.dialogue} aria-label={t("캐릭터 대화", "Character dialogue")}>
          <div className={styles.speakerTag} style={{ "--speaker": speaker.color } as CSSProperties}><span className={speaking ? styles.voiceBars : styles.voiceIdle}><i /><i /><i /></span>{speaker.name[homeLanguage]}</div>
          <p key={`${activeLine.id}-${learning}`} className={styles.line} lang={learning ? learnLanguage : homeLanguage}>{learning && activeLine.learn ? activeLine.learn[learnLanguage] : activeLine.text[homeLanguage]}</p>
          {learning && activeLine.learn && <p className={styles.wordMeaning}>{activeLine.learn[homeLanguage]} · {age < 5 ? t("같이 말해 볼까요?", "Say it with me!") : t("새로운 표현", "A new expression")}</p>}
          {phase === "playing" && <div className={styles.playControls}><button aria-label={paused ? t("계속 재생", "Resume story") : t("잠시 멈추기", "Pause story")} onClick={togglePause}><Icon name={paused ? "play" : "pause"} size={18} /></button><button aria-label={t("이 대사 다시 듣기", "Replay this line")} onClick={() => { unlockKayAudio(); setPaused(false); setReplay((value) => value + 1); }}><Icon name="replay" size={18} /></button><span>{paused ? t("잠시 쉬어 가요", "A little pause") : t("친구의 이야기를 들어봐요", "Let’s listen to our friends")}</span><button className={styles.nextLine} onClick={() => { if (lineIndex + 1 < scene.lines.length) setLineIndex(lineIndex + 1); else finishScene(); }}>{t("다음", "Next")}</button></div>}
        </section>}
        {phase === "decision" && <section className={`${styles.decision} ${interactionStep === "practice" ? styles.speakingGame : ""}`}>
          <div className={styles.gameSpeaker}><span className={styles.kimiAvatar}>K</span><span>{t("키미가 너에게 말해요", "Kimi is talking to you!")}</span><span className={styles.turnBadge}>{t("네 차례", "YOUR TURN")}</span></div>
          {interactionStep === "choice" ? <>
            <h2>{(gameMoment?.question ?? choicePrompt)[homeLanguage]}</h2>
            <p>{t("하나를 골라 줘. 우리가 해 볼게!", "Pick one. Watch us do it!")}</p>
            <div className={styles.choices}>
              {scene.choices.length ? scene.choices.map((choice, index) => <button key={choice.next} className={highlightedChoice === index ? styles.highlighted : ""} onClick={() => { playback.current?.abort(); unlockKayAudio(); setEarned((value) => value + 1); enterScene(choice.next); }}><span className={styles.choicePortrait} style={{ background: SPEAKERS[choice.actor ?? "kimi"].color }}>{SPEAKERS[choice.actor ?? "kimi"].name.en.slice(0, 1)}</span><span>{choice.label[homeLanguage]}</span></button>) : gameMoment?.choices.map((choice, index) => <button key={index} className={highlightedChoice === index ? styles.highlighted : ""} onClick={() => actChoice(choice, index)}><span className={styles.choicePortrait} style={{ background: SPEAKERS[choice.to].color }}>{SPEAKERS[choice.to].name.en.slice(0, 1)}</span><span>{choice.label[homeLanguage]}</span></button>)}
            </div>
            <p className={styles.waitingHint}>{t("네가 고를 때까지 기다릴게.", "We’ll wait for your choice.")}</p>
          </> : <>
            <p className={styles.invitationText}>{t("우리 다 같이 이렇게 말해 볼까?", "Can we all say this together?")}</p>
            <h2 className={styles.practicePhrase} lang={learnLanguage}>{practiceText}</h2>
            <p>{practiceExpression[homeLanguage]}</p>
            <div className={styles.practiceButtons}>
              <button onClick={hearWord}><Icon name="volume" />{t("키미 듣기", "Hear Kimi")}</button>
              {canListen && <button className={styles.micButton} onClick={() => void practiceWord()} disabled={practice === "listening"}><Icon name="mic" size={23} />{practice === "listening" ? t("듣고 있어!", "I’m listening!") : t("키미에게 말하기", "Talk to Kimi")}</button>}
            </div>
            <p className={styles.feedback} role="status">{practice === "retry" ? t("다시 같이 말해 볼까? 마이크 없이도 할 수 있어.", "Let’s try together again. You can also play without a microphone.") : practice === "listening" ? t("네 목소리를 기다리고 있어…", "Kimi is waiting for your voice…") : t("키미가 기다리고 있어요. 소리 내어 말해 주세요!", "Kimi is waiting. Say it out loud!")}</p>
            <button className={styles.saidItButton} onClick={celebratePractice}><Icon name="check" size={17} />{t("말했어요!", "I said it!")}</button>
            <small className={styles.noMicHint}>{t("마이크 없이 함께 말했을 때 눌러 주세요", "Tap after saying it together without a microphone")}</small>
          </>}
        </section>}
        {phase === "ending" && <section className={styles.ending}><div className={styles.endSeal}><Icon name="kindness" size={32} /></div><p className={styles.cardEyebrow}>{t("오늘도 마음이 한 뼘 자랐어요", "A LITTLE KINDER. A LITTLE CLOSER.")}</p><h2>{t("함께라서 참 좋다!", "Better, together.")}</h2><p>{t("키미와 나눈 마음을 오늘도 기억해 주세요.", "Take a little of our forest into your day.")}</p><div className={styles.endingActions}><button className={styles.primary} onClick={goHome}><Icon name="book" size={18} />{t("다른 이야기 보기", "Another little story")}</button><button className={styles.secondary} onClick={() => start()}><Icon name="replay" size={18} />{t("한 번 더", "Play again")}</button></div></section>}
        {audioFallback && <span className={styles.audioNotice}>{t("기기의 기본 음성으로 들려드리고 있어요", "Playing with your device’s voice")}</span>}
      </>}

      <dialog ref={dialog} className={styles.creator} onCancel={(event) => { event.preventDefault(); closeCreator(); }}>
        <button className={styles.dialogClose} onClick={closeCreator} aria-label={t("닫기", "Close")}><Icon name="close" /></button>
        <span className={styles.studioIcon}><Icon name="spark" size={28} /></span><p className={styles.cardEyebrow}>{t("부모님 이야기 공방", "THE PARENT STORY STUDIO")}</p><h2>{t("오늘, 어떤 마음을", "What would you like")}<br />{t("알려주고 싶으세요?", "to explore together?")}</h2>
        <p className={styles.creatorIntro}>{t("아이에게 전하고 싶은 이야기를 적어 주세요. 키미와 친구들이 작은 모험으로 들려드릴게요.", "Tell us what you want your child to learn. Kimi and friends will turn it into a little adventure.")}</p>
        {!generated ? <><label className={styles.promptLabel} htmlFor="kay-prompt">{t("우리 아이를 위한 이야기 주제", "A lesson for your little one")}</label><textarea id="kay-prompt" value={prompt} maxLength={600} disabled={generating} onChange={(event) => setPrompt(event.target.value)} placeholder={t("예: 게임에서 져도 괜찮다는 걸 배웠으면 좋겠어요. 이긴 친구를 축하하고 다시 도전하는 이야기로 만들어 주세요.", "For example: Help my child learn that losing a game is okay, congratulate their friend, and try again.")} /><div className={styles.promptExamples}>{[t("게임에서 졌을 때", "Losing a game"), t("새 친구와 친해지기", "Making a new friend"), t("미안하다고 말하기", "Saying sorry")].map((example) => <button key={example} disabled={generating} onClick={() => setPrompt(example)}>{example}</button>)}</div><p className={styles.creatorNote}>{t(`${age}세 · 한국어 대화 · 영어 표현`, `Age ${age} · English dialogue · Korean expressions`)}<br />{t("새 이야기는 만드는 데 잠시 걸려요. 완성되면 이 기기의 책장에 저장돼요.", "New stories take a little time. Finished stories are saved on this device.")}</p>{generationError && <p role="alert" className={styles.error}>{generationError}</p>}<button className={styles.primary} disabled={prompt.trim().length < 4 || generating} onClick={() => void generate()}>{generating ? <><span className={styles.spinner} />{t("친구들의 모험을 만들고 있어요…", "Creating a little adventure…")}</> : <><Icon name="spark" size={18} />{t("새 이야기 만들기", "Create our story")}</>}</button>{generating && <button className={styles.cancelGeneration} onClick={() => { abortGeneration.current?.abort(); setGenerating(false); }}>{t("취소", "Cancel")}</button>}</> : <div className={styles.generated}><span className={styles.savedBadge}><Icon name="check" size={16} />{storageWarning ? t("이야기 완성", "Story ready") : t("우리 집 책장에 저장했어요", "Saved to our bookshelf")}</span><h3>{generated.title[homeLanguage]}</h3><p>{generated.description[homeLanguage]}</p><p className={styles.creatorNote}>{t("아이에게 보여주기 전에 부모님이 먼저 재생해 확인해 주세요.", "Preview the story before sharing it with your child.")}</p>{storageWarning && <p role="status" className={styles.error}>{t("기기 저장 공간이 부족해요. 지금 재생할 수 있지만 새로고침하면 사라질 수 있어요.", "Device storage is unavailable. You can play now, but this story may be lost on refresh.")}</p>}<button className={styles.primary} onClick={() => { closeCreator(); start(generated); }}><Icon name="play" size={18} />{t("먼저 재생해 보기", "Preview our story")}</button></div>}
      </dialog>
    </main>
  );
}
