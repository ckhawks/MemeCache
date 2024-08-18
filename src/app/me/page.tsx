// library/page.tsx

import { db } from '@/db/db';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';
import FooterBar from '@/components/FooterBar';

export default async function Profile() {
  const session = await getSession();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  return (
    <>
      <NavigationBar username={session.user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <h1>404</h1>
            <p>Please profile a profile name.</p>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
