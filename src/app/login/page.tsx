'use server';

import styles from '../main.module.scss';
import { getUserFromAccessToken, logout } from '@/auth/lib';
import LoginComponent from './LoginComponent';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage() {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  if (user) {
    redirect('/');
  }

  return (
    <div className={styles.wrapper}>
      <main className={`${styles.main} ${styles.narrow}`}>
        <div className={styles.description}>
          <Link href="/" style={{ textDecoration: 'unset' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}></div>

            <h1>MemeCache</h1>
          </Link>
          {/* <p className={styles.subtext}>
            You&apos;re making progress; track it!
          </p> */}
        </div>
        <div
          className={`${styles.row} ${styles.content}`}
          style={{ marginTop: '24px' }}
        ></div>

        <div style={{ width: '100%' }}>
          <h4 style={{ marginBottom: '24px' }}>Login</h4>
          {!user && <LoginComponent />}

          {/* {session && (
        <form action={logout}>
          <button type="submit">Logout</button>
        </form>
      )} */}

          {/* <pre>Session: {JSON.stringify(session, null, 2)}</pre> */}
        </div>
      </main>
    </div>
  );
}
