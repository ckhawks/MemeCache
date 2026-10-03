import Link from 'next/link';
import MemeWall from './MemeWall';
import styles from './AuthLayout.module.scss';

// Login and register: the meme wall with the brand on one side, the form on the other.
// Phones get a short band of the wall above the form.
export default function AuthLayout(props: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <div className={styles.art}>
        <MemeWall />
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark}>
            MemeCache
          </Link>
          <p className={styles.tagline}>Your group&apos;s meme memory. Find the right one, send it fast.</p>
        </div>
      </div>
      <main className={styles.formSide}>
        <div className={styles.formBox}>
          <h1 className={styles.title}>{props.title}</h1>
          <p className={styles.subtitle}>{props.subtitle}</p>
          {props.children}
        </div>
      </main>
    </div>
  );
}
