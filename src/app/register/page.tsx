'use server';

import styles from '../main.module.scss';
import { getUserFromAccessToken } from '@/auth/lib';
import RegisterComponent from './RegisterComponent';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function RegisterPage() {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  if (user) {
    redirect('/');
  }

  return (
    <div className={styles.wrapper}>
      <main className={`${styles.main} ${styles.narrow}`}>
        <div className={styles.description}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <h1 style={{ textDecoration: 'none' }}>MemeCache</h1>
            </div>
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
          <h4 style={{ marginBottom: '24px' }}>Register</h4>
          {!user && <RegisterComponent />}

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
