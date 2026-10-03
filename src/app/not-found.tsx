import Link from 'next/link';
import styles from './main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { getUserFromAccessToken } from '@/auth/lib';

// Rendered for notFound() and unknown URLs, with the site around it instead of Next's
// bare default page.
export default async function NotFound() {
  const user = await getUserFromAccessToken();

  return (
    <>
      <NavigationBar username={user?.username ?? ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Not found</h1>
            <p>That page, meme or profile does not exist, or it was deleted.</p>
            <div style={{ display: 'flex' }}>
              <Link href="/explore" className={styles['button']}>
                Go to Explore
              </Link>
            </div>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
