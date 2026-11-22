import dynamic from "next/dynamic";
import { preload } from "react-dom";
import styles from "./landing.module.css";

const RabbitPreview = dynamic(() => import("./rabbit-preview"), { ssr: false });

/** The page parents see first: what Alicetales teaches, then a button into setup. */
export default function Landing({ onBegin }: { onBegin: () => void }) {
  // Start fetching Alice's model with the page, instead of after the 3D code loads.
  // crossOrigin matches three's fetch, so the browser reuses this download.
  preload("/demo/alice.glb", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.wordmark}>Alicetales</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.alice}><RabbitPreview /></div>
        <h1>Stories that teach kindness, and a new language.</h1>
        <p>For kids 3 to 6, in Korean or English.</p>
        <button className={styles.cta} onClick={onBegin}>Set up a story</button>
      </section>

      <section className={styles.features}>
        <article>
          <h2>Kindness</h2>
          <p>Every story is written live, so it follows your child&apos;s choices.</p>
          <div className={styles.example} aria-hidden="true">
            <p>Momo looks sad. His ball rolled away.</p>
            <div className={styles.choices}>
              <span>Help Momo</span>
              <span>Keep playing</span>
            </div>
          </div>
        </article>

        <article>
          <h2>New words</h2>
          <p>A few in every scene.</p>
          <div className={styles.example} aria-hidden="true">
            <div className={styles.words}>
              <span><strong lang="ko">공</strong> ball</span>
              <span><strong lang="ko">친구</strong> friend</span>
              <span><strong lang="ko">고마워</strong> thank you</span>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
