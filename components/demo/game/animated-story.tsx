"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SceneLanguage, SceneResponse } from "@/app/api/scene/contract";
import type { Motion } from "@/lib/demo/story";
import { isListeningSupported, listenOnce, matchesWord, meaningLocale, speakAsync, speechLocale, stopListening, stopSpeaking } from "@/lib/demo/speech";
import styles from "./animated-story.module.css";

const Forest = dynamic(() => import("@/components/demo/forest-stage"), { ssr: false });
const subscribe = () => () => {};
const serverFalse = () => false;
type Turn = "speaking" | "ready" | "listening" | "praise" | "choices";

export default function AnimatedStory({ scene, language, age, firstScene, onChoose, onExit }: {
  scene: SceneResponse; language: SceneLanguage; age: number; firstScene: boolean;
  onChoose: (choice: string) => void; onExit: () => void;
}) {
  const [turn, setTurn] = useState<Turn>("speaking");
  const [caption, setCaption] = useState("");
  const [talking, setTalking] = useState(false);
  const [motion, setMotion] = useState<Motion>("idle");
  const [wordIndex, setWordIndex] = useState(0);
  const [replay, setReplay] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const canListen = useSyncExternalStore(subscribe, isListeningSupported, serverFalse);
  const koreanGuide = language === "en";
  // A concrete first interaction teaches the child how to play before story vocabulary.
  const words = useMemo(() => {
    const warmup = firstScene && !scene.lessonComplete ? [{ word: koreanGuide ? "Apple" : "사과", meaning: koreanGuide ? "사과" : "apple" }] : [];
    return [...warmup, ...scene.newWords.filter(item => !warmup.some(w => w.word.toLowerCase() === item.word.toLowerCase()))];
  }, [firstScene, scene, koreanGuide]);
  const word = words[wordIndex];
  const prompt = word ? (koreanGuide ? `“${word.word}”이라고 말해볼래?` : `Can you say “${word.word}”?`) : "";

  useEffect(() => {
    const id = ++generation.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    async function say(text: string, locale: string) {
      if (id !== generation.current) return;
      setCaption(text);
      await speakAsync(text, locale, () => { if (id === generation.current) setTalking(true); });
      if (id === generation.current) setTalking(false);
    }
    async function play() {
      await Promise.resolve();
      if (id !== generation.current) return;
      setTurn("speaking");
      if (wordIndex === 0 && replay === 0) {
        // Play Kimi's movement beats while the narrator tells the scene.
        scene.stage.beats.filter(beat => beat.actor === "hero").forEach((beat, i) => {
          timers.push(setTimeout(() => {
            if (id !== generation.current) return;
            setMotion(beat.action === "run_to" ? "run" : beat.action === "walk_to" ? "walk" : ["jump", "celebrate"].includes(beat.action) ? "celebrate" : "idle");
          }, i * 2500));
        });
        await say(scene.narration, meaningLocale(language));
      }
      if (id !== generation.current) return;
      timers.forEach(clearTimeout);
      setMotion(scene.lessonComplete ? "celebrate" : "idle");
      if (word) {
        await say(koreanGuide ? `${word.meaning}! 같이 말해 보자.` : `${word.meaning}! Let's say it together.`, meaningLocale(language));
        await say(word.word, speechLocale(language));
        await say(prompt, meaningLocale(language));
        if (id === generation.current) setTurn("ready");
      } else if (id === generation.current) {
        setCaption(scene.lessonComplete ? (koreanGuide ? "정말 잘했어! 다음에 또 만나!" : "You did wonderfully! See you next time!") : (koreanGuide ? "이제 어떻게 해볼까?" : "What shall we do next?"));
        setTurn("choices");
      }
    }
    void play();
    return () => { generation.current = id + 1; timers.forEach(clearTimeout); stopSpeaking(); stopListening(); };
  }, [scene, language, wordIndex, replay, word, prompt, koreanGuide]);

  function nextWord() {
    setTalking(false);
    setMotion("idle");
    setTurn("speaking");
    setReplay(0);
    setWordIndex(index => index + 1);
  }

  async function listen() {
    if (!word || busy.current || turn !== "ready") return;
    busy.current = true;
    const id = generation.current;
    setTurn("listening");
    setCaption(koreanGuide ? "듣고 있어. 네 차례야!" : "I'm listening. Your turn!");
    try {
      const transcript = await listenOnce(speechLocale(language));
      if (id !== generation.current) return;
      const matched = matchesWord(transcript, word.word);
      setMotion(matched ? "celebrate" : "idle");
      setTurn(matched ? "praise" : "speaking");
      const feedback = matched ? (koreanGuide ? "잘했어! 정말 멋지게 말했어!" : "You did it! That was wonderful!") : (koreanGuide ? "괜찮아. 천천히 다시 해볼까?" : "That's okay. Shall we try again slowly?");
      setCaption(feedback);
      await speakAsync(feedback, meaningLocale(language), () => { if (id === generation.current) setTalking(true); });
      if (id !== generation.current) return;
      setTalking(false);
      if (matched) nextWord();
      else { setCaption(prompt); setTurn("ready"); }
    } catch (error) {
      if (id !== generation.current) return;
      setTalking(false);
      setCaption(error instanceof Error ? error.message : "Please try the microphone again.");
      setTurn("ready");
    } finally { busy.current = false; }
  }

  return <section className={styles.game} aria-label="Kimi's animated story">
    <div className={styles.world}><Forest motion={motion} paused={false} age={age} talking={talking} word={word?.word} immersive/></div>
    <div className={styles.top}><span>Kimi</span><button onClick={onExit} aria-label="Exit story">✕</button></div>
    <div className={styles.dialogue}>
      <p className={styles.caption} role="status" lang={meaningLocale(language)}>{caption || (koreanGuide ? "키미를 만나러 가요…" : "Here comes Kimi…")}</p>
      {word && turn !== "choices" && <p className={styles.word} lang={speechLocale(language)}>{word.word}</p>}
      {turn === "ready" && <div className={styles.controls}>
        {canListen ? <button className={styles.mic} onClick={() => void listen()}>{koreanGuide ? "🎙 눌러서 말하기" : "🎙 Tap to speak"}</button> : <span>{koreanGuide ? "이 브라우저에서는 마이크를 사용할 수 없어요. 소리 내어 따라 해 보세요." : "Voice recognition is unavailable here. Say the word aloud."}</span>}
        <button onClick={() => setReplay(value => value + 1)}>{koreanGuide ? "다시 듣기" : "Hear again"}</button>
        <button onClick={nextWord}>{koreanGuide ? "넘어가기" : "Skip"}</button>
      </div>}
      {turn === "listening" && <div className={styles.controls}><span className={styles.listening}>{koreanGuide ? "듣고 있어요…" : "Listening…"}</span><button onClick={() => stopListening()}>{koreanGuide ? "취소" : "Cancel"}</button></div>}
      {turn === "choices" && <div className={styles.controls}>
        {scene.lessonComplete ? <button className={styles.mic} onClick={onExit}>{koreanGuide ? "새 이야기" : "Another story"}</button> : scene.choices.map(choice => <button key={choice} onClick={() => onChoose(choice)}>{choice}</button>)}
      </div>}
    </div>
  </section>;
}
