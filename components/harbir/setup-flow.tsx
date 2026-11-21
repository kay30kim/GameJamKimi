import { useState } from "react";
import type { SceneLanguage } from "@/app/api/scene/contract";
import styles from "./landing.module.css";

export const LESSONS = ["kindness", "empathy", "sharing", "honesty", "patience", "bravery", "gratitude", "teamwork"] as const;
type PresetLesson = (typeof LESSONS)[number];
export const isPresetLesson = (lesson: string): lesson is PresetLesson => (LESSONS as readonly string[]).includes(lesson);
/** Longest lesson a parent can type in. The server accepts up to 500 characters. */
const MAX_OWN_LESSON = 200;

const AGES = [3, 4, 5, 6];

const LANGUAGES: { value: SceneLanguage; label: string }[] = [
  { value: "ko", label: "Korean" },
  { value: "en", label: "English" },
];

const STEPS = ["How old is your child?", "Which language are they learning?", "What should the story teach?"];

interface Props {
  age: number;
  language: SceneLanguage;
  /** One of LESSONS, or whatever the parent typed in. */
  lesson: string;
  onAge: (age: number) => void;
  onLanguage: (language: SceneLanguage) => void;
  onLesson: (lesson: string) => void;
  onStart: () => void;
  onExit: () => void;
}

/** Three short questions, one per screen, then the story starts. */
export default function SetupFlow({ age, language, lesson, onAge, onLanguage, onLesson, onStart, onExit }: Props) {
  const [step, setStep] = useState(0);
  const [own, setOwn] = useState(!isPresetLesson(lesson));
  const [ownText, setOwnText] = useState(isPresetLesson(lesson) ? "" : lesson);
  const last = step === STEPS.length - 1;
  const blocked = last && own && ownText.trim().length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.wordmark}>KimiTales</span>
        <span className={styles.progress}>Step {step + 1} of {STEPS.length}</span>
      </header>

      <form
        className={styles.setup}
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked) return;
          if (last) onStart();
          else setStep(step + 1);
        }}
      >
        <fieldset>
          <legend>{STEPS[step]}</legend>

          {step === 0 && AGES.map((option) => (
            <label key={option} className={styles.option}>
              <input type="radio" name="age" checked={age === option} onChange={() => onAge(option)} />
              {option} years old
            </label>
          ))}

          {step === 1 && LANGUAGES.map((option) => (
            <label key={option.value} className={styles.option}>
              <input type="radio" name="language" checked={language === option.value} onChange={() => onLanguage(option.value)} />
              {option.label}
            </label>
          ))}

          {step === 2 && (
            <>
              <div className={styles.lessonGrid}>
                {LESSONS.map((option) => (
                  <label key={option} className={styles.option}>
                    <input type="radio" name="lesson" checked={!own && lesson === option} onChange={() => { setOwn(false); onLesson(option); }} />
                    {option[0].toUpperCase() + option.slice(1)}
                  </label>
                ))}
              </div>
              <label className={styles.option}>
                <input type="radio" name="lesson" checked={own} onChange={() => { setOwn(true); onLesson(ownText.trim()); }} />
                Something else
              </label>
              {own && (
                <textarea
                  className={styles.ownLesson}
                  autoFocus
                  rows={3}
                  maxLength={MAX_OWN_LESSON}
                  value={ownText}
                  placeholder="For example: saying sorry after a fight with a little brother, or trying a new food"
                  onChange={(event) => { setOwnText(event.target.value); onLesson(event.target.value.trim()); }}
                />
              )}
            </>
          )}
        </fieldset>

        <div className={styles.nav}>
          <button type="button" className={styles.back} onClick={() => (step === 0 ? onExit() : setStep(step - 1))}>Back</button>
          <button type="submit" className={styles.cta} disabled={blocked}>{last ? "Start the story" : "Continue"}</button>
        </div>
      </form>
    </main>
  );
}
