import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>GameJamKimi</h1>
      <p className={styles.tagline}>
        Interactive story adventures that teach little kids big lessons — in
        English and Korean.
      </p>
      <p className={styles.note}>
        The setup screen and story play are on the way.
      </p>
    </main>
  );
}
