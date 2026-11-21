"use client";

import type { CSSProperties } from "react";
import type { SceneLanguage } from "@/app/api/scene/contract";
import { Icon } from "@/components/kay/icons";
import { LESSONS, MAX_OWN_LESSON, OWN, OWN_CARD } from "./lessons";
import type { Localized } from "./lessons";
import styles from "./landing.module.css";

const POINTS: Localized[] = [
  { en: "Each scene is written live from your child's choices", ko: "아이의 선택에 맞춰 장면을 새로 써요" },
  { en: "Read aloud, a voice for every character", ko: "캐릭터마다 목소리로 읽어 줘요" },
  { en: "Pick a lesson or write your own", ko: "주제를 고르거나 직접 적어요" },
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
    <div className={styles.landing}>
      <nav className={styles.nav}><span className={styles.wordmark}>KimiTales</span></nav>

      <section className={styles.hero}>
        <div className={styles.pitch}>
          <h1>{t("이야기로 배우는 마음과 새 언어", "Stories that teach kids a lesson and a new language")}</h1>
          <p>{t("3–6세 · 한국어와 영어", "Ages 3–6 · Korean and English")}</p>
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
              <span className={styles.label}>{t("배우는 언어", "Learning")}</span>
              <div className={styles.segmented}>{(["ko", "en"] as const).map((value) => <button type="button" key={value} aria-pressed={language === value} onClick={() => onLanguage(value)}>{value === "ko" ? t("한국어", "Korean") : t("영어", "English")}</button>)}</div>
            </div>
          </div>
          <span className={styles.label}>{t("배울 마음", "Lesson")}</span>
          <div className={styles.lessons}>
            {[...LESSONS, { id: OWN, icon: "settings", ...OWN_CARD }].map((card) => <button type="button" key={card.id} style={{ "--theme": card.color } as CSSProperties} aria-pressed={lesson === card.id} onClick={() => onLesson(card.id)}>
              <Icon name={card.icon} size={16} />{card.name[home]}
            </button>)}
          </div>
          {lesson === OWN && <input className={styles.own} value={ownLesson} maxLength={MAX_OWN_LESSON} onChange={(event) => onOwnLesson(event.target.value)} placeholder={t("예: 게임에서 져도 괜찮아요", "e.g. It's okay to lose a game")} aria-label={t("가르치고 싶은 것", "What should the story teach?")} />}
          <button type="submit" className={styles.start} disabled={!canStart}><Icon name="play" size={18} />{t("시작하기", "Begin the story")}</button>
        </form>
      </section>

      <footer className={styles.footer}>{t("제공", "Powered by")} <strong>Kimi</strong> {t("(이야기)", "for stories")} · <strong>ElevenLabs</strong> {t("(목소리)", "for voices")}</footer>
    </div>
  );
}
