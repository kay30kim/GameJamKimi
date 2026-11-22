import { useState } from "react";
import type { SceneLanguage } from "@/app/api/scene/contract";
import styles from "./landing.module.css";

export const LESSONS = ["kindness", "empathy", "sharing", "honesty", "patience"] as const;
export type Lesson = (typeof LESSONS)[number];

const AGES = [3, 4, 5, 6];

const LANGUAGES: { value: SceneLanguage; label: string }[] = [
  { value: "ko", label: "Korean" },
  { value: "en", label: "English" },
];

const STEPS = ["How old is your child?", "Which language are they learning?", "What should the story teach?"];

interface Props {
  age: number;
  language: SceneLanguage;
  lesson: Lesson;
  onAge: (age: number) => void;
  onLanguage: (language: SceneLanguage) => void;
  onLesson: (lesson: Lesson) => void;
  onStart: () => void;
  onExit: () => void;
}

/** Three short questions, one per screen, then the story starts. */
export default function SetupFlow({ age, language, lesson, onAge, onLanguage, onLesson, onStart, onExit }: Props) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.wordmark}>Alicetales</span>
        <span className={styles.progress}>Step {step + 1} of {STEPS.length}</span>
      </header>

      <form
        className={styles.setup}
        onSubmit={(event) => {
          event.preventDefault();
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

          {step === 2 && LESSONS.map((option) => (
            <label key={option} className={styles.option}>
              <input type="radio" name="lesson" checked={lesson === option} onChange={() => onLesson(option)} />
              {option[0].toUpperCase() + option.slice(1)}
            </label>
          ))}
        </fieldset>

        <div className={styles.nav}>
          <button type="button" className={styles.back} onClick={() => (step === 0 ? onExit() : setStep(step - 1))}>Back</button>
          <button type="submit" className={styles.cta}>{last ? "Start the story" : "Continue"}</button>
        </div>
      </form>
    </main>
  );
}
