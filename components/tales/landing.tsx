"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { SceneLanguage } from "@/app/api/scene/contract";
import { Icon } from "@/components/kay/icons";
import { LESSONS, MAX_OWN_LESSON, OWN, OWN_CARD } from "./lessons";
import type { Localized } from "./lessons";
import styles from "./landing.module.css";

const LandingScene = dynamic(() => import("./landing-scene"), { ssr: false });

const POINTS: Localized[] = [
  { en: "Hear useful expressions in playful scenes", ko: "장면을 보며 자연스러운 표현을 들어요" },
  { en: "Say them together when Alice invites you", ko: "앨리스가 말을 건네면 함께 따라 말해요" },
  { en: "Your child's choices lead the story onward", ko: "아이의 선택이 다음 장면으로 이어져요" },
];

interface Props {
  home: SceneLanguage;
  age: number;
  language: SceneLanguage;
  lesson: string;
  ownLesson: string;
  onAge: (age: number) => void;
  onLanguage: (language: SceneLanguage) => void;
  onLesson: (lesson: string) => void;
  onOwnLesson: (text: string) => void;
  onStart: () => void;
}

export default function Landing({ home, age, language, lesson, ownLesson, onAge, onLanguage, onLesson, onOwnLesson, onStart }: Props) {
  const t = (korean: string, english: string) => (home === "ko" ? korean : english);
  const canStart = lesson !== OWN || ownLesson.trim().length > 0;
  return (
    <div className={styles.landing} lang={home}>
      <nav className={styles.nav}><span className={styles.wordmark}>Alicetales</span></nav>

      <section className={styles.hero}>
        <div className={styles.pitch}>
          <div className={styles.scene}><LandingScene /></div>
          <h1>
            <span>{t("앨리스와 함께하는", "Play, talk, and learn")}</span>{" "}
            <span>{t("즐거운 언어 놀이", "with Alice")}</span>
          </h1>
          <ul>{POINTS.map((point) => <li key={point.en}><Icon name="check" size={16} />{point[home]}</li>)}</ul>
        </div>

        <form className={styles.setup} onSubmit={(event) => { event.preventDefault(); if (canStart) onStart(); }}>
          <h2>{t("이야기 시작하기", "Start a story")}</h2>
          <div className={styles.row}>
            <div>
              <span className={styles.label}>{t("아이의 나이", "Child’s age")}</span>
              <div className={styles.segmented}>{[3, 4, 5, 6].map((value) => <button type="button" key={value} aria-pressed={age === value} onClick={() => onAge(value)}>{value}</button>)}</div>
            </div>
            <div>
              <span className={styles.label}>{t("배우고 싶은 언어", "Language to learn")}</span>
              <div className={styles.segmented}>{(["ko", "en"] as const).map((value) => <button type="button" key={value} lang={value} aria-pressed={language === value} onClick={() => onLanguage(value)}>{value === "ko" ? "한국어" : "English"}</button>)}</div>
            </div>
          </div>
          <p className={styles.label}>{t("한국어로 이야기하고, 짧은 영어 표현도 함께 배워요.", "The story is in English, with short Korean expressions alongside.")}</p>
          <span className={styles.label}>{t("함께 배울 주제", "A topic to explore")}</span>
          <div className={styles.lessons}>
            {[...LESSONS, { id: OWN, icon: "settings", ...OWN_CARD }].map((card) => <button type="button" key={card.id} style={{ "--theme": card.color } as CSSProperties} aria-pressed={lesson === card.id} onClick={() => onLesson(card.id)}>
              <Icon name={card.icon} size={16} />{card.name[home]}
            </button>)}
          </div>
          {lesson === OWN && <input className={styles.own} value={ownLesson} maxLength={MAX_OWN_LESSON} onChange={(event) => onOwnLesson(event.target.value)} placeholder={t("예: 게임에서 져도 괜찮아요", "e.g. It's okay to lose a game")} aria-label={t("함께 배울 주제", "A topic to explore")} />}
          <button type="submit" className={styles.start} disabled={!canStart}><Icon name="play" size={18} />{t("시작하기", "Begin the story")}</button>
        </form>
      </section>
    </div>
  );
}
