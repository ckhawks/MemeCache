// library/page.tsx

import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';

export default async function Profile() {
  const user = await getUserFromAccessToken();

  return (
    <>
      <NavigationBar username={(user && user?.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>404</h1>
            <p>Please profile a profile name.</p>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
